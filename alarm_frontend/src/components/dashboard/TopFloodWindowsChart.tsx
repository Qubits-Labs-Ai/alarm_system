import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label, Cell } from 'recharts';
import { CHART_GREEN_MEDIUM } from '@/theme/chartColors';
import { InsightButton } from '@/components/insights/InsightButton';
import { useInsightModal } from '@/components/insights/useInsightModal';

export interface TopFloodWindowRow {
  id: string;
  label: string; // formatted range label
  flood_count: number;
  start: string;
  end: string;
  start_ts?: number; // epoch ms for X-axis time scale
  short_label?: string; // compact label for categorical X axis
  rate_per_min?: number;
  top_sources?: Array<{ source: string; count: number }>;
}

interface TopFloodWindowsChartProps {
  data: TopFloodWindowRow[];
  threshold: number;
  topK: 5 | 10 | 15;
  onTopKChange: (v: 5 | 10 | 15) => void;
  isLoading?: boolean;
  // New: click-select a window and highlight it
  onSelectWindow?: (row: TopFloodWindowRow | null) => void;
  selectedWindowId?: string;
  // Respect global include-system toggle
  includeSystem?: boolean;
}

export default function TopFloodWindowsChart({ data, threshold, topK, onTopKChange, isLoading = false, onSelectWindow, selectedWindowId, includeSystem = true }: TopFloodWindowsChartProps) {
  const { onOpen: openInsightModal } = useInsightModal();
  const rows = useMemo(() => {
    const sorted = [...(data || [])].sort((a, b) => b.flood_count - a.flood_count);
    return sorted.slice(0, topK);
  }, [data, topK]);

  // Identify meta/system sources (must be declared before use)
  const isMetaSource = (name: string) => {
    const s = String(name || '').trim().toUpperCase();
    if (!s) return false;
    return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
  };

  // Compute visible counts per row based on includeSystem toggle
  const displayRows = useMemo(() => {
    type RowEx = TopFloodWindowRow & { flood_visible: number; rate_visible?: number };
    return rows.map<RowEx>((r) => {
      const tsAll = Array.isArray(r.top_sources) ? r.top_sources : [];
      const sysSum = includeSystem ? 0 : tsAll.filter(s => isMetaSource(s.source)).reduce((acc, s) => acc + Number(s.count || 0), 0);
      const total = Number(r.flood_count || 0);
      const visible = Math.max(0, total - sysSum);
      const rateVisible = typeof r.rate_per_min === 'number' && total > 0
        ? (r.rate_per_min * (visible / total))
        : r.rate_per_min;
      return { ...r, flood_visible: visible, rate_visible: rateVisible };
    });
  }, [rows, includeSystem]);

  // Colors for top 3 sources in each bar: highest -> orange, medium -> dark green, lowest -> light green
  const COLORS = {
    top: '#ce9200',
    medium: '#3f741b',
    low: '#59a527',
  } as const;

  

  const isEmpty = !rows || rows.length === 0;
  const formatShort = (s?: string, fallback?: string) => {
    if (!s) return fallback || '';
    return new Date(s).toLocaleString(undefined, {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  };

  const handleInsightClick = () => {
    // Prepare concise payload for AI insight generator
    const payload = rows.map(r => ({
      source: r.short_label || r.label,
      id: r.id,
      label: r.label,
      start: r.start,
      end: r.end,
      flood_count: r.flood_count,
      rate_per_min: r.rate_per_min,
      top_sources: Array.isArray(r.top_sources) ? r.top_sources.slice(0, 5) : [],
    }));
    const title = `Top Flood Windows — PVC-I — Top ${topK} — Threshold ${threshold}`;
    openInsightModal(payload, title);
  };

  return (
    <Card className="shadow-metric-card bg-dashboard-metric-card-bg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">Top Flood Windows</CardTitle>
            <CardDescription>Peak 10-minute windows ranked by flood count</CardDescription>
          </div>
          <div className="flex gap-2 items-center">
            <Button variant={topK === 5 ? 'default' : 'outline'} size="sm" onClick={() => onTopKChange(5)}>Top 5</Button>
            <Button variant={topK === 10 ? 'default' : 'outline'} size="sm" onClick={() => onTopKChange(10)}>Top 10</Button>
            <Button variant={topK === 15 ? 'default' : 'outline'} size="sm" onClick={() => onTopKChange(15)}>Top 15</Button>
            <InsightButton onClick={handleInsightClick} disabled={isLoading || isEmpty} />
            {selectedWindowId && onSelectWindow && (
              <Button variant="outline" size="sm" onClick={() => onSelectWindow(null)}>Clear Selection</Button>
            )}
            {!selectedWindowId && (
              <span className="text-xs text-muted-foreground hidden md:inline">Click a bar to filter</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-80 bg-muted animate-pulse rounded" />
        ) : isEmpty ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground">No flood windows in selection.</div>
        ) : (
          <div className="h-96 overflow-x-auto">
            <div className="h-full min-w-[520px] md:min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayRows} margin={{ top: 24, right: 24, bottom: 24, left: 24 }}>
                {/* Per-bar gradients to visualize top 3 sources contribution within each bar */}
                <defs>
                  {displayRows.map((r) => {
                    const tsAll: Array<{ source: string; count: number }> = Array.isArray(r.top_sources)
                      ? [...(r.top_sources as Array<{ source: string; count: number }>)]
                      : [];
                    tsAll.sort((a, b) => b.count - a.count);
                    // Apply includeSystem toggle and unhealthy-only filter (count >= 10)
                    const ts = (includeSystem ? tsAll : tsAll.filter(s => !isMetaSource(s.source)));
                    const c1 = ts[0]?.count ?? 0; // highest
                    const c2 = ts[1]?.count ?? 0; // middle
                    const c3 = ts[2]?.count ?? 0; // lowest of the shown top 3
                    const totalVisible = Math.max(1, Number((r as { flood_visible?: number; flood_count?: number }).flood_visible ?? r.flood_count ?? 0));
                    const others = Math.max(0, totalVisible - (c1 + c2 + c3));
                    const pctLowEnd = ((others + c3) / totalVisible) * 100; // bottom section end
                    const pctMedEnd = ((others + c3 + c2) / totalVisible) * 100; // middle section end
                    return (
                      <linearGradient key={`grad-${r.id}`} id={`tfw-grad-${r.id}`} x1="0" y1="1" x2="0" y2="0">
                        {/* Bottom: lowest + others */}
                        <stop offset="0%" stopColor={COLORS.low} />
                        <stop offset={`${pctLowEnd}%`} stopColor={COLORS.low} />
                        {/* Middle: medium */}
                        <stop offset={`${pctLowEnd}%`} stopColor={COLORS.medium} />
                        <stop offset={`${pctMedEnd}%`} stopColor={COLORS.medium} />
                        {/* Top: highest */}
                        <stop offset={`${pctMedEnd}%`} stopColor={COLORS.top} />
                        <stop offset="100%" stopColor={COLORS.top} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" opacity={0.3} />
                <XAxis
                  type="category"
                  dataKey={(row) => row.short_label || formatShort(row.start)}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  interval={0}
                  minTickGap={12}
                >
                  <Label value="Top windows (time)" position="insideBottomRight" offset={0} className="fill-current text-lg" />
                </XAxis>
                <YAxis type="number" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}>
                  <Label value="Flood count" angle={-90} position="insideLeft" className="fill-current text-lg" />
                </YAxis>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0]?.payload as TopFloodWindowRow & { flood_visible?: number; rate_visible?: number };
                    if (!row) return null;
                    const visibleFlood = includeSystem ? row.flood_count : (row.flood_visible ?? row.flood_count);
                    const visibleRate = includeSystem ? row.rate_per_min : (row.rate_visible ?? row.rate_per_min);

                    // Prepare filtered top sources for display (>= 10) with includeSystem respected
                    const tsAll = Array.isArray(row.top_sources) ? [...row.top_sources] : [];
                    const tsFiltered = tsAll
                      .sort((a, b) => b.count - a.count)
                      .filter(s => (includeSystem || !isMetaSource(s.source)));
                    const shown = tsFiltered.slice(0, 3);
                    const sumShown = shown.reduce((acc, s) => acc + Number(s.count || 0), 0);
                    const othersCount = Math.max(0, Number(visibleFlood || 0) - sumShown);
                    const showOthers = othersCount >= 10;
                    return (
                      <div className="bg-popover text-popover-foreground p-3 rounded border shadow-lg min-w-[260px]">
                        <div className="font-semibold text-foreground mb-1">{row.label}</div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div>Flood count: <span className="text-foreground font-medium">{Number(visibleFlood || 0).toLocaleString()}</span></div>
                          {typeof visibleRate === 'number' && (
                            <div>Rate: <span className="text-foreground font-medium">{Number(visibleRate).toFixed(1)}</span> / min</div>
                          )}
                          <div className="text-xs">Local: {new Date(row.start).toLocaleString()} — {new Date(row.end).toLocaleString()}</div>
                          <div className="text-xs">UTC: {new Date(row.start).toLocaleString(undefined, { timeZone: 'UTC' })} — {new Date(row.end).toLocaleString(undefined, { timeZone: 'UTC' })}</div>
                          {(shown.length > 0 || showOthers) && (
                            <div className="pt-2">
                              <div className="text-xs font-medium text-foreground mb-1">Top sources</div>
                              <ul className="text-xs space-y-0.5">
                                {shown.map((s, i) => (
                                  <li key={i} className="flex justify-between gap-2">
                                    <span className="truncate max-w-[180px] flex items-center gap-2" title={s.source}>
                                      <span
                                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: i === 0 ? COLORS.top : i === 1 ? COLORS.medium : COLORS.low }}
                                      />
                                      <span className="truncate">{s.source}</span>
                                    </span>
                                    <span className="text-foreground font-medium">{s.count}</span>
                                  </li>
                                ))}
                                {showOthers && (
                                  <li className="flex justify-between gap-2">
                                    <span className="truncate max-w-[180px] flex items-center gap-2" title="Others">
                                      <span
                                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: COLORS.low }}
                                      />
                                      <span className="truncate">Others</span>
                                    </span>
                                    <span className="text-foreground font-medium">{othersCount}</span>
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ fill: 'var(--accent)', opacity: 0.08 }}
                />
                <ReferenceLine y={threshold} stroke="var(--muted-foreground)" strokeDasharray="5 5" isFront label={{ value: `Threshold (${threshold})`, position: 'right', fill: 'var(--muted-foreground)', fontSize: 12 }} />
                <Bar 
                  dataKey="flood_visible" 
                  fill={CHART_GREEN_MEDIUM} 
                  radius={[4, 4, 0, 0]} 
                  opacity={0.85}
                  className="cursor-pointer"
                  onClick={(_, index) => {
                     if (!onSelectWindow) return;
                    const row = displayRows[index];
                    if (!row) return;
                    // Toggle selection if clicking the same bar again
                    if (selectedWindowId && row.id === selectedWindowId) {
                      onSelectWindow(null);
                    } else {
                      onSelectWindow(row);
                    }
                  }}
                >
                  {displayRows.map((r, i) => (
                    <Cell 
                      key={`cell-${r.id}-${i}`} 
                      fill={Array.isArray(r.top_sources) && r.top_sources.length > 0 ? `url(#tfw-grad-${r.id})` : CHART_GREEN_MEDIUM}
                      opacity={selectedWindowId ? (r.id === selectedWindowId ? 1 : 0.6) : 0.85}
                      stroke={r.id === selectedWindowId ? 'var(--primary)' : undefined}
                      strokeWidth={r.id === selectedWindowId ? 1 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

