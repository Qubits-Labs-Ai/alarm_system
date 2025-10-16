"""
PVCI Actual Calculation Service
Computes alarm management KPIs from merged PVCI alarm data.
Logic ported from Data_Calculations.ipynb with exact preservation of calculation methods.
"""

import pandas as pd
import os
import logging
from datetime import datetime
from typing import Tuple, Dict, Any
from collections import deque

logger = logging.getLogger(__name__)

# Default thresholds (can be overridden via parameters)
STALE_THRESHOLD_MIN = 60  # minutes until an active alarm is considered standing/stale classification point
CHATTER_THRESHOLD_MIN = 10  # window size in minutes for chattering detection
CHATTER_MIN_COUNT = 3       # minimum alarms within window to declare chattering
INSTRUMENT_KEYWORDS = ["FAIL", "BAD"]


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
    """
    df = df.copy()
    df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
    df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
    if "Condition" in df.columns:
        df["Condition"] = df["Condition"].fillna("").astype(str).str.upper().str.strip()
    df = df.sort_values(["Source", "Event Time"])

    rows = []
    for src, group in df.groupby("Source"):
        state = "IDLE"
        alarm_times: list[pd.Timestamp] = []
        cond_texts: list[str] = []

        for _, row in group.iterrows():
            action = row["Action"]
            t = row["Event Time"]
            cond = row.get("Condition", "") if "Condition" in group.columns else ""

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
    """
    df = df.copy()
    df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
    df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
    if "Condition" in df.columns:
        df["Condition"] = df["Condition"].fillna("").astype(str).str.upper().str.strip()
    df = df.sort_values(["Source", "Event Time"]) 

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
    
    Returns:
        summary (DataFrame): Per-source metrics (Unique_Alarms, Standing_Alarms, Stale_Alarms, Instrument_Failure, [optional] Chattering_Count)
        kpis (dict): Overall plant KPIs
        cycles (DataFrame): Alarm lifecycle cycles with delays
    """
    df = df.copy()
    df["Event Time"] = pd.to_datetime(df["Event Time"])
    df = df.sort_values(["Source", "Event Time"])

    # Prepare and clean alarm event data
    df = df.copy()
    df['Event Time'] = pd.to_datetime(df['Event Time'], errors='coerce')
    df['Action'] = df['Action'].astype(str).str.upper().str.strip().replace({'nan': ''})
    if 'Condition' in df.columns:
        df['Condition'] = df['Condition'].astype(str).str.upper().str.strip().replace({'nan': ''})
    df = df.sort_values(["Source", "Event Time"])

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

    # Temporal KPIs
    df["Date"] = df["Event Time"].dt.date
    per_day = df.groupby("Date").size()
    hrs = (df["Event Time"].max() - df["Event Time"].min()).total_seconds() / 3600
    avg_day = per_day.mean()
    avg_hr = len(df) / hrs if hrs else 0
    avg_10m = avg_hr / 6
    overlimit_pct = (per_day > 288).mean() * 100

    # Merge per-source summary
    summary = basic.merge(rep_chat, on="Source", how="left") if isinstance(rep_chat, pd.DataFrame) else basic
    summary = summary.fillna({"Chattering_Count": 0, "Repeating_Alarms": 0, "Instrument_Failure_Chattering": 0})
    
    # Overall KPIs
    kpis = dict(
        avg_ack_delay_min=avg_ack,
        avg_ok_delay_min=avg_ok,
        completion_rate_pct=completion,
        avg_alarms_per_day=avg_day,
        avg_alarms_per_hour=avg_hr,
        avg_alarms_per_10min=avg_10m,
        days_over_288_alarms_pct=overlimit_pct,
    )
    return summary, kpis, cycles


# ---------- DATA LOADING ----------

def load_pvci_merged_csv(alarm_data_dir: str) -> pd.DataFrame:
    """Load the merged PVCI CSV file.
    
    Args:
        alarm_data_dir: Path to ALARM_DATA_DIR
        
    Returns:
        DataFrame with parsed Event Time and cleaned Action column
        
    Raises:
        FileNotFoundError: If merged CSV doesn't exist
        ValueError: If CSV is empty or malformed
    """
    csv_path = os.path.join(alarm_data_dir, "PVCI-merged", "All_Merged.csv")
    
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Merged CSV not found at {csv_path}")
    
    logger.info(f"Loading merged CSV from {csv_path}")
    
    try:
        df = pd.read_csv(csv_path)
        
        if df.empty:
            raise ValueError("Merged CSV is empty")
        
        # Parse Event Time
        df["Event Time"] = pd.to_datetime(df["Event Time"], errors='coerce')
        
        # Clean Action column
        df['Action'] = df['Action'].astype(str).str.strip().replace({'nan': ''})
        
        # Drop rows with invalid Event Time or missing Source
        initial_rows = len(df)
        df = df.dropna(subset=['Event Time', 'Source'])
        dropped = initial_rows - len(df)
        
        if dropped > 0:
            logger.warning(f"Dropped {dropped} rows with invalid Event Time or missing Source")
        
        logger.info(f"Loaded {len(df)} alarm events from {df['Source'].nunique()} sources")
        logger.info(f"Time range: {df['Event Time'].min()} to {df['Event Time'].max()}")
        
        return df
        
    except Exception as e:
        logger.error(f"Failed to load merged CSV: {str(e)}")
        raise


# ---------- MAIN COMPUTATION WRAPPER ----------

def run_actual_calc(
    alarm_data_dir: str,
    stale_min: int = 60,
    chatter_min: int = 10
) -> Tuple[pd.DataFrame, Dict[str, Any], pd.DataFrame]:
    """Run actual calculation with specified thresholds.
    
    Args:
        alarm_data_dir: Path to ALARM_DATA_DIR
        stale_min: Standing/stale threshold in minutes (default 60)
        chatter_min: Chattering alarm threshold in minutes (default 10)
        
    Returns:
        Tuple of (summary_df, kpis_dict, cycles_df)
    """
    global STALE_THRESHOLD_MIN, CHATTER_THRESHOLD_MIN
    
    # Update thresholds
    STALE_THRESHOLD_MIN = stale_min
    CHATTER_THRESHOLD_MIN = chatter_min
    
    logger.info(f"Running actual calculation with stale_min={stale_min}, chatter_min={chatter_min}")
    
    # Load data
    start_time = datetime.now()
    df = load_pvci_merged_csv(alarm_data_dir)
    load_duration = (datetime.now() - start_time).total_seconds()
    logger.info(f"Data loaded in {load_duration:.2f}s")
    
    # Calculate KPIs
    calc_start = datetime.now()
    summary, kpis, cycles = calculate_alarm_kpis(df)
    calc_duration = (datetime.now() - calc_start).total_seconds()
    logger.info(f"KPIs calculated in {calc_duration:.2f}s")
    
    # Log summary statistics
    total_sources = len(summary)
    total_alarms = summary["Unique_Alarms"].sum()
    
    logger.info(f"Results: {total_sources} sources, {total_alarms} unique alarms")
    logger.info(f"Overall KPIs: avg_ack={kpis['avg_ack_delay_min']:.2f}min, "
                f"avg_ok={kpis['avg_ok_delay_min']:.2f}min, "
                f"completion={kpis['completion_rate_pct']:.1f}%")
    
    return summary, kpis, cycles


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

def get_cache_path(base_dir: str) -> str:
    """Get the path to the actual-calc cache JSON file."""
    cache_dir = os.path.join(base_dir, "PVCI-actual-calc")
    os.makedirs(cache_dir, exist_ok=True)
    return os.path.join(cache_dir, "actual-calc.json")


def read_cache(base_dir: str, params: Dict[str, Any]) -> Dict[str, Any] | None:
    """Read cached calculation results if they match current parameters.
    
    Args:
        base_dir: Base directory (alarm_backend)
        params: Dict with stale_min, chatter_min
        
    Returns:
        Cached data dict if valid, None otherwise
    """
    cache_path = get_cache_path(base_dir)
    
    if not os.path.exists(cache_path):
        logger.info("No cache file found")
        return None
    
    try:
        import json
        with open(cache_path, 'r', encoding='utf-8') as f:
            cached_data = json.load(f)
        
        # Validate params match
        cached_params = cached_data.get("params", {})
        if (
            cached_params.get("stale_min") == params.get("stale_min")
            and cached_params.get("chatter_min") == params.get("chatter_min")
        ):
            logger.info(f"Cache hit with matching params: {params}")
            return cached_data
        else:
            logger.info(f"Cache params mismatch. Cached: {cached_params}, Requested: {params}")
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
    alarm_data_dir: str
) -> None:
    """Write calculation results to cache JSON.
    
    Args:
        base_dir: Base directory (alarm_backend)
        summary_df: Per-source summary DataFrame
        kpis: Overall KPIs dict
        cycles_df: Alarm cycles DataFrame
        params: Calculation parameters
        alarm_data_dir: Path to ALARM_DATA_DIR for metadata
    """
    cache_path = get_cache_path(base_dir)
    
    try:
        import json
        
        # Convert DataFrames to JSON-safe records
        per_source_records = dataframe_to_json_records(summary_df)
        cycles_records = dataframe_to_json_records(cycles_df)
        json_safe_kpis = kpis_to_json_safe(kpis)
        
        # Extract time range from source CSV
        csv_path = os.path.join(alarm_data_dir, "PVCI-merged", "All_Merged.csv")
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
        
        # Build cache structure
        cache_data = {
            "plant_folder": "PVC-I",
            "mode": "actual-calc",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "params": params,
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
                "total_cycles": len(cycles_df)
            },
            "sample_range": sample_range,
            "_version": "1.0"
        }
        
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
