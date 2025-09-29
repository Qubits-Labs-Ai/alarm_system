import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, MapPin, RefreshCw, BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  Label,
} from 'recharts';
import {
  CHART_GREEN_PRIMARY,
  CHART_GREEN_SECONDARY,
  CHART_GREEN_TERTIARY,
  CHART_GREEN_QUATERNARY,
  CHART_GREEN_QUINARY,
  CHART_GREEN_PALE,
  getGreenPalette,
  CHART_WARNING,
} from '@/theme/chartColors';
import { fetchUnhealthySources } from '@/api/plantHealth';
import { InsightButton } from '@/components/insights/InsightButton';
import { useInsightModal } from '@/components/insights/useInsightModal';

// Types aligned with other components
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

interface ConditionDistributionByLocationProps {
  className?: string;
  plantId?: string; // pvcI, pvcII, etc.
}

const DEFAULT_MONTH = 'all';
const CONDITION_LIMIT = 10; // if unique conditions > 10, aggregate remainder into "Other"

// Horizontal bars are better for long location labels
// We will render Recharts BarChart with layout="vertical" (Y=locations, X=values)

const ConditionDistributionByLocation: React.FC<ConditionDistributionByLocationProps> = ({ className, plantId = 'pvcI' }) => {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [records, setRecords] = React.useState<UnhealthyRecord[]>([]);
  const { onOpen: openInsightModal } = useInsightModal();
  const plantLabel = plantId === 'pvcI' ? 'PVC-I' : (plantId === 'pvcII' ? 'PVC-II' : plantId.toUpperCase());

  // Controls (follow existing dashboard defaults)
  const [selectedMonth, setSelectedMonth] = React.useState<string>(DEFAULT_MONTH); // 'all' or 'YYYY-MM'
  const [availableMonths, setAvailableMonths] = React.useState<Array<{ value: string; label: string; start: Date; end: Date }>>([]);
  const [timeRange, setTimeRange] = React.useState<string>('1h');
  const [windowMode, setWindowMode] = React.useState<'recent' | 'peak'>('peak');
  const [topLocations, setTopLocations] = React.useState<number>(10);
  const [sortBy, setSortBy] = React.useState<'total' | 'alphabetical'>('total');
  const [highlightVeryHigh, setHighlightVeryHigh] = React.useState<'on' | 'off'>('on');

  React.useEffect(() => {
    loadAvailableMonths();
  }, []);

  React.useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, timeRange, windowMode]);

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

      // PVC-II friendly defaults: if default month isn't present or plant is PVC-II, widen scope
      const hasDefault = items.some(m => m.value === DEFAULT_MONTH);
      if (!hasDefault || plantId !== 'pvcI') {
        setSelectedMonth('all');
        setTimeRange('all');
      }
    } catch (e) {
      console.warn('Failed to load months for word cloud', e);
    }
  };

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
        const monthEnd = month?.end || new Date(new Date(`${selectedMonth}-01T00:00:00Z`).getTime() + 32 * 24 * 60 * 60 * 1000);

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
      const msg = err instanceof Error ? err.message : 'Failed to load condition distribution data';
      setError(msg);
      console.error('ConditionDistribution fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Normalize unknown/missing location tags
  const normalizeLocation = (loc?: string): string => {
    const s = String(loc ?? '').trim();
    if (!s) return 'Unknown Location';
    const lower = s.toLowerCase();
    if (lower === 'unknown' || lower === 'not provided' || lower === 'n/a' || lower === 'na') return 'Unknown Location';
    return s;
  };

  // Build stacked dataset
  const { chartData, conditionKeys, colorByCondition, totalLocations, highThreshold, hasVeryHigh } = React.useMemo(() => {
    if (!records || records.length === 0) {
      return { chartData: [] as any[], conditionKeys: [] as string[], colorByCondition: new Map<string, string>(), totalLocations: 0, highThreshold: Number.POSITIVE_INFINITY, hasVeryHigh: false };
    }

    // Step 1: group by (location, condition)
    const byLocCond = new Map<string, Map<string, number>>();
    const latestByLoc = new Map<string, number>();

    for (const r of records) {
      const loc = normalizeLocation((r as any).location_tag);
      const cond = (r as any).condition || 'Not Provided';
      const flood = (r as any).flood_count ?? (r as any).hits ?? 0;
      if (!byLocCond.has(loc)) byLocCond.set(loc, new Map());
      const inner = byLocCond.get(loc)!;
      inner.set(cond, (inner.get(cond) ?? 0) + flood);

      const ts = new Date((r as any).peak_window_start || r.event_time || r.bin_end || r.bin_end).getTime();
      latestByLoc.set(loc, Math.max(latestByLoc.get(loc) ?? 0, ts));
    }

    // Step 2: compute totals per location
    let rows = Array.from(byLocCond.entries()).map(([loc, m]) => {
      const total = Array.from(m.values()).reduce((s, v) => s + v, 0);
      return { location: loc, total, m, latestTs: latestByLoc.get(loc) ?? 0 };
    });

    // Step 3: sort & limit locations
    if (sortBy === 'alphabetical') {
      rows.sort((a, b) => a.location.localeCompare(b.location));
    } else {
      rows.sort((a, b) => b.total - a.total);
    }
    rows = rows.slice(0, topLocations);

    // Step 4: gather condition totals to determine stack keys
    const condTotals = new Map<string, number>();
    for (const row of rows) {
      for (const [cond, v] of row.m) condTotals.set(cond, (condTotals.get(cond) ?? 0) + v);
    }

    const sortedConds = Array.from(condTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);

    const condKeys: string[] = sortedConds.length <= CONDITION_LIMIT
      ? sortedConds
      : [...sortedConds.slice(0, CONDITION_LIMIT - 1), 'Other'];

    // Step 5: color map for conditions (deterministic, many distinct green shades)
    const realConds = condKeys.filter(k => k !== 'Other');
    const palette = getGreenPalette(realConds.length);
    const colorByCondition = new Map<string, string>();
    realConds.forEach((cond, idx) => {
      colorByCondition.set(cond, palette[idx] || CHART_GREEN_PRIMARY);
    });
    if (condKeys.includes('Other')) {
      colorByCondition.set('Other', CHART_GREEN_SECONDARY);
    }

    // Step 6: materialize dataset for Recharts
    const data = rows.map(row => {
      const obj: any = { location: row.location, total: row.total, latestTs: row.latestTs };
      let other = 0;
      for (const [cond, v] of row.m) {
        if (condKeys.includes(cond)) obj[cond] = v;
        else other += v;
      }
      if (condKeys.includes('Other') && other > 0) obj['Other'] = other;
      return obj;
    });

    // Compute a dynamic "very high" threshold across all non-zero segments to flag with orange
    const segmentValues: number[] = [];
    for (const row of data) {
      for (const key of condKeys) {
        const v = row[key];
        if (typeof v === 'number' && v > 0) segmentValues.push(v);
      }
    }
    segmentValues.sort((a, b) => a - b);
    const pct = 0.85; // 85th percentile
    const idx = segmentValues.length > 0 ? Math.floor((segmentValues.length - 1) * pct) : -1;
    const highThreshold = idx >= 0 ? segmentValues[idx] : Number.POSITIVE_INFINITY;
    const hasVeryHigh = segmentValues.some(v => v >= highThreshold && highThreshold !== Number.POSITIVE_INFINITY);

    return { chartData: data, conditionKeys: condKeys, colorByCondition, totalLocations: rows.length, highThreshold, hasVeryHigh };
  }, [records, sortBy, topLocations]);

  // AI Insight handler: send per-location totals as incidents the backend can summarize
  const handleInsightClick = () => {
    const payload = (chartData || []).map((row: any) => ({
      source: String(row.location),
      flood_count: Number(row.total || 0),
    }));
    const title = `Condition Distribution by Location — ${plantLabel} — ${selectedMonth} — ${timeRange} — ${windowMode} — Top ${topLocations} — ${sortBy} — Highlight:${highlightVeryHigh}`;
    openInsightModal(payload, title);
  };

  // Custom legend that shows per-condition greens and an extra swatch for Very High (orange)
  const renderLegend = () => (
    <div className="flex flex-wrap items-center gap-4 px-2 py-1">
      {conditionKeys.map(k => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: colorByCondition.get(k) }} />
          <span className="text-xs text-foreground">{k}</span>
        </div>
      ))}
      {highlightVeryHigh === 'on' && hasVeryHigh && (
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: CHART_WARNING }} />
          <span className="text-xs text-foreground">Very High</span>
        </div>
      )}
    </div>
  );

  // Tooltip with per-condition breakdown and percentages
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload || {};
    const total = row.total || 0;
    const entries = conditionKeys
      .filter(k => k !== 'Other')
      .map(k => ({ key: k, value: row[k] || 0 }))
      .concat(conditionKeys.includes('Other') ? [{ key: 'Other', value: row['Other'] || 0 }] : [] )
      .filter(e => e.value > 0);

    return (
      <div className="bg-popover text-popover-foreground p-3 rounded border shadow-lg min-w-[220px]">
        <div className="font-semibold text-foreground mb-1">{row.location}</div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>Total flood: <span className="text-foreground font-medium">{total.toLocaleString()}</span></div>
          {entries.map(e => (
            <div key={e.key} className="flex items-center justify-between gap-2">
              <span>
                <span className="inline-block w-2 h-2 rounded-sm mr-2" style={{ backgroundColor: colorByCondition.get(e.key) }} />
                {e.key}
              </span>
              <span className="text-foreground font-medium">{e.value.toLocaleString()} ({total ? Math.round(e.value / total * 100) : 0}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p>Loading condition distribution...</p>
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

  const isEmpty = !chartData || chartData.length === 0 || conditionKeys.length === 0;

  if (isEmpty) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Condition Distribution by Location
              </CardTitle>
              <CardDescription>No data in the selected window</CardDescription>
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
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
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
              <MapPin className="h-5 w-5 text-primary" />
              Condition Distribution by Location
            </CardTitle>
            <CardDescription>
              Top {chartData.length} locations by total flood • Stacks are actual condition values from data
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
            <Select value={highlightVeryHigh} onValueChange={(v) => setHighlightVeryHigh(v as any)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Highlight" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on">Highlight: On</SelectItem>
                <SelectItem value="off">Highlight: Off</SelectItem>
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
            <Select value={String(topLocations)} onValueChange={(v) => setTopLocations(parseInt(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="total">By Total</SelectItem>
                <SelectItem value="alphabetical">A–Z</SelectItem>
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
            <InsightButton onClick={handleInsightClick} disabled={loading || !chartData || chartData.length === 0} />
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 20, right: 30, bottom: 20, left: 160 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis type="number">
                <Label value="Flood Count" position="insideBottomRight" offset={0} className="fill-current text-lg" />
              </XAxis>
              <YAxis type="category" dataKey="location" width={80} tick={{ fontSize: 12 }}>
                <Label value="Location" angle={-90} position="insideLeft" className="fill-current text-lg" />
              </YAxis>
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--accent)', opacity: 0.08 }} />
              <Legend content={renderLegend as any} />

              {conditionKeys.map((key) => (
                <Bar key={key} dataKey={key} stackId="a" name={key} radius={[0, 0, 0, 0]} fill={colorByCondition.get(key) || CHART_GREEN_PRIMARY}>
                  {chartData.map((entry: any, index: number) => {
                    const val = entry[key] || 0;
                    const base = colorByCondition.get(key) || CHART_GREEN_PRIMARY;
                    const fill = highlightVeryHigh === 'on' && val > 0 && val >= highThreshold ? CHART_WARNING : base;
                    return <Cell key={`cell-${key}-${index}`} fill={fill} />
                  })}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Insights */}
        <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: CHART_GREEN_PALE }}>
          <div className="text-sm text-foreground font-medium mb-1">Key Insights</div>
          <ul className="text-sm text-muted-foreground list-disc ml-5">
            <li>Focus on the top rows to address locations with the highest total flood.</li>
            <li>Use the legend to toggle condition stacks and isolate specific patterns (e.g., PVHIGH vs PVLOW).</li>
            <li>"Unknown Location" groups sources where the location tag is missing or not provided.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConditionDistributionByLocation;
