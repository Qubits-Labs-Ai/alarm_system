import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, AlertTriangle, Filter, Download, Zap } from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar
} from 'recharts';
import { CHART_GREEN_DARK, CHART_GREEN_LIGHT, CHART_GREEN_MEDIUM, CHART_GREEN_PALE, priorityToGreen } from '@/theme/chartColors';

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
}

interface UnhealthySourcesData {
  count: number;
  records: UnhealthyRecord[];
}

interface UnhealthySourcesChartProps {
  className?: string;
}

const UnhealthySourcesChart: React.FC<UnhealthySourcesChartProps> = ({ className }) => {
  const [data, setData] = useState<UnhealthySourcesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'timeline' | 'bar'>('timeline');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('1h');
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal'); // horizontal: X=time, Y=source; vertical: X=source, Y=time
  const [selectedMonth, setSelectedMonth] = useState<string>('2025-01'); // default Jan 2025; supports 'all' or 'YYYY-MM'
  const [availableMonths, setAvailableMonths] = useState<Array<{ value: string; label: string; start: Date; end: Date }>>([]);
  const [windowMode, setWindowMode] = useState<'recent' | 'peak'>('peak');

  useEffect(() => {
    fetchUnhealthySources();
  }, [timeRange, selectedMonth, windowMode]);

  // Load months list once on mount (derive from full dataset)
  useEffect(() => {
    loadAvailableMonths();
  }, []);

  // When user selects All months, default the timeRange to 'all' so everything shows
  useEffect(() => {
    if (selectedMonth === 'all' && timeRange !== 'all') {
      setTimeRange('all');
    }
  }, [selectedMonth]);

  const getWindowMs = (tr: string) => {
    switch (tr) {
      case 'all': return null as unknown as number; // special: means unbounded within scope
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
      const res = await fetchUnhealthySources(); // no filters → full historical dataset
      const records: any[] = res?.records || [];
      const monthMap = new Map<string, { start: Date; end: Date }>();
      for (const r of records) {
        const ds = (r as any).peak_window_start || (r as any).event_time || (r as any).bin_start || (r as any).bin_end;
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
      console.warn('Failed to load available months', e);
    }
  };

  const fetchUnhealthySources = async () => {
    try {
      setLoading(true);
      setError(null);
      const { fetchUnhealthySources: fetchAPI } = await import('../api/plantHealth');

      const windowMs = getWindowMs(timeRange);

      let result: any = null;
      if (selectedMonth === 'all') {
        if (timeRange === 'all') {
          console.log('Fetching entire dataset (All months, full range)');
          result = await fetchAPI();
          setData(result);
          if (result && result.count === 0) console.log('No unhealthy sources found in entire dataset');
          return;
        }
        // Fetch full dataset to determine global anchor window across all months
        console.log('Fetching full dataset (All months, unbounded) to derive window');
        const fullResult = await fetchAPI();
        if (!fullResult || fullResult.count === 0) {
          result = fullResult;
          setData(result);
          if (result && result.count === 0) console.log('No unhealthy sources found in entire dataset');
          return;
        }

        const records: any[] = fullResult.records || [];
        const getTs = (r: any) => {
          const ds = r.peak_window_start || r.event_time || r.bin_start || r.bin_end;
          return ds ? new Date(ds).getTime() : 0;
        };
        const getFlood = (r: any) => (r.flood_count ?? r.hits ?? 0) as number;
        const minTs = records.reduce((min, r) => Math.min(min, getTs(r) || Infinity), Infinity);
        const maxTs = records.reduce((max, r) => Math.max(max, getTs(r) || 0), 0);

        let anchorTs: number;
        if (windowMode === 'peak') {
          let best = records[0];
          for (const rec of records) {
            if (getFlood(rec) > getFlood(best)) best = rec;
          }
          anchorTs = getTs(best) || maxTs;
        } else {
          anchorTs = records.reduce((max, r) => Math.max(max, getTs(r)), 0) || maxTs;
        }

        const datasetStart = new Date(minTs === Infinity ? maxTs - windowMs : minTs);
        const datasetEnd = new Date(maxTs || Date.now());
        let anchorEnd = new Date(Math.min(anchorTs, datasetEnd.getTime()));
        let anchorStart = new Date(Math.max(datasetStart.getTime(), anchorEnd.getTime() - windowMs));

        console.log(`Derived global window (${windowMode}) ${anchorStart.toISOString()} → ${anchorEnd.toISOString()}`);
        result = await fetchAPI(anchorStart.toISOString(), anchorEnd.toISOString());
      } else {
        // Find month boundaries (UTC) from availableMonths or compute
        const month = availableMonths.find(m => m.value === selectedMonth);
        const monthStart = month?.start || new Date(`${selectedMonth}-01T00:00:00Z`);
        const monthEnd = month?.end || new Date(new Date(`${selectedMonth}-01T00:00:00Z`).getTime() + 32 * 24 * 60 * 60 * 1000);

        // If timeRange is 'all', fetch full month directly
        if (timeRange === 'all') {
          console.log(`Fetching full month ${selectedMonth} dataset`);
          result = await fetchAPI(monthStart.toISOString(), monthEnd.toISOString());
          setData(result);
          return;
        }

        // First fetch the whole month to determine anchor time
        console.log(`Fetching month dataset ${selectedMonth}: ${monthStart.toISOString()} → ${monthEnd.toISOString()}`);
        const monthResult = await fetchAPI(monthStart.toISOString(), monthEnd.toISOString());

        if (!monthResult || monthResult.count === 0) {
          result = monthResult;
          setData(result);
          // Log and exit early
          if (result && result.count === 0) {
            console.log('No unhealthy sources found for selected month');
          }
          return; 
        }

        const records: any[] = monthResult.records || [];
        const getTs = (r: any) => {
          const ds = r.peak_window_start || r.event_time || r.bin_start || r.bin_end;
          return ds ? new Date(ds).getTime() : 0;
        };
        const getFlood = (r: any) => (r.flood_count ?? r.hits ?? 0) as number;

        let anchorTs: number;
        if (windowMode === 'peak') {
          let best = records[0];
          for (const rec of records) {
            if (getFlood(rec) > getFlood(best)) best = rec;
          }
          anchorTs = getTs(best) || monthEnd.getTime();
        } else {
          anchorTs = records.reduce((max, r) => Math.max(max, getTs(r)), 0) || monthEnd.getTime();
        }

        let anchorEnd = new Date(Math.min(anchorTs, monthEnd.getTime()));
        let anchorStart = new Date(Math.max(monthStart.getTime(), anchorEnd.getTime() - windowMs));
        // Adjust if overflow
        if (anchorStart.getTime() + windowMs > monthEnd.getTime()) {
          anchorStart = new Date(Math.max(monthStart.getTime(), monthEnd.getTime() - windowMs));
          anchorEnd = new Date(Math.min(monthEnd.getTime(), anchorStart.getTime() + windowMs));
        }

        console.log(`Derived window (${windowMode}) ${anchorStart.toISOString()} → ${anchorEnd.toISOString()}`);
        result = await fetchAPI(anchorStart.toISOString(), anchorEnd.toISOString());
      }
      setData(result);
      
      // Log the result for debugging
      if (result && result.count === 0) {
        console.log('No unhealthy sources found in the selected time range');
      } else if (result && result.count > 0) {
        console.log(`Found ${result.count} unhealthy sources`);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch unhealthy sources data';
      setError(errorMessage);
      console.error('Error fetching unhealthy sources:', err);
      
      // Try to provide more helpful error information
      if (errorMessage.includes('404')) {
        setError('Unhealthy sources endpoint not found. Please check if the backend server is running.');
      } else if (errorMessage.includes('500')) {
        setError('Server error while processing unhealthy sources. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Filter data based on selected priority
  const filteredRecords = data?.records.filter(record => 
    selectedPriority === 'all' || record.priority === selectedPriority
  ) || [];

  // Prepare data for timeline scatter chart
  const timelineData = filteredRecords.map((record, index) => {
    const start = (record as any).peak_window_start || (record as any).event_time;
    const end = (record as any).peak_window_end || (record as any).bin_end;
    const flood = (record as any).flood_count ?? (record as any).hits ?? 0;
    return {
      x: new Date(start).getTime(),
      y: record.source,
      // size metric for bubble
      flood_count: flood,
      // keep hits for backward-compatibility in tooltips, but visuals rely on flood_count
      hits: (record as any).hits,
      over_by: (record as any).over_by,
      rate_per_min: (record as any).rate_per_min,
      priority: record.priority || 'Medium',
      description: record.description || 'No description',
      location_tag: record.location_tag || 'Unknown',
      condition: record.condition || 'Unknown',
      peak_window_start: start,
      peak_window_end: end,
      sourceIndex: [...new Set(filteredRecords.map(r => r.source))].indexOf(record.source),
      id: index
    };
  });

  // Prepare data for bar chart (sources by total flood count)
  const sourceHitsData = filteredRecords.reduce((acc, record) => {
    const count = (record as any).flood_count ?? (record as any).hits ?? 0;
    const existing = acc.find(item => item.source === record.source);
    if (existing) {
      existing.totalFlood += count;
      existing.incidents += 1;
      existing.maxFlood = Math.max(existing.maxFlood, count);
    } else {
      acc.push({
        source: record.source,
        totalFlood: count,
        incidents: 1,
        maxFlood: count,
        avgFlood: count
      });
    }
    return acc;
  }, [] as Array<{source: string, totalFlood: number, incidents: number, maxFlood: number, avgFlood: number}>)
  .map(item => ({
    ...item,
    avgFlood: Math.round(item.totalFlood / item.incidents * 10) / 10
  }))
  .sort((a, b) => b.totalFlood - a.totalFlood)
  .slice(0, 20); // Top 20 sources

  // Get unique priorities for filter
  const priorities = ['all', ...new Set(filteredRecords.map(r => r.priority).filter(Boolean))];

  // Color mapping for priorities
  const getPriorityColor = (priority: string) => {
    return priorityToGreen(priority);
  };

  // Custom tooltip for timeline chart
  const TimelineTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover text-popover-foreground p-4 border rounded-lg shadow-lg max-w-sm">
          <div className="font-semibold text-foreground mb-2">{data.y}</div>
          <div className="space-y-1 text-sm text-muted-foreground">
            <div>
              <span className="font-medium">Peak Window:</span> {new Date(data.peak_window_start || data.x).toLocaleString()} → {new Date(data.peak_window_end || data.x).toLocaleString()}
            </div>
            <div><span className="font-medium">Flood Count:</span> {data.flood_count ?? data.hits ?? 0}</div>
            {typeof data.hits === 'number' && (
              <div><span className="font-medium">Hits (10-min):</span> {data.hits} {typeof data.threshold === 'number' ? `(Threshold: ${data.threshold})` : ''}</div>
            )}
            {typeof data.over_by === 'number' && (
              <div><span className="font-medium">Over by:</span> {data.over_by} {typeof data.threshold === 'number' ? `(${((data.over_by/data.threshold)*100).toFixed(1)}%)` : ''}</div>
            )}
            {typeof data.rate_per_min === 'number' && (
              <div><span className="font-medium">Rate:</span> {data.rate_per_min}/min</div>
            )}
            <div><span className="font-medium">Priority:</span> 
              <Badge variant="outline" className="ml-1" style={{borderColor: getPriorityColor(data.priority)}}>
                {data.priority}
              </Badge>
            </div>
            <div><span className="font-medium">Location:</span> {data.location_tag}</div>
            <div><span className="font-medium">Condition:</span> {data.condition}</div>
            {data.description !== 'No description' && (
              <div><span className="font-medium">Description:</span> {data.description}</div>
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p>Loading unhealthy sources...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show empty state when no data is found
  if (!loading && !error && (!data || data.count === 0 || filteredRecords.length === 0)) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Unhealthy Sources Timeline
              </CardTitle>
              <CardDescription>
                No unhealthy sources found in the selected time range • All systems healthy!
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
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-24">
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
              <Button variant="outline" size="sm" onClick={fetchUnhealthySources}>
                <Clock className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="bg-accent p-4 rounded-full mb-4">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">All Systems Healthy!</h3>
            <p className="text-muted-foreground mb-4">
              No sources are exceeding the 10 alarms per 10-minute threshold in the selected time range.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTimeRange('7d')}>
                Try 7 Days
              </Button>
              <Button variant="outline" onClick={fetchUnhealthySources}>
                Refresh Data
              </Button>
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
            <p>{error}</p>
            <Button onClick={fetchUnhealthySources} className="mt-2" variant="outline">
              Retry
            </Button>
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
              <Zap className="h-5 w-5 text-primary" />
              Unhealthy Sources Timeline
            </CardTitle>
            <CardDescription>
              Sources exceeding 10 alarms per 10-minute window • {filteredRecords.length} incidents found
              {data && data.count === 0 && (
                <span className="text-success ml-2">• All systems healthy!</span>
              )}
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
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-24">
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
            <Button variant="outline" size="sm" onClick={fetchUnhealthySources}>
              <Clock className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4 p-3 bg-accent rounded-lg">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Select value={selectedPriority} onValueChange={setSelectedPriority}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                {priorities.map(priority => (
                  <SelectItem key={priority} value={priority}>
                    {priority === 'all' ? 'All Priorities' : priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Window Mode Tabs (quick toggle) */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Window:</span>
              <Tabs value={windowMode} onValueChange={(v) => setWindowMode(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="recent">Most Recent</TabsTrigger>
                  <TabsTrigger value="peak">Peak</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-muted-foreground">Chart Type:</span>
              <Tabs value={chartType} onValueChange={(value) => setChartType(value as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="bar">Top Sources</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="ml-4 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Orientation:</span>
                <Tabs value={orientation} onValueChange={(value) => setOrientation(value as any)}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="horizontal">Time →</TabsTrigger>
                    <TabsTrigger value="vertical">Time ↑</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </div>

          {/* Charts */}
          <Tabs value={chartType} onValueChange={(value) => setChartType(value as any)}>
            <TabsContent value="timeline" className="space-y-4">
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  {orientation === 'horizontal' ? (
                    <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 120 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(value) => new Date(value).toLocaleString()}
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        type="category"
                        dataKey="y"
                        width={110}
                        tick={{ fontSize: 12 }}
                      />
                      <ZAxis dataKey="flood_count" range={[60, 300]} />
                      <Tooltip content={<TimelineTooltip />} />
                      <Scatter data={timelineData}>
                        {timelineData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getPriorityColor(entry.priority)} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  ) : (
                    <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 120 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis
                        type="category"
                        dataKey="y"
                        tick={{ fontSize: 11 }}
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        type="number"
                        dataKey="x"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(value) => new Date(value).toLocaleString()}
                        width={150}
                      />
                      <ZAxis dataKey="flood_count" range={[60, 300]} />
                      <Tooltip content={<TimelineTooltip />} />
                      <Scatter data={timelineData}>
                        {timelineData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getPriorityColor(entry.priority)} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="text-sm text-muted-foreground bg-accent p-3 rounded-lg">
                <div className="font-medium mb-1">How to read this chart:</div>
                <ul className="space-y-1">
                  <li>• <strong>X-axis:</strong> Peak window start time</li>
                  <li>• <strong>Y-axis:</strong> Source names (alarm sources)</li>
                  <li>• <strong>Dot size:</strong> Flood count (larger = more events in peak window)</li>
                  <li>• <strong>Dot color:</strong> Priority level (Dark green = High, Base green = Medium, Light green = Low)</li>
                  <li>• <strong>Hover:</strong> Shows peak window (start → end) and details</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="bar" className="space-y-4">
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceHitsData} margin={{ top: 20, right: 30, bottom: 60, left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis 
                      dataKey="source"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => [value, name === 'totalFlood' ? 'Total Flood Count' : name]}
                      labelFormatter={(label) => `Source: ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="totalFlood" fill={CHART_GREEN_DARK} name="Total Flood Count" />
                    <Bar dataKey="incidents" fill={CHART_GREEN_LIGHT} name="Incidents" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-sm text-muted-foreground bg-accent p-3 rounded-lg">
                <div className="font-medium mb-1">Top unhealthy sources by total flood count:</div>
                <ul className="space-y-1">
                  <li>• <strong>Dark green bars:</strong> Total flood count across all incidents</li>
                  <li>• <strong>Light green bars:</strong> Number of separate 10-minute incidents</li>
                  <li>• Sources are ranked by total flood count (most problematic first)</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="p-3 rounded-lg" style={{backgroundColor: CHART_GREEN_PALE}}>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>Total Incidents</div>
              <div className="text-2xl font-bold" style={{color: CHART_GREEN_DARK}}>{filteredRecords.length}</div>
            </div>
            <div className="p-3 rounded-lg" style={{backgroundColor: CHART_GREEN_PALE}}>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>Unique Sources</div>
              <div className="text-2xl font-bold" style={{color: CHART_GREEN_DARK}}>
                {new Set(filteredRecords.map(r => r.source)).size}
              </div>
            </div>
            <div className="p-3 rounded-lg" style={{backgroundColor: CHART_GREEN_PALE}}>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>Total Flood Count</div>
              <div className="text-2xl font-bold" style={{color: CHART_GREEN_DARK}}>
                {filteredRecords.reduce((sum, r: any) => sum + (r.flood_count ?? r.hits ?? 0), 0)}
              </div>
            </div>
            <div className="p-3 rounded-lg" style={{backgroundColor: CHART_GREEN_PALE}}>
              <div className="font-semibold" style={{color: CHART_GREEN_DARK}}>Avg Flood/Incident</div>
              <div className="text-2xl font-bold" style={{color: CHART_GREEN_DARK}}>
                {filteredRecords.length > 0 
                  ? Math.round(
                      filteredRecords.reduce((sum, r: any) => sum + (r.flood_count ?? r.hits ?? 0), 0) / filteredRecords.length * 10
                    ) / 10
                  : 0
                }
              </div>
            </div>
          </div>

          {/* Debug Information - Remove in production */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 p-3 bg-accent rounded-lg text-xs text-muted-foreground">
              <div className="font-semibold mb-2">Debug Info:</div>
              <div>API Response Count: {data?.count || 'N/A'}</div>
              <div>Raw Records Length: {data?.records?.length || 0}</div>
              <div>Filtered Records Length: {filteredRecords.length}</div>
              <div>Selected Priority: {selectedPriority}</div>
              <div>Time Range: {timeRange}</div>
              <div>Selected Month: {selectedMonth}</div>
              <div>Window Mode: {windowMode}</div>
              <div>Loading: {loading.toString()}</div>
              <div>Error: {error || 'None'}</div>
              {data?.records?.length > 0 && (
                <div className="mt-2">
                  <div>Sample Record:</div>
                  <pre className="text-xs bg-card p-2 rounded mt-1 overflow-auto">
                    {JSON.stringify(data.records[0], null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default UnhealthySourcesChart;
