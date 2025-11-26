import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, RefreshCw, AlertTriangle } from 'lucide-react';
import { CHART_GREEN_PALE } from '@/theme/chartColors';
import { fetchPlantActualCalcHourlyMatrix } from '@/api/actualCalc';
import { HourlyMatrixResponse } from '@/types/actualCalc';

interface Props {
  className?: string;
  plantId: string;
  includeSystem?: boolean;
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

const SeasonalityHeatmap: React.FC<Props> = ({
  className,
  plantId,
  includeSystem = false,
}) => {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<HourlyMatrixResponse | null>(null);
  const [loadingSeconds, setLoadingSeconds] = React.useState<number>(0);
  const reqRef = React.useRef(0);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId, includeSystem]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      setLoadingSeconds(0);
      const myReq = ++reqRef.current;

      // Start timer
      timerRef.current = setInterval(() => {
        setLoadingSeconds(prev => prev + 1);
      }, 1000);

      const response = await fetchPlantActualCalcHourlyMatrix(plantId, {
        include_system: includeSystem,
        timeout_ms: 360000,
      });

      if (myReq === reqRef.current) {
        setData(response);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load seasonality data';
      setError(msg);
      console.error('SeasonalityHeatmap fetch error:', err);
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setLoading(false);
    }
  }

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  if (loading) {
    const minutes = Math.floor(loadingSeconds / 60);
    const seconds = loadingSeconds % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-[500px]">
          <div className="text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
            <div>
              <p className="text-muted-foreground font-medium">Computing seasonality matrix...</p>
              <p className="text-sm text-muted-foreground mt-1">Elapsed: {timeStr}</p>
              {loadingSeconds > 60 && loadingSeconds < 120 && (
                <p className="text-xs text-muted-foreground mt-2">This may take 2-4 minutes for large datasets</p>
              )}
              {loadingSeconds >= 120 && (
                <p className="text-xs text-amber-600 mt-2">Still processing... Please wait</p>
              )}
            </div>
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

  const isEmpty = !data || !data.matrix || data.matrix.length === 0;

  if (isEmpty) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Alarm Seasonality
          </CardTitle>
          <CardDescription>Hour-of-day × Day-of-week pattern</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            No seasonality data available.
          </div>
        </CardContent>
      </Card>
    );
  }

  // Create 7×24 matrix
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  data.matrix.forEach(cell => {
    matrix[cell.dow][cell.hour] = cell.avg_activations;
  });

  // Find min/max for color scaling
  const allValues = data.matrix.map(c => c.avg_activations);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);

  // Get color for value (green scale)
  const getColor = (value: number) => {
    if (value === 0) return '#f3f4f6'; // gray-100

    const normalized = (value - minValue) / (maxValue - minValue || 1);

    // Green scale from light to dark
    if (normalized < 0.2) return '#d1fae5'; // green-100
    if (normalized < 0.4) return '#6ee7b7'; // green-300
    if (normalized < 0.6) return '#34d399'; // green-400
    if (normalized < 0.8) return '#10b981'; // green-500
    return '#059669'; // green-600
  };

  // Calculate statistics
  const totalAvg = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  const peakValue = maxValue;
  const peakCell = data.matrix.find(c => c.avg_activations === peakValue);
  const peakTime = peakCell ? `${DOW_LABELS[peakCell.dow]} ${HOUR_LABELS[peakCell.hour]}` : 'N/A';

  // Weekend vs Weekday Analysis
  const weekdayIndices = [0, 1, 2, 3, 4]; // Mon-Fri
  const weekendIndices = [5, 6]; // Sat-Sun

  const weekdayValues = data.matrix.filter(c => weekdayIndices.includes(c.dow)).map(c => c.avg_activations);
  const weekendValues = data.matrix.filter(c => weekendIndices.includes(c.dow)).map(c => c.avg_activations);

  const weekdayAvg = weekdayValues.length > 0 ? weekdayValues.reduce((a, b) => a + b, 0) / weekdayValues.length : 0;
  const weekendAvg = weekendValues.length > 0 ? weekendValues.reduce((a, b) => a + b, 0) / weekendValues.length : 0;

  const weekdayWeekendDiff = weekdayAvg - weekendAvg;
  const weekdayWeekendDiffPct = weekdayAvg > 0 ? (weekdayWeekendDiff / weekdayAvg) * 100 : 0;

  // Calculate variance (standard deviation) for each group
  const calculateStdDev = (values: number[], mean: number) => {
    if (values.length === 0) return 0;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  };

  const weekdayStdDev = calculateStdDev(weekdayValues, weekdayAvg);
  const weekendStdDev = calculateStdDev(weekendValues, weekendAvg);

  // Determine pattern insights
  const hasSignificantDifference = Math.abs(weekdayWeekendDiffPct) > 15; // >15% difference is significant
  const weekendHigher = weekendAvg > weekdayAvg;
  const highVariance = weekdayStdDev > weekdayAvg * 0.3 || weekendStdDev > weekendAvg * 0.3; // >30% coefficient of variation

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Alarm Seasonality
            </CardTitle>
            <CardDescription>
              Average activations per hour-of-day × day-of-week
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Heatmap */}
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Hour labels */}
            <div className="flex mb-1">
              <div className="w-16 flex-shrink-0" /> {/* Spacer for DOW labels */}
              {HOUR_LABELS.map((hour, idx) => (
                <div
                  key={idx}
                  className="flex-1 min-w-[32px] text-xs text-center text-muted-foreground"
                  title={hour}
                >
                  {idx % 3 === 0 ? hour.split(':')[0] : ''}
                </div>
              ))}
            </div>

            {/* Heatmap rows */}
            {matrix.map((row, dowIdx) => {
              const isWeekend = weekendIndices.includes(dowIdx);
              return (
                <div key={dowIdx} className={`flex mb-1 ${isWeekend ? 'rounded-md bg-muted/30 border border-muted-foreground/10' : ''}`}>
                  {/* DOW label */}
                  <div className={`w-16 flex-shrink-0 flex items-center justify-end pr-2 text-sm font-medium ${isWeekend ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {DOW_LABELS[dowIdx]}
                  </div>

                  {/* Hour cells */}
                  {row.map((value, hourIdx) => (
                    <div
                      key={hourIdx}
                      className="flex-1 min-w-[32px] h-8 rounded-sm border border-background cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                      style={{ backgroundColor: getColor(value) }}
                      title={`${DOW_LABELS[dowIdx]} ${HOUR_LABELS[hourIdx]}: ${value.toFixed(1)} avg activations`}
                    >
                      {value > 0 && value === maxValue && (
                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs">
                          ★
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Intensity:</span>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded" style={{ backgroundColor: '#f3f4f6' }} />
            <span className="text-xs text-muted-foreground">Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded" style={{ backgroundColor: '#6ee7b7' }} />
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded" style={{ backgroundColor: '#10b981' }} />
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded" style={{ backgroundColor: '#059669' }} />
            <span className="text-xs text-muted-foreground">High</span>
          </div>
        </div>

        {/* Statistics */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground mb-1">Average (All Hours)</div>
            <div className="text-2xl font-bold">{totalAvg.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">activations/hour</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground mb-1">Peak Hour</div>
            <div className="text-2xl font-bold">{peakValue.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">{peakTime}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground mb-1">Peak vs Average</div>
            <div className="text-2xl font-bold">×{(peakValue / totalAvg).toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">times higher</div>
          </div>
          <div className="rounded-lg border p-3 bg-muted/20">
            <div className="text-muted-foreground mb-1">Weekday Average</div>
            <div className="text-2xl font-bold">{weekdayAvg.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">Mon-Fri</div>
          </div>
          <div className="rounded-lg border p-3 bg-muted/20">
            <div className="text-muted-foreground mb-1">Weekend Average</div>
            <div className="text-2xl font-bold">{weekendAvg.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">Sat-Sun</div>
          </div>
        </div>

        {/* Insights */}
        <div className="mt-4 space-y-3">
          {/* Weekend vs Weekday Analysis */}
          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className={`h-2 w-2 rounded-full ${hasSignificantDifference ? 'bg-amber-500' : 'bg-green-500'}`} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold mb-2">Weekend vs Weekday Pattern Analysis</div>
                <div className="text-sm text-muted-foreground space-y-2">
                  {hasSignificantDifference ? (
                    <>
                      <p>
                        <strong className="text-foreground">Significant operational difference detected:</strong> {' '}
                        {weekendHigher ? 'Weekend' : 'Weekday'} alarm activity is{' '}
                        <strong className="text-foreground">{Math.abs(weekdayWeekendDiffPct).toFixed(1)}% {weekendHigher ? 'higher' : 'lower'}</strong>{' '}
                        ({weekendHigher ? 'Weekend' : 'Weekday'}: {(weekendHigher ? weekendAvg : weekdayAvg).toFixed(1)} vs{' '}
                        {weekendHigher ? 'Weekday' : 'Weekend'}: {(weekendHigher ? weekdayAvg : weekendAvg).toFixed(1)} avg activations/hour).
                      </p>
                      <p className="text-xs">
                        <strong>What this means:</strong> {weekendHigher
                          ? 'Higher weekend activity may indicate understaffing, deferred maintenance issues surfacing, or different operational procedures during weekends.'
                          : 'Lower weekend activity suggests reduced production schedules, better staffing ratios, or planned downtime for maintenance.'
                        }
                      </p>
                      <p className="text-xs">
                        <strong>Recommended action:</strong> {weekendHigher
                          ? 'Review weekend staffing levels, investigate recurring weekend alarms, and consider if weekend maintenance activities are triggering unnecessary alarms.'
                          : 'This pattern is typical for batch or scheduled operations. Ensure weekend alarm coverage is adequate for the reduced activity level.'
                        }
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        <strong className="text-foreground">Consistent operational pattern:</strong> {' '}
                        Weekend and weekday alarm activity are similar (difference: {Math.abs(weekdayWeekendDiffPct).toFixed(1)}%),
                        indicating <strong className="text-foreground">24/7 continuous operations</strong> with minimal schedule variation.
                      </p>
                      <p className="text-xs">
                        <strong>What this means:</strong> Your process operates consistently throughout the week, suggesting continuous manufacturing,
                        stable staffing patterns, and uniform operational procedures regardless of the day.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Variance Analysis */}
          {highVariance && (
            <div className="rounded-lg border p-4 bg-amber-50 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-semibold mb-2 text-amber-900 dark:text-amber-100">High Time-Based Variability Detected</div>
                  <div className="text-sm text-amber-800 dark:text-amber-200 space-y-2">
                    <p>
                      Alarm patterns show <strong>high variance</strong> across different hours and days
                      (Weekday σ: {weekdayStdDev.toFixed(1)}, Weekend σ: {weekendStdDev.toFixed(1)}),
                      indicating <strong>unpredictable operational behavior</strong>.
                    </p>
                    <p className="text-xs">
                      <strong>Potential causes:</strong> Shift changes, batch processing cycles, equipment cycling,
                      or inconsistent operational procedures. High variability makes it harder to establish normal operating patterns.
                    </p>
                    <p className="text-xs">
                      <strong>Recommended action:</strong> Investigate peak hours for root causes, standardize shift handover procedures,
                      and consider time-based alarm suppression for known operational cycles.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* General Operational Patterns */}
          <div className="rounded-lg p-3" style={{ backgroundColor: CHART_GREEN_PALE }}>
            <div className="text-sm text-foreground font-medium mb-1">How to Read This Chart</div>
            <ul className="text-sm text-muted-foreground list-disc ml-5 space-y-1">
              <li><strong>Darker cells</strong> indicate higher alarm activity during that specific hour and day combination</li>
              <li><strong>Star (★)</strong> marks the peak hour with the highest average alarm activations across all weeks</li>
              <li><strong>Weekend rows</strong> (Sat/Sun) are highlighted to make day-of-week patterns easier to spot</li>
              <li><strong>Vertical patterns</strong> (same hour across days) reveal time-based cycles like shift changes or batch processes</li>
              <li><strong>Horizontal patterns</strong> (same day across hours) show daily operational rhythms and equipment behavior</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SeasonalityHeatmap;
