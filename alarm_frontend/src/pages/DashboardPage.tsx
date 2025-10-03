import { useState, useEffect } from 'react';
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
import { useAuth } from '@/hooks/useAuth';
import { usePlantHealth } from '@/hooks/usePlantHealth';
import { Plant } from '@/types/dashboard';
import { fetchPlants, fetchUnhealthySources, fetchPvciIsaFloodSummary } from '@/api/plantHealth';
import { UnhealthyBar } from '@/types/dashboard';
import PriorityBreakdownDonut from '@/components/PriorityBreakdownDonut';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TopFloodWindowsChart, { TopFloodWindowRow } from '@/components/dashboard/TopFloodWindowsChart';


// Default plant used before API loads
const defaultPlant: Plant = { id: 'pvcI', name: 'PVC-I', status: 'active' };

export default function DashboardPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedPlant, setSelectedPlant] = useState<Plant>(defaultPlant);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantsLoading, setPlantsLoading] = useState<boolean>(true);
  const [topN, setTopN] = useState<1 | 3>(1);
  const [mode, setMode] = useState<'perSource' | 'flood'>('perSource');
  
  const { 
    data, 
    isLoading, 
    error, 
    refetch, 
    isFetching 
  } = usePlantHealth(selectedPlant.id, topN, mode);

  // Local state for UnhealthyBarChart derived from real alarm sources
  const [unhealthyBarData, setUnhealthyBarData] = useState<UnhealthyBar[]>([]);
  const [unhealthyBarsLoading, setUnhealthyBarsLoading] = useState<boolean>(true);
  // Flood-mode: Top windows dataset and control
  const [topWindows, setTopWindows] = useState<TopFloodWindowRow[]>([]);
  const [topWindowsTopK, setTopWindowsTopK] = useState<5 | 10 | 15>(10);

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
          // Flood mode: aggregate per-source counts across ISA peak windows
          const res = await fetchPvciIsaFloodSummary({
            include_records: true,
            include_windows: true,
            include_alarm_details: true,
            top_n: 10,
            max_windows: 10,
          });
          const records: any[] = Array.isArray(res?.records) ? res.records : [];

          const totals: Record<string, number> = {};
          const rep: Record<string, { start?: string; end?: string; count: number } | undefined> = {};

          for (const rec of records) {
            const topSources: any[] = rec?.peak_window_details?.top_sources || [];
            const start: string | undefined = rec?.peak_window_start || rec?.windows?.[0]?.window_start;
            const end: string | undefined = rec?.peak_window_end || rec?.windows?.[0]?.window_end;
            for (const item of topSources) {
              const src = String(item?.source || 'Unknown');
              const c = Number(item?.count || 0);
              if (!c) continue;
              totals[src] = (totals[src] || 0) + c;
              const best = rep[src];
              if (!best || c > best.count) {
                rep[src] = { start, end, count: c };
              }
            }
          }

          let bars: UnhealthyBar[] = Object.entries(totals).map(([src, sum]) => {
            const r = rep[src];
            const bin_start = r?.start || new Date().toISOString();
            const bin_end = r?.end || new Date(Date.now() + 10 * 60 * 1000).toISOString();
            return {
              id: `${src}-${bin_start}`,
              source: src,
              hits: sum,
              threshold: 10,
              over_by: Math.max(0, sum - 10),
              bin_start,
              bin_end,
            } as UnhealthyBar;
          });

          bars.sort((a, b) => b.hits - a.hits);
          bars = bars.slice(0, 50);

          // Build Top Flood Windows dataset (peak 10-min windows per interval)
          const windowRows: TopFloodWindowRow[] = [];
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
          }

          windowRows.sort((a, b) => b.flood_count - a.flood_count);

          if (mounted) {
            setUnhealthyBarData(bars);
            setTopWindows(windowRows);
          }
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
  }, [topN, selectedPlant.id, mode]);

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
        {/* Plant Selector */}
        <div className="flex items-center justify-between">
          <PlantSelector
            plants={plants}
            selectedPlant={selectedPlant}
            onPlantChange={handlePlantChange}
            disabled={plantsLoading || plants.length <= 1}
          />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Mode</span>
            <Select value={mode} onValueChange={(v) => setMode(v as any)}>
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
              />

              {/* Priority Breakdown Donut (flood_count-weighted) */}
              <PriorityBreakdownDonut />

              {/* New Pareto Top Offenders Chart (Bar + Line) */}
              <ParetoTopOffendersChart />

              {/* New Stacked Bar: Condition Distribution by Location */}
              <ConditionDistributionByLocation plantId={selectedPlant.id} />

              <UnhealthySourcesChart />

              {/* New Word Cloud (priority-colored, bins-heavy score) */}
              <UnhealthySourcesWordCloud />
            </div>
            
            {/* New Simple Bar Chart */}
            <UnhealthySourcesBarChart />
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
              />
              <TopFloodWindowsChart
                data={topWindows}
                threshold={10}
                topK={topWindowsTopK}
                onTopKChange={setTopWindowsTopK}
                isLoading={unhealthyBarsLoading}
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
              />

              {/* PVC-II: Priority Breakdown Donut */}
              <PriorityBreakdownDonut plantId={selectedPlant.id} />

              {/* PVC-II: Pareto Top Offenders */}
              <ParetoTopOffendersChart plantId={selectedPlant.id} />

              {/* PVC-II: Condition Distribution by Location */}
              <ConditionDistributionByLocation plantId={selectedPlant.id} />

              {/* PVC-II: Unhealthy Sources Timeline/Top Sources */}
              <UnhealthySourcesChart plantId={selectedPlant.id} />

              {/* PVC-II: Word Cloud */}
              <UnhealthySourcesWordCloud plantId={selectedPlant.id} />
            </div>

            {/* PVC-II: Simple Top Sources Bar */}
            <UnhealthySourcesBarChart plantId={selectedPlant.id} />
          </div>
        )}

        
      </div>
    </PageShell>
  );
}