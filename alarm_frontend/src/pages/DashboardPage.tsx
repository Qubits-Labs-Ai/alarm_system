import { useState, useEffect, startTransition, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/dashboard/PageShell';
import { PlantSelector } from '@/components/dashboard/PlantSelector';
import { InsightCards } from '@/components/dashboard/InsightCards';
import { UniqueSourcesCard } from '@/components/dashboard/UniqueSourcesCard';
import { UnhealthyBarChart } from '@/components/dashboard/UnhealthyBarChart';
import { EventStatisticsCards } from '@/components/dashboard/EventStatisticsCards';
import { ErrorState } from '@/components/dashboard/ErrorState';
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
import { Switch } from '@/components/ui/switch';
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
  const [mode, setMode] = useState<'perSource' | 'flood'>('flood');
  
  

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
  // Disable Include System toggle for PVC-II (not supported yet)
  const isIncludeSystemDisabled = selectedPlant.id === 'pvcII';

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

  // Load Top Bars: per-source or flood mode
  useEffect(() => {
    let mounted = true;
    async function loadBars() {
      try {
        setUnhealthyBarsLoading(true);
        if (mode === 'flood' && selectedPlant.id === 'pvcI') {
          // Start bars and windows in parallel so bars don't wait on summary
          const barsPromise = (async () => {
            let bars: UnhealthyBar[] = [];
            if (selectedWindow) {
              const det = await fetchPvciWindowSourceDetails(selectedWindow.start, selectedWindow.end, 100);
              const topSources: Array<{ source: string; count: number }> = Array.isArray(det?.top_sources) ? det.top_sources : [];
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

              // Compute Unique Sources from full per-window details (not Top-N)
              try {
                const psd: any[] = Array.isArray((det as any)?.per_source_detailed) ? (det as any).per_source_detailed : [];
                const isMetaSource = (name: string) => {
                  const s = String(name || '').trim().toUpperCase();
                  if (!s) return false;
                  return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
                };
                const baseList = includeSystem ? psd : psd.filter(d => !isMetaSource(d?.source));
                const seen = new Set<string>();
                let healthy = 0;
                let unhealthy = 0;
                for (const d of baseList) {
                  const src = String(d?.source || 'Unknown').trim();
                  if (seen.has(src)) continue;
                  seen.add(src);
                  const c = Number(d?.count || 0);
                  if (c >= 10) unhealthy++; else healthy++;
                }
                if (mounted) setUniqueSourcesData({ totalUnique: seen.size, healthySources: healthy, unhealthySources: unhealthy });
              } catch {
                // ignore errors; card will remain as previous value
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
              include_alarm_details: false,
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-3">
            {/* Global Include System toggle (PVC-II disabled) */}
            <div
              className={`flex items-center gap-2 pr-2 ${isIncludeSystemDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={isIncludeSystemDisabled ? 'Unavailable for PVC-II (coming soon)' : undefined}
            >
              <span className="text-sm text-muted-foreground">Include system</span>
              <Switch
                checked={includeSystem}
                onCheckedChange={(v) => startTransition(() => setIncludeSystem(v))}
                disabled={isIncludeSystemDisabled}
                aria-disabled={isIncludeSystemDisabled}
              />
            </div>
            <span className="text-sm text-muted-foreground">Mode</span>
            <Select value={mode} onValueChange={(v) => setMode(v as any)} disabled={selectedPlant.id !== 'pvcI'}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="perSource">Per Source</SelectItem>
                {selectedPlant.id === 'pvcI' && (
                  <SelectItem value="flood">Plant-Wide (ISA 18.2)</SelectItem>
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

        {/* Insight Cards */}
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

        
      </div>
    </PageShell>
  );
}