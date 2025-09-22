export interface PlantHealthMetrics {
  healthy_percentage: number;
  unhealthy_percentage: number;
  total_sources: number;
  total_files: number;
  last_updated: string;
}

export interface UnhealthyBin {
  source: string;
  hits: number;
  threshold: number;
  over_by: number;
  bin_start: string;
  bin_end: string;
  // optional extras from backend
  flood_count?: number;
  peak_window_start?: string;
  peak_window_end?: string;
  // descriptive extras
  location_tag?: string;
  condition?: string;
  action?: string;
  priority?: string;
  priority_severity?: string;
  description?: string;
  setpoint_value?: string | number | null;
  raw_units?: string | null;
}

export interface UnhealthyBar {
  id: string;
  source: string;
  hits: number;
  threshold: number;
  over_by: number;
  bin_start: string;
  bin_end: string;
  // optional extras carried through for tooltip
  flood_count?: number;
  peak_window_start?: string;
  peak_window_end?: string;
  location_tag?: string;
  condition?: string;
  action?: string;
  priority?: string;
  priority_severity?: string;
  description?: string;
  setpoint_value?: string | number | null;
  raw_units?: string | null;
}

export interface PlantHealthResponse {
  metrics: PlantHealthMetrics;
  unhealthy_bins: UnhealthyBin[];
}

export interface Plant {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}