"""
Quick validation script for PVCI actual-calc service.
Run this to verify calculations match notebook output.
"""

import sys
import os
from pathlib import Path
import argparse
import tempfile
import pandas as pd
from datetime import datetime

# Add paths
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(backend_dir / "PVCI-actual-calc"))

# Import service
from actual_calc_service import (
    run_actual_calc, run_actual_calc_with_cache, write_cache, read_cache, get_cache_path,
    load_pvci_merged_csv,
    compute_activations, write_activation_cache,
    UNHEALTHY_THRESHOLD, WINDOW_MINUTES, FLOOD_SOURCE_THRESHOLD,
    ACT_WINDOW_OVERLOAD_OP, ACT_WINDOW_OVERLOAD_THRESHOLD,
    ACT_WINDOW_UNACCEPTABLE_OP, ACT_WINDOW_UNACCEPTABLE_THRESHOLD
)
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


def test_time_only_row_handling():
    """
    Unit test for forward-fill date reconstruction with time-only Event Time values.
    
    This test verifies that:
    1. Time-only rows (e.g., "12:00:14 AM") inherit dates from previous valid rows
    2. No "today" date contamination occurs
    3. Dates are correctly reconstructed before sorting
    """
    logger.info("\n" + "=" * 60)
    logger.info("Unit Test: Time-Only Row Handling with Forward-Fill")
    logger.info("=" * 60)
    
    # Create test CSV with time-only rows
    # Note: Simple forward-fill doesn't detect midnight crossover
    # Time-only values inherit the date from the previous full datetime
    test_data = [
        ["Event Time", "Source", "Action", "Condition"],
        ["1/1/2025  10:58:00 PM", "ALARM_A", "", "HIGH"],
        ["1/1/2025  10:59:00 PM", "ALARM_A", "ACK", "HIGH"],
        ["11:00:14 PM", "ALARM_A", "OK", "HIGH"],  # Time-only (should become 1/1/2025 23:00:14)
        ["11:01:00 PM", "ALARM_B", "", "LOW"],     # Time-only (should become 1/1/2025 23:01:00)
        ["1/2/2025  12:05:00 AM", "ALARM_C", "", "MEDIUM"],
        ["00:10:00", "ALARM_C", "ACK", "MEDIUM"],  # Time-only 24h format (should become 1/2/2025 00:10:00)
        ["1/3/2025  01:00:00 AM", "ALARM_D", "", "HIGH"],
    ]
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        csv_path = tmpdir_path / "test.csv"
        
        # Write test CSV
        with open(csv_path, 'w') as f:
            for row in test_data:
                f.write(','.join(row) + '\n')
        
        # Create alarm_data_dir structure
        alarm_data_dir = tmpdir_path / "ALARM_DATA_DIR"
        test_folder = alarm_data_dir / "test"
        test_folder.mkdir(parents=True)
        
        # Move CSV to expected location
        final_csv = test_folder / "test.csv"
        csv_path.rename(final_csv)
        
        logger.info(f"Created test CSV at: {final_csv}")
        
        # Load CSV with forward-fill logic
        df = load_pvci_merged_csv(
            alarm_data_dir=str(alarm_data_dir),
            csv_relative_path="test",
            csv_file_name="test.csv"
        )
        
        # Validations
        logger.info(f"\nLoaded {len(df)} rows")
        logger.info(f"Time range: {df['Event Time'].min()} to {df['Event Time'].max()}")
        
        # Check 1: No today's date contamination
        today = datetime.now().date()
        today_rows = (df['Event Time'].dt.date == today).sum()
        assert today_rows == 0, f"❌ Found {today_rows} rows with today's date (contamination from time-only parsing)"
        logger.info(f"✓ No today's date contamination ({today})")
        
        # Check 2: Time-only rows should have correct dates (forward-filled)
        # Row index 2 (11:00:14 PM) should become 1/1/2025 23:00:14 (inherits from previous row)
        row_2_date = df.iloc[2]['Event Time'].date()
        expected_date_jan1 = pd.Timestamp("2025-01-01").date()
        expected_date_jan2 = pd.Timestamp("2025-01-02").date()
        assert row_2_date == expected_date_jan1, f"❌ Row 2 date mismatch: {row_2_date} != {expected_date_jan1}"
        logger.info(f"✓ Time-only row '11:00:14 PM' correctly parsed as {df.iloc[2]['Event Time']}")
        
        # Row index 3 (11:01:00 PM) should also be 1/1/2025
        row_3_date = df.iloc[3]['Event Time'].date()
        assert row_3_date == expected_date_jan1, f"❌ Row 3 date mismatch: {row_3_date} != {expected_date_jan1}"
        logger.info(f"✓ Time-only row '11:01:00 PM' correctly parsed as {df.iloc[3]['Event Time']}")
        
        # Row index 5 (00:10:00 24h format) should be 1/2/2025 (inherits from row 4)
        row_5_date = df.iloc[5]['Event Time'].date()
        assert row_5_date == expected_date_jan2, f"❌ Row 5 date mismatch: {row_5_date} != {expected_date_jan2}"
        logger.info(f"✓ Time-only row '00:10:00' (24h) correctly parsed as {df.iloc[5]['Event Time']}")
        
        # Check 3: Data is sorted correctly
        assert df['Event Time'].is_monotonic_increasing or (
            df.groupby('Source')['Event Time'].apply(lambda x: x.is_monotonic_increasing).all()
        ), "❌ Event Time not properly sorted"
        logger.info("✓ Data sorted correctly by Source and Event Time")
        
        # Check 4: All rows have valid timestamps
        null_count = df['Event Time'].isna().sum()
        assert null_count == 0, f"❌ Found {null_count} null Event Time values"
        logger.info("✓ All rows have valid timestamps")
        
        logger.info("\n" + "=" * 60)
        logger.info("✅ All time-only row handling tests PASSED")
        logger.info("=" * 60)
        return True


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


def test_compute_activations_smoke():
    """Minimal unit test for compute_activations(): one activation with ACK/OK.
    Verifies one activation row, Acked=True, StandingFlag=False, and required columns exist.
    """
    import pandas as pd
    df = pd.DataFrame([
        {"Event Time": "2025-01-01 10:00:00", "Source": "TI-100", "Action": "", "Condition": "PVHI"},
        {"Event Time": "2025-01-01 10:01:00", "Source": "TI-100", "Action": "ACK", "Condition": "PVHI"},
        {"Event Time": "2025-01-01 10:02:00", "Source": "TI-100", "Action": "OK",  "Condition": "PVHI"},
    ])
    df["Event Time"] = pd.to_datetime(df["Event Time"])  # explicit parse
    df = df.sort_values(["Source", "Event Time"]).reset_index(drop=True)

    act = compute_activations(df, plant_id="TEST")
    assert not act.empty, "compute_activations returned empty for simple sequence"
    assert len(act) == 1, f"Expected 1 activation, got {len(act)}"
    row = act.iloc[0]
    assert bool(row.get("Acked")) is True, "Acked should be True"
    assert bool(row.get("StandingFlag")) is False, "StandingFlag should be False under default 1440 min"
    for col in [
        "PlantId","Source","Condition","StartTime","EndTime","DurationMin",
        "Acked","StandingFlag","Day","Hour","Month","Window10m",
        "Provenance","ComputationTimestamp","ThresholdsUsed"
    ]:
        assert col in act.columns, f"Missing column in activations: {col}"
    logger.info("✓ compute_activations smoke test passed")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run actual calc and regenerate cache")
    parser.add_argument("--use-cache", "-c", action="store_true", help="Use cache if valid")
    parser.add_argument("--plant", "-p", default=None, help="Plant ID to process (e.g., PVCI, VCMA). If not specified, uses DEFAULT_CSV_* (VCMA)")
    parser.add_argument("--skip-unit-test", action="store_true", help="Skip the time-only row unit test")
    parser.add_argument("--gen-activations", action="store_true", help="Generate activation cache for the selected plant (Phase 1)")
    parser.add_argument("--skip-main", action="store_true", help="Skip main actual-calc run (run only unit/smoke tests)")
    args = parser.parse_args()
    
    # Run unit test first (unless skipped)
    if not args.skip_unit_test:
        try:
            unit_test_passed = test_time_only_row_handling()
            if not unit_test_passed:
                logger.error("Unit test failed!")
                sys.exit(1)
        except Exception as e:
            logger.error(f"Unit test failed with exception: {e}", exc_info=True)
            sys.exit(1)
    
    # Run main test (unless skipped)
    plant = args.plant.upper() if args.plant else None
    if not args.skip_main:
        success = test_actual_calc(use_cache=args.use_cache, plant_id=plant)
        if not success:
            sys.exit(1)

    # Optionally generate activation cache using the new Phase 1 utilities
    if args.gen_activations:
        try:
            alarm_data_dir = backend_dir / "ALARM_DATA_DIR"
            if not alarm_data_dir.exists():
                logger.error(f"ALARM_DATA_DIR not found at {alarm_data_dir}")
                sys.exit(1)
            # Load data using existing loader (sorted, cleaned)
            df = load_pvci_merged_csv(
                alarm_data_dir=str(alarm_data_dir),
                csv_relative_path=None,
                csv_file_name=None,
                plant_id=plant,
            )
            act_df = compute_activations(df, plant_id=plant or "PVCI")
            res = write_activation_cache(plant or "PVCI", act_df, version="v1")
            logger.info(f"Activation cache written: {res}")
        except Exception as e:
            logger.error(f"Activation cache generation failed: {e}", exc_info=True)
            sys.exit(1)

    # Run smoke unit test for activations
    try:
        test_compute_activations_smoke()
    except AssertionError as e:
        logger.error(str(e))
        sys.exit(1)

    sys.exit(0)
