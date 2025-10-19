/**
 * TypeScript types for PVCI Actual Calculation Mode
 * Alarm lifecycle KPIs: stale, chattering, response times, completion rates
 */

export interface ActualCalcKPIs {
  avg_ack_delay_min: number;
  avg_ok_delay_min: number;
  completion_rate_pct: number;
  avg_alarms_per_day: number;
  avg_alarms_per_hour: number;
  avg_alarms_per_10min: number;
  days_over_288_alarms_pct: number;
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

export interface ActualCalcOverallResponse {
  plant_folder: string;
  mode: string;
  generated_at: string;
  params: {
    stale_min: number;
    chatter_min: number;
  };
  overall: ActualCalcKPIs;
  counts: ActualCalcCounts;
  sample_range: ActualCalcSampleRange;
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
  raw?: any;
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
  raw?: any;
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
  raw?: any;
}
