"""
FAST Enhanced ISA 18.2 Flood Summary Generator (Optimized Version)

This is an optimized version that generates the enhanced ISA summary much faster
by limiting the number of windows processed while still including all enhanced
aggregations needed for the frontend.

Key Optimizations:
- Limits flood windows to 100 most significant (instead of all)
- Still computes full enhanced aggregations on all data
- Typical generation time: 2-5 minutes for 3 months of data

Usage:
    python scripts/generate_isa18_enhanced_FAST.py
"""

import os
import json
import sys
import logging
from pathlib import Path
from datetime import datetime

# Ensure project root is on sys.path when running from scripts/
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from isa18_flood_monitor_enhanced import compute_enhanced_isa18_flood_summary
from config import PVCI_FOLDER

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main() -> None:
    """Generate and save enhanced ISA 18.2 flood summary (FAST version)."""
    
    print("=" * 80)
    print("  Enhanced ISA 18.2 Flood Summary Generator (FAST)")
    print("=" * 80)
    print()
    
    # OPTIMIZED Parameters for faster generation
    params = {
        'folder_path': PVCI_FOLDER,
        'window_minutes': 10,              # Standard 10-minute sliding window
        'threshold': 10,                   # ISA 18.2 standard threshold
        'include_records': True,           # Include flood window records
        'include_windows': True,           # Include per-window details
        'include_alarm_details': False,    # Disable heavy per-interval details for speed
        'top_n': 10,                       # Top 10 sources per window
        'max_windows': 100,                # ⚡ LIMIT to 100 top windows (vs all)
        'include_enhanced': True,          # ⭐ Enable enhanced aggregations
        'top_locations': 20,               # Top 20 locations by flood count
        'top_sources_per_condition': 5,    # Top 5 sources per condition at each location
    }
    
    print("⚡ FAST Configuration:")
    print(f"  Data folder:        {params['folder_path']}")
    print(f"  Window size:        {params['window_minutes']} minutes")
    print(f"  Threshold:          {params['threshold']} alarms")
    print(f"  Max windows:        {params['max_windows']} (optimized for speed)")
    print(f"  Include enhanced:   {params['include_enhanced']}")
    print(f"  Alarm details:      {params['include_alarm_details']} (disabled for speed)")
    print(f"  Top locations:      {params['top_locations']}")
    print(f"  Top sources/cond:   {params['top_sources_per_condition']}")
    print()
    print("  Note: Enhanced aggregations still process ALL data")
    print("        Only flood window records are limited to top 100")
    print()
    
    # Verify folder exists
    if not os.path.exists(PVCI_FOLDER):
        print(f"❌ ERROR: Data folder not found: {PVCI_FOLDER}")
        print("   Please check the PVCI_FOLDER path in config.py")
        sys.exit(1)
    
    # Count CSV files
    csv_files = [f for f in os.listdir(PVCI_FOLDER) if f.lower().endswith('.csv')]
    print(f"📁 Found {len(csv_files)} CSV files")
    print()
    
    # Compute enhanced summary
    print("🔄 Computing enhanced ISA 18.2 flood summary...")
    print("   Expected time: 2-5 minutes for 3 months of data")
    print()
    
    start_time = datetime.now()
    
    try:
        result = compute_enhanced_isa18_flood_summary(**params)
    except Exception as e:
        print(f"❌ ERROR: Failed to compute summary: {e}")
        logger.exception("Computation failed")
        sys.exit(1)
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    print(f"✅ Computation complete in {duration:.1f} seconds ({duration/60:.1f} minutes)")
    print()
    
    # Display summary statistics
    print("📊 Summary Statistics:")
    print(f"   Total alarms:           {result['overall']['total_alarms']:,}")
    print(f"   Flood windows:          {result['overall']['flood_windows_count']:,}")
    print(f"   ISA Health:             {result['overall']['isa_overall_health_pct']:.2f}%")
    print(f"   Time in flood:          {result['overall']['percent_time_in_flood']:.2f}%")
    print(f"   Records in output:      {len(result.get('records', []))}")
    print()
    
    # Enhanced aggregations stats
    if result.get('_enhanced'):
        unique_summary = result.get('unique_sources_summary', {})
        unhealthy = result.get('unhealthy_sources_top_n', {})
        locations = result.get('condition_distribution_by_location', {})
        
        print("⭐ Enhanced Aggregations (computed on ALL data):")
        print(f"   Unique sources:         {unique_summary.get('total_unique_sources', 0)}")
        print(f"   - Healthy sources:      {unique_summary.get('healthy_sources', 0)}")
        print(f"   - Unhealthy sources:    {unique_summary.get('unhealthy_sources', 0)}")
        print(f"   Top locations:          {len(locations.get('locations', []))}")
        print(f"   Top unhealthy sources:  {len(unhealthy.get('sources', []))}") 
        print()
    
    # Save to file
    out_dir = os.path.join(ROOT, 'PVCI-overall-health')
    os.makedirs(out_dir, exist_ok=True)
    
    # Primary output file
    out_path = os.path.join(out_dir, 'isa18-flood-summary-enhanced.json')
    
    print(f"💾 Saving enhanced summary to:")
    print(f"   {out_path}")
    
    try:
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"❌ ERROR: Failed to save file: {e}")
        logger.exception("Save failed")
        sys.exit(1)
    
    file_size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"✅ File saved successfully: {file_size_mb:.2f} MB")
    print()
    
    # Also save a copy as PVCI-plant-wide-latest-enhanced.json for API fallback
    fallback_path = os.path.join(out_dir, 'PVCI-plant-wide-latest-enhanced.json')
    try:
        with open(fallback_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"✅ Fallback copy saved:")
        print(f"   {fallback_path}")
    except Exception as e:
        print(f"⚠️  Warning: Failed to save fallback copy: {e}")
    
    print()
    print("=" * 80)
    print("  Generation Complete!")
    print("=" * 80)
    print()
    print("✅ What was generated:")
    print("   - Base ISA 18.2 flood summary (top 100 windows)")
    print("   - condition_distribution_by_location (all data)")
    print("   - unique_sources_summary (all data)")
    print("   - unhealthy_sources_top_n (all data)")
    print()
    print("📝 Next Steps:")
    print("   1. Stop your backend server if it's running (Ctrl+C)")
    print("   2. Restart: python main.py")
    print("   3. Refresh your frontend dashboard")
    print("   4. Verify load times are < 3 seconds")
    print()


if __name__ == '__main__':
    main()
