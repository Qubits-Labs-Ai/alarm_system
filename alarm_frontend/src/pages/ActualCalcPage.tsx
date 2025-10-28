/**
 * ActualCalcPage - PVCI Actual Calculation Mode
 * Displays alarm lifecycle KPIs: response times, stale/chattering, ISA compliance
 */

import { useMemo, useState, useEffect } from 'react';
import { fetchPvciActualCalcOverall, fetchPvciActualCalcUnhealthy, fetchPvciActualCalcFloods, fetchPvciActualCalcBadActors, fetchPlantActualCalcCacheStatus } from '@/api/actualCalc';
import { ActualCalcOverallResponse, ActualCalcUnhealthyResponse, ActualCalcFloodsResponse, ActualCalcBadActorsResponse } from '@/types/actualCalc';
import { ActualCalcKPICards } from '@/components/dashboard/ActualCalcKPICards';
import { ActualCalcTree } from '@/components/dashboard/ActualCalcTree';
import { AlarmFrequencyTrendChart } from '@/components/dashboard/AlarmFrequencyTrendChart';
import { BadActorsParetoChart } from '@/components/actualCalc/BadActorsParetoChart';
import { UnhealthyPeriodsBarChart } from '@/components/actualCalc/UnhealthyPeriodsBarChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Loader2, Database, TrendingUp, CheckCircle2, Activity } from 'lucide-react';
import TopFloodWindowsChart, { TopFloodWindowRow } from '@/components/dashboard/TopFloodWindowsChart';
import { UnhealthyBarChart } from '@/components/dashboard/UnhealthyBarChart';
import { UnhealthyBar } from '@/types/dashboard';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

export function ActualCalcPage() {
  const [data, setData] = useState<ActualCalcOverallResponse | null>(null);
  const [unhealthy, setUnhealthy] = useState<ActualCalcUnhealthyResponse | null>(null);
  const [floods, setFloods] = useState<ActualCalcFloodsResponse | null>(null);
  const [badActors, setBadActors] = useState<ActualCalcBadActorsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState<string>('Initializing...');
  const [isFirstLoad, setIsFirstLoad] = useState(false);

  // Shared UI state
  const [includeSystem, setIncludeSystem] = useState(true);
  const [topN, setTopN] = useState<1 | 3>(1);
  const [topK, setTopK] = useState<5 | 10 | 15>(10);
  const [selectedWindow, setSelectedWindow] = useState<TopFloodWindowRow | null>(null);
  // State for new chart controls
  const [badActorsTopN, setBadActorsTopN] = useState<5 | 10 | 15 | 20>(10);
  const [unhealthyPeriodsTopN, setUnhealthyPeriodsTopN] = useState<10 | 15 | 20 | 25>(15);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setLoadingProgress(0);
      setLoadingStage('Checking cache status...');
      
      const startTime = Date.now();
      
      // Check if cache exists first (fast check)
      let cacheExists = false;
      try {
        const cacheStatus = await fetchPlantActualCalcCacheStatus('PVCI', { stale_min: 60, chatter_min: 10 });
        cacheExists = cacheStatus.cache_exists;
        if (!cacheExists) {
          setIsFirstLoad(true);
          setLoadingStage('Generating cache for the first time...');
        } else {
          setLoadingStage('Loading cached data...');
        }
      } catch (e) {
        console.warn('Could not check cache status, proceeding with load:', e);
      }
      
      setLoadingProgress(10);
      
      // Extended timeout for first load: 5 minutes (300s)
      // Reduced timeout for cached loads: 2 minutes (120s)
      const timeout = cacheExists ? 120000 : 300000;
      
      // Progress simulation for better UX
      const progressInterval: NodeJS.Timeout = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 1000);
      
      try {
        setLoadingStage('Fetching calculation results...');
        const [overall, unhealthyResp, floodsResp, badActorsResp] = await Promise.all([
          fetchPvciActualCalcOverall({ stale_min: 60, chatter_min: 10, include_per_source: false, include_cycles: false, timeout_ms: timeout }),
          fetchPvciActualCalcUnhealthy({ stale_min: 60, chatter_min: 10, limit: 500, timeout_ms: timeout }),
          fetchPvciActualCalcFloods({ stale_min: 60, chatter_min: 10, limit: 200, timeout_ms: timeout }),
          fetchPvciActualCalcBadActors({ stale_min: 60, chatter_min: 10, limit: 10, timeout_ms: timeout }),
        ]);
        
        clearInterval(progressInterval);
        setLoadingProgress(95);
        
        // Detect if this was a slow first load
        const loadTime = Date.now() - startTime;
        if (loadTime > 10000) { // >10 seconds indicates cache generation
          setIsFirstLoad(true);
        }
      
        // Fallback: if activation-based fields are missing/zero while dataset clearly has alarms,
        // request a recompute to regenerate the server cache (common on first deploy)
        const kpis = overall?.overall || ({} as any);
        const hasData = Number(kpis?.avg_alarms_per_day || 0) > 0 || Number(overall?.counts?.total_alarms || 0) > 0;
        const missingActivation = !('activation_overall_health_pct' in kpis) || (
          Number(kpis?.activation_overall_health_pct || 0) === 0 && hasData
        );
        if (missingActivation) {
          setLoadingStage('Regenerating cache with updated schema...');
          setIsFirstLoad(true);
          try {
            const recomputed = await fetchPvciActualCalcOverall({
              stale_min: 60,
              chatter_min: 10,
              include_per_source: false,
              include_cycles: false,
              force_recompute: true,
              timeout_ms: timeout,
            });
            if (recomputed?.overall?.activation_overall_health_pct) {
              overall = recomputed;
            }
          } catch (e) {
            // swallow; we'll use the original payload
            console.warn('Recompute fallback failed:', e);
          }
        }
        
        setLoadingStage('Finalizing...');
        setLoadingProgress(100);
        
        setData(overall);
        setUnhealthy(unhealthyResp);
        setFloods(floodsResp);
        setBadActors(badActorsResp);
      } finally {
        clearInterval(progressInterval);
      }
    } catch (err) {
      console.error('Failed to load actual-calc data:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to load data';
      
      // Provide helpful error message for timeout
      if (errorMsg.includes('aborted') || errorMsg.includes('timeout')) {
        setError('Loading is taking longer than expected. The system may be generating the cache for the first time. Please wait a few minutes and try refreshing the page.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  };

  // Derived: threshold and time domain (hooks must be before early returns)
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

  // Transform frequency data for chart
  const frequencyChartData = useMemo(() => {
    if (!data?.frequency?.alarms_per_day) return [];
    
    const over288Dates = new Set(data.frequency.days_over_288?.map(d => d.Date) || []);
    const over720Dates = new Set(data.frequency.days_unacceptable?.map(d => d.Date) || []);
    
    return data.frequency.alarms_per_day.map(item => ({
      date: item.Date,
      ts: new Date(item.Date).getTime(),
      alarm_count: item.Alarm_Count,
      is_over_288: over288Dates.has(item.Date),
      is_over_720: over720Dates.has(item.Date),
    }));
  }, [data]);

  // Full-page loading state with progress
  if (isLoading) {
    return (
      <div className="container mx-auto p-6" data-page="actual-calc-page">
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <h1 className="text-3xl font-bold">Loading Actual Calculation Data</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl">
              {isFirstLoad 
                ? '🚀 Generating cache for the first time. This may take 2-5 minutes...'
                : 'Fetching alarm lifecycle KPIs and analytics...'}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full max-w-md space-y-4">
            <Progress value={loadingProgress} className="h-3" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{loadingStage}</span>
              <span className="font-medium">{Math.round(loadingProgress)}%</span>
            </div>
          </div>

          {/* Loading Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mt-8">
            <Card className="border-2">
              <CardContent className="flex flex-col items-center justify-center p-6 space-y-2">
                <Database className={`h-8 w-8 ${loadingProgress > 30 ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="font-medium text-sm">Loading Data</p>
                {loadingProgress > 30 && <CheckCircle2 className="h-4 w-4 text-success" />}
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="flex flex-col items-center justify-center p-6 space-y-2">
                <TrendingUp className={`h-8 w-8 ${loadingProgress > 60 ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="font-medium text-sm">Calculating KPIs</p>
                {loadingProgress > 60 && <CheckCircle2 className="h-4 w-4 text-success" />}
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="flex flex-col items-center justify-center p-6 space-y-2">
                <Activity className={`h-8 w-8 ${loadingProgress > 90 ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="font-medium text-sm">Finalizing</p>
                {loadingProgress > 90 && <CheckCircle2 className="h-4 w-4 text-success" />}
              </CardContent>
            </Card>
          </div>

          {/* First Load Info */}
          {isFirstLoad && (
            <Card className="max-w-2xl mt-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <CardContent className="p-6">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="font-medium text-blue-900 dark:text-blue-100">First-Time Cache Generation</p>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      The system is processing the entire alarm dataset and generating performance metrics. 
                      This only happens once. Subsequent loads will be instant.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Error state rendering
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
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm font-medium">Troubleshooting:</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>If this is the first deployment, the cache may still be generating</li>
                <li>Try refreshing the page in 2-3 minutes</li>
                <li>Check backend logs for computation progress</li>
                <li>Ensure the CSV data file is accessible</li>
              </ul>
            </div>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-page="actual-calc-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Actual Calculation Mode</h1>
        <p className="text-muted-foreground mt-2">
          ISO/EEMUA 191-compliant alarm lifecycle KPIs: activation-based frequency metrics, response times, stale/chattering detection
        </p>
        {data && (
          <p className="text-xs text-muted-foreground mt-1">
            Generated: {new Date(data.generated_at).toLocaleString()} | 
            Stale: {data.params.stale_min}min | Chatter: {data.params.chatter_min}min
            {data.sample_range?.start && data.sample_range?.end && (
              <> | Data: {new Date(data.sample_range.start).toLocaleDateString()} - {new Date(data.sample_range.end).toLocaleDateString()}</>
            )}
            {data.overall.total_unique_alarms && (
              <> | Total Unique Alarms: {data.overall.total_unique_alarms.toLocaleString()}</>
            )}
          </p>
        )}
      </div>

      {/* Tree view at top */}
      {data && !isLoading && (
        <ActualCalcTree data={data} plantId="PVCI" />
      )}

      {/* KPI Cards */}
      {data && (
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
          badActorsData={badActors}
        />
      )}

      {/* Daily Alarm Frequency Trend Chart */}
      {data && data.frequency && !isLoading && (
        <AlarmFrequencyTrendChart
          data={frequencyChartData}
          isLoading={false}
          totalDays={data.frequency.summary.total_days_analyzed}
          daysOver288={data.frequency.summary.days_over_288_count}
          daysOver720={data.frequency.summary.days_unacceptable_count}
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
        onApplyTimePicker={(s, e) => {
          const windows = floods?.windows || [];
          // 1) Exact string match
          let win: ActualCalcFloodsResponse['windows'][number] | null = windows.find(w => w.start === s && w.end === e) || null;
          // 2) Tolerant start/end match within ±60s to absorb minor drift
          if (!win) {
            const sMs = new Date(s).getTime();
            const eMs = new Date(e).getTime();
            const tol = 60_000;
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
            // 4) Nearest-by-start fallback
            if (!win) {
              let nearest: { win: ActualCalcFloodsResponse['windows'][number]; dist: number } | null = null;
              for (const w of windows) {
                const dist = Math.abs(new Date(w.start).getTime() - sMs);
                if (!nearest || dist < nearest.dist) nearest = { win: w, dist };
              }
              win = nearest?.win || null;
            }
          }
          if (win) {
            setSelectedWindow({ 
              id: win.id, 
              label: `${new Date(win.start).toLocaleString()} — ${new Date(win.end).toLocaleString()}`, 
              start: win.start, 
              end: win.end,
              flood_count: win.flood_count,
              rate_per_min: win.rate_per_min,
              top_sources: win.top_sources
            });
          }
        }}
        unhealthyWindows={(floods?.windows || []).map(w => ({ start: w.start, end: w.end, label: `${new Date(w.start).toLocaleString()} — ${new Date(w.end).toLocaleString()}` }))}
        validateWindow={async (s, e) => {
          const sMs = new Date(s).getTime();
          const eMs = new Date(e).getTime();
          const overlaps = (floods?.windows || []).some(w => {
            const ws = new Date(w.start).getTime();
            const we = new Date(w.end).getTime();
            return Math.min(eMs, we) > Math.max(sMs, ws);
          });
          return overlaps;
        }}
      />

      {/* Detailed Analytics Charts Section */}
      {data && badActors && unhealthy && !isLoading && (
        <>
          {/* Section Header */}
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-2xl font-bold text-foreground">Detailed Analytics</h2>
              <div className="flex-1 h-px bg-border"></div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              In-depth analysis of bad actors and unhealthy period distribution across sources
            </p>
          </div>

          {/* Bad Actors Pareto Chart */}
          <BadActorsParetoChart
            data={badActors.top_actors}
            totalFloodCount={floods?.totals?.total_flood_count || 0}
            topN={badActorsTopN}
            onTopNChange={setBadActorsTopN}
            isLoading={isLoading}
            includeSystem={includeSystem}
          />

          {/* Unhealthy Periods Distribution Chart */}
          <UnhealthyPeriodsBarChart
            data={unhealthy.per_source}
            threshold={unhealthyThreshold}
            windowMinutes={unhealthy.params?.window_minutes || 10}
            topN={unhealthyPeriodsTopN}
            onTopNChange={setUnhealthyPeriodsTopN}
            isLoading={isLoading}
            includeSystem={includeSystem}
          />
        </>
      )}
    </div>
  );
}
