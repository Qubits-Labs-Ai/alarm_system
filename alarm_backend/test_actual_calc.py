"""
Quick validation script for PVCI actual-calc service.
Run this to verify calculations match notebook output.
"""

import sys
import os
from pathlib import Path
import argparse

# Add paths
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(backend_dir / "PVCI-actual-calc"))

# Import service
from actual_calc_service import (
    run_actual_calc, run_actual_calc_with_cache, write_cache, read_cache, get_cache_path,
    UNHEALTHY_THRESHOLD, WINDOW_MINUTES, FLOOD_SOURCE_THRESHOLD,
    ACT_WINDOW_OVERLOAD_OP, ACT_WINDOW_OVERLOAD_THRESHOLD,
    ACT_WINDOW_UNACCEPTABLE_OP, ACT_WINDOW_UNACCEPTABLE_THRESHOLD
)
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def test_actual_calc(use_cache: bool = False, plant_id: str = None):
    """Test/regenerate actual calculation cache.
    - When use_cache=True and matching params exist, skip compute and just report.
    - If plant_id is None, uses DEFAULT_CSV_* from actual_calc_service (VCMA by default).
    """
    alarm_data_dir = backend_dir / "ALARM_DATA_DIR"
    
    if not alarm_data_dir.exists():
        logger.error(f"ALARM_DATA_DIR not found at {alarm_data_dir}")
        return False
    
    try:
        logger.info("=" * 60)
        plant_label = plant_id or "Default (VCMA)"
        logger.info(f"{plant_label} Actual Calculation — regenerate cache")
        logger.info("=" * 60)
        
        # Always regenerate by default (force_refresh=True) unless --use-cache provided
        params = {
            "stale_min": 60,
            "chatter_min": 10,
            "unhealthy_threshold": UNHEALTHY_THRESHOLD,
            "window_minutes": WINDOW_MINUTES,
            "flood_source_threshold": FLOOD_SOURCE_THRESHOLD,
            "act_window_overload_op": ACT_WINDOW_OVERLOAD_OP,
            "act_window_overload_threshold": ACT_WINDOW_OVERLOAD_THRESHOLD,
            "act_window_unacceptable_op": ACT_WINDOW_UNACCEPTABLE_OP,
            "act_window_unacceptable_threshold": ACT_WINDOW_UNACCEPTABLE_THRESHOLD,
        }

        result = run_actual_calc_with_cache(
            base_dir=str(backend_dir),
            alarm_data_dir=str(alarm_data_dir),
            plant_id=plant_id,
            use_cache=True,
            force_refresh=not use_cache,
            **params,
        )

        # Basic validations
        per_source = result.get("per_source", [])
        overall = result.get("overall", {})
        frequency = result.get("frequency", {})
        floods = result.get("floods", {})
        unhealthy = result.get("unhealthy", {})
        assert isinstance(per_source, list) and len(per_source) > 0, "Per-source summary is empty"
        logger.info(f"  Per-source rows:  {len(per_source)}")
        logger.info(f"  Overall KPIs keys: {list(overall.keys())}")
        logger.info(f"  Unhealthy sources: {len(unhealthy.get('per_source', []))}")
        logger.info(f"  Flood windows:    {len(floods.get('windows', []))}")
        logger.info(f"  Frequency KPIs:   {frequency.get('summary', {})}")
        
        cache_path = Path(get_cache_path(str(backend_dir), plant_id=plant_id))
        if cache_path.exists():
            cache_size_mb = cache_path.stat().st_size / 1024 / 1024
            logger.info(f"Cache written: {cache_path} ({cache_size_mb:.2f} MB)")
            try:
                import json
                data = json.loads(cache_path.read_text(encoding='utf-8'))
                sm = data.get("source_meta") or {}
                alarm_summary = data.get("alarm_summary") or {}
                logger.info(f"source_meta entries: {len(sm)}")
                if alarm_summary:
                    logger.info("alarm_summary present: category_time_series, hourly_seasonality, sankey_composition")
            except Exception:
                pass
        else:
            logger.error("Cache file not created!")
            return False
        
        logger.info("\n✓ Done")
        return True
        
    except Exception as e:
        logger.error(f"Test failed: {str(e)}", exc_info=True)
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run actual calc and regenerate cache")
    parser.add_argument("--use-cache", "-c", action="store_true", help="Use cache if valid")
    parser.add_argument("--plant", "-p", default=None, help="Plant ID to process (e.g., PVCI, VCMA). If not specified, uses DEFAULT_CSV_* (VCMA)")
    args = parser.parse_args()
    plant = args.plant.upper() if args.plant else None
    success = test_actual_calc(use_cache=args.use_cache, plant_id=plant)
    sys.exit(0 if success else 1)
