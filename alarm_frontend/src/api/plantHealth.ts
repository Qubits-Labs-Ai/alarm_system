import { PlantHealthResponse, Plant } from '@/types/dashboard';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Simple request cache: in-memory + localStorage with TTL and in-flight de-duplication
type CacheEntry<T = any> = { ts: number; data: T };
const memCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>();
const STORAGE_PREFIX = 'ams.apiCache.v1:';

function now() {
  return Date.now();
}

function getStorageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

function readLocal<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(getStorageKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeLocal<T>(key: string, value: CacheEntry<T>) {
  try {
    localStorage.setItem(getStorageKey(key), JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

async function fetchWithCache<T = any>(url: string, ttlMs = 15 * 60 * 1000): Promise<T> {
  const key = url;

  // Serve from memory cache if fresh
  const m = memCache.get(key);
  if (m && now() - m.ts < ttlMs) {
    return m.data as T;
  }

  // Serve from localStorage if fresh
  const s = readLocal<T>(key);
  if (s && now() - s.ts < ttlMs) {
    memCache.set(key, s);
    return s.data as T;
  }

  // De-duplicate concurrent requests
  if (inflight.has(key)) {
    return inflight.get(key)! as Promise<T>;
  }

  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as T;
    const entry: CacheEntry<T> = { ts: now(), data };
    memCache.set(key, entry);
    writeLocal<T>(key, entry);
    return data;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

/**
 * Clears the in-memory and localStorage API cache. Optionally clears only
 * entries whose keys start with the provided prefix (URL prefix).
 */
export function clearApiCache(prefix?: string) {
  // memory
  if (!prefix) {
    memCache.clear();
  } else {
    for (const k of Array.from(memCache.keys())) {
      if (k.startsWith(prefix)) memCache.delete(k);
    }
  }
  // localStorage
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const isOurKey = k.startsWith(STORAGE_PREFIX);
      if (!isOurKey) continue;
      if (!prefix) keysToRemove.push(k);
      else if (k.replace(STORAGE_PREFIX, '').startsWith(prefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

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

// ISA 18.2 Plant-wide flood summary (PVC-I only for now)
export async function fetchPvciIsaFloodSummary(params?: {
  window_minutes?: number;
  threshold?: number;
  start_time?: string;
  end_time?: string;
  include_records?: boolean;
  include_windows?: boolean;
  include_alarm_details?: boolean;
  top_n?: number;
  max_windows?: number;
}) {
  const {
    window_minutes = 10,
    threshold = 10,
    start_time,
    end_time,
    include_records = false,
    include_windows = true,
    include_alarm_details = true,
    top_n = 10,
    max_windows = 10,
  } = params || {};

  const url = new URL(`${API_BASE_URL}/pvcI-health/isa-flood-summary`);
  url.searchParams.set('window_minutes', String(window_minutes));
  url.searchParams.set('threshold', String(threshold));
  url.searchParams.set('include_records', String(include_records));
  url.searchParams.set('include_windows', String(include_windows));
  url.searchParams.set('include_alarm_details', String(include_alarm_details));
  url.searchParams.set('top_n', String(top_n));
  url.searchParams.set('max_windows', String(max_windows));
  if (start_time) url.searchParams.set('start_time', start_time);
  if (end_time) url.searchParams.set('end_time', end_time);

  try {
    // ISA summary changes infrequently; cache for 30 minutes
    return await fetchWithCache(url.toString(), 30 * 60 * 1000);
  } catch (e) {
    console.warn('Failed to fetch ISA flood summary:', e);
    return null;
  }
}

export async function fetchPlants(): Promise<Plant[]> {
  try {
    const data = await fetchWithCache(`${API_BASE_URL}/plants`, 60 * 60 * 1000);
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
  alarmThreshold: number = 10,
  plantId: string = 'pvcI'
) {
  // Only call the real endpoint. No synthetic fallbacks.
  try {
    const url = new URL(`${API_BASE_URL}/${plantId}-health/unhealthy-sources`);
    url.searchParams.set('bin_size', binSize);
    url.searchParams.set('alarm_threshold', alarmThreshold.toString());

    if (startTime) url.searchParams.set('start_time', startTime);
    if (endTime) url.searchParams.set('end_time', endTime);

    // Filtered datasets can still be cached briefly; keep 15 minutes default
    const data = await fetchWithCache(url.toString(), 15 * 60 * 1000);
    return data;
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
    // Backend already serves pre-saved JSON; cache for 30 minutes
    const data = await fetchWithCache(url.toString(), 30 * 60 * 1000);
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
