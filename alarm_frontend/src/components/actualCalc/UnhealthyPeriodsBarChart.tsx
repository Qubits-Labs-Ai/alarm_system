/**
 * UnhealthyPeriodsBarChart - Top Sources with Most Unhealthy Periods
 * Horizontal bar chart with severity-based coloring showing distribution of unhealthy periods
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { CHART_GREEN_PRIMARY, CHART_GREEN_SECONDARY, CHART_GREEN_TERTIARY, CHART_WARNING, CHART_DESTRUCTIVE, severityToColor } from '@/theme/chartColors';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { InsightButton } from '@/components/insights/InsightButton';
import { useInsightModal } from '@/components/insights/useInsightModal';

interface UnhealthyPeriodRecord {
  Source: string;
  Unhealthy_Periods: number;
}

interface UnhealthyPeriodsBarChartProps {
  data: UnhealthyPeriodRecord[];
  threshold: number;
  windowMinutes: number;
  topN?: 10 | 15 | 20 | 25;
  onTopNChange?: (n: 10 | 15 | 20 | 25) => void;
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

// Get severity level based on unhealthy period count
function getSeverityLevel(periods: number): 'critical' | 'high' | 'medium' | 'low' {
  if (periods > 100) return 'critical';
  if (periods > 50) return 'high';
  if (periods > 20) return 'medium';
  return 'low';
}

// Map severity to color
function getSeverityColor(periods: number): string {
  // Map period counts to 0-100 severity scale
  const severity = Math.min(100, (periods / 150) * 100);
  return severityToColor(severity);
}

export function UnhealthyPeriodsBarChart({
  data,
  threshold,
  windowMinutes,
  topN = 15,
  onTopNChange,
  isLoading = false,
  includeSystem = true,
  activeRangeStart,
  activeRangeEnd,
}: UnhealthyPeriodsBarChartProps) {
  const { onOpen: openInsightModal } = useInsightModal();
  const [viewMode, setViewMode] = useState<'chart' | 'distribution'>('chart');

  // Process and filter data
  const processedData = useMemo(() => {
    const filtered = includeSystem 
      ? data 
      : data.filter(d => !isMetaSource(d.Source));

    // Sort by unhealthy periods descending
    const sorted = [...filtered].sort((a, b) => b.Unhealthy_Periods - a.Unhealthy_Periods);

    // Take top N
    const topRecords = sorted.slice(0, topN);

    return topRecords.map((record, idx) => ({
      source: record.Source,
      periods: record.Unhealthy_Periods,
      severity: getSeverityLevel(record.Unhealthy_Periods),
      color: getSeverityColor(record.Unhealthy_Periods),
      isMeta: isMetaSource(record.Source),
      index: idx,
    }));
  }, [data, includeSystem, topN]);

  // Distribution data: group sources by severity buckets
  const distributionData = useMemo(() => {
    const filtered = includeSystem 
      ? data 
      : data.filter(d => !isMetaSource(d.Source));

    const buckets = {
      critical: filtered.filter(d => d.Unhealthy_Periods > 100).length,
      high: filtered.filter(d => d.Unhealthy_Periods > 50 && d.Unhealthy_Periods <= 100).length,
      medium: filtered.filter(d => d.Unhealthy_Periods > 20 && d.Unhealthy_Periods <= 50).length,
      low: filtered.filter(d => d.Unhealthy_Periods > 0 && d.Unhealthy_Periods <= 20).length,
    };

    return [
      { severity: 'Critical (>100)', count: buckets.critical, color: CHART_DESTRUCTIVE, fill: 'oklch(0.58 0.22 25)' },
      { severity: 'High (51-100)', count: buckets.high, color: CHART_WARNING, fill: 'oklch(0.75 0.15 60)' },
      { severity: 'Medium (21-50)', count: buckets.medium, color: CHART_GREEN_TERTIARY, fill: 'oklch(0.55 0.12 140)' },
      { severity: 'Low (1-20)', count: buckets.low, color: CHART_GREEN_SECONDARY, fill: 'oklch(0.68 0.12 140)' },
    ];
  }, [data, includeSystem]);

  // Stats
  const totalSources = useMemo(() => {
    const filtered = includeSystem ? data : data.filter(d => !isMetaSource(d.Source));
    return filtered.length;
  }, [data, includeSystem]);

  const totalPeriods = useMemo(() => {
    const filtered = includeSystem ? data : data.filter(d => !isMetaSource(d.Source));
    return filtered.reduce((sum, d) => sum + d.Unhealthy_Periods, 0);
  }, [data, includeSystem]);

  const avgPeriods = useMemo(() => {
    return totalSources > 0 ? totalPeriods / totalSources : 0;
  }, [totalSources, totalPeriods]);

  const maxPeriods = useMemo(() => {
    return processedData.length > 0 ? Math.max(...processedData.map(d => d.periods)) : 0;
  }, [processedData]);

  const handleInsightClick = () => {
    const payload = processedData.map(d => ({
      source: d.source,
      unhealthy_periods: d.periods,
      severity: d.severity,
    }));
    openInsightModal(payload, `Unhealthy Periods - Top ${topN} Sources`);
  };

  if (isLoading) {
    return (
      <Card className="shadow-metric-card bg-dashboard-metric-card-bg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Unhealthy Periods Distribution
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
            <AlertTriangle className="h-5 w-5" />
            Unhealthy Periods Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[500px] flex items-center justify-center text-muted-foreground">
            No unhealthy periods data available
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
              <AlertTriangle className="h-5 w-5" />
              Unhealthy Periods Distribution
            </CardTitle>
            <CardDescription className="mt-2">
              {viewMode === 'chart' 
                ? `Top ${topN} sources with most ${windowMinutes}-min windows exceeding ${threshold} activations`
                : `Distribution of sources by severity level`
              }
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
            {/* View Mode Toggle */}
            <div className="flex gap-1">
              <Button
                variant={viewMode === 'chart' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('chart')}
              >
                Top Sources
              </Button>
              <Button
                variant={viewMode === 'distribution' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('distribution')}
              >
                Distribution
              </Button>
            </div>

            {/* Top N Filter (only in chart mode) */}
            {onTopNChange && viewMode === 'chart' && (
              <div className="flex gap-1">
                <Button variant={topN === 10 ? 'default' : 'outline'} size="sm" onClick={() => onTopNChange(10)}>
                  Top 10
                </Button>
                <Button variant={topN === 15 ? 'default' : 'outline'} size="sm" onClick={() => onTopNChange(15)}>
                  Top 15
                </Button>
                <Button variant={topN === 20 ? 'default' : 'outline'} size="sm" onClick={() => onTopNChange(20)}>
                  Top 20
                </Button>
                <Button variant={topN === 25 ? 'default' : 'outline'} size="sm" onClick={() => onTopNChange(25)}>
                  Top 25
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
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'oklch(0.58 0.22 25)' }}></div>
            <span className="text-muted-foreground">Critical (&gt;100)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'oklch(0.75 0.15 60)' }}></div>
            <span className="text-muted-foreground">High (51-100)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: CHART_GREEN_TERTIARY }}></div>
            <span className="text-muted-foreground">Medium (21-50)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: CHART_GREEN_SECONDARY }}></div>
            <span className="text-muted-foreground">Low (1-20)</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[600px] md:min-w-0">
            <ResponsiveContainer width="100%" height={500}>
              {viewMode === 'chart' ? (
                <BarChart
                  data={processedData}
                  layout="vertical"
                  margin={{ top: 20, right: 40, bottom: 56, left: 120 }}
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

                  {/* X-axis: Period count */}
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    tickMargin={12}
                    label={{ 
                      value: `Unhealthy ${windowMinutes}-min Periods`, 
                      position: 'bottom', 
                      offset: 12 
                    }}
                  />

                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[220px]">
                            <p className="font-semibold mb-2 text-foreground">{data.source}</p>
                            <div className="space-y-1 text-sm">
                              <p>
                                <span className="text-muted-foreground">Unhealthy Periods: </span>
                                <span className="font-semibold">{data.periods.toLocaleString()}</span>
                              </p>
                              <p>
                                <span className="text-muted-foreground">Severity: </span>
                                <span 
                                  className="font-semibold capitalize"
                                  style={{ color: data.color }}
                                >
                                  {data.severity}
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground pt-1">
                                {windowMinutes}-min windows with &gt;{threshold} activations
                              </p>
                              {data.isMeta && (
                                <p className="text-xs text-muted-foreground italic">System/meta source</p>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  {/* Bar with severity-based colors */}
                  <Bar
                    dataKey="periods"
                    fill={CHART_GREEN_PRIMARY}
                    radius={[0, 4, 4, 0]}
                    name="Unhealthy Periods"
                  >
                    {processedData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        opacity={entry.isMeta ? 0.5 : 1}
                      />
                    ))}
                  </Bar>

                  {/* Reference line at average */}
                  {avgPeriods > 0 && (
                    <ReferenceLine
                      x={avgPeriods}
                      stroke={CHART_GREEN_PRIMARY}
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      label={{ 
                        value: `Avg: ${avgPeriods.toFixed(0)}`, 
                        position: 'top', 
                        fill: CHART_GREEN_PRIMARY, 
                        fontSize: 12 
                      }}
                    />
                  )}
                </BarChart>
              ) : (
                <BarChart
                  data={distributionData}
                  margin={{ top: 20, right: 40, bottom: 60, left: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  
                  <XAxis
                    dataKey="severity"
                    tick={{ fontSize: 12 }}
                    angle={-15}
                    textAnchor="end"
                    height={80}
                    tickMargin={8}
                  />

                  <YAxis
                    tick={{ fontSize: 12 }}
                    label={{ 
                      value: 'Number of Sources', 
                      angle: -90, 
                      position: 'insideLeft' 
                    }}
                  />

                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
                            <p className="font-semibold mb-2 text-foreground">{data.severity}</p>
                            <p className="text-sm">
                              <span className="text-muted-foreground">Sources: </span>
                              <span className="font-semibold">{data.count.toLocaleString()}</span>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  <Bar
                    dataKey="count"
                    fill={CHART_GREEN_PRIMARY}
                    radius={[4, 4, 0, 0]}
                    name="Source Count"
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <div className="p-3 rounded border bg-muted/30">
            <p className="text-muted-foreground text-xs">Total Sources</p>
            <p className="text-xl font-bold">{totalSources.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded border bg-muted/30">
            <p className="text-muted-foreground text-xs">Total Periods</p>
            <p className="text-xl font-bold">{totalPeriods.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded border bg-muted/30">
            <p className="text-muted-foreground text-xs">Avg per Source</p>
            <p className="text-xl font-bold">{avgPeriods.toFixed(1)}</p>
          </div>
          <div className="p-3 rounded border bg-muted/30">
            <p className="text-muted-foreground text-xs">Max</p>
            <p className="text-xl font-bold">{maxPeriods.toLocaleString()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
