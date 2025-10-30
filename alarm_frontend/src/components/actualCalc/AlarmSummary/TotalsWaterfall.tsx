import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingDown, RefreshCw, AlertTriangle } from 'lucide-react';
import { CHART_GREEN_PALE } from '@/theme/chartColors';
import { fetchPlantActualCalcSankey } from '@/api/actualCalc';
import { SankeyResponse } from '@/types/actualCalc';

interface Props {
  className?: string;
  plantId: string;
  includeSystem?: boolean;
  preloadedData?: SankeyResponse | null;
}

const CATEGORY_COLORS = {
  total: '#10b981',       // green-500
  standing: '#dc2626',    // red-600
  nuisance: '#f59e0b',    // amber-500
  flood: '#3b82f6',       // blue-500
  other: '#6b7280',       // gray-500
};

const TotalsWaterfall: React.FC<Props> = ({
  className,
  plantId,
  includeSystem = false,
  preloadedData = null,
}) => {
  const [loading, setLoading] = React.useState<boolean>(!preloadedData);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<SankeyResponse | null>(preloadedData);
  const reqRef = React.useRef(0);

  React.useEffect(() => {
    // Use preloaded data if available
    if (preloadedData) {
      setData(preloadedData);
      setLoading(false);
      return;
    }
    // Otherwise fetch
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId, includeSystem, preloadedData]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const myReq = ++reqRef.current;

      const response = await fetchPlantActualCalcSankey(plantId, {
        include_system: includeSystem,
        timeout_ms: 360000,
      });

      if (myReq === reqRef.current) {
        setData(response);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load waterfall data';
      setError(msg);
      console.error('TotalsWaterfall fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-muted-foreground">Computing reconciliation...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center text-destructive">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p className="mb-2">{error}</p>
            <Button onClick={fetchData} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" /> Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isEmpty = !data || data.totals.total === 0;

  if (isEmpty) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Category Reconciliation
          </CardTitle>
          <CardDescription>Exclusive category waterfall</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            No alarm activations found.
          </div>
        </CardContent>
      </Card>
    );
  }

  const totals = data.totals;

  // Calculate cumulative values for waterfall
  const items = [
    { label: 'Total', value: totals.total, cumulative: totals.total, color: CATEGORY_COLORS.total, type: 'start' },
    { label: 'Standing', value: -totals.standing, cumulative: totals.total - totals.standing, color: CATEGORY_COLORS.standing, type: 'decrease' },
    { label: 'Nuisance', value: -totals.nuisance, cumulative: totals.total - totals.standing - totals.nuisance, color: CATEGORY_COLORS.nuisance, type: 'decrease' },
    { label: 'Flood', value: -totals.flood, cumulative: totals.total - totals.standing - totals.nuisance - totals.flood, color: CATEGORY_COLORS.flood, type: 'decrease' },
    { label: 'Other', value: totals.other, cumulative: totals.other, color: CATEGORY_COLORS.other, type: 'end' },
  ];

  const maxValue = totals.total;
  const LABEL_INSIDE_THRESHOLD = 15; // % width to keep labels inside the bar

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              Category Reconciliation
            </CardTitle>
            <CardDescription>
              Exclusive category waterfall showing Total → Other breakdown
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Waterfall Chart */}
        <div className="space-y-2">
          {items.map((item, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === items.length - 1;
            const barHeight = Math.abs(item.value);
            const barHeightPct = (barHeight / maxValue) * 100;
            const leftPct = isFirst ? 0 : isLast ? 0 : (item.cumulative / maxValue) * 100;
            const labelInside = barHeightPct >= LABEL_INSIDE_THRESHOLD;
            const edgePct = leftPct + barHeightPct; // bar's right edge for outside labels

            return (
              <div key={item.label} className="flex items-center gap-3">
                {/* Label */}
                <div className="w-24 text-sm font-medium text-right">{item.label}</div>

                {/* Bar Container */}
                <div className="flex-1 relative h-14 bg-muted/20 rounded overflow-hidden">
                  {/* Baseline for intermediate bars */}
                  {!isFirst && !isLast && (
                    <div
                      className="absolute top-0 bottom-0 border-l border-dashed border-muted-foreground/30"
                      style={{ left: `${leftPct}%` }}
                    />
                  )}

                  {/* The Bar */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-10 rounded flex items-center justify-between px-3 text-white text-sm font-medium"
                    style={{
                      backgroundColor: item.color,
                      width: `${barHeightPct}%`,
                      left: `${leftPct}%`,
                      minWidth: '6px',
                    }}
                  >
                    {labelInside && (
                      <>
                        <span>{item.type === 'decrease' ? `−${barHeight.toLocaleString()}` : barHeight.toLocaleString()}</span>
                        {(isFirst || isLast) && <span>{((barHeight / totals.total) * 100).toFixed(1)}%</span>}
                      </>
                    )}
                  </div>

                  {/* Outside label if the bar is too narrow */}
                  {!labelInside && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 text-xs font-medium"
                      style={{ left: `${edgePct}%`, marginLeft: 6, color: item.color }}
                    >
                      {item.type === 'decrease' ? `−${barHeight.toLocaleString()}` : `${barHeight.toLocaleString()}${(isFirst || isLast) ? ` · ${((barHeight / totals.total) * 100).toFixed(1)}%` : ''}`}
                    </div>
                  )}

                  {/* Cumulative Label */}
                  {!isFirst && !isLast && (
                    <div
                      className="absolute top-1/2 text-xs text-muted-foreground font-medium"
                      style={{ left: `${leftPct}%`, transform: 'translate(-50%, -50%)' }}
                    >
                      {item.cumulative.toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Value */}
                <div className="w-28 text-sm text-muted-foreground">
                  {item.type === 'start' && 'Start'}
                  {item.type === 'decrease' && `(${Math.abs(item.value).toLocaleString()})`}
                  {item.type === 'end' && 'Remaining'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary Table */}
        <div className="mt-6 rounded-lg border p-4">
          <h4 className="text-sm font-semibold mb-3">Reconciliation Summary</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Activations:</span>
              <span className="font-medium">{totals.total.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">− Standing:</span>
              <span className="font-medium text-red-600">{totals.standing.toLocaleString()} ({((totals.standing / totals.total) * 100).toFixed(1)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">− Nuisance:</span>
              <span className="font-medium text-amber-600">{totals.nuisance.toLocaleString()} ({((totals.nuisance / totals.total) * 100).toFixed(1)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">− Flood:</span>
              <span className="font-medium text-blue-600">{totals.flood.toLocaleString()} ({((totals.flood / totals.total) * 100).toFixed(1)}%)</span>
            </div>
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="text-muted-foreground">= Other (Remaining):</span>
              <span className="font-medium text-gray-600">{totals.other.toLocaleString()} ({((totals.other / totals.total) * 100).toFixed(1)}%)</span>
            </div>
          </div>
        </div>

        {/* Insights */}
        <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: CHART_GREEN_PALE }}>
          <div className="text-sm text-foreground font-medium mb-1">How to Read This Chart</div>
          <ul className="text-sm text-muted-foreground list-disc ml-5">
            <li>Start with <span className="text-foreground font-medium">Total</span> activations</li>
            <li>Subtract each exclusive category in precedence order</li>
            <li><span className="text-foreground font-medium">Other</span> represents alarms that don't qualify for any priority category</li>
            <li>All values are mutually exclusive (no double-counting)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default TotalsWaterfall;
