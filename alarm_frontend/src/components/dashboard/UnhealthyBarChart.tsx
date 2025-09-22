import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UnhealthyBar } from '@/types/dashboard';
import { CHART_GREEN_MEDIUM } from '@/theme/chartColors';

interface UnhealthyBarChartProps {
  data: UnhealthyBar[];
  threshold: number;
  topN: 1 | 3;
  onTopNChange: (value: 1 | 3) => void;
  isLoading?: boolean;
}

export function UnhealthyBarChart({ 
  data, 
  threshold, 
  topN, 
  onTopNChange, 
  isLoading = false 
}: UnhealthyBarChartProps) {
  const formatTooltip = (value: number, name: string, props: any) => {
    const { payload } = props;
    if (!payload) return null;

    return [
      <div key="tooltip" className="bg-dashboard-chart-tooltip-bg p-3 rounded shadow-lg border">
        <p className="font-medium text-foreground">{payload.source}</p>
        <p className="text-sm text-muted-foreground">
          Flood count: <span className="font-medium text-foreground">{payload.hits}</span>
        </p>
        {/* <p className="text-sm text-muted-foreground">
          Over threshold by: <span className="font-medium text-red-600">{payload.over_by}</span>
        </p> */}
        {(payload.priority || payload.priority_severity) && (
          <p className="text-sm text-muted-foreground">
            Priority: <span className="font-medium text-foreground">{payload.priority || payload.priority_severity}</span>
          </p>
        )}
        {payload.condition && (
          <p className="text-sm text-muted-foreground">
            Condition: <span className="font-medium text-foreground">{payload.condition}</span>
          </p>
        )}
        {payload.action && payload.action !== 'Not Provided' && (
          <p className="text-sm text-muted-foreground">
            Action: <span className="font-medium text-foreground">{payload.action}</span>
          </p>
        )}
        {payload.location_tag && (
          <p className="text-sm text-muted-foreground">
            Location: <span className="font-medium text-foreground">{payload.location_tag}</span>
          </p>
        )}
        {payload.description && payload.description !== 'Not Provided' && (
          <p className="text-sm text-muted-foreground">
            Description: <span className="font-medium text-foreground">{payload.description}</span>
          </p>
        )}
        {payload.setpoint_value !== undefined && payload.setpoint_value !== null && (
          <p className="text-sm text-muted-foreground">
            Setpoint: <span className="font-medium text-foreground">{String(payload.setpoint_value)}{payload.raw_units ? ` ${payload.raw_units}` : ''}</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(payload.bin_start).toLocaleString()} - {new Date(payload.bin_end).toLocaleString()}
        </p>
      </div>
    ];
  };

  if (isLoading) {
    return (
      <Card className="shadow-metric-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="h-6 w-48 bg-muted animate-pulse rounded mb-2" />
              <div className="h-4 w-64 bg-muted animate-pulse rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-12 bg-muted animate-pulse rounded" />
              <div className="h-8 w-12 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const isEmpty = data.length === 0;

  return (
    <Card className="shadow-metric-card bg-dashboard-metric-card-bg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">
              Unhealthy Bar Chart
            </CardTitle>
            <CardDescription>
              Sources exceeding threshold of {threshold} hits
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={topN === 1 ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTopNChange(1)}
            >
              Top 1
            </Button>
            <Button
              variant={topN === 3 ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTopNChange(3)}
            >
              Top 3
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="h-80 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium text-muted-foreground">
                All sources are healthy in the selected window.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                No sources exceed the threshold of {threshold} hits.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{
                  top: 20,
                  right: 30,
                  left: 20,
                  bottom: 70,
                }}
              >
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="var(--chart-grid)"
                  opacity={0.3}
                />
                <XAxis 
                  dataKey="source" 
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  angle={-45}
                  textAnchor="end"
                  height={70}
                  label={{ value: 'Alarm Source', position: 'bottom', offset: 10, fill: 'var(--muted-foreground)' }}
                />
                <YAxis 
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  label={{ value: 'Flood count', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--muted-foreground)' }}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return formatTooltip(payload[0].value as number, 'Flood count', payload[0]);
                    }
                    return null;
                  }}
                  cursor={{ fill: 'var(--accent)', opacity: 0.1 }}
                />
                <ReferenceLine 
                  y={threshold} 
                  stroke="var(--muted-foreground)" 
                  strokeDasharray="5 5"
                  label={{ 
                    value: `Threshold (${threshold})`, 
                    position: 'right',
                    fill: 'var(--muted-foreground)',
                    fontSize: 12
                  }}
                />
                <Bar 
                  dataKey="hits" 
                  fill={CHART_GREEN_MEDIUM}
                  radius={[4, 4, 0, 0]}
                  opacity={0.8}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}