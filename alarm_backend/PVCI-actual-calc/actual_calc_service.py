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

logger = logging.getLogger(__name__)

# Default thresholds (can be overridden via parameters)
STALE_THRESHOLD_MIN = 60
CHATTER_THRESHOLD_MIN = 10


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


def detect_stale_chatter(group):
    """Detect stale and chattering alarms within a source group.
    
    Stale: alarms with no action for > STALE_THRESHOLD_MIN
    Chattering: > CHATTER_THRESHOLD_MIN alarms within CHATTER_THRESHOLD_MIN window
    """
    group = group.sort_values("Event Time")
    stale_flags = []
    chatter_flags = []

    last_alarm_time = None
    recent_alarms = []

    for i, row in group.iterrows():
        t = row["Event Time"]
        action = row["Action"]

        # Detect stale alarms
        if action == "ALARM":
            if last_alarm_time is None:
                stale_flags.append(False)
            else:
                stale_flags.append((t - last_alarm_time).total_seconds() / 60 > STALE_THRESHOLD_MIN)
            last_alarm_time = t
        elif action == "ACK":
            stale_flags.append(False)
        else:
            stale_flags.append(False)

        # Detect chattering (too many alarms in a short time)
        recent_alarms = [x for x in recent_alarms if (t - x).total_seconds() / 60 <= CHATTER_THRESHOLD_MIN]
        recent_alarms.append(t)
        chatter_flags.append(len(recent_alarms) > CHATTER_THRESHOLD_MIN)

    group["is_stale"] = stale_flags
    group["is_chattering"] = chatter_flags
    return group


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
        summary (DataFrame): Per-source metrics (Unique_Alarms, Stale_Count, Chattering_Count)
        kpis (dict): Overall plant KPIs
        cycles (DataFrame): Alarm lifecycle cycles with delays
    """
    df = df.copy()
    df["Event Time"] = pd.to_datetime(df["Event Time"])
    df = df.sort_values(["Source", "Event Time"])

    # Prepare and clean alarm event data
    df = df.copy()
    df['Event Time'] = pd.to_datetime(df['Event Time'], errors='coerce')
    df['Action'] = df['Action'].astype(str).str.strip().replace({'nan': ''})
    df = df.sort_values(["Source", "Event Time"])

    # Per-source metrics
    unique = df.groupby("Source").apply(count_unique_alarms).reset_index(name="Unique_Alarms")
    analyzed = df.groupby("Source", group_keys=False).apply(detect_stale_chatter)
    stale = analyzed.groupby("Source")["is_stale"].sum().reset_index(name="Stale_Count")
    chat = analyzed.groupby("Source")["is_chattering"].sum().reset_index(name="Chattering_Count")

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
    summary = unique.merge(stale, on="Source", how="outer").merge(chat, on="Source", how="outer").fillna(0)
    
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
        stale_min: Stale alarm threshold in minutes (default 60)
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
    total_stale = summary["Stale_Count"].sum()
    total_chatter = summary["Chattering_Count"].sum()
    
    logger.info(f"Results: {total_sources} sources, {total_alarms} unique alarms, "
                f"{total_stale} stale, {total_chatter} chattering")
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
                "total_alarms": int(summary_df["Unique_Alarms"].sum()),
                "total_stale": int(summary_df["Stale_Count"].sum()),
                "total_chattering": int(summary_df["Chattering_Count"].sum()),
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
