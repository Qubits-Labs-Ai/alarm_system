import { create } from 'zustand';

interface InsightModalState {
  isOpen: boolean;
  chartData: any | null;
  chartTitle: string | null;
  onOpen: (data: any, title: string) => void;
  onClose: () => void;
}

export const useInsightModal = create<InsightModalState>((set) => ({
  isOpen: false,
  chartData: null,
  chartTitle: null,
  onOpen: (data, title) => set({ isOpen: true, chartData: data, chartTitle: title }),
  onClose: () => set({ isOpen: false, chartData: null, chartTitle: null }),
}));
