import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getGreenPalette, CHART_GREEN_PRIMARY, CHART_GREEN_PALE } from '@/theme/chartColors';
import { fetchPlantActualCalcCategoryTimeSeries } from '@/api/actualCalc';
import { CategoryTimeSeriesResponse, CategoryTimeSeriesItem } from '@/types/actualCalc';

interface Props {
  className?: string;
  plantId: string;
  includeSystem?: boolean;
}

const CATEGORY_COLORS = {
  standing: '#dc2626', // red-600
  nuisance: '#f59e0b', // amber-500
  flood: '#3b82f6',   // blue-500
  other: '#6b7280',   // gray-500
};

const CATEGORY_LABELS = {
  standing: 'Standing',
  nuisance: 'Nuisance',
  flood: 'Flood',
  other: 'Other',
};

const CategoryTrendArea: React.FC<Props> = ({
  className,
  plantId,
  includeSystem = false,
}) => {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<CategoryTimeSeriesResponse | null>(null);
  const [grain, setGrain] = React.useState<'day' | 'week' | 'month'>('day');
  const [loadingSeconds, setLoadingSeconds] = React.useState<number>(0);
  const reqRef = React.useRef(0);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId, includeSystem, grain]);

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

      const response = await fetchPlantActualCalcCategoryTimeSeries(plantId, {
        grain,
        include_system: includeSystem,
        timeout_ms: 360000, // allow heavy first-run computation
      });

      if (myReq === reqRef.current) {
        setData(response);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load category trend';
      setError(msg);
      console.error('CategoryTrendArea fetch error:', err);
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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);

    return (
      <div className="bg-popover text-popover-foreground p-3 rounded border shadow-lg min-w-[200px]">
        <div className="font-semibold text-foreground mb-2">{label}</div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div className="font-medium">Total: {total.toLocaleString()}</div>
          {payload
            .slice()
            .reverse()
            .map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded"
                    style={{ backgroundColor: entry.color }}
                  />
                  {entry.name}
                </span>
                <span className="text-foreground font-medium">
                  {entry.value.toLocaleString()} ({total ? Math.round((entry.value / total) * 100) : 0}%)
                </span>
              </div>
            ))}
        </div>
      </div>
    );
  };

  if (loading) {
    const minutes = Math.floor(loadingSeconds / 60);
    const seconds = loadingSeconds % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
            <div>
              <p className="text-muted-foreground font-medium">Computing category trend...</p>
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

  const isEmpty = !data || !data.series || data.series.length === 0;

  if (isEmpty) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Category Trend — {grain === 'day' ? 'Daily' : grain === 'week' ? 'Weekly' : 'Monthly'}
              </CardTitle>
              <CardDescription>Exclusive alarm category breakdown over time</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={grain} onValueChange={(v) => setGrain(v as 'day' | 'week' | 'month')}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Daily</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            No alarm activations found.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Category Trend — {grain === 'day' ? 'Daily' : grain === 'week' ? 'Weekly' : 'Monthly'}
            </CardTitle>
            <CardDescription>
              Exclusive alarm category breakdown ({data.series.length} periods)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={grain} onValueChange={(v) => setGrain(v as 'day' | 'week' | 'month')}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data.series}
              margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                angle={grain === 'day' ? -45 : 0}
                textAnchor={grain === 'day' ? 'end' : 'middle'}
                height={grain === 'day' ? 80 : 60}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              
              {/* Stack in reverse order so Standing appears on top visually */}
              <Area
                type="monotone"
                dataKey="other"
                name={CATEGORY_LABELS.other}
                stackId="1"
                stroke={CATEGORY_COLORS.other}
                fill={CATEGORY_COLORS.other}
                fillOpacity={0.8}
              />
              <Area
                type="monotone"
                dataKey="flood"
                name={CATEGORY_LABELS.flood}
                stackId="1"
                stroke={CATEGORY_COLORS.flood}
                fill={CATEGORY_COLORS.flood}
                fillOpacity={0.8}
              />
              <Area
                type="monotone"
                dataKey="nuisance"
                name={CATEGORY_LABELS.nuisance}
                stackId="1"
                stroke={CATEGORY_COLORS.nuisance}
                fill={CATEGORY_COLORS.nuisance}
                fillOpacity={0.8}
              />
              <Area
                type="monotone"
                dataKey="standing"
                name={CATEGORY_LABELS.standing}
                stackId="1"
                stroke={CATEGORY_COLORS.standing}
                fill={CATEGORY_COLORS.standing}
                fillOpacity={0.8}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Insights */}
        <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: CHART_GREEN_PALE }}>
          <div className="text-sm text-foreground font-medium mb-1">Key Notes</div>
          <ul className="text-sm text-muted-foreground list-disc ml-5">
            <li>
              Categories use <span className="text-foreground font-medium">precedence</span>: Standing &gt; Nuisance &gt; Flood &gt; Other (mutually exclusive).
            </li>
            <li>
              Each alarm is classified once using the highest precedence category it qualifies for.
            </li>
            <li>
              <span className="text-foreground font-medium">Standing</span>: alarms active ≥ {data.params.stale_min} minutes.
            </li>
            <li>
              <span className="text-foreground font-medium">Nuisance</span>: chattering episodes (≥3 alarms in {data.params.chatter_min} minutes).
            </li>
            <li>
              <span className="text-foreground font-medium">Flood</span>: alarms during overlapping unhealthy periods from ≥2 sources.
            </li>
            <li>System/meta sources are {includeSystem ? 'included' : 'excluded'}.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default CategoryTrendArea;
