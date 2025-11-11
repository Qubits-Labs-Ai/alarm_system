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
  alarm_summary?: {
    sankey_composition?: SankeyResponse;
    sankey_composition_all?: SankeyResponse;
    sankey_composition_no_system?: SankeyResponse;
    [key: string]: any;  // Other summary fields
  };
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

// Alarm Summary: Category Time Series
export interface CategoryTimeSeriesItem {
  date: string; // yyyy-mm-dd (day), yyyy-Www (week), yyyy-mm (month)
  total: number;
  standing: number;
  standing_stale: number;
  standing_instrument_failure: number;
  nuisance: number;
  nuisance_chattering: number;
  nuisance_if_chattering: number;
  flood: number;
  other: number;
}

export interface CategoryTimeSeriesResponse {
  plant_id: string;
  mode: string;
  generated_at: string;
  params: {
    grain: 'day' | 'week' | 'month';
    include_system: boolean;
    stale_min: number;
    chatter_min: number;
    unhealthy_threshold: number;
    window_minutes: number;
  };
  grain: 'day' | 'week' | 'month';
  series: CategoryTimeSeriesItem[];
}

// Alarm Summary: Hourly Seasonality Matrix
export interface HourlyMatrixCell {
  dow: number; // 0=Monday, 6=Sunday
  hour: number; // 0-23
  avg_activations: number;
}

export interface HourlyMatrixResponse {
  plant_id: string;
  mode: string;
  generated_at: string;
  params: {
    include_system: boolean;
  };
  matrix: HourlyMatrixCell[];
}

// Alarm Summary: Sankey Diagram
export interface SankeyEdge {
  source: string;
  target: string;
  value: number;
}

export interface SankeyResponse {
  plant_id: string;
  mode: string;
  generated_at: string;
  params: {
    include_system: boolean;
  };
  nodes: string[];
  edges: SankeyEdge[];
  totals: {
    total: number;
    standing: number;
    standing_stale: number;
    standing_if: number;
    nuisance: number;
    nuisance_chattering: number;
    nuisance_if_chattering: number;
    flood: number;
    other: number;
  };
}

// Comprehensive Health Score (ISO 18.2 Compliant)
export interface ComprehensiveHealthScore {
  overall_health: number;          // 0-100 (weighted composite)
  grade: string;                    // A+, A, B+, B, C, D, F
  risk_level: string;               // Excellent, Good, Acceptable, Overloaded, Critical
  tier_scores: {
    load_compliance: number;        // 40% weight - Tier 1
    alarm_quality: number;          // 30% weight - Tier 2
    operator_response: number;      // 20% weight - Tier 3
    system_reliability: number;     // 10% weight - Tier 4
  };
  sub_scores: {
    // Tier 1: Load Compliance (40%)
    daily_load_score: number;                  // 50% of Tier 1
    window_overload_score: number;             // 30% of Tier 1
    peak_intensity_score: number;              // 20% of Tier 1
    
    // Tier 2: Alarm Quality (30%)
    nuisance_score: number;                    // 60% of Tier 2
    instrument_health_score: number;           // 40% of Tier 2
    
    // Tier 3: Operator Response (20%)
    standing_control_score: number;            // 50% of Tier 3
    response_score: number;                    // 50% of Tier 3
    
    // Tier 4: System Reliability (10%)
    consistency_score: number;                 // 100% of Tier 4
  };
  interpretation: string;           // Human-readable health summary
}

export interface HealthMetrics {
  repeating_pct: number;            // % of alarms that are repeating
  chattering_pct: number;           // % of alarms that are chattering
  standing_pct: number;             // % of alarms that are standing
  cv_daily_alarms: number;          // Coefficient of variation for daily alarm consistency
  total_sources: number;            // Total unique alarm sources
}

export interface ComprehensiveHealthResponse {
  plant_id: string;
  plant_folder: string;
  mode: string;
  generated_at: string;
  comprehensive_health: ComprehensiveHealthScore;
  health_metrics: HealthMetrics;
}
