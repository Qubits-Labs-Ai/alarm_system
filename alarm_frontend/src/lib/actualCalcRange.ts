import { ActualCalcFloodsResponse } from '@/types/actualCalc';
import { UnhealthyBar } from '@/types/dashboard';

export type FloodWindow = ActualCalcFloodsResponse['windows'][number];

function isMetaSource(name: string): boolean {
  const s = String(name || '').trim().toUpperCase();
  if (!s) return false;
  return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM');
}

export function filterWindowsByRange(windows: FloodWindow[], startIso: string, endIso: string): FloodWindow[] {
  try {
    const sMs = new Date(startIso).getTime();
    const eMs = new Date(endIso).getTime();
    if (!isFinite(sMs) || !isFinite(eMs)) return windows || [];
    return (windows || []).filter((w) => {
      const ws = new Date(w.start).getTime();
      const we = new Date(w.end).getTime();
      return Math.min(eMs, we) > Math.max(sMs, ws);
    });
  } catch {
    return windows || [];
  }
}

export function aggregateBarsFromWindows(
  windows: FloodWindow[],
  threshold: number,
  includeSystem: boolean,
  rangeStartIso: string,
  rangeEndIso: string
): UnhealthyBar[] {
  const bySource = new Map<string, number>();
  for (const w of windows || []) {
    const srcs = w?.sources_involved || {};
    for (const [source, count] of Object.entries(srcs)) {
      if (!includeSystem && isMetaSource(source)) continue;
      const prev = bySource.get(source) || 0;
      bySource.set(source, prev + Number(count || 0));
    }
  }
  const out: UnhealthyBar[] = Array.from(bySource.entries())
    .map(([source, sum]) => ({
      id: source,
      source,
      hits: sum,
      threshold,
      over_by: Math.max(0, sum - threshold),
      bin_start: rangeStartIso,
      bin_end: rangeEndIso,
    }))
    .filter((b) => b.hits >= threshold)
    .sort((a, b) => b.hits - a.hits);
  return out;
}

export function buildTopActorsFromWindows(
  windows: FloodWindow[],
  includeSystem: boolean
): Array<{ Source: string; Total_Alarm_In_Floods: number; Flood_Involvement_Count: number }> {
  const totals = new Map<string, number>();
  const involvement = new Map<string, number>();
  for (const w of windows || []) {
    const srcs = w?.sources_involved || {};
    for (const [source, count] of Object.entries(srcs)) {
      if (!includeSystem && isMetaSource(source)) continue;
      totals.set(source, (totals.get(source) || 0) + Number(count || 0));
      involvement.set(source, (involvement.get(source) || 0) + (Number(count || 0) > 0 ? 1 : 0));
    }
  }
  return Array.from(totals.entries())
    .map(([Source, Total_Alarm_In_Floods]) => ({
      Source,
      Total_Alarm_In_Floods,
      Flood_Involvement_Count: involvement.get(Source) || 0,
    }))
    .sort((a, b) => b.Total_Alarm_In_Floods - a.Total_Alarm_In_Floods);
}

export function buildUnhealthyPeriodsFromWindows(
  windows: FloodWindow[],
  threshold: number,
  includeSystem: boolean
): Array<{ Source: string; Unhealthy_Periods: number }> {
  const periods = new Map<string, number>();
  for (const w of windows || []) {
    const srcs = w?.sources_involved || {};
    for (const [source, count] of Object.entries(srcs)) {
      if (!includeSystem && isMetaSource(source)) continue;
      const c = Number(count || 0);
      if (c >= threshold) {
        periods.set(source, (periods.get(source) || 0) + 1);
      }
    }
  }
  return Array.from(periods.entries())
    .map(([Source, Unhealthy_Periods]) => ({ Source, Unhealthy_Periods }))
    .sort((a, b) => b.Unhealthy_Periods - a.Unhealthy_Periods);
}
