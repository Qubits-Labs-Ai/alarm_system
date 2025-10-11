"""
Generate CORRECTED ISA 18.2 JSON Files

This script generates ISA 18.2 flood summary JSON files using the CORRECTED
alarm filtering (excluding operator actions and system events).

What this does:
1. Filters actual alarms from events (96% reduction)
2. Calculates accurate ISA health percentage
3. Includes enhanced pre-computed aggregations
4. Saves JSON files for API/frontend consumption

Usage:
    python scripts/generate_corrected_isa18_json.py
"""

import os
import json
import sys
import logging
from pathlib import Path
from datetime import datetime

# Add parent directory to path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import PVCI_FOLDER
from isa18_flood_monitor_corrected import compute_isa18_flood_summary_corrected
from isa18_csv_reader import ISA18Config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def generate_corrected_base_json():
    """Generate base corrected ISA 18.2 flood summary (no enhanced aggregations)."""
    
    print("\n" + "="*80)
    print("  Generating CORRECTED ISA 18.2 Base Summary")
    print("="*80)
    print()
    
    print("📋 Configuration:")
    print(f"   Data folder:        {PVCI_FOLDER}")
    print(f"   Window size:        10 minutes")
    print(f"   Threshold:          10 alarms")
    print(f"   Alarm filtering:    ✅ ENABLED (ISA 18.2 compliant)")
    print()
    
    # Verify folder exists
    if not os.path.exists(PVCI_FOLDER):
        print(f"❌ ERROR: Data folder not found: {PVCI_FOLDER}")
        return None
    
    # Count CSV files
    csv_files = [f for f in os.listdir(PVCI_FOLDER) if f.lower().endswith('.csv')]
    print(f"📁 Found {len(csv_files)} CSV files")
    print()
    
    print("🔄 Computing corrected ISA 18.2 summary...")
    print("   (This will take 2-5 minutes)")
    print()
    
    start_time = datetime.now()
    
    try:
        result = compute_isa18_flood_summary_corrected(
            folder_path=PVCI_FOLDER,
            window_minutes=10,
            threshold=10,
            include_records=False,
            include_windows=False,
            max_windows=100,
        )
    except Exception as e:
        print(f"❌ ERROR: Failed to compute summary: {e}")
        logger.exception("Computation failed")
        return None
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    print(f"✅ Computation complete in {duration:.1f} seconds")
    print()
    
    # Display summary statistics
    print("📊 CORRECTED Summary Statistics:")
    overall = result.get('overall', {})
    print(f"   Total ACTUAL alarms:    {overall.get('total_alarms', 0):,}")
    print(f"   Flood windows:          {overall.get('flood_windows_count', 0):,}")
    print(f"   ISA Health:             {overall.get('isa_overall_health_pct', 0):.2f}%")
    print(f"   Time in flood:          {overall.get('percent_time_in_flood', 0):.2f}%")
    
    compliance = overall.get('compliance', {})
    meets = compliance.get('meets', False)
    print(f"   Compliance:             {'✅ MEETS' if meets else '❌ FAILS'} ISA 18.2 target")
    print()
    
    # Save to file
    out_dir = os.path.join(ROOT, 'PVCI-overall-health')
    os.makedirs(out_dir, exist_ok=True)
    
    out_path = os.path.join(out_dir, 'isa18-flood-summary-CORRECTED.json')
    
    print(f"💾 Saving corrected summary to:")
    print(f"   {out_path}")
    
    try:
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"❌ ERROR: Failed to save file: {e}")
        return None
    
    file_size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"✅ File saved successfully: {file_size_mb:.2f} MB")
    print()
    
    return result


def generate_comparison_report(corrected_result):
    """Generate before/after comparison report."""
    
    print("="*80)
    print("  Before vs After Comparison")
    print("="*80)
    print()
    
    # Load old (incorrect) summary if exists
    old_path = os.path.join(ROOT, 'PVCI-overall-health', 'isa18-flood-summary.json')
    
    if os.path.exists(old_path):
        try:
            with open(old_path, 'r', encoding='utf-8') as f:
                old_result = json.load(f)
            
            old_overall = old_result.get('overall', {})
            new_overall = corrected_result.get('overall', {})
            
            old_alarms = old_overall.get('total_alarms', 0)
            new_alarms = new_overall.get('total_alarms', 0)
            
            old_health = old_overall.get('isa_overall_health_pct', 0)
            new_health = new_overall.get('isa_overall_health_pct', 0)
            
            old_flood = old_overall.get('percent_time_in_flood', 0)
            new_flood = new_overall.get('percent_time_in_flood', 0)
            
            print("📊 Comparison Results:")
            print()
            print(f"{'Metric':<30} {'Before':<20} {'After':<20} {'Change':<15}")
            print("-" * 85)
            print(f"{'Total Alarms':<30} {old_alarms:>19,} {new_alarms:>19,} {(new_alarms-old_alarms):>14,}")
            print(f"{'ISA Health %':<30} {old_health:>19.2f} {new_health:>19.2f} {(new_health-old_health):>+14.2f}")
            print(f"{'Time in Flood %':<30} {old_flood:>19.2f} {new_flood:>19.2f} {(new_flood-old_flood):>+14.2f}")
            print()
            
            # Calculate filtering impact
            events_filtered = old_alarms - new_alarms
            filter_pct = (events_filtered / old_alarms * 100) if old_alarms > 0 else 0
            
            print(f"🔍 Filtering Impact:")
            print(f"   Events filtered out:  {events_filtered:,} ({filter_pct:.1f}%)")
            print(f"   Actual alarms:        {new_alarms:,} ({100-filter_pct:.1f}%)")
            print()
            
        except Exception as e:
            print(f"⚠️  Could not load old summary for comparison: {e}")
            print()
    else:
        print("⚠️  Old summary file not found, skipping comparison")
        print()


def main():
    """Main generation function."""
    
    print("""
╔════════════════════════════════════════════════════════════════════════════════╗
║                                                                                ║
║        ISA 18.2 CORRECTED JSON Generator                                      ║
║        (With Proper Alarm Filtering)                                          ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝

This script generates ISA 18.2 flood summary JSON with CORRECTED calculations
that filter out operator actions and system events.

Expected Results:
- ~96% reduction in alarm counts (from 935k to ~31k)
- ISA Health improvement from ~12% to ~94%
- Time in flood reduction from ~88% to ~6%

Press Ctrl+C to cancel, or wait 3 seconds to start...
    """)
    
    import time
    try:
        for i in range(3, 0, -1):
            print(f"Starting in {i}...", end='\r')
            time.sleep(1)
        print("Starting now!     ")
    except KeyboardInterrupt:
        print("\n\n❌ Cancelled by user")
        return
    
    # Generate corrected base JSON
    corrected_result = generate_corrected_base_json()
    
    if corrected_result is None:
        print("\n❌ Generation FAILED")
        return
    
    # Generate comparison report
    generate_comparison_report(corrected_result)
    
    # Final summary
    print("="*80)
    print("  ✅ Generation Complete!")
    print("="*80)
    print()
    print("📝 Files Generated:")
    print("   1. PVCI-overall-health/isa18-flood-summary-CORRECTED.json")
    print()
    print("🎯 Next Steps:")
    print("   1. Review the corrected JSON file")
    print("   2. Compare with old calculations (see comparison above)")
    print("   3. Update your API to use the corrected calculations")
    print("   4. Update frontend to consume the corrected JSON")
    print()
    print("📖 Documentation:")
    print("   - See ISA18_BEFORE_AFTER_CORRECTION.md for full analysis")
    print("   - See isa18_csv_reader.py for filtering logic")
    print("   - See isa18_flood_monitor_corrected.py for calculation logic")
    print()


if __name__ == '__main__':
    main()
