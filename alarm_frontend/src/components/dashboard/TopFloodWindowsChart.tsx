import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label } from 'recharts';
import { CHART_GREEN_MEDIUM } from '@/theme/chartColors';

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
}

export default function TopFloodWindowsChart({ data, threshold, topK, onTopKChange, isLoading = false }: TopFloodWindowsChartProps) {
  const rows = useMemo(() => {
    const sorted = [...(data || [])].sort((a, b) => b.flood_count - a.flood_count);
    return sorted.slice(0, topK);
  }, [data, topK]);

  const isEmpty = !rows || rows.length === 0;
  const formatShort = (s?: string, fallback?: string) => {
    if (!s) return fallback || '';
    return new Date(s).toLocaleString(undefined, {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  };

  return (
    <Card className="shadow-metric-card bg-dashboard-metric-card-bg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">Top Flood Windows</CardTitle>
            <CardDescription>Peak 10-minute windows ranked by flood count</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant={topK === 5 ? 'default' : 'outline'} size="sm" onClick={() => onTopKChange(5)}>Top 5</Button>
            <Button variant={topK === 10 ? 'default' : 'outline'} size="sm" onClick={() => onTopKChange(10)}>Top 10</Button>
            <Button variant={topK === 15 ? 'default' : 'outline'} size="sm" onClick={() => onTopKChange(15)}>Top 15</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-80 bg-muted animate-pulse rounded" />
        ) : isEmpty ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground">No flood windows in selection.</div>
        ) : (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 24, right: 24, bottom: 24, left: 24 }}>
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
                    const row = payload[0]?.payload as TopFloodWindowRow;
                    if (!row) return null;
                    return (
                      <div className="bg-popover text-popover-foreground p-3 rounded border shadow-lg min-w-[260px]">
                        <div className="font-semibold text-foreground mb-1">{row.label}</div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div>Flood count: <span className="text-foreground font-medium">{row.flood_count.toLocaleString()}</span></div>
                          {typeof row.rate_per_min === 'number' && (
                            <div>Rate: <span className="text-foreground font-medium">{row.rate_per_min.toFixed(1)}</span> / min</div>
                          )}
                          <div className="text-xs">{new Date(row.start).toLocaleString()} — {new Date(row.end).toLocaleString()}</div>
                          {Array.isArray(row.top_sources) && row.top_sources.length > 0 && (
                            <div className="pt-2">
                              <div className="text-xs font-medium text-foreground mb-1">Top sources</div>
                              <ul className="text-xs space-y-0.5">
                                {row.top_sources.slice(0, 3).map((s, i) => (
                                  <li key={i} className="flex justify-between gap-2">
                                    <span className="truncate max-w-[180px]" title={s.source}>{s.source}</span>
                                    <span className="text-foreground font-medium">{s.count}</span>
                                  </li>
                                ))}
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
                <Bar dataKey="flood_count" fill={CHART_GREEN_MEDIUM} radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
