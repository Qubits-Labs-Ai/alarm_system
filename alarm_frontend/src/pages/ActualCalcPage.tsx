/**
 * ActualCalcPage - PVCI Actual Calculation Mode
 * Displays alarm lifecycle KPIs: response times, stale/chattering, ISA compliance
 */

import { useMemo, useState, useEffect } from 'react';
import { fetchPvciActualCalcOverall, fetchPvciActualCalcUnhealthy, fetchPvciActualCalcFloods } from '@/api/actualCalc';
import { ActualCalcOverallResponse, ActualCalcUnhealthyResponse, ActualCalcFloodsResponse } from '@/types/actualCalc';
import { ActualCalcKPICards } from '@/components/dashboard/ActualCalcKPICards';
import { ActualCalcTree } from '@/components/dashboard/ActualCalcTree';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import TopFloodWindowsChart, { TopFloodWindowRow } from '@/components/dashboard/TopFloodWindowsChart';
import { UnhealthyBarChart } from '@/components/dashboard/UnhealthyBarChart';
import { UnhealthyBar } from '@/types/dashboard';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export function ActualCalcPage() {
  const [data, setData] = useState<ActualCalcOverallResponse | null>(null);
  const [unhealthy, setUnhealthy] = useState<ActualCalcUnhealthyResponse | null>(null);
  const [floods, setFloods] = useState<ActualCalcFloodsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shared UI state
  const [includeSystem, setIncludeSystem] = useState(true);
  const [topN, setTopN] = useState<1 | 3>(1);
  const [topK, setTopK] = useState<5 | 10 | 15>(10);
  const [selectedWindow, setSelectedWindow] = useState<TopFloodWindowRow | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [overall, unhealthyResp, floodsResp] = await Promise.all([
        fetchPvciActualCalcOverall({ stale_min: 60, chatter_min: 10, include_per_source: false, include_cycles: false }),
        fetchPvciActualCalcUnhealthy({ stale_min: 60, chatter_min: 10, limit: 500 }),
        fetchPvciActualCalcFloods({ stale_min: 60, chatter_min: 10, limit: 200 }),
      ]);
      
      setData(overall);
      setUnhealthy(unhealthyResp);
      setFloods(floodsResp);
    } catch (err) {
      console.error('Failed to load actual-calc data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              The cache may not be generated yet. Run the regeneration endpoint or check backend logs.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Derived: threshold and time domain
  const unhealthyThreshold = unhealthy?.params?.unhealthy_threshold ?? 10;
  const timeDomain = useMemo(() => {
    const start = data?.sample_range?.start || null;
    const end = data?.sample_range?.end || null;
    // If floods exists, optionally compute peak window
    const peak = floods?.windows?.[0];
    return {
      start,
      end,
      peakStart: peak?.start,
      peakEnd: peak?.end,
    } as { start: string | null; end: string | null; peakStart?: string; peakEnd?: string };
  }, [data, floods]);

  // Map floods to TopFloodWindowRow[]
  const topFloodRows: TopFloodWindowRow[] = useMemo(() => {
    const list = floods?.windows || [];
    const rows = list.map((w, idx) => {
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
      } as TopFloodWindowRow;
    });
    return rows;
  }, [floods]);

  // Map unhealthy summary to UnhealthyBar[] (aggregate across all unhealthy windows)
  const aggregatedUnhealthyBars: UnhealthyBar[] = useMemo(() => {
    const list = unhealthy?.per_source || [];
    const start = timeDomain.start || new Date().toISOString();
    const end = timeDomain.end || new Date().toISOString();
    const bars = list.map((s) => {
      const hits = s.Unhealthy_Periods;
      return {
        id: s.Source,
        source: s.Source,
        hits,
        threshold: unhealthyThreshold,
        over_by: Math.max(0, hits - unhealthyThreshold),
        bin_start: start,
        bin_end: end,
      } as UnhealthyBar;
    }).sort((a, b) => b.hits - a.hits);
    return bars;
  }, [unhealthy, timeDomain, unhealthyThreshold]);

  // If a specific flood window is selected, compute per-source bars from contributions for that window
  const windowUnhealthyBars: UnhealthyBar[] | null = useMemo(() => {
    if (!selectedWindow) return null;
    const list = floods?.windows || [];
    const match = list.find(w => w.id === selectedWindow.id);
    if (!match) return null;
    const entries = Object.entries(match.sources_involved || {}) as Array<[string, number]>;
    const bars = entries.map(([source, count]) => ({
      id: `${selectedWindow.id}:${source}`,
      source,
      hits: Number(count || 0),
      threshold: unhealthyThreshold,
      over_by: Math.max(0, Number(count || 0) - unhealthyThreshold),
      bin_start: match.start,
      bin_end: match.end,
    } as UnhealthyBar)).sort((a, b) => b.hits - a.hits);
    return bars;
  }, [selectedWindow, floods, unhealthyThreshold]);

  const activeWindowLabel = selectedWindow ? selectedWindow.label : undefined;
  const activeWindowStart = selectedWindow?.start;
  const activeWindowEnd = selectedWindow?.end;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Actual Calculation Mode</h1>
        <p className="text-muted-foreground mt-2">
          Alarm lifecycle KPIs: response times, stale/chattering detection, ISA-18.2 compliance
        </p>
        {data && (
          <p className="text-xs text-muted-foreground mt-1">
            Generated: {new Date(data.generated_at).toLocaleString()} | 
            Stale: {data.params.stale_min}min | Chatter: {data.params.chatter_min}min
            {data.sample_range?.start && data.sample_range?.end && (
              <> | Data: {new Date(data.sample_range.start).toLocaleDateString()} - {new Date(data.sample_range.end).toLocaleDateString()}</>
            )}
          </p>
        )}
      </div>

      {/* Tree view at top */}
      {data && !isLoading && (
        <ActualCalcTree data={data} />
      )}

      {/* KPI Cards */}
      {isLoading || !data ? (
        <ActualCalcKPICards 
          kpis={{
            avg_ack_delay_min: 0,
            avg_ok_delay_min: 0,
            completion_rate_pct: 0,
            avg_alarms_per_day: 0,
            avg_alarms_per_hour: 0,
            avg_alarms_per_10min: 0,
            days_over_288_alarms_pct: 0,
          }}
          counts={{
            total_sources: 0,
            total_alarms: 0,
            total_stale: 0,
            total_standing: 0,
            total_instrument_failure: 0,
            total_chattering: 0,
            total_cycles: 0,
          }}
          isLoading={true}
        />
      ) : (
        <ActualCalcKPICards 
          kpis={data.overall}
          counts={data.counts}
          isLoading={false}
          totals={{
            total_unhealthy_periods: unhealthy?.total_periods ?? 0,
            total_flood_windows: floods?.totals?.total_windows ?? 0,
            total_flood_count: floods?.totals?.total_flood_count ?? 0,
          }}
          unhealthyData={unhealthy}
          floodsData={floods}
        />
      )}

      {/* Summary Card */}
      {data && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Summary Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Sources</p>
                <p className="text-lg font-semibold">{data.counts.total_sources.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Alarms</p>
                <p className="text-lg font-semibold">{data.counts.total_alarms.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Standing</p>
                <p className="text-lg font-semibold">{(data.counts.total_standing || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {((((data.counts.total_standing || 0)) / data.counts.total_alarms) * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Stale</p>
                <p className="text-lg font-semibold">{data.counts.total_stale.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {((data.counts.total_stale / data.counts.total_alarms) * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Chattering</p>
                <p className="text-lg font-semibold">{data.counts.total_chattering.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {((data.counts.total_chattering / data.counts.total_alarms) * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Cycles</p>
                <p className="text-lg font-semibold">{data.counts.total_cycles.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {data.overall.completion_rate_pct.toFixed(1)}% complete
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Include system toggle (applies to both charts) */}
      <div className="flex items-center gap-2">
        <Switch checked={includeSystem} onCheckedChange={setIncludeSystem} id="toggle-include-system" />
        <Label htmlFor="toggle-include-system" className="text-sm text-muted-foreground">Include system/meta sources</Label>
      </div>

      {/* Top Flood Windows */}
      <TopFloodWindowsChart
        data={topFloodRows}
        threshold={unhealthyThreshold}
        topK={topK}
        onTopKChange={setTopK}
        isLoading={isLoading || !floods}
        onSelectWindow={(row) => setSelectedWindow(row)}
        selectedWindowId={selectedWindow?.id}
        includeSystem={includeSystem}
      />

      {/* Unhealthy Bar Chart: aggregate across unhealthy (or selected window) */}
      <UnhealthyBarChart
        data={windowUnhealthyBars ?? aggregatedUnhealthyBars}
        threshold={unhealthyThreshold}
        topN={topN}
        onTopNChange={setTopN}
        isLoading={isLoading || !unhealthy}
        plantId="pvcI"
        mode="flood"
        activeWindowLabel={activeWindowLabel}
        activeWindowStart={activeWindowStart}
        activeWindowEnd={activeWindowEnd}
        timePickerDomain={timeDomain.start && timeDomain.end ? { start: timeDomain.start, end: timeDomain.end, peakStart: timeDomain.peakStart, peakEnd: timeDomain.peakEnd } : undefined}
        includeSystem={includeSystem}
        onClearWindow={() => setSelectedWindow(null)}
      />
    </div>
  );
}
