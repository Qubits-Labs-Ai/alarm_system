/**
 * ActualCalcTabs - Tabbed layout for PVC-I Actual Calc mode
 * Organizes KPIs and charts into three logical sections:
 * 1. Alarm Summary - Overall alarm counts, tree structure, and summary stats
 * 2. Frequency Metrics - Time-based alarm rates and ISO compliance
 * 3. Detailed Analytics - Unhealthy periods, flood windows, and bad actors
 */

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ActivationOverloadSummary from './ActivationOverloadSummary';
import { ActualCalcKPICards } from './ActualCalcKPICards';
import { ActualCalcTree } from './ActualCalcTree';
import { AlarmFrequencyTrendChart } from './AlarmFrequencyTrendChart';
import { BadActorsParetoChart } from '../actualCalc/BadActorsParetoChart';
import { UnhealthyPeriodsBarChart } from '../actualCalc/UnhealthyPeriodsBarChart';
import FloodsBubbleChart from '../actualCalc/FloodsBubbleChart';
import ConditionDistributionByLocationActualCalc from '../actualCalc/ConditionDistributionByLocationActualCalc';
import CategoryTrendArea from '../actualCalc/AlarmSummary/CategoryTrendArea';
import CompositionSankey from '../actualCalc/AlarmSummary/CompositionSankey';
import TotalsWaterfall from '../actualCalc/AlarmSummary/TotalsWaterfall';
import CalendarDailyHeatmap from '../actualCalc/AlarmSummary/CalendarDailyHeatmap';
import SeasonalityHeatmap from '../actualCalc/AlarmSummary/SeasonalityHeatmap';
import TopFloodWindowsChart, { TopFloodWindowRow } from './TopFloodWindowsChart';
import { UnhealthyBarChart } from './UnhealthyBarChart';
import DateTimeRangePicker from '@/components/dashboard/DateTimeRangePicker';
import { fetchPlantActualCalcSankey } from '@/api/actualCalc';
import { filterWindowsByRange, aggregateBarsFromWindows, buildTopActorsFromWindows, buildUnhealthyPeriodsFromWindows } from '@/lib/actualCalcRange';
import { 
  ActualCalcOverallResponse, 
  ActualCalcUnhealthyResponse, 
  ActualCalcFloodsResponse, 
  ActualCalcBadActorsResponse 
} from '@/types/actualCalc';
import { UnhealthyBar } from '@/types/dashboard';

interface ActualCalcTabsProps {
  // Data
  actualCalcData: ActualCalcOverallResponse;
  actualCalcUnhealthy: ActualCalcUnhealthyResponse | null;
  actualCalcFloods: ActualCalcFloodsResponse | null;
  actualCalcBadActors: ActualCalcBadActorsResponse | null;
  actualCalcLoading: boolean;
  
  // Window selection state (for Detailed Analytics)
  selectedWindow: { id: string; label: string; start: string; end: string } | null;
  onWindowChange: (window: { id: string; label: string; start: string; end: string } | null) => void;
  
  // Chart controls
  topWindowsTopK: 5 | 10 | 15;
  onTopKChange: (value: 5 | 10 | 15) => void;
  topN: 1 | 3;
  onTopNChange: (value: 1 | 3) => void;
  includeSystem: boolean;
  
  // Plant ID
  plantId: string;
}

// Additional state needed for new charts
const useBadActorsTopN = () => {
  const [badActorsTopN, setBadActorsTopN] = useState<5 | 10 | 15 | 20>(10);
  return { badActorsTopN, setBadActorsTopN };
};

const useUnhealthyPeriodsTopN = () => {
  const [unhealthyPeriodsTopN, setUnhealthyPeriodsTopN] = useState<10 | 15 | 20 | 25>(15);
  return { unhealthyPeriodsTopN, setUnhealthyPeriodsTopN };
};

export default function ActualCalcTabs({
  actualCalcData,
  actualCalcUnhealthy,
  actualCalcFloods,
  actualCalcBadActors,
  actualCalcLoading,
  selectedWindow,
  onWindowChange,
  topWindowsTopK,
  onTopKChange,
  topN,
  onTopNChange,
  includeSystem,
  plantId,
}: ActualCalcTabsProps) {
  const [activeTab, setActiveTab] = useState<'alarm' | 'frequency' | 'analytics'>('alarm');
  const { badActorsTopN, setBadActorsTopN } = useBadActorsTopN();
  const { unhealthyPeriodsTopN, setUnhealthyPeriodsTopN } = useUnhealthyPeriodsTopN();
  const [analyticsRange, setAnalyticsRange] = useState<{ startTime?: string; endTime?: string } | undefined>(undefined);

  // Hidden toggle: proactively warm Sankey caches for both include_system variants
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([
          fetchPlantActualCalcSankey(plantId, { include_system: true, timeout_ms: 360000 }),
          fetchPlantActualCalcSankey(plantId, { include_system: false, timeout_ms: 360000 }),
        ]);
      } catch {
        // ignore; charts/Tree will handle retries and errors
      }
    })();
    return () => { cancelled = true; };
  }, [plantId]);

  // Loading state skeleton for KPIs
  const loadingKPIs = {
    avg_ack_delay_min: 0,
    avg_ok_delay_min: 0,
    completion_rate_pct: 0,
    avg_alarms_per_day: 0,
    avg_alarms_per_hour: 0,
    avg_alarms_per_10min: 0,
    days_over_288_count: 0,
    days_over_288_alarms_pct: 0,
    days_unacceptable_count: 0,
    days_unacceptable_pct: 0,
    total_days_analyzed: 0,
    total_unique_alarms: 0,
  };

  const loadingCounts = {
    total_sources: 0,
    total_alarms: 0,
    total_stale: 0,
    total_standing: 0,
    total_instrument_failure: 0,
    total_chattering: 0,
    total_cycles: 0,
  };

  // Prepare chart data for Frequency Metrics tab
  const frequencyChartData = actualCalcData?.frequency ? (() => {
    const over288Dates = new Set(actualCalcData.frequency.days_over_288?.map(d => d.Date) || []);
    const over720Dates = new Set(actualCalcData.frequency.days_unacceptable?.map(d => d.Date) || []);
    return actualCalcData.frequency.alarms_per_day.map(item => ({
      date: item.Date,
      alarm_count: item.Alarm_Count,
      is_over_288: over288Dates.has(item.Date),
      is_over_720: over720Dates.has(item.Date),
    }));
  })() : [];

  // Prepare data for Detailed Analytics tab
  const detailedAnalyticsData = (() => {
    const threshold = actualCalcUnhealthy?.params?.unhealthy_threshold ?? 10;
    const timeStart = actualCalcData?.sample_range?.start || new Date().toISOString();
    const timeEnd = actualCalcData?.sample_range?.end || new Date().toISOString();

    // Decide windows to display based on optional analyticsRange
    const allWindows = (actualCalcFloods?.windows || []);
    const hasRange = Boolean(analyticsRange?.startTime && analyticsRange?.endTime);
    const usedWindows = hasRange
      ? filterWindowsByRange(allWindows, analyticsRange!.startTime!, analyticsRange!.endTime!)
      : allWindows;

    // Map floods -> rows
    const floodRows: TopFloodWindowRow[] = (usedWindows || []).map((w, idx) => {
      const id = w.id;
      const label = `${new Date(w.start).toLocaleString()} — ${new Date(w.end).toLocaleString()}`;
      const top_sources = w.top_sources || [];
      return { 
        id, 
        label, 
        flood_count: w.flood_count, 
        start: w.start, 
        end: w.end, 
        short_label: idx < 3 ? undefined : new Date(w.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
        rate_per_min: w.rate_per_min, 
        top_sources,
        start_ts: new Date(w.start).getTime(),
      };
    });

    // Aggregate unhealthy per source across all unhealthy windows
    const aggBars: UnhealthyBar[] = (actualCalcUnhealthy?.per_source || []).map((s) => {
      const hits = s.Unhealthy_Periods;
      return { 
        id: s.Source, 
        source: s.Source, 
        hits, 
        threshold, 
        over_by: Math.max(0, hits - threshold), 
        bin_start: timeStart, 
        bin_end: timeEnd 
      };
    }).sort((a, b) => b.hits - a.hits);

    // If a window is selected, build bars from contributions of that window
    let windowBars: UnhealthyBar[] | null = null;
    if (selectedWindow) {
      let match = (actualCalcFloods?.windows || []).find(w => w.id === selectedWindow.id);
      if (!match) {
        const sMs = new Date(selectedWindow.start).getTime();
        const eMs = new Date(selectedWindow.end).getTime();
        let bestOverlap = -1;
        for (const w of (actualCalcFloods?.windows || [])) {
          const ws = new Date(w.start).getTime();
          const we = new Date(w.end).getTime();
          const overlap = Math.max(0, Math.min(eMs, we) - Math.max(sMs, ws));
          if (overlap > bestOverlap) { bestOverlap = overlap; match = w; }
        }
      }
      if (match) {
        windowBars = Object.entries(match.sources_involved || {}).map(([source, count]) => ({
          id: `${match!.id}:${source}`,
          source,
          hits: Number(count || 0),
          threshold,
          over_by: Math.max(0, Number(count || 0) - threshold),
          bin_start: match.start,
          bin_end: match.end,
        })).sort((a, b) => b.hits - a.hits);
      }
    }

    const timePickerDomain = actualCalcData?.sample_range?.start && actualCalcData?.sample_range?.end 
      ? { start: actualCalcData.sample_range.start, end: actualCalcData.sample_range.end } 
      : undefined;

    // Range-based aggregates (apply when a range is selected and no single window is chosen)
    const rangeBars = hasRange
      ? aggregateBarsFromWindows(usedWindows, threshold, includeSystem, analyticsRange!.startTime!, analyticsRange!.endTime!)
      : null;
    const rangeBadActors = hasRange
      ? buildTopActorsFromWindows(usedWindows, includeSystem)
      : null;
    const rangeUnhealthy = hasRange
      ? buildUnhealthyPeriodsFromWindows(usedWindows, threshold, includeSystem)
      : null;
    const totalFloodCountRange = hasRange
      ? usedWindows.reduce((sum, w) => {
          const srcs = w?.sources_involved || {};
          const entries = Object.entries(srcs);
          const visible = includeSystem ? entries : entries.filter(([k]) => {
            const s = String(k || '').trim().toUpperCase();
            return !(s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM'));
          });
          return sum + visible.reduce((acc, [, v]) => acc + Number(v || 0), 0);
        }, 0)
      : null;

    return {
      threshold,
      floodRows,
      aggBars,
      windowBars,
      timePickerDomain,
      floodWindows: usedWindows,
      rangeBars,
      rangeBadActors,
      rangeUnhealthy,
      totalFloodCountRange,
    };
  })();

  return (
    <div className="space-y-6">
      {/* Always visible: Activation-based Health Summary */}
      {actualCalcLoading || !actualCalcData ? (
        <Card className="shadow-metric-card animate-pulse">
          <div className="p-6">
            <div className="h-6 w-64 bg-muted rounded mb-4" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-3">
                <div className="h-10 w-24 bg-muted rounded" />
                <div className="h-3 w-48 bg-muted rounded" />
                <div className="h-2 w-full bg-muted rounded" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="h-24 bg-muted rounded" />
                <div className="h-24 bg-muted rounded" />
              </div>
              <div className="h-24 bg-muted rounded" />
            </div>
          </div>
        </Card>
      ) : (
        <ActivationOverloadSummary 
          overall={actualCalcData.overall} 
          params={actualCalcData.params} 
        />
      )}

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'alarm' | 'frequency' | 'analytics')} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="alarm">Alarm Summary</TabsTrigger>
          <TabsTrigger value="frequency">Frequency Metrics</TabsTrigger>
          <TabsTrigger value="analytics">Detailed Analytics</TabsTrigger>
        </TabsList>

        {/* Tab 1: Alarm Summary */}
        <TabsContent value="alarm" className="space-y-6">
          {actualCalcLoading || !actualCalcData ? (
            <ActualCalcKPICards
              kpis={loadingKPIs}
              counts={loadingCounts}
              isLoading={true}
              section="alarm"
            />
          ) : (
            <>
              {/* KPI Cards for Alarm Summary */}
              <ActualCalcKPICards
                kpis={actualCalcData.overall}
                counts={actualCalcData.counts}
                isLoading={false}
                section="alarm"
                totals={{
                  total_unhealthy_periods: actualCalcUnhealthy?.total_periods ?? 0,
                  total_flood_windows: actualCalcFloods?.totals?.total_windows ?? 0,
                  total_flood_count: actualCalcFloods?.totals?.total_flood_count ?? 0,
                }}
                unhealthyData={actualCalcUnhealthy}
                floodsData={actualCalcFloods}
                badActorsData={actualCalcBadActors}
              />

              {/* Tree Structure */}
              <ActualCalcTree data={actualCalcData} plantId={plantId} />

              {/* Summary Statistics Card */}
              <Card className="bg-card rounded-lg border p-6">
                <h3 className="text-lg font-semibold mb-4">Summary Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-7 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Sources</p>
                    <p className="text-lg font-semibold">{actualCalcData.counts.total_sources.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Alarms</p>
                    <p className="text-lg font-semibold">{actualCalcData.counts.total_alarms.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Standing</p>
                    <p className="text-lg font-semibold">{(actualCalcData.counts.total_standing || 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {((((actualCalcData.counts.total_standing || 0)) / actualCalcData.counts.total_alarms) * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Stale</p>
                    <p className="text-lg font-semibold">{actualCalcData.counts.total_stale.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {((actualCalcData.counts.total_stale / actualCalcData.counts.total_alarms) * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Chattering</p>
                    <p className="text-lg font-semibold">{actualCalcData.counts.total_chattering.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {((actualCalcData.counts.total_chattering / actualCalcData.counts.total_alarms) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                {actualCalcData.sample_range?.start && actualCalcData.sample_range?.end && (
                  <p className="text-xs text-muted-foreground mt-4">
                    Data range: {new Date(actualCalcData.sample_range.start).toLocaleDateString()} - {new Date(actualCalcData.sample_range.end).toLocaleDateString()}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Generated: {new Date(actualCalcData.generated_at).toLocaleString()} | 
                  Stale threshold: {actualCalcData.params.stale_min}min | 
                  Chatter threshold: {actualCalcData.params.chatter_min}min
                </p>
              </Card>

              {/* NEW: Alarm Summary Visualizations */}
              <div className="space-y-6">
                {/* Row 1: Composition Sankey + Waterfall */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <CompositionSankey
                    plantId={plantId}
                    includeSystem={includeSystem}
                  />
                  <TotalsWaterfall
                    plantId={plantId}
                    includeSystem={includeSystem}
                  />
                </div>

                {/* Row 2: Category Trend (full width) */}
                <CategoryTrendArea
                  plantId={plantId}
                  includeSystem={includeSystem}
                />

                {/* Row 3: Calendar + Seasonality */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <CalendarDailyHeatmap
                    plantId={plantId}
                  />
                  <SeasonalityHeatmap
                    plantId={plantId}
                    includeSystem={includeSystem}
                  />
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* Tab 2: Frequency Metrics */}
        <TabsContent value="frequency" className="space-y-6">
          {actualCalcLoading || !actualCalcData ? (
            <ActualCalcKPICards
              kpis={loadingKPIs}
              counts={loadingCounts}
              isLoading={true}
              section="frequency"
            />
          ) : (
            <>
              {/* KPI Cards for Frequency Metrics */}
              <ActualCalcKPICards
                kpis={actualCalcData.overall}
                counts={actualCalcData.counts}
                isLoading={false}
                section="frequency"
                totals={{
                  total_unhealthy_periods: actualCalcUnhealthy?.total_periods ?? 0,
                  total_flood_windows: actualCalcFloods?.totals?.total_windows ?? 0,
                  total_flood_count: actualCalcFloods?.totals?.total_flood_count ?? 0,
                }}
                unhealthyData={actualCalcUnhealthy}
                floodsData={actualCalcFloods}
                badActorsData={actualCalcBadActors}
              />

              {/* Daily Alarm Trend Chart */}
              {actualCalcData.frequency && (
                <AlarmFrequencyTrendChart
                  data={frequencyChartData}
                  isLoading={false}
                  totalDays={actualCalcData.frequency.summary.total_days_analyzed}
                  daysOver288={actualCalcData.frequency.summary.days_over_288_count}
                  daysOver720={actualCalcData.frequency.summary.days_unacceptable_count}
                />
              )}
            </>
          )}
        </TabsContent>

        {/* Tab 3: Detailed Analytics */}
        <TabsContent value="analytics" className="space-y-6">
          {actualCalcLoading || !actualCalcData ? (
            <ActualCalcKPICards
              kpis={loadingKPIs}
              counts={loadingCounts}
              isLoading={true}
              section="analytics"
            />
          ) : (
            <>
              {/* KPI Cards for Detailed Analytics */}
              <ActualCalcKPICards
                kpis={actualCalcData.overall}
                counts={actualCalcData.counts}
                isLoading={false}
                section="analytics"
                totals={{
                  total_unhealthy_periods: actualCalcUnhealthy?.total_periods ?? 0,
                  total_flood_windows: actualCalcFloods?.totals?.total_windows ?? 0,
                  total_flood_count: actualCalcFloods?.totals?.total_flood_count ?? 0,
                }}
                unhealthyData={actualCalcUnhealthy}
                floodsData={actualCalcFloods}
                badActorsData={actualCalcBadActors}
              />

              {/* Observation Range Picker (applies to Detailed Analytics charts) */}
              <div className="flex flex-wrap items-center gap-3">
                <DateTimeRangePicker
                  value={analyticsRange}
                  onApply={(s, e) => setAnalyticsRange({ startTime: s, endTime: e })}
                  onClear={() => setAnalyticsRange(undefined)}
                  domainStartISO={actualCalcData?.sample_range?.start || undefined}
                  domainEndISO={actualCalcData?.sample_range?.end || undefined}
                  label="Observation range"
                />
                {Boolean(analyticsRange?.startTime || analyticsRange?.endTime) && (
                  <Button variant="outline" size="sm" onClick={() => setAnalyticsRange(undefined)}>
                    Clear
                  </Button>
                )}
              </div>

              {/* Top Flood Windows Chart */}
              <TopFloodWindowsChart
                data={detailedAnalyticsData.floodRows}
                threshold={detailedAnalyticsData.threshold}
                topK={topWindowsTopK}
                onTopKChange={onTopKChange}
                isLoading={actualCalcLoading || !actualCalcFloods}
                includeSystem={includeSystem}
                onSelectWindow={(row) => {
                  if (!row) { 
                    onWindowChange(null); 
                    return; 
                  }
                  onWindowChange({ 
                    id: row.id, 
                    label: row.label, 
                    start: row.start, 
                    end: row.end 
                  });
                }}
                selectedWindowId={selectedWindow?.id}
              />

              {/* Floods Bubble Chart */}
              {actualCalcFloods && (
                <FloodsBubbleChart
                  windows={detailedAnalyticsData.floodWindows}
                  includeSystem={includeSystem}
                  isLoading={actualCalcLoading}
                  selectedWindowId={selectedWindow?.id}
                  onSelectWindow={(row) => {
                    if (!row) { onWindowChange(null); return; }
                    onWindowChange({
                      id: row.id,
                      label: `${new Date(row.start).toLocaleString()} — ${new Date(row.end).toLocaleString()}`,
                      start: row.start,
                      end: row.end,
                    });
                  }}
                />
              )}

              {/* Unhealthy Bar Chart */}
              <UnhealthyBarChart
                data={detailedAnalyticsData.windowBars ?? detailedAnalyticsData.rangeBars ?? detailedAnalyticsData.aggBars}
                threshold={detailedAnalyticsData.threshold}
                topN={topN}
                onTopNChange={onTopNChange}
                isLoading={actualCalcLoading || !actualCalcUnhealthy}
                plantId={plantId}
                mode={'flood'}
                includeSystem={includeSystem}
                activeWindowLabel={selectedWindow?.label}
                activeWindowStart={selectedWindow?.start}
                activeWindowEnd={selectedWindow?.end}
                timePickerDomain={detailedAnalyticsData.timePickerDomain}
                onClearWindow={() => onWindowChange(null)}
                onApplyTimePicker={(s, e) => {
                  const windows = actualCalcFloods?.windows || [];
                  // 1) Exact string match (for quick-pick list items)
                  let win: ActualCalcFloodsResponse['windows'][number] | null = windows.find(w => w.start === s && w.end === e) || null;
                  // 2) Tolerant start/end match within ±60s (handles formatting/UTC drift)
                  if (!win) {
                    const sMs = new Date(s).getTime();
                    const eMs = new Date(e).getTime();
                    const tol = 60_000; // 60 seconds tolerance
                    win = windows.find(w => {
                      const ws = new Date(w.start).getTime();
                      const we = new Date(w.end).getTime();
                      return Math.abs(ws - sMs) <= tol && Math.abs(we - eMs) <= tol;
                    }) || null;
                    // 3) Overlap-based best match
                    if (!win) {
                      let best: { win: ActualCalcFloodsResponse['windows'][number]; overlap: number } | null = null;
                      for (const w of windows) {
                        const ws = new Date(w.start).getTime();
                        const we = new Date(w.end).getTime();
                        const overlap = Math.max(0, Math.min(eMs, we) - Math.max(sMs, ws));
                        if (!best || overlap > best.overlap) best = { win: w, overlap };
                      }
                      if (best && best.overlap > 0) win = best.win;
                    }
                    // 4) Nearest by start-time distance as last resort
                    if (!win) {
                      let nearest: { win: ActualCalcFloodsResponse['windows'][number]; dist: number } | null = null;
                      for (const w of windows) {
                        const dist = Math.abs(new Date(w.start).getTime() - new Date(s).getTime());
                        if (!nearest || dist < nearest.dist) nearest = { win: w, dist };
                      }
                      win = nearest?.win || null;
                    }
                  }
                  if (win) {
                    onWindowChange({ id: win.id, label: `${new Date(win.start).toLocaleString()} — ${new Date(win.end).toLocaleString()}`, start: win.start, end: win.end });
                  }
                }}
                unhealthyWindows={(actualCalcFloods?.windows || []).map(w => ({ start: w.start, end: w.end, label: `${new Date(w.start).toLocaleString()} — ${new Date(w.end).toLocaleString()}` }))}
                validateWindow={async () => true}
              />

              {/* Bad Actors Pareto Chart */}
              {actualCalcBadActors && (
                <BadActorsParetoChart
                  data={detailedAnalyticsData.rangeBadActors ?? actualCalcBadActors.top_actors}
                  totalFloodCount={(detailedAnalyticsData.totalFloodCountRange ?? undefined) as number || (actualCalcFloods?.totals?.total_flood_count || 0)}
                  topN={badActorsTopN}
                  onTopNChange={setBadActorsTopN}
                  isLoading={actualCalcLoading}
                  includeSystem={includeSystem}
                  activeRangeStart={analyticsRange?.startTime}
                  activeRangeEnd={analyticsRange?.endTime}
                />
              )}

              {/* Unhealthy Periods Distribution Chart */}
              {actualCalcUnhealthy && (
                <UnhealthyPeriodsBarChart
                  data={detailedAnalyticsData.windowBars ?? detailedAnalyticsData.rangeBars ?? detailedAnalyticsData.aggBars}
                  threshold={detailedAnalyticsData.threshold}
                  windowMinutes={actualCalcUnhealthy.params?.window_minutes || 10}
                  topN={unhealthyPeriodsTopN}
                  onTopNChange={setUnhealthyPeriodsTopN}
                  isLoading={actualCalcLoading}
                  includeSystem={includeSystem}
                  activeRangeStart={analyticsRange?.startTime}
                  activeRangeEnd={analyticsRange?.endTime}
                />
              )}

              {/* Condition Distribution by Location (Actual-Calc) */}
              <ConditionDistributionByLocationActualCalc
                className="mt-2"
                plantId={plantId}
                includeSystem={includeSystem}
                startTime={analyticsRange?.startTime}
                endTime={analyticsRange?.endTime}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
