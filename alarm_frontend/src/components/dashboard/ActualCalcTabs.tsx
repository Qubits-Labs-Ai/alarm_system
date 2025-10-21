/**
 * ActualCalcTabs - Tabbed layout for PVC-I Actual Calc mode
 * Organizes KPIs and charts into three logical sections:
 * 1. Alarm Summary - Overall alarm counts, tree structure, and summary stats
 * 2. Frequency Metrics - Time-based alarm rates and ISO compliance
 * 3. Detailed Analytics - Unhealthy periods, flood windows, and bad actors
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import ActivationOverloadSummary from './ActivationOverloadSummary';
import { ActualCalcKPICards } from './ActualCalcKPICards';
import { ActualCalcTree } from './ActualCalcTree';
import { AlarmFrequencyTrendChart } from './AlarmFrequencyTrendChart';
import TopFloodWindowsChart, { TopFloodWindowRow } from './TopFloodWindowsChart';
import { UnhealthyBarChart } from './UnhealthyBarChart';
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

    // Map floods -> rows
    const floodRows: TopFloodWindowRow[] = (actualCalcFloods?.windows || []).map((w, idx) => {
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
      const match = (actualCalcFloods?.windows || []).find(w => w.id === selectedWindow.id);
      if (match) {
        windowBars = Object.entries(match.sources_involved || {}).map(([source, count]) => ({
          id: `${selectedWindow.id}:${source}`,
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

    return {
      threshold,
      floodRows,
      aggBars,
      windowBars,
      timePickerDomain,
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
              <ActualCalcTree data={actualCalcData} />

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
                  <div>
                    <p className="text-muted-foreground">Cycles</p>
                    <p className="text-lg font-semibold">{actualCalcData.counts.total_cycles.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {actualCalcData.overall.completion_rate_pct.toFixed(1)}% complete
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Inst. Failure</p>
                    <p className="text-lg font-semibold">{(actualCalcData.counts.total_instrument_failure || 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {(((actualCalcData.counts.total_instrument_failure || 0) / actualCalcData.counts.total_alarms) * 100).toFixed(1)}%
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

              {/* Unhealthy Bar Chart */}
              <UnhealthyBarChart
                data={detailedAnalyticsData.windowBars ?? detailedAnalyticsData.aggBars}
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
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
