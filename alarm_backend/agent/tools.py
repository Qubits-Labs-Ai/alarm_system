"""Agent tool functions (Phase 1: basic JSON tools, window tool stub)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .data_store import store
from isa18_flood_monitor import get_window_source_details  # type: ignore
from config import PVCI_FOLDER  # type: ignore


def tool_overall_health() -> Dict[str, Any]:
    overall = store.get_pvci_overall() or {}
    data = {
        "simple_pct": overall.get("health_pct_simple"),
        "weighted_pct": overall.get("health_pct_weighted"),
        "totals": (overall.get("totals") or {}),
    }
    return {
        "data": data,
        "citations": [
            {"source": "PVCI-overall-health/pvcI-overall-health.json", "key": "overall"}
        ],
    }


def tool_lowest_isa_day() -> Dict[str, Any]:
    by_day = store.get_by_day() or []
    if not by_day:
        return {
            "data": None,
            "citations": [
                {"source": "PVCI-overall-health/isa18-flood-summary.json", "key": "by_day"}
            ],
            "note": "No daily data available",
        }
    lowest = min(by_day, key=lambda d: float(d.get("isa_health_pct", 1e9)))
    data = {"date": lowest.get("date"), "isa_health_pct": lowest.get("isa_health_pct")}
    return {
        "data": data,
        "citations": [
            {"source": "PVCI-overall-health/isa18-flood-summary.json", "key": "by_day"}
        ],
    }


def tool_worst_file() -> Dict[str, Any]:
    files = store.get_files() or []
    if not files:
        return {
            "data": None,
            "citations": [
                {"source": "PVCI-overall-health/pvcI-overall-health.json", "key": "files"}
            ],
            "note": "No file stats available",
        }
    lowest = min(files, key=lambda f: float(f.get("health_pct", 1e9)))
    data = {"filename": lowest.get("filename"), "health_pct": lowest.get("health_pct")}
    return {
        "data": data,
        "citations": [
            {"source": "PVCI-overall-health/pvcI-overall-health.json", "key": "files"}
        ],
    }


def tool_unhealthy_sources_top(top_n: int = 50, sort_by: str = "total_hits", windows_per_source: int = 0) -> Dict[str, Any]:
    """Aggregate top sources overall from cached JSON per_source.unhealthy_bin_details.

    Metrics computed per source:
    - total_hits: sum of hits across all unhealthy bins
    - bins_count: number of unhealthy bins (windows)
    - max_hits: maximum hits in any single bin
    - last_seen: latest bin_end (or bin_start) ISO timestamp
    - top_conditions: up to 2 most frequent non-empty conditions

    sort_by can be one of: "total_hits" (default), "bins_count", "max_hits".
    """
    per_source = store.get_per_source() or {}
    if not per_source:
        return {
            "data": [],
            "citations": [
                {"source": "PVCI-overall-health/pvcI-overall-health.json", "key": "per_source.unhealthy_bin_details"}
            ],
            "note": "per_source.unhealthy_bin_details not found.",
        }

    def _latest(ts1: Optional[str], ts2: Optional[str]) -> Optional[str]:
        if not ts1:
            return ts2
        if not ts2:
            return ts1
        # ISO strings compare lexicographically when consistent format
        return ts1 if ts1 > ts2 else ts2

    from collections import Counter

    agg: List[Dict[str, Any]] = []
    for src, stats in per_source.items():
        details = stats.get("unhealthy_bin_details") or []
        if not details:
            continue
        total_hits = 0
        bins_count = 0
        max_hits = 0
        last_seen: Optional[str] = None
        cond_counter: Counter[str] = Counter()
        loc_counter: Counter[str] = Counter()
        # Pre-sort details for optional top window extraction
        details_sorted = sorted(details, key=lambda d: int(d.get("hits") or 0), reverse=True)
        for det in details:
            h = int(det.get("hits") or 0)
            total_hits += h
            bins_count += 1
            if h > max_hits:
                max_hits = h
            bstart = det.get("bin_start")
            bend = det.get("bin_end")
            last_seen = _latest(last_seen, bend or bstart)
            cond = (det.get("condition") or "").strip()
            if cond:
                cond_counter[cond] += 1
            loc = (str(det.get("location_tag")) or "").strip()
            if loc:
                loc_counter[loc] += 1
        if bins_count == 0:
            continue
        top_conditions = [c for c, _ in cond_counter.most_common(2)]
        rec: Dict[str, Any] = {
            "source": src,
            "total_hits": total_hits,
            "bins_count": bins_count,
            "max_hits": max_hits,
            "last_seen": last_seen,
            "top_conditions": top_conditions,
        }
        # Optional: attach top windows and locations summary
        if int(windows_per_source or 0) > 0:
            top_w = []
            for det in details_sorted[: int(windows_per_source)]:
                top_w.append({
                    "bin_start": det.get("bin_start"),
                    "bin_end": det.get("bin_end"),
                    "hits": int(det.get("hits") or 0),
                    "threshold": int(det.get("threshold") or 10),
                    "over_by": int(det.get("over_by") or max(0, int(det.get("hits") or 0) - int(det.get("threshold") or 10))),
                    "rate_per_min": det.get("rate_per_min"),
                    "location_tag": det.get("location_tag"),
                    "condition": det.get("condition"),
                    "filename": det.get("filename"),
                    "priority": det.get("priority"),
                    "flood_count": det.get("flood_count"),
                    "peak_window_start": det.get("peak_window_start"),
                    "peak_window_end": det.get("peak_window_end"),
                })
            rec["top_windows"] = top_w
            rec["top_locations"] = [loc for loc, _ in loc_counter.most_common(2)]
        agg.append(rec)

    key_map = {
        "total_hits": lambda r: int(r.get("total_hits") or 0),
        "bins_count": lambda r: int(r.get("bins_count") or 0),
        "max_hits": lambda r: int(r.get("max_hits") or 0),
    }
    sorter = key_map.get((sort_by or "").lower(), key_map["total_hits"])
    agg.sort(key=sorter, reverse=True)
    agg = agg[: max(1, int(top_n or 50))]

    return {
        "data": agg,
        "citations": [
            {"source": "PVCI-overall-health/pvcI-overall-health.json", "key": "per_source.unhealthy_bin_details"}
        ],
    }


def tool_window_source_details(start_time: str, end_time: str, top_n: int = 100) -> Dict[str, Any]:
    """Return per-source/location/condition counts for a time window from CSV events.

    This calls the existing ISA function used by the backend charts and returns
    ground-truth data aligned with the Unhealthy Bar Chart and Plant-wide views.
    """
    try:
        if not start_time or not end_time:
            return {
                "data": [],
                "citations": [
                    {"source": "function:get_window_source_details", "key": "missing start_time/end_time"}
                ],
                "note": "start_time and end_time are required ISO strings",
            }
        top_n = int(top_n or 100)
        result = get_window_source_details(PVCI_FOLDER, start_time, end_time, top_n=top_n)
        return {
            "data": result,
            "citations": [
                {"source": "function:get_window_source_details", "key": f"{start_time} -> {end_time}"}
            ],
        }
    except Exception as e:
        return {
            "data": [],
            "citations": [
                {"source": "function:get_window_source_details", "key": f"{start_time} -> {end_time}"}
            ],
            "note": f"error: {e}",
        }


# ---------------- ISA JSON tools ----------------
def tool_isa_overall() -> Dict[str, Any]:
    overall = store.get_isa_overall() or {}
    data = {
        "isa_overall_health_pct": overall.get("isa_overall_health_pct"),
        "percent_time_in_flood": overall.get("percent_time_in_flood"),
        "peak_10min_count": overall.get("peak_10min_count"),
        "peak_10min_window_start": overall.get("peak_10min_window_start"),
        "peak_10min_window_end": overall.get("peak_10min_window_end"),
        "compliance": (overall.get("compliance") or {}),
    }
    return {
        "data": data,
        "citations": [
            {"source": "PVCI-overall-health/isa18-flood-summary.json", "key": "overall"}
        ],
    }


def tool_isa_top_windows(top_n: int = 10, sort_by: str = "peak_10min_count") -> Dict[str, Any]:
    windows = store.get_isa_windows() or []
    if not windows:
        return {
            "data": [],
            "citations": [
                {"source": "PVCI-overall-health/isa18-flood-summary.json", "key": "records|windows"}
            ],
            "note": "No per-window records present in ISA summary.",
        }
    # Normalize keys and sort
    def _count(w):
        # Support either 'peak_10min_count' or 'count' fields
        return int(w.get("peak_10min_count") or w.get("count") or 0)
    def _duration(w):
        # If duration field exists (in minutes)
        return float(w.get("flood_duration_min") or w.get("duration_min") or 0.0)
    sorters = {
        "peak_10min_count": _count,
        "count": _count,
        "duration": _duration,
    }
    key = sorters.get((sort_by or "").lower(), _count)
    norm = []
    for w in windows:
        norm.append({
            "window_start": w.get("window_start") or w.get("start") or w.get("peak_10min_window_start"),
            "window_end": w.get("window_end") or w.get("end") or w.get("peak_10min_window_end"),
            "peak_10min_count": _count(w),
            "flood_duration_min": _duration(w),
        })
    norm.sort(key=key, reverse=True)
    norm = norm[: max(1, int(top_n or 10))]
    return {
        "data": norm,
        "citations": [
            {"source": "PVCI-overall-health/isa18-flood-summary.json", "key": "records|windows"}
        ],
    }


def tool_isa_day_summary(date: str) -> Dict[str, Any]:
    days = store.get_by_day() or []
    found = next((d for d in days if str(d.get("date")) == str(date)), None)
    return {
        "data": found or {},
        "citations": [
            {"source": "PVCI-overall-health/isa18-flood-summary.json", "key": "by_day"}
        ],
        "note": None if found else "date not found",
    }


def tool_compare_health_metrics() -> Dict[str, Any]:
    pvc_overall = store.get_pvci_overall() or {}
    isa_overall = store.get_isa_overall() or {}
    data = {
        "pvc_simple": pvc_overall.get("health_pct_simple"),
        "pvc_weighted": pvc_overall.get("health_pct_weighted"),
        "isa_overall_health_pct": isa_overall.get("isa_overall_health_pct"),
        "isa_percent_time_in_flood": isa_overall.get("percent_time_in_flood"),
    }
    return {
        "data": data,
        "citations": [
            {"source": "PVCI-overall-health/pvcI-overall-health.json", "key": "overall"},
            {"source": "PVCI-overall-health/isa18-flood-summary.json", "key": "overall"},
        ],
    }


def tool_unhealthy_breakdown(by: str = "location", top_n: int = 20) -> Dict[str, Any]:
    """Aggregate unhealthy incidents across the cached JSON by a facet.

    by: one of {"location", "condition", "source"}
    Returns rows with: key, total_hits, bins_count, unique_sources (for location/condition).
    """
    per_source = store.get_per_source() or {}
    from collections import defaultdict
    from typing import Any

    totals: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"total_hits": 0, "bins_count": 0, "unique_sources": set()})
    for src, stats in per_source.items():
        details = stats.get("unhealthy_bin_details") or []
        if not details:
            continue
        for det in details:
            h = int(det.get("hits") or 0)
            key_val: str
            if (by or "location").lower() == "location":
                key_val = (str(det.get("location_tag")) or "").strip() or "Unknown"
            elif by.lower() == "condition":
                key_val = (det.get("condition") or "").strip() or "Unknown"
            elif by.lower() == "source":
                key_val = str(src)
            else:
                key_val = "Unknown"
            totals[key_val]["total_hits"] += h
            totals[key_val]["bins_count"] += 1
            totals[key_val]["unique_sources"].add(str(src))

    rows: List[Dict[str, Any]] = []
    for k, v in totals.items():
        rows.append({
            "key": k,
            "total_hits": int(v["total_hits"]),
            "bins_count": int(v["bins_count"]),
            "unique_sources": len(v["unique_sources"]),
        })
    rows.sort(key=lambda r: (int(r["total_hits"]), int(r["bins_count"])), reverse=True)
    rows = rows[: max(1, int(top_n or 20))]

    return {
        "data": rows,
        "citations": [
            {"source": "PVCI-overall-health/pvcI-overall-health.json", "key": "per_source.unhealthy_bin_details"}
        ],
    }


def tool_calc_methodology() -> Dict[str, Any]:
    """Return a concise description of the PVC‑I plant‑wide calculation methodology.

    This summarizes the implemented logic in pvcI_health_monitor.py so the agent can
    answer "how is it calculated" questions with a cited, tool-based response.
    """
    text = (
        "PVC‑I health is computed from CSV events as follows:\n"
        "- Events are grouped per source into fixed 10‑minute bins; hits per bin are counted.\n"
        "- A bin is unhealthy if hits ≥ threshold (default 10) or if it overlaps a detected sliding‑window flood event.\n"
        "- Per source: health_pct = healthy_bins / total_bins × 100; details include top unhealthy bins with metadata.\n"
        "- Per file (day): average of source health_pct.\n"
        "- Plant simple health: average of file health_pct.\n"
        "- Plant weighted health: (sum healthy_bins / sum total_bins) × 100 across all files.\n"
        "- Unhealthy source details include bin_start/end, hits, over_by, rate_per_min, location_tag, condition, filename.\n"
    )
    return {
        "data": {"methodology": text},
        "citations": [
            {"source": "code:pvcI_health_monitor.py", "key": "compute_pvcI_overall_health"},
            {"source": "PVCI-overall-health/pvcI-overall-health.json", "key": "overall|per_source.unhealthy_bin_details"},
        ],
    }
