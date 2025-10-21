import { useState, useEffect, startTransition, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/dashboard/PageShell';
import { PlantSelector } from '@/components/dashboard/PlantSelector';
import { InsightCards } from '@/components/dashboard/InsightCards';
import { UniqueSourcesCard } from '@/components/dashboard/UniqueSourcesCard';
import { UnhealthyBarChart } from '@/components/dashboard/UnhealthyBarChart';
import { EventStatisticsCards } from '@/components/dashboard/EventStatisticsCards';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { ActualCalcKPICards } from '@/components/dashboard/ActualCalcKPICards';
import { ActualCalcTree } from '@/components/dashboard/ActualCalcTree';
import { AlarmFrequencyTrendChart } from '@/components/dashboard/AlarmFrequencyTrendChart';
import ActivationOverloadSummary from '@/components/dashboard/ActivationOverloadSummary';
import { fetchPvciActualCalcOverall, fetchPvciActualCalcUnhealthy, fetchPvciActualCalcFloods, fetchPvciActualCalcBadActors } from '@/api/actualCalc';
import { ActualCalcOverallResponse, ActualCalcUnhealthyResponse, ActualCalcFloodsResponse, ActualCalcBadActorsResponse } from '@/types/actualCalc';
import UnhealthySourcesChart from '@/components/UnhealthySourcesChart';
import UnhealthySourcesWordCloud from '@/components/UnhealthySourcesWordCloud';
import UnhealthySourcesBarChart from '@/components/UnhealthySourcesBarChart';
import ParetoTopOffendersChart from '@/components/ParetoTopOffendersChart';
import ConditionDistributionByLocation from '@/components/ConditionDistributionByLocation';
import ConditionDistributionByLocationPlantWide from '@/components/ConditionDistributionByLocationPlantWide';
import { useAuth } from '@/hooks/useAuth';
import { usePlantHealth } from '@/hooks/usePlantHealth';
import { Plant } from '@/types/dashboard';
import { fetchPlants, fetchUnhealthySources, fetchPvciIsaFloodSummaryEnhanced, clearApiCache, fetchPvciWindowSourceDetails, fetchPvciUniqueSourcesSummary } from '@/api/plantHealth';
import { UnhealthyBar } from '@/types/dashboard';
import PriorityBreakdownDonut from '@/components/PriorityBreakdownDonut';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TopFloodWindowsChart, { TopFloodWindowRow } from '@/components/dashboard/TopFloodWindowsChart';
import { Button } from '@/components/ui/button';
import DateTimeRangePicker from '@/components/dashboard/DateTimeRangePicker';
import { Bot } from 'lucide-react';


// Default plant used before API loads
const defaultPlant: Plant = { id: 'pvcI', name: 'PVC-I', status: 'active' };

export default function DashboardPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedPlant, setSelectedPlant] = useState<Plant>(defaultPlant);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantsLoading, setPlantsLoading] = useState<boolean>(true);
  const [topN, setTopN] = useState<1 | 3>(1);
  const [mode, setMode] = useState<'perSource' | 'flood' | 'actualCalc'>('actualCalc');
  
  

  // Local state for UnhealthyBarChart derived from real alarm sources
  const [unhealthyBarData, setUnhealthyBarData] = useState<UnhealthyBar[]>([]);
  const [unhealthyBarsLoading, setUnhealthyBarsLoading] = useState<boolean>(true);
  // Flood-mode: Top windows dataset and control
  const [topWindows, setTopWindows] = useState<TopFloodWindowRow[]>([]);
  const [topWindowsTopK, setTopWindowsTopK] = useState<5 | 10 | 15>(10);
  // Selected 10-min window (Plant-wide flood mode)
  const [selectedWindow, setSelectedWindow] = useState<{
    id: string;
    label: string;
    start: string;
    end: string;
  } | null>(null);
  // Map of window id -> top_sources list from ISA summary for consistent per-window bars
  const [windowTopSources, setWindowTopSources] = useState<Record<string, Array<{ source: string; count: number }>>>({});
  // V2 slider domain and peak window reference
  const [timePickerDomain, setTimePickerDomain] = useState<{ start: string; end: string; peakStart?: string; peakEnd?: string } | null>(null);
  // Global include system toggle
  const [includeSystem, setIncludeSystem] = useState<boolean>(true);
  // Enforce ISA‑18.2 plant‑wide semantics for PVC‑I: exclude system/meta sources by default
  useEffect(() => {
    if (selectedPlant.id === 'pvcI' && mode === 'flood' && includeSystem) {
      setIncludeSystem(false);
    }
    // No else branch: if users later add a UI toggle, their preference in other modes remains untouched.
  }, [selectedPlant.id, mode]);
  // Global date/time range for ISA-18 plant-wide mode only (applied range)
  const [isaRange, setIsaRange] = useState<{ startTime?: string; endTime?: string } | undefined>(undefined);
  // Input controls (datetime-local strings) before applying
  const [rangeInput, setRangeInput] = useState<{ start: string; end: string }>({ start: '', end: '' });
  
  // Unique sources data
  const [uniqueSourcesData, setUniqueSourcesData] = useState<{
    totalUnique: number;
    healthySources: number;
    unhealthySources: number;
  }>({ totalUnique: 0, healthySources: 0, unhealthySources: 0 });

  // Event statistics (only for PVC-I Plant-Wide mode)
  const [eventStats, setEventStats] = useState<any>(null);

  // Actual Calc data
  const [actualCalcData, setActualCalcData] = useState<ActualCalcOverallResponse | null>(null);
  const [actualCalcUnhealthy, setActualCalcUnhealthy] = useState<ActualCalcUnhealthyResponse | null>(null);
  const [actualCalcFloods, setActualCalcFloods] = useState<ActualCalcFloodsResponse | null>(null);
  const [actualCalcLoading, setActualCalcLoading] = useState<boolean>(false);
  const [actualCalcBadActors, setActualCalcBadActors] = useState<ActualCalcBadActorsResponse | null>(null);

  const toIso = (v?: string) => (v ? new Date(v).toISOString() : undefined);
  const applyIsaRange = () => {
    setIsaRange({ startTime: toIso(rangeInput.start), endTime: toIso(rangeInput.end) });
  };
  const clearIsaRange = () => {
    setIsaRange(undefined);
    setRangeInput({ start: '', end: '' });
  };

  // Calculate unique sources data from unhealthy bar data
  const calculateUniqueSourcesData = useCallback((bars: UnhealthyBar[]) => {
    const isMetaSource = (name: string) => {
      const s = String(name || '').trim().toUpperCase();
      if (!s) return false;
      return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
    };

    // Filter based on include system setting
    const filteredBars = includeSystem ? bars : bars.filter(b => !isMetaSource(b.source));
    
    // Get unique sources
    const uniqueSources = new Set(filteredBars.map(b => b.source));
    const totalUnique = uniqueSources.size;
    
    // Count healthy vs unhealthy based on 10-hit threshold
    let healthySources = 0;
    let unhealthySources = 0;
    
    uniqueSources.forEach(source => {
      const sourceHits = filteredBars
        .filter(b => b.source === source)
        .reduce((sum, b) => sum + (b.hits || 0), 0);
      
      if (sourceHits >= 10) {
        unhealthySources++;
      } else {
        healthySources++;
      }
    });

    return { totalUnique, healthySources, unhealthySources };
  }, [includeSystem]);


  // Fetch ISA-18 summary (cards) and per-source metrics via hook; now safe to reference isaRange
  const { 
    data, 
    isLoading, 
    error, 
    refetch, 
    isFetching 
  } = usePlantHealth(
    selectedPlant.id,
    topN,
    mode,
    false,
    (mode === 'flood' && selectedPlant.id === 'pvcI') ? isaRange : undefined
  );

  // Force mode to 'perSource' for plants that don't support flood mode (e.g., PVC-II)
  useEffect(() => {
    if (selectedPlant.id !== 'pvcI' && mode !== 'perSource') {
      setMode('perSource');
    }
  }, [selectedPlant.id, mode]);

  // Validate if a given 10-minute window has any unhealthy records (respect Include System)
  const validateWindowHasUnhealthy = useCallback(async (startIso: string, endIso: string): Promise<boolean> => {
    try {
      const res = await fetchUnhealthySources(startIso, endIso, '10T', 10, selectedPlant.id);
      const recs: any[] = Array.isArray(res?.records) ? res.records : [];
      // Align meta/system filtering with other charts
      const isMetaSource = (name: string) => {
        const s = String(name || '').trim().toUpperCase();
        if (!s) return false;
        return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
      };
      const base = includeSystem ? recs : recs.filter(r => !isMetaSource(r.source));
      // Unhealthy rule
      const unhealthy = base.some(r => Number((r as any).flood_count ?? r.hits ?? 0) >= 10);
      return unhealthy;
    } catch {
      // On any error, do not block apply
      return true;
    }
  }, [includeSystem, selectedPlant.id]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/signin', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Load plants from backend
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setPlantsLoading(true);
        const list = await fetchPlants();
        if (!mounted) return;
        setPlants(list);
        // Prefer PVC-I if available, otherwise follow the desired order
        const order = ['pvcI', 'pvcII', 'pvcIII', 'pp', 'vcm'];
        const preferred =
          list.find(p => p.id === 'pvcI') ||
          list.find(p => order.includes(p.id)) ||
          list[0];
        if (preferred && preferred.id !== selectedPlant.id) {
          setSelectedPlant(preferred);
        }
      } finally {
        if (mounted) setPlantsLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // Load Actual Calc data when mode is 'actualCalc'
  useEffect(() => {
    let mounted = true;
    async function loadActualCalc() {
      if (mode !== 'actualCalc' || selectedPlant.id !== 'pvcI') {
        return;
      }
      try {
        setActualCalcLoading(true);
        const [overall, unhealthyResp, floodsResp, badActorsResp] = await Promise.all([
          fetchPvciActualCalcOverall({
            stale_min: 60,
            chatter_min: 10,
            include_per_source: false,
            include_cycles: false,
            timeout_ms: 120000, // Increased to 120s for activation window calculations
          }),
          fetchPvciActualCalcUnhealthy({ stale_min: 60, chatter_min: 10, limit: 500, timeout_ms: 120000 }),
          fetchPvciActualCalcFloods({ stale_min: 60, chatter_min: 10, limit: 200, timeout_ms: 120000 }),
          fetchPvciActualCalcBadActors({ stale_min: 60, chatter_min: 10, limit: 10, timeout_ms: 120000 }),
        ]);
        if (mounted) {
          setActualCalcData(overall);
          setActualCalcUnhealthy(unhealthyResp);
          setActualCalcFloods(floodsResp);
          setActualCalcBadActors(badActorsResp);
        }
      } catch (err) {
        console.error('Failed to load actual-calc data:', err);
        if (mounted) {
          setActualCalcData(null);
          setActualCalcUnhealthy(null);
          setActualCalcFloods(null);
        }
      } finally {
        if (mounted) {
          setActualCalcLoading(false);
        }
      }
    }
    loadActualCalc();
    return () => { mounted = false; };
  }, [mode, selectedPlant.id]);

  // Load Top Bars: per-source or flood mode
  useEffect(() => {
    let mounted = true;
    async function loadBars() {
      try {
        setUnhealthyBarsLoading(true);
        if (mode === 'actualCalc') {
          // In Actual Calc mode, bars are handled by dedicated endpoints; skip here
          setUnhealthyBarsLoading(false);
          return;
        }
        if (mode === 'flood' && selectedPlant.id === 'pvcI') {
          // Start bars and windows in parallel so bars don't wait on summary
          const barsPromise = (async () => {
            let bars: UnhealthyBar[] = [];
            if (selectedWindow) {
              // Use enhanced JSON (pre-computed Top Flood Windows) rather than event-level endpoint
              let topSources: Array<{ source: string; count: number }> = [];
              try {
                topSources = (windowTopSources[selectedWindow.start] || []) as any;
                if ((!topSources || topSources.length === 0) && Array.isArray(topWindows) && topWindows.length > 0) {
                  const row = topWindows.find(w => w.start === selectedWindow.start);
                  if (row && Array.isArray(row.top_sources)) topSources = row.top_sources as any;
                }
              } catch {}

              bars = (topSources || []).map((s) => ({
                id: `${s.source}-${selectedWindow.start}`,
                source: String(s.source || 'Unknown'),
                hits: Number(s.count || 0),
                threshold: 10,
                over_by: Math.max(0, Number(s.count || 0) - 10),
                bin_start: selectedWindow.start,
                bin_end: selectedWindow.end,
              }));
              bars = bars.filter(b => (b?.hits ?? 0) >= 10).sort((a, b) => b.hits - a.hits).slice(0, 50);

              // Compute Unique Sources for the selected window from enhanced top_sources (best effort)
              try {
                const isMetaSource = (name: string) => {
                  const s = String(name || '').trim().toUpperCase();
                  if (!s) return false;
                  return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
                };
                const baseList = includeSystem ? (topSources || []) : (topSources || []).filter(d => !isMetaSource(d?.source));
                const seen = new Set<string>();
                let unhealthy = 0;
                for (const d of baseList) {
                  const src = String((d as any)?.source || 'Unknown').trim();
                  if (seen.has(src)) continue;
                  seen.add(src);
                  const c = Number((d as any)?.count || 0);
                  if (c >= 10) unhealthy++;
                }
                const totalUnique = seen.size;
                const healthy = Math.max(0, totalUnique - unhealthy);
                if (mounted) setUniqueSourcesData({ totalUnique, healthySources: healthy, unhealthySources: unhealthy });
              } catch {
                // ignore; card will remain as previous value
              }
            } else {
              // Use enhanced endpoint for pre-computed aggregations
              const enhancedRes = await fetchPvciIsaFloodSummaryEnhanced({
                window_minutes: 10,
                threshold: 10,
                start_time: isaRange?.startTime,
                end_time: isaRange?.endTime,
                include_enhanced: true,
                include_records: false,
                include_windows: false,
                lite: true,
                timeout_ms: 15000,
              });

              // Use pre-computed unique_sources_summary from enhanced response
              const uniqueSourcesSummary = (enhancedRes as any)?.unique_sources_summary;
              if (uniqueSourcesSummary && typeof uniqueSourcesSummary.total_unique_sources === 'number') {
                if (mounted) setUniqueSourcesData({
                  totalUnique: Number(uniqueSourcesSummary.total_unique_sources || 0),
                  healthySources: Number(uniqueSourcesSummary.healthy_sources || 0),
                  unhealthySources: Number(uniqueSourcesSummary.unhealthy_sources || 0),
                });
              }

              // Extract event statistics from enhanced response
              const eventStatistics = (enhancedRes as any)?.event_statistics;
              if (eventStatistics && mounted) {
                setEventStats(eventStatistics);
              }

              // Use pre-computed unhealthy_sources_top_n from enhanced response
              const unhealthySources = (enhancedRes as any)?.unhealthy_sources_top_n;
              if (unhealthySources && Array.isArray(unhealthySources.sources)) {
                const isMetaSource = (name: string) => {
                  const s = String(name || '').trim().toUpperCase();
                  if (!s) return false;
                  return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
                };
                
                const filteredSources = includeSystem 
                  ? unhealthySources.sources 
                  : unhealthySources.sources.filter((s: any) => !isMetaSource(s.source));

                bars = filteredSources.map((s: any) => ({
                  id: `${s.source}-${isaRange?.startTime || 'agg'}`,
                  source: String(s.source || 'Unknown'),
                  hits: Number(s.hits || 0),
                  threshold: Number(s.threshold || 10),
                  over_by: Number(s.over_by || 0),
                  bin_start: isaRange?.startTime || new Date().toISOString(),
                  bin_end: isaRange?.endTime || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                  location_tag: s.location_tag,
                }));
                bars = bars.slice(0, 50); // Already sorted by backend
              }
            }
            if (mounted) setUnhealthyBarData(bars);
          })();

          const windowsPromise = (async () => {
            const res = await fetchPvciIsaFloodSummaryEnhanced({
              include_records: true,
              include_windows: true,
              include_alarm_details: true, // needed for per-window top_sources mapping
              top_n: 5,
              max_windows: 5,
              include_enhanced: true,
              top_locations: 20,
              top_sources_per_condition: 5,
              start_time: isaRange?.startTime,
              end_time: isaRange?.endTime,
            });
            const records: any[] = Array.isArray(res?.records) ? res.records : [];

            const windowRows: TopFloodWindowRow[] = [];
            const windowMap: Record<string, Array<{ source: string; count: number }>> = {};
            let domainStartISO: string | null = null;
            let domainEndISO: string | null = null;
            let peakBestStart: string | undefined = undefined;
            let peakBestEnd: string | undefined = undefined;
            let peakBestCount = -1;
            for (const rec of records) {
              let peakCount: number | undefined = Number(rec?.peak_10min_count);
              let start: string | undefined = rec?.peak_window_start;
              let end: string | undefined = rec?.peak_window_end;
              if (!peakCount || !start || !end) {
                const ws: any[] = Array.isArray(rec?.windows) ? rec.windows : [];
                if (ws.length > 0) {
                  const bestW = ws.reduce((m, w) => (Number(w?.count || 0) > Number(m?.count || 0) ? w : m), ws[0]);
                  peakCount = Number(bestW?.count || 0);
                  start = bestW?.window_start;
                  end = bestW?.window_end;
                }
              }
              if (!peakCount || !start || !end) continue;
              const rate = typeof rec?.peak_rate_per_min === 'number' ? Number(rec.peak_rate_per_min) : peakCount / 10;
              const top_sources = Array.isArray(rec?.peak_window_details?.top_sources)
                ? rec.peak_window_details.top_sources.slice(0, 5)
                : [];
              const label = `${new Date(start).toLocaleString()} — ${new Date(end).toLocaleString()}`;
              windowRows.push({
                id: String(start),
                label,
                flood_count: peakCount,
                start,
                end,
                start_ts: new Date(start).getTime(),
                rate_per_min: rate,
                top_sources,
              });
              windowMap[String(start)] = top_sources;
              if (!domainStartISO || new Date(start) < new Date(domainStartISO)) domainStartISO = start;
              if (!domainEndISO || new Date(end) > new Date(domainEndISO)) domainEndISO = end;
              if (peakCount > peakBestCount) {
                peakBestCount = peakCount;
                peakBestStart = start;
                peakBestEnd = end;
              }
            }
            windowRows.sort((a, b) => b.flood_count - a.flood_count);
            if (mounted) {
              setTopWindows(windowRows);
              setWindowTopSources(windowMap);
              if (domainStartISO && domainEndISO) {
                setTimePickerDomain({ start: domainStartISO, end: domainEndISO, peakStart: peakBestStart, peakEnd: peakBestEnd });
              }
            }
          })();

          await Promise.allSettled([barsPromise, windowsPromise]);
        } else {
          // Per-source mode (existing behavior)
          const res = await fetchUnhealthySources(undefined, undefined, '10T', 10, selectedPlant.id);
          const records = Array.isArray(res?.records) ? res.records : [];

          // Transform records -> UnhealthyBar[] (Top 1 or Top 3 per source)
          const bySource: Record<string, typeof records> = {};
          for (const r of records) {
            const key = String(r.source || 'Unknown');
            if (!bySource[key]) bySource[key] = [];
            bySource[key].push(r);
          }

          let bars: UnhealthyBar[] = [];
          const score = (r: any) => (typeof r.flood_count === 'number' ? r.flood_count : r.hits) as number;

          if (topN === 1) {
            // Select the single worst bin per source
            for (const [src, items] of Object.entries(bySource)) {
              const best = items.sort((a, b) => score(b) - score(a))[0];
              if (!best) continue;
              const hits = typeof best.flood_count === 'number' ? best.flood_count : best.hits;
              const bin_start = best.peak_window_start || best.event_time;
              const bin_end = best.peak_window_end || best.bin_end;
              bars.push({
                id: `${src}-${bin_start}`,
                source: src,
                hits,
                threshold: best.threshold,
                over_by: best.over_by,
                bin_start,
                bin_end,
                flood_count: best.flood_count,
                peak_window_start: best.peak_window_start,
                peak_window_end: best.peak_window_end,
                location_tag: best.location_tag,
                condition: best.condition,
                action: best.action,
                priority: best.priority,
                priority_severity: (best as any).priority_severity,
                description: best.description,
                setpoint_value: best.setpoint_value,
                raw_units: best.raw_units,
              });
            }
          } else {
            // Take up to 3 worst bins per source
            for (const [src, items] of Object.entries(bySource)) {
              const top = items.sort((a, b) => score(b) - score(a)).slice(0, 3);
              for (const best of top) {
                const hits = typeof best.flood_count === 'number' ? best.flood_count : best.hits;
                const bin_start = best.peak_window_start || best.event_time;
                const bin_end = best.peak_window_end || best.bin_end;
                bars.push({
                  id: `${src}-${bin_start}`,
                  source: src,
                  hits,
                  threshold: best.threshold,
                  over_by: best.over_by,
                  bin_start,
                  bin_end,
                  flood_count: best.flood_count,
                  peak_window_start: best.peak_window_start,
                  peak_window_end: best.peak_window_end,
                  location_tag: best.location_tag,
                  condition: best.condition,
                  action: best.action,
                  priority: best.priority,
                  priority_severity: (best as any).priority_severity,
                  description: best.description,
                  setpoint_value: best.setpoint_value,
                  raw_units: best.raw_units,
                });
              }
            }
          }

          // Keep only unhealthy sources (hits >= threshold)
          bars = bars.filter(b => (b?.hits ?? 0) >= 10);
          // Sort global bars by hits desc and keep a reasonable cap (e.g., 50)
          bars.sort((a, b) => b.hits - a.hits);
          bars = bars.slice(0, 50);

          if (mounted) setUnhealthyBarData(bars);
        }
      } finally {
        if (mounted) setUnhealthyBarsLoading(false);
      }
    }
    loadBars();
    return () => { mounted = false; };
  }, [topN, selectedPlant.id, mode, selectedWindow?.id, selectedWindow?.start, selectedWindow?.end, isaRange?.startTime, isaRange?.endTime]);

  // Update unique sources data when unhealthy bar data changes
  useEffect(() => {
    // In PVC-I Plant-wide mode, unique sources are computed from full aggregated/window data
    // inside loadBars(); skip recalculation from Top-N bars to avoid truncation to 50 and
    // unhealthy-only bias.
    if (selectedPlant.id === 'pvcI' && mode === 'flood') return;
    const newUniqueData = calculateUniqueSourcesData(unhealthyBarData);
    setUniqueSourcesData(newUniqueData);
  }, [unhealthyBarData, calculateUniqueSourcesData, mode, selectedPlant.id]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  const handleRefresh = () => {
    // Clear API cache so fresh data is pulled on demand
    clearApiCache();
    refetch();
  };

  const handlePlantChange = (plant: Plant) => {
    setSelectedPlant(plant);
  };

  const handleTopNChange = (value: 1 | 3) => {
    setTopN(value);
  };

  if (error) {
    return (
      <PageShell>
        <ErrorState
          title="Dashboard Error"
          description="Failed to load plant health data. Please check your connection and try again."
          onRetry={handleRefresh}
          isRetrying={isFetching}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      onRefresh={handleRefresh}
      isRefreshing={isFetching}
      lastUpdated={data?.metrics.last_updated}
    >
      <div className="space-y-6">
        {/* Plant Selector + Agent (PVC-I only) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <PlantSelector
              plants={plants}
              selectedPlant={selectedPlant}
              onPlantChange={handlePlantChange}
              disabled={plantsLoading || plants.length <= 1}
            />
            {selectedPlant.id === 'pvcI' && (
              <Button
                size="sm"
                className="gap-2"
                onClick={() => navigate(`/${selectedPlant.id.toLowerCase()}/agent`)}
                title="Chat with the PVC-I Agent"
              >
                <Bot className="h-4 w-4" /> Agent
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <span className="text-sm text-muted-foreground">Mode</span>
            <Select value={mode} onValueChange={(v) => setMode(v as any)} disabled={selectedPlant.id !== 'pvcI'}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="perSource">Per Source</SelectItem>
                {selectedPlant.id === 'pvcI' && (
                  <SelectItem value="flood">Plant-Wide (ISA 18.2)</SelectItem>
                )}
                {selectedPlant.id === 'pvcI' && (
                  <SelectItem value="actualCalc">Actual Calc</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ISA-18 plant-wide: Global Date/Time Range */}
        {selectedPlant.id === 'pvcI' && mode === 'flood' && (
          <div className="flex flex-wrap items-center gap-3">
            <DateTimeRangePicker
              value={isaRange}
              onApply={(s, e) => setIsaRange({ startTime: s, endTime: e })}
              onClear={clearIsaRange}
              domainStartISO={timePickerDomain?.start}
              domainEndISO={timePickerDomain?.end}
              label="Observation range"
            />
          </div>
        )}

        {/* Insight Cards - Hide for Actual Calc mode */}
        {mode !== 'actualCalc' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-4">
              <InsightCards
                metrics={data?.metrics || {
                  healthy_percentage: 0,
                  unhealthy_percentage: 0,
                  total_sources: 0,
                  total_files: 0,
                  last_updated: '',
                }}
                isLoading={isLoading}
                mode={mode}
              />
            </div>
            <div className="lg:col-span-1">
              <UniqueSourcesCard
                data={uniqueSourcesData}
                isLoading={unhealthyBarsLoading}
                mode={mode}
              />
            </div>
          </div>
        )}

        {/* Event Statistics Cards - Only for PVC-I Plant-Wide Mode */}
        {selectedPlant.id === 'pvcI' && mode === 'flood' && (
          <EventStatisticsCards 
            eventStats={eventStats} 
            isLoading={isLoading || unhealthyBarsLoading}
          />
        )}

        {/* Charts Section */}
        {selectedPlant.id === 'pvcI' && mode === 'perSource' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <UnhealthyBarChart
                data={unhealthyBarData}
                threshold={10}
                topN={topN}
                onTopNChange={handleTopNChange}
                isLoading={unhealthyBarsLoading}
                plantId={selectedPlant.id}
                mode={'perSource'}
                includeSystem={includeSystem}
              />

              {/* Priority Breakdown Donut (flood_count-weighted) */}
              <PriorityBreakdownDonut />

              {/* New Pareto Top Offenders Chart (Bar + Line) */}
              <ParetoTopOffendersChart includeSystem={includeSystem} />

              {/* New Stacked Bar: Condition Distribution by Location */}
              <ConditionDistributionByLocation plantId={selectedPlant.id} />

              <UnhealthySourcesChart includeSystem={includeSystem} />

              {/* New Word Cloud (priority-colored, bins-heavy score) */}
              <UnhealthySourcesWordCloud includeSystem={includeSystem} />
            </div>
            
            {/* New Simple Bar Chart */}
            <UnhealthySourcesBarChart includeSystem={includeSystem} />
          </div>
        )}

        {selectedPlant.id === 'pvcI' && mode === 'flood' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <UnhealthyBarChart
                data={unhealthyBarData}
                threshold={10}
                topN={topN}
                onTopNChange={handleTopNChange}
                isLoading={unhealthyBarsLoading}
                plantId={selectedPlant.id}
                mode={'flood'}
                includeSystem={includeSystem}
                activeWindowLabel={selectedWindow?.label}
                onClearWindow={() => setSelectedWindow(null)}
                activeWindowStart={selectedWindow?.start}
                activeWindowEnd={selectedWindow?.end}
                onApplyTimePicker={(s, e) => {
                  setSelectedWindow({
                    id: s,
                    label: `${new Date(s).toLocaleString()} — ${new Date(e).toLocaleString()}`,
                    start: s,
                    end: e,
                  });
                }}
                timePickerDomain={timePickerDomain || undefined}
                unhealthyWindows={(topWindows || []).map(w => ({ start: w.start, end: w.end, label: w.label }))}
                validateWindow={validateWindowHasUnhealthy}
              />
              <TopFloodWindowsChart
                data={topWindows}
                threshold={10}
                topK={topWindowsTopK}
                onTopKChange={setTopWindowsTopK}
                isLoading={unhealthyBarsLoading}
                includeSystem={includeSystem}
                onSelectWindow={(row) => {
                  if (!row) { setSelectedWindow(null); return; }
                  setSelectedWindow({ id: row.id, label: row.label, start: row.start, end: row.end });
                }}
                selectedWindowId={selectedWindow?.id}
              />

              {/* PVC-I Plant-wide: Unhealthy Sources Timeline (ISA 18.2) */}
              <UnhealthySourcesChart
                plantId={selectedPlant.id}
                includeSystem={includeSystem}
                mode={'flood'}
                selectedWindow={selectedWindow}
                appliedRange={isaRange}
              />

              {/* PVC-I Plant-wide Pareto (locations aggregated) */}
              <ParetoTopOffendersChart
                plantId={selectedPlant.id}
                includeSystem={includeSystem}
                mode={'flood'}
                appliedRange={isaRange}
              />

              {/* PVC-I Plant-wide: Condition Distribution by Location (stacked by ISA condition) */}
              <ConditionDistributionByLocationPlantWide
                plantId={selectedPlant.id}
                includeSystem={includeSystem}
                selectedWindow={selectedWindow}
                timePickerDomain={timePickerDomain || undefined}
                appliedRange={isaRange}
                onApplyTimePicker={(s, e) => {
                  setSelectedWindow({
                    id: s,
                    label: `${new Date(s).toLocaleString()} — ${new Date(e).toLocaleString()}`,
                    start: s,
                    end: e,
                  });
                }}
                onClearWindow={() => setSelectedWindow(null)}
                unhealthyWindows={(topWindows || []).map(w => ({ start: w.start, end: w.end, label: w.label }))}
                validateWindow={validateWindowHasUnhealthy}
              />
            </div>
          </div>
        )}

        {selectedPlant.id === 'pvcII' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              {/* PVC-II: Unhealthy Bar Chart */}
              <UnhealthyBarChart
                data={unhealthyBarData}
                threshold={10}
                topN={topN}
                onTopNChange={handleTopNChange}
                isLoading={unhealthyBarsLoading}
                plantId={selectedPlant.id}
                mode={'perSource'}
                includeSystem={includeSystem}
              />

              {/* PVC-II: Priority Breakdown Donut */}
              <PriorityBreakdownDonut plantId={selectedPlant.id} />

              {/* PVC-II: Pareto Top Offenders */}
              <ParetoTopOffendersChart plantId={selectedPlant.id} includeSystem={includeSystem} />

              {/* PVC-II: Condition Distribution by Location */}
              <ConditionDistributionByLocation plantId={selectedPlant.id} />

              {/* PVC-II: Unhealthy Sources Timeline/Top Sources */}
              <UnhealthySourcesChart plantId={selectedPlant.id} includeSystem={includeSystem} />

              {/* PVC-II: Word Cloud */}
              <UnhealthySourcesWordCloud plantId={selectedPlant.id} includeSystem={includeSystem} />
            </div>

            {/* PVC-II: Simple Top Sources Bar */}
            <UnhealthySourcesBarChart plantId={selectedPlant.id} includeSystem={includeSystem} />
          </div>
        )}

        {/* Actual Calc Mode - PVC-I only */}
        {selectedPlant.id === 'pvcI' && mode === 'actualCalc' && (
          <div className="space-y-6">
            {actualCalcLoading || !actualCalcData ? (
              <ActualCalcKPICards
                kpis={{
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
              <>
                {/* Tree on top */}
                <ActualCalcTree data={actualCalcData} />

                {/* Activation-based Health Summary */}
                <ActivationOverloadSummary overall={actualCalcData.overall} params={actualCalcData.params} />

                {/* KPI Cards below health summary */}
                <ActualCalcKPICards
                  kpis={actualCalcData.overall}
                  counts={actualCalcData.counts}
                  isLoading={false}
                  totals={{
                    total_unhealthy_periods: actualCalcUnhealthy?.total_periods ?? 0,
                    total_flood_windows: actualCalcFloods?.totals?.total_windows ?? 0,
                    total_flood_count: actualCalcFloods?.totals?.total_flood_count ?? 0,
                  }}
                  unhealthyData={actualCalcUnhealthy}
                  floodsData={actualCalcFloods}
                  badActorsData={actualCalcBadActors}
                />

                {/* Daily Alarm Frequency Trend Chart */}
                {actualCalcData.frequency && (() => {
                  const over288Dates = new Set(actualCalcData.frequency.days_over_288?.map(d => d.Date) || []);
                  const over720Dates = new Set(actualCalcData.frequency.days_unacceptable?.map(d => d.Date) || []);
                  const chartData = actualCalcData.frequency.alarms_per_day.map(item => ({
                    date: item.Date,
                    alarm_count: item.Alarm_Count,
                    is_over_288: over288Dates.has(item.Date),
                    is_over_720: over720Dates.has(item.Date),
                  }));
                  
                  return (
                    <AlarmFrequencyTrendChart
                      data={chartData}
                      isLoading={false}
                      totalDays={actualCalcData.frequency.summary.total_days_analyzed}
                      daysOver288={actualCalcData.frequency.summary.days_over_288_count}
                      daysOver720={actualCalcData.frequency.summary.days_unacceptable_count}
                    />
                  );
                })()}

                {/* Summary Stats Card */}
                <div className="bg-card rounded-lg border p-6">
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
                </div>

                {/* Actual Calc: Top Flood Windows + Per-source bars */}
                {(() => {
                  const threshold = actualCalcUnhealthy?.params?.unhealthy_threshold ?? 10;
                  const timeStart = actualCalcData.sample_range?.start || new Date().toISOString();
                  const timeEnd = actualCalcData.sample_range?.end || new Date().toISOString();

                  // Map floods -> rows
                  const floodRows = (actualCalcFloods?.windows || []).map((w, idx) => {
                    const id = w.id;
                    const label = `${new Date(w.start).toLocaleString()} — ${new Date(w.end).toLocaleString()}`;
                    const top_sources = w.top_sources || [];
                    return { id, label, flood_count: w.flood_count, start: w.start, end: w.end, short_label: idx < 3 ? undefined : new Date(w.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), rate_per_min: w.rate_per_min, top_sources } as TopFloodWindowRow;
                  });

                  // Aggregate unhealthy per source across all unhealthy windows
                  const aggBars = (actualCalcUnhealthy?.per_source || []).map((s) => {
                    const hits = s.Unhealthy_Periods;
                    return { id: s.Source, source: s.Source, hits, threshold, over_by: Math.max(0, hits - threshold), bin_start: timeStart, bin_end: timeEnd } as UnhealthyBar;
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
                      } as UnhealthyBar)).sort((a, b) => b.hits - a.hits);
                    }
                  }

                  return (
                    <div className="space-y-6">
                      <TopFloodWindowsChart
                        data={floodRows}
                        threshold={threshold}
                        topK={topWindowsTopK}
                        onTopKChange={setTopWindowsTopK}
                        isLoading={actualCalcLoading || !actualCalcFloods}
                        includeSystem={includeSystem}
                        onSelectWindow={(row) => {
                          if (!row) { setSelectedWindow(null); return; }
                          setSelectedWindow({ id: row.id, label: row.label, start: row.start, end: row.end });
                        }}
                        selectedWindowId={selectedWindow?.id}
                      />

                      <UnhealthyBarChart
                        data={windowBars ?? aggBars}
                        threshold={threshold}
                        topN={topN}
                        onTopNChange={setTopN}
                        isLoading={actualCalcLoading || !actualCalcUnhealthy}
                        plantId={selectedPlant.id}
                        mode={'flood'}
                        includeSystem={includeSystem}
                        activeWindowLabel={selectedWindow?.label}
                        activeWindowStart={selectedWindow?.start}
                        activeWindowEnd={selectedWindow?.end}
                        timePickerDomain={actualCalcData.sample_range?.start && actualCalcData.sample_range?.end ? { start: actualCalcData.sample_range.start, end: actualCalcData.sample_range.end } : undefined}
                        onClearWindow={() => setSelectedWindow(null)}
                      />
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
        
      </div>
    </PageShell>
  );
}
