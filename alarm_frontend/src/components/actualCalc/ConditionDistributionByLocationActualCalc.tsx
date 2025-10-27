import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, MapPin, RefreshCw, BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  Label,
} from 'recharts';
import { getGreenPalette, CHART_GREEN_PRIMARY, CHART_GREEN_SECONDARY, CHART_WARNING, CHART_GREEN_PALE } from '@/theme/chartColors';
import { fetchPlantActualCalcConditionDistribution } from '@/api/actualCalc';
import { ActualCalcConditionDistributionResponse, ConditionDistItem } from '@/types/actualCalc';
import { InsightButton } from '@/components/insights/InsightButton';
import { useInsightModal } from '@/components/insights/useInsightModal';

interface Props {
  className?: string;
  plantId: string; // e.g., 'PVCI'
  includeSystem: boolean;
  startTime?: string; // ISO, optional
  endTime?: string;   // ISO, optional
}

const CONDITION_LIMIT = 10; // cap legend & stacks; remainder -> "Other"

export default function ConditionDistributionByLocationActualCalc({
  className,
  plantId,
  includeSystem,
  startTime,
  endTime,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ActualCalcConditionDistributionResponse | null>(null);
  const [top, setTop] = useState<5 | 10 | 15 | 20>(10);
  const [sort, setSort] = useState<'total' | 'az'>('total');
  const [windowMode, setWindowMode] = useState<'peak' | 'recent'>('peak');
  const reqRef = useRef(0);
  const { onOpen: openInsightModal } = useInsightModal();

  const hasRange = Boolean(startTime && endTime);

  const reload = async () => {
    try {
      setLoading(true);
      setError(null);
      const myReq = ++reqRef.current;
      const res = await fetchPlantActualCalcConditionDistribution(plantId, {
        start_time: hasRange ? startTime : undefined,
        end_time: hasRange ? endTime : undefined,
        window_mode: hasRange ? undefined : windowMode,
        include_system: includeSystem,
        top,
        sort,
        timeout_ms: 60_000, // cached path is fast; first compute is done elsewhere
      });
      if (myReq === reqRef.current) setData(res);
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'name' in e && (e as { name?: string }).name === 'AbortError') {
        setError('Request aborted');
      } else if (e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string') {
        setError((e as { message: string }).message);
      } else {
        setError('Failed to load condition distribution');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId, includeSystem, startTime, endTime, windowMode, top, sort]);

  interface ChartRow {
    location: string;
    total: number;
    latestTs: number | null;
    [key: string]: string | number | null;
  }

  const { chartData, conditionKeys, colorByCondition } = useMemo(() => {
    const items: ConditionDistItem[] = Array.isArray(data?.items) ? (data!.items as ConditionDistItem[]) : [];
    if (!items || items.length === 0) {
      return { chartData: [] as ChartRow[], conditionKeys: [] as string[], colorByCondition: new Map<string, string>() };
    }

    // Collect global condition keys and totals
    const condTotals = new Map<string, number>();
    for (const it of items) {
      const by = it.by_condition || {};
      for (const [cond, v] of Object.entries(by)) {
        const key = String(cond || 'NOT PROVIDED');
        condTotals.set(key, (condTotals.get(key) || 0) + Number(v || 0));
      }
    }
    const sortedConds = Array.from(condTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
    const condKeys = sortedConds.length <= CONDITION_LIMIT
      ? sortedConds
      : [...sortedConds.slice(0, CONDITION_LIMIT - 1), 'Other'];

    // Color palette
    const realConds = condKeys.filter(k => k !== 'Other');
    const palette = getGreenPalette(realConds.length);
    const colorByCondition = new Map<string, string>();
    realConds.forEach((cond, idx) => colorByCondition.set(cond, palette[idx] || CHART_GREEN_PRIMARY));
    if (condKeys.includes('Other')) colorByCondition.set('Other', CHART_GREEN_SECONDARY);

    // Materialize rows
    const dataRows: ChartRow[] = items.map((it) => {
      const row: ChartRow = { location: String(it.location || 'Unknown Location'), total: Number(it.total || 0), latestTs: (it.latest_ts as number | null) ?? null };
      let other = 0;
      for (const [cond, v] of Object.entries(it.by_condition || {})) {
        if (condKeys.includes(cond)) row[cond] = Number(v || 0);
        else other += Number(v || 0);
      }
      if (condKeys.includes('Other') && other > 0) row['Other'] = other;
      return row;
    });

    return { chartData: dataRows, conditionKeys: condKeys, colorByCondition };
  }, [data]);

  const handleInsightClick = () => {
    const payload: Array<{
      source: string;
      location_tag: string;
      condition: string;
      flood_count: number;
      total_at_location?: number;
      peak_window_end?: string;
    }> = [];

    (chartData || []).forEach((row: ChartRow) => {
      (conditionKeys || []).forEach((k: string) => {
        const v = row[k] as number | undefined;
        if (typeof v === 'number' && v > 0) {
          payload.push({
            source: String(row.location),
            location_tag: String(row.location),
            condition: k,
            flood_count: v,
            total_at_location: Number(row.total || 0),
            peak_window_end: row.latestTs ? new Date(row.latestTs).toISOString() : undefined,
          });
        }
      });
    });
    const title = `Condition Distribution by Location — ${plantId} — ${hasRange ? 'range' : windowMode} — Top ${top} — ${sort}`;
    openInsightModal(payload, title);
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p>Loading condition distribution...</p>
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
            <Button onClick={reload} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" /> Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isEmpty = !chartData || chartData.length === 0 || conditionKeys.length === 0;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Condition Distribution by Location (Actual‑Calc)
            </CardTitle>
            <CardDescription>
              {hasRange ? (
                <>Observation range applied • Top {top} locations • {sort === 'total' ? 'By Total' : 'A–Z'}</>
              ) : (
                <>Window: {windowMode === 'peak' ? 'Peak Activity' : 'Most Recent'} • Top {top} locations • {sort === 'total' ? 'By Total' : 'A–Z'}</>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {!hasRange && (
              <Select value={windowMode} onValueChange={(v) => setWindowMode(v as 'peak' | 'recent')}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Window" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Most Recent</SelectItem>
                  <SelectItem value="peak">Peak Activity</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={String(top)} onValueChange={(v) => setTop(Number(v) as 5 | 10 | 15 | 20)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="15">Top 15</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as 'total' | 'az')}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="total">By Total</SelectItem>
                <SelectItem value="az">A–Z</SelectItem>
              </SelectContent>
            </Select>
            <InsightButton onClick={handleInsightClick} disabled={isEmpty} />
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">No data for the selected options.</div>
        ) : (
          <>
            <div className="h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 30, bottom: 20, left: 160 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis type="number">
                    <Label value="Flood Count" position="insideBottomRight" offset={0} className="fill-current text-lg" />
                  </XAxis>
                  <YAxis type="category" dataKey="location" width={80} tick={{ fontSize: 12 }}>
                    <Label value="Location" angle={-90} position="insideLeft" className="fill-current text-lg" />
                  </YAxis>
                  <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.08 }} />
                  <Legend />

                  {conditionKeys.map((key) => (
                    <Bar key={key} dataKey={key} stackId="a" name={key} radius={[0, 0, 0, 0]} fill={colorByCondition.get(key) || CHART_GREEN_PRIMARY} isAnimationActive={false}>
                      {chartData.map((entry: ChartRow, index: number) => {
                        const val = Number(entry[key] ?? 0);
                        const base = colorByCondition.get(key) || CHART_GREEN_PRIMARY;
                        const fill = val > 0 && val >= dynamicHighThreshold(chartData, conditionKeys) ? CHART_WARNING : base;
                        return <Cell key={`cell-${key}-${index}`} fill={fill} />
                      })}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Insights */}
            <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: CHART_GREEN_PALE }}>
              <div className="text-sm text-foreground font-medium mb-1">Key Insights</div>
              <ul className="text-sm text-muted-foreground list-disc ml-5">
                <li>Focus on the top rows to address locations with the highest total flood.</li>
                <li>Use the legend to toggle condition stacks and isolate specific patterns (e.g., PVHIGH vs PVLOW).</li>
                <li>"Unknown Location" groups sources where the location tag is missing or not provided.</li>
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Compute a dynamic high threshold (85th percentile of all non-zero segments)
function dynamicHighThreshold(chartData: Array<{ [key: string]: string | number | null }>, conditionKeys: string[]): number {
  const segmentValues: number[] = [];
  for (const row of chartData) {
    for (const key of conditionKeys) {
      const v = row[key];
      if (typeof v === 'number' && v > 0) segmentValues.push(v);
    }
  }
  segmentValues.sort((a, b) => a - b);
  const idx = segmentValues.length > 0 ? Math.floor((segmentValues.length - 1) * 0.85) : -1;
  return idx >= 0 ? segmentValues[idx] : Number.POSITIVE_INFINITY;
}
