import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, MapPin, RefreshCw } from 'lucide-react';
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
  CHART_GREEN_PALE,
  CHART_WARNING,
  getGreenPalette,
} from '@/theme/chartColors';
import { fetchUnhealthySources, fetchPvciIsaFloodSummary, fetchPvciWindowSourceDetails } from '@/api/plantHealth';
import { InsightButton } from '@/components/insights/InsightButton';
import { useInsightModal } from '@/components/insights/useInsightModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import TimeBinSlider from '@/components/dashboard/TimeBinSlider';

// Types aligned with other charts
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
  flood_count?: number;
}

export interface SelectedWindowRef {
  id: string;
  start: string;
  end: string;
  label?: string;
}

interface Props {
  className?: string;
  plantId?: string; // default pvcI
  includeSystem?: boolean;
  selectedWindow?: SelectedWindowRef | null;
  topLocations?: number; // default 10
  onApplyTimePicker?: (startIso: string, endIso: string) => void;
  onClearWindow?: () => void;
  timePickerDomain?: { start: string; end: string; peakStart?: string; peakEnd?: string };
  unhealthyWindows?: Array<{ start: string; end: string; label?: string }>;
  validateWindow?: (startIso: string, endIso: string) => Promise<boolean>;
}

const CONDITION_LIMIT = 10;

const isMetaSource = (name: string) => {
  const s = String(name || '').trim().toUpperCase();
  if (!s) return false;
  return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
};

const normalizeLocation = (loc?: string): string => {
  const s = String(loc ?? '').trim();
  if (!s) return 'Unknown Location';
  const lower = s.toLowerCase();
  if (lower === 'unknown' || lower === 'not provided' || lower === 'n/a' || lower === 'na') return 'Unknown Location';
  return s;
};

// Normalize source names (align with Pareto chart)
const normalizeSourceName = (src?: string): string => {
  let s = String(src || 'Unknown');
  if (s.includes('.csv')) s = s.replace('.csv', '');
  if (s.includes('/') || s.includes('\\')) {
    const parts = s.split(/[\\/]/);
    s = parts[parts.length - 1];
  }
  return s;
};

const ConditionDistributionByLocationPlantWide: React.FC<Props> = ({
  className,
  plantId = 'pvcI',
  includeSystem = true,
  selectedWindow,
  topLocations = 10,
  onApplyTimePicker,
  onClearWindow,
  timePickerDomain,
  unhealthyWindows,
  validateWindow,
}) => {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [records, setRecords] = React.useState<UnhealthyRecord[]>([]);
  const [sortBy, setSortBy] = React.useState<'total' | 'alphabetical'>('total');
  const [highlightVeryHigh, setHighlightVeryHigh] = React.useState<'on' | 'off'>('on');
  // Internal Top N state seeded from prop
  const [topN, setTopN] = React.useState<number>(topLocations);
  const [activeWindow, setActiveWindow] = React.useState<SelectedWindowRef | null>(selectedWindow || null);
  const reqRef = React.useRef(0);
  const { onOpen: openInsightModal } = useInsightModal();

  React.useEffect(() => {
    setActiveWindow(selectedWindow || null);
  }, [selectedWindow?.id, selectedWindow?.start, selectedWindow?.end]);

  React.useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId, includeSystem, activeWindow?.id, sortBy, topN, highlightVeryHigh]);

  async function resolveWindow(): Promise<SelectedWindowRef | null> {
    if (activeWindow) return activeWindow;
    // Fallback: use ISA summary to find the global peak window
    try {
      const res: any = await fetchPvciIsaFloodSummary({ include_records: true, include_windows: true, include_alarm_details: true, top_n: 10, max_windows: 10 });
      const list: any[] = Array.isArray(res?.records) ? res.records : [];
      let best: any | null = null;
      for (const r of list) {
        const c = Number(r?.peak_10min_count || 0);
        if (!best || c > Number(best?.peak_10min_count || 0)) best = r;
      }
      if (best && best.peak_window_start && best.peak_window_end) {
        return { id: String(best.peak_window_start), start: best.peak_window_start, end: best.peak_window_end, label: `${new Date(best.peak_window_start).toLocaleString()} — ${new Date(best.peak_window_end).toLocaleString()}` };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const myReq = ++reqRef.current;

      const win = await resolveWindow();
      let res: any = null;
      if (win?.start && win?.end) {
        // Use ISA event-based counts for exact window to align with Top Bars
        const details = await fetchPvciWindowSourceDetails(win.start, win.end, 500);
        const detailed: Array<{ source: string; location_tag?: string; condition?: string; count: number }>
          = Array.isArray(details?.per_source_detailed) ? details.per_source_detailed : [];
        // Transform to records resembling unhealthy endpoint for downstream aggregation
        let recs: UnhealthyRecord[] = detailed.map((d) => ({
          event_time: win.start,
          bin_end: win.end,
          source: String(d.source || 'Unknown'),
          hits: Number(d.count || 0),
          threshold: 10,
          over_by: Math.max(0, Number(d.count || 0) - 10),
          rate_per_min: Number(d.count || 0) / 10,
          location_tag: d.location_tag,
          condition: d.condition || 'Not Provided',
          flood_count: Number(d.count || 0),
        }));

        // IncludeSystem filter
        if (!includeSystem) recs = recs.filter(r => !isMetaSource(r.source));
        // Unhealthy only rule
        recs = recs.filter(r => Number((r as any).flood_count ?? r.hits ?? 0) >= 10);

        // Enrich missing location tags using unhealthy-sources (JSON-backed) for same window
        if (recs.some(r => !r.location_tag)) {
          try {
            const enrichRes = await fetchUnhealthySources(win.start, win.end, '10T', 10, plantId);
            const enrichList: any[] = Array.isArray(enrichRes?.records) ? enrichRes.records : [];
            const srcToLoc = new Map<string, string>();
            for (const r of enrichList) {
              const src = String(r?.source || '').trim();
              const loc = String(r?.location_tag || '').trim();
              if (src && loc && loc.toLowerCase() !== 'not provided') {
                if (!srcToLoc.has(src)) srcToLoc.set(src, loc);
              }
            }
            recs = recs.map(it => (
              !it.location_tag || it.location_tag.trim() === '' || it.location_tag.toLowerCase() === 'not provided'
                ? { ...it, location_tag: srcToLoc.get(String(it.source)) || it.location_tag }
                : it
            ));
          } catch (e) {
            // best-effort enrichment only; ignore errors
          }
        }

        if (myReq === reqRef.current) {
          setRecords(recs);
          setActiveWindow(win || null);
        }
        return; // done
      } else {
        // Absolute fallback: load all cached records then we will still aggregate (rare path)
        res = await fetchUnhealthySources(undefined, undefined, '10T', 10, plantId);
      }

      let recs: UnhealthyRecord[] = Array.isArray(res?.records) ? res.records : [];

      // IncludeSystem filter (remove meta/system sources when off)
      if (!includeSystem) {
        recs = recs.filter(r => !isMetaSource(r.source));
      }

      // Keep only unhealthy records (hits/flood_count >= 10)
      recs = recs.filter(r => Number((r as any).flood_count ?? r.hits ?? 0) >= 10);

      if (myReq === reqRef.current) {
        setRecords(recs);
        setActiveWindow(win || null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load condition distribution (plant-wide)';
      setError(msg);
      console.error('ConditionDistributionByLocationPlantWide fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  const { chartData, conditionKeys, colorByCondition, highThreshold, hasVeryHigh } = React.useMemo(() => {
    if (!records || records.length === 0) {
      return { chartData: [] as any[], conditionKeys: [] as string[], colorByCondition: new Map<string, string>(), highThreshold: Number.POSITIVE_INFINITY, hasVeryHigh: false };
    }

    // group by (location, condition) and also track per-source contributions
    const byLocCond = new Map<string, Map<string, number>>();
    const byLocCondSrc = new Map<string, Map<string, Map<string, number>>>();
    for (const r of records) {
      const loc = normalizeLocation((r as any).location_tag);
      const cond = (r as any).condition || 'Not Provided';
      const flood = (r as any).flood_count ?? (r as any).hits ?? 0;
      const src = normalizeSourceName((r as any).source);
      if (!byLocCond.has(loc)) byLocCond.set(loc, new Map());
      const inner = byLocCond.get(loc)!;
      inner.set(cond, (inner.get(cond) ?? 0) + flood);

      // track source contribution
      if (!byLocCondSrc.has(loc)) byLocCondSrc.set(loc, new Map());
      const condMap = byLocCondSrc.get(loc)!;
      if (!condMap.has(cond)) condMap.set(cond, new Map());
      const srcMap = condMap.get(cond)!;
      srcMap.set(src, (srcMap.get(src) ?? 0) + flood);
    }

    // rows with totals
    let rows = Array.from(byLocCond.entries()).map(([loc, m]) => {
      const total = Array.from(m.values()).reduce((s, v) => s + v, 0);
      return { location: loc, total, m };
    })
    // Hide very small totals to keep focus on unhealthy clusters
    .filter(r => r.total >= 10);

    if (sortBy === 'alphabetical') rows.sort((a, b) => a.location.localeCompare(b.location));
    else rows.sort((a, b) => b.total - a.total);

    rows = rows.slice(0, topN);

    // determine visible condition keys by overall total
    const condTotals = new Map<string, number>();
    for (const row of rows) for (const [cond, v] of row.m) condTotals.set(cond, (condTotals.get(cond) ?? 0) + v);
    const sortedConds = Array.from(condTotals.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);

    const condKeys: string[] = sortedConds.length <= CONDITION_LIMIT
      ? sortedConds
      : [...sortedConds.slice(0, CONDITION_LIMIT - 1), 'Other'];

    const realConds = condKeys.filter(k => k !== 'Other');
    const palette = getGreenPalette(realConds.length);
    const colorByCondition = new Map<string, string>();
    realConds.forEach((cond, idx) => colorByCondition.set(cond, palette[idx] || CHART_GREEN_PRIMARY));
    if (condKeys.includes('Other')) colorByCondition.set('Other', CHART_GREEN_SECONDARY);

    const data = rows.map(row => {
      const obj: any = { location: row.location, total: row.total };
      const topByCond: Record<string, Array<{ name: string; count: number }>> = {};
      let other = 0;
      for (const [cond, v] of row.m) {
        if (condKeys.includes(cond)) {
          obj[cond] = v;
          // compute top sources for this condition at this location
          const srcMap = byLocCondSrc.get(row.location)?.get(cond);
          if (srcMap && srcMap.size > 0) {
            const TOP = 5;
            const sorted = Array.from(srcMap.entries()).sort((a, b) => b[1] - a[1]);
            topByCond[cond] = sorted.slice(0, TOP).map(([name, count]) => ({ name, count }));
          }
        } else {
          other += v;
        }
      }
      // Only add Others if it meets unhealthy visibility rule (>= 10)
      if (condKeys.includes('Other') && other >= 10) obj['Other'] = other;
      // attach top sources map for tooltip usage
      (obj as any).__byCondTopSources = topByCond;
      return obj;
    });

    // dynamic very-high threshold (85th percentile of non-zero segments)
    const segVals: number[] = [];
    for (const row of data) for (const key of condKeys) { const v = row[key]; if (typeof v === 'number' && v > 0) segVals.push(v); }
    segVals.sort((a, b) => a - b);
    const idx = segVals.length > 0 ? Math.floor((segVals.length - 1) * 0.85) : -1;
    const highThreshold = idx >= 0 ? segVals[idx] : Number.POSITIVE_INFINITY;
    const hasVeryHigh = segVals.some(v => v >= highThreshold && highThreshold !== Number.POSITIVE_INFINITY);

    return { chartData: data, conditionKeys: condKeys, colorByCondition, highThreshold, hasVeryHigh };
  }, [records, sortBy, topN]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload || {};
    const total = row.total || 0;
    const entries = (conditionKeys || [])
      .filter(k => k !== 'Other')
      .map(k => ({ key: k, value: row[k] || 0 }))
      .concat(conditionKeys.includes('Other') ? [{ key: 'Other', value: row['Other'] || 0 }] : [])
      .filter(e => e.value > 0);
    return (
      <div className="bg-popover text-popover-foreground p-3 rounded border shadow-lg min-w-[220px]">
        <div className="font-semibold text-foreground mb-1">{row.location}</div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>Total flood: <span className="text-foreground font-medium">{total.toLocaleString()}</span></div>
          {entries.map((e: any) => {
            const top = (row as any).__byCondTopSources?.[e.key] as Array<{ name: string; count: number }> | undefined;
            return (
              <div key={e.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="inline-block w-2 h-2 rounded-sm mr-2" style={{ backgroundColor: colorByCondition.get(e.key) }} />
                    {e.key}
                  </span>
                  <span className="text-foreground font-medium">{e.value.toLocaleString()} ({total ? Math.round(e.value / total * 100) : 0}%)</span>
                </div>
                {top && top.length > 0 && (
                  <ul className="text-xs ml-4 space-y-1">
                    {top.map((s, i) => (
                      <li key={`${e.key}-src-${i}`} className="flex items-center justify-between gap-2">
                        <span className="truncate max-w-[220px]" title={s.name}>{s.name}</span>
                        <span className="text-foreground font-medium">{s.count.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleInsightClick = () => {
    try {
      // Send one record per visible bar segment so backend sees `source` + `flood_count`
      const payload: Array<{
        source: string;
        location_tag: string;
        condition: string;
        flood_count: number;
        total_at_location?: number;
        top_sources?: Array<{ name: string; count: number }>;
      }> = [];

      (chartData || []).forEach((row: any) => {
        (conditionKeys || []).forEach((k: string) => {
          const v = row[k];
          if (typeof v === 'number' && v > 0) {
            payload.push({
              source: String(row.location),
              location_tag: String(row.location),
              condition: k,
              flood_count: v,
              total_at_location: row.total,
              top_sources: (row.__byCondTopSources?.[k] || []).slice(0, 5),
            });
          }
        });
      });
      const titleParts = [
        'PVC-I — Condition Distribution by Location',
        activeWindow?.label ? `Window: ${activeWindow.label}` : undefined,
        `Top ${Math.min(topN, (chartData || []).length)}`,
        `Sort: ${sortBy === 'total' ? 'By Total' : 'A–Z'}`,
      ].filter(Boolean);
      const title = titleParts.join(' — ');
      openInsightModal(payload, title);
    } catch (e) {
      // no-op; insights are best-effort
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p>Loading condition distribution…</p>
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

  const isEmpty = !conditionKeys || conditionKeys.length === 0;

  if (isEmpty) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Condition Distribution by Location
              </CardTitle>
              <CardDescription>No unhealthy activity in the selected 10‑minute window.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" title="Select a 10‑minute time window">10‑min Window</Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto">
                  {timePickerDomain ? (
                    <TimeBinSlider
                      domainStart={timePickerDomain.start}
                      domainEnd={timePickerDomain.end}
                      initialStart={activeWindow?.start || timePickerDomain.end}
                      windowMinutes={10}
                      stepMinutes={1}
                      onApply={(s, e) => onApplyTimePicker?.(s, e)}
                      onCancel={() => {}}
                      peakWindowStart={timePickerDomain.peakStart}
                      peakWindowEnd={timePickerDomain.peakEnd}
                      onClear={onClearWindow}
                      unhealthyWindows={unhealthyWindows}
                      validateWindow={validateWindow}
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground">Time picker unavailable (no domain)</div>
                  )}
                </PopoverContent>
              </Popover>
              <Select value={highlightVeryHigh} onValueChange={(v) => setHighlightVeryHigh(v as any)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Highlight" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Highlight: On</SelectItem>
                  <SelectItem value="off">Highlight: Off</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(topN)} onValueChange={(v) => v && setTopN(parseInt(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Top 5</SelectItem>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="20">Top 20</SelectItem>
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
              <MapPin className="h-5 w-5 text-primary" />
              Condition Distribution by Location
            </CardTitle>
            <CardDescription>
              Top {Math.min(topN, (chartData || []).length)} locations in the selected 10‑min window{activeWindow?.label ? ` • ${activeWindow.label}` : ''}
            </CardDescription>
          </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" title="Select a 10‑minute time window">10‑min Window</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto">
              {timePickerDomain ? (
                <TimeBinSlider
                  domainStart={timePickerDomain.start}
                  domainEnd={timePickerDomain.end}
                  initialStart={activeWindow?.start || timePickerDomain.end}
                  windowMinutes={10}
                  stepMinutes={1}
                  onApply={(s, e) => onApplyTimePicker?.(s, e)}
                  onCancel={() => {}}
                  peakWindowStart={timePickerDomain.peakStart}
                  peakWindowEnd={timePickerDomain.peakEnd}
                  onClear={onClearWindow}
                  unhealthyWindows={unhealthyWindows}
                  validateWindow={validateWindow}
                />
              ) : (
                <div className="text-xs text-muted-foreground">Time picker unavailable (no domain)</div>
              )}
            </PopoverContent>
          </Popover>
          <Select value={highlightVeryHigh} onValueChange={(v) => setHighlightVeryHigh(v as any)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Highlight" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">Highlight: On</SelectItem>
              <SelectItem value="off">Highlight: Off</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(topN)} onValueChange={(v) => v && setTopN(parseInt(v))}>
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
          <InsightButton onClick={handleInsightClick} disabled={loading || (chartData?.length ?? 0) === 0} />
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </CardHeader>
      <CardContent>
        <div className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 30, bottom: 20, left: 160 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis type="number">
                <Label value="Flood Count" position="insideBottomRight" offset={0} className="fill-current text-lg" />
              </XAxis>
              <YAxis type="category" dataKey="location" width={80} tick={{ fontSize: 12 }}>
                <Label value="Location" angle={-90} position="insideLeft" className="fill-current text-lg" />
              </YAxis>
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--accent)', opacity: 0.08 }} />
              <Legend />
              {(conditionKeys || []).map((key) => (
                <Bar key={key} dataKey={key} stackId="a" name={key} radius={[0, 0, 0, 0]} fill={colorByCondition.get(key) || CHART_GREEN_PRIMARY} isAnimationActive={false}>
                  {(chartData || []).map((entry: any, index: number) => {
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
          <div className="text-sm text-foreground font-medium mb-1">Key Notes</div>
          <ul className="text-sm text-muted-foreground list-disc ml-5">
            <li>Bars rank locations by unhealthy flood count within the selected 10‑minute window.</li>
            <li>Stacks are ISA‑18.2 conditions; use legend to focus on specific patterns.</li>
            <li>Legend/stack labels (e.g., <span className="text-foreground">Not Provided</span>, CHANGE, PVLOW) are <span className="text-foreground font-medium">condition</span> names.</li>
            <li><span className="text-foreground">Unknown Location</span> appears when events have no Location Tag in this window.</li>
            <li>System/meta tags are excluded when the dashboard toggle is off.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConditionDistributionByLocationPlantWide;
