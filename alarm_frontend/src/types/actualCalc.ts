/**
 * TypeScript types for PVCI Actual Calculation Mode
 * Alarm lifecycle KPIs: stale, chattering, response times, completion rates
 */

export interface ActualCalcKPIs {
  avg_ack_delay_min: number;
  avg_ok_delay_min: number;
  completion_rate_pct: number;
  avg_alarms_per_day: number;           // ISO/EEMUA 191 - activation-based
  avg_alarms_per_hour: number;          // ISO/EEMUA 191 - activation-based
  avg_alarms_per_10min: number;         // ISO/EEMUA 191 - activation-based
  days_over_288_count?: number;         // NEW: Number of days exceeding ISO threshold
  days_over_288_alarms_pct: number;     // ISO/EEMUA 191 - activation-based
  days_unacceptable_count?: number;     // NEW: Number of critically overloaded days (≥720/day)
  days_unacceptable_pct?: number;       // NEW: Percentage of critically overloaded days
  total_days_analyzed?: number;         // NEW: Total days in dataset
  total_unique_alarms?: number;         // NEW: Total unique alarm activations
  activation_time_in_overload_windows_pct?: number;
  activation_time_in_unacceptable_windows_pct?: number;
  activation_overall_health_pct?: number;
  total_activation_windows?: number;
  overload_windows_count?: number;
  unacceptable_windows_count?: number;
  peak_10min_activation_count?: number;
  peak_10min_window_start?: string | null;
  peak_10min_window_end?: string | null;
}

// Condition Distribution by Location (Actual-Calc)
export interface ConditionDistItem {
  location: string;
  total: number;
  by_condition: Record<string, number>;
  latest_ts?: number;
}

export interface ActualCalcConditionDistributionResponse {
  plant_id?: string;
  plant_folder: string;
  mode: string;
  generated_at: string;
  params: {
    window_minutes: number;
    include_system?: boolean;
    window_mode?: string;
  };
  observation_range?: { start: string | null; end: string | null };
  items: ConditionDistItem[];
  raw?: unknown;
}

export interface PeakDetailsResponse {
  window: { start: string; end: string };
  total: number; // sum of unique activations across sources within the window
  top_sources: Array<{ source: string; count: number }>;
}

export interface PerSourceRecord {
  Source: string;
  Unique_Alarms: number;
  Standing_Alarms?: number; // new
  Stale_Alarms?: number;    // new (replaces Stale_Count)
  Instrument_Failure?: number; // new (standing)
  Instrument_Failure_Chattering?: number; // new (from chattering logic)
  Repeating_Alarms?: number;  // new
  Stale_Count?: number;     // legacy (fallback only)
  Chattering_Count?: number; // renamed in backend from Chattering_Alarms
}

export interface AlarmCycle {
  source: string;
  start_time: string;
  ack_time: string | null;
  ok_time: string | null;
  ack_delay: number | null;
  ok_delay: number | null;
}

export interface ActualCalcCounts {
  total_sources: number;
  total_alarms: number;
  total_standing?: number;             // new
  total_stale: number;                 // now stale standing subtype
  total_instrument_failure?: number;   // new
  total_repeating?: number;                 // new
  total_chattering: number;
  total_instrument_failure_chattering?: number; // new
  total_cycles: number;
}

export interface ActualCalcSampleRange {
  start: string | null;
  end: string | null;
}

export interface ActualCalcPagination {
  offset: number;
  limit: number;
  total: number;
  returned: number;
}

export interface FrequencyMetrics {
  params: {
    iso_threshold: number;
    unacceptable_threshold: number;
  };
  summary: {
    avg_alarms_per_day: number;
    avg_alarms_per_hour: number;
    avg_alarms_per_10min: number;
    days_over_288_count: number;
    days_over_288_alarms_pct: number;
    days_unacceptable_count: number;
    days_unacceptable_pct: number;
    total_days_analyzed: number;
    total_unique_alarms: number;
    start_date: string;
    end_date: string;
  };
  alarms_per_day: Array<{
    Date: string;
    Alarm_Count: number;
  }>;
  days_over_288: Array<{
    Date: string;
    Alarm_Count: number;
  }>;
  days_unacceptable: Array<{
    Date: string;
    Alarm_Count: number;
  }>;
}

export interface ActualCalcOverallResponse {
  plant_folder: string;
  mode: string;
  generated_at: string;
  params: {
    stale_min: number;
    chatter_min: number;
    unhealthy_threshold?: number;
    window_minutes?: number;
    flood_source_threshold?: number;
    act_window_overload_op?: string;
    act_window_overload_threshold?: number;
    act_window_unacceptable_op?: string;
    act_window_unacceptable_threshold?: number;
  };
  overall: ActualCalcKPIs;
  counts: ActualCalcCounts;
  sample_range: ActualCalcSampleRange;
  frequency?: FrequencyMetrics;  // New frequency block
  per_source?: PerSourceRecord[];
  per_source_pagination?: ActualCalcPagination;
  cycles?: AlarmCycle[];
}

export interface ActualCalcPerSourceResponse {
  source: string;
  metrics: PerSourceRecord;
  cycles?: AlarmCycle[];
  cycles_count?: number;
}

export interface RegenerateCacheResponse {
  status: string;
  message: string;
  params: {
    stale_min: number;
    chatter_min: number;
  };
  counts: ActualCalcCounts;
  compute_time_seconds: number;
  cache_size_mb: number;
  generated_at: string;
}

export interface ActualCalcUnhealthyResponse {
  plant_folder: string;
  mode: string;
  generated_at: string;
  params: {
    unhealthy_threshold: number;
    window_minutes: number;
  };
  observation_range?: {
    start: string | null;
    end: string | null;
  };
  total_periods: number;
  per_source_total: number;
  per_source: Array<{
    Source: string;
    Unhealthy_Periods: number;
  }>;
  raw?: unknown;
}

export interface ActualCalcFloodsResponse {
  plant_folder: string;
  mode: string;
  generated_at: string;
  params: {
    window_minutes: number;
    source_threshold: number;
  };
  observation_range?: {
    start: string | null;
    end: string | null;
  };
  totals: {
    total_windows: number;
    total_flood_count: number;
  };
  windows_total: number;
  windows: Array<{
    id: string;
    start: string;
    end: string;
    source_count: number;
    flood_count: number;
    rate_per_min: number | null;
    sources_involved: Record<string, number>;
    top_sources: Array<{ source: string; count: number }>;
  }>;
  raw?: unknown;
}

export interface ActualCalcBadActorsResponse {
  plant_folder: string;
  mode: string;
  generated_at: string;
  observation_range?: { start: string | null; end: string | null };
  total_actors: number;
  actors_total?: number;
  top_actors: Array<{
    Source: string;
    Total_Alarm_In_Floods: number;
    Flood_Involvement_Count: number;
  }>;
  raw?: unknown;
}
