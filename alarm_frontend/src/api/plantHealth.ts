import { PlantHealthResponse, Plant } from '@/types/dashboard';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Map backend plant_code (e.g., "PVC-I") to frontend plant id used by health endpoints (e.g., "pvcI")
const PLANT_ID_MAP: Record<string, string> = {
  'PVC-I': 'pvcI',
  'PVC-II': 'pvcII',
  'PVC-III': 'pvcIII',
  'PP': 'pp',
  'VCM': 'vcm',
};

export function normalizePlantId(plantCode: string): string {
  return PLANT_ID_MAP[plantCode] || plantCode.toLowerCase().replace(/-/g, '');
}

export async function fetchPlants(): Promise<Plant[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/plants`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const items: Plant[] = (data?.plants || []).map((p: any) => {
      const id = normalizePlantId(p.plant_code);
      // Mark all plants as active since we now have mock data for all
      return {
        id,
        name: p.plant_code,
        status: 'active',
      } as Plant;
    });
    // Sort by desired display order: PVC-I, PVC-II, PVC-III, PP, VCM
    const ORDER: Record<string, number> = { pvcI: 0, pvcII: 1, pvcIII: 2, pp: 3, vcm: 4 };
    items.sort((a, b) => (ORDER[a.id] ?? 999) - (ORDER[b.id] ?? 999));
    return items;
  } catch (e) {
    console.warn('Failed to fetch plants:', e);
    // No mock fallback: return empty list
    return [];
  }
}

export async function fetchUnhealthySources(
  startTime?: string,
  endTime?: string,
  binSize: string = '10T',
  alarmThreshold: number = 10
) {
  // Only call the real endpoint. No synthetic fallbacks.
  try {
    const url = new URL(`${API_BASE_URL}/pvcI-health/unhealthy-sources`);
    url.searchParams.set('bin_size', binSize);
    url.searchParams.set('alarm_threshold', alarmThreshold.toString());

    if (startTime) url.searchParams.set('start_time', startTime);
    if (endTime) url.searchParams.set('end_time', endTime);

    const response = await fetch(url.toString());
    if (!response.ok) {
      return { count: 0, records: [] };
    }
    return await response.json();
  } catch (error) {
    console.warn('Unhealthy sources request failed:', error);
    return { count: 0, records: [] };
  }
}

export async function fetchPlantHealth(
  plantId: string = 'pvcI',
  binSize: string = '10T',
  alarmThreshold: number = 10
): Promise<PlantHealthResponse> {
  // Try real API for any plant. No mock fallbacks.
  const url = new URL(`${API_BASE_URL}/${plantId}-health/overall`);
  url.searchParams.set('bin_size', binSize);
  url.searchParams.set('alarm_threshold', alarmThreshold.toString());

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const overall = data.overall || {};
    const totals = overall.totals || {};

    return {
      metrics: {
        healthy_percentage: overall.health_pct_simple || 0,
        unhealthy_percentage: overall.unhealthy_percentage || 0,
        total_sources: totals.sources || 0,
        total_files: totals.files || 0,
        last_updated: data.generated_at || new Date().toISOString(),
      },
      unhealthy_bins: transformUnhealthyBinsData(overall.unhealthy_sources_by_bins || {}),
    };
  } catch (error) {
    console.warn(`Failed to fetch data for plant ${plantId}:`, error);
    return {
      metrics: {
        healthy_percentage: 0,
        unhealthy_percentage: 0,
        total_sources: 0,
        total_files: 0,
        last_updated: '',
      },
      unhealthy_bins: [],
    };
  }
}

function transformUnhealthyBinsData(unhealthySourcesByBins: Record<string, any[]>): any[] {
  // Transform the grouped unhealthy sources data into the format expected by the frontend
  const result: any[] = [];
  
  Object.entries(unhealthySourcesByBins).forEach(([binRange, sources]) => {
    sources.forEach((source, index) => {
      result.push({
        source: source.filename.replace('.csv', ''),
        hits: source.unhealthy_bins,
        threshold: 10, // Default threshold
        over_by: Math.max(0, source.unhealthy_bins - 10),
        bin_start: new Date().toISOString(),
        bin_end: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes later
        bin_range: binRange,
        health_pct: source.health_pct,
        num_sources: source.num_sources
      });
    });
  });
  
  // Sort by hits (unhealthy_bins) in descending order
  return result.sort((a, b) => b.hits - a.hits);
}
