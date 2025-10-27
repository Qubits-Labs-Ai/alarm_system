/**
 * API functions for PVCI Actual Calculation Mode
 * Fetches alarm lifecycle KPIs, per-source metrics, and alarm cycles
 */

import { API_BASE_URL } from './config';
import {
  ActualCalcOverallResponse,
  ActualCalcPerSourceResponse,
  RegenerateCacheResponse,
  ActualCalcUnhealthyResponse,
  ActualCalcFloodsResponse,
  ActualCalcBadActorsResponse,
  PeakDetailsResponse,
  ActualCalcConditionDistributionResponse,
} from '@/types/actualCalc';

// Simple cache reuse from plantHealth.ts pattern
type CacheEntry<T = any> = { ts: number; data: T };
const memCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>();
const STORAGE_PREFIX = 'ams.apiCache.v1:';

function now() {
  return Date.now();
}

/**
 * Fetch Condition Distribution by Location for any plant (actual-calc)
 */
export async function fetchPlantActualCalcConditionDistribution(
  plantId: string,
  params?: {
    start_time?: string;
    end_time?: string;
    window_mode?: 'peak' | 'recent';
    include_system?: boolean;
    top?: number;
    sort?: 'total' | 'az';
    timeout_ms?: number;
  }
): Promise<ActualCalcConditionDistributionResponse> {
  const {
    start_time,
    end_time,
    window_mode = 'peak',
    include_system = false,
    top = 10,
    sort = 'total',
    timeout_ms,
  } = params || {};

  const url = new URL(`${API_BASE_URL}/actual-calc/${plantId}/condition-distribution`);
  if (start_time) url.searchParams.set('start_time', start_time);
  if (end_time) url.searchParams.set('end_time', end_time);
  if (!start_time || !end_time) url.searchParams.set('window_mode', window_mode);
  url.searchParams.set('include_system', String(include_system));
  url.searchParams.set('top', String(top));
  url.searchParams.set('sort', sort);

  return fetchWithCache<ActualCalcConditionDistributionResponse>(url.toString(), 5 * 60 * 1000, timeout_ms);
}

/**
 * Fetch activation peak details (per-source unique activations in a given window)
 */
export async function fetchPvciActualCalcPeakDetails(params?: {
  start_iso?: string;
  end_iso?: string;
  stale_min?: number;
  chatter_min?: number;
  timeout_ms?: number;
}): Promise<PeakDetailsResponse> {
  const { start_iso, end_iso, stale_min = 60, chatter_min = 10, timeout_ms } = params || {};
  const url = new URL(`${API_BASE_URL}/pvcI-actual-calc/peak-details`);
  url.searchParams.set('stale_min', String(stale_min));
  url.searchParams.set('chatter_min', String(chatter_min));
  // Prefer backend JSON cache for speed
  url.searchParams.set('use_cache', 'true');
  // Cache-bust to avoid stale inflight/localStorage entries after backend change
  url.searchParams.set('api_version', '2');
  if (start_iso) url.searchParams.set('start_iso', start_iso);
  if (end_iso) url.searchParams.set('end_iso', end_iso);
  return fetchWithCache<PeakDetailsResponse>(url.toString(), 5 * 60 * 1000, timeout_ms);
}

/**
 * Fetch unhealthy periods per source (from actual-calc cache)
 */
export async function fetchPvciActualCalcUnhealthy(params?: {
  stale_min?: number;
  chatter_min?: number;
  offset?: number;
  limit?: number;
  top?: number;
  timeout_ms?: number;
}): Promise<ActualCalcUnhealthyResponse> {
  const { stale_min = 60, chatter_min = 10, offset = 0, limit = 200, top, timeout_ms } = params || {};
  const url = new URL(`${API_BASE_URL}/pvcI-actual-calc/unhealthy`);
  url.searchParams.set('stale_min', String(stale_min));
  url.searchParams.set('chatter_min', String(chatter_min));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  if (typeof top === 'number') url.searchParams.set('top', String(top));
  return fetchWithCache<ActualCalcUnhealthyResponse>(url.toString(), 5 * 60 * 1000, timeout_ms);
}

/**
 * Fetch flood windows summary (from actual-calc cache)
 */
export async function fetchPvciActualCalcFloods(params?: {
  stale_min?: number;
  chatter_min?: number;
  limit?: number;
  timeout_ms?: number;
}): Promise<ActualCalcFloodsResponse> {
  const { stale_min = 60, chatter_min = 10, limit = 100, timeout_ms } = params || {};
  const url = new URL(`${API_BASE_URL}/pvcI-actual-calc/floods`);
  url.searchParams.set('stale_min', String(stale_min));
  url.searchParams.set('chatter_min', String(chatter_min));
  url.searchParams.set('limit', String(limit));
  return fetchWithCache<ActualCalcFloodsResponse>(url.toString(), 5 * 60 * 1000, timeout_ms);
}

/**
 * Fetch bad actors (from actual-calc cache)
 */
export async function fetchPvciActualCalcBadActors(params?: {
  stale_min?: number;
  chatter_min?: number;
  limit?: number;
  timeout_ms?: number;
}): Promise<ActualCalcBadActorsResponse> {
  const { stale_min = 60, chatter_min = 10, limit = 9999, timeout_ms } = params || {};
  const url = new URL(`${API_BASE_URL}/pvcI-actual-calc/bad-actors`);
  url.searchParams.set('stale_min', String(stale_min));
  url.searchParams.set('chatter_min', String(chatter_min));
  url.searchParams.set('limit', String(limit));
  return fetchWithCache<ActualCalcBadActorsResponse>(url.toString(), 5 * 60 * 1000, timeout_ms);
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

async function fetchWithCache<T = any>(url: string, ttlMs = 15 * 60 * 1000, timeoutMs?: number): Promise<T> {
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
    const controller = new AbortController();
    let timeoutId: any = null;
    try {
      if (timeoutMs && timeoutMs > 0) {
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      }
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as T;
      const entry: CacheEntry<T> = { ts: now(), data };
      memCache.set(key, entry);
      writeLocal<T>(key, entry);
      return data;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

/**
 * Fetch overall actual-calc KPIs for PVCI
 */
export async function fetchPvciActualCalcOverall(params?: {
  stale_min?: number;
  chatter_min?: number;
  include_per_source?: boolean;
  offset?: number;
  limit?: number;
  include_cycles?: boolean;
  raw?: boolean;
  force_recompute?: boolean;
  timeout_ms?: number;
}): Promise<ActualCalcOverallResponse> {
  const {
    stale_min = 60,
    chatter_min = 10,
    include_per_source = false,
    offset = 0,
    limit = 200,
    include_cycles = false,
    raw = false,
    force_recompute = false,
    timeout_ms,
  } = params || {};

  const url = new URL(`${API_BASE_URL}/pvcI-actual-calc/overall`);
  url.searchParams.set('stale_min', String(stale_min));
  url.searchParams.set('chatter_min', String(chatter_min));
  url.searchParams.set('include_per_source', String(include_per_source));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('include_cycles', String(include_cycles));
  url.searchParams.set('raw', String(raw));
  url.searchParams.set('force_recompute', String(force_recompute));
  // Cache-bust to ensure clients receive frequency-enabled payloads after backend update
  url.searchParams.set('api_version', '2');

  // Cache for 15 minutes when no per_source, 5 minutes with per_source
  const ttl = include_per_source ? 5 * 60 * 1000 : 15 * 60 * 1000;

  return fetchWithCache<ActualCalcOverallResponse>(url.toString(), ttl, timeout_ms);
}

/**
 * Fetch per-source metrics for a specific source
 */
export async function fetchPvciActualCalcPerSource(params: {
  source: string;
  include_cycles?: boolean;
  stale_min?: number;
  chatter_min?: number;
  timeout_ms?: number;
}): Promise<ActualCalcPerSourceResponse> {
  const {
    source,
    include_cycles = false,
    stale_min = 60,
    chatter_min = 10,
    timeout_ms,
  } = params;

  const url = new URL(`${API_BASE_URL}/pvcI-actual-calc/per-source`);
  url.searchParams.set('source', source);
  url.searchParams.set('include_cycles', String(include_cycles));
  url.searchParams.set('stale_min', String(stale_min));
  url.searchParams.set('chatter_min', String(chatter_min));

  // Cache per-source queries for 5 minutes
  return fetchWithCache<ActualCalcPerSourceResponse>(url.toString(), 5 * 60 * 1000, timeout_ms);
}

/**
 * Regenerate the actual-calc cache (force recomputation)
 */
export async function regeneratePvciActualCalcCache(params?: {
  stale_min?: number;
  chatter_min?: number;
  timeout_ms?: number;
}): Promise<RegenerateCacheResponse> {
  const {
    stale_min = 60,
    chatter_min = 10,
    timeout_ms = 120000, // 2 minute timeout for compute
  } = params || {};

  const url = new URL(`${API_BASE_URL}/pvcI-actual-calc/regenerate-cache`);
  url.searchParams.set('stale_min', String(stale_min));
  url.searchParams.set('chatter_min', String(chatter_min));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Clear actual-calc cache entries
 */
export function clearActualCalcCache() {
  const prefix = `${API_BASE_URL}/pvcI-actual-calc/`;
  
  // Clear memory cache
  for (const k of Array.from(memCache.keys())) {
    if (k.startsWith(prefix)) memCache.delete(k);
  }

  // Clear localStorage
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const isOurKey = k.startsWith(STORAGE_PREFIX);
      if (!isOurKey) continue;
      if (k.replace(STORAGE_PREFIX, '').startsWith(prefix)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

// ==================== MULTI-PLANT DYNAMIC API FUNCTIONS ====================

export interface PlantInfo {
  id: string;
  name: string;
  display_name: string;
  description: string;
  active: boolean;
}

export interface PlantsListResponse {
  plants: PlantInfo[];
  total: number;
}

/**
 * Fetch list of all available plants
 */
export async function fetchAvailablePlants(timeout_ms?: number): Promise<PlantsListResponse> {
  const url = `${API_BASE_URL}/actual-calc/plants`;
  return fetchWithCache<PlantsListResponse>(url, 5 * 60 * 1000, timeout_ms);
}

/**
 * Fetch overall actual-calc KPIs for any plant
 */
export async function fetchPlantActualCalcOverall(
  plantId: string,
  params?: {
    stale_min?: number;
    chatter_min?: number;
    include_per_source?: boolean;
    offset?: number;
    limit?: number;
    include_cycles?: boolean;
    raw?: boolean;
    force_recompute?: boolean;
    timeout_ms?: number;
  }
): Promise<ActualCalcOverallResponse> {
  const {
    stale_min = 60,
    chatter_min = 10,
    include_per_source = false,
    offset = 0,
    limit = 200,
    include_cycles = false,
    raw = false,
    force_recompute = false,
    timeout_ms,
  } = params || {};

  const url = new URL(`${API_BASE_URL}/actual-calc/${plantId}/overall`);
  url.searchParams.set('stale_min', String(stale_min));
  url.searchParams.set('chatter_min', String(chatter_min));
  url.searchParams.set('include_per_source', String(include_per_source));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('include_cycles', String(include_cycles));
  url.searchParams.set('raw', String(raw));
  url.searchParams.set('force_recompute', String(force_recompute));

  const ttl = include_per_source ? 5 * 60 * 1000 : 15 * 60 * 1000;
  return fetchWithCache<ActualCalcOverallResponse>(url.toString(), ttl, timeout_ms);
}

/**
 * Fetch per-source metrics for a specific source in any plant
 */
export async function fetchPlantActualCalcPerSource(
  plantId: string,
  params: {
    source: string;
    include_cycles?: boolean;
    stale_min?: number;
    chatter_min?: number;
    timeout_ms?: number;
  }
): Promise<ActualCalcPerSourceResponse> {
  const {
    source,
    include_cycles = false,
    stale_min = 60,
    chatter_min = 10,
    timeout_ms,
  } = params;

  const url = new URL(`${API_BASE_URL}/actual-calc/${plantId}/per-source`);
  url.searchParams.set('source', source);
  url.searchParams.set('include_cycles', String(include_cycles));
  url.searchParams.set('stale_min', String(stale_min));
  url.searchParams.set('chatter_min', String(chatter_min));

  return fetchWithCache<ActualCalcPerSourceResponse>(url.toString(), 5 * 60 * 1000, timeout_ms);
}

/**
 * Fetch unhealthy periods for any plant
 */
export async function fetchPlantActualCalcUnhealthy(
  plantId: string,
  params?: {
    offset?: number;
    limit?: number;
    timeout_ms?: number;
  }
): Promise<ActualCalcUnhealthyResponse> {
  const { offset = 0, limit = 200, timeout_ms } = params || {};
  const url = new URL(`${API_BASE_URL}/actual-calc/${plantId}/unhealthy`);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  return fetchWithCache<ActualCalcUnhealthyResponse>(url.toString(), 5 * 60 * 1000, timeout_ms);
}

/**
 * Fetch flood windows for any plant
 */
export async function fetchPlantActualCalcFloods(
  plantId: string,
  params?: {
    limit?: number;
    timeout_ms?: number;
  }
): Promise<ActualCalcFloodsResponse> {
  const { limit = 100, timeout_ms } = params || {};
  const url = new URL(`${API_BASE_URL}/actual-calc/${plantId}/floods`);
  url.searchParams.set('limit', String(limit));
  return fetchWithCache<ActualCalcFloodsResponse>(url.toString(), 5 * 60 * 1000, timeout_ms);
}

/**
 * Fetch bad actors for any plant
 */
export async function fetchPlantActualCalcBadActors(
  plantId: string,
  params?: {
    limit?: number;
    timeout_ms?: number;
  }
): Promise<ActualCalcBadActorsResponse> {
  const { limit = 9999, timeout_ms } = params || {};
  const url = new URL(`${API_BASE_URL}/actual-calc/${plantId}/bad-actors`);
  url.searchParams.set('limit', String(limit));
  return fetchWithCache<ActualCalcBadActorsResponse>(url.toString(), 5 * 60 * 1000, timeout_ms);
}

/**
 * Regenerate cache for any plant
 */
export async function regeneratePlantActualCalcCache(
  plantId: string,
  params?: {
    stale_min?: number;
    chatter_min?: number;
    timeout_ms?: number;
  }
): Promise<RegenerateCacheResponse> {
  const {
    stale_min = 60,
    chatter_min = 10,
    timeout_ms = 120000, // 2 minute timeout
  } = params || {};

  const url = new URL(`${API_BASE_URL}/actual-calc/${plantId}/regenerate-cache`);
  url.searchParams.set('stale_min', String(stale_min));
  url.searchParams.set('chatter_min', String(chatter_min));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ==================== ALARM SUMMARY: CATEGORY TIME SERIES ====================

/**
 * Fetch exclusive category time series (Standing/Nuisance/Flood/Other) aggregated by day/week/month
 */
export async function fetchPlantActualCalcCategoryTimeSeries(
  plantId: string,
  params?: {
    grain?: 'day' | 'week' | 'month';
    include_system?: boolean;
    timeout_ms?: number;
  }
): Promise<import('@/types/actualCalc').CategoryTimeSeriesResponse> {
  const {
    grain = 'day',
    include_system = false,
    timeout_ms,
  } = params || {};

  const url = new URL(`${API_BASE_URL}/actual-calc/${plantId}/summary/categories`);
  url.searchParams.set('grain', grain);
  url.searchParams.set('include_system', String(include_system));

  // Cache for 15 minutes (computation is expensive)
  return fetchWithCache(url.toString(), 15 * 60 * 1000, timeout_ms);
}

/**
 * Fetch hour-of-day × day-of-week seasonality matrix for alarm activations
 */
export async function fetchPlantActualCalcHourlyMatrix(
  plantId: string,
  params?: {
    include_system?: boolean;
    timeout_ms?: number;
  }
): Promise<import('@/types/actualCalc').HourlyMatrixResponse> {
  const {
    include_system = false,
    timeout_ms,
  } = params || {};

  const url = new URL(`${API_BASE_URL}/actual-calc/${plantId}/summary/hourly_matrix`);
  url.searchParams.set('include_system', String(include_system));

  // Cache for 15 minutes (computation is expensive)
  return fetchWithCache(url.toString(), 15 * 60 * 1000, timeout_ms);
}

/**
 * Fetch Sankey diagram data for exclusive category flow visualization
 */
export async function fetchPlantActualCalcSankey(
  plantId: string,
  params?: {
    include_system?: boolean;
    timeout_ms?: number;
  }
): Promise<import('@/types/actualCalc').SankeyResponse> {
  const {
    include_system = false,
    timeout_ms,
  } = params || {};

  const url = new URL(`${API_BASE_URL}/actual-calc/${plantId}/summary/sankey`);
  url.searchParams.set('include_system', String(include_system));

  // Cache for 15 minutes (computation is expensive)
  return fetchWithCache(url.toString(), 15 * 60 * 1000, timeout_ms);
}
