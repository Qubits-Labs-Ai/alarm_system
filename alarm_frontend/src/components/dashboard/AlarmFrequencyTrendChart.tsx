/**
 * AlarmFrequencyTrendChart - Daily Alarm Trend with ISO/EEMUA 191 Thresholds
 * Shows daily alarm counts with compliance thresholds and highlighted overload periods
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Scatter, ComposedChart } from 'recharts';
import { CHART_GREEN_PRIMARY, CHART_WARNING, CHART_DESTRUCTIVE } from '@/theme/chartColors';
import { TrendingUp, Calendar, AlertTriangle } from 'lucide-react';

interface AlarmFrequencyData {
  date: string;
  ts?: number; // epoch ms for robust numeric X axis
  alarm_count: number;
  is_over_288?: boolean;
  is_over_720?: boolean;
}

interface AlarmFrequencyTrendChartProps {
  data: AlarmFrequencyData[];
  isLoading?: boolean;
  totalDays?: number;
  daysOver288?: number;
  daysOver720?: number;
}

export function AlarmFrequencyTrendChart({ 
  data, 
  isLoading = false,
  totalDays,
  daysOver288,
  daysOver720
}: AlarmFrequencyTrendChartProps) {
  // Theme-driven colors (auto‑adapts to light/dark via CSS variables)
  const ISO_LINE_COLOR = CHART_WARNING;        // orange/yellow
  const CRITICAL_LINE_COLOR = CHART_DESTRUCTIVE; // red
  const TREND_LINE_COLOR = CHART_GREEN_PRIMARY;  // primary green
  
  // Sort by date to ensure the line connects in chronological order
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data]);

  // Custom dot renderer: color based on threshold violations
  const renderCustomDot = (props: { cx?: number; cy?: number; payload?: AlarmFrequencyData }) => {
    const { cx, cy, payload } = props;
    if (!payload) return null;
    
    const count = payload.alarm_count;
    let fill = TREND_LINE_COLOR; // Default green (project theme)
    
    if (count >= 720) {
      fill = CRITICAL_LINE_COLOR; // Red for critical
    } else if (count >= 288) {
      // Highlight at the ISO line and above until 720
      fill = ISO_LINE_COLOR; // Orange/Yellow
    }
    
    return (
      <circle 
        cx={cx} 
        cy={cy} 
        r={4} 
        fill={fill} 
        stroke={fill}
        strokeWidth={1}
      />
    );
  };

  // Calculate summary statistics
  const avgAlarms = useMemo(() => {
    if (data.length === 0) return 0;
    return data.reduce((sum, d) => sum + d.alarm_count, 0) / data.length;
  }, [data]);

  const maxAlarms = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.max(...data.map(d => d.alarm_count));
  }, [data]);

  const minAlarms = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.min(...data.map(d => d.alarm_count));
  }, [data]);

  if (isLoading) {
    return (
      <Card className="shadow-metric-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Daily Alarm Trend with ISO Thresholds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-muted-foreground">Loading chart data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="shadow-metric-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Daily Alarm Trend with ISO Thresholds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-muted-foreground">No data available</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-metric-card">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Daily Alarm Trend with ISO Thresholds
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              ISO/EEMUA 191 compliance analysis over {totalDays || data.length} days
            </p>
          </div>
          
          {/* Summary Stats */}
          <div className="flex gap-4 text-sm">
            <div className="text-right">
              <p className="text-muted-foreground">Average</p>
              <p className="font-semibold">{avgAlarms.toFixed(0)}/day</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">Peak</p>
              <p className="font-semibold text-destructive">{maxAlarms.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">Minimum</p>
              <p className="font-semibold text-success">{minAlarms.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Legend with compliance metrics */}
        <div className="flex items-center gap-6 mt-4 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5" style={{ background: TREND_LINE_COLOR }}></div>
            <span className="text-muted-foreground">Daily Alarm Count</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 border-t-2 border-dashed" style={{ borderColor: ISO_LINE_COLOR }}></div>
            <span className="text-muted-foreground">ISO Threshold (288/day)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 border-t-2 border-dashed" style={{ borderColor: CRITICAL_LINE_COLOR }}></div>
            <span className="text-muted-foreground">Unacceptable (720/day)</span>
          </div>
          {daysOver288 !== undefined && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" style={{ color: 'hsl(var(--chart-2))' }} />
              <span className="text-muted-foreground">{daysOver288} days &gt;288</span>
            </div>
          )}
          {daysOver720 !== undefined && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-muted-foreground">{daysOver720} days ≥720</span>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart
            data={sortedData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              }}
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              label={{ value: 'Number of Alarms', angle: -90, position: 'insideLeft' }}
              domain={[0, (dataMax: number) => Math.ceil(Math.max(720, dataMax) * 1.1)]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as { date: string; alarm_count: number };
                  const date = new Date(data.date);
                  const count = Number(data.alarm_count || 0);
                  const over720 = count >= 720;
                  const over288 = count > 288 && !over720;
                  const eq288 = count === 288;
                  const eq720 = count === 720;
                  return (
                    <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
                      <p className="font-semibold mb-2">
                        {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Alarms: </span>
                        <span className="font-semibold">{count.toLocaleString()}</span>
                      </p>
                      {over720 && (
                        <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Critical Overload (≥720)
                        </p>
                      )}
                      {over288 && (
                        <p className="text-sm mt-1" style={{ color: 'hsl(var(--chart-2))' }}>
                          ISO Non-Compliant (&gt;288)
                        </p>
                      )}
                      {!over288 && !over720 && !eq288 && (
                        <p className="text-sm text-success mt-1">ISO Compliant (≤288)</p>
                      )}
                      {eq288 && (
                        <p className="text-sm mt-1" style={{ color: ISO_LINE_COLOR }}>=288 (on ISO line)</p>
                      )}
                      {eq720 && (
                        <p className="text-sm text-destructive mt-1">=720 (on Unacceptable line)</p>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
            
            {/* Main trend line with threshold-based dot colors */}
            <Line 
              type="monotone" 
              dataKey="alarm_count" 
              stroke={TREND_LINE_COLOR}
              strokeWidth={2.5}
              dot={renderCustomDot}
              activeDot={{ r: 5, stroke: '#334155', fill: '#334155' }}
              isAnimationActive={false}
              name="Daily Alarm Count"
            />
            
            {/* ISO Threshold Line (288) */}
            <ReferenceLine 
              y={288} 
              stroke={ISO_LINE_COLOR} 
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{ value: '288', position: 'right', fill: ISO_LINE_COLOR }}
            />
            
            {/* Unacceptable Threshold Line (720) */}
            <ReferenceLine 
              y={720} 
              stroke={CRITICAL_LINE_COLOR} 
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{ value: '720', position: 'right', fill: CRITICAL_LINE_COLOR }}
            />

          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
