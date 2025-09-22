import React, { useEffect, useMemo, useRef, useState } from 'react';
import WordCloud from 'react-d3-cloud';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, RefreshCw, Type, Info, TrendingUp } from 'lucide-react';
import { priorityToGreen, CHART_GREEN_PALE } from '@/theme/chartColors';

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

// Professional weighting: 30% bins (frequency), 70% flood (severity) as per Python implementation
const DEFAULT_BINS_WEIGHT = 0.3;
const DEFAULT_FLOOD_WEIGHT = 0.7;

function getWindowMs(tr: string) {
  switch (tr) {
    case 'all': return null as unknown as number;
    case '1h': return 1 * 60 * 60 * 1000;
    case '6h': return 6 * 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

// Clean and normalize actual alarm source names
function normalizeSourceName(raw: string) {
  let s = raw || 'Unknown';
  if (s.includes('.csv')) s = s.replace('.csv', '');
  if (s.includes('/') || s.includes('\\')) {
    const parts = s.split(/[\\/]/);
    s = parts[parts.length - 1];
  }
  return s;
}

const UnhealthySourcesWordCloud: React.FC<{ className?: string }> = ({ className }) => {
  const [data, setData] = useState<UnhealthySourcesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string>('1h');
  const [selectedMonth, setSelectedMonth] = useState<string>('2025-01');
  const [availableMonths, setAvailableMonths] = useState<Array<{ value: string; label: string; start: Date; end: Date }>>([]);
  const [windowMode, setWindowMode] = useState<'recent' | 'peak'>('peak');
  const [binsWeight, setBinsWeight] = useState<number>(DEFAULT_BINS_WEIGHT);
  const [floodWeight, setFloodWeight] = useState<number>(DEFAULT_FLOOD_WEIGHT);
  const [topLimit, setTopLimit] = useState<number>(100); // Show more sources by default

  useEffect(() => {
    loadAvailableMonths();
  }, []);

  useEffect(() => {
    fetchData();
  }, [timeRange, selectedMonth, windowMode]);

  const loadAvailableMonths = async () => {
    try {
      const { fetchUnhealthySources } = await import('../api/plantHealth');
      const res = await fetchUnhealthySources();
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
      console.warn('Failed to load months for word cloud', e);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const { fetchUnhealthySources } = await import('../api/plantHealth');

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

      setData(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  // Professional word cloud processing with proper weighting
  const { words, topStats, weightingInfo } = useMemo(() => {
    const records: UnhealthyRecord[] = (data?.records || []) as any;
    const bySource = new Map<string, { 
      source: string; 
      bins: number; 
      floodTotal: number; 
      maxFlood: number; 
      latest: UnhealthyRecord; 
      priority: string;
      weightedSize: number;
    }>();

    // Process records to aggregate by source
    for (const rec of records) {
      const src = normalizeSourceName(rec.source);
      const flood = (rec as any).flood_count ?? rec.hits ?? 0;
      const ex = bySource.get(src);
      if (ex) {
        ex.bins += 1;
        ex.floodTotal += flood;
        ex.maxFlood = Math.max(ex.maxFlood, flood);
        const recTs = new Date((rec as any).peak_window_start || rec.event_time).getTime();
        const exTs = new Date((ex.latest as any).peak_window_start || ex.latest.event_time).getTime();
        if (recTs > exTs) ex.latest = rec;
      } else {
        bySource.set(src, {
          source: src,
          bins: 1,
          floodTotal: flood,
          maxFlood: flood,
          latest: rec,
          priority: rec.priority || 'Medium',
          weightedSize: 0, // Will be calculated below
        });
      }
    }

    const arr = Array.from(bySource.values());
    
    // Filter out healthy sources (no unhealthy bins)
    const unhealthyArr = arr.filter(x => x.bins > 0);
    
    if (unhealthyArr.length === 0) {
      return { words: [], topStats: { totalSources: 0, displayed: 0, totalBins: 0, totalFlood: 0 }, weightingInfo: { maxWeighted: 0, avgWeighted: 0 } };
    }

    // Calculate professional weighted sizes (30% bins frequency + 70% flood severity)
    unhealthyArr.forEach(x => {
      x.weightedSize = (binsWeight * x.bins) + (floodWeight * x.floodTotal);
    });

    // Normalize frequencies to 1-100 range for professional scaling
    const maxWeighted = Math.max(...unhealthyArr.map(x => x.weightedSize));
    const normalizedSources = unhealthyArr.map(x => ({
      ...x,
      normalizedSize: maxWeighted > 0 ? (x.weightedSize / maxWeighted) * 100 : 1
    }));

    // Enhanced font size mapping for better visibility of all sources
    const sized = normalizedSources.map((x, index) => {
      let fontSize;
      
      if (normalizedSources.length <= 10) {
        // Few sources: use wider range
        const linearScale = x.normalizedSize / 100;
        fontSize = 20 + (linearScale * 50); // 20-70px
      } else {
        // Many sources: ensure smaller ones are visible
        const sqrtScale = Math.sqrt(x.normalizedSize / 100);
        // Minimum 16px for readability, maximum 75px
        fontSize = 16 + (sqrtScale * 59); // 16-75px range
        
        // Boost smaller sources slightly
        if (x.normalizedSize < 20) {
          fontSize = Math.max(fontSize, 18); // Minimum 18px for small sources
        }
      }
      
      return {
        text: x.source,
        value: Math.max(16, Math.min(75, fontSize)),
        weightedSize: x.weightedSize,
        normalizedSize: x.normalizedSize,
        bins: x.bins,
        floodTotal: x.floodTotal,
        maxFlood: x.maxFlood,
        latest: x.latest,
        priority: x.priority,
      };
    })
    .sort((a, b) => b.weightedSize - a.weightedSize)
    .slice(0, topLimit);

    const stats = {
      totalSources: unhealthyArr.length,
      displayed: sized.length,
      totalBins: unhealthyArr.reduce((s, x) => s + x.bins, 0),
      totalFlood: unhealthyArr.reduce((s, x) => s + x.floodTotal, 0),
    };

    const weightInfo = {
      maxWeighted: maxWeighted,
      avgWeighted: unhealthyArr.reduce((s, x) => s + x.weightedSize, 0) / unhealthyArr.length
    };

    // Debug logging to understand the data
    console.log('Debug - Word Cloud Data:', {
      totalRecords: records.length,
      totalSources: arr.length,
      unhealthySources: unhealthyArr.length,
      maxWeighted,
      sampleSources: unhealthyArr.slice(0, 10).map(x => ({
        source: x.source,
        bins: x.bins,
        floodTotal: x.floodTotal,
        weightedSize: x.weightedSize,
        normalizedSize: maxWeighted > 0 ? (x.weightedSize / maxWeighted) * 100 : 1
      })),
      finalWords: sized.slice(0, 10).map(x => ({
        text: x.text,
        value: x.value,
        weightedSize: x.weightedSize,
        normalizedSize: x.normalizedSize
      }))
    });

    return { words: sized, topStats: stats, weightingInfo: weightInfo };
  }, [data, binsWeight, floodWeight, topLimit]);

  const fontMapper = (word: any) => word.value;
  
  // Professional rotation strategy: mostly horizontal for readability with some variety
  const rotate = () => {
    const rotations = [0, 0, 0, 0, 0, 90, -90]; // 70% horizontal, 30% vertical
    return rotations[Math.floor(Math.random() * rotations.length)];
  };
  
  // Professional color scheme based on severity
  const fill = (word: any) => {
    const severity = word.normalizedSize;
    if (severity >= 80) return '#dc2626'; // High severity - red
    if (severity >= 60) return '#ea580c'; // Medium-high - orange
    if (severity >= 40) return '#d97706'; // Medium - amber
    if (severity >= 20) return '#65a30d'; // Low-medium - lime
    return '#16a34a'; // Low severity - green
  };

  // Responsive container width handling for the cloud
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width) setContainerWidth(Math.max(300, Math.floor(rect.width)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
            <p>Building word cloud…</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center text-red-600">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p className="mb-2">{error}</p>
            <Button onClick={fetchData} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || words.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5 text-green-600" />
            Unhealthy Sources Word Cloud
          </CardTitle>
          <CardDescription>
            No unhealthy sources found • All systems healthy in selected window
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
            </div>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-32 flex items-center justify-center text-sm text-gray-600 mt-4">
            Try expanding the time range or switching to All months.
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
              <Type className="h-5 w-5 text-green-600" />
              Unhealthy Sources Word Cloud
            </CardTitle>
            <CardDescription>
              Professional Risk Assessment: Size = 30% Frequency + 70% Severity. Showing Top {words.length} / {topStats.totalSources} unhealthy sources.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
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
            <Select value={String(topLimit)} onValueChange={(v) => setTopLimit(parseInt(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">Top 25</SelectItem>
                <SelectItem value="50">Top 50</SelectItem>
                <SelectItem value="100">Top 100</SelectItem>
                <SelectItem value="200">Top 200</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Word Cloud */}
          <div ref={containerRef} className="lg:col-span-3 h-[500px] rounded-lg border-2 shadow-lg" style={{ backgroundColor: '#fafafa' }}>
            <div className="h-full w-full p-4">
              <TooltipProvider>
                <WordCloud
                  data={words}
                  fontSize={fontMapper}
                  rotate={rotate}
                  padding={3}
                  spiral="archimedean"
                  height={460}
                  width={containerWidth - 32}
                  fill={fill}
                  fontWeight="600"
                  fontFamily="Arial, sans-serif"
                  random={() => 0.5}
                  onWordClick={(event, word) => {
                    console.log('Clicked word:', word);
                  }}
                />
              </TooltipProvider>
            </div>
          </div>
          
          {/* Professional Controls & Stats */}
          <div className="lg:col-span-1 space-y-4">
            {/* Weighting Controls */}
            <Card className="shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Risk Weighting
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-xs text-gray-600 mb-2">Frequency Weight: {Math.round(binsWeight * 100)}%</div>
                  <Slider
                    value={[Math.round(binsWeight * 100)]}
                    onValueChange={(v) => {
                      const newBins = (v[0] || 30) / 100;
                      setBinsWeight(newBins);
                      setFloodWeight(1 - newBins);
                    }}
                    min={10}
                    max={90}
                    step={5}
                    className="mb-2"
                  />
                  <div className="text-xs text-gray-500">
                    Frequency: {Math.round(binsWeight * 100)}% • Severity: {Math.round(floodWeight * 100)}%
                  </div>
                </div>
                
                <div>
                  <div className="text-xs text-gray-600 mb-2">Display Limit</div>
                  <Select value={String(topLimit)} onValueChange={(v) => setTopLimit(parseInt(v))}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">Top 50</SelectItem>
                      <SelectItem value="100">Top 100</SelectItem>
                      <SelectItem value="200">Top 200</SelectItem>
                      <SelectItem value="500">Top 500</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card className="shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Analytics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500">Total Sources</div>
                    <div className="font-semibold">{topStats.totalSources}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Displayed</div>
                    <div className="font-semibold">{words.length}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Total Bins</div>
                    <div className="font-semibold">{topStats.totalBins}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Total Flood</div>
                    <div className="font-semibold">{topStats.totalFlood}</div>
                  </div>
                </div>
                
                {weightingInfo && (
                  <div className="pt-2 border-t">
                    <div className="text-xs text-gray-500 mb-1">Risk Metrics</div>
                    <div className="text-xs">
                      <div>Max Risk Score: {weightingInfo.maxWeighted.toFixed(1)}</div>
                      <div>Avg Risk Score: {weightingInfo.avgWeighted.toFixed(1)}</div>
                    </div>
                  </div>
                )}
                
                {/* Debug Info */}
                <div className="pt-2 border-t">
                  <div className="text-xs text-gray-500 mb-1">Debug Info</div>
                  <div className="text-xs">
                    <div>Font Range: {words.length > 0 ? `${Math.min(...words.map(w => w.value)).toFixed(0)}-${Math.max(...words.map(w => w.value)).toFixed(0)}px` : 'N/A'}</div>
                    <div>Size Range: {words.length > 0 ? `${Math.min(...words.map(w => w.normalizedSize)).toFixed(1)}-${Math.max(...words.map(w => w.normalizedSize)).toFixed(1)}%` : 'N/A'}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Color Legend */}
            <Card className="shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Severity Scale</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#dc2626' }}></div>
                    <span>Critical (80-100%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ea580c' }}></div>
                    <span>High (60-79%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#d97706' }}></div>
                    <span>Medium (40-59%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#65a30d' }}></div>
                    <span>Low (20-39%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#16a34a' }}></div>
                    <span>Minimal (0-19%)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UnhealthySourcesWordCloud;
