import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { CHART_GREEN_PRIMARY, CHART_WARNING, CHART_DESTRUCTIVE } from '@/theme/chartColors';

export interface FrequencyDailyHistogramProps {
  data: Array<{ Date: string; Alarm_Count: number }>;
  isoThreshold: number; // 288
  unacceptableThreshold: number; // 720
}

export default function FrequencyDailyHistogram({ data, isoThreshold, unacceptableThreshold }: FrequencyDailyHistogramProps) {
  // Build fixed bins aligned to ISO thresholds
  const bins = useMemo(() => {
    const labels = [
      `≤${isoThreshold}`,
      `${isoThreshold + 1}–400`,
      `401–600`,
      `601–${unacceptableThreshold - 1}`,
      `≥${unacceptableThreshold}`,
    ];

    const counts = new Array(labels.length).fill(0) as number[];
    for (const d of data) {
      const v = Number(d.Alarm_Count || 0);
      if (v <= isoThreshold) counts[0]++;
      else if (v <= 400) counts[1]++;
      else if (v <= 600) counts[2]++;
      else if (v < unacceptableThreshold) counts[3]++;
      else counts[4]++;
    }

    const palette = [
      CHART_GREEN_PRIMARY,
      CHART_WARNING,
      CHART_WARNING,
      CHART_WARNING,
      CHART_DESTRUCTIVE,
    ];

    return labels.map((label, idx) => ({ label, count: counts[idx], fill: palette[idx] }));
  }, [data, isoThreshold, unacceptableThreshold]);

  return (
    <Card className="shadow-metric-card">
      <CardHeader>
        <CardTitle className="text-base">Daily Count Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="min-w-[480px]">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bins} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} label={{ value: 'Days', angle: -90, position: 'insideLeft' }} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { label: string; count: number };
                return (
                  <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
                    <div className="font-semibold mb-1">{p.label}</div>
                    <div><span className="text-muted-foreground">Days: </span><span className="font-semibold">{p.count}</span></div>
                  </div>
                );
              }} />
              <Bar dataKey="count" radius={[4,4,0,0]}>
                {bins.map((b, i) => (
                  <Cell key={`c-${i}`} fill={b.fill as string} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
