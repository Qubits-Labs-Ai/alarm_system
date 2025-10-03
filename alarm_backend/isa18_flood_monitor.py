from __future__ import annotations

import os
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta, timezone
from collections import deque
import logging

import pandas as pd
import fnmatch

# Reuse the robust CSV reader and defaults from the existing engine
from pvcI_health_monitor import read_csv_smart, DEFAULT_CONFIG

logger = logging.getLogger(__name__)


def _list_csv_files(folder_path: str) -> List[str]:
    try:
        entries = [
            os.path.join(folder_path, f)
            for f in os.listdir(folder_path)
            if os.path.isfile(os.path.join(folder_path, f)) and f.lower().endswith(".csv")
        ]
        entries.sort()
        return entries
    except Exception:
        return []


def _parse_user_iso(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        s = str(ts).strip()
        if s and "T" not in s and " " in s:
            s = s.replace(" ", "T")
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        # Normalize to UTC-aware
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt
    except Exception:
        return None


def _to_utc_iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    try:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt.isoformat()
    except Exception:
        return None


def _read_event_times_for_file(file_path: str) -> List[datetime]:
    """Return sorted UTC-aware datetimes for all events in a CSV file."""
    try:
        df = read_csv_smart(file_path)
        if df is None or df.empty or "Event Time" not in df.columns:
            return []
        ts = pd.to_datetime(df["Event Time"], errors="coerce", utc=True)
        ts = ts.dropna().sort_values()
        return [t.to_pydatetime() for t in ts]
    except Exception as e:
        logger.warning(f"Failed reading times for {file_path}: {e}")
        return []


def _read_rows_for_file(file_path: str) -> pd.DataFrame:
    """Read minimal columns needed for operator assignment and time series."""
    df = read_csv_smart(file_path, DEFAULT_CONFIG)
    if df is None or df.empty:
        return pd.DataFrame(columns=["Event Time", "Location Tag", "Source"])
    # Ensure columns exist
    for col in ("Event Time", "Location Tag", "Source"):
        if col not in df.columns:
            df[col] = ""
    # Normalize types
    out = df[["Event Time", "Location Tag", "Source"]].copy()
    out["Event Time"] = pd.to_datetime(out["Event Time"], errors="coerce", utc=True)
    out = out.dropna(subset=["Event Time"])  # keep only valid timestamps
    return out


def _normalize_operator_map(raw: Dict[str, Any]) -> List[Tuple[str, str, str]]:
    """
    Convert operator_map into a list of match rules: (operator, field, pattern)
    Acceptable raw formats per operator key:
      - list[str]: patterns applied to both 'location_tag' and 'source'
      - dict: {'location_tag': [..], 'source': [..]} (either or both keys)
    Patterns use glob semantics (fnmatchcase).
    """
    rules: List[Tuple[str, str, str]] = []
    if not isinstance(raw, dict):
        return rules
    for op, spec in raw.items():
        if spec is None:
            continue
        if isinstance(spec, list):
            for pat in spec:
                p = str(pat or "").strip()
                if p:
                    rules.append((str(op), "location_tag", p))
                    rules.append((str(op), "source", p))
        elif isinstance(spec, dict):
            lt_list = spec.get("location_tag") or []
            src_list = spec.get("source") or []
            for pat in lt_list:
                p = str(pat or "").strip()
                if p:
                    rules.append((str(op), "location_tag", p))
            for pat in src_list:
                p = str(pat or "").strip()
                if p:
                    rules.append((str(op), "source", p))
        else:
            p = str(spec).strip()
            if p:
                rules.append((str(op), "location_tag", p))
                rules.append((str(op), "source", p))
    return rules


def _assign_operator(loc_tag: str, src: str, rules: List[Tuple[str, str, str]]) -> Optional[str]:
    """Return first matching operator for given row fields, or None if no match."""
    lt = (loc_tag or "").strip()
    sc = (src or "").strip()
    for op, field, pattern in rules:
        try:
            if field == "location_tag":
                if lt and fnmatch.fnmatchcase(lt, pattern):
                    return op
            else:
                if sc and fnmatch.fnmatchcase(sc, pattern):
                    return op
        except Exception:
            continue
    return None


def _filter_by_range(timestamps: List[datetime], start_dt: Optional[datetime], end_dt: Optional[datetime]) -> List[datetime]:
    if not timestamps:
        return []
    out: List[datetime] = []
    for t in timestamps:
        if start_dt and t < start_dt:
            continue
        if end_dt and t > end_dt:
            continue
        out.append(t)
    return out


def _detect_flood_intervals(
    timestamps: List[datetime],
    window_minutes: int,
    threshold: int,
) -> Tuple[List[Dict[str, Any]], int, Optional[Tuple[datetime, datetime]]]:
    """
    Detect merged flood intervals from an aggregated (plant-wide or operator-wide) timestamp series.
    - Strict ISA semantics: flood when count > threshold within any sliding window of window_minutes.
    - Returns (merged_intervals, peak_count, peak_window)
    """
    if not timestamps:
        return [], 0, None

    ts = sorted(timestamps)
    dq: deque[datetime] = deque()
    win = timedelta(minutes=int(window_minutes))

    merged: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    peak_count_global = 0
    peak_window_global: Optional[Tuple[datetime, datetime]] = None

    for t in ts:
        dq.append(t)
        while dq and (dq[-1] - dq[0]) > win:
            dq.popleft()
        cnt = len(dq)

        if cnt > threshold:
            # Flood state
            start = dq[0]
            end = dq[-1]
            if current is None:
                current = {
                    "start": start,
                    "end": end,
                    "peak_count": cnt,
                    "peak_window_start": start,
                    "peak_window_end": end,
                }
            else:
                # Extend interval; update peak if improved
                current["end"] = max(current["end"], end)
                if cnt > int(current.get("peak_count", 0)):
                    current["peak_count"] = cnt
                    current["peak_window_start"] = start
                    current["peak_window_end"] = end

            if cnt > peak_count_global:
                peak_count_global = cnt
                peak_window_global = (start, end)
        else:
            # Not in flood
            if current is not None:
                merged.append(current)
                current = None

    if current is not None:
        merged.append(current)

    # Normalize structure and compute durations
    for m in merged:
        s = m["start"]
        e = m["end"]
        m["duration_min"] = (e - s).total_seconds() / 60.0
        m["peak_rate_per_min"] = (float(m.get("peak_count", 0)) / float(window_minutes)) if window_minutes > 0 else 0.0

    return merged, peak_count_global, peak_window_global


def _sum_interval_overlap(intervals: List[Dict[str, Any]], start_dt: datetime, end_dt: datetime) -> float:
    """Sum overlap minutes between intervals and [start_dt, end_dt]."""
    if not intervals:
        return 0.0
    total = 0.0
    for m in intervals:
        s = max(m["start"], start_dt)
        e = min(m["end"], end_dt)
        if e > s:
            total += (e - s).total_seconds() / 60.0
    return total


def _coalesce_intervals(intervals: List[Dict[str, Any]], window_minutes: int) -> List[Dict[str, Any]]:
    """Merge overlapping or adjacent flood intervals to avoid double counting.

    For each merged block, keep the maximum peak_count and its window, and
    recompute duration_min and peak_rate_per_min.
    """
    if not intervals:
        return []

    # Sort by start time to ensure order
    sorted_ivals = sorted(intervals, key=lambda m: m["start"])

    merged: List[Dict[str, Any]] = []
    cur = None
    for m in sorted_ivals:
        if cur is None:
            cur = {
                "start": m["start"],
                "end": m["end"],
                "peak_count": int(m.get("peak_count", 0)),
                "peak_window_start": m.get("peak_window_start", m["start"]),
                "peak_window_end": m.get("peak_window_end", m["end"]),
            }
            continue

        # If overlaps or touches (end >= next.start), merge
        if m["start"] <= cur["end"]:
            # Extend end
            if m["end"] > cur["end"]:
                cur["end"] = m["end"]
            # Update peak if larger
            pc = int(m.get("peak_count", 0))
            if pc > int(cur.get("peak_count", 0)):
                cur["peak_count"] = pc
                cur["peak_window_start"] = m.get("peak_window_start", m["start"])
                cur["peak_window_end"] = m.get("peak_window_end", m["end"])
        else:
            # Close out current block
            s = cur["start"]
            e = cur["end"]
            cur["duration_min"] = (e - s).total_seconds() / 60.0
            cur["peak_rate_per_min"] = (
                float(cur.get("peak_count", 0)) / float(window_minutes)
            ) if window_minutes > 0 else 0.0
            merged.append(cur)
            # Start a new block
            cur = {
                "start": m["start"],
                "end": m["end"],
                "peak_count": int(m.get("peak_count", 0)),
                "peak_window_start": m.get("peak_window_start", m["start"]),
                "peak_window_end": m.get("peak_window_end", m["end"]),
            }

    # Finalize last block
    if cur is not None:
        s = cur["start"]
        e = cur["end"]
        cur["duration_min"] = (e - s).total_seconds() / 60.0
        cur["peak_rate_per_min"] = (
            float(cur.get("peak_count", 0)) / float(window_minutes)
        ) if window_minutes > 0 else 0.0
        merged.append(cur)

    return merged


def _by_day_breakdown(
    intervals: List[Dict[str, Any]],
    obs_start: datetime,
    obs_end: datetime,
    window_minutes: int,
    peak_count_global: int,
) -> List[Dict[str, Any]]:
    """Compute per-day flood duration and percent time in flood."""
    out: List[Dict[str, Any]] = []
    if obs_end <= obs_start:
        return out

    cur = datetime(obs_start.year, obs_start.month, obs_start.day, tzinfo=timezone.utc)
    # Align cur to 00:00 of start day in UTC
    if obs_start > cur:
        cur = cur
    day = timedelta(days=1)

    while cur < obs_end:
        day_end = min(cur + day, obs_end)
        minutes = (day_end - cur).total_seconds() / 60.0
        dur = _sum_interval_overlap(intervals, cur, day_end)
        # Clamp to [0, minutes] to avoid any accidental double-counting from upstream
        if dur < 0.0:
            dur = 0.0
        if minutes > 0.0 and dur > minutes:
            dur = minutes
        pct = (dur / minutes * 100.0) if minutes > 0 else 0.0
        if pct < 0.0:
            pct = 0.0
        if pct > 100.0:
            pct = 100.0
        out.append({
            "date": cur.date().isoformat(),
            "flood_duration_min": round(dur, 6),
            "percent_time_in_flood": round(pct, 6),
            "isa_health_pct": round(100.0 - pct, 6),
            "peak_10min_count": peak_count_global,
        })
        cur = day_end

    return out


def _enumerate_windows_above_threshold(
    timestamps: List[datetime],
    window_minutes: int,
    threshold: int,
    interval_start: datetime,
    interval_end: datetime,
    max_windows: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Enumerate sliding windows (anchored at event times, de-duplicated per-minute) where count > threshold
    and that overlap with [interval_start, interval_end]. Returns up to max_windows items, sorted by
    count desc then window_end asc.
    """
    if not timestamps:
        return []
    win = timedelta(minutes=int(window_minutes))
    dq: deque[datetime] = deque()
    items: List[Dict[str, Any]] = []
    last_emitted_minute: Optional[datetime] = None  # minute-aligned end

    for t in timestamps:
        if t < interval_start - win:
            # Too early to contribute any window overlapping the interval
            # still push to deque to maintain progression
            dq.append(t)
            while dq and (dq[-1] - dq[0]) > win:
                dq.popleft()
            continue

        # Normal deque maintenance
        dq.append(t)
        while dq and (dq[-1] - dq[0]) > win:
            dq.popleft()
        cnt = len(dq)

        if cnt > threshold:
            start = dq[0]
            end = dq[-1]
            # Only consider windows overlapping the interval
            if end >= interval_start and (start <= interval_end):
                # De-duplicate by minute-aligned end time to avoid many near-identical windows
                end_minute = end.replace(second=0, microsecond=0)
                if (last_emitted_minute is None) or (end_minute > last_emitted_minute):
                    items.append({
                        "window_start": start,
                        "window_end": end,
                        "count": int(cnt),
                        "isa_flood": True,
                    })
                    last_emitted_minute = end_minute

    # Sort by count desc, then by end asc
    items.sort(key=lambda x: (-int(x.get("count", 0)), x.get("window_end")))

    if max_windows is not None and max_windows >= 0:
        items = items[:max_windows]

    # Normalize datetimes to ISO strings
    for it in items:
        it["window_start"] = _to_utc_iso(it["window_start"])  # type: ignore
        it["window_end"] = _to_utc_iso(it["window_end"])      # type: ignore

    return items


def _aggregate_alarm_details_for_range(
    files: List[str],
    start_dt: datetime,
    end_dt: datetime,
    top_n: int = 10,
    include_sample: bool = False,
    sample_max: int = 0,
) -> Dict[str, Any]:
    """
    Aggregate counts per Source and Location Tag for events within [start_dt, end_dt].
    Optionally include a light events sample. Returns dict with 'top_sources', 'top_location_tags',
    and optional 'events_sample'.
    """
    try:
        src_counts: Dict[str, int] = {}
        tag_counts: Dict[str, int] = {}
        sample: List[Dict[str, Any]] = []

        for fp in files:
            df = _read_rows_for_file(fp)
            if df is None or df.empty:
                continue
            # Filter by time range
            ts = df["Event Time"]
            mask = (ts >= start_dt) & (ts <= end_dt)
            sub = df.loc[mask, ["Event Time", "Location Tag", "Source"]]
            if sub.empty:
                continue

            # Accumulate counts
            # Note: ensure types are strings for consistent keys
            for val, cnt in sub["Source"].astype(str).value_counts().items():
                src_counts[val] = src_counts.get(val, 0) + int(cnt)
            for val, cnt in sub["Location Tag"].astype(str).value_counts().items():
                tag_counts[val] = tag_counts.get(val, 0) + int(cnt)

            if include_sample and sample_max and sample_max > 0 and len(sample) < sample_max:
                # Append up to sample_max items
                take = min(sample_max - len(sample), len(sub))
                if take > 0:
                    sub_sorted = sub.sort_values("Event Time")
                    for _, r in sub_sorted.head(take).iterrows():
                        et = r["Event Time"]
                        if isinstance(et, pd.Timestamp):
                            et = et.to_pydatetime()
                        sample.append({
                            "event_time": _to_utc_iso(et),
                            "source": str(r.get("Source", "")),
                            "location_tag": str(r.get("Location Tag", "")),
                        })

        # Build top lists
        top_sources = sorted(
            ({"source": k, "count": int(v)} for k, v in src_counts.items()),
            key=lambda x: (-x["count"], x["source"]),
        )
        top_tags = sorted(
            ({"location_tag": k, "count": int(v)} for k, v in tag_counts.items()),
            key=lambda x: (-x["count"], x["location_tag"]),
        )
        if top_n is not None and top_n >= 0:
            top_sources = top_sources[:top_n]
            top_tags = top_tags[:top_n]

        out: Dict[str, Any] = {
            "top_sources": top_sources,
            "top_location_tags": top_tags,
        }
        if include_sample and sample:
            out["events_sample"] = sample
        return out
    except Exception as e:
        logger.warning(f"Failed to aggregate alarm details for range: {e}")
        return {
            "top_sources": [],
            "top_location_tags": [],
        }


def compute_isa18_flood_summary(
    folder_path: str,
    window_minutes: int = 10,
    threshold: int = 10,
    operator_map: Optional[Dict[str, str]] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    include_records: bool = False,
    *,
    include_windows: bool = False,
    include_alarm_details: bool = False,
    top_n: int = 10,
    max_windows: Optional[int] = 10,
    events_sample: bool = False,
    events_sample_max: int = 0,
) -> Dict[str, Any]:
    """
    ISA 18.2 sliding 10-minute flood summary.
    - Flood when alarms in any sliding 10-min window STRICTLY EXCEED the threshold (> threshold).
    - Aggregated at plant-level by default. Optional per-operator if operator_map is provided.
    - Returns plant overall metrics, optional per-day breakdown, and optional records.
    """
    try:
        start_dt = _parse_user_iso(start_time)
        end_dt = _parse_user_iso(end_time)

        # Collect plant-wide timestamps and (optionally) per-operator streams
        files = _list_csv_files(folder_path)
        all_ts: List[datetime] = []
        op_rules: List[Tuple[str, str, str]] = _normalize_operator_map(operator_map or {})
        op_streams: Dict[str, List[datetime]] = {} if op_rules else {}
        unassigned_key = "UNASSIGNED"
        for fp in files:
            if op_rules:
                # Row-wise read for operator assignment
                df = _read_rows_for_file(fp)
                if df is not None and not df.empty:
                    # Iterate rows; this is acceptable as we only touch three columns
                    for _, row in df.iterrows():
                        dt_utc = row["Event Time"]
                        if isinstance(dt_utc, pd.Timestamp):
                            dt_utc = dt_utc.to_pydatetime()
                        if not isinstance(dt_utc, datetime):
                            continue
                        loc = str(row.get("Location Tag", ""))
                        src = str(row.get("Source", ""))
                        op = _assign_operator(loc, src, op_rules)
                        if op is None:
                            # Keep in overall only, and also track unassigned operator stream
                            all_ts.append(dt_utc)
                            op_streams.setdefault(unassigned_key, []).append(dt_utc)
                        else:
                            all_ts.append(dt_utc)
                            op_streams.setdefault(op, []).append(dt_utc)
            else:
                ts = _read_event_times_for_file(fp)
                if ts:
                    all_ts.extend(ts)

        all_ts.sort()
        if not all_ts:
            now_iso = datetime.utcnow().replace(tzinfo=timezone.utc).isoformat()
            return {
                "plant_folder": folder_path,
                "generated_at": now_iso,
                "params": {
                    "window_minutes": int(window_minutes),
                    "threshold": int(threshold),
                    "start_time": start_time,
                    "end_time": end_time,
                    "include_windows": include_windows,
                    "include_alarm_details": include_alarm_details,
                    "top_n": int(top_n),
                    "max_windows": int(max_windows) if isinstance(max_windows, int) else max_windows,
                    "events_sample": bool(events_sample),
                    "events_sample_max": int(events_sample_max),
                },
                "overall": {
                    "total_observation_duration_min": 0.0,
                    "total_alarms": 0,
                    "flood_windows_count": 0,
                    "flood_duration_min": 0.0,
                    "percent_time_in_flood": 0.0,
                    "isa_overall_health_pct": 100.0,
                    "peak_10min_count": 0,
                    "peak_10min_window_start": None,
                    "peak_10min_window_end": None,
                    "compliance": {"target": "<1% time in flood", "value": 0.0, "meets": True},
                },
                "by_day": [],
                "records": [] if include_records else None,
            }

        # Observation window defaults to [min_ts, max_ts]
        obs_start = start_dt or all_ts[0]
        obs_end = end_dt or all_ts[-1]
        if obs_end < obs_start:
            obs_start, obs_end = obs_end, obs_start

        # Filter to observation window
        all_ts = _filter_by_range(all_ts, obs_start, obs_end)
        total_alarms = len(all_ts)

        # Detect flood intervals and coalesce to avoid any overlaps when summing
        intervals_raw, peak_count, peak_window = _detect_flood_intervals(all_ts, window_minutes, threshold)
        intervals = _coalesce_intervals(intervals_raw, window_minutes)

        # Sum flood minutes and compute percentages
        total_obs_minutes = max(0.0, (obs_end - obs_start).total_seconds() / 60.0)
        flood_minutes = _sum_interval_overlap(intervals, obs_start, obs_end)
        pct_flood = (flood_minutes / total_obs_minutes * 100.0) if total_obs_minutes > 0 else 0.0
        isa_health = 100.0 - pct_flood

        # Per-day breakdown
        by_day = _by_day_breakdown(intervals, obs_start, obs_end, window_minutes, peak_count)

        # Prepare response
        now_iso = datetime.utcnow().replace(tzinfo=timezone.utc).isoformat()
        result: Dict[str, Any] = {
            "plant_folder": folder_path,
            "generated_at": now_iso,
            "params": {
                "window_minutes": int(window_minutes),
                "threshold": int(threshold),
                "start_time": _to_utc_iso(start_dt),
                "end_time": _to_utc_iso(end_dt),
                "include_windows": include_windows,
                "include_alarm_details": include_alarm_details,
                "top_n": int(top_n),
                "max_windows": int(max_windows) if isinstance(max_windows, int) else max_windows,
                "events_sample": bool(events_sample),
                "events_sample_max": int(events_sample_max),
            },
            "overall": {
                "total_observation_duration_min": round(total_obs_minutes, 6),
                "total_alarms": int(total_alarms),
                "flood_windows_count": int(len(intervals)),
                "flood_duration_min": round(flood_minutes, 6),
                "percent_time_in_flood": round(pct_flood, 6),
                "isa_overall_health_pct": round(isa_health, 6),
                "peak_10min_count": int(peak_count),
                "peak_10min_window_start": _to_utc_iso(peak_window[0]) if peak_window else None,
                "peak_10min_window_end": _to_utc_iso(peak_window[1]) if peak_window else None,
                "compliance": {
                    "target": "<1% time in flood",
                    "value": round(pct_flood, 6),
                    "meets": pct_flood < 1.0,
                },
            },
            "by_day": by_day,
        }

        # Per-operator computation when mapping is provided
        if op_rules and op_streams:
            by_operator: List[Dict[str, Any]] = []
            for op_name, ts_list in op_streams.items():
                if not ts_list:
                    continue
                ts_list.sort()
                ts_list = _filter_by_range(ts_list, obs_start, obs_end)
                if not ts_list:
                    continue
                ivals, op_peak, op_peak_win = _detect_flood_intervals(ts_list, window_minutes, threshold)
                op_minutes = _sum_interval_overlap(ivals, obs_start, obs_end)
                op_pct = (op_minutes / total_obs_minutes * 100.0) if total_obs_minutes > 0 else 0.0
                by_operator.append({
                    "operator": op_name,
                    "total_alarms": int(len(ts_list)),
                    "flood_windows_count": int(len(ivals)),
                    "flood_duration_min": round(op_minutes, 6),
                    "percent_time_in_flood": round(op_pct, 6),
                    "isa_health_pct": round(100.0 - op_pct, 6),
                    "peak_10min_count": int(op_peak),
                    "peak_10min_window_start": _to_utc_iso(op_peak_win[0]) if op_peak_win else None,
                    "peak_10min_window_end": _to_utc_iso(op_peak_win[1]) if op_peak_win else None,
                })

            # Sort operators by percent_time_in_flood desc (worst first)
            by_operator.sort(key=lambda r: r.get("percent_time_in_flood", 0.0), reverse=True)
            result["by_operator"] = by_operator

        if include_records:
            # Return merged intervals with ISO strings, peak info, and optional windows/details
            recs: List[Dict[str, Any]] = []
            for m in intervals:
                rec: Dict[str, Any] = {
                    "start": _to_utc_iso(m["start"]),
                    "end": _to_utc_iso(m["end"]),
                    "duration_min": round(float(m.get("duration_min", 0.0)), 6),
                    "peak_10min_count": int(m.get("peak_count", 0)),
                    "peak_window_start": _to_utc_iso(m.get("peak_window_start")),
                    "peak_window_end": _to_utc_iso(m.get("peak_window_end")),
                    "peak_rate_per_min": float(m.get("peak_rate_per_min", 0.0)),
                }

                if include_windows:
                    windows = _enumerate_windows_above_threshold(
                        all_ts,
                        window_minutes,
                        threshold,
                        m["start"],
                        m["end"],
                        max_windows=max_windows,
                    )
                    rec["windows"] = windows

                if include_alarm_details and m.get("peak_window_start") and m.get("peak_window_end"):
                    pws: datetime = m["peak_window_start"]  # type: ignore
                    pwe: datetime = m["peak_window_end"]    # type: ignore
                    details = _aggregate_alarm_details_for_range(
                        files,
                        pws,
                        pwe,
                        top_n=top_n,
                        include_sample=events_sample,
                        sample_max=events_sample_max,
                    )
                    rec["peak_window_details"] = details

                recs.append(rec)
            result["records"] = recs

        return result
    except Exception as e:
        logger.error(f"ISA flood summary failed: {e}")
        # Return a safe minimal payload rather than raising; caller can treat as 500 if needed
        now_iso = datetime.utcnow().replace(tzinfo=timezone.utc).isoformat()
        return {
            "plant_folder": folder_path,
            "generated_at": now_iso,
            "params": {
                "window_minutes": int(window_minutes),
                "threshold": int(threshold),
                "start_time": start_time,
                "end_time": end_time,
                "include_windows": include_windows,
                "include_alarm_details": include_alarm_details,
                "top_n": int(top_n),
                "max_windows": int(max_windows) if isinstance(max_windows, int) else max_windows,
                "events_sample": bool(events_sample),
                "events_sample_max": int(events_sample_max),
            },
            "overall": {
                "total_observation_duration_min": 0.0,
                "total_alarms": 0,
                "flood_windows_count": 0,
                "flood_duration_min": 0.0,
                "percent_time_in_flood": 0.0,
                "isa_overall_health_pct": 100.0,
                "peak_10min_count": 0,
                "peak_10min_window_start": None,
                "peak_10min_window_end": None,
                "compliance": {"target": "<1% time in flood", "value": 0.0, "meets": True},
            },
            "by_day": [],
            "errors": [str(e)],
        }
