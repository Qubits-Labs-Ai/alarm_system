import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, RefreshCw, AlertTriangle } from 'lucide-react';
import { CHART_GREEN_PALE } from '@/theme/chartColors';
import { fetchPlantActualCalcOverall } from '@/api/actualCalc';
import { ActualCalcOverallResponse } from '@/types/actualCalc';

interface Props {
  className?: string;
  plantId: string;
}

interface DayCell {
  date: string;
  count: number;
  status: 'ok' | 'manageable' | 'overloaded' | 'unacceptable';
}

const CalendarDailyHeatmap: React.FC<Props> = ({
  className,
  plantId,
}) => {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ActualCalcOverallResponse | null>(null);
  const reqRef = React.useRef(0);

  React.useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const myReq = ++reqRef.current;

      const response = await fetchPlantActualCalcOverall(plantId, {
        timeout_ms: 60000,
      });

      if (myReq === reqRef.current) {
        setData(response);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load frequency data';
      setError(msg);
      console.error('CalendarDailyHeatmap fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-muted-foreground">Loading calendar data...</p>
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

  const isEmpty = !data || !data.frequency || !data.frequency.alarms_per_day || data.frequency.alarms_per_day.length === 0;

  if (isEmpty) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Daily Alarm Calendar
          </CardTitle>
          <CardDescription>ISO 18.2 compliance heatmap</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            No frequency data available.
          </div>
        </CardContent>
      </Card>
    );
  }

  const alarmsPerDay = data.frequency.alarms_per_day;
  const isoThreshold = data.frequency.params?.iso_threshold || 288;
  const unacceptableThreshold = data.frequency.params?.unacceptable_threshold || 720;

  // Process data into calendar cells
  const dayCells: DayCell[] = alarmsPerDay.map((day: { Date: string; Alarm_Count: number }) => {
    const count = day.Alarm_Count || 0;
    let status: 'ok' | 'manageable' | 'overloaded' | 'unacceptable' = 'ok';
    
    if (count >= unacceptableThreshold) {
      status = 'unacceptable';
    } else if (count >= isoThreshold) {
      status = 'overloaded';
    } else if (count >= isoThreshold * 0.75) {
      status = 'manageable';
    }

    return {
      date: day.Date,
      count,
      status,
    };
  });

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
        return '#10b981'; // green-500
      case 'manageable':
        return '#fbbf24'; // amber-400
      case 'overloaded':
        return '#f97316'; // orange-500
      case 'unacceptable':
        return '#dc2626'; // red-600
      default:
        return '#6b7280'; // gray-500
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ok':
        return 'OK';
      case 'manageable':
        return 'Manageable';
      case 'overloaded':
        return 'Overloaded';
      case 'unacceptable':
        return 'Unacceptable';
      default:
        return 'Unknown';
    }
  };

  // Group by weeks (7 days each)
  const weeks: DayCell[][] = [];
  for (let i = 0; i < dayCells.length; i += 7) {
    weeks.push(dayCells.slice(i, i + 7));
  }

  // Calculate statistics
  const okDays = dayCells.filter(d => d.status === 'ok').length;
  const manageableDays = dayCells.filter(d => d.status === 'manageable').length;
  const overloadedDays = dayCells.filter(d => d.status === 'overloaded').length;
  const unacceptableDays = dayCells.filter(d => d.status === 'unacceptable').length;
  const totalDays = dayCells.length;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Daily Alarm Calendar
            </CardTitle>
            <CardDescription>
              ISO 18.2 compliance heatmap ({totalDays} days analyzed)
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: getStatusColor('ok') }} />
            <span>OK (&lt;{Math.round(isoThreshold * 0.75)})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: getStatusColor('manageable') }} />
            <span>Manageable ({Math.round(isoThreshold * 0.75)}-{isoThreshold - 1})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: getStatusColor('overloaded') }} />
            <span>Overloaded ({isoThreshold}-{unacceptableThreshold - 1})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: getStatusColor('unacceptable') }} />
            <span>Unacceptable (≥{unacceptableThreshold})</span>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="space-y-1 overflow-x-auto">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="flex gap-1">
              {week.map((day, dayIdx) => {
                const dateObj = new Date(day.date);
                const dayLabel = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                
                return (
                  <div
                    key={dayIdx}
                    className="flex-1 min-w-[80px] h-16 rounded border flex flex-col items-center justify-center text-xs cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                    style={{ backgroundColor: getStatusColor(day.status) }}
                    title={`${dayLabel}: ${day.count} alarms (${getStatusLabel(day.status)})`}
                  >
                    <div className="font-semibold text-white">{dayLabel}</div>
                    <div className="text-white/90">{day.count}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Statistics */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground mb-1">OK Days</div>
            <div className="text-2xl font-bold text-green-600">{okDays}</div>
            <div className="text-xs text-muted-foreground">{((okDays / totalDays) * 100).toFixed(1)}%</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground mb-1">Manageable</div>
            <div className="text-2xl font-bold text-amber-500">{manageableDays}</div>
            <div className="text-xs text-muted-foreground">{((manageableDays / totalDays) * 100).toFixed(1)}%</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground mb-1">Overloaded</div>
            <div className="text-2xl font-bold text-orange-500">{overloadedDays}</div>
            <div className="text-xs text-muted-foreground">{((overloadedDays / totalDays) * 100).toFixed(1)}%</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground mb-1">Unacceptable</div>
            <div className="text-2xl font-bold text-red-600">{unacceptableDays}</div>
            <div className="text-xs text-muted-foreground">{((unacceptableDays / totalDays) * 100).toFixed(1)}%</div>
          </div>
        </div>

        {/* Insights */}
        <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: CHART_GREEN_PALE }}>
          <div className="text-sm text-foreground font-medium mb-1">ISO 18.2 Compliance</div>
          <ul className="text-sm text-muted-foreground list-disc ml-5">
            <li>
              <span className="text-foreground font-medium">ISO Threshold</span>: {isoThreshold} alarms/day (acceptable limit)
            </li>
            <li>
              <span className="text-foreground font-medium">Unacceptable</span>: ≥{unacceptableThreshold} alarms/day (critical overload)
            </li>
            <li>
              Days exceeding ISO threshold: <span className="text-foreground font-medium">{overloadedDays + unacceptableDays}</span> ({(((overloadedDays + unacceptableDays) / totalDays) * 100).toFixed(1)}%)
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default CalendarDailyHeatmap;
