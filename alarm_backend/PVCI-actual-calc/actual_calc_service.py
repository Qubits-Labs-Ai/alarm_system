"""
PVCI Actual Calculation Service

Computes alarm management KPIs from merged PVCI alarm data.
Logic ported from Data_Calculations.ipynb with exact preservation of calculation methods.

=================================================================================================
DYNAMIC CSV PROCESSING - OVERVIEW
=================================================================================================

This module now supports DYNAMIC processing of multiple CSV files by providing the CSV path.
Key improvements:

1. **Dynamic CSV Loading**
   - Supports any CSV file via csv_relative_path and csv_file_name parameters
   - Automatic metadata row detection and skipping
   - Column validation to ensure required fields exist
   - Handles optional 'Source Sheet Name' column

2. **Performance Optimization**
   - Data is PRE-SORTED ONCE after loading (eliminates 5+ redundant sorts)
   - All calculation functions now assume pre-sorted input
   - Significant performance improvement for large datasets

3. **Smart Cache Management**
   - Unique cache files per CSV (prevents conflicts)
   - CSV metadata validation (size, modified time)
   - Automatic cache invalidation when CSV changes
   - Multiple plants/files can have independent caches

4. **Backward Compatibility & Cache File Naming**
   - Default behavior: uses "VCMA/VCMA.csv" (configurable via environment variables)
   - Each CSV file gets its own unique cache file: {filename}-actual-calc.json
   - Existing API endpoints work without modification
   - No breaking changes to function signatures (new params are optional)

=================================================================================================
USAGE EXAMPLES
=================================================================================================

# Example 1: Use default CSV (VCMA)
# -------------------------------------------------
from PVCI_actual_calc import actual_calc_service

results = actual_calc_service.run_actual_calc_with_cache(
    base_dir="/path/to/alarm_backend",
    alarm_data_dir="/path/to/ALARM_DATA_DIR"
)
# Uses: ALARM_DATA_DIR/VCMA/VCMA.csv
# Cache: PVCI-actual-calc/VCMA-actual-calc.json


# Example 2: Process All_Merged CSV
# -------------------------------------------
results = actual_calc_service.run_actual_calc_with_cache(
    base_dir="/path/to/alarm_backend",
    alarm_data_dir="/path/to/ALARM_DATA_DIR",
    csv_relative_path="PVCI-merged",
    csv_file_name="All_Merged.csv"
)
# Uses: ALARM_DATA_DIR/PVCI-merged/All_Merged.csv
# Cache: PVCI-actual-calc/All_Merged-actual-calc.json


# Example 3: Process a different plant's CSV
# ------------------------------------------
results = actual_calc_service.run_actual_calc_with_cache(
    base_dir="/path/to/alarm_backend",
    alarm_data_dir="/path/to/ALARM_DATA_DIR",
    csv_relative_path="plant2/alarm-data",
    csv_file_name="Plant2_Merged.csv",
    unhealthy_threshold=15,  # Custom threshold
    window_minutes=10,
    stale_min=90
)
# Uses: ALARM_DATA_DIR/plant2/alarm-data/Plant2_Merged.csv
# Cache: PVCI-actual-calc/Plant2_Merged-actual-calc.json


# Example 4: Force fresh calculation (skip cache)
# ------------------------------------------------
results = actual_calc_service.run_actual_calc_with_cache(
    base_dir="/path/to/alarm_backend",
    alarm_data_dir="/path/to/ALARM_DATA_DIR",
    csv_relative_path="test/data",
    csv_file_name="test.csv",
    force_refresh=True  # Ignore existing cache
)


# Example 5: Direct calculation without cache
# --------------------------------------------
summary, kpis, cycles, unhealthy, floods, bad_actors, frequency = \
    actual_calc_service.run_actual_calc(
        alarm_data_dir="/path/to/ALARM_DATA_DIR",
        csv_relative_path="plant4/raw",
        csv_file_name="data.csv"
    )
# Returns raw tuple (no cache involved)


# Example 6: In FastAPI endpoint
# -------------------------------
from fastapi import APIRouter, Query
from PVCI_actual_calc import actual_calc_service

router = APIRouter()

@router.get("/calculate")
async def calculate_kpis(
    csv_path: str = Query(None, description="Optional: relative CSV path"),
    csv_file: str = Query(None, description="Optional: CSV filename"),
    use_cache: bool = Query(True, description="Use cached results if available")
):
    results = actual_calc_service.run_actual_calc_with_cache(
        base_dir=BASE_DIR,
        alarm_data_dir=ALARM_DATA_DIR,
        csv_relative_path=csv_path,
        csv_file_name=csv_file,
        use_cache=use_cache
    )
    return results

=================================================================================================
CSV FILE REQUIREMENTS
=================================================================================================

Required Columns:
- Event Time (datetime): Timestamp of the alarm event
- Source (string): Alarm source identifier
- Action (string): Alarm action (blank/ACK/OK)

Optional Columns:
- Condition (string): Alarm condition text
- Priority (string): Alarm priority level
- Location Tag (string): Physical location
- Description (string): Alarm description
- Value (numeric): Alarm value
- Units (string): Value units
- Source Sheet Name (string): Origin sheet name

Metadata Handling:
- If CSV has metadata rows at the top, they will be automatically detected and skipped
- Header row must contain "Event Time" and "Source" keywords
- Column names are case-sensitive

Data Sorting:
- CSV does NOT need to be pre-sorted
- Data is automatically sorted by ['Source', 'Event Time'] after loading
- This sorting happens ONCE, eliminating redundant sorts in calculation functions

=================================================================================================
CACHE FILE NAMING
=================================================================================================

Cache files are stored in: BASE_DIR/PVCI-actual-calc/

Naming pattern: {csv_filename_without_extension}-actual-calc.json

Examples:
- All_Merged.csv   →     PVCI-actual-calc/All_Merged-actual-calc.json
- VCMA.csv         →     PVCI-actual-calc/VCMA-actual-calc.json
- Plant2_Data.csv  →     PVCI-actual-calc/Plant2_Data-actual-calc.json

Each CSV file gets its own unique cache file. When you regenerate calculations for a specific
CSV, only its corresponding cache file is updated.

Cache includes:
- Calculation results (KPIs, per-source metrics, cycles, etc.)
- Calculation parameters (thresholds, operators)
- CSV metadata (path, size, modified time)
- Generation timestamp

Cache is invalidated when:
- CSV file size changes
- CSV file modified time changes
- Calculation parameters change

=================================================================================================
"""

import pandas as pd
import os
import logging
import sys
from datetime import datetime, timedelta
from typing import Tuple, Dict, Any, Optional
from collections import deque
import argparse

# Keywords for Instrument Failure detection
INSTRUMENT_KEYWORDS = ["FAIL", "BAD", "INSTRUMENT"]
import json

# Add parent directory to path for plant_registry import
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

try:
    from plant_registry import get_plant_info, get_plant_csv_info, validate_plant_id, get_default_plant_id
except ImportError:
    # Fallback if plant_registry not available (backward compatibility)
    def get_plant_info(plant_id: str) -> Optional[Dict]: return None
    def get_plant_csv_info(plant_id: str) -> Optional[Dict]: return None
    def validate_plant_id(plant_id: str) -> bool: return True
    def get_default_plant_id() -> str: return "PVCI"

logger = logging.getLogger(__name__)

# Centralized defaults for CSV location
DEFAULT_CSV_RELATIVE_PATH = os.getenv("DEFAULT_CSV_RELATIVE_PATH", "VCMA")
DEFAULT_CSV_FILE_NAME = os.getenv("DEFAULT_CSV_FILE_NAME", "VCMA.csv")

# Default thresholds (can be overridden via parameters)
STALE_THRESHOLD_MIN = 1440  # minutes until an active alarm is considered standing/stale classification point (24h)
CHATTER_THRESHOLD_MIN = 0.5  # window size in minutes for chattering detection (~30 seconds)
CHATTER_MIN_COUNT = 3        # minimum alarms within window to declare chattering
INSTRUMENT_KEYWORDS = ["FAIL", "BAD"]

# New (unhealthy/flood) defaults — aligned with notebook pasted by user
UNHEALTHY_THRESHOLD = 10
WINDOW_MINUTES = 10
FLOOD_SOURCE_THRESHOLD = 2

# Centralized activation-window overload thresholds (used everywhere)
# Change these once and they apply across all calculations and outputs
ACT_WINDOW_OVERLOAD_OP = ">"      # comparison operator for overload window (e.g., ">" or ">=")
ACT_WINDOW_OVERLOAD_THRESHOLD = 2   # unique activations per 10-min window
ACT_WINDOW_UNACCEPTABLE_OP = ">="  # comparison operator for unacceptable window
ACT_WINDOW_UNACCEPTABLE_THRESHOLD = 5


# ---------- CORE KPI LOGIC (EXACT FROM NOTEBOOK) ----------

def count_unique_alarms(group):
    """Count unique alarms using state machine logic.
    
    State transitions:
    - Blank -> ACTIVE (new alarm)
    - ACTIVE + ACK -> ACKED
    - ACKED + Blank -> ACTIVE (new alarm)
    - Any + OK -> IDLE
    """
    alarm_count = 0
    state = "IDLE"
    for _, row in group.iterrows():
        action = str(row["Action"]).upper().strip()
        if action == "":
            if state == "IDLE" or state == "ACKED":
                alarm_count += 1
                state = "ACTIVE"
        elif action == "ACK" and state == "ACTIVE":
            state = "ACKED"
        elif action == "OK":
            state = "IDLE"
    return alarm_count


# ---------- Updated Calculation For Chattering (episodes) & Repeating ----------
def detect_repeating_and_chattering(df: pd.DataFrame) -> pd.DataFrame:
    """Detect Repeating Alarms, Chattering episodes, and Instrument Failures per source.
    - Unique alarm starts follow the same verified logic (blank triggers a new alarm when IDLE/ACKED)
    - Repeating_Alarms: max(0, unique_alarms - 1)
    - Chattering_Alarms: count of times a sliding window of CHATTER_THRESHOLD_MIN minutes reaches CHATTER_MIN_COUNT alarms; do not double-count while within the same episode
    - Instrument_Failures: count of unique alarm starts whose Condition contains FAIL/BAD (chattering-specific perspective)
    
    NOTE: Assumes input DataFrame is already sorted by ['Source', 'Event Time']
    """
    df = df.copy()
    df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
    df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
    if "Condition" in df.columns:
        df["Condition"] = df["Condition"].fillna("").astype(str).str.upper().str.strip()
    # Sorting removed - data is pre-sorted in load_pvci_merged_csv()

    rows = []
    for src, group in df.groupby("Source"):
        state = "IDLE"
        alarm_times: list[pd.Timestamp] = []
        cond_texts: list[str] = []

        for _, row in group.iterrows():
            action = row["Action"]
            t = row["Event Time"]
            cond = row.get("Condition", "") if "Condition" in group.columns else ""

            # Skip non-alarm transitions (align with notebook)
            if cond in ["CHANGE", "ONREQ.PV", "NORMAL", "ONREQ"]:
                continue

            if action == "":
                if state in ("IDLE", "ACKED"):
                    alarm_times.append(t)
                    cond_texts.append(cond)
                    state = "ACTIVE"
            elif action == "ACK" and state == "ACTIVE":
                state = "ACKED"
            elif action == "OK":
                state = "IDLE"

        unique_alarms = len(alarm_times)
        repeating_count = max(0, unique_alarms - 1)

        instrument_failures = sum(1 for c in cond_texts if any(k in (c or "") for k in INSTRUMENT_KEYWORDS))

        dq: deque = deque()
        chattering_count = 0
        in_chatter = False
        for t in alarm_times:
            # Evict outside window
            while dq and (t - dq[0]).total_seconds() / 60 > CHATTER_THRESHOLD_MIN:
                dq.popleft()
                if len(dq) < CHATTER_MIN_COUNT:
                    in_chatter = False  # reset when below threshold
            dq.append(t)
            if not in_chatter and len(dq) >= CHATTER_MIN_COUNT:
                chattering_count += 1
                in_chatter = True

        rows.append({
            "Source": src,
            "Repeating_Alarms": repeating_count,
            "Chattering_Alarms": chattering_count,
            "Instrument_Failures": instrument_failures,
            "Unique_Alarms": unique_alarms,
        })

    return pd.DataFrame(rows)


# ---------- Updated Calculation For Standing Alarms ----------
def analyze_basic_alarm_states(df: pd.DataFrame) -> pd.DataFrame:
    """
    ISO-style alarm state analysis per Source.
    Calculates per source:
      - Unique_Alarms
      - Standing_Alarms (counted once per ACTIVE episode crossing threshold)
      - Stale_Alarms (standing subtype when condition is not instrument failure)
      - Instrument_Failure (standing subtype when condition contains FAIL/BAD)
    
    NOTE: Assumes input DataFrame is already sorted by ['Source', 'Event Time']
    """
    df = df.copy()
    df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
    df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
    if "Condition" in df.columns:
        df["Condition"] = df["Condition"].fillna("").astype(str).str.upper().str.strip()
    # Sorting removed - data is pre-sorted in load_pvci_merged_csv() 

    results = []
    for src, group in df.groupby("Source"):
        state = "IDLE"
        unique_count = 0
        standing_count = 0
        stale_count = 0
        instrument_failure_count = 0

        active_start = None
        active_condition = ""
        standing_flag = False

        for _, row in group.iterrows():
            action = row["Action"]
            t = row["Event Time"]
            cond = row.get("Condition", "") if hasattr(row, "get") else row["Condition"] if "Condition" in group.columns else ""

            # Skip non-alarm transitions (align with notebook)
            if cond in ["CHANGE", "ONREQ.PV", "NORMAL", "ONREQ"]:
                continue

            # NEW ALARM
            if action == "" and state in ["IDLE", "ACKED"]:
                unique_count += 1
                state = "ACTIVE"
                active_start = t
                active_condition = cond
                standing_flag = False

            # ACK
            elif action == "ACK" and state == "ACTIVE":
                state = "ACKED"

            # OK
            elif action == "OK" and state in ["ACTIVE", "ACKED"]:
                state = "IDLE"
                active_start = None
                active_condition = ""
                standing_flag = False

            # STANDING CHECK
            if state == "ACTIVE" and active_start is not None and pd.notna(t):
                duration_min = (t - active_start).total_seconds() / 60.0
                if duration_min >= STALE_THRESHOLD_MIN and not standing_flag:
                    standing_count += 1
                    standing_flag = True
                    if any(k in str(active_condition) for k in ["FAIL", "BAD"]):
                        instrument_failure_count += 1
                    else:
                        stale_count += 1

        results.append({
            "Source": src,
            "Unique_Alarms": unique_count,
            "Standing_Alarms": standing_count,
            "Stale_Alarms": stale_count,
            "Instrument_Failure": instrument_failure_count,
        })

    return pd.DataFrame(results)


def get_alarm_cycles(df):
    """Extract alarm lifecycle cycles (start -> ack -> ok) per source.
    
    Returns DataFrame with columns:
    - source, start_time, ack_time, ok_time, ack_delay, ok_delay
    """
    cycles = []
    for src, g in df.groupby("Source"):
        g = g.sort_values("Event Time").reset_index(drop=True)
        cur = None
        for _, r in g.iterrows():
            a = str(r["Action"]).upper().strip()
            t = r["Event Time"]
            if a == "" and cur is None:
                cur = {"source": src, "start_time": t, "ack_time": None, "ok_time": None}
            elif a == "ACK" and cur and cur["ack_time"] is None:
                cur["ack_time"] = t
            elif a == "OK" and cur:
                cur["ok_time"] = t
                cycles.append(cur)
                cur = None
        if cur:
            cycles.append(cur)
    
    dfc = pd.DataFrame(cycles)
    if not dfc.empty:
        dfc["ack_delay"] = (dfc["ack_time"] - dfc["start_time"]).dt.total_seconds() / 60
        dfc["ok_delay"] = (dfc["ok_time"] - dfc["start_time"]).dt.total_seconds() / 60
    return dfc


def calculate_alarm_kpis(df):
    """Main KPI calculation function.
    
    NOTE: Assumes input DataFrame is already sorted by ['Source', 'Event Time']
    
    Returns:
        summary (DataFrame): Per-source metrics (Unique_Alarms, Standing_Alarms, Stale_Alarms, Instrument_Failure, [optional] Chattering_Count)
        kpis (dict): Overall plant KPIs
        cycles (DataFrame): Alarm lifecycle cycles with delays
    """
    df = df.copy()
    df["Event Time"] = pd.to_datetime(df["Event Time"])

    # Prepare and clean alarm event data
    df = df.copy()
    df['Event Time'] = pd.to_datetime(df['Event Time'], errors='coerce')
    df['Action'] = df['Action'].astype(str).str.upper().str.strip().replace({'nan': ''})
    if 'Condition' in df.columns:
        df['Condition'] = df['Condition'].astype(str).str.upper().str.strip().replace({'nan': ''})

    # Per-source metrics (Updated Standing/Instrument Failure/Stale classification)
    basic = analyze_basic_alarm_states(df)

    # New repeating/chattering and chattering-specific instrument failures
    rep_chat = detect_repeating_and_chattering(df)
    # Drop duplicate Unique_Alarms from rep_chat to avoid suffixes; keep 'basic' as source of truth
    if "Unique_Alarms" in rep_chat.columns:
        rep_chat = rep_chat.drop(columns=["Unique_Alarms"]) 
    rep_chat = rep_chat.rename(columns={
        "Chattering_Alarms": "Chattering_Count",
        "Instrument_Failures": "Instrument_Failure_Chattering",
    })

    # Alarm cycles and response times
    cycles = get_alarm_cycles(df)
    if cycles.empty:
        avg_ack = avg_ok = completion = 0
    else:
        avg_ack = cycles["ack_delay"].mean()
        avg_ok = cycles["ok_delay"].mean()
        completion = cycles["ok_time"].notnull().mean() * 100

    # Merge per-source summary
    summary = basic.merge(rep_chat, on="Source", how="left") if isinstance(rep_chat, pd.DataFrame) else basic
    summary = summary.fillna({"Chattering_Count": 0, "Repeating_Alarms": 0, "Instrument_Failure_Chattering": 0})
    
    # Overall KPIs (response times only - frequency metrics handled separately)
    kpis = dict(
        avg_ack_delay_min=avg_ack,
        avg_ok_delay_min=avg_ok,
        completion_rate_pct=completion,
    )
    return summary, kpis, cycles


# ---------- ISO/EEMUA 191 ALARM FREQUENCY METRICS ----------

def calculate_alarm_frequency_metrics(
    df: pd.DataFrame,
    iso_threshold: int = 288,
    unacceptable_threshold: int = 720,
) -> Dict[str, Any]:
    """
    ISO/EEMUA 191-compliant alarm frequency metrics based on unique alarm activations.
    
    Calculates:
      • Unique alarm activations (Blank → ACK/OK)
      • Average alarms per day / hour / 10 minutes
      • % days > 288 (overloaded per ISO 18.2)
      • % days ≥ 720 (unacceptable/critical overload)
      • Lists of those days and counts

    Parameters:
        df: DataFrame with columns ['Source', 'Action', 'Event Time']
        iso_threshold: int, default 288 alarms/day (ISO 18.2 reference)
        unacceptable_threshold: int, default 720 alarms/day (critical overload)
        
    Returns:
        Dict with keys: Summary, Alarms_Per_Day, Days_Over_288, Days_Unacceptable
    
    NOTE: Assumes input DataFrame is already sorted by ['Source', 'Event Time']
    """
    # ---------- Step 1: Clean ----------
    df = df.copy()
    df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
    df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
    if "Condition" in df.columns:
        df["Condition"] = df["Condition"].fillna("").astype(str).str.upper().str.strip()
    # Sorting removed - data is pre-sorted in load_pvci_merged_csv()

    # ---------- Step 2: Identify Unique Alarms (Activations) ----------
    activations = []
    for src, group in df.groupby("Source"):
        state = "IDLE"
        for _, row in group.iterrows():
            action = row["Action"]
            t = row["Event Time"]
            cond = row.get("Condition", "") if "Condition" in group.columns else ""

            # Skip non-alarm transitions
            if cond in ["CHANGE", "ONREQ.PV", "NORMAL", "ONREQ"]:
                continue

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
                state = "IDLE"

    activations_df = pd.DataFrame(activations)
    if activations_df.empty:
        return {
            "Summary": {"message": "No valid alarm activations found."},
            "Alarms_Per_Day": pd.DataFrame(),
            "Days_Over_288": pd.DataFrame(),
            "Days_Unacceptable": pd.DataFrame(),
        }

    # ---------- Step 3: Time-based Calculations ----------
    activations_df["Date"] = activations_df["StartTime"].dt.date
    alarms_per_day = activations_df.groupby("Date").size().reset_index(name="Alarm_Count")

    total_alarms = len(activations_df)
    total_days = (activations_df["StartTime"].max() - activations_df["StartTime"].min()).days + 1
    total_hours = (activations_df["StartTime"].max() - activations_df["StartTime"].min()).total_seconds() / 3600

    avg_per_day = total_alarms / total_days if total_days > 0 else 0
    avg_per_hour = total_alarms / total_hours if total_hours > 0 else 0
    avg_per_10min = total_alarms / (total_hours * 6) if total_hours > 0 else 0

    # ---------- Step 4: ISO KPI Analysis ----------
    days_over_iso = alarms_per_day[alarms_per_day["Alarm_Count"] > iso_threshold].copy()
    days_unacceptable = alarms_per_day[alarms_per_day["Alarm_Count"] >= unacceptable_threshold].copy()

    percent_days_over_iso = (len(days_over_iso) / len(alarms_per_day)) * 100 if len(alarms_per_day) > 0 else 0
    percent_days_unacceptable = (len(days_unacceptable) / len(alarms_per_day)) * 100 if len(alarms_per_day) > 0 else 0

    # ---------- Step 5: Return Structured Results ----------
    summary = {
        "avg_alarms_per_day": round(avg_per_day, 2),
        "avg_alarms_per_hour": round(avg_per_hour, 2),
        "avg_alarms_per_10min": round(avg_per_10min, 2),
        "days_over_288_count": len(days_over_iso),
        "days_over_288_alarms_pct": round(percent_days_over_iso, 2),
        "days_unacceptable_count": len(days_unacceptable),
        "days_unacceptable_pct": round(percent_days_unacceptable, 2),
        "total_days_analyzed": len(alarms_per_day),
        "total_unique_alarms": total_alarms,
        "start_date": activations_df["StartTime"].min(),
        "end_date": activations_df["StartTime"].max(),
    }

    return {
        "Summary": summary,
        "Alarms_Per_Day": alarms_per_day,
        "Days_Over_288": days_over_iso,
        "Days_Unacceptable": days_unacceptable,
    }


# ---------- UNHEALTHY + FLOOD DETECTION (from notebook) ----------

def detect_unhealthy_and_flood(
    df: pd.DataFrame,
    unhealthy_threshold: int = UNHEALTHY_THRESHOLD,
    window_minutes: int = WINDOW_MINUTES,
    flood_source_threshold: int = FLOOD_SOURCE_THRESHOLD,
):
    """
    Returns activations_df, unhealthy_summary_df, flood_summary_df.
    Logic mirrors the notebook pasted by the user.
    
    NOTE: Assumes input DataFrame is already sorted by ['Source', 'Event Time']
    """
    df = df.copy()
    df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
    df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
    if "Condition" in df.columns:
        df["Condition"] = df["Condition"].fillna("").astype(str).str.upper().str.strip()
    # Sorting removed - data is pre-sorted in load_pvci_merged_csv()

    # 2) Extract unique activations (blank when IDLE/ACKED)
    activations = []
    for src, g in df.groupby("Source"):
        state = "IDLE"
        for _, r in g.iterrows():
            action = r["Action"]
            t = r["Event Time"]
            cond = r.get("Condition", "") if "Condition" in g.columns else ""

            # Skip non-alarm transitions (align with notebook)
            if cond in ["CHANGE", "ONREQ.PV", "NORMAL", "ONREQ"]:
                continue

            if action == "" and state in ("IDLE", "ACKED"):
                activations.append({"Source": src, "StartTime": t})
                state = "ACTIVE"
            elif action == "ACK":
                state = "ACKED"
            elif action == "OK":
                state = "IDLE"
    activations_df = pd.DataFrame(activations).sort_values("StartTime")
    if activations_df.empty:
        return activations_df, pd.DataFrame(), pd.DataFrame()

    # 3) Unhealthy windows per source (>= threshold in window)
    window = timedelta(minutes=window_minutes)
    unhealthy_periods = []
    for src, g in activations_df.groupby("Source"):
        times = g["StartTime"].sort_values().tolist()
        start = 0
        for end, t_end in enumerate(times):
            while times[start] < t_end - window:
                start += 1
            count = end - start + 1
            if count >= unhealthy_threshold:
                unhealthy_periods.append({
                    "Source": src,
                    "Window_Start": times[start],
                    "Window_End": t_end,
                    "Count": count,
                })
    unhealthy_df = pd.DataFrame(unhealthy_periods)
    if unhealthy_df.empty:
        return activations_df, pd.DataFrame(), pd.DataFrame()

    # 4) Merge same-source unhealthy periods into continuous spans
    merged = []
    for src, g in unhealthy_df.groupby("Source"):
        g = g.sort_values("Window_Start")
        s = e = None
        for _, row in g.iterrows():
            if s is None:
                s, e = row["Window_Start"], row["Window_End"]
            elif row["Window_Start"] <= e:
                e = max(e, row["Window_End"])
            else:
                merged.append({"Source": src, "Start": s, "End": e})
                s, e = row["Window_Start"], row["Window_End"]
        if s is not None:
            merged.append({"Source": src, "Start": s, "End": e})
    merged_unhealthy_df = pd.DataFrame(merged)

    # 5) Flood detection: overlapping unhealthy from >= N sources
    flood_windows = []
    for _, row in merged_unhealthy_df.iterrows():
        s1, e1 = row["Start"], row["End"]
        overlapping = merged_unhealthy_df[(merged_unhealthy_df["Start"] <= e1) & (merged_unhealthy_df["End"] >= s1)]
        sources = set(overlapping["Source"])
        if len(sources) >= flood_source_threshold:
            flood_windows.append({
                "Flood_Start": s1,
                "Flood_End": e1,
                "Sources_Involved": list(sources),
                "Source_Count": len(sources),
            })
    flood_df = pd.DataFrame(flood_windows)
    if not flood_df.empty:
        flood_df = flood_df.drop_duplicates(subset=["Flood_Start", "Flood_End"]) 

    # 6) Per-window contributions within flood span
    flood_summary = []
    for _, row in (flood_df if not flood_df.empty else []).iterrows():
        s, e = row["Flood_Start"], row["Flood_End"]
        involved = row["Sources_Involved"]
        acts = activations_df[
            (activations_df["StartTime"] >= s)
            & (activations_df["StartTime"] <= e)
            & (activations_df["Source"].isin(involved))
        ]
        counts = acts["Source"].value_counts().to_dict()
        filtered_counts = {src: cnt for src, cnt in counts.items() if cnt >= unhealthy_threshold}
        if len(filtered_counts) >= flood_source_threshold:
            flood_summary.append({
                "Flood_Start": s,
                "Flood_End": e,
                "Sources_Involved": filtered_counts,
                "Source_Count": len(filtered_counts),
            })
    flood_summary_df = pd.DataFrame(flood_summary)

    # 7) Unhealthy summary per source (number of merged periods)
    unhealthy_summary = merged_unhealthy_df.groupby("Source").size().reset_index(name="Unhealthy_Periods")

    return activations_df, unhealthy_summary, flood_summary_df


def identify_bad_actors(flood_summary_df: pd.DataFrame, top_n: int | None = None) -> pd.DataFrame:
    """
    Identify 'Bad Actor' sources — those contributing the most alarms during floods.
    
    Args:
        flood_summary_df: DataFrame with columns:
            ['Flood_Start', 'Flood_End', 'Sources_Involved', 'Source_Count']
            where 'Sources_Involved' is a dict {source: frequency}
        top_n: number of top contributors to return
    
    Returns:
        DataFrame with columns:
            ['Source', 'Total_Alarm_In_Floods', 'Flood_Involvement_Count']
    """
    from collections import defaultdict

    source_alarm_counts = defaultdict(int)
    flood_participation = defaultdict(int)

    for _, row in flood_summary_df.iterrows():
        sources_dict = row.get("Sources_Involved", {}) or {}
        for src, count in sources_dict.items():
            source_alarm_counts[src] += count
            flood_participation[src] += 1

    data = []
    for src in source_alarm_counts:
        data.append({
            "Source": src,
            "Total_Alarm_In_Floods": source_alarm_counts[src],
            "Flood_Involvement_Count": flood_participation[src],
        })

    bad_actors_df = pd.DataFrame(data).sort_values(
        "Total_Alarm_In_Floods", ascending=False
    ).reset_index(drop=True)

    if isinstance(top_n, int) and top_n > 0:
        return bad_actors_df.head(top_n)
    return bad_actors_df


# ---------- ACTIVATION-BASED ISA-STYLE WINDOW METRICS ----------

def _apply_op(value: int, op: str, threshold: int) -> bool:
    """Apply a simple comparison operator between value and threshold."""
    if op == ">":
        return value > threshold
    if op == ">=":
        return value >= threshold
    if op == "<":
        return value < threshold
    if op == "<=":
        return value <= threshold
    if op == "==":
        return value == threshold
    raise ValueError(f"Unsupported operator: {op}")


def compute_activation_window_metrics(
    activations_df: pd.DataFrame,
    window_minutes: int,
    overload_op: str,
    overload_threshold: int,
    unacceptable_op: str,
    unacceptable_threshold: int,
) -> Dict[str, Any]:
    """
    Compute ISA-style overall health metrics using UNIQUE activations per fixed 10-min window.
    Returns dict with:
      - total_windows
      - overload_windows_count
      - unacceptable_windows_count
      - activation_time_in_overload_windows_pct
      - activation_time_in_unacceptable_windows_pct
      - activation_overall_health_pct (100 - overload_pct)
      - peak_10min_activation_count, peak_10min_window_start, peak_10min_window_end
    """
    if activations_df is None or activations_df.empty:
        return {
            "total_windows": 0,
            "overload_windows_count": 0,
            "unacceptable_windows_count": 0,
            "activation_time_in_overload_windows_pct": 0.0,
            "activation_time_in_unacceptable_windows_pct": 0.0,
            "activation_overall_health_pct": 100.0,
            "peak_10min_activation_count": 0,
            "peak_10min_window_start": None,
            "peak_10min_window_end": None,
        }

    df = activations_df.copy()
    df["StartTime"] = pd.to_datetime(df["StartTime"], errors="coerce")
    df = df.dropna(subset=["StartTime"]).sort_values("StartTime")
    if df.empty:
        return {
            "total_windows": 0,
            "overload_windows_count": 0,
            "unacceptable_windows_count": 0,
            "activation_time_in_overload_windows_pct": 0.0,
            "activation_time_in_unacceptable_windows_pct": 0.0,
            "activation_overall_health_pct": 100.0,
            "peak_10min_activation_count": 0,
            "peak_10min_window_start": None,
            "peak_10min_window_end": None,
        }

    # Align to fixed windows
    freq = f"{int(window_minutes)}min"
    start = df["StartTime"].min().floor(freq)
    end = (df["StartTime"].max() + pd.Timedelta(minutes=window_minutes)).ceil(freq)
    # All window starts in range [start, end)
    window_starts = pd.date_range(start=start, end=end, freq=freq, inclusive="left")
    counts = df.groupby(df["StartTime"].dt.floor(freq)).size().reindex(window_starts, fill_value=0)

    total_windows = int(len(counts))
    if total_windows == 0:
        return {
            "total_windows": 0,
            "overload_windows_count": 0,
            "unacceptable_windows_count": 0,
            "activation_time_in_overload_windows_pct": 0.0,
            "activation_time_in_unacceptable_windows_pct": 0.0,
            "activation_overall_health_pct": 100.0,
            "peak_10min_activation_count": 0,
            "peak_10min_window_start": None,
            "peak_10min_window_end": None,
        }

    overload_mask = counts.apply(lambda x: _apply_op(int(x), overload_op, int(overload_threshold)))
    unacceptable_mask = counts.apply(lambda x: _apply_op(int(x), unacceptable_op, int(unacceptable_threshold)))

    overload_windows = int(overload_mask.sum())
    unacceptable_windows = int(unacceptable_mask.sum())

    overload_pct = round((overload_windows / total_windows) * 100.0, 2)
    unacceptable_pct = round((unacceptable_windows / total_windows) * 100.0, 2)
    overall_health_pct = round(100.0 - overload_pct, 2)

    peak_count = int(counts.max()) if not counts.empty else 0
    if peak_count > 0:
        peak_start = counts.idxmax()
        peak_end = peak_start + pd.Timedelta(minutes=window_minutes)
        peak_start_iso = peak_start.isoformat()
        peak_end_iso = peak_end.isoformat()
    else:
        peak_start_iso = None
        peak_end_iso = None

    return {
        "total_windows": total_windows,
        "overload_windows_count": overload_windows,
        "unacceptable_windows_count": unacceptable_windows,
        "activation_time_in_overload_windows_pct": overload_pct,
        "activation_time_in_unacceptable_windows_pct": unacceptable_pct,
        "activation_overall_health_pct": overall_health_pct,
        "peak_10min_activation_count": peak_count,
        "peak_10min_window_start": peak_start_iso,
        "peak_10min_window_end": peak_end_iso,
    }


def get_activation_peak_details(
    alarm_data_dir: str,
    start_iso: str,
    end_iso: str,
    plant_id: str = None,
    csv_relative_path: str = None,
    csv_file_name: str = None
) -> Dict[str, Any]:
    """Return per-source UNIQUE activation counts within [start, end).

    Uses the same unique activation logic as the actual-calc pipeline (Blank when IDLE/ACKED → activation).
    This is intended for verifying the peak 10-minute window shown in the frontend.
    """
    try:
        start = pd.to_datetime(start_iso, utc=False, errors="coerce")
        end = pd.to_datetime(end_iso, utc=False, errors="coerce")
        # Normalize timezone-aware inputs to naive (to match dataset which is naive)
        try:
            if hasattr(start, "tzinfo") and start.tzinfo is not None:
                start = start.tz_convert(None)
        except Exception:
            try:
                start = start.tz_localize(None)
            except Exception:
                pass
        try:
            if hasattr(end, "tzinfo") and end.tzinfo is not None:
                end = end.tz_convert(None)
        except Exception:
            try:
                end = end.tz_localize(None)
            except Exception:
                pass
        if pd.isna(start) or pd.isna(end) or start >= end:
            raise ValueError("Invalid start/end time range")

        df = load_pvci_merged_csv(
            alarm_data_dir,
            plant_id=plant_id,
            csv_relative_path=csv_relative_path,
            csv_file_name=csv_file_name
        )
        df = df.copy()
        df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
        df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
        df = df.sort_values(["Source", "Event Time"]).dropna(subset=["Event Time", "Source"])

        # Build unique activations (same state machine trigger as elsewhere)
        activations = []
        for src, g in df.groupby("Source"):
            state = "IDLE"
            for _, r in g.iterrows():
                a = r["Action"]
                t = r["Event Time"]
                if a == "" and state in ("IDLE", "ACKED"):
                    activations.append({"Source": src, "StartTime": t})
                    state = "ACTIVE"
                elif a == "ACK" and state == "ACTIVE":
                    state = "ACKED"
                elif a == "OK":
                    state = "IDLE"

        acts_df = pd.DataFrame(activations)
        if acts_df.empty:
            return {"window": {"start": start_iso, "end": end_iso}, "total": 0, "top_sources": []}

        # Filter to [start, end). If empty, try inclusive end and slight widen to be robust against rounding.
        filt = (acts_df["StartTime"] >= start) & (acts_df["StartTime"] < end)
        filtered = acts_df[filt]
        if filtered.empty:
            filt2 = (acts_df["StartTime"] >= start) & (acts_df["StartTime"] <= end)
            filtered = acts_df[filt2]
        if filtered.empty:
            widened_end = end + pd.Timedelta(seconds=1)
            filt3 = (acts_df["StartTime"] >= start) & (acts_df["StartTime"] < widened_end)
            filtered = acts_df[filt3]
        if filtered.empty:
            return {"window": {"start": start_iso, "end": end_iso}, "total": 0, "top_sources": []}

        counts = filtered["Source"].value_counts()
        total = int(counts.sum())
        top_sources = [{"source": k, "count": int(v)} for k, v in counts.head(50).items()]

        return {
            "window": {"start": start_iso, "end": end_iso},
            "total": total,
            "top_sources": top_sources,
        }
    except Exception as e:
        logger.error(f"get_activation_peak_details error: {e}")
        raise


# ---------- DATA LOADING ----------

def detect_metadata_rows(csv_path: str, max_check_rows: int = 10) -> tuple[int, pd.Timestamp | None]:
    """Detect how many metadata rows exist at the top of the CSV file.
    
    Metadata rows typically lack proper timestamps or have descriptive text.
    This function checks the first few rows to find where actual data starts.
    Also extracts seed datetime from metadata for truncated time reconstruction.
    
    PRIORITY ORDER for seed timestamp:
    1. Filter datetime from "Filter Applied: Event Time: Before X" (best for descending data)
    2. Report datetime from "Date/Time of Report: X" (fallback)
    
    Args:
        csv_path: Path to the CSV file
        max_check_rows: Maximum number of rows to check for metadata
        
    Returns:
        Tuple of (skiprows, seed_datetime):
            - skiprows: Number of rows to skip (0 if no metadata detected)
            - seed_datetime: Timestamp from filter or report metadata (filter takes priority), else None
    """
    import re
    
    try:
        # Read first few rows without header assumption
        sample = pd.read_csv(csv_path, nrows=max_check_rows, header=None)
        
        report_datetime = None
        filter_datetime = None
        skip_rows = 0
        
        # Try to find the header row (contains "Event Time" or "Source")
        for idx, row in sample.iterrows():
            row_str = ' '.join(str(val).lower() for val in row.values if pd.notna(val))
            
            # Check for report datetime in metadata
            if 'date/time of report' in row_str or 'datetime of report' in row_str:
                # Extract datetime after the label
                # Format: "Date/Time of Report: 3/18/2025 11:41:41"
                match = re.search(r'report[:\s]+(\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2})', row_str, re.IGNORECASE)
                if match:
                    try:
                        report_datetime = pd.to_datetime(match.group(1), format="%m/%d/%Y %H:%M:%S")
                        logger.info(f"Found report datetime in metadata: {report_datetime}")
                    except Exception:
                        pass
            
            # Check for filter date in metadata (PRIORITY over report datetime for data seeding)
            # Format: "Filter Applied: Event Time: Before 2/28/2025 11:59:59 PM"
            if 'filter applied' in row_str and 'event time' in row_str and 'before' in row_str:
                # Try different datetime formats
                # Format 1: "Before 2/28/2025 11:59:59 PM"
                match = re.search(r'before\s+(\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM))', row_str, re.IGNORECASE)
                if match:
                    try:
                        filter_datetime = pd.to_datetime(match.group(1), format="%m/%d/%Y %I:%M:%S %p")
                        logger.info(f"Found filter 'before' datetime in metadata: {filter_datetime}")
                    except Exception:
                        pass
                
                # Format 2: "Before 2/28/2025" (date only, assume end of day)
                if not filter_datetime:
                    match = re.search(r'before\s+(\d{1,2}/\d{1,2}/\d{4})', row_str, re.IGNORECASE)
                    if match:
                        try:
                            filter_datetime = pd.to_datetime(match.group(1), format="%m/%d/%Y")
                            # Assume end of day for "before" filter
                            filter_datetime = filter_datetime.replace(hour=23, minute=59, second=59)
                            logger.info(f"Found filter 'before' date in metadata (assuming 23:59:59): {filter_datetime}")
                        except Exception:
                            pass
            
            if 'event time' in row_str and 'source' in row_str:
                skip_rows = int(idx)
                break
        
        # Return filter_datetime as primary seed, fallback to report_datetime
        seed_datetime = filter_datetime if filter_datetime else report_datetime
        return skip_rows, seed_datetime
    except Exception as e:
        logger.warning(f"Metadata detection failed: {e}. Assuming no metadata rows.")
        return 0, None


def validate_required_columns(df: pd.DataFrame, csv_path: str) -> None:
    """Validate that the DataFrame contains all required columns.
    
    Args:
        df: DataFrame to validate
        csv_path: Path to CSV (for error messages)
        
    Raises:
        ValueError: If required columns are missing
    """
    required_columns = ['Event Time', 'Source', 'Action']
    missing_columns = [col for col in required_columns if col not in df.columns]
    
    if missing_columns:
        available = list(df.columns)
        raise ValueError(
            f"CSV file '{csv_path}' is missing required columns: {missing_columns}.\n"
            f"Available columns: {available}"
        )
    
    logger.info(f"Column validation passed. Found {len(df.columns)} columns: {list(df.columns)}")


def load_pvci_merged_csv(
    alarm_data_dir: str,
    plant_id: str = None,
    csv_relative_path: str = None,
    csv_file_name: str = None
) -> pd.DataFrame:
    """Load and preprocess alarm CSV file with dynamic path support.
    
    This function:
    1. Detects and skips metadata rows at the top of the file
    2. Validates required columns exist
    3. Parses timestamps and cleans text fields
    4. Pre-sorts data by Source and Event Time (CRITICAL for state machine logic)
    5. Handles optional 'Source Sheet Name' column
    
    Args:
        alarm_data_dir: Path to ALARM_DATA_DIR
        plant_id: Optional plant identifier (e.g., "PVCI", "VCMA")
                 If provided, uses plant_registry to lookup CSV path
        csv_relative_path: Optional relative path from alarm_data_dir to CSV folder
                          (e.g., "PVCI-merged" or "other-plant/data")
        csv_file_name: Optional CSV filename (e.g., "All_Merged.csv" or "plant2.csv")
                      
    Default behavior (backward compatible):
        If no parameters specified, uses "PVCI-merged/All_Merged.csv"
        If plant_id provided, uses plant_registry to lookup CSV path
        
    Returns:
        DataFrame with:
        - Parsed Event Time column
        - Cleaned Action column
        - Pre-sorted by ['Source', 'Event Time']
        - No invalid rows (missing Event Time or Source)
        
    Raises:
        FileNotFoundError: If CSV file doesn't exist
        ValueError: If CSV is empty, malformed, or missing required columns
    """
    # Build CSV path - priority: explicit params > plant_id > defaults
    if plant_id and csv_relative_path is None and csv_file_name is None:
        # Use plant registry to get CSV path
        csv_info = get_plant_csv_info(plant_id)
        if csv_info:
            csv_relative_path = csv_info["csv_relative_path"]
            csv_file_name = csv_info["csv_filename"]
            logger.info(f"Using plant_id='{plant_id}' from registry: {csv_relative_path}/{csv_file_name}")
        else:
            logger.warning(f"Plant ID '{plant_id}' not found in registry, using defaults")
            csv_relative_path = DEFAULT_CSV_RELATIVE_PATH
            csv_file_name = DEFAULT_CSV_FILE_NAME
    elif csv_relative_path is None and csv_file_name is None:
        csv_relative_path = DEFAULT_CSV_RELATIVE_PATH
        csv_file_name = DEFAULT_CSV_FILE_NAME
    elif csv_file_name is None:
        raise ValueError("csv_file_name must be provided if csv_relative_path is specified")
    elif csv_relative_path is None:
        csv_relative_path = DEFAULT_CSV_RELATIVE_PATH  # default folder
    
    csv_path = os.path.join(alarm_data_dir, csv_relative_path, csv_file_name)
    
    if not os.path.exists(csv_path):
        raise FileNotFoundError(
            f"CSV file not found at: {csv_path}\n"
            f"alarm_data_dir: {alarm_data_dir}\n"
            f"csv_relative_path: {csv_relative_path}\n"
            f"csv_file_name: {csv_file_name}"
        )
    
    logger.info(f"Loading CSV from: {csv_path}")
    
    try:
        # Step 1: Detect and skip metadata rows, extract seed datetime if present
        # (Uses filter date with priority, fallback to report date)
        skiprows, seed_datetime = detect_metadata_rows(csv_path)
        if skiprows > 0:
            logger.info(f"Detected {skiprows} metadata row(s) at top of file. Skipping...")
        
        # Step 2: Load CSV with proper header
        df = pd.read_csv(csv_path, skiprows=skiprows)
        
        if df.empty:
            raise ValueError(f"CSV file is empty: {csv_path}")
        
        # Step 3: Validate required columns exist
        validate_required_columns(df, csv_path)
        
        # Step 4: Parse Event Time with forward-fill for time-only values
        # Known formats: 
        #   - "1/1/2025  12:00:04 AM"  (VCMA) => "%m/%d/%Y %I:%M:%S %p"
        #   - "2025-01-01 00:00:00"    (PVCI) => "%Y-%m-%d %H:%M:%S"
        #   - "12:00:14 AM" (time-only) => needs date from previous row
        #
        # Strategy: Detect time-only rows, forward-fill dates from previous valid rows,
        # then reconstruct full datetimes before sorting
        
        import re
        
        # Normalize whitespace first
        et = df["Event Time"].astype(str).str.strip()
        et = et.str.replace(r"\s+", " ", regex=True)
        
        # Regex patterns to identify row types
        # Full datetime patterns (have both date and time)
        pattern_full_ampm = r'^\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+(AM|PM)$'
        pattern_full_iso = r'^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$'
        
        # Time-only patterns (missing date component)
        pattern_time_ampm = r'^\d{1,2}:\d{2}:\d{2}\s+(AM|PM)$'
        pattern_time_24h = r'^\d{1,2}:\d{2}:\d{2}$'
        
        # Truncated time patterns (missing date AND hour, showing only MM:SS or MM:SS.S)
        # Common in VCMA exports: "59:56.2" means 59 minutes, 56.2 seconds
        pattern_mmss = r'^\d{1,2}:\d{2}(\.\d+)?$'
        
        # Identify row types
        is_full_ampm = et.str.match(pattern_full_ampm, na=False)
        is_full_iso = et.str.match(pattern_full_iso, na=False)
        is_time_ampm = et.str.match(pattern_time_ampm, na=False)
        is_time_24h = et.str.match(pattern_time_24h, na=False)
        is_mmss = et.str.match(pattern_mmss, na=False)
        
        # IMPORTANT: Disambiguate HH:MM:SS (time_24h) from MM:SS (mmss)
        # If a value matches both patterns, check if it has 3 segments with colon
        # HH:MM:SS has 2 colons, MM:SS has 1 colon
        ambiguous = is_time_24h & is_mmss
        if ambiguous.any():
            colon_count = et[ambiguous].str.count(':')
            is_time_24h.loc[ambiguous] = (colon_count == 2)
            is_mmss.loc[ambiguous] = (colon_count == 1)
        
        is_full_datetime = is_full_ampm | is_full_iso
        is_time_only = is_time_ampm | is_time_24h
        is_truncated = is_mmss
        
        time_only_count = is_time_only.sum()
        truncated_count = is_truncated.sum()
        if time_only_count > 0:
            logger.info(f"Detected {time_only_count} rows with time-only values (missing date)")
        if truncated_count > 0:
            logger.info(f"Detected {truncated_count} rows with truncated time (MM:SS format, missing date and hour)")
        
        # Extract full timestamps from full datetime rows (for forward-fill to truncated times)
        full_timestamp_series = pd.Series([pd.NaT] * len(et), index=et.index, dtype='datetime64[ns]')
        
        # Also extract just dates from full datetime rows (for time-only rows)
        date_series = pd.Series([None] * len(et), index=et.index, dtype=object)
        
        # Parse dates AND full timestamps from AM/PM format rows
        if is_full_ampm.any():
            ampm_timestamps = pd.to_datetime(
                et[is_full_ampm], 
                format="%m/%d/%Y %I:%M:%S %p", 
                errors="coerce"
            )
            full_timestamp_series.loc[is_full_ampm] = ampm_timestamps
            date_series.loc[is_full_ampm] = ampm_timestamps.dt.date
        
        # Parse dates AND full timestamps from ISO format rows
        if is_full_iso.any():
            iso_timestamps = pd.to_datetime(
                et[is_full_iso], 
                format="%Y-%m-%d %H:%M:%S", 
                errors="coerce"
            )
            full_timestamp_series.loc[is_full_iso] = iso_timestamps
            date_series.loc[is_full_iso] = iso_timestamps.dt.date
        
        # Forward-fill dates for time-only rows AND full timestamps for truncated rows
        # If CSV has a seed datetime in metadata and no full timestamps in data, seed with it
        # Priority: Filter date ("Before X") > Report date ("Date/Time of Report: X")
        if seed_datetime is not None and full_timestamp_series.isna().all():
            logger.info(f"No full timestamps in data; using seed datetime from metadata: {seed_datetime}")
            full_timestamp_series.iloc[0] = seed_datetime
        
        # This carries the most recent valid date/timestamp forward to rows missing them
        date_series_filled = date_series.ffill()
        full_timestamp_series_filled = full_timestamp_series.ffill()
        
        # Count how many time-only rows got a date via forward-fill
        time_only_fixed = (is_time_only & date_series_filled.notna()).sum()
        time_only_still_missing = (is_time_only & date_series_filled.isna()).sum()
        
        # Count how many truncated rows got a timestamp via forward-fill
        truncated_fixed = (is_truncated & full_timestamp_series_filled.notna()).sum()
        truncated_still_missing = (is_truncated & full_timestamp_series_filled.isna()).sum()
        
        if time_only_fixed > 0:
            logger.info(f"✓ Fixed {time_only_fixed} time-only rows by forward-filling dates")
        if time_only_still_missing > 0:
            logger.warning(
                f"⚠ {time_only_still_missing} time-only rows at start of file with no previous date "
                f"(will be dropped)"
            )
        if truncated_fixed > 0:
            logger.info(f"✓ Fixed {truncated_fixed} truncated time rows by forward-filling full timestamps")
        if truncated_still_missing > 0:
            logger.warning(
                f"⚠ {truncated_still_missing} truncated rows at start of file with no previous timestamp "
                f"(will be dropped)"
            )
        
        # Now reconstruct full datetimes
        parsed = pd.Series([pd.NaT] * len(et), index=et.index, dtype='datetime64[ns]')
        
        # Parse full datetime rows with strict formats
        if is_full_ampm.any():
            parsed.loc[is_full_ampm] = pd.to_datetime(
                et[is_full_ampm], 
                format="%m/%d/%Y %I:%M:%S %p", 
                errors="coerce"
            )
        
        if is_full_iso.any():
            parsed.loc[is_full_iso] = pd.to_datetime(
                et[is_full_iso], 
                format="%Y-%m-%d %H:%M:%S", 
                errors="coerce"
            )
        
        # Reconstruct time-only rows by combining forward-filled date + time string
        time_only_with_date = is_time_only & date_series_filled.notna()
        if time_only_with_date.any():
            # Build full datetime strings from date + time
            date_strs = date_series_filled[time_only_with_date].astype(str)
            time_strs = et[time_only_with_date]
            combined = date_strs + " " + time_strs
            
            # Parse AM/PM time-only rows
            time_only_ampm_mask = time_only_with_date & is_time_ampm
            if time_only_ampm_mask.any():
                parsed.loc[time_only_ampm_mask] = pd.to_datetime(
                    combined[time_only_ampm_mask],
                    format="%Y-%m-%d %I:%M:%S %p",
                    errors="coerce"
                )
            
            # Parse 24h time-only rows
            time_only_24h_mask = time_only_with_date & is_time_24h
            if time_only_24h_mask.any():
                parsed.loc[time_only_24h_mask] = pd.to_datetime(
                    combined[time_only_24h_mask],
                    format="%Y-%m-%d %H:%M:%S",
                    errors="coerce"
                )
        
        # Reconstruct truncated rows (MM:SS.S format) by updating forward-filled timestamp
        truncated_with_timestamp = is_truncated & full_timestamp_series_filled.notna()
        if truncated_with_timestamp.any():
            # For each truncated row, parse MM:SS.S and update the forward-filled timestamp
            base_timestamps = full_timestamp_series_filled[truncated_with_timestamp].copy()
            mmss_strs = et[truncated_with_timestamp]
            
            # Parse MM:SS or MM:SS.S to extract minutes and seconds
            for idx in mmss_strs.index:
                try:
                    mmss_val = str(mmss_strs[idx])
                    parts = mmss_val.split(':')
                    if len(parts) == 2:
                        minutes = int(parts[0])
                        seconds_parts = parts[1].split('.')
                        seconds = int(seconds_parts[0])
                        microseconds = 0
                        if len(seconds_parts) > 1:
                            # Convert fractional seconds to microseconds
                            frac = seconds_parts[1].ljust(6, '0')[:6]  # Pad or trim to 6 digits
                            microseconds = int(frac)
                        
                        # Get base timestamp and update its minute/second/microsecond
                        base_ts = base_timestamps[idx]
                        if pd.notna(base_ts):
                            new_ts = base_ts.replace(minute=minutes, second=seconds, microsecond=microseconds)
                            parsed.loc[idx] = new_ts
                except Exception:
                    # If parsing fails, leave as NaT (will be dropped)
                    pass
        
        # Final fallback for any remaining unparsed non-standard formats
        # (only for rows that didn't match our patterns)
        unmatched = ~is_full_datetime & ~is_time_only & ~is_truncated
        if unmatched.any() and parsed[unmatched].isna().any():
            need_fallback = unmatched & parsed.isna() & et.notna()
            if need_fallback.any():
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    parsed.loc[need_fallback] = pd.to_datetime(et[need_fallback], errors="coerce")
                logger.info(f"Applied generic parser to {need_fallback.sum()} non-standard datetime formats")
        
        df["Event Time"] = parsed
        
        # Verify no "today" contamination (safety check)
        today = pd.Timestamp.now().date()
        today_count = (parsed.dt.date == today).sum()
        if today_count > 0:
            logger.warning(
                f"⚠ Found {today_count} rows with today's date ({today}) - "
                f"verify this is intentional and not from time-only parsing errors"
            )
        
        # Step 5: Clean Action column
        df['Action'] = df['Action'].astype(str).str.strip().replace({'nan': ''})
        
        # Step 6: Clean optional Condition column if present
        if 'Condition' in df.columns:
            df['Condition'] = df['Condition'].fillna("").astype(str).str.strip()
        
        # Step 7: Handle optional 'Source Sheet Name' column
        if 'Source Sheet Name' in df.columns:
            logger.info("Found 'Source Sheet Name' column - preserving for reference")
        
        # Step 8: Drop rows with invalid Event Time or missing Source
        initial_rows = len(df)
        df = df.dropna(subset=['Event Time', 'Source'])
        dropped = initial_rows - len(df)
        
        if dropped > 0:
            logger.warning(f"Dropped {dropped} rows with invalid Event Time or missing Source")
        
        if df.empty:
            raise ValueError(f"No valid data rows after cleaning: {csv_path}")
        
        # Step 9: PRE-SORT ONCE (Critical for all state machine calculations)
        # This eliminates redundant sorting in each calculation function
        logger.info("Pre-sorting data by ['Source', 'Event Time']...")
        df = df.sort_values(['Source', 'Event Time']).reset_index(drop=True)
        
        # Step 10: Log summary
        logger.info(f"✓ Loaded {len(df)} alarm events from {df['Source'].nunique()} unique sources")
        logger.info(f"✓ Time range: {df['Event Time'].min()} to {df['Event Time'].max()}")
        logger.info(f"✓ Data pre-sorted and ready for calculations")
        
        return df
        
    except Exception as e:
        logger.error(f"Failed to load CSV: {str(e)}")
        raise


# ---------- ACTIVATION CACHE (PHASE 1) ----------

def compute_activations(
    df: pd.DataFrame,
    plant_id: Optional[str] = None,
    refractory_seconds: int = 10,
    timeout_minutes: Optional[int] = None,
) -> pd.DataFrame:
    """Extract unique alarm activations per Source+Condition using ISA/EEMUA-style
    state machine (Blank→ACK→OK). Assumes `df` is already sorted by ['Source', 'Event Time'].

    Returns a DataFrame with columns:
      PlantId, Source, Condition, StartTime, AckTime, OkTime, EndTime,
      DurationMin, Acked, StandingFlag, Day, Hour, Month, Window10m,
      SourceAlias, Provenance, ComputationTimestamp, ThresholdsUsed
    """
    if df is None or df.empty:
        return pd.DataFrame(columns=[
            "PlantId","Source","Condition","StartTime","AckTime","OkTime","EndTime",
            "DurationMin","Acked","StandingFlag","Day","Hour","Month","Window10m",
            "SourceAlias","Provenance","ComputationTimestamp","ThresholdsUsed"
        ])

    d = df.copy()
    d["Event Time"] = pd.to_datetime(d["Event Time"], errors="coerce")
    d = d.dropna(subset=["Event Time", "Source"])
    d["Action"] = d["Action"].fillna("").astype(str).str.upper().str.strip()
    if "Condition" in d.columns:
        d["Condition"] = d["Condition"].fillna("").astype(str).str.upper().str.strip()
    else:
        d["Condition"] = "NOT PROVIDED"

    # Skip common non-alarm conditions (extendable)
    non_alarm_conditions = {"CHANGE", "ONREQ.PV", "NORMAL", "ONREQ", "MESSAGE", "CHECKPOINT"}

    rows = []
    comp_ts = datetime.utcnow().isoformat()
    provenance = "activation_cache_v1"
    thresholds_used = {
        "stale_min": int(STALE_THRESHOLD_MIN),
        "chatter_min": float(CHATTER_THRESHOLD_MIN),
        "unhealthy_threshold": int(UNHEALTHY_THRESHOLD),
        "window_minutes": int(WINDOW_MINUTES),
    }

    # Debounce window for consecutive blanks
    ref_delta = timedelta(seconds=max(0, int(refractory_seconds)))
    to_minutes = lambda td: (td.total_seconds() / 60.0) if isinstance(td, timedelta) else None

    for (src, cond), g in d.groupby(["Source", "Condition"], sort=False):
        if str(cond or "").upper() in non_alarm_conditions:
            continue
        g = g.sort_values("Event Time")

        state = "IDLE"
        active_start = None
        last_start = None
        ack_time = None
        ok_time = None

        for _, r in g.iterrows():
            action = r.get("Action", "")
            t = r.get("Event Time")
            if pd.isna(t):
                continue

            if action == "":
                # Debounce multiple blanks in quick succession
                if state in ("IDLE", "ACKED"):
                    if last_start is None or (t - last_start) > ref_delta:
                        active_start = t
                        last_start = t
                        ack_time = None
                        ok_time = None
                        state = "ACTIVE"
            elif action == "ACK" and state == "ACTIVE":
                ack_time = t
                state = "ACKED"
            elif action == "OK" and state in ("ACTIVE", "ACKED"):
                ok_time = t
                # Close activation
                end_time = ok_time
                standing = False
                if ack_time is not None and active_start is not None:
                    standing = ((ack_time - active_start).total_seconds() / 60.0) >= float(STALE_THRESHOLD_MIN)
                duration = None
                if active_start is not None and end_time is not None:
                    duration = to_minutes(end_time - active_start)

                start = active_start if active_start is not None else t
                win_minutes = max(1, int(WINDOW_MINUTES) if WINDOW_MINUTES else 10)
                window_start = (start.floor(f"{win_minutes}min") if hasattr(start, 'floor')
                                else pd.to_datetime(start).floor(f"{win_minutes}min"))

                rows.append({
                    "PlantId": plant_id or "",
                    "Source": src,
                    "Condition": cond,
                    "StartTime": start,
                    "AckTime": ack_time,
                    "OkTime": ok_time,
                    "EndTime": end_time,
                    "DurationMin": duration,
                    "Acked": bool(ack_time is not None),
                    "StandingFlag": bool(standing),
                    "Day": (start.date() if hasattr(start, 'date') else pd.to_datetime(start).date()),
                    "Hour": int((start.hour if hasattr(start, 'hour') else pd.to_datetime(start).hour)),
                    "Month": (start.strftime("%Y-%m") if hasattr(start, 'strftime') else pd.to_datetime(start).strftime("%Y-%m")),
                    "Window10m": window_start,
                    "SourceAlias": None,
                    "Provenance": provenance,
                    "ComputationTimestamp": comp_ts,
                    "ThresholdsUsed": json.dumps(thresholds_used),
                })

                # Reset
                state = "IDLE"
                active_start = None
                ack_time = None
                ok_time = None

        # Handle trailing ACTIVE/ACKED without OK using timeout or group end
        if state in ("ACTIVE", "ACKED") and active_start is not None:
            end_time = None
            if timeout_minutes is not None and timeout_minutes > 0:
                end_time = active_start + timedelta(minutes=int(timeout_minutes))
            else:
                # Fallback to last event time in this group
                end_time = g["Event Time"].iloc[-1]
            standing = False
            if ack_time is not None:
                standing = ((ack_time - active_start).total_seconds() / 60.0) >= float(STALE_THRESHOLD_MIN)
            duration = to_minutes(end_time - active_start) if end_time is not None else None
            start = active_start
            win_minutes = max(1, int(WINDOW_MINUTES) if WINDOW_MINUTES else 10)
            window_start = (start.floor(f"{win_minutes}min") if hasattr(start, 'floor')
                            else pd.to_datetime(start).floor(f"{win_minutes}min"))

            rows.append({
                "PlantId": plant_id or "",
                "Source": src,
                "Condition": cond,
                "StartTime": start,
                "AckTime": ack_time,
                "OkTime": ok_time,
                "EndTime": end_time,
                "DurationMin": duration,
                "Acked": bool(ack_time is not None),
                "StandingFlag": bool(standing),
                "Day": (start.date() if hasattr(start, 'date') else pd.to_datetime(start).date()),
                "Hour": int((start.hour if hasattr(start, 'hour') else pd.to_datetime(start).hour)),
                "Month": (start.strftime("%Y-%m") if hasattr(start, 'strftime') else pd.to_datetime(start).strftime("%Y-%m")),
                "Window10m": window_start,
                "SourceAlias": None,
                "Provenance": provenance,
                "ComputationTimestamp": comp_ts,
                "ThresholdsUsed": json.dumps(thresholds_used),
            })

    act_df = pd.DataFrame(rows)
    if not act_df.empty:
        # Stable types
        act_df["Acked"] = act_df["Acked"].astype(bool)
        act_df["StandingFlag"] = act_df["StandingFlag"].astype(bool)
    return act_df


def write_activation_cache(plant_id: str, activations_df: pd.DataFrame, version: str = "v1") -> Dict[str, Any]:
    """Persist activations to PVCI-actual-calc/cache/{plant}/{version}/.
    Writes Parquet when available, otherwise falls back to CSV. Also writes metadata.json.
    Returns dict with written paths and counts.
    """
    cache_root = os.path.join(os.path.dirname(__file__), "cache", str(plant_id or ""), str(version or "v1"))
    os.makedirs(cache_root, exist_ok=True)

    meta = {
        "plant_id": plant_id,
        "version": version or "v1",
        "record_count": int(len(activations_df) if activations_df is not None else 0),
        "computation_timestamp": datetime.utcnow().isoformat(),
        "thresholds": {
            "stale_min": int(STALE_THRESHOLD_MIN),
            "chatter_min": float(CHATTER_THRESHOLD_MIN),
            "unhealthy_threshold": int(UNHEALTHY_THRESHOLD),
            "window_minutes": int(WINDOW_MINUTES),
        },
        "provenance": "activation_cache_v1",
    }

    parquet_path = os.path.join(cache_root, "activations.parquet")
    csv_path = os.path.join(cache_root, "activations.csv")
    metadata_path = os.path.join(cache_root, "metadata.json")

    wrote = {"parquet": None, "csv": None, "metadata": metadata_path}
    try:
        if activations_df is not None and not activations_df.empty:
            # Prefer Parquet when engine available
            try:
                activations_df.to_parquet(parquet_path, index=False)
                wrote["parquet"] = parquet_path
            except Exception:
                # Fallback to CSV when parquet engine missing
                activations_df.to_csv(csv_path, index=False)
                wrote["csv"] = csv_path
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2, default=str)
    except Exception as e:
        logger.error(f"Failed to write activation cache: {e}")
        raise

    return {"paths": wrote, "meta": meta}


# ---------- MAIN COMPUTATION WRAPPER ----------

def run_actual_calc(
    alarm_data_dir: str,
    plant_id: str = None,
    stale_min: int = 60,
    chatter_min: int = 10,
    unhealthy_threshold: int = UNHEALTHY_THRESHOLD,
    window_minutes: int = WINDOW_MINUTES,
    flood_source_threshold: int = FLOOD_SOURCE_THRESHOLD,
    iso_threshold: int = 288,
    unacceptable_threshold: int = 720,
    # Activation-window ISA-style healthy metrics (centralized overrides)
    act_window_overload_op: str = ACT_WINDOW_OVERLOAD_OP,
    act_window_overload_threshold: int = ACT_WINDOW_OVERLOAD_THRESHOLD,
    act_window_unacceptable_op: str = ACT_WINDOW_UNACCEPTABLE_OP,
    act_window_unacceptable_threshold: int = ACT_WINDOW_UNACCEPTABLE_THRESHOLD,
    # Dynamic CSV path support
    csv_relative_path: str = None,
    csv_file_name: str = None,
) -> Tuple[pd.DataFrame, Dict[str, Any], pd.DataFrame, Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], list, Dict[str, Any]]:
    """Run actual calculation with specified thresholds on any CSV file.
    
    This function now supports dynamic CSV file processing:
    - Default behavior: Uses "PVCI-merged/All_Merged.csv" (backward compatible)
    - Custom CSV: Provide csv_relative_path and csv_file_name
    
    Args:
        alarm_data_dir: Path to ALARM_DATA_DIR
        plant_id: Optional plant identifier (e.g., "PVCI", "VCMA")
        stale_min: Standing/stale threshold in minutes (default 60)
        chatter_min: Chattering alarm threshold in minutes (default 10)
        unhealthy_threshold: Activations threshold for unhealthy (default 10)
        window_minutes: Sliding window minutes (default 10)
        flood_source_threshold: Minimum overlapping unhealthy sources for flood (default 2)
        iso_threshold: ISO 18.2 alarm rate threshold per day (default 288)
        unacceptable_threshold: Unacceptable alarm rate threshold per day (default 720)
        act_window_overload_op: Operator for overload comparison (default ">")
        act_window_overload_threshold: Threshold for overload windows (default 2)
        act_window_unacceptable_op: Operator for unacceptable comparison (default ">=")
        act_window_unacceptable_threshold: Threshold for unacceptable windows (default 5)
        csv_relative_path: Optional path relative to alarm_data_dir (e.g., "plant2/data")
        csv_file_name: Optional CSV filename (e.g., "merged_data.csv")
        
    Returns:
        Tuple of (summary_df, kpis_dict, cycles_df, unhealthy_dict, floods_dict, bad_actors_dict, 
                 frequency_dict, source_meta_dict, category_summary_dict, hourly_matrix_list, sankey_data_dict)
    
    Example:
        # Use default CSV (backward compatible)
        results = run_actual_calc(ALARM_DATA_DIR)
        
        # Use custom CSV
        results = run_actual_calc(
            ALARM_DATA_DIR,
            csv_relative_path="plant2/alarm-data",
            csv_file_name="plant2_merged.csv"
        )
    """
    global STALE_THRESHOLD_MIN, CHATTER_THRESHOLD_MIN, UNHEALTHY_THRESHOLD, WINDOW_MINUTES, FLOOD_SOURCE_THRESHOLD
    global ACT_WINDOW_OVERLOAD_OP, ACT_WINDOW_OVERLOAD_THRESHOLD, ACT_WINDOW_UNACCEPTABLE_OP, ACT_WINDOW_UNACCEPTABLE_THRESHOLD
    
    # Update thresholds
    STALE_THRESHOLD_MIN = stale_min
    CHATTER_THRESHOLD_MIN = chatter_min
    UNHEALTHY_THRESHOLD = unhealthy_threshold
    WINDOW_MINUTES = window_minutes
    FLOOD_SOURCE_THRESHOLD = flood_source_threshold
    ACT_WINDOW_OVERLOAD_OP = act_window_overload_op
    ACT_WINDOW_OVERLOAD_THRESHOLD = act_window_overload_threshold
    ACT_WINDOW_UNACCEPTABLE_OP = act_window_unacceptable_op
    ACT_WINDOW_UNACCEPTABLE_THRESHOLD = act_window_unacceptable_threshold
    
    # Log calculation parameters with EFFECTIVE plant and CSV path
    # Resolve effective CSV from registry when plant_id is provided without explicit CSV params
    eff_rel = csv_relative_path
    eff_file = csv_file_name
    eff_plant = plant_id
    try:
        if plant_id and csv_relative_path is None and csv_file_name is None:
            _ci = get_plant_csv_info(plant_id)
            if _ci:
                eff_rel = _ci.get("csv_relative_path", eff_rel)
                eff_file = _ci.get("csv_filename", eff_file)
        # If plant_id not provided, try to infer from CSV hints
        if not eff_plant:
            # infer by matching registry csv_filename
            for _pid in ["PVCI", "VCMA"]:
                _info = get_plant_csv_info(_pid)
                if _info and eff_file and str(_info.get("csv_filename", "")).lower() == str(eff_file).lower():
                    eff_plant = _pid
                    break
            # infer from relative path folder name
            if not eff_plant and eff_rel:
                _last = str(eff_rel).replace("\\", "/").split("/")[-1].upper()
                if _last in ("PVCI-MERGED", "PVCI"):
                    eff_plant = "PVCI"
                elif _last in ("VCMA",):
                    eff_plant = "VCMA"
            # infer from filename stem
            if not eff_plant and eff_file:
                _stem = os.path.splitext(str(eff_file))[0].upper()
                if _stem in ("PVCI", "VCMA"):
                    eff_plant = _stem
    except Exception:
        pass

    # Fallbacks
    eff_rel = eff_rel or DEFAULT_CSV_RELATIVE_PATH
    eff_file = eff_file or DEFAULT_CSV_FILE_NAME
    plant_label = eff_plant or "default"
    csv_info = f"plant_id={plant_label}, csv_path={eff_rel}/{eff_file}"
    logger.info(
        f"Running actual calculation with {csv_info}, "
        f"stale_min={stale_min}, chatter_min={chatter_min}, "
        f"unhealthy_threshold={unhealthy_threshold}, window_minutes={window_minutes}, "
        f"flood_source_threshold={flood_source_threshold}, "
        f"act_overload=({ACT_WINDOW_OVERLOAD_OP} {ACT_WINDOW_OVERLOAD_THRESHOLD}), "
        f"act_unacceptable=({ACT_WINDOW_UNACCEPTABLE_OP} {ACT_WINDOW_UNACCEPTABLE_THRESHOLD})"
    )
    
    # Load data with dynamic CSV path support
    start_time = datetime.now()
    df = load_pvci_merged_csv(
        alarm_data_dir,
        plant_id=plant_id,
        csv_relative_path=csv_relative_path,
        csv_file_name=csv_file_name
    )
    load_duration = (datetime.now() - start_time).total_seconds()
    logger.info(f"Data loaded in {load_duration:.2f}s (pre-sorted, ready for calculations)")
    
    # Calculate KPIs
    calc_start = datetime.now()
    summary, kpis, cycles = calculate_alarm_kpis(df)
    calc_duration = (datetime.now() - calc_start).total_seconds()
    logger.info(f"KPIs calculated in {calc_duration:.2f}s")

    # Unhealthy + Floods (from notebook)
    ua_start = datetime.now()
    activations_df, unhealthy_df, flood_df = detect_unhealthy_and_flood(
        df,
        unhealthy_threshold=unhealthy_threshold,
        window_minutes=window_minutes,
        flood_source_threshold=flood_source_threshold,
    )
    ua_dur = (datetime.now() - ua_start).total_seconds()
    logger.info(f"Unhealthy/Flood computed in {ua_dur:.2f}s: {len(unhealthy_df)} sources, {len(flood_df)} windows")

    # Activation-based ISA-style window metrics (using centralized thresholds)
    act_metrics = compute_activation_window_metrics(
        activations_df=activations_df,
        window_minutes=window_minutes,
        overload_op=ACT_WINDOW_OVERLOAD_OP,
        overload_threshold=ACT_WINDOW_OVERLOAD_THRESHOLD,
        unacceptable_op=ACT_WINDOW_UNACCEPTABLE_OP,
        unacceptable_threshold=ACT_WINDOW_UNACCEPTABLE_THRESHOLD,
    )

    # Build JSON-ready dicts for cache consumers
    total_unhealthy_periods = int(unhealthy_df["Unhealthy_Periods"].sum()) if not unhealthy_df.empty else 0

    unhealthy_dict: Dict[str, Any] = {
        "params": {"threshold": unhealthy_threshold, "window_minutes": window_minutes},
        "per_source": unhealthy_df.sort_values("Unhealthy_Periods", ascending=False).to_dict(orient="records") if not unhealthy_df.empty else [],
        "total_periods": total_unhealthy_periods,
    }

    windows_list: list[Dict[str, Any]] = []
    total_flood_count = 0
    if not flood_df.empty:
        for _, row in flood_df.iterrows():
            s = row["Flood_Start"]
            e = row["Flood_End"]
            counts = row.get("Sources_Involved", {}) or {}
            # counts is dict {source: count}
            try:
                flood_count = int(sum(int(v) for v in counts.values()))
            except Exception:
                flood_count = 0
            total_flood_count += flood_count
            top_sources = sorted(({"source": str(k), "count": int(v)} for k, v in counts.items()), key=lambda x: x["count"], reverse=True)
            windows_list.append({
                "id": f"{pd.to_datetime(s).isoformat()}_{pd.to_datetime(e).isoformat()}",
                "start": pd.to_datetime(s).isoformat() if pd.notna(s) else None,
                "end": pd.to_datetime(e).isoformat() if pd.notna(e) else None,
                "source_count": int(row.get("Source_Count", len(counts) or 0)),
                "flood_count": int(flood_count),
                "rate_per_min": float(flood_count) / float(window_minutes) if window_minutes else None,
                "sources_involved": counts,
                "top_sources": top_sources,
            })
    floods_dict: Dict[str, Any] = {
        "params": {"window_minutes": window_minutes, "source_threshold": flood_source_threshold},
        "windows": windows_list,
        "totals": {"total_windows": len(windows_list), "total_flood_count": int(total_flood_count)},
    }

    # Bad Actors identification (from notebook)
    bad_actors_df = identify_bad_actors(flood_df, top_n=None) if not flood_df.empty else pd.DataFrame()
    bad_actors_dict: Dict[str, Any] = {
        "top_actors": bad_actors_df.to_dict(orient="records") if not bad_actors_df.empty else [],
        "total_actors": len(bad_actors_df),
    }
    logger.info(f"Bad Actors identified: {len(bad_actors_df)} sources")

    # ISO/EEMUA 191 Frequency Metrics (activation-based)
    freq_start = datetime.now()
    frequency_result = calculate_alarm_frequency_metrics(
        df,
        iso_threshold=iso_threshold,
        unacceptable_threshold=unacceptable_threshold,
    )
    freq_dur = (datetime.now() - freq_start).total_seconds()
    logger.info(f"Frequency metrics computed in {freq_dur:.2f}s")
    
    freq_summary = frequency_result.get("Summary", {})
    frequency_dict: Dict[str, Any] = {
        "params": {"iso_threshold": iso_threshold, "unacceptable_threshold": unacceptable_threshold},
        "summary": freq_summary,
        "alarms_per_day": dataframe_to_json_records(frequency_result.get("Alarms_Per_Day", pd.DataFrame())),
        "days_over_288": dataframe_to_json_records(frequency_result.get("Days_Over_288", pd.DataFrame())),
        "days_unacceptable": dataframe_to_json_records(frequency_result.get("Days_Unacceptable", pd.DataFrame())),
    }
    
    # Merge frequency summary into overall KPIs (replacing event-based with activation-based)
    kpis.update({
        "avg_alarms_per_day": freq_summary.get("avg_alarms_per_day", 0),
        "avg_alarms_per_hour": freq_summary.get("avg_alarms_per_hour", 0),
        "avg_alarms_per_10min": freq_summary.get("avg_alarms_per_10min", 0),
        "days_over_288_count": freq_summary.get("days_over_288_count", 0),
        "days_over_288_alarms_pct": freq_summary.get("days_over_288_alarms_pct", 0),
        "days_unacceptable_count": freq_summary.get("days_unacceptable_count", 0),
        "days_unacceptable_pct": freq_summary.get("days_unacceptable_pct", 0),
        "total_days_analyzed": freq_summary.get("total_days_analyzed", 0),
        "total_unique_alarms": freq_summary.get("total_unique_alarms", 0),
    })

    # Merge activation window metrics into overall KPIs
    kpis.update({
        "activation_time_in_overload_windows_pct": act_metrics.get("activation_time_in_overload_windows_pct", 0.0),
        "activation_time_in_unacceptable_windows_pct": act_metrics.get("activation_time_in_unacceptable_windows_pct", 0.0),
        "activation_overall_health_pct": act_metrics.get("activation_overall_health_pct", 100.0),
        "total_activation_windows": act_metrics.get("total_windows", 0),
        "overload_windows_count": act_metrics.get("overload_windows_count", 0),
        "unacceptable_windows_count": act_metrics.get("unacceptable_windows_count", 0),
        "peak_10min_activation_count": act_metrics.get("peak_10min_activation_count", 0),
        "peak_10min_window_start": act_metrics.get("peak_10min_window_start"),
        "peak_10min_window_end": act_metrics.get("peak_10min_window_end"),
    })

    # Log summary statistics
    total_sources = len(summary)
    total_alarms = summary["Unique_Alarms"].sum()
    
    logger.info(f"Results: {total_sources} sources, {total_alarms} unique alarms")
    logger.info(f"Overall KPIs: avg_ack={kpis['avg_ack_delay_min']:.2f}min, avg_ok={kpis['avg_ok_delay_min']:.2f}min, completion={kpis['completion_rate_pct']:.1f}%")
    logger.info(f"Frequency KPIs: avg_alarms_per_day={kpis['avg_alarms_per_day']:.2f}, days_over_288={kpis['days_over_288_alarms_pct']:.1f}%, days_unacceptable={kpis['days_unacceptable_pct']:.1f}%")
    logger.info(
        f"Activation Window KPIs: overload_pct={kpis['activation_time_in_overload_windows_pct']:.2f}%, "
        f"unacceptable_pct={kpis['activation_time_in_unacceptable_windows_pct']:.2f}%, "
        f"overall_health_pct={kpis['activation_overall_health_pct']:.2f}%"
    )
    
    # ========================================================================
    # PRE-COMPUTE ALARM SUMMARY VISUALIZATIONS (for instant frontend loading)
    # ========================================================================
    logger.info("Pre-computing alarm summary visualizations...")
    summary_start = datetime.now()
    
    # First, build exclusive category labels per activation
    classified_activations = compute_exclusive_categories_per_activation(
        df,
        stale_min=stale_min,
        chatter_min=chatter_min,
        unhealthy_threshold=unhealthy_threshold,
        window_minutes=window_minutes,
        flood_source_threshold=flood_source_threshold,
    )
    
    # 0. Prepare a no-system view of activations for strict include_system filtering
    def _is_system_cat(src: str) -> bool:
        s = str(src or "").strip().upper()
        return (s == "REPORT" or s.startswith("$") or s.startswith("ACTIVITY") or s.startswith("SYS_") or s.startswith("SYSTEM"))

    try:
        classified_no_system_for_cats = classified_activations[~classified_activations["Source"].apply(_is_system_cat)]
    except Exception:
        classified_no_system_for_cats = classified_activations

    # 1. Category Time Series (for CategoryTrendArea chart)
    # Compute all three grains for BOTH variants so they're cached
    category_series_daily_all = compute_category_time_series(classified_activations, grain="day")
    category_series_weekly_all = compute_category_time_series(classified_activations, grain="week")
    category_series_monthly_all = compute_category_time_series(classified_activations, grain="month")

    category_series_daily_no_sys = compute_category_time_series(classified_no_system_for_cats, grain="day")
    category_series_weekly_no_sys = compute_category_time_series(classified_no_system_for_cats, grain="week")
    category_series_monthly_no_sys = compute_category_time_series(classified_no_system_for_cats, grain="month")

    category_summary = {
        "daily": dataframe_to_json_records(category_series_daily_all),
        "weekly": dataframe_to_json_records(category_series_weekly_all),
        "monthly": dataframe_to_json_records(category_series_monthly_all),
    }
    category_summary_no_system = {
        "daily": dataframe_to_json_records(category_series_daily_no_sys),
        "weekly": dataframe_to_json_records(category_series_weekly_no_sys),
        "monthly": dataframe_to_json_records(category_series_monthly_no_sys),
    }

    # 2. Hourly Seasonality Matrix (for SeasonalityHeatmap chart)
    hourly_matrix_df_all = compute_hourly_seasonality_matrix(classified_activations)
    hourly_matrix = dataframe_to_json_records(hourly_matrix_df_all)

    hourly_matrix_df_no_sys = compute_hourly_seasonality_matrix(classified_no_system_for_cats)
    hourly_matrix_no_system = dataframe_to_json_records(hourly_matrix_df_no_sys)
    
    # 3. Sankey Composition (for CompositionSankey chart)
    #    Compute two variants: including system/meta sources (ALL) and excluding them (NO_SYSTEM)
    def _is_system(src: str) -> bool:
        s = str(src or "").strip().upper()
        return (s == "REPORT" or s.startswith("$") or s.startswith("ACTIVITY") or s.startswith("SYS_") or s.startswith("SYSTEM"))

    sankey_data = compute_category_sankey(classified_activations)
    try:
        classified_no_system = classified_activations[~classified_activations["Source"].apply(_is_system)]
    except Exception:
        classified_no_system = classified_activations
    sankey_data_no_system = compute_category_sankey(classified_no_system)
    
    summary_dur = (datetime.now() - summary_start).total_seconds()
    logger.info(f"Alarm summary visualizations pre-computed in {summary_dur:.2f}s")
    logger.info(f"  - Category series: {len(category_series_daily_all)} daily, {len(category_series_weekly_all)} weekly, {len(category_series_monthly_all)} monthly")
    logger.info(f"  - Hourly matrix: {len(hourly_matrix)} hour-dow cells")
    logger.info(f"  - Sankey: {len(sankey_data.get('nodes', []))} nodes, {len(sankey_data.get('edges', []))} edges")
    
    # Store CSV path info for cache functions
    # This will be used by write_cache to generate appropriate cache filename
    logger.info(f"Calculation complete. Returning results for {csv_info}")
    
    # Build per-source metadata from unique alarm starts
    from collections import Counter, defaultdict
    def _s(x):
        try:
            return str(x).strip()
        except Exception:
            return ""
    def _mode(vals: list[str]) -> str:
        v = [ _s(t) for t in vals if _s(t) ]
        return Counter(v).most_common(1)[0][0] if v else ""
    def _is_system(src: str) -> bool:
        s = (_s(src) or "").upper()
        return (s == "REPORT" or s.startswith("$") or s.startswith("ACTIVITY") or s.startswith("SYS_") or s.startswith("SYSTEM"))

    unique_samples: list[dict] = []
    for src, g in df.groupby("Source"):
        g = g.sort_values("Event Time")
        state = "IDLE"
        for _, row in g.iterrows():
            a = _s(row.get("Action"))
            if a == "" and state in ("IDLE", "ACKED"):
                unique_samples.append({
                    "source": src,
                    "event_time": row.get("Event Time"),
                    "location_tag": _s(row.get("Location Tag")),
                    "condition": _s(row.get("Condition")),
                    "priority": _s(row.get("Priority")),
                    "description": _s(row.get("Description")),
                    "units": _s(row.get("Units")),
                    "setpoint_value": _s(row.get("Value", row.get("Setpoint Value"))),
                })
                state = "ACTIVE"
            elif a == "ACK" and state == "ACTIVE":
                state = "ACKED"
            elif a == "OK" and state in ("ACTIVE", "ACKED"):
                state = "IDLE"

    by_src: dict[str, list[dict]] = defaultdict(list)
    for r in unique_samples:
        by_src[r["source"]].append(r)

    source_meta: Dict[str, Any] = {}
    for src, rows in by_src.items():
        conds = [ (_s(rr.get("condition")) or "NOT PROVIDED").upper() for rr in rows ]
        conditions_count = dict(Counter(conds))
        meta = {
            "location_tag": _mode([rr.get("location_tag", "") for rr in rows]) or "Unknown Location",
            "condition": _mode(conds) or "NOT PROVIDED",
            "priority": _mode([rr.get("priority", "") for rr in rows]),
            "description": _mode([rr.get("description", "") for rr in rows]),
            "units": _mode([rr.get("units", "") for rr in rows]),
            "setpoint_value": _mode([rr.get("setpoint_value", "") for rr in rows]),
            "conditions_count": conditions_count,
            "is_system": _is_system(src),
        }
        source_meta[src] = meta

    return (
        summary, 
        kpis, 
        cycles, 
        unhealthy_dict, 
        floods_dict, 
        bad_actors_dict, 
        frequency_dict, 
        source_meta,
        category_summary,              # Pre-computed category time series (ALL)
        hourly_matrix,                 # Pre-computed hourly seasonality (ALL)
        sankey_data,                   # Pre-computed sankey composition (ALL)
        category_summary_no_system,    # Pre-computed category time series (NO_SYSTEM)
        hourly_matrix_no_system,       # Pre-computed hourly seasonality (NO_SYSTEM)
        sankey_data_no_system,         # Pre-computed sankey composition (NO_SYSTEM)
    )


def run_actual_calc_with_cache(
    base_dir: str,
    alarm_data_dir: str,
    plant_id: str = None,
    use_cache: bool = True,
    force_refresh: bool = False,
    csv_relative_path: str = None,
    csv_file_name: str = None,
    **calc_params
) -> Dict[str, Any]:
    """Convenience function to run calculations with automatic cache management.
    
    This function:
    1. Checks if valid cache exists (unless force_refresh=True)
    2. Returns cached data if valid
    3. Otherwise runs calculation and writes cache
    4. Returns complete result dict ready for API responses
    
    Args:
        base_dir: Base directory (alarm_backend)
        alarm_data_dir: Path to ALARM_DATA_DIR
        plant_id: Optional plant identifier (e.g., "PVCI", "VCMA")
        use_cache: Whether to use cache at all (default True)
        force_refresh: Force recalculation even if cache exists (default False)
        csv_relative_path: Optional CSV folder path
        csv_file_name: Optional CSV filename
        **calc_params: Additional parameters passed to run_actual_calc()
                      (stale_min, chatter_min, unhealthy_threshold, etc.)
    
    Returns:
        Complete cache dict with all calculation results
        
    Example:
        # Use default CSV with cache
        result = run_actual_calc_with_cache(BASE_DIR, ALARM_DATA_DIR)
        
        # Custom CSV without cache
        result = run_actual_calc_with_cache(
            BASE_DIR,
            ALARM_DATA_DIR,
            use_cache=False,
            csv_relative_path="plant2/data",
            csv_file_name="merged.csv"
        )
    """
    # Build CSV path for metadata validation
    # Priority: explicit params > plant_id > defaults
    if plant_id and csv_relative_path is None and csv_file_name is None:
        csv_info = get_plant_csv_info(plant_id)
        if csv_info:
            rel_path = csv_info["csv_relative_path"]
            file_name = csv_info["csv_filename"]
        else:
            rel_path = DEFAULT_CSV_RELATIVE_PATH
            file_name = DEFAULT_CSV_FILE_NAME
    elif csv_relative_path is None and csv_file_name is None:
        rel_path = DEFAULT_CSV_RELATIVE_PATH
        file_name = DEFAULT_CSV_FILE_NAME
    else:
        rel_path = csv_relative_path or DEFAULT_CSV_RELATIVE_PATH
        file_name = csv_file_name or DEFAULT_CSV_FILE_NAME
    
    csv_path = os.path.join(alarm_data_dir, rel_path, file_name)
    
    # Build params dict for cache validation
    params = {
        "stale_min": calc_params.get("stale_min", 60),
        "chatter_min": calc_params.get("chatter_min", 10),
        "unhealthy_threshold": calc_params.get("unhealthy_threshold", UNHEALTHY_THRESHOLD),
        "window_minutes": calc_params.get("window_minutes", WINDOW_MINUTES),
        "flood_source_threshold": calc_params.get("flood_source_threshold", FLOOD_SOURCE_THRESHOLD),
        "iso_threshold": calc_params.get("iso_threshold", 288),
        "unacceptable_threshold": calc_params.get("unacceptable_threshold", 720),
        "act_window_overload_op": calc_params.get("act_window_overload_op", ACT_WINDOW_OVERLOAD_OP),
        "act_window_overload_threshold": calc_params.get("act_window_overload_threshold", ACT_WINDOW_OVERLOAD_THRESHOLD),
        "act_window_unacceptable_op": calc_params.get("act_window_unacceptable_op", ACT_WINDOW_UNACCEPTABLE_OP),
        "act_window_unacceptable_threshold": calc_params.get("act_window_unacceptable_threshold", ACT_WINDOW_UNACCEPTABLE_THRESHOLD),
    }
    
    # Try to read cache if enabled and not forcing refresh
    if use_cache and not force_refresh:
        cached = read_cache(
            base_dir,
            params,
            csv_path=csv_path,
            plant_id=plant_id,
            csv_relative_path=csv_relative_path,
            csv_file_name=csv_file_name
        )
        if cached:
            logger.info("Returning cached results")
            return cached
    
    # Run calculation
    logger.info("Running fresh calculation...")
    summary, kpis, cycles, unhealthy, floods, bad_actors, frequency, source_meta, category_summary, hourly_matrix, sankey_data, category_summary_no_system, hourly_matrix_no_system, sankey_data_no_system = run_actual_calc(
        alarm_data_dir,
        plant_id=plant_id,
        csv_relative_path=csv_relative_path,
        csv_file_name=csv_file_name,
        **calc_params
    )
    
    # Write cache if enabled
    if use_cache:
        write_cache(
            base_dir,
            summary,
            kpis,
            cycles,
            params,
            alarm_data_dir,
            plant_id=plant_id,
            csv_relative_path=csv_relative_path,
            csv_file_name=csv_file_name,
            unhealthy=unhealthy,
            floods=floods,
            bad_actors=bad_actors,
            frequency=frequency,
            source_meta=source_meta,
            category_summary=category_summary,
            category_summary_no_system=category_summary_no_system,
            hourly_matrix=hourly_matrix,
            hourly_matrix_no_system=hourly_matrix_no_system,
            sankey_data=sankey_data,
            sankey_data_no_system=sankey_data_no_system,
        )
        
        # Read back the cache to return complete structure
        cached = read_cache(
            base_dir,
            params,
            csv_path=csv_path,
            plant_id=plant_id,
            csv_relative_path=csv_relative_path,
            csv_file_name=csv_file_name
        )
        if cached:
            return cached
    
    # Fallback: build return dict manually (if cache write failed or disabled)
    return {
        "overall": kpis,
        "per_source": dataframe_to_json_records(summary),
        "cycles": dataframe_to_json_records(cycles),
        "unhealthy": unhealthy,
        "floods": floods,
        "bad_actors": bad_actors,
        "frequency": frequency,
        "params": params,
        "source_meta": source_meta,
        "alarm_summary": {
            "category_time_series": category_summary or {},
            "category_time_series_all": category_summary or {},
            "category_time_series_no_system": category_summary_no_system or {},
            "hourly_seasonality": hourly_matrix or [],
            "hourly_seasonality_all": hourly_matrix or [],
            "hourly_seasonality_no_system": hourly_matrix_no_system or [],
            "sankey_composition": sankey_data or {},
            "sankey_composition_all": sankey_data or {},
            "sankey_composition_no_system": sankey_data_no_system or {},
        },
    }


# ---------- ALARM SUMMARY: EXCLUSIVE CATEGORY CLASSIFICATION ----------

def compute_exclusive_categories_per_activation(
    df: pd.DataFrame,
    stale_min: int = 60,
    chatter_min: int = 10,
    unhealthy_threshold: int = 10,
    window_minutes: int = 10,
    flood_source_threshold: int = 2,
) -> pd.DataFrame:
    """
    Classify each unique alarm activation into mutually exclusive categories using precedence:
    Standing > Nuisance (Chattering, IF-Chattering) > Flood > Other
    
    Returns DataFrame with columns:
      - Source: alarm source
      - StartTime: activation timestamp
      - Category: one of "Standing", "Nuisance_Chattering", "Nuisance_IF_Chattering", "Flood", "Other"
      - duration_minutes: time standing if Standing category (else None)
      - chattering_episode: bool indicating if part of chattering episode
      - in_flood: bool indicating if activation occurred during a flood window
      
    NOTE: Assumes input DataFrame is already sorted by ['Source', 'Event Time']
    """
    df = df.copy()
    df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
    df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
    if "Condition" in df.columns:
        df["Condition"] = df["Condition"].fillna("").astype(str).str.upper().str.strip()
    
    # Step 1: Extract all unique activations with their metadata
    activations = []
    for src, group in df.groupby("Source"):
        state = "IDLE"
        active_start = None
        active_condition = ""
        alarm_times = []
        
        for _, row in group.iterrows():
            action = row["Action"]
            t = row["Event Time"]
            cond = row.get("Condition", "") if "Condition" in group.columns else ""
            
            if cond in ["CHANGE", "ONREQ.PV", "NORMAL", "ONREQ"]:
                continue
            
            # New activation
            if action == "" and state in ("IDLE", "ACKED"):
                activations.append({
                    "Source": src,
                    "StartTime": t,
                    "Condition": cond,
                })
                alarm_times.append(t)
                active_start = t
                active_condition = cond
                state = "ACTIVE"
            
            # ACK
            elif action == "ACK" and state == "ACTIVE":
                state = "ACKED"
            
            # OK (clear)
            elif action == "OK":
                state = "IDLE"
                active_start = None
                active_condition = ""
    
    activations_df = pd.DataFrame(activations)
    if activations_df.empty:
        return activations_df
    
    # Step 2: Identify Standing alarms (duration >= stale_min)
    standing_sources = set()
    standing_times = set()
    for src, group in df.groupby("Source"):
        state = "IDLE"
        active_start = None
        active_condition = ""
        standing_flag = False
        
        for _, row in group.iterrows():
            action = row["Action"]
            t = row["Event Time"]
            cond = row.get("Condition", "") if "Condition" in df.columns else ""
            
            # Skip non-alarm transitions (align with unique-alarms state machine)
            if cond in ["CHANGE", "ONREQ.PV", "NORMAL", "ONREQ"]:
                continue
            
            # New alarm
            if action == "" and state in ["IDLE", "ACKED"]:
                state = "ACTIVE"
                active_start = t
                active_condition = cond
                standing_flag = False
            
            # ACK
            elif action == "ACK" and state == "ACTIVE":
                state = "ACKED"
            
            # OK
            elif action == "OK" and state in ["ACTIVE", "ACKED"]:
                state = "IDLE"
                active_start = None
                standing_flag = False
            
            # Check standing
            if state == "ACTIVE" and active_start is not None and pd.notna(t):
                duration_min = (t - active_start).total_seconds() / 60.0
                if duration_min >= stale_min and not standing_flag:
                    standing_flag = True
                    standing_sources.add(src)
                    standing_times.add((src, active_start))
    
    # Step 3: Identify Chattering episodes (sliding window logic)
    chattering_sources_times = set()
    for src, group in activations_df[activations_df["Source"] == src].iterrows() if not activations_df.empty else []:
        pass  # We'll use the full activations_df approach below
    
    # Build chattering per source using deque
    from collections import deque
    for src, src_activations in activations_df.groupby("Source"):
        times = sorted(src_activations["StartTime"].tolist())
        dq = deque()
        in_chatter = False
        
        for t in times:
            # Evict old
            while dq and (t - dq[0]).total_seconds() / 60 > chatter_min:
                dq.popleft()
                if len(dq) < 3:  # CHATTER_MIN_COUNT = 3
                    in_chatter = False
            dq.append(t)
            
            # Mark if we hit threshold
            if not in_chatter and len(dq) >= 3:
                in_chatter = True
                # Mark all times in current window as chattering
                for time_in_window in dq:
                    chattering_sources_times.add((src, time_in_window))
            elif in_chatter:
                # Continue marking
                chattering_sources_times.add((src, t))
    
    # Step 4: Identify Flood windows (overlapping unhealthy from >= 2 sources)
    window = timedelta(minutes=window_minutes)
    unhealthy_periods = []
    for src, g in activations_df.groupby("Source"):
        times = g["StartTime"].sort_values().tolist()
        start = 0
        for end, t_end in enumerate(times):
            while times[start] < t_end - window:
                start += 1
            count = end - start + 1
            if count >= unhealthy_threshold:
                unhealthy_periods.append({
                    "Source": src,
                    "Window_Start": times[start],
                    "Window_End": t_end,
                    "Count": count,
                })
    
    unhealthy_df = pd.DataFrame(unhealthy_periods)
    flood_windows = []
    if not unhealthy_df.empty:
        # Merge same-source periods
        merged = []
        for src, g in unhealthy_df.groupby("Source"):
            g = g.sort_values("Window_Start")
            s = e = None
            for _, row in g.iterrows():
                if s is None:
                    s, e = row["Window_Start"], row["Window_End"]
                elif row["Window_Start"] <= e:
                    e = max(e, row["Window_End"])
                else:
                    merged.append({"Source": src, "Start": s, "End": e})
                    s, e = row["Window_Start"], row["Window_End"]
            if s is not None:
                merged.append({"Source": src, "Start": s, "End": e})
        merged_df = pd.DataFrame(merged)
        
        # Find overlapping periods (flood condition)
        for _, row in merged_df.iterrows():
            s1, e1 = row["Start"], row["End"]
            overlapping = merged_df[(merged_df["Start"] <= e1) & (merged_df["End"] >= s1)]
            sources = set(overlapping["Source"])
            if len(sources) >= flood_source_threshold:
                flood_windows.append({"Start": s1, "End": e1, "Sources": list(sources)})
        
        flood_windows = pd.DataFrame(flood_windows).drop_duplicates(subset=["Start", "End"]).to_dict(orient="records") if flood_windows else []
    
    # Build set of (source, time) that occurred in flood windows
    flood_activations = set()
    for fw in flood_windows:
        s_flood, e_flood = fw["Start"], fw["End"]
        involved = fw["Sources"]
        for _, act in activations_df[
            (activations_df["StartTime"] >= s_flood) &
            (activations_df["StartTime"] <= e_flood) &
            (activations_df["Source"].isin(involved))
        ].iterrows():
            flood_activations.add((act["Source"], act["StartTime"]))
    
    # Step 5: Classify each activation using precedence
    def classify_activation(row):
        src = row["Source"]
        t = row["StartTime"]
        cond = row.get("Condition", "")
        
        # Check Standing (highest precedence)
        if (src, t) in standing_times:
            # Distinguish Instrument Failure vs Stale
            if any(k in str(cond).upper() for k in INSTRUMENT_KEYWORDS):
                return "Standing_Instrument_Failure"
            else:
                return "Standing_Stale"
        
        # Check Nuisance (chattering)
        if (src, t) in chattering_sources_times:
            # Distinguish Instrument Failure (Chattering) vs regular Chattering
            if any(k in str(cond).upper() for k in INSTRUMENT_KEYWORDS):
                return "Nuisance_IF_Chattering"
            else:
                return "Nuisance_Chattering"
        
        # Check Flood
        if (src, t) in flood_activations:
            return "Flood"
        
        # Default: Other
        return "Other"
    
    activations_df["Category"] = activations_df.apply(classify_activation, axis=1)
    
    logger.info(
        f"Category classification complete: "
        f"{(activations_df['Category'] == 'Standing_Stale').sum() + (activations_df['Category'] == 'Standing_Instrument_Failure').sum()} Standing, "
        f"{(activations_df['Category'] == 'Nuisance_Chattering').sum() + (activations_df['Category'] == 'Nuisance_IF_Chattering').sum()} Nuisance, "
        f"{(activations_df['Category'] == 'Flood').sum()} Flood, "
        f"{(activations_df['Category'] == 'Other').sum()} Other"
    )
    
    return activations_df


def compute_category_time_series(
    activations_df: pd.DataFrame,
    grain: str = "day",
    start_date: pd.Timestamp = None,
    end_date: pd.Timestamp = None,
) -> pd.DataFrame:
    """
    Aggregate exclusive category counts by time grain (day, week, month).
    
    Args:
        activations_df: DataFrame from compute_exclusive_categories_per_activation
        grain: "day", "week", or "month"
        start_date: Optional start date to fill gaps (defaults to min StartTime)
        end_date: Optional end date to fill gaps (defaults to max StartTime)
    
    Returns:
        DataFrame with columns:
          - date: period start (yyyy-mm-dd for day, yyyy-Www for week, yyyy-mm for month)
          - total: total activations
          - standing_stale, standing_instrument_failure: standing sub-types
          - nuisance_chattering, nuisance_if_chattering: nuisance sub-types
          - flood, other: remaining categories
    """
    if activations_df.empty:
        return pd.DataFrame()
    
    df = activations_df.copy()
    df["StartTime"] = pd.to_datetime(df["StartTime"])
    
    # Determine period column based on grain
    if grain == "week":
        df["Period"] = df["StartTime"].dt.to_period("W").dt.start_time
    elif grain == "month":
        df["Period"] = df["StartTime"].dt.to_period("M").dt.start_time
    else:  # day
        df["Period"] = df["StartTime"].dt.date
        df["Period"] = pd.to_datetime(df["Period"])
    
    # Aggregate by Period and Category
    grouped = df.groupby(["Period", "Category"]).size().reset_index(name="Count")
    
    # Pivot to get categories as columns
    pivot = grouped.pivot(index="Period", columns="Category", values="Count").fillna(0).astype(int)
    
    # Ensure all category columns exist
    for cat in ["Standing_Stale", "Standing_Instrument_Failure", "Nuisance_Chattering", "Nuisance_IF_Chattering", "Flood", "Other"]:
        if cat not in pivot.columns:
            pivot[cat] = 0
    
    # Rename columns to match API contract (snake_case)
    pivot = pivot.rename(columns={
        "Standing_Stale": "standing_stale",
        "Standing_Instrument_Failure": "standing_instrument_failure",
        "Nuisance_Chattering": "nuisance_chattering",
        "Nuisance_IF_Chattering": "nuisance_if_chattering",
        "Flood": "flood",
        "Other": "other",
    })
    
    # Compute Standing and Nuisance totals
    pivot["standing"] = pivot["standing_stale"] + pivot["standing_instrument_failure"]
    pivot["nuisance"] = pivot["nuisance_chattering"] + pivot["nuisance_if_chattering"]
    
    # Total
    pivot["total"] = pivot[["standing", "nuisance", "flood", "other"]].sum(axis=1)
    
    # Fill gaps in date range if needed
    if start_date or end_date:
        start = start_date or df["StartTime"].min()
        end = end_date or df["StartTime"].max()
        if grain == "week":
            all_periods = pd.date_range(start=start, end=end, freq="W-MON")
        elif grain == "month":
            all_periods = pd.date_range(start=start, end=end, freq="MS")
        else:
            all_periods = pd.date_range(start=start, end=end, freq="D")
        
        pivot = pivot.reindex(all_periods, fill_value=0)
    
    # Reset index and format date
    pivot = pivot.reset_index()
    pivot = pivot.rename(columns={"Period": "date"})
    
    # Format date string based on grain
    if grain == "week":
        pivot["date"] = pivot["date"].dt.strftime("%Y-W%U")
    elif grain == "month":
        pivot["date"] = pivot["date"].dt.strftime("%Y-%m")
    else:
        pivot["date"] = pivot["date"].dt.strftime("%Y-%m-%d")
    
    # Select and order columns
    cols = [
        "date", "total", "standing", "standing_stale", "standing_instrument_failure",
        "nuisance", "nuisance_chattering", "nuisance_if_chattering", "flood", "other"
    ]
    result = pivot[[c for c in cols if c in pivot.columns]]
    
    return result


def compute_hourly_seasonality_matrix(activations_df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute average activations per hour-of-day × day-of-week for seasonality heatmap.
    
    Args:
        activations_df: DataFrame with StartTime column
    
    Returns:
        DataFrame with columns:
          - dow: day of week (0=Monday, 6=Sunday)
          - hour: hour of day (0-23)
          - avg_activations: average count across all weeks
    """
    if activations_df.empty:
        return pd.DataFrame(columns=["dow", "hour", "avg_activations"])
    
    df = activations_df.copy()
    df["StartTime"] = pd.to_datetime(df["StartTime"])
    df["DOW"] = df["StartTime"].dt.dayofweek  # 0=Monday
    df["Hour"] = df["StartTime"].dt.hour
    df["Week"] = df["StartTime"].dt.isocalendar().week
    df["Year"] = df["StartTime"].dt.year
    
    # Count activations per (Year, Week, DOW, Hour)
    grouped = df.groupby(["Year", "Week", "DOW", "Hour"]).size().reset_index(name="Count")
    
    # Average across weeks
    avg_by_dow_hour = grouped.groupby(["DOW", "Hour"])["Count"].mean().reset_index(name="avg_activations")
    
    # Ensure all 7×24 cells exist (fill missing with 0)
    all_combos = pd.MultiIndex.from_product([range(7), range(24)], names=["DOW", "Hour"])
    avg_by_dow_hour = avg_by_dow_hour.set_index(["DOW", "Hour"]).reindex(all_combos, fill_value=0.0).reset_index()
    
    # Rename DOW to dow, Hour to hour for API consistency
    avg_by_dow_hour = avg_by_dow_hour.rename(columns={"DOW": "dow", "Hour": "hour"})
    
    # Round to 2 decimals
    avg_by_dow_hour["avg_activations"] = avg_by_dow_hour["avg_activations"].round(2)
    
    return avg_by_dow_hour


def compute_category_sankey(activations_df: pd.DataFrame) -> Dict[str, Any]:
    """
    Generate Sankey diagram data (nodes and edges) for exclusive category flow visualization.
    
    Flow structure:
      Total → Standing/Nuisance/Flood/Other
      Standing → Standing_Stale / Standing_IF
      Nuisance → Nuisance_Chattering / Nuisance_IF_Chattering
    
    Args:
        activations_df: DataFrame from compute_exclusive_categories_per_activation (with Category column)
    
    Returns:
        Dict with:
          - nodes: list of node names
          - edges: list of {source, target, value} dicts
          - totals: dict with category counts
    """
    if activations_df.empty or "Category" not in activations_df.columns:
        return {
            "nodes": ["Total"],
            "edges": [],
            "totals": {"total": 0, "standing": 0, "nuisance": 0, "flood": 0, "other": 0},
        }
    
    # Count by category
    category_counts = activations_df["Category"].value_counts().to_dict()
    
    total = len(activations_df)
    standing_stale = category_counts.get("Standing_Stale", 0)
    standing_if = category_counts.get("Standing_Instrument_Failure", 0)
    nuisance_chat = category_counts.get("Nuisance_Chattering", 0)
    nuisance_if_chat = category_counts.get("Nuisance_IF_Chattering", 0)
    flood = category_counts.get("Flood", 0)
    other = category_counts.get("Other", 0)
    
    standing_total = standing_stale + standing_if
    nuisance_total = nuisance_chat + nuisance_if_chat
    
    # Build nodes list
    nodes = [
        "Total",
        "Standing",
        "Nuisance",
        "Flood",
        "Other",
        "Standing_Stale",
        "Standing_IF",
        "Nuisance_Chattering",
        "Nuisance_IF_Chattering",
    ]
    
    # Build edges (only include non-zero flows)
    edges = []
    
    # Level 1: Total → main categories
    if standing_total > 0:
        edges.append({"source": "Total", "target": "Standing", "value": standing_total})
    if nuisance_total > 0:
        edges.append({"source": "Total", "target": "Nuisance", "value": nuisance_total})
    if flood > 0:
        edges.append({"source": "Total", "target": "Flood", "value": flood})
    if other > 0:
        edges.append({"source": "Total", "target": "Other", "value": other})
    
    # Level 2: Standing sub-types
    if standing_stale > 0:
        edges.append({"source": "Standing", "target": "Standing_Stale", "value": standing_stale})
    if standing_if > 0:
        edges.append({"source": "Standing", "target": "Standing_IF", "value": standing_if})
    
    # Level 2: Nuisance sub-types
    if nuisance_chat > 0:
        edges.append({"source": "Nuisance", "target": "Nuisance_Chattering", "value": nuisance_chat})
    if nuisance_if_chat > 0:
        edges.append({"source": "Nuisance", "target": "Nuisance_IF_Chattering", "value": nuisance_if_chat})
    
    totals = {
        "total": total,
        "standing": standing_total,
        "standing_stale": standing_stale,
        "standing_if": standing_if,
        "nuisance": nuisance_total,
        "nuisance_chattering": nuisance_chat,
        "nuisance_if_chattering": nuisance_if_chat,
        "flood": flood,
        "other": other,
    }
    
    return {
        "nodes": nodes,
        "edges": edges,
        "totals": totals,
    }


# ---------- UTILITY: CONVERT TO JSON-SAFE TYPES ----------

def to_json_safe(obj: Any) -> Any:
    """Convert pandas/numpy types to JSON-safe Python types."""
    import numpy as np
    
    if isinstance(obj, (np.integer, np.floating)):
        return float(obj) if isinstance(obj, np.floating) else int(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif pd.isna(obj):
        return None
    elif isinstance(obj, (pd.Timestamp, datetime)):
        return obj.isoformat()
    else:
        return obj


def dataframe_to_json_records(df: pd.DataFrame) -> list:
    """Convert DataFrame to list of JSON-safe dicts."""
    records = df.to_dict(orient="records")
    
    # Convert numpy types to native Python types
    for record in records:
        for key, value in record.items():
            record[key] = to_json_safe(value)
    
    return records


def kpis_to_json_safe(kpis: Dict[str, Any]) -> Dict[str, Any]:
    """Convert KPIs dict to JSON-safe types."""
    return {k: to_json_safe(v) for k, v in kpis.items()}


# ---------- CACHE MANAGEMENT ----------

def generate_cache_identifier(csv_relative_path: str = None, csv_file_name: str = None) -> str:
    """Generate a unique cache identifier from CSV path components.
    
    Args:
        csv_relative_path: Relative path from alarm_data_dir to CSV folder
        csv_file_name: CSV filename
        
    Returns:
        Safe filename string for cache file (e.g., "All_Merged-actual-calc" or "VCMA-actual-calc")
    """
    import re
    
    # Use default CSV filename if not provided
    if csv_file_name is None:
        csv_file_name = DEFAULT_CSV_FILE_NAME
    
    # Extract filename without extension and sanitize it
    file_base = os.path.splitext(csv_file_name)[0]
    file_base_clean = re.sub(r'[^a-zA-Z0-9_-]', '_', file_base)
    
    # Return format: {csv_filename}-actual-calc
    # Examples: "All_Merged-actual-calc", "VCMA-actual-calc", "Plant2_Data-actual-calc"
    identifier = f"{file_base_clean}-actual-calc"
    return identifier


def get_cache_path(
    base_dir: str,
    plant_id: str = None,
    csv_relative_path: str = None,
    csv_file_name: str = None
) -> str:
    """Get the path to the cache JSON file for a specific CSV.
    
    Args:
        base_dir: Base directory (alarm_backend)
        plant_id: Optional plant identifier
        csv_relative_path: Optional CSV folder path
        csv_file_name: Optional CSV filename
        
    Returns:
        Full path to cache JSON file
    """
    cache_dir = os.path.join(base_dir, "PVCI-actual-calc")
    os.makedirs(cache_dir, exist_ok=True)
    
    # Use plant_id to generate cache identifier if available
    if plant_id:
        csv_info = get_plant_csv_info(plant_id)
        if csv_info:
            cache_identifier = generate_cache_identifier(None, csv_info["csv_filename"])
        else:
            cache_identifier = generate_cache_identifier(csv_relative_path, csv_file_name)
    else:
        cache_identifier = generate_cache_identifier(csv_relative_path, csv_file_name)
    
    cache_filename = f"{cache_identifier}.json"
    
    return os.path.join(cache_dir, cache_filename)


def read_cache(
    base_dir: str,
    params: Dict[str, Any],
    csv_path: str = None,
    plant_id: str = None,
    csv_relative_path: str = None,
    csv_file_name: str = None
) -> Dict[str, Any] | None:
    """Read cached calculation results if they match current parameters and CSV metadata.
    
    Args:
        base_dir: Base directory (alarm_backend)
        params: Dict with calculation parameters
        csv_path: Full path to CSV file (for metadata validation)
        plant_id: Optional plant identifier
        csv_relative_path: Relative CSV folder path
        csv_file_name: CSV filename
        
    Returns:
        Cached data dict if valid, None otherwise
    """
    cache_path = get_cache_path(base_dir, plant_id, csv_relative_path, csv_file_name)
    
    if not os.path.exists(cache_path):
        logger.info("No cache file found")
        return None
    
    try:
        import json
        with open(cache_path, 'r', encoding='utf-8') as f:
            cached_data = json.load(f)
        
        cached_params = cached_data.get("params", {})

        # Build the effective-current params including centralized activation/flood thresholds
        current_params = {
            "stale_min": STALE_THRESHOLD_MIN,
            "chatter_min": CHATTER_THRESHOLD_MIN,
            "unhealthy_threshold": UNHEALTHY_THRESHOLD,
            "window_minutes": WINDOW_MINUTES,
            "flood_source_threshold": FLOOD_SOURCE_THRESHOLD,
            "act_window_overload_op": ACT_WINDOW_OVERLOAD_OP,
            "act_window_overload_threshold": ACT_WINDOW_OVERLOAD_THRESHOLD,
            "act_window_unacceptable_op": ACT_WINDOW_UNACCEPTABLE_OP,
            "act_window_unacceptable_threshold": ACT_WINDOW_UNACCEPTABLE_THRESHOLD,
        }
        # Overlay any explicit caller-provided params on top of current
        effective_requested = {**current_params, **(params or {})}

        # Backward-compatible param matching:
        # Only enforce equality for keys that exist in the cached params.
        # This allows older caches (without newer keys like iso/unacceptable thresholds)
        # to still be considered valid if all overlapping keys match.
        def _param_equal(k: str, v: Any) -> bool:
            if k not in cached_params:
                return True
            return cached_params.get(k) == v

        params_match = all(_param_equal(k, v) for k, v in effective_requested.items())
        
        # Validate CSV metadata if csv_path provided
        csv_metadata_match = True
        if csv_path and os.path.exists(csv_path):
            cached_csv_meta = cached_data.get("csv_metadata", {})
            current_size = os.path.getsize(csv_path)
            current_mtime = os.path.getmtime(csv_path)
            
            if cached_csv_meta.get("size") != current_size:
                logger.info(f"Cache invalid: CSV size changed ({cached_csv_meta.get('size')} -> {current_size})")
                csv_metadata_match = False
            elif abs(cached_csv_meta.get("mtime", 0) - current_mtime) > 1:  # Allow 1 second tolerance
                logger.info(f"Cache invalid: CSV modified time changed")
                csv_metadata_match = False
        
        if params_match and csv_metadata_match:
            logger.info(f"✓ Cache hit with matching params and CSV metadata")
            return cached_data
        
        if not params_match:
            logger.info(f"Cache params mismatch. Cached: {cached_params}, Requested: {effective_requested}")
        return None
            
    except Exception as e:
        logger.warning(f"Failed to read cache: {str(e)}")
        return None


def write_cache(
    base_dir: str,
    summary_df: pd.DataFrame,
    kpis: Dict[str, Any],
    cycles_df: pd.DataFrame,
    params: Dict[str, Any],
    alarm_data_dir: str,
    plant_id: str = None,
    csv_relative_path: str = None,
    csv_file_name: str = None,
    unhealthy: Dict[str, Any] | None = None,
    floods: Dict[str, Any] | None = None,
    bad_actors: Dict[str, Any] | None = None,
    frequency: Dict[str, Any] | None = None,
    source_meta: Dict[str, Any] | None = None,
    category_summary: Dict[str, Any] | None = None,
    category_summary_no_system: Dict[str, Any] | None = None,
    hourly_matrix: list | None = None,
    hourly_matrix_no_system: list | None = None,
    sankey_data: Dict[str, Any] | None = None,
    sankey_data_no_system: Dict[str, Any] | None = None,
) -> None:
    """Write calculation results to cache JSON with CSV metadata.
    
    Args:
        base_dir: Base directory (alarm_backend)
        summary_df: Per-source summary DataFrame
        kpis: Overall KPIs dict
        cycles_df: Alarm cycles DataFrame
        params: Calculation parameters
        alarm_data_dir: Path to ALARM_DATA_DIR
        plant_id: Optional plant identifier
        csv_relative_path: Relative CSV folder path
        csv_file_name: CSV filename
        unhealthy: Optional unhealthy periods dictionary (from detect_unhealthy_and_flood)
        floods: Optional floods windows dictionary (from detect_unhealthy_and_flood)
        bad_actors: Optional bad actors dictionary (from identify_bad_actors)
        frequency: Optional frequency metrics dictionary (from calculate_alarm_frequency_metrics)
    """
    cache_path = get_cache_path(base_dir, plant_id, csv_relative_path, csv_file_name)
    
    try:
        import json
        
        # Convert DataFrames to JSON-safe records
        per_source_records = dataframe_to_json_records(summary_df)
        cycles_records = dataframe_to_json_records(cycles_df)
        json_safe_kpis = kpis_to_json_safe(kpis)
        
        # Extract time range and metadata from source CSV
        # Build CSV path - priority: explicit params > plant_id > defaults
        if plant_id and csv_relative_path is None and csv_file_name is None:
            csv_info = get_plant_csv_info(plant_id)
            if csv_info:
                csv_relative_path = csv_info["csv_relative_path"]
                csv_file_name = csv_info["csv_filename"]
            else:
                csv_relative_path = DEFAULT_CSV_RELATIVE_PATH
                csv_file_name = DEFAULT_CSV_FILE_NAME
        elif csv_relative_path is None and csv_file_name is None:
            csv_relative_path = DEFAULT_CSV_RELATIVE_PATH
            csv_file_name = DEFAULT_CSV_FILE_NAME
        elif csv_file_name is None:
            csv_file_name = DEFAULT_CSV_FILE_NAME
        elif csv_relative_path is None:
            csv_relative_path = DEFAULT_CSV_RELATIVE_PATH
        
        csv_path = os.path.join(alarm_data_dir, csv_relative_path, csv_file_name)
        
        # Extract time range
        try:
            df_sample = pd.read_csv(csv_path, usecols=["Event Time"], parse_dates=["Event Time"])
            time_min = df_sample["Event Time"].min()
            time_max = df_sample["Event Time"].max()
            sample_range = {
                "start": time_min.isoformat() if pd.notna(time_min) else None,
                "end": time_max.isoformat() if pd.notna(time_max) else None
            }
        except Exception:
            sample_range = {"start": None, "end": None}
        
        # Store CSV metadata for cache validation
        csv_metadata = {
            "csv_relative_path": csv_relative_path,
            "csv_file_name": csv_file_name,
            "csv_full_path": csv_path,
        }
        if os.path.exists(csv_path):
            csv_metadata["size"] = os.path.getsize(csv_path)
            csv_metadata["mtime"] = os.path.getmtime(csv_path)
        
        # Get plant name from registry or use default
        plant_info = get_plant_info(plant_id) if plant_id else None
        plant_name = plant_info["display_name"] if plant_info else "PVC-I"
        
        # Build cache structure
        cache_data = {
            "plant_id": plant_id or "PVCI",
            "plant_folder": plant_name,
            "mode": "actual-calc",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "params": params,
            "csv_metadata": csv_metadata,
            "overall": json_safe_kpis,
            "per_source": per_source_records,
            "cycles": cycles_records,
            "counts": {
                "total_sources": len(summary_df),
                "total_alarms": int(summary_df.get("Unique_Alarms", pd.Series(dtype=int)).sum() if not summary_df.empty else 0),
                "total_standing": int(summary_df["Standing_Alarms"].sum()) if "Standing_Alarms" in summary_df.columns else 0,
                "total_stale": int(summary_df["Stale_Alarms"].sum()) if "Stale_Alarms" in summary_df.columns else 0,
                "total_instrument_failure": int(summary_df["Instrument_Failure"].sum()) if "Instrument_Failure" in summary_df.columns else 0,
                "total_repeating": int(summary_df["Repeating_Alarms"].sum()) if "Repeating_Alarms" in summary_df.columns else 0,
                "total_chattering": int(summary_df["Chattering_Count"].sum()) if "Chattering_Count" in summary_df.columns else 0,
                "total_instrument_failure_chattering": int(summary_df["Instrument_Failure_Chattering"].sum()) if "Instrument_Failure_Chattering" in summary_df.columns else 0,
                "total_cycles": len(cycles_df),
            },
            "sample_range": sample_range,
            "_version": "1.2"
        }

        # Attach unhealthy & floods & bad_actors & frequency if provided
        if isinstance(unhealthy, dict):
            cache_data["unhealthy"] = unhealthy
            try:
                cache_data["counts"]["total_unhealthy_periods"] = int(unhealthy.get("total_periods") or 0)
            except Exception:
                cache_data["counts"]["total_unhealthy_periods"] = 0
        if isinstance(floods, dict):
            cache_data["floods"] = floods
            try:
                cache_data["counts"]["total_flood_windows"] = int((floods.get("totals") or {}).get("total_windows") or 0)
                cache_data["counts"]["total_flood_count"] = int((floods.get("totals") or {}).get("total_flood_count") or 0)
            except Exception:
                cache_data["counts"].setdefault("total_flood_windows", 0)
                cache_data["counts"].setdefault("total_flood_count", 0)
        if isinstance(bad_actors, dict):
            cache_data["bad_actors"] = bad_actors
            try:
                cache_data["counts"]["total_bad_actors"] = int(bad_actors.get("total_actors") or 0)
            except Exception:
                cache_data["counts"]["total_bad_actors"] = 0
        if isinstance(frequency, dict):
            cache_data["frequency"] = frequency
        if isinstance(source_meta, dict):
            cache_data["source_meta"] = source_meta
        
        # Attach pre-computed summary visualizations (NEW - for instant loading)
        if isinstance(category_summary, dict):
            cache_data["alarm_summary"] = cache_data.get("alarm_summary", {})
            cache_data["alarm_summary"]["category_time_series"] = category_summary
            cache_data["alarm_summary"]["category_time_series_all"] = category_summary
            logger.info("Added category time series to cache (daily/weekly/monthly)")
        if isinstance(category_summary_no_system, dict):
            cache_data["alarm_summary"] = cache_data.get("alarm_summary", {})
            cache_data["alarm_summary"]["category_time_series_no_system"] = category_summary_no_system
        if isinstance(hourly_matrix, list):
            cache_data["alarm_summary"] = cache_data.get("alarm_summary", {})
            cache_data["alarm_summary"]["hourly_seasonality"] = hourly_matrix
            cache_data["alarm_summary"]["hourly_seasonality_all"] = hourly_matrix
            logger.info(f"Added hourly seasonality matrix to cache ({len(hourly_matrix)} cells)")
        if isinstance(hourly_matrix_no_system, list):
            cache_data["alarm_summary"] = cache_data.get("alarm_summary", {})
            cache_data["alarm_summary"]["hourly_seasonality_no_system"] = hourly_matrix_no_system
        if isinstance(sankey_data, dict):
            cache_data["alarm_summary"] = cache_data.get("alarm_summary", {})
            cache_data["alarm_summary"]["sankey_composition"] = sankey_data
            cache_data["alarm_summary"]["sankey_composition_all"] = sankey_data
            logger.info(f"Added sankey composition to cache ({len(sankey_data.get('nodes', []))} nodes)")

        if isinstance(sankey_data_no_system, dict):
            cache_data["alarm_summary"] = cache_data.get("alarm_summary", {})
            cache_data["alarm_summary"]["sankey_composition_no_system"] = sankey_data_no_system
            logger.info(f"Added no-system sankey composition to cache ({len(sankey_data_no_system.get('nodes', []))} nodes)")
            
            # Add activation-based counts for consistency with charts
            # These counts are per-activation (more accurate for alarm management)
            totals = sankey_data.get("totals", {})
            if totals:
                cache_data["counts"]["activation_based"] = {
                    "total_activations": int(totals.get("total", 0)),
                    "total_standing": int(totals.get("standing", 0)),
                    "total_standing_stale": int(totals.get("standing_stale", 0)),
                    "total_standing_if": int(totals.get("standing_if", 0)),
                    "total_nuisance": int(totals.get("nuisance", 0)),
                    "total_nuisance_chattering": int(totals.get("nuisance_chattering", 0)),
                    "total_nuisance_if_chattering": int(totals.get("nuisance_if_chattering", 0)),
                    "total_flood": int(totals.get("flood", 0)),
                    "total_other": int(totals.get("other", 0)),
                }
                logger.info(f"Added activation-based counts to cache: {cache_data['counts']['activation_based']['total_activations']} activations")
        
        # Write atomically (write to temp, then rename)
        temp_path = cache_path + ".tmp"
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, indent=2, default=str)
        
        # Atomic rename
        if os.path.exists(cache_path):
            os.remove(cache_path)
        os.rename(temp_path, cache_path)
        
        logger.info(f"Cache written successfully to {cache_path}")
        logger.info(f"Cache size: {os.path.getsize(cache_path) / 1024 / 1024:.2f} MB")
        
    except Exception as e:
        logger.error(f"Failed to write cache: {str(e)}")
        # Non-fatal: continue without cache
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


# ---------- CLI ENTRYPOINT ----------

def _default_base_dir() -> str:
    """Get default base directory (parent of this file's directory)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _default_alarm_data_dir(base_dir: str) -> str:
    """Get default alarm data directory."""
    return os.path.join(base_dir, "ALARM_DATA_DIR")


def main() -> None:
    """Command-line entrypoint to run calculations and print/save results."""
    parser = argparse.ArgumentParser(description="Run PVCI actual calculations on a CSV file.")
    parser.add_argument("--alarm-data-dir", dest="alarm_data_dir", default=None, 
                        help="Base directory that contains the CSV relative path (defaults to base_dir)")
    parser.add_argument("--csv-rel", dest="csv_rel", default=None, 
                        help=f"Relative CSV folder (default: {DEFAULT_CSV_RELATIVE_PATH})")
    parser.add_argument("--csv-file", dest="csv_file", default=None, 
                        help=f"CSV filename (default: {DEFAULT_CSV_FILE_NAME})")
    parser.add_argument("--no-cache", dest="use_cache", action="store_false", 
                        help="Disable cache usage")
    parser.add_argument("--force-refresh", dest="force_refresh", action="store_true", 
                        help="Force recalculation even if cache exists")
    parser.add_argument("--save", dest="save_path", default=None, 
                        help="Optional path to save full results JSON")
    parser.add_argument("--log-level", dest="log_level", default="INFO", 
                        help="Logging level (DEBUG, INFO, WARNING, ERROR)")

    args = parser.parse_args()

    # Configure logging for CLI
    logging.basicConfig(
        level=getattr(logging, str(args.log_level).upper(), logging.INFO), 
        format="%(levelname)s: %(message)s"
    )

    base_dir = _default_base_dir()
    alarm_data_dir = args.alarm_data_dir or _default_alarm_data_dir(base_dir)

    # Run with cache helper
    try:
        result = run_actual_calc_with_cache(
            base_dir=base_dir,
            alarm_data_dir=alarm_data_dir,
            use_cache=args.use_cache,
            force_refresh=args.force_refresh,
            csv_relative_path=args.csv_rel,
            csv_file_name=args.csv_file,
        )
    except Exception as e:
        logger.error(f"Calculation failed: {e}")
        raise

    # Print a concise summary to stdout
    overall = result.get("overall", {})
    per_source = result.get("per_source", [])
    counts = result.get("counts") or {}

    try:
        total_sources = counts.get("total_sources") if counts else (len(per_source) if per_source else None)
        total_unique_alarms = overall.get("total_unique_alarms") or overall.get("total_alarms")
        avg_per_day = overall.get("avg_alarms_per_day")
        print("\n=== PVCI Actual Calc Summary ===")
        if total_sources is not None:
            print(f"Sources: {total_sources}")
        if total_unique_alarms is not None:
            print(f"Total unique alarms: {total_unique_alarms}")
        if avg_per_day is not None:
            print(f"Avg alarms/day (activations): {avg_per_day:.2f}")
        if overall.get("activation_overall_health_pct") is not None:
            print(f"Activation Overall Health: {overall['activation_overall_health_pct']:.2f}%")
        print("================================\n")
    except Exception:
        # Avoid failing CLI on formatting issues
        pass

    # Optionally save full results
    if args.save_path:
        try:
            with open(args.save_path, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2)
            print(f"Saved results to {args.save_path}")
        except Exception as e:
            logger.error(f"Failed to save results: {e}")


if __name__ == "__main__":
    main()
