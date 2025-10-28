import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_GREEN_PRIMARY, CHART_WARNING, CHART_DESTRUCTIVE } from '@/theme/chartColors';

export interface WeeklyComplianceBarsProps {
  data: Array<{ Date: string; Alarm_Count: number }>;
  isoThreshold: number;
  unacceptableThreshold: number;
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export default function WeeklyComplianceBars({ data, isoThreshold, unacceptableThreshold }: WeeklyComplianceBarsProps) {
  const rows = useMemo(() => {
    const map = new Map<string, { week: string; compliant: number; overloaded: number; unacceptable: number }>();
    for (const r of data) {
      const v = Number(r.Alarm_Count || 0);
      const key = isoWeekKey(r.Date);
      if (!map.has(key)) map.set(key, { week: key, compliant: 0, overloaded: 0, unacceptable: 0 });
      const obj = map.get(key)!;
      if (v <= isoThreshold) obj.compliant += 1;
      else if (v < unacceptableThreshold) obj.overloaded += 1;
      else obj.unacceptable += 1;
    }
    return Array.from(map.values()).sort((a,b) => a.week.localeCompare(b.week));
  }, [data, isoThreshold, unacceptableThreshold]);

  return (
    <Card className="shadow-metric-card">
      <CardHeader>
        <CardTitle className="text-base">Weekly Compliance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="min-w-[560px]">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} label={{ value: 'Days', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="compliant" stackId="a" name={`≤${isoThreshold}`} fill={CHART_GREEN_PRIMARY} />
              <Bar dataKey="overloaded" stackId="a" name={`${isoThreshold+1}–${unacceptableThreshold-1}`} fill={CHART_WARNING} />
              <Bar dataKey="unacceptable" stackId="a" name={`≥${unacceptableThreshold}`} fill={CHART_DESTRUCTIVE} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
