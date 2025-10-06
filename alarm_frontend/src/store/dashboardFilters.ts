import { create } from 'zustand';

export type TimeRange = '1h' | '6h' | '24h' | '7d' | 'all';
export type WindowMode = 'recent' | 'peak';

interface DashboardFiltersState {
  selectedMonth: string; // 'all' or 'YYYY-MM'
  timeRange: TimeRange;
  windowMode: WindowMode;
  includeSystem: boolean;
  setSelectedMonth: (m: string) => void;
  setTimeRange: (t: TimeRange) => void;
  setWindowMode: (w: WindowMode) => void;
  setIncludeSystem: (v: boolean) => void;
}

export const useDashboardFilters = create<DashboardFiltersState>((set) => ({
  selectedMonth: 'all',
  timeRange: 'all',
  windowMode: 'peak',
  includeSystem: true,
  setSelectedMonth: (selectedMonth) => set((s) => ({ ...s, selectedMonth })),
  setTimeRange: (timeRange) => set((s) => ({ ...s, timeRange })),
  setWindowMode: (windowMode) => set((s) => ({ ...s, windowMode })),
  setIncludeSystem: (includeSystem) => set((s) => ({ ...s, includeSystem })),
}));
