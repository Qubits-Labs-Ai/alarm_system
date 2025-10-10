import { useState, useEffect, startTransition, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/dashboard/PageShell';
import { PlantSelector } from '@/components/dashboard/PlantSelector';
import { InsightCards } from '@/components/dashboard/InsightCards';
import { UnhealthyBarChart } from '@/components/dashboard/UnhealthyBarChart';
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
import { fetchPlants, fetchUnhealthySources, fetchPvciIsaFloodSummary, clearApiCache, fetchPvciWindowSourceDetails } from '@/api/plantHealth';
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

  const toIso = (v?: string) => (v ? new Date(v).toISOString() : undefined);
  const applyIsaRange = () => {
    setIsaRange({ startTime: toIso(rangeInput.start), endTime: toIso(rangeInput.end) });
  };
  const clearIsaRange = () => {
    setIsaRange(undefined);
    setRangeInput({ start: '', end: '' });
  };
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
            } else {
              const res2 = await fetchUnhealthySources(
                isaRange?.startTime,
                isaRange?.endTime,
                '10T',
                10,
                selectedPlant.id,
                { aggregate: true, limit: 50, timeout_ms: 15000 }
              );
              const records2 = Array.isArray(res2?.records) ? res2.records : [];
              const isMetaSource = (name: string) => {
                const s = String(name || '').trim().toUpperCase();
                if (!s) return false;
                return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
              };
              const base = includeSystem ? records2 : records2.filter((r: any) => !isMetaSource(r?.source));
              const bySource: Record<string, number> = {};
              for (const r of base) {
                const src = String(r?.source || 'Unknown').trim();
                const c = Number(typeof (r as any)?.flood_count === 'number' ? (r as any).flood_count : r?.hits || 0);
                if (c > 0) bySource[src] = (bySource[src] || 0) + c;
              }
              bars = Object.entries(bySource).map(([src, sum]) => ({
                id: `${src}-${isaRange?.startTime || 'agg'}`,
                source: src,
                hits: sum,
                threshold: 10,
                over_by: Math.max(0, sum - 10),
                bin_start: isaRange?.startTime || new Date().toISOString(),
                bin_end: isaRange?.endTime || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }));
              bars = bars.filter(b => (b?.hits ?? 0) >= 10).sort((a, b) => b.hits - a.hits).slice(0, 50);
            }
            if (mounted) setUnhealthyBarData(bars);
          })();

          const windowsPromise = (async () => {
            const res = await fetchPvciIsaFloodSummary({
              include_records: true,
              include_windows: true,
              include_alarm_details: false,
              top_n: 5,
              max_windows: 5,
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