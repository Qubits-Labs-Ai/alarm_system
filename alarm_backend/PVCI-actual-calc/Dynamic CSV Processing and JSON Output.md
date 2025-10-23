# Cascade Chat Conversation

  Note: _This is purely the output of the chat conversation and does not contain any raw data, codebase snippets, etc. used to generate the output._

### User Input

@[d:\Qbit-dynamics\alarm_system\alarm_backend\ALARM_DATA_DIR\PVCI-merged] @[d:\Qbit-dynamics\alarm_system\alarm_backend\PVCI-actual-calc\actual_calc_service.py] @[d:\Qbit-dynamics\alarm_system\alarm_backend\PVCI-actual-calc\actual-calc.json] 
for this calcualtion 
for the file PVCI-merged analyze this deeply from scratch how each and everything is working
at first what the thing is done, and then so on example first the file is loaded so how the file is loaded and then what actions performed on it and what calcaulations done on it etc
we should need in points detailed for this to the point of how the json is creating and all values show there
which files and functions are being used for this work


### Planner Response

I'll create a short plan and then inspect the relevant backend files and data locations to trace how the calculation works from loading the PVCI-merged data through to the JSON output.

- I'll set up a TODO list to track this analysis.
- I'll open `actual_calc_service.py` and `actual-calc.json` to understand the implementation and outputs.
- I'll search the backend for references to `PVCI-merged` to find where it's loaded and processed.
- I'll check the `ALARM_DATA_DIR` structure to confirm the presence and type of `PVCI-merged` and list its contents if it's a directory.

*Updated todo list*

### Planner Response

I'll inspect the data source and read the calculation code and output JSON to trace the full pipeline. In parallel, I'll also search the backend for where "PVCI-merged" is referenced.

- Listing `ALARM_DATA_DIR` helps confirm whether `PVCI-merged` is a file or directory and its contents.
- Opening `actual_calc_service.py` and `actual-calc.json` lets me map functions and outputs.
- Searching codebase for "PVCI-merged" shows where it’s loaded and used.

Proceeding to run these lookups in parallel.

*Listed directory [ALARM_DATA_DIR](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR) *

*Searched filesystem*

*Viewed [actual_calc_service.py](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py) *

*Viewed [actual-calc.json](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json) *

*Grep searched codebase*

### Planner Response

I'll retrieve more of [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0) to see the full computation and JSON assembly, list the contents of [PVCI-merged/](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR/PVCI-merged:0:0-0:0) to confirm the merged CSV, and open `actual-calc.json` to examine the output structure. I'll also search the backend for where [run_actual_calc](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94) is invoked to trace the endpoints.

*Listed directory [PVCI-merged](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR/PVCI-merged) *

*Viewed [actual_calc_service.py](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py) *

*Viewed [actual-calc.json](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json) *

*Grep searched codebase*

*Grep searched codebase*

### Planner Response

I'll read the backend entrypoint ([main.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/main.py:0:0-0:0)) to see how [run_actual_calc()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94) is invoked and how caching/writing of `actual-calc.json` is triggered. I'll also open a small portion of `actual-calc.json` to understand the output structure, and peek at the first few lines of [All_Merged.csv](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR/PVCI-merged/All_Merged.csv:0:0-0:0) to confirm the columns and format. Finally, I'll search for where cache helpers are used.

*Viewed [main.py](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/main.py) *

*Viewed [actual-calc.json](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json) *

*Viewed [All_Merged.csv](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR/PVCI-merged/All_Merged.csv) *

*Grep searched codebase*

*Grep searched codebase*

*Updated todo list*

### Planner Response

# Findings

- **Data source**: [ALARM_DATA_DIR/PVCI-merged/All_Merged.csv](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR/PVCI-merged/All_Merged.csv:0:0-0:0) (size ~65 MB)  
  Columns verified from header: `Event Time, Location Tag, Source, Condition, Action, Priority, Description, Value, Units` ([d:\Qbit-dynamics\alarm_system\alarm_backend\ALARM_DATA_DIR\PVCI-merged\All_Merged.csv](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR/PVCI-merged/All_Merged.csv:0:0-0:0))

- **Primary implementation**: [alarm_backend/PVCI-actual-calc/actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)  
  This file loads the merged CSV, computes all KPIs and detailed analytics, and writes a JSON cache at [alarm_backend/PVCI-actual-calc/actual-calc.json](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json:0:0-0:0).

- **Entrypoint and API**: [alarm_backend/main.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/main.py:0:0-0:0)  
  Endpoints invoke [run_actual_calc()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94) and use [read_cache()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1042:0-1090:19)/[write_cache()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1093:0-1210:20) to serve or refresh the JSON. Example endpoint that uses the resulting JSON: `/pvcI-actual-calc/peak-details`.

---

## End-to-end pipeline (from scratch)

- **[1] Load CSV ([load_pvci_merged_csv()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:753:0-800:13))**  
  File: [PVCI-actual-calc/actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)  
  Function: [load_pvci_merged_csv(alarm_data_dir)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:753:0-800:13)  
  Path resolution: `os.path.join(alarm_data_dir, "PVCI-merged", "All_Merged.csv")`  
  Steps:
  - `pd.read_csv(...)`
  - Parse timestamps: `df["Event Time"] = pd.to_datetime(..., errors='coerce')`
  - Normalize action: `df['Action'] = df['Action'].astype(str).str.strip().replace({'nan': ''})`
  - Drop invalid rows: `dropna(subset=['Event Time','Source'])`
  - Logs total rows, distinct sources, time range
  - Returns cleaned DataFrame for all downstream calculations

- **[2] Global thresholds (defaults; overridable via [run_actual_calc()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94))**  
  File: [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)  
  Symbols:
  - Standing/stale: `STALE_THRESHOLD_MIN = 60`  
  - Chattering window: `CHATTER_THRESHOLD_MIN = 10`, `CHATTER_MIN_COUNT = 3`  
  - Unhealthy window: `UNHEALTHY_THRESHOLD = 10`, `WINDOW_MINUTES = 10`, `FLOOD_SOURCE_THRESHOLD = 2`  
  - Activation-window health:  
    `ACT_WINDOW_OVERLOAD_OP=">"`, `ACT_WINDOW_OVERLOAD_THRESHOLD=2`,  
    `ACT_WINDOW_UNACCEPTABLE_OP=">="`, `ACT_WINDOW_UNACCEPTABLE_THRESHOLD=5`  
  These are updated at the start of [run_actual_calc(...)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94) from parameters.

- **[3] Per-source ISO-style alarm states ([analyze_basic_alarm_states()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:127:0-198:32))**  
  File: [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)  
  Computes per-Source:
  - `Unique_Alarms`: New alarm when `Action == ""` and previous state in `IDLE/ACKED`.
  - `Standing_Alarms`: Counted once per ACTIVE episode when duration crosses `STALE_THRESHOLD_MIN` (60 min).
  - `Stale_Alarms` vs `Instrument_Failure`: Standing subtype split by `Condition` text containing keywords [`"FAIL"`, `"BAD"`].
  State machine: starts at `IDLE`; `""` → ACTIVE, `ACK` → ACKED (if ACTIVE), `OK` → IDLE.

- **[4] Repeating & Chattering ([detect_repeating_and_chattering()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:61:0-123:29))**  
  File: [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)  
  Per-Source:
  - Extracts alarm start times using same state machine.
  - `Repeating_Alarms = max(0, Unique_Alarms - 1)`
  - `Chattering_Count`: sliding 10-min window with a deque; increment when window reaches `>=3` starts and avoid double-counting inside same episode.
  - `Instrument_Failure_Chattering`: count of starts whose `Condition` contains keywords.

- **[5] Response cycle metrics ([get_alarm_cycles()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:201:0-229:14) + merge in [calculate_alarm_kpis()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:232:0-284:32))**  
  File: [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)  
  Builds lifecycle for each activation per Source:
  - `start_time` (Blank), `ack_time` (ACK), `ok_time` (OK).  
  Derives:
  - `avg_ack_delay_min`, `avg_ok_delay_min` by time diffs.
  - `completion_rate_pct` = percent of cycles with `ok_time` set.
  - Merges per-source results: [analyze_basic_alarm_states](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:127:0-198:32) + [detect_repeating_and_chattering](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:61:0-123:29) → `summary` DataFrame.

- **[6] Unhealthy windows and floods ([detect_unhealthy_and_flood()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:393:0-505:62))**  
  File: [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)  
  Steps:
  - Build `activations_df` = all unique alarm starts (Blank when `IDLE/ACKED`).
  - For each Source, slide a `WINDOW_MINUTES=10` window; when start-count within window `>= UNHEALTHY_THRESHOLD=10`, record a period.
  - Merge overlapping periods per Source into continuous spans: `merged_unhealthy_df`.
  - Detect floods: if overlapping spans involve `>= FLOOD_SOURCE_THRESHOLD=2` distinct sources, record a flood window.
  - For each flood window, count per-Source activations inside the [start,end] and keep only sources meeting the threshold in that window; store as `Sources_Involved: {source: count}`.
  - Outputs:
    - `unhealthy_summary`: per-Source `Unhealthy_Periods` (number of merged spans)
    - `flood_summary_df`: flood windows with `Flood_Start/End`, `Sources_Involved` dict and `Source_Count`.

- **[7] Activation-window health ([compute_activation_window_metrics()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:567:0-667:5))**  
  File: [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)  
  Using `activations_df` and fixed 10-min bins:
  - Floor activation times to `10min` buckets.
  - Count unique activations per bucket across plant.
  - Compare against overload/unacceptable thresholds using operators (e.g., `>` 2, `>=` 5) to compute:
    - `total_windows`, `overload_windows_count`, `unacceptable_windows_count`
    - `activation_time_in_overload_windows_pct` and `..._unacceptable_windows_pct`
    - `activation_overall_health_pct = 100 - overload_pct`
    - `peak_10min_activation_count` and the `peak_10min_window_start/end`

- **[8] Frequency metrics (ISO/EEMUA) ([calculate_alarm_frequency_metrics()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:289:0-388:5))**  
  File: [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)  
  On unique activations:
  - Averages: `avg_alarms_per_day/hour/10min`
  - Daily counts table
  - Days > 288 (ISO overload) and days ≥ 720 (unacceptable) with percentages
  - Totals and date span

- **[9] Bad actors ([identify_bad_actors()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:508:0-547:24))**  
  File: [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)  
  Across flood windows, aggregates:
  - `Total_Alarm_In_Floods` per Source (sum of counts across flood windows)
  - `Flood_Involvement_Count` (number of flood windows the source participated in)

- **[10] Assemble the cache JSON ([run_actual_calc()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94) → [write_cache()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1093:0-1210:20))**  
  Files: [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0), output [PVCI-actual-calc/actual-calc.json](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json:0:0-0:0)  
  Flow in [run_actual_calc()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94):
  - Load → `df = load_pvci_merged_csv(...)`
  - Per-source + cycle KPIs → `summary, kpis, cycles = calculate_alarm_kpis(df)`
  - Unhealthy/floods → `activations_df, unhealthy_df, flood_df = detect_unhealthy_and_flood(df, ...)`
  - Activation-window health → `act_metrics = compute_activation_window_metrics(activations_df, ...)` then `kpis.update(...)`
  - Frequency metrics → `frequency_result = calculate_alarm_frequency_metrics(df, ...)` then `kpis.update(...)`
  - Build dictionaries for `unhealthy`, `floods`, `bad_actors`, `frequency`
  - Return: `(summary_df, kpis, cycles_df, unhealthy_dict, floods_dict, bad_actors_dict, frequency_dict)`
  - [write_cache(BASE_DIR, ...)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1093:0-1210:20) writes JSON file.

---

## JSON structure and where each field comes from

File: [alarm_backend/PVCI-actual-calc/actual-calc.json](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json:0:0-0:0) (sample lines 1–38 validated)

- **Top level**
  - `plant_folder`: `"PVC-I"` (constant in [write_cache()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1093:0-1210:20))
  - `mode`: `"actual-calc"` (constant)
  - `generated_at`: `datetime.utcnow().isoformat() + "Z"`
  - `params`: copied from [run_actual_calc()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94) inputs (includes standing/chattering, unhealthy, flood, activation-window thresholds)
  - `sample_range`: min/max of `"Event Time"` from source CSV (re-read as metadata)

- **overall** (from `kpis` after updates)
  - `avg_ack_delay_min`, `avg_ok_delay_min`, `completion_rate_pct`  
    From [calculate_alarm_kpis()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:232:0-284:32) → [get_alarm_cycles()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:201:0-229:14).
  - `avg_alarms_per_day/hour/10min`, `days_over_288_count`, `days_over_288_alarms_pct`,  
    `days_unacceptable_count`, `days_unacceptable_pct`, `total_days_analyzed`, `total_unique_alarms`  
    From [calculate_alarm_frequency_metrics()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:289:0-388:5) summary merged into `kpis` via `kpis.update(...)`.
  - `activation_time_in_overload_windows_pct`, `activation_time_in_unacceptable_windows_pct`,  
    `activation_overall_health_pct`, `total_activation_windows`,  
    `overload_windows_count`, `unacceptable_windows_count`,  
    `peak_10min_activation_count`, `peak_10min_window_start`, `peak_10min_window_end`  
    From [compute_activation_window_metrics()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:567:0-667:5) merged into `kpis`.

- **per_source** (list of dict records)  
  From final `summary` DataFrame built by merging:
  - [analyze_basic_alarm_states()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:127:0-198:32) columns:
    - `Unique_Alarms`, `Standing_Alarms`, `Stale_Alarms`, `Instrument_Failure`
  - [detect_repeating_and_chattering()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:61:0-123:29) columns (renamed in [calculate_alarm_kpis()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:232:0-284:32)):
    - `Repeating_Alarms`, `Chattering_Count`, `Instrument_Failure_Chattering`
  Conversion to JSON-safe via [dataframe_to_json_records()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1016:0-1025:18).

- **cycles**  
  Records from [get_alarm_cycles()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:201:0-229:14) via [dataframe_to_json_records()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1016:0-1025:18):
  - `source, start_time, ack_time, ok_time, ack_delay, ok_delay`

- **counts** (derived from `summary` and `cycles`)  
  - `total_sources`: `len(summary_df)`
  - `total_alarms`: sum of `summary_df["Unique_Alarms"]`
  - `total_standing`, `total_stale`, `total_instrument_failure`,  
    `total_repeating`, `total_chattering`, `total_instrument_failure_chattering`,  
    `total_cycles`: sums/counts over summary/cycles

- **unhealthy** (from [detect_unhealthy_and_flood()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:393:0-505:62))  
  - `params`: `{"threshold": unhealthy_threshold, "window_minutes": window_minutes}`
  - `per_source`: list of `{Source, Unhealthy_Periods}` sorted desc
  - `total_periods`: sum of `Unhealthy_Periods`

- **floods** (from [detect_unhealthy_and_flood()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:393:0-505:62))  
  - `params`: `{"window_minutes": window_minutes, "source_threshold": flood_source_threshold}`
  - `windows`: list with:
    - `id`: `"<start_iso>_<end_iso>"`
    - `start`, `end`: ISO strings
    - `source_count`: number of sources in the flood window
    - `flood_count`: sum of counts across involved sources in that window
    - `rate_per_min`: `flood_count / window_minutes`
    - `sources_involved`: raw dict `{source: count}`
    - `top_sources`: sorted list `[{source, count}]`
  - `totals`: `{"total_windows": len(windows), "total_flood_count": sum(flood_count)}`

- **bad_actors** (from [identify_bad_actors()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:508:0-547:24))  
  - `top_actors`: list of `{Source, Total_Alarm_In_Floods, Flood_Involvement_Count}`
  - `total_actors`: number of actors

- **frequency** (from [calculate_alarm_frequency_metrics()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:289:0-388:5))  
  - `params`
  - `summary`
  - `alarms_per_day`: list records for charting
  - `days_over_288`, `days_unacceptable`: list records

---

## How the API uses/generates the JSON

- **Cache helpers**
  - [get_cache_path(base_dir)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1035:0-1039:54) → [PVCI-actual-calc/actual-calc.json](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json:0:0-0:0)
  - [read_cache(base_dir, params)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1042:0-1090:19) → validates param-match (including activation-window thresholds).
  - [write_cache(base_dir, summary_df, kpis, cycles_df, params, alarm_data_dir, unhealthy, floods, bad_actors, frequency)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1093:0-1210:20)  
    Serializes everything to JSON (atomic write with temp rename).

- **Where invoked (in [main.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/main.py:0:0-0:0))**
  - Multiple endpoints read/write this cache. Examples (grep confirmed):
    - Write points:
      - `main.py:2147`, `2352`, `2436`, `2515`, `2602` call [write_cache(...)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1093:0-1210:20)
    - Read points:
      - `main.py:2094`, `2250`, `2418`, `2498`, `2593` call [read_cache(...)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1042:0-1090:19)
  - Peak window details endpoint: `GET /pvcI-actual-calc/peak-details` uses:
    - Prefer cached `overall.peak_10min_*` and nearest `floods.windows[*].top_sources`
    - If `use_cache=false`, computes directly from CSV via [get_activation_peak_details(ALARM_DATA_DIR, start, end)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:670:0-748:13)

---

## Key functions and their responsibilities

- **Loading**
  - [load_pvci_merged_csv()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:753:0-800:13) in [PVCI-actual-calc/actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)

- **Per-source metrics (ISO-style)**
  - [analyze_basic_alarm_states()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:127:0-198:32)  
  - [detect_repeating_and_chattering()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:61:0-123:29)  
  - Combined in [calculate_alarm_kpis()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:232:0-284:32)

- **Cycles and response times**
  - [get_alarm_cycles()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:201:0-229:14) → used by [calculate_alarm_kpis()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:232:0-284:32)

- **Unhealthy/Floods**
  - [detect_unhealthy_and_flood()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:393:0-505:62)  
  - [identify_bad_actors()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:508:0-547:24)

- **Activation-window health**
  - [compute_activation_window_metrics()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:567:0-667:5)

- **Frequency metrics (ISO/EEMUA)**
  - [calculate_alarm_frequency_metrics()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:289:0-388:5)

- **Cache I/O**
  - [read_cache()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1042:0-1090:19), [write_cache()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1093:0-1210:20), [get_cache_path()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1035:0-1039:54)

- **Wrapper**
  - [run_actual_calc()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94) orchestrates all calculations and returns everything for [write_cache()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1093:0-1210:20).

---

## Notes on the unique-activation state machine

- Shared convention across functions:
  - New activation when `Action == ""` and state in `IDLE` or `ACKED`
  - `ACK` transitions `ACTIVE → ACKED`
  - `OK` transitions to `IDLE` from any state  
  This aligns event data (Blank/ACK/OK) to unique alarm activations used by ISO/EEMUA metrics and window-based health.

---

## Minimal walkthrough example (what happens when you compute)

1. [run_actual_calc(ALARM_DATA_DIR, ...)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94) is called (directly or via endpoint logic).  
2. Reads [PVCI-merged/All_Merged.csv](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR/PVCI-merged/All_Merged.csv:0:0-0:0) → cleans columns and times.  
3. Computes per-source ISO metrics and cycles; builds `kpis` (ack/ok/completion).  
4. Computes `activations_df`, finds unhealthy periods and flood windows; produces detailed `unhealthy` and `floods`.  
5. Computes activation-window health; merges into `kpis`.  
6. Computes frequency metrics; merges into `kpis`.  
7. Builds `bad_actors` from `floods`.  
8. Writes [PVCI-actual-calc/actual-calc.json](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json:0:0-0:0) with all sections.  
9. API endpoints serve from cache by default (fast), or recompute and refresh when requested.

---

# Recommended Actions

- **Validate parameters**: Confirm current central thresholds in [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0) match your intended policy for overload/unacceptable windows and unhealthy/flood detection.
- **Trace any number**: If you need a specific field traced, tell me which (`overall.*`, `unhealthy.*`, `floods.*`, `bad_actors.*`, `frequency.*`, `per_source.*`), and I’ll point to the exact function and intermediate variable.
- **Re-run/update**: If you want to recompute the JSON with different thresholds, I can guide you to the right endpoint or run path.

---

## Task Status

- **Completed**:
  - Located data source [PVCI-merged/All_Merged.csv](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR/PVCI-merged/All_Merged.csv:0:0-0:0) and verified format.
  - Analyzed [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0) end-to-end (load → compute → write JSON).
  - Opened and mapped [actual-calc.json](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json:0:0-0:0) fields to calculation sources.
  - Traced where [run_actual_calc()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94) is invoked and how cache is read/written in [main.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/main.py:0:0-0:0).

If you want, I can generate a diagram of the flow or extract a compact data dictionary per JSON section.

*Viewed [actual-calc.json](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json) *

### User Input

in this, can you tell about is there any function which is sorted the csv file data for evnet time and source columns
or it is already sorted and we make calculations on it
@[d:\Qbit-dynamics\alarm_system\alarm_backend\PVCI-new-calc\Final_Calculations.ipynb] 
for thise calcualtions you have to see in this notebook pynb file 
which may be written like this
 # ---------- Step 1: Clean ----------
    df = df.copy()
    df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
    df["Action"] = df["Action"].fillna("").str.upper().str.strip()
    df = df.sort_values(["Source", "Event Time"]).reset_index(drop=True)


    # ---------- Step 2: Identify Unique Alarms ----------
    activations = []
    for src, group in df.groupby("Source"):
        state = "IDLE"
        for _, row in group.iterrows():
            action = row["Action"]
            t = row["Event Time"]


            # New alarm trigger
            if action == "" and state in ["IDLE", "ACKED"]:
                activations.append({"Source": src, "StartTime": t})
                state = "ACTIVE"


            # Acknowledged
            elif action == "ACK" and state == "ACTIVE":
                state = "ACKED"


            # Cleared (OK)
            elif action == "OK":
                # Handles Blank→OK and Blank→OK→ACK
                if state in ["ACTIVE", "ACKED"]:
                    state = "IDLE"
                else:
                    state = "IDLE"

*Updated todo list*

### Planner Response

I'll open the notebook `Final_Calculations.ipynb` to confirm whether it explicitly sorts the data by `["Source", "Event Time"]` before calculations and point to the exact cells.

*Read Jupyter notebook*

*Updated todo list*

### Planner Response

# Findings

- **Short answer**: The calculations do not assume the CSV is pre‑sorted. The notebook explicitly sorts the data by `["Source", "Event Time"]` before each calculation. The production code mirrors this.

## Where the notebook sorts

- **calculate_alarm_frequency_metrics()** in `Final_Calculations.ipynb`
  - Cell `id=83655a1b-0588-4cfc-81a2-7e43ed0558cb`
  - Sorting line:
    - `df = df.sort_values(["Source", "Event Time"]).reset_index(drop=True)`
  - This ensures unique activations and daily aggregations are computed in correct chronological order per source.

- **analyze_basic_alarm_states()** (Standing/Stale/Instrument Failure)
  - Cell `id=8b19eda4-7be3-4fd1-9ce2-db7675d3b54f`
  - Sorting line:
    - `df = df.sort_values(["Source", "Event Time"])`
  - Required so the state machine (Blank → ACK → OK) sees events in time order per source.

- **detect_repeating_and_chattering()**
  - Cell `id=47b6d9b5-b85e-4adf-971b-fbe1dcfe7d10`
  - Sorting line:
    - `df = df.sort_values(["Source", "Event Time"])`
  - Necessary to build per-source alarm start times and apply the sliding 10‑min window.

- **detect_unhealthy_and_flood()**
  - Cell `id=2d7a6e36-7776-4ff4-99d7-ae9077e80f8d`
  - Sorting lines:
    - On raw events: `df = df.sort_values(["Source", "Event Time"])`
    - On derived activations: `activations_df = activations_df.sort_values("StartTime")`
    - On per‑source windows: `g = g.sort_values("Window_Start")` (when merging overlapping unhealthy periods)
  - This guarantees proper sliding window counts, merging, and flood detection.

## Production parity in backend code

- In [alarm_backend/PVCI-actual-calc/actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0):
  - [calculate_alarm_kpis(df)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:232:0-284:32):
    - `df['Event Time'] = pd.to_datetime(...)` and `df = df.sort_values(["Source", "Event Time"])`
  - [analyze_basic_alarm_states(df)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:127:0-198:32):
    - `df = df.sort_values(["Source", "Event Time"])`
  - [detect_repeating_and_chattering(df)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:61:0-123:29):
    - `df = df.sort_values(["Source", "Event Time"])`
  - [detect_unhealthy_and_flood(df)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:393:0-505:62):
    - `df = df.sort_values(["Source", "Event Time"])`
    - `activations_df = activations_df.sort_values("StartTime")`
    - `g = g.sort_values("Window_Start")` during merging
  - The loader [load_pvci_merged_csv()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:753:0-800:13) cleans and parses columns but does not sort; sorting is performed inside the calculation functions.

## Conclusion

- **It is explicitly sorted in code** before each major calculation. The pipeline does not rely on the CSV being pre‑sorted. Sorting by `["Source", "Event Time"]` (and later by `"StartTime"` or `"Window_Start"`) is essential for the per‑source state machine and sliding window logic to be correct.

# Recommended Actions

- **No change needed** if the question is only about behavior: the notebook and backend already sort consistently.
- **If you want to assert this invariant early**, you could add an explicit sort immediately after reading the CSV in your data‑loading step for clarity, but function-level sorting already enforces correct order.

## Task Status

- **Completed**: Verified in `PVCI-new-calc/Final_Calculations.ipynb` that sorting by `["Source","Event Time"]` happens in all relevant cells, and confirmed equivalent sorting exists in [PVCI-actual-calc/actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0).

*Viewed [actual_calc_service.py](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py) *

### User Input

ok now i have a question for this
if i want that this same calculation for multiple csv dynamically
means i give path of another file with this file can this generate json with all calcualtions for that file also or not
also if i want some other preprocessing calculations for this like sorting at one time so it wont again and again sort for each calculation, 
and also get the columns from the fuile accurately if it has some metadata on above files just like we ad implemented that thing for old calculations of mode "persource" and "plant-wide"

so for this first analyze this and tell me if yes then how and what changes will be required
for that we need a proper plan

the columns are same but one column is extra there, which is at last and named as "Source Sheet Name"

we do need to do any implementation now, we just need a plan proper for this how the things will work dynamically 

*Updated todo list*

### Planner Response

# Findings

- **Calculations can be made dynamic across multiple CSVs.** The current pipeline is hard‑wired to [ALARM_DATA_DIR/PVCI-merged/All_Merged.csv](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR/PVCI-merged/All_Merged.csv:0:0-0:0) via [load_pvci_merged_csv()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:753:0-800:13) inside [run_actual_calc()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94). By abstracting the data source and centralizing preprocessing, we can:
  - Accept any CSV path(s) at runtime.
  - Preprocess and sort once.
  - Reuse the same cleaned frame and unique activations across all calculations.
  - Include/propagate extra columns like `Source Sheet Name`.

- **Current sort behavior:** In both the notebook `PVCI-new-calc/Final_Calculations.ipynb` and backend [PVCI-actual-calc/actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0), each function independently sorts by `["Source", "Event Time"]` before computing. We can refactor to sort once centrally.

---

# Proposed Plan

## 1) Data source abstraction

- **Goal:** Allow running the same calculations for multiple datasets dynamically.
- **Actions:**
  - **Add a data-source param** to [run_actual_calc()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94) and downstream endpoints:
    - `csv_path: Optional[str] = None` (file path) or `paths: Optional[list[str]]` (multiple files) or `dir_path` (ingest all CSVs in a directory).
  - **Normalize loader**:
    - New function `load_events(csv_or_dir)` that:
      - Accepts a single file, list of files, or directory (glob `*.csv`).
      - Concatenates multiple CSVs with consistent columns.
      - Detects/handles header rows and metadata lines before header.
      - Returns a single DataFrame + source metadata (file count, sizes, min/max time).

## 2) Centralized preprocessing (sort once)

- **Goal:** Parse and sort once, reuse everywhere.
- **Actions:**
  - New `preprocess_events(df)`:
    - Parse `Event Time` to datetime.
    - Normalize text fields: `Action`, `Condition`, strip/upper.
    - Drop invalid `Event Time`/`Source` rows.
    - Sort once by `["Source", "Event Time"]`.
    - Return `df_sorted` and a `columns_detected` list; also return `extra_columns` (e.g., `["Source Sheet Name"]`) to surface in JSON.
  - Optionally coerce `Source` to `category` for memory and speed.

## 3) Build once, reuse: unique activations

- **Goal:** Avoid repeated derivations.
- **Actions:**
  - New `build_activations(df_sorted)` that applies the verified state machine to produce `activations_df` once.
  - Pass `activations_df` into:
    - [calculate_alarm_frequency_metrics()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:289:0-388:5)
    - [detect_unhealthy_and_flood()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:393:0-505:62)
    - [compute_activation_window_metrics()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:567:0-667:5)
  - Provide a `CalculationContext` (simple dataclass/dict) with:
    - `df_sorted`, `activations_df`, `columns_detected`, `extra_columns`, `time_range`, `data_source_meta`.

## 4) Refactor calculation functions to accept preprocessed inputs

- **Goal:** Make functions assume pre-sorted/cleaned data to skip internal sorts.
- **Actions:**
  - Update signatures to accept precomputed pieces and a flag:
    - Example: [calculate_alarm_kpis(df_sorted, assume_preprocessed=True)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:232:0-284:32)
    - Example: [detect_unhealthy_and_flood(df_sorted, activations_df=None, assume_preprocessed=True)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:393:0-505:62)
  - If `assume_preprocessed=True`, skip internal cleaning/sorting and skip recomputing activations when provided.

## 5) Schema normalization and extra columns

- **Goal:** Handle optional `Source Sheet Name` and any extra columns cleanly.
- **Actions:**
  - Loader detects headers; if the last column `Source Sheet Name` exists, keep it in `df`.
  - Do not depend on it for calculations, but:
    - Keep it available for provenance.
    - Optionally propagate to JSON where useful, e.g., into `per_source` or into window details as `sheet_name` when a single source consistently maps to a single sheet.
  - Store `columns_detected` and `extra_columns` in JSON.

## 6) Cache and JSON structure updates

- **Goal:** Support multiple datasets without cache collision; expose provenance.
- **Actions:**
  - Add a dataset key into params and cache path:
    - Compute a stable `data_source_id` (e.g., hash of file path(s) + last modified timestamps + sizes).
    - [get_cache_path(base_dir, data_source_id)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1035:0-1039:54) → `PVCI-actual-calc/{data_source_id}/actual-calc.json`
  - Extend `params` in JSON with:
    - `data_source`: `{type: "csv" | "list" | "dir", paths: [...], file_count, size_bytes_total}`
  - Top-level additions:
    - `columns_detected: [...]`
    - `extra_columns: [...]`
    - `sample_range: {start, end}` already exists; scope it to the dataset processed.
  - Bump `_version` to reflect schema change (e.g., `"1.2"`), maintain backward compatibility.

## 7) API changes

- **Goal:** Call calculations per dataset on demand.
- **Actions:**
  - Add query params to existing endpoints or create new ones:
    - `csv_path` (single file), `csv_paths` (comma-separated), `dir_path`, or `dataset_id`.
    - Example: `/pvcI-actual-calc/compute?csv_path=/abs/path/to/data.csv`
  - On request:
    - Build/resolve `data_source_id`.
    - Try [read_cache(base_dir, params+data_source_id)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1042:0-1090:19); if miss, compute and [write_cache](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1093:0-1210:20) to dataset‑specific location.
    - Return that dataset’s JSON.

## 8) Performance considerations

- **Sort once:** Sorting ~900k rows is O(n log n), done once per dataset.
- **Reuse activations:** Avoids re-iterating per function.
- **Optional: persisted preprocess:** For very large datasets, optionally write a feather/parquet of `df_sorted` and `activations_df` named with the `data_source_id` to accelerate future runs (configurable).
- **Memory:** Use `category` dtype for `Source`, maybe `Condition`, to reduce footprint.

## 9) Validation and safety

- **Path validation:** Only allow paths under an allowlist root (e.g., [ALARM_DATA_DIR/](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR:0:0-0:0)) unless an admin mode is set. Prevent arbitrary file reads.
- **Column validation:** Ensure required columns exist; if not, return explicit error including `columns_detected`.
- **Header detection:** If metadata rows precede header, auto-detect header row by scanning first N lines for canonical column names (`Event Time`, `Source`, `Action`), and use `skiprows` accordingly.

## 10) Backward compatibility

- **No breaking changes:**
  - Keep existing [run_actual_calc(alarm_data_dir, ...)](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94) defaulting to current merged file behavior when `csv_path` is omitted.
  - Existing endpoints continue to work without specifying dataset.
- **Migration path:**
  - Add dataset‑aware variants or optional params.
  - Keep reading from the old default cache path when no `data_source_id` provided.

---

# Example flow (new)

```mermaid
flowchart TD
  A[Request with csv_path(s)/dir_path] --> B[load_events()]
  B --> C[preprocess_events(): clean, normalize, sort once]
  C --> D[build_activations()]
  C --> E[calculate_alarm_kpis()]
  D --> F[calculate_alarm_frequency_metrics()]
  D --> G[compute_activation_window_metrics()]
  C & D --> H[detect_unhealthy_and_flood()]
  H --> I[identify_bad_actors()]
  E & F & G & H & I --> J[write_cache(dataset-specific, include columns_detected, data_source)]
  J --> K[Serve JSON (dataset-specific)]
```

---

# What needs to change (summary)

- **Loader**: Generalize [load_pvci_merged_csv()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:753:0-800:13) → `load_events(csv_or_dir)` with header detection and schema normalization. Support extra `Source Sheet Name`.
- **Preprocess**: New `preprocess_events()` to parse/clean/sort once; optional `CalculationContext`.
- **Activations**: New `build_activations()` to centralize unique activation extraction.
- **Calculations**: Update functions to accept `assume_preprocessed=True` and optional `activations_df` to skip repeated sorting/work.
- **[run_actual_calc](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94)**: Add `csv_path | csv_paths | dir_path` param; compute a `data_source_id`; pass preprocessed frames; write dataset‑specific cache.
- **Cache/JSON**: Dataset‑aware path and params, include `data_source`, `columns_detected`, `extra_columns`, version bump.
- **Endpoints**: Add optional `csv_path`/`dir_path`/`dataset_id` query params; default to old behavior if none provided.
- **Validation/Tests**: Add tests for multiple datasets, header detection, presence of `Source Sheet Name`.

---

# Answers to your specific questions

- **“Can it generate JSON with all calculations for another CSV if I give a path?”**  
  - Yes, with the above data-source abstraction and endpoint parameterization. We’ll compute and cache per dataset.

- **“Can we sort once so it’s not repeated for each calculation?”**  
  - Yes. Centralize preprocessing (sort once) and pass the pre-sorted frame and shared `activations_df` to downstream functions.

- **“Columns are same plus an extra ‘Source Sheet Name’; can we read columns accurately even with metadata lines?”**  
  - Yes. Implement header detection and schema normalization; keep `Source Sheet Name` as an optional pass‑through column. Expose detected columns and extras in JSON.

---

## Task Status

- **Proposed a concrete, step‑by‑step plan** to make the actual‑calc pipeline dynamic across multiple CSVs, centralize preprocessing and sorting, reuse activations, and handle extra columns plus dataset‑aware caching and endpoints. No code changes performed yet.

*Viewed [actual_calc_service.py](file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py) *

### User Input

ok perfect now according to this plan we will now implement this step by step
also one thing more you have to take in mind that we will work on one file at a ime and for each file there will be different json file
example as our calcualtion json is done for  @[d:\Qbit-dynamics\alarm_system\alarm_backend\ALARM_DATA_DIR\PVCI-merged\All_Merged.csv] and its json name is @[d:\Qbit-dynamics\alarm_system\alarm_backend\PVCI-actual-calc\actual-calc.json] 
so for other file, its name will be different by its name like name "pvcII" file is used now then name will be "pvcii-actual-calc"  etc 
so for this we will simply cheange path manually from @[d:\Qbit-dynamics\alarm_system\alarm_backend\PVCI-actual-calc\actual_calc_service.py]  and run the function
so now analyze this again and then we will implement this

the metadata can be there in files so it should check for metadata if the metadat exists it should search for header row or clean the metadata, for this also tell which approach is best
he header will then most probably in 9th row

### Planner Response

# Findings

- **One-file-at-a-time is feasible.** We can run the same pipeline for any CSV and write a separate JSON per file (e.g., `pvcii-actual-calc.json`), without changing endpoints immediately.
- **Sorting once is recommended.** Current functions each sort internally. We can centralize preprocessing (parse/clean/sort one time) and pass the cleaned frame to all calculations to avoid repeated sorting.
- **Metadata/header handling is needed.** Files may have metadata rows; header is “most probably” at row 9. Best approach: auto-detect the actual header row with a fallback to a user-provided hint (e.g., 9th row), then normalize the schema.

---

# Proposed Implementation Plan (Step-by-step, minimal-risk)

- **[step 1] Add dataset-aware naming (no endpoint changes yet)**
  - **Where:** [PVCI-actual-calc/actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0)
  - **What:** Add a helper to derive a dataset slug and cache name from the CSV path:
    - `dataset_slug = slugify(os.path.splitext(os.path.basename(csv_path))[0])  # e.g., 'pvcii'`
    - Cache filename: `f"{dataset_slug}-actual-calc.json"` in `PVCI-actual-calc/`.
  - **Why:** Produces `pvcii-actual-calc.json` when you manually point to a “PVCII” CSV.

- **[step 2] Generalize the loader to accept any CSV path**
  - **Where:** Replace [load_pvci_merged_csv()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:753:0-800:13) with a more general `load_events_csv(csv_path, header_strategy)`.
  - **What:** If you prefer manual path edits, expose a single variable near the top, e.g., `CSV_PATH = r"...\PVCII\SomeFile.csv"`, and change only that.
  - **Result:** All downstream code uses the new `df` from the chosen file.

- **[step 3] Header/metadata detection (robust + controllable)**
  - **Where:** Inside `load_events_csv()`.
  - **Best approach (recommended):**
    - Try auto-detection over the first 20 lines:
      - Scan lines; choose the first row that contains required columns: `Event Time`, `Source`, `Action` (case/whitespace-insensitive).
      - Validate by checking the next 1–2 lines parse as dates in `Event Time`.
    - If auto-detect fails, accept a hint (e.g., `header_row_hint=8`, zero-based).
    - Call `pd.read_csv(csv_path, header=detected_index)`; no global `skiprows` if we provide the header index directly.
  - **Fallback (simple) if you want a quick win now:**
    - Use `header=8` (9th row) as default, and expose a parameter `header_row_hint` in the file where you manually set the CSV path.
  - **Why recommended approach:** Survives minor file variations; still lets you override to 9th row when you know it.

- **[step 4] Centralize preprocessing and sort once**
  - **Where:** New helper `preprocess_events(df)` in [actual_calc_service.py](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:0:0-0:0).
  - **What:**
    - Parse `Event Time` (errors="coerce"), normalize `Action`/`Condition` (`fillna("")`, `.str.upper().str.strip()`), drop invalid rows (`Event Time`, `Source`), and `df = df.sort_values(["Source", "Event Time"]).reset_index(drop=True)`.
    - Return `df_sorted`, plus `columns_detected` and `extra_columns` (e.g., `Source Sheet Name`).
  - **Downstream usage:**
    - Pass `df_sorted` to all calculations.
    - Optionally add `assume_preprocessed=True` to calculation functions to skip repeated sorts.
  - **Note:** As an incremental step, you can first keep functions as-is (they’ll re-sort but harmless), then later add the `assume_preprocessed` flag to remove duplicate sorting.

- **[step 5] Optional: compute unique activations once and reuse**
  - **Where:** New `build_activations(df_sorted)`.
  - **What:** Extract unique activations (Blank when IDLE/ACKED) once and pass `activations_df` into:
    - [calculate_alarm_frequency_metrics()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:289:0-388:5)
    - [detect_unhealthy_and_flood()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:393:0-505:62)
    - [compute_activation_window_metrics()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:567:0-667:5)
  - **Why:** Removes redundant re-scans and guarantees consistent logic.

- **[step 6] Write a dataset-specific JSON next to existing one**
  - **Where:** [write_cache()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1093:0-1210:20) and [get_cache_path()](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:1035:0-1039:54).
  - **What:** Accept `dataset_slug` and use `PVCI-actual-calc/{dataset_slug}-actual-calc.json`. Keep the existing [actual-calc.json](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json:0:0-0:0) untouched for the default dataset (backward compatible).
  - **JSON additions:**
    - `params.data_source = {"csv_path": "...", "dataset_slug": "..."}`
    - `columns_detected`, `extra_columns`
  - **Result:** For [All_Merged.csv](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/ALARM_DATA_DIR/PVCI-merged/All_Merged.csv:0:0-0:0) you still have [actual-calc.json](cci:7://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual-calc.json:0:0-0:0); for a PVCII file you get `pvcii-actual-calc.json`.

- **[step 7] No endpoint refactors (for now)**
  - You said you’ll “simply change path manually and run the function.” That’s supported by the above.
  - Later, if desired, add query params (`csv_path` or `dataset`) to compute on demand and serve the dataset-specific JSON.

---

## Best approach for metadata/header handling

- **Recommended hybrid: Auto-detect with hint fallback.**
  - Try auto-detect header row by scanning first N lines for the canonical column names (case/space-insensitive): must include at least `Event Time` and `Source`; ideally also `Action`.
  - Validate by checking that 1–2 following rows have parseable datetime in `Event Time`.
  - If detection fails, use `header_row_hint` (e.g., 8 for 9th row).
- **Why not fixed-row only:** Fixed 9th-row works until a file comes with 8 or 10 metadata rows, breaking the parser silently or shifting columns.
- **Why not only auto:** You already know some files have the 9th-row header; hint keeps things deterministic under deadline pressure.

---

## How your manual flow will look

- **Step A:** Edit a single constant near the top (or pass in when calling):  
  - `CSV_PATH = r"d:\Qbit-dynamics\alarm_system\alarm_backend\ALARM_DATA_DIR\PVCII-merged\All_Merged.csv"`
  - Optionally: `HEADER_ROW_HINT = 8`
- **Step B:** Run [run_actual_calc(csv_path=CSV_PATH, header_row_hint=HEADER_ROW_HINT, dataset_slug="pvcii")](cci:1://file:///d:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-actual-calc/actual_calc_service.py:805:0-995:94)
- **Step C:** Output written to `alarm_backend/PVCI-actual-calc/pvcii-actual-calc.json`  
  - Includes `params.data_source.csv_path`, `columns_detected`, and `extra_columns` (e.g., `Source Sheet Name` if present).

---

## Notes on the extra column “Source Sheet Name”

- Keep it in the DataFrame; not used by the core math.
- Expose in JSON metadata as part of `columns_detected` and `extra_columns`.
- Optional: if it’s stable per `Source`, we can include a per-source `sheet_name` in `per_source` records later, but not required now.

---

# Recommended Actions

- **[start] Implement Step 1–3 first**:
  - **[dataset naming]** helper for slug + cache filename.
  - **[general loader]** that reads arbitrary CSV path.
  - **[header detection]** with hint fallback.
- **[then]** Add `preprocess_events(df)` and keep existing functions unchanged initially (safe).
- **[later]** Introduce `assume_preprocessed=True` and shared `build_activations()` to remove duplicate sorts and scans.

---

## Task Status

- **Planning completed** for one-file-at-a-time dynamic runs, dataset-specific JSON names, and robust metadata/header handling (9th-row hint supported).  
- Ready to implement Steps 1–3 next, keeping the code changes minimal and backward compatible.