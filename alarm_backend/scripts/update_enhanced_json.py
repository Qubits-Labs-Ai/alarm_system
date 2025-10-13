r"""
Update or augment existing enhanced ISA 18.2 JSON without full recomputation.

Features:
- --add-event-stats: compute actions/state/quality event_statistics and embed
- --hydrate-details: compute per-window peak_window_details.top_sources for
  records missing details (or force with --force). Uses the alarms-only dataset
  and respects include_system flag.

Usage examples (PowerShell):
  # Add event statistics into the existing JSON fast-path
  python alarm_backend\scripts\update_enhanced_json.py --add-event-stats

  # Hydrate top_sources for windows (if missing)
  python alarm_backend\scripts\update_enhanced_json.py --hydrate-details --top-n 10

Notes:
- Hydrating details iterates windows and computes per-window aggregates; with
  many windows this still takes time, but avoids redoing the whole plant-wide
  flood detection.
"""
from __future__ import annotations

import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

# Add project root to import path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Try to import helper to compute event stats
try:
    SCRIPTS_DIR = Path(__file__).resolve().parent
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    from add_event_statistics import analyze_all_records_with_event_stats as _compute_event_stats
except Exception:
    _compute_event_stats = None

from config import PVCI_FOLDER
from isa18_flood_monitor import _aggregate_alarm_details_for_range, _list_csv_files


def _load_json(path: Path) -> dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def add_event_stats(enhanced_path: Path) -> None:
    if _compute_event_stats is None:
        print("⚠️  Event statistics helper unavailable; skipping.")
        return
    print("🔄 Computing event statistics (actions/state/quality)…")
    evt = _compute_event_stats(str(PVCI_FOLDER))
    data = _load_json(enhanced_path)
    data["event_statistics"] = evt
    _backup(enhanced_path, data)
    _save_json(enhanced_path, data)
    print("✅ event_statistics embedded →", enhanced_path)


def _backup(path: Path, data: dict) -> None:
    try:
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        bak = path.with_suffix(path.suffix + f".bak_{ts}")
        with open(bak, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def hydrate_details(enhanced_path: Path, *, top_n: int = 10, include_system: bool = False) -> None:
    print("🔄 Hydrating per-window top_sources where missing…")
    data = _load_json(enhanced_path)
    records = data.get("records") or []
    if not records:
        print("ℹ️  No records found in JSON (nothing to hydrate).")
        return

    files = _list_csv_files(str(PVCI_FOLDER))
    if not files:
        print("❌ No CSV files found under PVCI_FOLDER; cannot compute details.")
        return

    updated = 0
    for rec in records:
        pwd = rec.get("peak_window_details") or {}
        tops = pwd.get("top_sources") if isinstance(pwd, dict) else None
        # Only compute when missing or empty
        if tops and isinstance(tops, list) and len(tops) > 0:
            continue
        # Pick window start/end
        s_iso = rec.get("peak_window_start") or rec.get("start")
        e_iso = rec.get("peak_window_end") or rec.get("end")
        if not s_iso or not e_iso:
            continue
        try:
            details = _aggregate_alarm_details_for_range(
                files,
                start_dt=_parse_iso(s_iso),
                end_dt=_parse_iso(e_iso),
                top_n=top_n,
                include_sample=False,
                sample_max=0,
                alarms_only=True,
                include_system=include_system,
            )
            if not isinstance(pwd, dict):
                pwd = {}
            pwd["top_sources"] = details.get("top_sources", [])
            rec["peak_window_details"] = pwd
            updated += 1
        except Exception as e:
            print("⚠️  Failed to compute details for a window:", e)

    if updated == 0:
        print("ℹ️  No windows were updated (details already present or missing window bounds).")
        return

    _backup(enhanced_path, data)
    _save_json(enhanced_path, data)
    print(f"✅ Hydrated {updated} window(s) →", enhanced_path)


from datetime import timezone

def _parse_iso(ts: str):
    s = str(ts).strip()
    if s.endswith('Z'):
        s = s[:-1] + '+00:00'
    return datetime.fromisoformat(s).astimezone(timezone.utc)


def main():
    p = argparse.ArgumentParser(description="Augment existing enhanced ISA JSON")
    p.add_argument("--enhanced-path", type=str, default=str(ROOT / "PVCI-overall-health" / "isa18-flood-summary-enhanced.json"), help="Path to enhanced JSON")
    p.add_argument("--add-event-stats", action="store_true", help="Append event_statistics to the JSON")
    p.add_argument("--hydrate-details", action="store_true", help="Compute per-window top_sources where missing")
    p.add_argument("--top-n", type=int, default=10, help="Top sources per window when hydrating details")
    p.add_argument("--include-system", action="store_true", help="Include system/meta sources when hydrating details")
    args = p.parse_args()

    enhanced_path = Path(args.enhanced_path)
    if not enhanced_path.exists():
        print("❌ Enhanced JSON not found:", enhanced_path)
        sys.exit(1)

    if args.add_event_stats:
        add_event_stats(enhanced_path)

    if args.hydrate_details:
        hydrate_details(enhanced_path, top_n=args.top_n, include_system=args.include_system)

    if not (args.add_event_stats or args.hydrate_details):
        print("ℹ️  Nothing to do. Pass --add-event-stats and/or --hydrate-details")


if __name__ == "__main__":
    main()
