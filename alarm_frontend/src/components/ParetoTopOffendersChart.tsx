import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, LineChart as LineChartIcon, RefreshCw } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CHART_GREEN_DARK, CHART_GREEN_LIGHT, CHART_GREEN_PALE, CHART_WARNING } from '@/theme/chartColors';
import { InsightButton } from '@/components/insights/InsightButton';
import { useInsightModal } from '@/components/insights/useInsightModal';

// API
import { fetchUnhealthySources } from '@/api/plantHealth';

// Types
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
  flood_count?: number;
  peak_window_start?: string;
  peak_window_end?: string;
}

interface ParetoItem {
  source: string;
  totalFlood: number;
  incidents: number;
  sharePct: number; // individual share of total
  cumulativePct: number; // cumulative share
  latestTs: number;
  topSources?: Array<{ name: string; count: number }>; // only in plant-wide mode
  distinctSources?: number; // how many unique sources contributed (plant-wide)
}

const DEFAULT_MONTH = 'all';

// Meta/system classifier (keep aligned with other charts)
const isMetaSource = (name: string) => {
  const s = String(name || '').trim().toUpperCase();
  if (!s) return false;
  return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
};

const ParetoTopOffendersChart: React.FC<{ className?: string; plantId?: string; includeSystem?: boolean; mode?: 'perSource' | 'flood' }> = ({ className, plantId = 'pvcI', includeSystem = true, mode = 'perSource' }) => {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [records, setRecords] = React.useState<UnhealthyRecord[]>([]);
  const { onOpen: openInsightModal } = useInsightModal();
  const plantLabel = plantId === 'pvcI' ? 'PVC-I' : (plantId === 'pvcII' ? 'PVC-II' : plantId.toUpperCase());

  // Controls (aligned with other charts)
  const [selectedMonth, setSelectedMonth] = React.useState<string>(DEFAULT_MONTH); // 'all' or 'YYYY-MM'
  const [availableMonths, setAvailableMonths] = React.useState<Array<{ value: string; label: string; start: Date; end: Date }>>([]);
  const [timeRange, setTimeRange] = React.useState<string>('all'); // all default
  const [windowMode, setWindowMode] = React.useState<'recent' | 'peak'>('peak');
  const [topLimit, setTopLimit] = React.useState<number>(10); // Top 10
  const [metricMode, setMetricMode] = React.useState<'flood' | 'exceedance'>('flood');
  // Derived: plant-wide mode only when global mode is 'flood' for PVC-I
  const isPlantWide = mode === 'flood' && plantId === 'pvcI';
  // Drill-down: when set, show per-source Pareto for this location only
  const [drillLocation, setDrillLocation] = React.useState<string | null>(null);

  React.useEffect(() => {
    loadAvailableMonths();
  }, [plantId]);

  React.useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, timeRange, windowMode, plantId]);

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

  async function loadAvailableMonths() {
    try {
      const res = await fetchUnhealthySources(undefined, undefined, '10T', 10, plantId);
      const recs: any[] = Array.isArray(res?.records) ? res.records : [];
      const monthMap = new Map<string, { start: Date; end: Date }>();
      for (const r of recs) {
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
      console.warn('Failed to load months for Pareto chart', e);
    }
  }

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      const windowMs = getWindowMs(timeRange);
      let result: any = null;

      if (selectedMonth === 'all') {
        if (timeRange === 'all') {
          result = await fetchUnhealthySources(undefined, undefined, '10T', 10, plantId);
        } else {
          const full = await fetchUnhealthySources(undefined, undefined, '10T', 10, plantId);
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
            result = await fetchUnhealthySources(start.toISOString(), end.toISOString(), '10T', 10, plantId);
          }
        }
      } else {
        const month = availableMonths.find(m => m.value === selectedMonth);
        const monthStart = month?.start || new Date(`${selectedMonth}-01T00:00:00Z`);
        const monthEnd = month?.end || new Date(new Date(`${selectedMonth}-01T00:00:00Z`).getTime() + 32*24*60*60*1000);

        if (timeRange === 'all') {
          result = await fetchUnhealthySources(monthStart.toISOString(), monthEnd.toISOString(), '10T', 10, plantId);
        } else {
          const monthFull = await fetchUnhealthySources(monthStart.toISOString(), monthEnd.toISOString(), '10T', 10, plantId);
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
            result = await fetchUnhealthySources(start.toISOString(), end.toISOString(), '10T', 10, plantId);
          }
        }
      }

      const recs: UnhealthyRecord[] = Array.isArray(result?.records) ? result.records : [];
      setRecords(recs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load Pareto data';
      setError(msg);
      console.error('Pareto fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Helpers for plant-wide grouping
  const normalizeLocation = (loc?: string): string => {
    const s = String(loc ?? '').trim();
    if (!s) return 'Unknown Location';
    const lower = s.toLowerCase();
    if (lower === 'unknown' || lower === 'not provided' || lower === 'n/a' || lower === 'na') return 'Unknown Location';
    return s;
  };

  // We keep grouping fixed to Location for plant-wide mode (no in-chart toggle)

  // Group and compute Pareto for selected metric
  const paretoData: ParetoItem[] = React.useMemo(() => {
    if (!records || records.length === 0) return [];

    // Apply Include System filter
    let base = includeSystem ? records : records.filter(r => !isMetaSource(r.source));
    // If drilling, filter to selected location
    if (drillLocation) {
      base = base.filter(r => normalizeLocation((r as any).location_tag) === drillLocation);
    }

    const map = new Map<string, { total: number; incidents: number; latestTs: number; bySource?: Map<string, number> }>();

    for (const r of base) {
      // Determine grouping key based on global mode
      let key: string;
      if (isPlantWide && !drillLocation) {
        key = normalizeLocation((r as any).location_tag);
      } else {
        const srcRaw = r.source || 'Unknown';
        let src = srcRaw;
        if (src.includes('.csv')) src = src.replace('.csv', '');
        if (src.includes('/') || src.includes('\\')) {
          const parts = src.split(/[\\/]/);
          src = parts[parts.length - 1];
        }
        key = src;
      }

      const count = (r.flood_count ?? r.hits ?? 0) as number;
      const threshold = typeof r.threshold === 'number' ? r.threshold : 10;
      const exceed = Math.max(0, count - threshold);

      // Choose metric per mode
      const contribution = metricMode === 'exceedance' ? exceed : count;
      // Skip non-unhealthy windows per rules
      // In plant-wide (location) aggregation, we keep record-level thresholding to avoid noise.
      // In drill (per-source) view, we aggregate first and later filter sources with total >= threshold.
      if (metricMode === 'exceedance' && contribution <= 0) continue;
      if (metricMode === 'flood' && (isPlantWide && !drillLocation) && count < threshold) continue;

      const ts = new Date(r.peak_window_start || r.event_time || (r as any).bin_end).getTime();

      const existing = map.get(key);
      if (existing) {
        existing.total += contribution;
        if (metricMode === 'flood' || contribution > 0) existing.incidents += 1;
        existing.latestTs = Math.max(existing.latestTs, ts);
      } else {
        map.set(key, { total: contribution, incidents: (metricMode === 'flood' || contribution > 0) ? 1 : 0, latestTs: ts, bySource: (isPlantWide || drillLocation) ? new Map() : undefined });
      }
      // Track contributing sources for plant-wide or drill views
      if (isPlantWide || drillLocation) {
        const grp = map.get(key)!;
        const srcNameRaw = String(r.source || 'Unknown');
        // Normalize same as per-source keying
        let srcName = srcNameRaw;
        if (srcName.includes('.csv')) srcName = srcName.replace('.csv', '');
        if (srcName.includes('/') || srcName.includes('\\')) {
          const parts = srcName.split(/[\\/]/);
          srcName = parts[parts.length - 1];
        }
        const prev = grp.bySource?.get(srcName) ?? 0;
        grp.bySource?.set(srcName, prev + contribution);
      }
    }

    // Convert and sort all groups
    let all = Array.from(map.entries()).map(([source, v]) => {
      // Build top sources list (Top 3) and distinct count
      let topSources: Array<{ name: string; count: number }> | undefined = undefined;
      let distinctSources: number | undefined = undefined;
      if ((isPlantWide || drillLocation) && v.bySource && v.bySource.size > 0) {
        const sorted = Array.from(v.bySource.entries()).sort((a, b) => b[1] - a[1]);
        topSources = sorted.slice(0, 3).map(([name, count]) => ({ name, count }));
        distinctSources = sorted.length;
      }
      return {
        source,
        totalFlood: v.total,
        incidents: v.incidents,
        sharePct: 0,
        cumulativePct: 0,
        latestTs: v.latestTs,
        topSources,
        distinctSources,
      } as ParetoItem;
    }).sort((a, b) => b.totalFlood - a.totalFlood);

    // In drill (per-source) view, apply unhealthy filter on the aggregated source totals
    if (drillLocation) {
      all = all.filter(i => i.totalFlood >= 10);
    }

    // Split into top N and remainder; build an Others bucket if remainder sum ≥ 10
    const top = all.slice(0, topLimit);
    const remainder = all.slice(topLimit);
    const othersSum = remainder.reduce((s, i) => s + i.totalFlood, 0);
    const withOthers = othersSum >= 10 ? [...top, { source: 'Others', totalFlood: othersSum, incidents: remainder.reduce((s, i) => s + i.incidents, 0), sharePct: 0, cumulativePct: 0, latestTs: remainder.reduce((m, i) => Math.max(m, i.latestTs), 0) } as ParetoItem] : top;

    const total = (withOthers.reduce((s, i) => s + i.totalFlood, 0)) || 1;
    let cum = 0;
    for (const it of withOthers) {
      it.sharePct = +(it.totalFlood / total * 100).toFixed(1);
      cum += it.totalFlood;
      it.cumulativePct = +(cum / total * 100).toFixed(1);
    }
    return withOthers;
  }, [records, topLimit, metricMode, includeSystem, isPlantWide, drillLocation]);

  const totalFloodCount = React.useMemo(() => paretoData.reduce((s, i) => s + i.totalFlood, 0), [paretoData]);

  // Index where cumulative crosses 80%
  const vitalFewIndex = React.useMemo(() => {
    const idx = paretoData.findIndex(p => p.cumulativePct >= 80);
    return idx === -1 ? paretoData.length - 1 : idx;
  }, [paretoData]);

  // AI Insight: build payload representing top offenders
  const handleInsightClick = () => {
    const payload = paretoData.map(p => ({
      source: p.source,
      flood_count: p.totalFlood,
    }));
    const title = `Top Offenders • Pareto — ${plantLabel} — ${selectedMonth} — ${timeRange} — ${windowMode} — Top ${topLimit} — Metric:${metricMode}`;
    openInsightModal(payload, title);
  };

  // Tooltip renderer
  const formatTooltip = (value: any, name: any, info: any) => {
    const dataKey = info?.dataKey;
    const p = info?.payload as ParetoItem;
    if (!p) return null;
    if (dataKey === 'totalFlood') {
      const showTop = Boolean(isPlantWide && !drillLocation && p.topSources && p.topSources.length > 0 && p.source !== 'Others');
      return [
        <div key="flood" className="bg-popover text-popover-foreground p-3 rounded border shadow-lg min-w-[240px] max-w-[360px]">
          <div className="font-semibold text-foreground mb-1">{p.source}</div>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>{metricMode === 'exceedance' ? 'Exceedance (over threshold)' : 'Flood count'}: <span className="text-foreground font-medium">{p.totalFlood.toLocaleString()}</span></div>
            <div>Share of total: <span className="text-foreground font-medium">{p.sharePct}%</span></div>
            <div>Cumulative: <span className="text-foreground font-medium">{p.cumulativePct}%</span></div>
            <div>Frequency: <span className="text-foreground font-medium">{p.incidents}</span></div>
            <div>Latest: <span className="text-foreground font-medium">{new Date(p.latestTs).toLocaleString()}</span></div>
            {showTop && (
              <div className="pt-2 border-t mt-2">
                <div className="font-medium text-foreground mb-1">Top sources</div>
                <ul className="space-y-1">
                  {p.topSources!.map((s, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span className="truncate max-w-[220px]" title={s.name}>{s.name}</span>
                      <span className="text-foreground font-medium ml-3">{s.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                {typeof p.distinctSources === 'number' && p.topSources && p.distinctSources > p.topSources.length && (
                  <div className="text-xs text-muted-foreground mt-1">+{p.distinctSources - p.topSources.length} more</div>
                )}
                <div className="mt-2 flex justify-end">
                  <button
                    className="text-xs px-2 py-1 rounded border hover:bg-accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      const list = (p.topSources || []).map((s, i) => `${i + 1}. ${s.name} (${s.count})`).join('\n');
                      const extra = typeof p.distinctSources === 'number' && p.topSources && p.distinctSources > p.topSources.length
                        ? `\n+${p.distinctSources - p.topSources.length} more` : '';
                      const text = `Location: ${p.source}\nTop sources (Top 3)\n${list}${extra}`;
                      try { navigator.clipboard?.writeText(text); } catch {}
                    }}
                    title="Copy top sources"
                  >Copy</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ];
    }
    if (dataKey === 'cumulativePct') {
      return [`${p.cumulativePct}%`, 'Cumulative %'];
    }
    return [value, name];
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p>Loading Pareto analysis...</p>
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

  const isEmpty = paretoData.length === 0;

  if (isEmpty) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LineChartIcon className="h-5 w-5 text-primary" />
                Top Offenders • Pareto Analysis
              </CardTitle>
              <CardDescription>
                {drillLocation
                  ? <>No unhealthy sources (≥10) in <span className="font-medium text-foreground">{drillLocation}</span> for the selected window</>
                  : 'No data in the selected window'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {drillLocation && (
                <Button variant="secondary" size="sm" onClick={() => setDrillLocation(null)} title="Clear drill-down">
                  Clear • {drillLocation}
                </Button>
              )}
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-muted-foreground">All systems within limits.</div>
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
              <LineChartIcon className="h-5 w-5 text-primary" />
              Top Offenders • Pareto Analysis
            </CardTitle>
            <CardDescription>
              {drillLocation ? (
                <>Per‑source in <span className="font-medium text-foreground">{drillLocation}</span> • Top {paretoData.length} sources by {metricMode === 'exceedance' ? 'unhealthy exceedance' : 'flood count'} • Total {metricMode === 'exceedance' ? 'Exceedance' : 'Flood'}: {totalFloodCount.toLocaleString()}</>
              ) : (
                <>Top {paretoData.length} {isPlantWide ? 'locations' : 'sources'} by {metricMode === 'exceedance' ? 'unhealthy exceedance' : 'flood count'} • Total {metricMode === 'exceedance' ? 'Exceedance' : 'Flood'}: {totalFloodCount.toLocaleString()}</>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {drillLocation && (
              <Button variant="secondary" size="sm" onClick={() => setDrillLocation(null)} title="Clear drill-down">
                Clear • {drillLocation}
              </Button>
            )}
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
            <Select value={metricMode} onValueChange={(v) => setMetricMode(v as any)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Metric" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flood">Flood Count</SelectItem>
                <SelectItem value="exceedance">Exceedance (over 10)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(topLimit)} onValueChange={(v) => setTopLimit(parseInt(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
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
            <InsightButton onClick={handleInsightClick} disabled={loading || paretoData.length === 0} />
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={paretoData}
              margin={{ top: 20, right: 20, left: 60, bottom: 100 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis 
                dataKey="source"
                angle={-45}
                textAnchor="end"
                height={90}
                tick={{ fontSize: 11 }}
                interval={0}
                tickFormatter={(v) => v && v.length > 16 ? `${v.slice(0, 13)}...` : v}
              />
              <YAxis 
                yAxisId="left"
                label={{ value: metricMode === 'exceedance' ? 'Exceedance (over threshold)' : 'Flood Count', angle: -90, position: 'left', offset: 0 }}
                tick={{ fontSize: 12 }}
                tickMargin={8}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                label={{ value: 'Cumulative %', angle: 90, position: 'right', offset: 0 }}
                tickMargin={8}
              />
              <Tooltip 
                formatter={formatTooltip as any}
                cursor={{ fill: 'var(--accent)', opacity: 0.08 }}
                contentStyle={{
                  background: 'var(--chart-tooltip-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  boxShadow: 'var(--shadow-xl)',
                  borderRadius: '0.5rem',
                }}
                labelStyle={{ color: 'var(--muted-foreground)' }}
                itemStyle={{ color: 'var(--foreground)' }}
                wrapperStyle={{ outline: 'none' }}
              />
              <Legend />

              {/* 80% reference line on percentage axis */}
              <ReferenceLine 
                yAxisId="right"
                y={80}
                stroke={CHART_WARNING}
                strokeDasharray="6 6"
                isFront
                label={{ value: '80% Line', position: 'right', fill: 'var(--muted-foreground)', fontSize: 11 }}
              />

              // Set a base fill so Legend renders the correct color (cells still override per bar)
              <Bar dataKey="totalFlood" name={metricMode === 'exceedance' ? 'Exceedance' : 'Flood Count'} yAxisId="left" radius={[4,4,0,0]} maxBarSize={60} fill={CHART_GREEN_DARK}>
                {paretoData.map((entry, idx) => (
                  <Cell
                    key={`bar-${idx}`}
                    fill={idx <= vitalFewIndex ? CHART_GREEN_DARK : CHART_GREEN_LIGHT}
                    opacity={idx <= vitalFewIndex ? 0.95 : 0.7}
                    onClick={() => {
                      // Drill only from plant-wide view (not already drilled) and non-Others bars
                      if (isPlantWide && !drillLocation && entry.source !== 'Others') {
                        setDrillLocation(entry.source);
                      }
                    }}
                    style={{ cursor: isPlantWide && !drillLocation && entry.source !== 'Others' ? 'pointer' as const : 'default' as const }}
                  />
                ))}
              </Bar>

              <Line 
                type="monotone" 
                dataKey="cumulativePct" 
                name="Cumulative %" 
                yAxisId="right" 
                stroke={CHART_GREEN_LIGHT} 
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Insights */}
        <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: CHART_GREEN_PALE }}>
          <div className="text-sm text-foreground font-medium mb-1">Key Insights</div>
          <ul className="text-sm text-muted-foreground list-disc ml-5">
            <li>Sources contributing to the first 80% are the critical few to address first.</li>
            <li>Focus remediation on the leftmost bars for maximum impact.</li>
            <li>Combine with suppression or tuning strategies for top offenders.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default ParetoTopOffendersChart;
