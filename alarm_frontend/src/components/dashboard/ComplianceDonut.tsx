import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pie, PieChart, ResponsiveContainer, Cell, Tooltip, Legend } from 'recharts';
import { CHART_GREEN_PRIMARY, CHART_WARNING, CHART_DESTRUCTIVE } from '@/theme/chartColors';

export interface ComplianceDonutProps {
  data: Array<{ Date: string; Alarm_Count: number }>;
  isoThreshold: number;
  unacceptableThreshold: number;
}

export default function ComplianceDonut({ data, isoThreshold, unacceptableThreshold }: ComplianceDonutProps) {
  const counts = { compliant: 0, overloaded: 0, unacceptable: 0 };
  for (const r of data) {
    const v = Number(r.Alarm_Count || 0);
    if (v <= isoThreshold) counts.compliant++; else if (v < unacceptableThreshold) counts.overloaded++; else counts.unacceptable++;
  }
  const total = Math.max(1, data.length);
  const chart = [
    { name: `≤${isoThreshold}`, value: counts.compliant, color: CHART_GREEN_PRIMARY },
    { name: `${isoThreshold+1}–${unacceptableThreshold-1}`, value: counts.overloaded, color: CHART_WARNING },
    { name: `≥${unacceptableThreshold}`, value: counts.unacceptable, color: CHART_DESTRUCTIVE },
  ];
  const pct = ((counts.compliant / total) * 100).toFixed(1);

  return (
    <Card className="shadow-metric-card">
      <CardHeader>
        <CardTitle className="text-base">Compliance Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 items-center">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chart} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} stroke="none">
                  {chart.map((c, i) => (<Cell key={i} fill={c.color} />))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center md:text-left space-y-1">
            <div className="text-3xl font-bold">{pct}%</div>
            <div className="text-muted-foreground text-sm">Days at or below ISO threshold</div>
            <div className="text-xs text-muted-foreground">Total days analyzed: {total}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
