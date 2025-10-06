import { useQuery } from '@tanstack/react-query';
import { fetchPlantHealth, fetchPvciIsaFloodSummary } from '@/api/plantHealth';
import { UnhealthyBar, UnhealthyBin, PlantHealthResponse } from '@/types/dashboard';

function transformUnhealthyBins(
  bins: UnhealthyBin[], 
  topN: 1 | 3
): UnhealthyBar[] {
  // Group by source and find max hits per source
  const sourceMaxHits = bins.reduce((acc, bin) => {
    const current = acc[bin.source];
    if (!current || bin.hits > current.hits) {
      acc[bin.source] = bin;
    }
    return acc;
  }, {} as Record<string, UnhealthyBin>);

  // Sort by hits descending and take top N per source
  const sortedSources = Object.values(sourceMaxHits)
    .sort((a, b) => b.hits - a.hits);

  // For top N = 1, take the single worst bin per source (already done above)
  // For top N = 3, take up to 3 worst bins per source
  let result: UnhealthyBar[] = [];
  
  if (topN === 1) {
    result = sortedSources.map(bin => ({
      id: `${bin.source}-${bin.bin_start}`,
      ...bin,
    }));
  } else {
    // For top 3, get up to 3 worst bins per source
    const sourceGroups = bins.reduce((acc, bin) => {
      if (!acc[bin.source]) acc[bin.source] = [];
      acc[bin.source].push(bin);
      return acc;
    }, {} as Record<string, UnhealthyBin[]>);

    // Sort each source group by hits and take top 3
    Object.entries(sourceGroups).forEach(([source, sourceBins]) => {
      const topBins = sourceBins
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 3);
      
      result.push(...topBins.map(bin => ({
        id: `${bin.source}-${bin.bin_start}`,
        ...bin,
      })));
    });

    // Sort final result by hits
    result.sort((a, b) => b.hits - a.hits);
  }

  return result;
}

export function usePlantHealth(
  plantId: string = 'pvcI',
  topN: 1 | 3 = 1,
  mode: 'perSource' | 'flood' = 'perSource',
  // disable periodic refetches; manual refresh via UI
  refetchInterval: false | number = false
) {
  return useQuery({
    // Avoid refetching when toggling Top N; transform locally instead
    queryKey: ['plant-health', plantId, mode],
    queryFn: async (): Promise<PlantHealthResponse> => {
      if (mode === 'flood' && plantId === 'pvcI') {
        const res = await fetchPvciIsaFloodSummary({
          window_minutes: 10,
          threshold: 10,
          include_records: false,
          include_windows: true,
          include_alarm_details: true,
          top_n: 10,
          max_windows: 10,
        });
        const overall = (res?.overall || {}) as any;
        const metrics = {
          healthy_percentage: Number(overall.isa_overall_health_pct || 0),
          unhealthy_percentage: Number(overall.percent_time_in_flood || 0),
          total_sources: Number(overall.flood_windows_count || 0),
          total_files: Number(overall.total_alarms || 0),
          last_updated: (res?.generated_at as string) || new Date().toISOString(),
        };
        return { metrics, unhealthy_bins: [] };
      }
      // Default per-source path
      return await fetchPlantHealth(plantId);
    },
    refetchInterval,
    refetchIntervalInBackground: !!refetchInterval,
    // Leverage global defaults for staleTime; keep explicit long freshness here too
    staleTime: 15 * 60 * 1000,
    select: (data) => ({
      ...data,
      unhealthyBars: transformUnhealthyBins(data.unhealthy_bins, topN),
    }),
  });
}