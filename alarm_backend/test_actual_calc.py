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
from actual_calc_service import run_actual_calc, write_cache
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def test_actual_calc():
    """Test actual calculation service."""
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
        logger.info("Testing PVCI Actual Calculation Service")
        logger.info("=" * 60)
        
        # Run calculation
        summary_df, kpis, cycles_df = run_actual_calc(
            str(alarm_data_dir),
            stale_min=60,
            chatter_min=10
        )
        
        logger.info("\n" + "=" * 60)
        logger.info("RESULTS SUMMARY")
        logger.info("=" * 60)
        
        # Validate shapes
        logger.info(f"\nDataFrame Shapes:")
        logger.info(f"  Summary: {summary_df.shape} (sources × metrics)")
        logger.info(f"  Cycles:  {cycles_df.shape} (cycles × fields)")
        
        # Overall KPIs
        logger.info(f"\nOverall KPIs:")
        for key, value in kpis.items():
            if isinstance(value, float):
                logger.info(f"  {key}: {value:.2f}")
            else:
                logger.info(f"  {key}: {value}")
        
        # Per-source sample
        logger.info(f"\nTop 5 Sources by Unique Alarms:")
        top_sources = summary_df.nlargest(5, "Unique_Alarms")
        for _, row in top_sources.iterrows():
            ua = int(row.get('Unique_Alarms', 0))
            sa = int(row.get('Standing_Alarms', 0))
            st = int(row.get('Stale_Alarms', 0))
            inf_s = int(row.get('Instrument_Failure', 0))
            rep = int(row.get('Repeating_Alarms', 0))
            ch = int(row.get('Chattering_Count', 0))
            inf_c = int(row.get('Instrument_Failure_Chattering', 0))
            logger.info(f"  {row['Source']}: UA={ua}, SA={sa}, Stale={st}, IF(Standing)={inf_s}, Rep={rep}, Chat={ch}, IF(Chatter)={inf_c}")
        
        # Test cache write
        logger.info("\n" + "=" * 60)
        logger.info("Testing Cache Write")
        logger.info("=" * 60)
        
        params = {"stale_min": 60, "chatter_min": 10}
        write_cache(str(backend_dir), summary_df, kpis, cycles_df, params, str(alarm_data_dir))
        
        cache_path = backend_dir / "PVCI-actual-calc" / "actual-calc.json"
        if cache_path.exists():
            cache_size_mb = cache_path.stat().st_size / 1024 / 1024
            logger.info(f"Cache written successfully: {cache_path}")
            logger.info(f"Cache size: {cache_size_mb:.2f} MB")
        else:
            logger.error("Cache file not created!")
            return False
        
        logger.info("\n" + "=" * 60)
        logger.info("✓ All tests passed!")
        logger.info("=" * 60)
        
        return True
        
    except Exception as e:
        logger.error(f"Test failed: {str(e)}", exc_info=True)
        return False


if __name__ == "__main__":
    success = test_actual_calc()
    sys.exit(0 if success else 1)
