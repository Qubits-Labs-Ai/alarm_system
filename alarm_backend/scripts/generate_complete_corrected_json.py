"""
Generate COMPLETE Corrected ISA 18.2 JSON
(Base Summary + Enhanced Aggregations)

This generates a full-featured JSON with:
1. Corrected alarm filtering (actual alarms only)
2. Enhanced pre-computed aggregations for frontend
3. All data needed for dashboard cards and charts

Usage:
    python scripts/generate_complete_corrected_json.py
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
from isa18_csv_reader import ISA18Config, read_csv_alarms_only
from isa18_flood_monitor_enhanced import (
    compute_condition_distribution_by_location,
    compute_unique_sources_summary,
    compute_unhealthy_sources_top_n,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def compute_enhanced_aggregations_on_corrected_data(
    folder_path: str,
    threshold: int = 10,
    top_locations: int = 20,
    top_sources_per_condition: int = 5,
    top_n: int = 10,
):
    """
    Compute enhanced aggregations using CORRECTED alarm data.
    
    This reads actual alarms only (not events) and computes:
    - unique_sources_summary
    - unhealthy_sources_top_n
    - condition_distribution_by_location
    """
    import pandas as pd
    from isa18_flood_monitor import _list_csv_files
    
    logger.info("Computing enhanced aggregations on corrected alarm data...")
    
    config = ISA18Config()
    files = _list_csv_files(folder_path)
    
    # Read all FILTERED alarm data
    all_alarms = []
    for fp in files:
        df = read_csv_alarms_only(fp, config=config, return_all_columns=True)
        if not df.empty:
            all_alarms.append(df)
    
    if not all_alarms:
        logger.warning("No alarm data found")
        return {}, {}, {}
    
    # Combine all alarms
    df_all = pd.concat(all_alarms, ignore_index=True)
    
    logger.info(f"Processing {len(df_all):,} ACTUAL alarms for aggregations")
    
    # Compute unique sources summary
    logger.info("Computing unique sources summary...")
    source_counts = df_all['Source'].value_counts()
    
    healthy_sources = []
    unhealthy_sources = []
    
    for source, count in source_counts.items():
        if count < threshold:
            healthy_sources.append({"source": source, "count": int(count)})
        else:
            unhealthy_sources.append({"source": source, "count": int(count)})
    
    # Sort by count
    healthy_sources.sort(key=lambda x: x['count'], reverse=True)
    unhealthy_sources.sort(key=lambda x: x['count'], reverse=True)
    
    unique_sources_summary = {
        "total_unique_sources": len(source_counts),
        "healthy_sources": len(healthy_sources),
        "unhealthy_sources": len(unhealthy_sources),
        "by_activity_level": {
            "low_activity": healthy_sources,
            "high_activity": unhealthy_sources,
        },
        "system_sources": {
            "count": 0,  # Already filtered out
            "sources": [],
        },
        "metadata": {
            "computed_at": datetime.now().isoformat(),
            "filters": {
                "threshold": threshold,
                "include_system": False,  # Filtered out
            }
        }
    }
    
    # Compute unhealthy sources top N
    logger.info(f"Computing top {top_n} unhealthy sources...")
    top_unhealthy = unhealthy_sources[:top_n]
    
    # Add location info
    for source_entry in top_unhealthy:
        source_name = source_entry['source']
        source_df = df_all[df_all['Source'] == source_name]
        
        # Most common location
        if 'Location Tag' in source_df.columns:
            loc_counts = source_df['Location Tag'].value_counts()
            if len(loc_counts) > 0:
                common_loc = loc_counts.index[0]
                source_entry['location_tag'] = str(common_loc) if str(common_loc).strip() else "Unknown"
            else:
                source_entry['location_tag'] = "Unknown"
        else:
            source_entry['location_tag'] = "Unknown"
        
        source_entry['hits'] = source_entry['count']
        source_entry['threshold'] = threshold
        source_entry['over_by'] = source_entry['count'] - threshold
    
    unhealthy_sources_top_n = {
        "sources": top_unhealthy,
        "metadata": {
            "total_unhealthy_sources": len(unhealthy_sources),
            "computed_at": datetime.now().isoformat(),
            "filters": {
                "threshold": threshold,
                "include_system": False,
            }
        }
    }
    
    # Compute condition distribution by location
    logger.info("Computing condition distribution by location...")
    
    if 'Location Tag' not in df_all.columns or 'Condition' not in df_all.columns:
        condition_distribution = {
            "locations": [],
            "metadata": {
                "total_locations": 0,
                "total_alarms": len(df_all),
                "computed_at": datetime.now().isoformat(),
            }
        }
    else:
        # Normalize locations
        df_all['Location_Normalized'] = df_all['Location Tag'].apply(
            lambda x: str(x).strip() if str(x).strip() else "Unknown Location"
        )
        
        # Group by location
        location_groups = df_all.groupby('Location_Normalized')
        location_totals = location_groups.size().sort_values(ascending=False)
        
        # Take top N locations
        top_locs = location_totals.head(top_locations)
        
        locations_data = []
        for loc, total_count in top_locs.items():
            loc_df = df_all[df_all['Location_Normalized'] == loc]
            
            # Condition breakdown
            condition_counts = loc_df['Condition'].value_counts()
            conditions_dict = {str(k): int(v) for k, v in condition_counts.items()}
            
            # Top sources per condition
            top_sources_by_condition = {}
            for cond in conditions_dict.keys():
                cond_df = loc_df[loc_df['Condition'] == cond]
                source_counts = cond_df['Source'].value_counts().head(top_sources_per_condition)
                top_sources_by_condition[cond] = [
                    {"source": str(src), "count": int(cnt)}
                    for src, cnt in source_counts.items()
                ]
            
            locations_data.append({
                "location": loc,
                "total_flood_count": int(total_count),
                "conditions": conditions_dict,
                "top_sources_by_condition": top_sources_by_condition,
            })
        
        condition_distribution = {
            "locations": locations_data,
            "metadata": {
                "total_locations": len(location_totals),
                "total_alarms": len(df_all),
                "computed_at": datetime.now().isoformat(),
            }
        }
    
    logger.info("Enhanced aggregations complete")
    
    return unique_sources_summary, unhealthy_sources_top_n, condition_distribution


def generate_complete_corrected_json():
    """Generate complete corrected JSON with all aggregations."""
    
    print("\n" + "="*80)
    print("  Generating COMPLETE Corrected ISA 18.2 JSON")
    print("  (Base Summary + Enhanced Aggregations)")
    print("="*80)
    print()
    
    print("📋 Configuration:")
    print(f"   Data folder:        {PVCI_FOLDER}")
    print(f"   Alarm filtering:    ✅ ENABLED (ISA 18.2 compliant)")
    print(f"   Enhanced features:  ✅ ENABLED")
    print()
    
    # Verify folder
    if not os.path.exists(PVCI_FOLDER):
        print(f"❌ ERROR: Data folder not found: {PVCI_FOLDER}")
        return None
    
    csv_files = [f for f in os.listdir(PVCI_FOLDER) if f.lower().endswith('.csv')]
    print(f"📁 Found {len(csv_files)} CSV files")
    print()
    
    print("🔄 Step 1: Computing base ISA summary (corrected)...")
    start_time = datetime.now()
    
    try:
        base_result = compute_isa18_flood_summary_corrected(
            folder_path=PVCI_FOLDER,
            window_minutes=10,
            threshold=10,
            include_records=True,  # ✅ CHANGED: Frontend needs records for Top Flood Windows
            include_windows=False,  # Keep False to save space (windows not needed)
            max_windows=100,
        )
    except Exception as e:
        print(f"❌ ERROR: Failed to compute base summary: {e}")
        logger.exception("Base computation failed")
        return None
    
    print(f"   ✅ Base summary complete")
    print()
    
    # Display base stats
    overall = base_result.get('overall', {})
    print("📊 Base Summary:")
    print(f"   Total ACTUAL alarms:    {overall.get('total_alarms', 0):,}")
    print(f"   ISA Health:             {overall.get('isa_overall_health_pct', 0):.2f}%")
    print()
    
    print("🔄 Step 2: Computing enhanced aggregations...")
    
    try:
        unique_sources, unhealthy_top_n, condition_dist = compute_enhanced_aggregations_on_corrected_data(
            folder_path=PVCI_FOLDER,
            threshold=10,
            top_locations=20,
            top_sources_per_condition=5,
            top_n=10,
        )
    except Exception as e:
        print(f"❌ ERROR: Failed to compute enhanced aggregations: {e}")
        logger.exception("Enhanced computation failed")
        return None
    
    print(f"   ✅ Enhanced aggregations complete")
    print()
    
    # Add enhanced data to base result
    base_result['unique_sources_summary'] = unique_sources
    base_result['unhealthy_sources_top_n'] = unhealthy_top_n
    base_result['condition_distribution_by_location'] = condition_dist
    base_result['_enhanced'] = True
    base_result['_version'] = '2.0'
    base_result['_corrected'] = True
    base_result['_alarm_filtering_enabled'] = True
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    print(f"✅ Total computation time: {duration:.1f} seconds")
    print()
    
    # Display enhanced stats
    print("📊 Enhanced Aggregations:")
    print(f"   Unique sources:         {unique_sources.get('total_unique_sources', 0)}")
    print(f"   - Healthy:              {unique_sources.get('healthy_sources', 0)}")
    print(f"   - Unhealthy:            {unique_sources.get('unhealthy_sources', 0)}")
    print(f"   Top locations:          {len(condition_dist.get('locations', []))}")
    print(f"   Top unhealthy sources:  {len(unhealthy_top_n.get('sources', []))}")
    print()
    
    # Save to file
    out_dir = os.path.join(ROOT, 'PVCI-overall-health')
    os.makedirs(out_dir, exist_ok=True)
    
    out_path = os.path.join(out_dir, 'isa18-flood-summary-CORRECTED-ENHANCED.json')
    
    print(f"💾 Saving complete corrected JSON to:")
    print(f"   {out_path}")
    
    try:
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(base_result, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"❌ ERROR: Failed to save file: {e}")
        return None
    
    file_size_kb = os.path.getsize(out_path) / 1024
    print(f"✅ File saved successfully: {file_size_kb:.1f} KB")
    print()
    
    # Also save as the main "enhanced" file for API
    fallback_path = os.path.join(out_dir, 'isa18-flood-summary-enhanced.json')
    try:
        with open(fallback_path, 'w', encoding='utf-8') as f:
            json.dump(base_result, f, ensure_ascii=False, indent=2)
        print(f"✅ API-ready copy saved:")
        print(f"   {fallback_path}")
    except Exception as e:
        print(f"⚠️  Warning: Failed to save API copy: {e}")
    
    print()
    return base_result


def main():
    """Main function."""
    
    print("""
╔════════════════════════════════════════════════════════════════════════════════╗
║                                                                                ║
║   COMPLETE Corrected ISA 18.2 JSON Generator                                  ║
║   (Base + Enhanced Aggregations with Alarm Filtering)                         ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝

This generates a COMPLETE JSON with:
✅ Corrected ISA calculations (actual alarms only, not events)
✅ Enhanced pre-computed aggregations for frontend
✅ All data needed for dashboard cards and charts

Expected time: 2-5 minutes
    """)
    
    result = generate_complete_corrected_json()
    
    if result is None:
        print("\n❌ Generation FAILED")
        return
    
    # Final summary
    print("="*80)
    print("  ✅ Generation Complete!")
    print("="*80)
    print()
    print("📝 Files Generated:")
    print("   1. PVCI-overall-health/isa18-flood-summary-CORRECTED-ENHANCED.json")
    print("   2. PVCI-overall-health/isa18-flood-summary-enhanced.json (API copy)")
    print()
    print("📊 What's Included:")
    print("   ✅ Base ISA summary (corrected alarm counts)")
    print("   ✅ unique_sources_summary (healthy vs unhealthy)")
    print("   ✅ unhealthy_sources_top_n (top 10 offenders)")
    print("   ✅ condition_distribution_by_location (location breakdown)")
    print("   ✅ Daily breakdowns (by_day)")
    print()
    print("🎯 Next Step:")
    print("   Your frontend can now use this complete JSON file!")
    print("   It has EVERYTHING needed for all dashboard cards and charts.")
    print()


if __name__ == '__main__':
    main()
