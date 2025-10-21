import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UnhealthyBar } from '@/types/dashboard';
import { CHART_GREEN_MEDIUM } from '@/theme/chartColors';
import { InsightButton } from '@/components/insights/InsightButton';
import { useInsightModal } from '@/components/insights/useInsightModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import TimeBinSlider from './TimeBinSlider';
import { Switch } from '@/components/ui/switch';

interface UnhealthyBarChartProps {
  data: UnhealthyBar[];
  threshold: number;
  topN: 1 | 3;
  onTopNChange: (value: 1 | 3) => void;
  isLoading?: boolean;
  plantId?: string;
  // Chart behavior: per-source keeps Top1/Top3 bins-per-source.
  // Flood mode crops long-tail visually with TopK buttons (Top 5/10/15/All).
  mode?: 'perSource' | 'flood';
  // Optional: active selected 10-min window label + clear
  activeWindowLabel?: string;
  onClearWindow?: () => void;
  // New: raw window ISO strings so we can show UTC alongside local
  activeWindowStart?: string;
  activeWindowEnd?: string;
  // V2: manual time selection controls
  onOpenTimePicker?: () => void; // optional external state hook
  onApplyTimePicker?: (startIso: string, endIso: string) => void;
  timePickerDomain?: { start: string; end: string; peakStart?: string; peakEnd?: string };
  // Global control: when provided, chart hides its own toggle and uses this value
  includeSystem?: boolean;
  // Optional: provide precomputed unhealthy windows (e.g., Top Flood Windows) for quick-pick
  unhealthyWindows?: Array<{ start: string; end: string; label?: string }>;
  // Optional: async validator to check if a selected window is unhealthy
  validateWindow?: (startIso: string, endIso: string) => Promise<boolean>;
}

export function UnhealthyBarChart({ 
  data, 
  threshold, 
  topN, 
  onTopNChange, 
  isLoading = false,
  plantId = 'pvcI',
  mode = 'perSource',
  activeWindowLabel,
  onClearWindow,
  activeWindowStart,
  activeWindowEnd,
  onOpenTimePicker,
  onApplyTimePicker,
  timePickerDomain,
  includeSystem: includeSystemProp,
  unhealthyWindows,
  validateWindow,
}: UnhealthyBarChartProps) {
  const { onOpen: openInsightModal } = useInsightModal();
  const plantLabel = plantId === 'pvcI' ? 'PVC-I' : (plantId === 'pvcII' ? 'PVC-II' : plantId.toUpperCase());

  // Classify meta/system sources (configurable heuristic)
  const isMetaSource = (name: string) => {
    const s = String(name || '').trim().toUpperCase();
    if (!s) return false;
    return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
  };

  const [includeSystemLocal, setIncludeSystemLocal] = useState(true);
  const includeSystem = includeSystemProp ?? includeSystemLocal;
  const formatTooltip = (value: number, name: string, props: { payload: UnhealthyBar }) => {
    const { payload } = props;
    if (!payload) return null;

    // Determine if this is aggregate data or window-specific data
    const isWindowSpecific = activeWindowLabel && activeWindowStart && activeWindowEnd;
    const isAggregateData = mode === 'flood' && !isWindowSpecific;

    // Calculate observation period for aggregate data
    let observationInfo = null;
    if (isAggregateData && payload.bin_start && payload.bin_end) {
      const startTime = new Date(payload.bin_start);
      const endTime = new Date(payload.bin_end);
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationHours = Math.round(durationMs / (1000 * 60 * 60));
      const durationDays = Math.round(durationHours / 24);
      const approxWindows = Math.floor(durationMs / (10 * 60 * 1000));
      
      observationInfo = {
        durationHours,
        durationDays,
        approxWindows,
        startTime,
        endTime,
      };
    }

    return (
      <div className="bg-popover text-popover-foreground p-3 rounded shadow-lg border">
        <p className="font-medium text-foreground">{payload.source}</p>
        <p className="text-sm text-muted-foreground">
          {isAggregateData ? 'Total alarm count' : 'Flood count'}: <span className="font-medium text-foreground">{payload.hits}</span>
        </p>
        {isAggregateData && observationInfo && (
          <>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium">
              ℹ️ Sum of alarms from unhealthy windows only
            </p>
            <p className="text-xs text-muted-foreground">
              Observation: <span className="font-medium text-foreground">
                {observationInfo.durationDays > 0 ? `${observationInfo.durationDays} days` : `${observationInfo.durationHours} hours`}
              </span> (~{observationInfo.approxWindows.toLocaleString()} total windows)
            </p>
            <p className="text-xs text-muted-foreground italic">
              Only windows with &gt;10 alarms/10min counted
            </p>
          </>
        )}
        {isWindowSpecific && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
            ✓ Single 10-minute window data
          </p>
        )}
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
        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
          {isAggregateData ? 'Observation range:' : 'Window:'}
        </p>
        <p className="text-xs text-muted-foreground">
          Local: {new Date(payload.bin_start).toLocaleString()} - {new Date(payload.bin_end).toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground">
          UTC: {new Date(payload.bin_start).toLocaleString(undefined, { timeZone: 'UTC' })} - {new Date(payload.bin_end).toLocaleString(undefined, { timeZone: 'UTC' })}
        </p>
      </div>
    );
  };

  // Declare all hooks BEFORE any early returns to keep hook order stable
  const topKDefault: number | 'all' = 10;
  const [topK, setTopK] = useState<number | 'all'>(topKDefault);

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

  const baseData: UnhealthyBar[] = includeSystem ? data : data.filter(d => !isMetaSource(d.source));
  const isEmpty = baseData.length === 0;

  // In flood mode, we visually crop to Top K and optionally aggregate the tail as "Others"
  // to avoid an unprofessional-looking long tail of tiny bars.

  let displayData: UnhealthyBar[] = baseData;
  if (mode === 'flood' && !isEmpty) {
    const k = topK ?? topKDefault;
    if (k !== 'all') {
      const cropped = baseData.slice(0, k);
      const rest = baseData.slice(k);
      const restSum = rest.reduce((acc, r) => acc + Number(r.hits || r.flood_count || 0), 0);
      // Build an aggregated Others bar if tail has any weight
      if (restSum >= threshold) {
        const ref = cropped[0] || baseData[0];
        const nowIso = new Date().toISOString();
        const others = {
          id: `others-${ref?.id || nowIso}`,
          source: 'Others',
          hits: restSum,
          threshold: threshold,
          over_by: Math.max(0, restSum - threshold),
          bin_start: ref?.bin_start || nowIso,
          bin_end: ref?.bin_end || nowIso,
        } as UnhealthyBar;
        displayData = [...cropped, others];
      } else {
        displayData = cropped;
      }
    }
  }

  const handleInsightClick = () => {
    const payload = data.map(d => ({
      source: d.source,
      flood_count: typeof d.flood_count === 'number' ? d.flood_count : d.hits,
      priority: d.priority || d.priority_severity,
    }));
    const title = `Unhealthy Bar Chart — ${plantLabel} — Top ${topN} — Threshold ${threshold}`;
    openInsightModal(payload, title);
  };

  return (
    <Card className="shadow-metric-card bg-dashboard-metric-card-bg">
      <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">
                Unhealthy Bar Chart
              </CardTitle>
              <CardDescription>
                {mode === 'flood' && !activeWindowLabel ? (
                  <>
                    Sources exceeding threshold of {threshold} hits
                    <span className="text-blue-600 dark:text-blue-400 font-medium ml-2">
                      (From unhealthy windows only)
                    </span>
                  </>
                ) : mode === 'flood' && activeWindowLabel ? (
                  <>
                    Sources exceeding threshold of {threshold} hits
                    <span className="text-green-600 dark:text-green-400 font-medium ml-2">
                      (Single 10-minute window)
                    </span>
                  </>
                ) : (
                  `Sources exceeding threshold of {threshold} hits`
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {mode === 'flood' && activeWindowLabel && (
                <div className="flex items-center gap-2">
                  <div className="text-xs px-2 py-1 rounded bg-muted text-foreground border">
                    {/* <div>Window: {activeWindowLabel}</div> */}
                    {activeWindowStart && activeWindowEnd && (
                      <div className="text-[10px] text-muted-foreground">
                        Local: {new Date(activeWindowStart).toLocaleString()} — {new Date(activeWindowEnd).toLocaleString()}<br />
                        UTC: {new Date(activeWindowStart).toLocaleString(undefined, { timeZone: 'UTC' })} — {new Date(activeWindowEnd).toLocaleString(undefined, { timeZone: 'UTC' })}
                      </div>
                    )}
                  </div>
                  {onClearWindow && (
                    <Button variant="outline" size="sm" onClick={onClearWindow}>Clear</Button>
                  )}
                </div>
              )}
            {mode === 'perSource' ? (
              <>
 
                <Button
                  variant={topN === 1 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    onTopNChange(1);
                    handleInsightClick();
                  }}
                >
                  Top 1
                </Button>
                <Button
                  variant={topN === 3 ? 'default' : 'outline'}
                  onClick={() => onTopNChange(3)}
                >
                  Top 3
                </Button>
              </>
            ) : (
              <>
                <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" title="Select a 10‑minute time window for the unhealthy bar chart">10‑min Window</Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto">
                    {timePickerDomain ? (
                      <TimeBinSlider
                        domainStart={timePickerDomain.start}
                        domainEnd={timePickerDomain.end}
                        initialStart={activeWindowStart || timePickerDomain.end}
                        windowMinutes={10}
                        stepMinutes={1}
                        onApply={(s, e) => onApplyTimePicker?.(s, e)}
                        onCancel={() => { /* popover closes on blur */ }}
                        peakWindowStart={timePickerDomain.peakStart}
                        peakWindowEnd={timePickerDomain.peakEnd}
                        onClear={onClearWindow}
                        unhealthyWindows={unhealthyWindows}
                        validateWindow={validateWindow}
                      />
                    ) : (
                      <div className="text-xs text-muted-foreground">Time picker unavailable (no domain)</div>
                    )}
                  </PopoverContent>
                </Popover>
                {includeSystemProp === undefined && (
                  <div className="flex items-center gap-2 pl-2 border-l">
                    <span className="text-xs text-muted-foreground">Include system</span>
                    <Switch checked={includeSystemLocal} onCheckedChange={setIncludeSystemLocal} />
                  </div>
                )}
                <Button
                  variant={(topK ?? topKDefault) === 5 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTopK(5)}
                >
                  Top 5
                </Button>
                <Button
                  variant={(topK ?? topKDefault) === 10 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTopK(10)}
                >
                  Top 10
                </Button>
                <Button
                  variant={(topK ?? topKDefault) === 15 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTopK(15)}
                >
                  Top 15
                </Button>
                <Button
                  variant={(topK ?? topKDefault) === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTopK('all')}
                >
                  All
                </Button>
              </>
            )}
            <InsightButton onClick={handleInsightClick} disabled={isLoading || isEmpty} />
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
          <>
          <div className="h-80 overflow-x-auto">
            <div className="h-full min-w-[640px] md:min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={displayData}
                margin={{
                  top: 24,
                  right: 120,
                  left: 70,
                  bottom: 80,
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
                  tickMargin={8}
                  label={{ 
                    value: mode === 'flood' && !activeWindowLabel ? 'Total alarm count' : 'Flood count', 
                    angle: -90, 
                    position: 'left', 
                    offset: 10, 
                    fill: 'var(--muted-foreground)' 
                  }}
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
                  isFront
                  label={{ 
                    value: `Threshold (${threshold})`, 
                    position: 'right',
                    fill: 'var(--muted-foreground)',
                    fontSize: 12,
                    dx: 8,
                    dy: -2,
                    textAnchor: 'start'
                  }}
                />
                <Bar 
                  dataKey="hits" 
                  fill={CHART_GREEN_MEDIUM}
                  radius={[4, 4, 0, 0]}
                  opacity={0.9}
                >
                  {displayData.map((d, i) => (
                    <Cell key={`cell-${d.id || i}`} fill={isMetaSource(d.source) ? 'hsl(var(--muted))' : CHART_GREEN_MEDIUM} stroke={isMetaSource(d.source) ? 'var(--border)' : undefined} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded" style={{background:'hsl(var(--muted))', border:'1px solid var(--border)'}}></span> 
              System (meta)
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded" style={{background: CHART_GREEN_MEDIUM}}></span> 
              Operational
            </div>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}