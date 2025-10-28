import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComposedChart, Line, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { CHART_GREEN_PRIMARY, CHART_WARNING, CHART_DESTRUCTIVE } from '@/theme/chartColors';

export interface RollingAverageControlChartProps {
  data: Array<{ Date: string; Alarm_Count: number }>;
  isoThreshold: number;
  unacceptableThreshold: number;
  window?: number;
}

export default function RollingAverageControlChart({ data, isoThreshold, unacceptableThreshold, window = 7 }: RollingAverageControlChartProps) {
  const rows = useMemo(() => {
    const sorted = [...data].sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
    const out: Array<{ date: string; ma: number; raw: number }> = [];
    let sum = 0;
    const q: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const v = Number(sorted[i].Alarm_Count || 0);
      q.push(v); sum += v;
      if (q.length > window) sum -= q.shift()!;
      const ma = q.length === window ? sum / window : NaN;
      out.push({ date: sorted[i].Date, ma, raw: v });
    }
    return out.filter(r => !Number.isNaN(r.ma));
  }, [data, window]);

  return (
    <Card className="shadow-metric-card">
      <CardHeader>
        <CardTitle className="text-base">7‑Day Rolling Average</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="min-w-[560px]">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={rows} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v) => { const d = new Date(v); return `${d.getMonth()+1}/${d.getDate()}`; }} />
              <YAxis tick={{ fontSize: 12 }} label={{ value: 'Alarms', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Line type="monotone" dataKey="ma" stroke={CHART_GREEN_PRIMARY} strokeWidth={2.5} dot={false} name={`${window}-day MA`} />
              <ReferenceLine y={isoThreshold} stroke={CHART_WARNING} strokeDasharray="5 5" label={{ value: `${isoThreshold}`, position: 'right', fill: CHART_WARNING }} />
              <ReferenceLine y={unacceptableThreshold} stroke={CHART_DESTRUCTIVE} strokeDasharray="5 5" label={{ value: `${unacceptableThreshold}`, position: 'right', fill: CHART_DESTRUCTIVE }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
