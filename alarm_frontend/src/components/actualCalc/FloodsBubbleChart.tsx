import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, Label } from 'recharts';
import { ActualCalcFloodsResponse } from '@/types/actualCalc';

type FloodWindow = ActualCalcFloodsResponse['windows'][number];

interface FloodsBubbleChartProps {
  windows: FloodWindow[];
  includeSystem?: boolean;
  isLoading?: boolean;
  selectedWindowId?: string;
  onSelectWindow?: (row: { id: string; label: string; start: string; end: string } | null) => void;
  limit?: number;
}

function isMetaSource(name: string): boolean {
  const s = String(name || '').trim().toUpperCase();
  if (!s) return false;
  return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
}

export default function FloodsBubbleChart({ windows, includeSystem = true, isLoading = false, selectedWindowId, onSelectWindow, limit }: FloodsBubbleChartProps) {
  const [topK, setTopK] = useState<10 | 15 | 25 | 'all'>(10);
  type RowData = {
    id: string;
    start: string;
    end: string;
    label: string;
    xLabel: string;
    y: number;
    z: number;
    rate: number | null | undefined;
    top3: Array<[string, number]>;
    others: number;
    totalVisible: number;
  };
  const rows = useMemo(() => {
    const list = Array.isArray(windows) ? windows : [];
    const trimmed = typeof limit === 'number' && limit > 0 ? list.slice(0, limit) : list;

    const out = trimmed.map((w, i) => {
      const all: Record<string, number> = w.sources_involved || {};
      const entries = Object.entries(all);
      const filtered = includeSystem ? entries : entries.filter(([k]) => !isMetaSource(k));
      const visibleFlood = filtered.reduce((acc, [, v]) => acc + Number(v || 0), 0);
      const visibleSourceCount = filtered.length;
      const label = `Flood ${i + 1}`;

      const total = Number(w.flood_count || 0);
      const rate = typeof w.rate_per_min === 'number' && total > 0 ? (w.rate_per_min * (visibleFlood / total)) : w.rate_per_min;

      const sortedSources = filtered.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
      const top3: Array<[string, number]> = sortedSources.slice(0, 3) as Array<[string, number]>;
      const sumTop3 = top3.reduce((acc, [, v]) => acc + Number(v || 0), 0);
      const others = Math.max(0, visibleFlood - sumTop3);

      const row: RowData = {
        id: w.id,
        start: w.start,
        end: w.end,
        label,
        xLabel: label,
        y: visibleFlood,
        z: visibleSourceCount,
        rate,
        top3,
        others,
        totalVisible: visibleFlood,
      };
      return row;
    });
    // Sort by severity (y desc)
    out.sort((a, b) => b.y - a.y);
    return out;
  }, [windows, includeSystem, limit]);

  const filteredRows = useMemo(() => {
    if (topK === 'all') return rows;
    return rows.slice(0, topK);
  }, [rows, topK]);

  const zDomain = useMemo(() => {
    const vals = filteredRows.map(r => r.z);
    const min = Math.min(...(vals.length ? vals : [1]));
    const max = Math.max(...(vals.length ? vals : [1]));
    return [Math.max(1, min), Math.max(1, max)] as [number, number];
  }, [filteredRows]);

  const isEmpty = !filteredRows || filteredRows.length === 0;
  const showTicks = filteredRows.length <= 20;

  return (
    <Card className="shadow-metric-card bg-dashboard-metric-card-bg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">Floods Bubble Chart</CardTitle>
            <CardDescription>Bubble size = number of sources; Y = total alarms per flood</CardDescription>
          </div>
          <div className="flex gap-2 items-center">
            <Button variant={topK === 10 ? 'default' : 'outline'} size="sm" onClick={() => setTopK(10)}>Top 10</Button>
            <Button variant={topK === 15 ? 'default' : 'outline'} size="sm" onClick={() => setTopK(15)}>Top 15</Button>
            <Button variant={topK === 25 ? 'default' : 'outline'} size="sm" onClick={() => setTopK(25)}>Top 25</Button>
            <Button variant={topK === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setTopK('all')}>All</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-96 bg-muted animate-pulse rounded" />
        ) : isEmpty ? (
          <div className="h-96 flex items-center justify-center text-muted-foreground">No flood windows available.</div>
        ) : (
          <div className="h-96 overflow-x-auto">
            <div className="h-full min-w-[720px] md:min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 24, right: 24, bottom: 24, left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" opacity={0.3} />
                  <XAxis type="category" dataKey="xLabel" tick={showTicks ? { fill: 'var(--muted-foreground)', fontSize: 12 } : false} interval={0} minTickGap={8}>
                    <Label value="Flood Events" position="insideBottomRight" offset={0} className="fill-current text-lg" />
                  </XAxis>
                  <YAxis type="number" dataKey="y" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}>
                    <Label value="Total Alarms During Flood" angle={-90} position="insideLeft" className="fill-current text-lg" />
                  </YAxis>
                  <ZAxis type="number" dataKey="z" domain={zDomain as [number, number]} range={[80, 800]} />
                  <Tooltip
                    cursor={{ fill: 'var(--accent)', opacity: 0.08 }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const row = payload[0]?.payload as RowData | undefined;
                      if (!row) return null;
                      const showOthers = row.others >= 10;
                      return (
                        <div className="bg-popover text-popover-foreground p-3 rounded border shadow-lg min-w-[260px]">
                          <div className="font-semibold text-foreground mb-1">{row.label}</div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <div>Total alarms: <span className="text-foreground font-medium">{Number(row.totalVisible || 0).toLocaleString()}</span></div>
                            {typeof row.rate === 'number' && (
                              <div>Rate: <span className="text-foreground font-medium">{Number(row.rate).toFixed(1)}</span> / min</div>
                            )}
                            <div className="text-xs">Local: {new Date(row.start).toLocaleString()} — {new Date(row.end).toLocaleString()}</div>
                            <div className="text-xs">UTC: {new Date(row.start).toLocaleString(undefined, { timeZone: 'UTC' })} — {new Date(row.end).toLocaleString(undefined, { timeZone: 'UTC' })}</div>
                            {(row.top3.length > 0 || showOthers) && (
                              <div className="pt-2">
                                <div className="text-xs font-medium text-foreground mb-1">Top sources</div>
                                <ul className="text-xs space-y-0.5">
                                  {row.top3.map((s: [string, number], i: number) => (
                                    <li key={i} className="flex justify-between gap-2">
                                      <span className="truncate max-w-[180px]" title={s[0]}>{s[0]}</span>
                                      <span className="text-foreground font-medium">{s[1]}</span>
                                    </li>
                                  ))}
                                  {showOthers && (
                                    <li className="flex justify-between gap-2">
                                      <span className="truncate max-w-[180px]" title="Others">Others</span>
                                      <span className="text-foreground font-medium">{row.others}</span>
                                    </li>
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={filteredRows}
                    fill="#ef4444"
                    opacity={0.8}
                    shape="circle"
                    onClick={(_, index) => {
                      if (!onSelectWindow) return;
                      const row = filteredRows[index];
                      if (!row) return;
                      if (selectedWindowId && row.id === selectedWindowId) {
                        onSelectWindow(null);
                      } else {
                        onSelectWindow({ id: row.id, label: row.label, start: row.start, end: row.end });
                      }
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
