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
  Stale_Count: number;
  Chattering_Count: number;
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
  total_stale: number;
  total_chattering: number;
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
