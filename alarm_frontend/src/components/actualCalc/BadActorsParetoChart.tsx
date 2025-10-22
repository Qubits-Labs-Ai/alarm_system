/**
 * BadActorsParetoChart - Pareto Analysis of Top Bad Actors
 * Horizontal bar chart with cumulative percentage line showing 80/20 distribution
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Cell, ReferenceLine } from 'recharts';
import { CHART_GREEN_PRIMARY, CHART_GREEN_SECONDARY, CHART_WARNING, getGreenPalette } from '@/theme/chartColors';
import { ShieldAlert, TrendingUp } from 'lucide-react';
import { InsightButton } from '@/components/insights/InsightButton';
import { useInsightModal } from '@/components/insights/useInsightModal';

interface BadActorRecord {
  Source: string;
  Total_Alarm_In_Floods: number;
  Flood_Involvement_Count: number;
}

interface BadActorsParetoChartProps {
  data: BadActorRecord[];
  totalFloodCount: number;
  topN?: 5 | 10 | 15 | 20 | 'all';
  onTopNChange?: (n: 5 | 10 | 15 | 20 | 'all') => void;
  isLoading?: boolean;
  includeSystem?: boolean;
  activeRangeStart?: string;
  activeRangeEnd?: string;
}

// Helper to identify system/meta sources
function isMetaSource(name: string): boolean {
  const s = String(name || '').trim().toUpperCase();
  if (!s) return false;
  return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
}

export function BadActorsParetoChart({ 
  data, 
  totalFloodCount,
  topN = 10,
  onTopNChange,
  isLoading = false,
  includeSystem = true,
  activeRangeStart,
  activeRangeEnd,
}: BadActorsParetoChartProps) {
  const { onOpen: openInsightModal } = useInsightModal();
  const [metricMode, setMetricMode] = useState<'alarms' | 'windows'>('alarms');

  // Filter and sort data
  const processedData = useMemo(() => {
    const filtered = includeSystem 
      ? data 
      : data.filter(d => !isMetaSource(d.Source));

    // Sort by selected metric
    const sorted = [...filtered].sort((a, b) => {
      if (metricMode === 'alarms') {
        return b.Total_Alarm_In_Floods - a.Total_Alarm_In_Floods;
      }
      return b.Flood_Involvement_Count - a.Flood_Involvement_Count;
    });

    // Take top N (or all)
    const topRecords = topN === 'all' ? sorted : sorted.slice(0, topN);

    // Calculate cumulative percentage
    const total = metricMode === 'alarms'
      ? topRecords.reduce((sum, r) => sum + r.Total_Alarm_In_Floods, 0)
      : topRecords.reduce((sum, r) => sum + r.Flood_Involvement_Count, 0);

    let cumulative = 0;
    const chartData = topRecords.map((record, idx) => {
      const value = metricMode === 'alarms' 
        ? record.Total_Alarm_In_Floods 
        : record.Flood_Involvement_Count;
      
      cumulative += value;
      const cumulativePct = total > 0 ? (cumulative / total) * 100 : 0;
      const sharePct = totalFloodCount > 0 && metricMode === 'alarms'
        ? (record.Total_Alarm_In_Floods / totalFloodCount) * 100
        : null;

      return {
        source: record.Source,
        value,
        alarms: record.Total_Alarm_In_Floods,
        windows: record.Flood_Involvement_Count,
        cumulativePct,
        sharePct,
        isMeta: isMetaSource(record.Source),
        index: idx,
      };
    });

    return chartData;
  }, [data, includeSystem, metricMode, topN, totalFloodCount]);

  // Find where cumulative crosses 80% (Pareto principle)
  const pareto80Index = useMemo(() => {
    const idx = processedData.findIndex(d => d.cumulativePct >= 80);
    return idx >= 0 ? idx : processedData.length - 1;
  }, [processedData]);

  // Color palette
  const palette = useMemo(() => getGreenPalette(processedData.length), [processedData.length]);

  const handleInsightClick = () => {
    const payload = processedData.map(d => ({
      source: d.source,
      total_alarms: d.alarms,
      flood_windows: d.windows,
      share_pct: d.sharePct,
      cumulative_pct: d.cumulativePct,
    }));
    openInsightModal(payload, `Bad Actors - ${topN === 'all' ? 'All' : `Top ${topN}`} - ${metricMode === 'alarms' ? 'Alarms' : 'Windows'} Mode`);
  };

  if (isLoading) {
    return (
      <Card className="shadow-metric-card bg-dashboard-metric-card-bg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Bad Actors - Pareto Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[500px] bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (processedData.length === 0) {
    return (
      <Card className="shadow-metric-card bg-dashboard-metric-card-bg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Bad Actors - Pareto Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[500px] flex items-center justify-center text-muted-foreground">
            No bad actors data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-metric-card bg-dashboard-metric-card-bg">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <ShieldAlert className="h-5 w-5" />
              Bad Actors - Pareto Analysis
            </CardTitle>
            <CardDescription className="mt-2">
              Top sources contributing most {metricMode === 'alarms' ? 'alarms' : 'involvement'} during flood windows
              {pareto80Index < processedData.length && (
                <span className="block mt-1 text-xs">
                  <TrendingUp className="h-3 w-3 inline mr-1" />
                  Top {pareto80Index + 1} source{pareto80Index > 0 ? 's' : ''} account for 80% of {metricMode === 'alarms' ? 'alarms' : 'activity'}
                </span>
              )}
            </CardDescription>
            {activeRangeStart && activeRangeEnd && (
              <div className="mt-2 text-xs text-muted-foreground">
                <div>Local: {new Date(activeRangeStart).toLocaleString()} — {new Date(activeRangeEnd).toLocaleString()}</div>
                <div>UTC: {new Date(activeRangeStart).toLocaleString(undefined, { timeZone: 'UTC' })} — {new Date(activeRangeEnd).toLocaleString(undefined, { timeZone: 'UTC' })}</div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-2">
            {/* Metric Toggle */}
            <div className="flex gap-1">
              <Button
                variant={metricMode === 'alarms' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMetricMode('alarms')}
              >
                Alarms
              </Button>
              <Button
                variant={metricMode === 'windows' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMetricMode('windows')}
              >
                Windows
              </Button>
            </div>

            {/* Top N Filter */}
            {onTopNChange && (
              <div className="flex gap-1">
                <Button variant={topN === 5 ? 'default' : 'outline'} size="sm" onClick={() => onTopNChange(5)}>
                  Top 5
                </Button>
                <Button variant={topN === 10 ? 'default' : 'outline'} size="sm" onClick={() => onTopNChange(10)}>
                  Top 10
                </Button>
                <Button variant={topN === 15 ? 'default' : 'outline'} size="sm" onClick={() => onTopNChange(15)}>
                  Top 15
                </Button>
                <Button variant={topN === 20 ? 'default' : 'outline'} size="sm" onClick={() => onTopNChange(20)}>
                  Top 20
                </Button>
                <Button variant={topN === 'all' ? 'default' : 'outline'} size="sm" onClick={() => onTopNChange('all')}>
                  All
                </Button>
              </div>
            )}

            {/* Insight Button */}
            <InsightButton onClick={handleInsightClick} disabled={isLoading || processedData.length === 0} />
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-4 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: CHART_GREEN_PRIMARY }}></div>
            <span className="text-muted-foreground">
              {metricMode === 'alarms' ? 'Alarm Count' : 'Window Count'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5" style={{ backgroundColor: CHART_WARNING }}></div>
            <span className="text-muted-foreground">Cumulative %</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 border-t-2 border-dashed" style={{ borderColor: CHART_GREEN_SECONDARY }}></div>
            <span className="text-muted-foreground">80% Threshold</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[600px] md:min-w-0">
            <ResponsiveContainer width="100%" height={500}>
              <ComposedChart
                data={processedData}
                layout="vertical"
                margin={{ top: 24, right: 40, bottom: 56, left: 120 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                
                {/* Y-axis: Source names */}
                <YAxis
                  dataKey="source"
                  type="category"
                  width={110}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    const maxLen = 15;
                    return value.length > maxLen ? value.substring(0, maxLen) + '...' : value;
                  }}
                />

                {/* X-axis (bottom): Value count */}
                <XAxis
                  type="number"
                  xAxisId="bottom"
                  orientation="bottom"
                  tick={{ fontSize: 12 }}
                  tickMargin={12}
                  label={{ 
                    value: metricMode === 'alarms' ? 'Total Alarms in Floods' : 'Flood Windows Involved', 
                    position: 'bottom', 
                    offset: 12 
                  }}
                />

                {/* X-axis (top): Cumulative percentage */}
                <XAxis
                  type="number"
                  xAxisId="top"
                  orientation="top"
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  tickMargin={8}
                  label={{ 
                    value: 'Cumulative %', 
                    position: 'insideTop', 
                    offset: -10 
                  }}
                />

                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[220px]">
                          <p className="font-semibold mb-2 text-foreground">{data.source}</p>
                          <div className="space-y-1 text-sm">
                            <p>
                              <span className="text-muted-foreground">Alarms in Floods: </span>
                              <span className="font-semibold">{data.alarms.toLocaleString()}</span>
                            </p>
                            <p>
                              <span className="text-muted-foreground">Flood Windows: </span>
                              <span className="font-semibold">{data.windows.toLocaleString()}</span>
                            </p>
                            {data.sharePct !== null && (
                              <p>
                                <span className="text-muted-foreground">Share of Total: </span>
                                <span className="font-semibold">{data.sharePct.toFixed(1)}%</span>
                              </p>
                            )}
                            <p>
                              <span className="text-muted-foreground">Cumulative: </span>
                              <span className="font-semibold">{data.cumulativePct.toFixed(1)}%</span>
                            </p>
                            {data.isMeta && (
                              <p className="text-xs text-muted-foreground italic mt-1">System/meta source</p>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {/* Bar: Alarm/Window count */}
                <Bar
                  dataKey="value"
                  xAxisId="bottom"
                  fill={CHART_GREEN_PRIMARY}
                  radius={[0, 4, 4, 0]}
                  name={metricMode === 'alarms' ? 'Alarm Count' : 'Window Count'}
                >
                  {processedData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={palette[index % palette.length]}
                      opacity={entry.isMeta ? 0.5 : 1}
                    />
                  ))}
                </Bar>

                {/* Line: Cumulative percentage */}
                <Line
                  dataKey="cumulativePct"
                  xAxisId="top"
                  type="monotone"
                  stroke={CHART_WARNING}
                  strokeWidth={3}
                  dot={{ r: 4, fill: CHART_WARNING }}
                  activeDot={{ r: 6 }}
                  name="Cumulative %"
                />

                {/* Reference line at 80% */}
                <ReferenceLine
                  x={80}
                  xAxisId="top"
                  stroke={CHART_GREEN_SECONDARY}
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{ value: '80%', position: 'top', fill: CHART_GREEN_SECONDARY, fontSize: 12 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <div className="p-3 rounded border bg-muted/30">
            <p className="text-muted-foreground text-xs">Total Sources</p>
            <p className="text-xl font-bold">{processedData.length}</p>
          </div>
          <div className="p-3 rounded border bg-muted/30">
            <p className="text-muted-foreground text-xs">Total Alarms</p>
            <p className="text-xl font-bold">{processedData.reduce((s, d) => s + d.alarms, 0).toLocaleString()}</p>
          </div>
          <div className="p-3 rounded border bg-muted/30">
            <p className="text-muted-foreground text-xs">Avg per Source</p>
            <p className="text-xl font-bold">
              {processedData.length > 0
                ? Math.round(processedData.reduce((s, d) => s + d.alarms, 0) / processedData.length).toLocaleString()
                : 0}
            </p>
          </div>
          <div className="p-3 rounded border bg-muted/30">
            <p className="text-muted-foreground text-xs">Pareto (80%)</p>
            <p className="text-xl font-bold">
              {pareto80Index < processedData.length ? `Top ${pareto80Index + 1}` : 'N/A'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
