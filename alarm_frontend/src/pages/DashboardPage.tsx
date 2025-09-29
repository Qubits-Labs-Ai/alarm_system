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
import { fetchPlants, fetchUnhealthySources } from '@/api/plantHealth';
import { UnhealthyBar } from '@/types/dashboard';
import PriorityBreakdownDonut from '@/components/PriorityBreakdownDonut';


// Default plant used before API loads
const defaultPlant: Plant = { id: 'pvcI', name: 'PVC-I', status: 'active' };

export default function DashboardPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedPlant, setSelectedPlant] = useState<Plant>(defaultPlant);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantsLoading, setPlantsLoading] = useState<boolean>(true);
  const [topN, setTopN] = useState<1 | 3>(1);
  
  const { 
    data, 
    isLoading, 
    error, 
    refetch, 
    isFetching 
  } = usePlantHealth(selectedPlant.id, topN);

  // Local state for UnhealthyBarChart derived from real alarm sources
  const [unhealthyBarData, setUnhealthyBarData] = useState<UnhealthyBar[]>([]);
  const [unhealthyBarsLoading, setUnhealthyBarsLoading] = useState<boolean>(true);

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

  // Load Top Bars from real alarm sources endpoint
  useEffect(() => {
    let mounted = true;
    async function loadBars() {
      try {
        setUnhealthyBarsLoading(true);
        // Use backend fast path (saved JSON). No time filter to show historical top sources.
        const res = await fetchUnhealthySources();
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
      } finally {
        if (mounted) setUnhealthyBarsLoading(false);
      }
    }
    loadBars();
    return () => { mounted = false; };
  }, [topN]);

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
        />

        {/* Charts Section */}
        {selectedPlant.id === 'pvcI' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <UnhealthyBarChart
                data={unhealthyBarData}
                threshold={10}
                topN={topN}
                onTopNChange={handleTopNChange}
                isLoading={unhealthyBarsLoading}
              />

              {/* Priority Breakdown Donut (flood_count-weighted) */}
              <PriorityBreakdownDonut />

              {/* New Pareto Top Offenders Chart (Bar + Line) */}
              <ParetoTopOffendersChart />

              {/* New Stacked Bar: Condition Distribution by Location */}
              <ConditionDistributionByLocation />

              <UnhealthySourcesChart />

              {/* New Word Cloud (priority-colored, bins-heavy score) */}
              <UnhealthySourcesWordCloud />
            </div>
            
            {/* New Simple Bar Chart */}
            <UnhealthySourcesBarChart />
          </div>
        )}
      </div>
    </PageShell>
  );
}