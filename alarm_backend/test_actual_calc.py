"""
Quick validation script for PVCI actual-calc service.
Run this to verify calculations match notebook output.
"""

import sys
import os
from pathlib import Path

# Add paths
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(backend_dir / "PVCI-actual-calc"))

# Import service
from actual_calc_service import (
    run_actual_calc, write_cache, read_cache, get_cache_path,
    UNHEALTHY_THRESHOLD, WINDOW_MINUTES, FLOOD_SOURCE_THRESHOLD,
    ACT_WINDOW_OVERLOAD_OP, ACT_WINDOW_OVERLOAD_THRESHOLD,
    ACT_WINDOW_UNACCEPTABLE_OP, ACT_WINDOW_UNACCEPTABLE_THRESHOLD
)
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def test_actual_calc(use_cache: bool = False):
    """Test/regenerate actual calculation cache.
    - When use_cache=True and matching params exist, skip compute and just report.
    """
    alarm_data_dir = backend_dir / "ALARM_DATA_DIR"
    
    if not alarm_data_dir.exists():
        logger.error(f"ALARM_DATA_DIR not found at {alarm_data_dir}")
        return False
    
    csv_path = alarm_data_dir / "PVCI-merged" / "All_Merged.csv"
    if not csv_path.exists():
        logger.error(f"Merged CSV not found at {csv_path}")
        return False
    
    try:
        logger.info("=" * 60)
        logger.info("PVCI Actual Calculation — regenerate cache")
        logger.info("=" * 60)
        
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
        cached = read_cache(str(backend_dir), params) if use_cache else None
        if cached:
            logger.info("Cache exists with matching params; skipping compute.")
            cache_path = Path(get_cache_path(str(backend_dir)))
            size_mb = cache_path.stat().st_size / 1024 / 1024 if cache_path.exists() else 0
            logger.info(f"Cache: {cache_path} ({size_mb:.2f} MB)")
            return True
        
        # Run calculation (now returns unhealthy, floods, bad_actors, frequency, and optionally source_meta)
        ret = run_actual_calc(
            str(alarm_data_dir),
            stale_min=60,
            chatter_min=10,
            unhealthy_threshold=UNHEALTHY_THRESHOLD,
            window_minutes=WINDOW_MINUTES,
            flood_source_threshold=FLOOD_SOURCE_THRESHOLD,
            act_window_overload_op=ACT_WINDOW_OVERLOAD_OP,
            act_window_overload_threshold=ACT_WINDOW_OVERLOAD_THRESHOLD,
            act_window_unacceptable_op=ACT_WINDOW_UNACCEPTABLE_OP,
            act_window_unacceptable_threshold=ACT_WINDOW_UNACCEPTABLE_THRESHOLD,
        )
        try:
            summary_df, kpis, cycles_df, unhealthy, floods, bad_actors, frequency, source_meta = ret
        except ValueError:
            # Backward compatibility with older 7-tuple signature
            summary_df, kpis, cycles_df, unhealthy, floods, bad_actors, frequency = ret
            source_meta = {}
        
        # Validate results
        assert not summary_df.empty, "Per-source summary is empty"
        assert "Unique_Alarms" in summary_df.columns, "Missing Unique_Alarms column"
        logger.info(f"  Per-source rows:  {len(summary_df)}")
        logger.info(f"  Overall KPIs:     {kpis}")
        logger.info(f"  Unhealthy source: {len(unhealthy.get('per_source', []))}")
        logger.info(f"  Flood windows:    {len(floods.get('windows', []))}")
        logger.info(f"  Frequency KPIs:   {frequency.get('summary', {})}")
        
        # Write cache (includes unhealthy, floods, bad_actors, frequency)
        write_cache(
            str(backend_dir),
            summary_df,
            kpis,
            cycles_df,
            params,
            str(alarm_data_dir),
            unhealthy=unhealthy,
            floods=floods,
            bad_actors=bad_actors,
            frequency=frequency,
            source_meta=source_meta,
        )
        
        cache_path = Path(get_cache_path(str(backend_dir)))
        if cache_path.exists():
            cache_size_mb = cache_path.stat().st_size / 1024 / 1024
            logger.info(f"Cache written: {cache_path} ({cache_size_mb:.2f} MB)")
            try:
                import json
                data = json.loads(cache_path.read_text(encoding='utf-8'))
                sm = data.get("source_meta") or {}
                logger.info(f"source_meta entries: {len(sm)}")
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
    # Pass --use-cache to skip recompute when cache matches params
    use_cache_flag = any(a in ("--use-cache", "-c") for a in sys.argv[1:])
    success = test_actual_calc(use_cache=use_cache_flag)
    sys.exit(0 if success else 1)
