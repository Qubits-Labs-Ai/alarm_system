import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Clock, RefreshCw, TrendingUp } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';
import { CHART_GREEN_DARK, CHART_GREEN_LIGHT, CHART_GREEN_MEDIUM, CHART_GREEN_PALE, priorityToGreen, magnitudeToGreen } from '@/theme/chartColors';
import { useInsightModal } from '@/components/insights/useInsightModal';
import { InsightButton } from '@/components/insights/InsightButton';

interface UnhealthyRecord {
  event_time: string;
  bin_end: string;
  source: string;
  hits: number;
  threshold: number;
  over_by: number;
  rate_per_min: number;
  location_tag?: string;
  condition?: string;
  action?: string;
  priority?: string;
  description?: string;
  value?: number;
  units?: string;
  // Extended fields from backend saved JSON
  flood_count?: number;
  peak_window_start?: string;
  peak_window_end?: string;
}

interface UnhealthySourcesData {
  count: number;
  records: UnhealthyRecord[];
  isHistoricalData?: boolean;
  note?: string;
}

interface UnhealthySourcesBarChartProps {
  className?: string;
}

const UnhealthySourcesBarChart: React.FC<UnhealthySourcesBarChartProps> = ({ className }) => {
  const [data, setData] = useState<UnhealthySourcesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string>('1h');
  const [sortBy, setSortBy] = useState<'hits' | 'alphabetical'>('hits');
  const [topLimit, setTopLimit] = useState<number>(20);
  // Month and window controls (mirror timeline chart)
  const [selectedMonth, setSelectedMonth] = useState<string>('2025-01'); // 'all' or 'YYYY-MM'
  const [availableMonths, setAvailableMonths] = useState<Array<{ value: string; label: string; start: Date; end: Date }>>([]);
  const [windowMode, setWindowMode] = useState<'recent' | 'peak'>('peak');
  const { onOpen: openInsightModal } = useInsightModal();

  useEffect(() => {
    fetchUnhealthySources();
  }, [timeRange, selectedMonth, windowMode]);

  // Load months list once on mount
  useEffect(() => {
    loadAvailableMonths();
  }, []);

  // Helpers
  const getWindowMs = (tr: string) => {
    switch (tr) {
      case 'all': return null as unknown as number;
      case '1h': return 1 * 60 * 60 * 1000;
      case '6h': return 6 * 60 * 60 * 1000;
      case '24h': return 24 * 60 * 60 * 1000;
      case '7d': return 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  };

  const loadAvailableMonths = async () => {
    try {
      const { fetchUnhealthySources } = await import('../api/plantHealth');
      const res = await fetchUnhealthySources();
      const records: any[] = res?.records || [];
      const monthMap = new Map<string, { start: Date; end: Date }>();
      for (const r of records) {
        const ds = r.peak_window_start || r.event_time || r.bin_start || r.bin_end;
        if (!ds) continue;
        const d = new Date(ds);
        const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        if (!monthMap.has(value)) {
          const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
          const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
          monthMap.set(value, { start, end });
        }
      }
      const items = Array.from(monthMap.entries()).map(([value, range]) => ({
        value,
        label: new Date(`${value}-01T00:00:00Z`).toLocaleString(undefined, { month: 'short', year: 'numeric' }),
        start: range.start,
        end: range.end,
      })).sort((a, b) => a.start.getTime() - b.start.getTime());
      setAvailableMonths(items);
    } catch (e) {
      console.warn('Failed to load months for bar chart', e);
    }
  };

  const fetchUnhealthySources = async (skipTimeFilter = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const { fetchUnhealthySources } = await import('../api/plantHealth');

      if (skipTimeFilter) {
        console.log('Fetching all historical unhealthy sources (no time filter)');
        const result = await fetchUnhealthySources();
        setData(result);
        return;
      }

      const windowMs = getWindowMs(timeRange);
      let result: any = null;

      if (selectedMonth === 'all') {
        if (timeRange === 'all') {
          result = await fetchUnhealthySources();
        } else {
          const full = await fetchUnhealthySources();
          const recs: any[] = full?.records || [];
          const ts = (r: any) => new Date(r.peak_window_start || r.event_time || r.bin_start || r.bin_end || Date.now()).getTime();
          const flood = (r: any) => (r.flood_count ?? r.hits ?? 0) as number;
          if (recs.length === 0) {
            result = full;
          } else {
            let anchor = 0;
            if (windowMode === 'peak') {
              let best = recs[0];
              for (const r of recs) if (flood(r) > flood(best)) best = r;
              anchor = ts(best);
            } else {
              anchor = recs.reduce((m, r) => Math.max(m, ts(r)), 0);
            }
            const end = new Date(anchor);
            const start = new Date(end.getTime() - (windowMs as number));
            result = await fetchUnhealthySources(start.toISOString(), end.toISOString());
          }
        }
      } else {
        // Month range
        const month = availableMonths.find(m => m.value === selectedMonth);
        const monthStart = month?.start || new Date(`${selectedMonth}-01T00:00:00Z`);
        const monthEnd = month?.end || new Date(new Date(`${selectedMonth}-01T00:00:00Z`).getTime() + 32*24*60*60*1000);

        if (timeRange === 'all') {
          result = await fetchUnhealthySources(monthStart.toISOString(), monthEnd.toISOString());
        } else {
          const monthFull = await fetchUnhealthySources(monthStart.toISOString(), monthEnd.toISOString());
          const recs: any[] = monthFull?.records || [];
          const ts = (r: any) => new Date(r.peak_window_start || r.event_time || r.bin_start || r.bin_end || Date.now()).getTime();
          const flood = (r: any) => (r.flood_count ?? r.hits ?? 0) as number;
          if (recs.length === 0) {
            result = monthFull;
          } else {
            let anchor = 0;
            if (windowMode === 'peak') {
              let best = recs[0];
              for (const r of recs) if (flood(r) > flood(best)) best = r;
              anchor = ts(best);
            } else {
              anchor = recs.reduce((m, r) => Math.max(m, ts(r)), 0);
            }
            let end = new Date(Math.min(anchor, monthEnd.getTime()));
            let start = new Date(Math.max(monthStart.getTime(), end.getTime() - (windowMs as number)));
            result = await fetchUnhealthySources(start.toISOString(), end.toISOString());
          }
        }
      }
      
      console.log('Unhealthy sources API response (bar):', result);
      setData(result);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch unhealthy sources data';
      setError(errorMessage);
      console.error('Error fetching unhealthy sources:', err);
    } finally {
      setLoading(false);
    }
  };

  // Process data for bar chart - Extract actual alarm sources from records (using flood_count)
  const processedData = React.useMemo(() => {
    if (!data || !data.records) return [];

    console.log('Processing unhealthy data:', data.records);

    // Group by actual alarm source (not filename)
    const sourceMap = new Map<string, {
      source: string;
      totalFlood: number;
      incidents: number;
      maxFlood: number;
      avgFlood: number;
      latestRecord: UnhealthyRecord;
      priority: string;
      allRecords: UnhealthyRecord[];
    }>();

    data.records.forEach(record => {
      // The API now returns proper alarm source names like EVENT_SCM1B, OP_NASH1, etc.
      let actualSource = record.source;
      
      // Clean up source name only if it still contains file extensions (fallback data)
      if (actualSource.includes('.csv')) {
        actualSource = actualSource.replace('.csv', '');
        console.log('Cleaned filename source:', actualSource);
      }
      
      // If source looks like a filename, try to extract meaningful source name
      if (actualSource.includes('/') || actualSource.includes('\\')) {
        const parts = actualSource.split(/[/\\]/);
        actualSource = parts[parts.length - 1];
      }
      
      // Log the actual source for debugging
      const flood = (record as any).flood_count ?? record.hits ?? 0;
      console.log('Processing source:', actualSource, 'with flood:', flood);

      const existing = sourceMap.get(actualSource);
      if (existing) {
        existing.totalFlood += flood;
        existing.incidents += 1;
        existing.maxFlood = Math.max(existing.maxFlood, flood);
        existing.allRecords.push(record);
        // Keep the latest record for details
        const recTs = new Date((record as any).peak_window_start || record.event_time).getTime();
        const exTs = new Date((existing.latestRecord as any).peak_window_start || existing.latestRecord.event_time).getTime();
        if (recTs > exTs) {
          existing.latestRecord = record;
        }
      } else {
        sourceMap.set(actualSource, {
          source: actualSource,
          totalFlood: flood,
          incidents: 1,
          maxFlood: flood,
          avgFlood: flood,
          latestRecord: record,
          priority: record.priority || 'Medium',
          allRecords: [record]
        });
      }
    });

    // Convert to array and calculate averages
    let result = Array.from(sourceMap.values()).map(item => ({
      ...item,
      avgFlood: Math.round((item.totalFlood / item.incidents) * 10) / 10
    }));

    // Sort data
    if (sortBy === 'hits') {
      result.sort((a, b) => b.totalFlood - a.totalFlood);
    } else {
      result.sort((a, b) => a.source.localeCompare(b.source));
    }

    // Limit to top N sources to avoid congestion
    result = result.slice(0, topLimit);

    console.log('Processed source data:', result);
    return result;
  }, [data, sortBy, topLimit]);

  // Open AI insight modal with the currently processed Top Sources data
  const handleInsightClick = () => {
    openInsightModal(processedData, 'Unhealthy Sources Analysis');
  };

  // Color mapping for priorities
  const getPriorityColor = (priority: string, hits: number) => {
    // Use centralized green palette for consistency
    if (priority) return priorityToGreen(priority);
    return magnitudeToGreen(hits || 0);
  };

  // Custom tooltip with enhanced source information
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const record = data.latestRecord;
      
      return (
        <div className="bg-dashboard-chart-tooltip-bg p-4 border border-border rounded-lg shadow-xl max-w-sm">
          <div className="font-semibold text-foreground mb-3 text-base">
            🚨 {data.source}
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="font-medium text-muted-foreground">Total Flood:</span></div>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>{data.totalFlood}</div>
              
              <div><span className="font-medium text-muted-foreground">Incidents:</span></div>
              <div>{data.incidents}</div>
              
              <div><span className="font-medium text-muted-foreground">Max Flood:</span></div>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>{data.maxFlood}</div>
              
              <div><span className="font-medium text-muted-foreground">Avg Flood:</span></div>
              <div>{data.avgFlood}</div>
            </div>
            
            <div className="my-2 border-t border-border" />
            
            <div className="bg-accent p-2 rounded text-xs">
              <div className="font-medium text-foreground mb-1">Latest Incident:</div>
              <div><span className="font-medium">Peak Window:</span> {new Date((record as any).peak_window_start || record.event_time).toLocaleString()} → {new Date((record as any).peak_window_end || record.bin_end).toLocaleString()}</div>
            </div>
            
            <div><span className="font-medium text-muted-foreground">Priority:</span> 
              <span
                className="ml-1 px-2 py-1 rounded text-xs font-medium"
                style={{
                  backgroundColor: CHART_GREEN_PALE,
                  color: priorityToGreen(record.priority || 'Medium'),
                }}
              >
                {record.priority || 'Medium'}
              </span>
            </div>
            
            {record.location_tag && record.location_tag !== 'Production Area' && (
              <div><span className="font-medium text-muted-foreground">Location:</span> {record.location_tag}</div>
            )}
            
            {record.condition && record.condition !== 'Alarm Threshold Exceeded' && (
              <div><span className="font-medium text-muted-foreground">Condition:</span> {record.condition}</div>
            )}
            
            {record.description && record.description !== 'Not Provided' && !record.description.includes('Source exceeded') && (
              <div><span className="font-medium text-muted-foreground">Description:</span> 
                <div className="text-xs text-muted-foreground mt-1">{record.description}</div>
              </div>
            )}
            
            <div className="text-xs text-foreground mt-2 p-2 rounded" style={{backgroundColor: CHART_GREEN_PALE}}>
              ⚠️ Threshold: {record.threshold} alarms/10min • Over by: {record.over_by} hits
            </div>
            
            {data.allRecords && data.allRecords.length > 1 && (
              <div className="text-xs text-primary mt-1">
                📊 Total {data.allRecords.length} incidents in selected period
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p>Loading unhealthy sources...</p>
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
            <Button onClick={fetchUnhealthySources} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!data || data.count === 0 || processedData.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Unhealthy Sources Analysis
              </CardTitle>
              <CardDescription>
                No unhealthy sources found • All systems operating within thresholds
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Month Selector */}
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {availableMonths.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Window Mode */}
              <Select value={windowMode} onValueChange={(v) => setWindowMode(v as any)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Window" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Most Recent</SelectItem>
                  <SelectItem value="peak">Peak Activity</SelectItem>
                </SelectContent>
              </Select>
              {/* Time Range */}
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1H</SelectItem>
                  <SelectItem value="6h">6H</SelectItem>
                  <SelectItem value="24h">24H</SelectItem>
                  <SelectItem value="7d">7D</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <InsightButton onClick={handleInsightClick} disabled={loading || processedData.length === 0} />
              <Button variant="outline" size="sm" onClick={fetchUnhealthySources}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="bg-accent p-4 rounded-full mb-4">
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">All Systems Healthy!</h3>
            <p className="text-muted-foreground mb-4">
              No sources are exceeding the alarm threshold in the selected time range.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTimeRange('7d')}>
                Try 7 Days Range
              </Button>
              <Button variant="outline" onClick={() => fetchUnhealthySources(true)}>
                Show All Historical Data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Unhealthy Sources Analysis
            </CardTitle>
            <CardDescription>
              Alarm sources exceeding 10 alarms per 10-minute window • Top {processedData.length} sources shown
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Month Selector */}
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {availableMonths.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Window Mode */}
            <Select value={windowMode} onValueChange={(v) => setWindowMode(v as any)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="peak">Peak Activity</SelectItem>
              </SelectContent>
            </Select>
            <Select value={topLimit.toString()} onValueChange={(value) => setTopLimit(parseInt(value))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="50">Top 50</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as any)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hits">By Flood</SelectItem>
                <SelectItem value="alphabetical">A-Z</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1H</SelectItem>
                <SelectItem value="6h">6H</SelectItem>
                <SelectItem value="24h">24H</SelectItem>
                <SelectItem value="7d">7D</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <InsightButton onClick={handleInsightClick} disabled={loading || processedData.length === 0} />
            <Button variant="outline" size="sm" onClick={fetchUnhealthySources}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={processedData}
              margin={{ top: 20, right: 30, left: 140, bottom: 120 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis 
                dataKey="source"
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ fontSize: 10 }}
                interval={0}
                label={{ value: 'Alarm Source', position: 'insideBottom', offset: -5 }}
                tickFormatter={(value) => {
                  // Truncate long source names for better readability
                  if (value.length > 15) {
                    return value.substring(0, 12) + '...';
                  }
                  return value;
                }}
              />
              <YAxis 
                label={{ value: 'Total Flood Count', angle: -90, position: 'insideLeft', offset: 10 }}
                tick={{ fontSize: 12 }}
              />
              
              {/* Threshold line at 10 */}
              <ReferenceLine 
                y={10} 
                stroke="hsl(var(--destructive))"
                strokeDasharray="5 5" 
                strokeWidth={2}
                isFront
                label={{ value: "Threshold (10)", position: "insideLeft", fill: "hsl(var(--destructive))", fontSize: 10, dx: 6, dy: -2, textAnchor: 'start' }}
              />
              
              <Tooltip 
                content={<CustomTooltip />} 
                cursor={{ fill: 'var(--accent)', opacity: 0.1 }}
                contentStyle={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
              />
              
              <Bar dataKey="totalFlood" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {processedData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={getPriorityColor(entry.priority, entry.totalFlood)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend and Summary */}
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{backgroundColor: CHART_GREEN_DARK}}></div>
              <span>High Priority (25+ flood)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{backgroundColor: CHART_GREEN_MEDIUM}}></div>
              <span>Medium Priority (15-24 flood)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{backgroundColor: CHART_GREEN_LIGHT}}></div>
              <span>Low Priority (10-14 flood)</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-lg" style={{backgroundColor: CHART_GREEN_PALE}}>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>Total Sources</div>
              <div className="text-2xl font-bold" style={{color: CHART_GREEN_DARK}}>{processedData.length}</div>
            </div>
            <div className="p-3 rounded-lg" style={{backgroundColor: CHART_GREEN_PALE}}>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>Total Incidents</div>
              <div className="text-2xl font-bold" style={{color: CHART_GREEN_DARK}}>
                {processedData.reduce((sum, item) => sum + item.incidents, 0)}
              </div>
            </div>
            <div className="p-3 rounded-lg" style={{backgroundColor: CHART_GREEN_PALE}}>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>Total Flood</div>
              <div className="text-2xl font-bold" style={{color: CHART_GREEN_DARK}}>
                {processedData.reduce((sum, item) => sum + item.totalFlood, 0)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UnhealthySourcesBarChart;
