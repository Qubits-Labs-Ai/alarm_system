import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Filter, PieChart as PieIcon, RefreshCw, X, Download } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Button } from '@/components/ui/button';
import { InsightButton } from '@/components/insights/InsightButton';
import { useInsightModal } from '@/components/insights/useInsightModal';

// We keep colors aligned with the theme tokens
const COLOR_CRITICAL = 'var(--destructive)'; // red
const DEFAULT_MONTH = 'all';
const COLOR_HIGH = 'var(--warning)';        // orange/yellow
const COLOR_MEDIUM = 'hsl(var(--chart-1))'; // primary green-ish
const COLOR_LOW = 'hsl(var(--chart-2))';    // teal-green
const COLOR_UNKNOWN = 'hsl(var(--muted-foreground))';
const COLOR_JCODED = 'hsl(var(--chart-3))'; // distinct accent for J-coded
const COLOR_OTHER = 'hsl(var(--chart-4))';  // for any other raw codes

// API
async function fetchUnhealthy(
  startTime: string | undefined,
  endTime: string | undefined,
  binSize: string,
  alarmThreshold: number,
  plantId: string
): Promise<{ count: number; records: any[] }> {
  const { fetchUnhealthySources } = await import('@/api/plantHealth');
  return fetchUnhealthySources(startTime, endTime, binSize, alarmThreshold, plantId);
}

// Helpers
export type PriorityCategory = 'Critical' | 'High' | 'Medium' | 'Low' | 'J-coded' | 'Not Provided' | 'Other';

// Strict RAW mapping only: no severity fallback. Categorize purely by raw DCS priority code.
function normalizePriority(raw?: string | null, _sev?: string | null): PriorityCategory {
  const s = (raw || '').trim().toUpperCase();
  // Handle explicit or implicit not-provided states
  if (!s || s === 'NOT PROVIDED' || s === 'N' || s === '-') return 'Not Provided';

  const lead = s[0];
  if (lead === 'E' || lead === 'U') return 'Critical';
  if (lead === 'H') return 'High';
  if (lead === 'M') return 'Medium';
  if (lead === 'L') return 'Low';
  if (lead === 'J') return 'J-coded';
  return 'Other';
}

const CATEGORY_ORDER: PriorityCategory[] = ['Critical', 'High', 'Medium', 'Low', 'J-coded', 'Not Provided', 'Other'];
const CATEGORY_COLORS: Record<PriorityCategory, string> = {
  Critical: COLOR_CRITICAL,
  High: COLOR_HIGH,
  Medium: COLOR_MEDIUM,
  Low: COLOR_LOW,
  'J-coded': COLOR_JCODED,
  'Not Provided': COLOR_UNKNOWN,
  Other: COLOR_OTHER,
};

// Rank for tie-breaking on priority (lower is worse)
function categoryRank(cat: PriorityCategory): number {
  switch (cat) {
    case 'Critical': return 0;
    case 'High': return 1;
    case 'Medium': return 2;
    case 'Low': return 3;
    case 'J-coded': return 4;
    case 'Not Provided': return 5;
    default: return 6; // Other
  }
}

// Same month/window logic as UnhealthySourcesChart, defaults: Jan 2025, Peak, 1H
function getWindowMs(tr: string) {
  switch (tr) {
    case 'all': return null as unknown as number;
    case '1h': return 1 * 60 * 60 * 1000;
    case '6h': return 6 * 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    default: return 60 * 60 * 1000;
  }
}

export const PriorityBreakdownDonut: React.FC<{ className?: string; plantId?: string }>= ({ className, plantId = 'pvcI' }) => {
  const [data, setData] = useState<{ count: number; records: any[] } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { onOpen: openInsightModal } = useInsightModal();
  const plantLabel = plantId === 'pvcI' ? 'PVC-I' : (plantId === 'pvcII' ? 'PVC-II' : plantId.toUpperCase());

  const [selectedMonth, setSelectedMonth] = useState<string>(DEFAULT_MONTH);
  const [availableMonths, setAvailableMonths] = useState<Array<{ value: string; label: string; start: Date; end: Date }>>([]);
  const [windowMode, setWindowMode] = useState<'recent' | 'peak'>('peak');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d' | 'all'>('all');
  const [selectedCat, setSelectedCat] = useState<PriorityCategory | null>(null);
  const [detailTab, setDetailTab] = useState<'sources' | 'incidents'>('sources');
  const [aggregation, setAggregation] = useState<'worst' | 'sum'>('worst');

  // load months list once
  useEffect(() => {
    (async () => {
      try {
        const full = await fetchUnhealthy(undefined, undefined, '10T', 10, plantId);
        const records = full?.records || [];
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
        // non-fatal
      }
    })();
  }, [plantId]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const windowMs = getWindowMs(timeRange);

        if (selectedMonth === 'all') {
          if (timeRange === 'all') {
            const res = await fetchUnhealthy(undefined, undefined, '10T', 10, plantId);
            setData(res);
            setLoading(false);
            return;
          }
          // derive anchor from full dataset
          const full = await fetchUnhealthy(undefined, undefined, '10T', 10, plantId);
          const records: any[] = full?.records || [];
          if (!records.length) {
            setData(full);
            setLoading(false);
            return;
          }
          const getTs = (r: any) => {
            const ds = r.peak_window_start || r.event_time || r.bin_start || r.bin_end;
            return ds ? new Date(ds).getTime() : 0;
          };
          const getFlood = (r: any) => (r.flood_count ?? r.hits ?? 0) as number;
          const maxTs = records.reduce((max, r) => Math.max(max, getTs(r)), 0);
          let anchorTs: number;
          if (windowMode === 'peak') {
            let best = records[0];
            for (const rec of records) if (getFlood(rec) > getFlood(best)) best = rec;
            anchorTs = getTs(best) || maxTs;
          } else {
            anchorTs = maxTs;
          }
          const anchorEnd = new Date(anchorTs || Date.now());
          const anchorStart = new Date(Math.max(0, anchorEnd.getTime() - windowMs));
          const res = await fetchUnhealthy(anchorStart.toISOString(), anchorEnd.toISOString(), '10T', 10, plantId);
          setData(res);
          setLoading(false);
          return;
        }

        // specific month
        const month = availableMonths.find(m => m.value === selectedMonth);
        const monthStart = month?.start || new Date(`${selectedMonth}-01T00:00:00Z`);
        const monthEnd = month?.end || new Date(new Date(`${selectedMonth}-01T00:00:00Z`).getTime() + 32 * 24 * 60 * 60 * 1000);

        if (timeRange === 'all') {
          const res = await fetchUnhealthy(monthStart.toISOString(), monthEnd.toISOString(), '10T', 10, plantId);
          setData(res);
          setLoading(false);
          return;
        }

        const monthRes = await fetchUnhealthy(monthStart.toISOString(), monthEnd.toISOString(), '10T', 10, plantId);
        const recs: any[] = monthRes?.records || [];
        if (!recs.length) {
          setData(monthRes);
          setLoading(false);
          return;
        }
        const getTs = (r: any) => {
          const ds = r.peak_window_start || r.event_time || r.bin_start || r.bin_end;
          return ds ? new Date(ds).getTime() : 0;
        };
        const getFlood = (r: any) => (r.flood_count ?? r.hits ?? 0) as number;

        let anchorTs: number;
        if (windowMode === 'peak') {
          let best = recs[0];
          for (const rec of recs) if (getFlood(rec) > getFlood(best)) best = rec;
          anchorTs = getTs(best) || monthEnd.getTime();
        } else {
          anchorTs = recs.reduce((max, r) => Math.max(max, getTs(r)), 0) || monthEnd.getTime();
        }
        let anchorEnd = new Date(Math.min(anchorTs, monthEnd.getTime()));
        let anchorStart = new Date(Math.max(monthStart.getTime(), anchorEnd.getTime() - windowMs));
        if (anchorStart.getTime() + windowMs > monthEnd.getTime()) {
          anchorStart = new Date(Math.max(monthStart.getTime(), monthEnd.getTime() - windowMs));
          anchorEnd = new Date(Math.min(monthEnd.getTime(), anchorStart.getTime() + windowMs));
        }

        const res = await fetchUnhealthy(anchorStart.toISOString(), anchorEnd.toISOString(), '10T', 10, plantId);
        setData(res);
      } catch (e: any) {
        setError(e?.message || 'Failed to load priority breakdown');
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedMonth, timeRange, windowMode, availableMonths.length, plantId]);

  const { series, totalFlood, excludedCount, processed } = useMemo(() => {
    const sums: Record<PriorityCategory, number> = {
      Critical: 0, High: 0, Medium: 0, Low: 0, 'J-coded': 0, 'Not Provided': 0, Other: 0,
    };
    const recs = data?.records || [];
    let excluded = 0;

    // Normalize helpers
    const normSource = (v: any) => {
      let src = String(v || 'Unknown');
      if (src.includes('.csv')) src = src.replace('.csv', '');
      if (src.includes('/') || src.includes('\\')) {
        const parts = src.split(/[\\/]/);
        src = parts[parts.length - 1];
      }
      return src;
    };
    const tsOf = (r: any) => {
      const ds = r?.peak_window_start || r?.event_time || r?.bin_start || r?.bin_end;
      return ds ? new Date(ds).getTime() : undefined;
    };

    if (aggregation === 'worst') {
      // Per-source worst window aggregation
      const bySource = new Map<string, any & { __cat: PriorityCategory; __flood: number; __ts?: number }>();
      for (const r of recs) {
        const flood = Number(r?.flood_count ?? 0);
        if (!Number.isFinite(flood) || flood <= 0) { excluded += 1; continue; }
        const src = normSource(r?.source);
        const ts = tsOf(r);
        const cat = normalizePriority(r?.priority, (r as any)?.priority_severity);
        const current = { ...r, source: src, __cat: cat, __flood: flood, __ts: ts } as any;
        const prev = bySource.get(src);
        if (!prev) {
          bySource.set(src, current);
        } else if (current.__flood > prev.__flood) {
          bySource.set(src, current);
        } else if (current.__flood === prev.__flood) {
          const cr = categoryRank(current.__cat);
          const pr = categoryRank(prev.__cat);
          if (cr < pr) bySource.set(src, current);
          else if (cr === pr && (current.__ts || 0) > (prev.__ts || 0)) bySource.set(src, current);
        }
      }
      const processed = Array.from(bySource.values());
      for (const rec of processed) sums[rec.__cat] += rec.__flood;
      const series = CATEGORY_ORDER.map((cat) => ({ name: cat, value: sums[cat], fill: CATEGORY_COLORS[cat] })).filter(s => s.value > 0);
      const total = Object.values(sums).reduce((a, b) => a + b, 0);
      return { series, totalFlood: total, excludedCount: excluded, processed };
    } else {
      // Sum per source across window
      const bySource = new Map<string, { source: string; total: number; worstCat: PriorityCategory; last?: number }>();
      for (const r of recs) {
        const flood = Number(r?.flood_count ?? 0);
        if (!Number.isFinite(flood) || flood <= 0) { excluded += 1; continue; }
        const src = normSource(r?.source);
        const ts = tsOf(r);
        const cat = normalizePriority(r?.priority, (r as any)?.priority_severity);
        const prev = bySource.get(src);
        if (!prev) {
          bySource.set(src, { source: src, total: flood, worstCat: cat, last: ts });
        } else {
          prev.total += flood;
          // choose worst category seen
          if (categoryRank(cat) < categoryRank(prev.worstCat)) prev.worstCat = cat;
          if (ts && (!prev.last || ts > prev.last)) prev.last = ts;
        }
      }
      const processed = Array.from(bySource.values()).map(v => ({ source: v.source, __flood: v.total, __cat: v.worstCat, __ts: v.last } as any));
      for (const rec of processed) sums[rec.__cat] += rec.__flood;
      const series = CATEGORY_ORDER.map((cat) => ({ name: cat, value: sums[cat], fill: CATEGORY_COLORS[cat] })).filter(s => s.value > 0);
      const total = Object.values(sums).reduce((a, b) => a + b, 0);
      return { series, totalFlood: total, excludedCount: excluded, processed };
    }
  }, [data, aggregation]);

  // Derived for selected category
  const selectedRecords = useMemo(() => {
    if (!selectedCat) return [] as typeof processed;
    return (processed || []).filter(r => r.__cat === selectedCat);
  }, [processed, selectedCat]);

  // Open AI insights with current filtered dataset
  const handleInsightClick = () => {
    const base = selectedCat ? selectedRecords : processed;
    const payload = (base || []).map((r: any) => ({
      source: String(r?.source || 'Unknown'),
      flood_count: Number(r?.__flood ?? 0),
      priority: r?.priority || undefined,
    }));
    const title = `Priority Breakdown Donut — ${plantLabel} — ${selectedMonth} — ${timeRange} — ${windowMode}` + (selectedCat ? ` — ${selectedCat}` : "");
    openInsightModal(payload, title);
  };

  const selectedSummary = useMemo(() => {
    const total = selectedRecords.reduce((a, r) => a + (r.__flood || 0), 0);
    const incidents = selectedRecords.length;
    const pct = totalFlood > 0 ? (total / totalFlood) * 100 : 0;
    return { total, incidents, pct };
  }, [selectedRecords, totalFlood]);

  const topSources = useMemo(() => {
    const map = new Map<string, { source: string; total: number; incidents: number; max: number; last: number | undefined }>();
    for (const r of selectedRecords) {
      const s = String(r.source || 'Unknown');
      const prev = map.get(s) || { source: s, total: 0, incidents: 0, max: 0, last: undefined };
      prev.total += r.__flood || 0;
      prev.incidents += 1;
      prev.max = Math.max(prev.max, r.__flood || 0);
      if (r.__ts) prev.last = prev.last ? Math.max(prev.last, r.__ts) : r.__ts;
      map.set(s, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [selectedRecords]);

  function exportSelectedCSV() {
    try {
      const rows = [
        ['category','source','event_time','flood_count','threshold','over_by','location_tag','condition','action','priority','description','filename'],
        ...selectedRecords.map(r => [
          selectedCat,
          r.source ?? '',
          (r.peak_window_start || r.event_time || r.bin_start || r.bin_end || ''),
          String(r.__flood ?? ''),
          String(r.threshold ?? ''),
          String(r.over_by ?? ''),
          String(r.location_tag ?? ''),
          String(r.condition ?? ''),
          String(r.action ?? ''),
          String(r.priority ?? ''),
          String(r.description ?? ''),
          String(r.filename ?? ''),
        ])
      ];
      const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedCat || 'category'}-details.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  return (
    <Card className={className}>
      <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PieIcon className="h-5 w-5 text-primary" />
                Priority Breakdown
              </CardTitle>
              <CardDescription>
                {aggregation === 'worst'
                  ? 'Per-source worst window (flood_count) • Center shows sum of worst-window floods'
                  : 'Per-source sum of floods across window (flood_count) • Center shows sum across sources'}
              </CardDescription>
            </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-end">
            {/* Month Selector */}
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent className="mt-1">
                <SelectItem value="all">All</SelectItem>
                {availableMonths.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Window Mode */}
            <Select value={windowMode} onValueChange={(v) => setWindowMode(v as 'recent' | 'peak')}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="peak">Peak Activity</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
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
            {/* Aggregation selector */}
            <Select value={aggregation} onValueChange={(v) => setAggregation(v as any)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Aggregation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="worst">Worst Window</SelectItem>
                <SelectItem value="sum">Sum per Source</SelectItem>
              </SelectContent>
            </Select>
            <InsightButton onClick={handleInsightClick} disabled={loading || (selectedCat ? selectedRecords.length === 0 : processed.length === 0)} />
            <Button variant="outline" size="sm" onClick={() => {
              // trigger effect by toggling state to same value
              setSelectedMonth((m) => m);
            }}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p>Loading priority breakdown...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-80 text-destructive">
            <div className="text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
              <p>{error}</p>
            </div>
          </div>
        ) : (series.length === 0 ? (
          <div className="flex items-center justify-center h-80">
            <div className="text-center text-muted-foreground">
              No alarms found for the selected window.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
            <div className="xl:col-span-2 h-[28rem] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <Tooltip formatter={(value: any, name: any) => [value, name]} />
                  <Pie
                    data={series}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={105}
                    outerRadius={160}
                    paddingAngle={1}
                    minAngle={3}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {series.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center total */}
              <div className="pointer-events-none select-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-sm text-muted-foreground">Total Alarms</div>
                <div className="text-3xl font-bold text-foreground">{totalFlood.toLocaleString()}</div>
              </div>
            </div>
            <div className="space-y-5">
              <div className="text-sm text-muted-foreground bg-accent p-3 rounded-lg flex items-center gap-2">
                <Filter className="h-4 w-4" />
                {aggregation === 'worst'
                  ? 'Aggregated per source by worst window • Weighted by flood_count only • Strict raw DCS priority codes (no severity fallback)'
                  : 'Aggregated per source by sum across window • Weighted by flood_count only • Strict raw DCS priority codes (no severity fallback)'}
              </div>
              <div className="text-xs text-muted-foreground">
                Excluded {excludedCount?.toLocaleString?.() || 0} records without a positive flood_count
              </div>
              <ul className="space-y-2 text-sm">
                {series.map(s => (
                  <li
                    key={s.name}
                    className={`flex items-center justify-between py-1 cursor-pointer hover:bg-accent/60 rounded px-2 ${selectedCat === (s.name as PriorityCategory) ? 'ring-1 ring-primary/50' : ''}`}
                    onClick={() => {
                      setSelectedCat(s.name as PriorityCategory);
                      setDetailTab('sources');
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: CATEGORY_COLORS[s.name as PriorityCategory] }} />
                      <span className="text-foreground font-medium">{s.name}</span>
                    </div>
                    <Badge variant="outline">
                      {s.value?.toLocaleString() || 0}
                    </Badge>
                  </li>
                ))}
              </ul>
              <div className="text-xs text-muted-foreground">
                Strict mapping: E/U → Critical, H → High, M → Medium, L → Low, J → J-coded, N/Not Provided/blank → Not Provided, others → Other.
              </div>

              {/* Details Panel */}
              {selectedCat && (
                <div className="mt-4 border rounded-lg p-3 bg-card text-card-foreground">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: CATEGORY_COLORS[selectedCat] }} />
                      {selectedCat} Details
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={exportSelectedCSV} className="h-7 px-2">
                        <Download className="h-4 w-4 mr-1" /> Export CSV
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedCat(null)} className="h-7 px-2">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mb-3">
                    Total flood: <span className="text-foreground font-medium">{selectedSummary.total.toLocaleString()}</span> ·
                    Incidents: <span className="text-foreground font-medium">{selectedSummary.incidents.toLocaleString()}</span> ·
                    Share: <span className="text-foreground font-medium">{selectedSummary.pct.toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Button variant={detailTab === 'sources' ? 'default' : 'outline'} size="sm" onClick={() => setDetailTab('sources')}>Top Sources</Button>
                    <Button variant={detailTab === 'incidents' ? 'default' : 'outline'} size="sm" onClick={() => setDetailTab('incidents')}>Recent Incidents</Button>
                  </div>

                  {detailTab === 'sources' ? (
                    <div className="max-h-64 overflow-auto text-sm">
                      <table className="w-full text-left">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="py-1 pr-2">Source</th>
                            <th className="py-1 pr-2">Total Flood</th>
                            <th className="py-1 pr-2">Incidents</th>
                            <th className="py-1 pr-2">Max</th>
                            <th className="py-1 pr-2">Last Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topSources.map((row, idx) => (
                            <tr key={row.source + idx} className="border-t">
                              <td className="py-1 pr-2 font-medium">{row.source}</td>
                              <td className="py-1 pr-2">{row.total.toLocaleString()}</td>
                              <td className="py-1 pr-2">{row.incidents}</td>
                              <td className="py-1 pr-2">{row.max.toLocaleString()}</td>
                              <td className="py-1 pr-2">{row.last ? new Date(row.last).toLocaleString() : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-auto text-sm">
                      <table className="w-full text-left">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="py-1 pr-2">Time</th>
                            <th className="py-1 pr-2">Source</th>
                            <th className="py-1 pr-2">Flood</th>
                            <th className="py-1 pr-2">Over</th>
                            <th className="py-1 pr-2">Threshold</th>
                            <th className="py-1 pr-2">Location</th>
                            <th className="py-1 pr-2">Condition</th>
                            <th className="py-1 pr-2">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRecords
                            .slice()
                            .sort((a, b) => (b.__ts || 0) - (a.__ts || 0))
                            .slice(0, 20)
                            .map((r, idx) => (
                              <tr key={(r.source || 'row') + idx} className="border-t">
                                <td className="py-1 pr-2">{new Date(r.__ts || Date.now()).toLocaleString()}</td>
                                <td className="py-1 pr-2 font-medium">{r.source}</td>
                                <td className="py-1 pr-2">{(r.__flood || 0).toLocaleString()}</td>
                                <td className="py-1 pr-2">{(r.over_by ?? '').toString()}</td>
                                <td className="py-1 pr-2">{(r.threshold ?? '').toString()}</td>
                                <td className="py-1 pr-2">{(r.location_tag ?? '').toString()}</td>
                                <td className="py-1 pr-2">{(r.condition ?? '').toString()}</td>
                                <td className="py-1 pr-2">{(r.action ?? '').toString()}</td>
                              </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default PriorityBreakdownDonut;
