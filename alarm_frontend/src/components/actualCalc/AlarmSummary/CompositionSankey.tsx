import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Network, RefreshCw, AlertTriangle } from 'lucide-react';
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
  standing: '#dc2626',      // red-600
  standing_stale: '#ef4444', // red-500
  standing_if: '#f87171',   // red-400
  nuisance: '#f59e0b',      // amber-500
  nuisance_chattering: '#fbbf24', // amber-400
  nuisance_if_chattering: '#fcd34d', // amber-300
  flood: '#3b82f6',         // blue-500
  other: '#6b7280',         // gray-500
};

const CATEGORY_LABELS: Record<string, string> = {
  standing: 'Standing',
  standing_stale: 'Stale',
  standing_if: 'Instrument Failure (Standing)',
  nuisance: 'Nuisance',
  nuisance_chattering: 'Chattering',
  nuisance_if_chattering: 'IF-Chattering',
  flood: 'Flood',
  other: 'Other',
};

const CompositionSankey: React.FC<Props> = ({
  className,
  plantId,
  includeSystem = false,
  preloadedData = null,
}) => {
  const [loading, setLoading] = React.useState<boolean>(!preloadedData);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<SankeyResponse | null>(preloadedData);
  const [loadingSeconds, setLoadingSeconds] = React.useState<number>(0);
  const reqRef = React.useRef(0);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

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
      setLoadingSeconds(0);
      const myReq = ++reqRef.current;

      // Start timer
      timerRef.current = setInterval(() => {
        setLoadingSeconds(prev => prev + 1);
      }, 1000);

      const response = await fetchPlantActualCalcSankey(plantId, {
        include_system: includeSystem,
        timeout_ms: 360000,
      });

      if (myReq === reqRef.current) {
        setData(response);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load composition data';
      setError(msg);
      console.error('CompositionSankey fetch error:', err);
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setLoading(false);
    }
  }

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  if (loading) {
    const minutes = Math.floor(loadingSeconds / 60);
    const seconds = loadingSeconds % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
            <div>
              <p className="text-muted-foreground font-medium">Computing category composition...</p>
              <p className="text-sm text-muted-foreground mt-1">Elapsed: {timeStr}</p>
              {loadingSeconds > 60 && loadingSeconds < 120 && (
                <p className="text-xs text-muted-foreground mt-2">This may take 2-4 minutes for large datasets</p>
              )}
              {loadingSeconds >= 120 && (
                <p className="text-xs text-amber-600 mt-2">Still processing... Please wait</p>
              )}
            </div>
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
            <Network className="h-5 w-5 text-primary" />
            Alarm Composition
          </CardTitle>
          <CardDescription>Exclusive category breakdown</CardDescription>
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
  const total = totals.total;

  // Calculate percentages
  const standingPct = (totals.standing / total) * 100;
  const nuisancePct = (totals.nuisance / total) * 100;
  const floodPct = (totals.flood / total) * 100;
  const otherPct = (totals.other / total) * 100;

  // Sub-category percentages (relative to parent)
  const standingStalePct = totals.standing > 0 ? (totals.standing_stale / totals.standing) * 100 : 0;
  const standingIfPct = totals.standing > 0 ? (totals.standing_if / totals.standing) * 100 : 0;
  const nuisanceChatterPct = totals.nuisance > 0 ? (totals.nuisance_chattering / totals.nuisance) * 100 : 0;
  const nuisanceIfChatterPct = totals.nuisance > 0 ? (totals.nuisance_if_chattering / totals.nuisance) * 100 : 0;

  // Sub-category absolute widths as % of total row
  const standingStaleWidth = (standingStalePct * standingPct) / 100;
  const standingIfWidth = (standingIfPct * standingPct) / 100;
  const nuisanceChatterWidth = (nuisanceChatterPct * nuisancePct) / 100;
  const nuisanceIfChatterWidth = (nuisanceIfChatterPct * nuisancePct) / 100;

  const LABEL_INSIDE_THRESHOLD = 15; // % width needed to fit text inside bar

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              Alarm Composition
            </CardTitle>
            <CardDescription>
              Exclusive category breakdown ({total.toLocaleString()} total activations)
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Total */}
          <div className="flex items-center gap-4">
            <div className="w-32 text-sm font-medium text-muted-foreground text-right">Total Alarms</div>
            <div className="flex-1 min-w-0">
              <div
                className="h-12 rounded flex items-center justify-between px-4 text-white font-semibold"
                style={{ backgroundColor: CHART_GREEN_PALE, color: 'var(--foreground)' }}
              >
                <span>{total.toLocaleString()}</span>
                <span className="text-sm font-normal">100%</span>
              </div>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex items-center gap-4">
            <div className="w-32"></div>
            <div className="flex-1" />
          </div>

          {/* Standing */}
          {totals.standing > 0 && (
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium text-right" style={{ color: CATEGORY_COLORS.standing }}>
                Standing
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="h-10 rounded flex items-center justify-between px-3 text-white text-sm"
                  style={{ backgroundColor: CATEGORY_COLORS.standing, width: `${standingPct}%`, minWidth: '120px' }}
                >
                  <span>{totals.standing.toLocaleString()}</span>
                  <span>{standingPct.toFixed(1)}%</span>
                </div>
                {/* Sub-categories */}
                {(totals.standing_stale > 0 || totals.standing_if > 0) && (
                  <div className="ml-4 mt-2 space-y-1">
                    {totals.standing_stale > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <div
                          className="h-6 rounded px-2 flex items-center"
                          style={{ backgroundColor: CATEGORY_COLORS.standing_stale, width: `${standingStaleWidth}%`, minWidth: 6, color: 'white' }}
                        >
                          {standingStaleWidth >= LABEL_INSIDE_THRESHOLD ? `Stale: ${totals.standing_stale.toLocaleString()}` : null}
                        </div>
                        {standingStaleWidth < LABEL_INSIDE_THRESHOLD && (
                          <span className="text-foreground">Stale: {totals.standing_stale.toLocaleString()}</span>
                        )}
                      </div>
                    )}
                    {totals.standing_if > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <div
                          className="h-6 rounded px-2 flex items-center"
                          style={{ backgroundColor: CATEGORY_COLORS.standing_if, width: `${standingIfWidth}%`, minWidth: 6, color: 'white' }}
                        >
                          {standingIfWidth >= LABEL_INSIDE_THRESHOLD ? `IF: ${totals.standing_if.toLocaleString()}` : null}
                        </div>
                        {standingIfWidth < LABEL_INSIDE_THRESHOLD && (
                          <span className="text-foreground">IF: {totals.standing_if.toLocaleString()}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Nuisance */}
          {totals.nuisance > 0 && (
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium text-right" style={{ color: CATEGORY_COLORS.nuisance }}>
                Nuisance
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="h-10 rounded flex items-center justify-between px-3 text-white text-sm"
                  style={{ backgroundColor: CATEGORY_COLORS.nuisance, width: `${nuisancePct}%`, minWidth: '120px' }}
                >
                  <span>{totals.nuisance.toLocaleString()}</span>
                  <span>{nuisancePct.toFixed(1)}%</span>
                </div>
                {/* Sub-categories */}
                {(totals.nuisance_chattering > 0 || totals.nuisance_if_chattering > 0) && (
                  <div className="ml-4 mt-2 space-y-1">
                    {totals.nuisance_chattering > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <div
                          className="h-6 rounded px-2 flex items-center"
                          style={{ backgroundColor: CATEGORY_COLORS.nuisance_chattering, width: `${nuisanceChatterWidth}%`, minWidth: 6, color: 'white' }}
                        >
                          {nuisanceChatterWidth >= LABEL_INSIDE_THRESHOLD ? `Chattering: ${totals.nuisance_chattering.toLocaleString()}` : null}
                        </div>
                        {nuisanceChatterWidth < LABEL_INSIDE_THRESHOLD && (
                          <span className="text-foreground">Chattering: {totals.nuisance_chattering.toLocaleString()}</span>
                        )}
                      </div>
                    )}
                    {totals.nuisance_if_chattering > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <div
                          className="h-6 rounded px-2 flex items-center"
                          style={{ backgroundColor: CATEGORY_COLORS.nuisance_if_chattering, width: `${nuisanceIfChatterWidth}%`, minWidth: 6, color: 'white' }}
                        >
                          {nuisanceIfChatterWidth >= LABEL_INSIDE_THRESHOLD ? `IF-Chatter: ${totals.nuisance_if_chattering.toLocaleString()}` : null}
                        </div>
                        {nuisanceIfChatterWidth < LABEL_INSIDE_THRESHOLD && (
                          <span className="text-foreground">IF-Chatter: {totals.nuisance_if_chattering.toLocaleString()}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Flood */}
          {totals.flood > 0 && (
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium text-right" style={{ color: CATEGORY_COLORS.flood }}>
                Flood
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="h-10 rounded flex items-center justify-between px-3 text-white text-sm"
                  style={{ backgroundColor: CATEGORY_COLORS.flood, width: `${floodPct}%`, minWidth: '120px' }}
                >
                  <span>{totals.flood.toLocaleString()}</span>
                  <span>{floodPct.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Other */}
          {totals.other > 0 && (
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium text-right" style={{ color: CATEGORY_COLORS.other }}>
                Other
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="h-10 rounded flex items-center justify-between px-3 text-white text-sm"
                  style={{ backgroundColor: CATEGORY_COLORS.other, width: `${otherPct}%`, minWidth: '120px' }}
                >
                  <span>{totals.other.toLocaleString()}</span>
                  <span>{otherPct.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="mt-6 rounded-lg p-3" style={{ backgroundColor: CHART_GREEN_PALE }}>
          <div className="text-sm text-foreground font-medium mb-1">Category Precedence</div>
          <ul className="text-sm text-muted-foreground list-disc ml-5">
            <li>
              <span className="text-foreground font-medium">Standing</span>: Alarms active ≥ 60 minutes
              {totals.standing > 0 && ` (${standingPct.toFixed(1)}%)`}
            </li>
            <li>
              <span className="text-foreground font-medium">Nuisance</span>: Chattering episodes (≥3 alarms in 10 min)
              {totals.nuisance > 0 && ` (${nuisancePct.toFixed(1)}%)`}
            </li>
            <li>
              <span className="text-foreground font-medium">Flood</span>: Overlapping unhealthy periods from ≥2 sources
              {totals.flood > 0 && ` (${floodPct.toFixed(1)}%)`}
            </li>
            <li>
              <span className="text-foreground font-medium">Other</span>: All remaining activations
              {totals.other > 0 && ` (${otherPct.toFixed(1)}%)`}
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default CompositionSankey;
