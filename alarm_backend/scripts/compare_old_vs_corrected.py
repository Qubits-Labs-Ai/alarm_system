"""
Generate Comprehensive Comparison Report
Old (with events) vs Corrected (alarms only)

This script compares the metrics between:
- OLD: JSON with both alarms and events (ACK, OK, etc.)
- CORRECTED: JSON with only actual alarms (ISA 18.2 compliant)

Usage:
    python scripts/compare_old_vs_corrected.py
"""

import os
import json
import sys
from pathlib import Path
from datetime import datetime

# Add parent directory to path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def load_json_file(filepath: str) -> dict:
    """Load JSON file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ ERROR loading {filepath}: {e}")
        return {}


def safe_get(data: dict, *keys, default=0):
    """Safely get nested dict value."""
    try:
        result = data
        for key in keys:
            if isinstance(result, dict):
                result = result.get(key, default)
            else:
                return default
        return result if result is not None else default
    except Exception:
        return default


def compare_metrics():
    """Generate comprehensive comparison report."""
    
    print("\n" + "="*80)
    print("  ISA 18.2 ALARM DATA COMPARISON REPORT")
    print("  Old (Events Included) vs Corrected (Alarms Only)")
    print("="*80)
    print()
    
    base_dir = os.path.join(ROOT, 'PVCI-overall-health')
    
    # Try to find old JSON (uncorrected)
    old_candidates = [
        os.path.join(base_dir, 'isa18-flood-summary.json'),
        os.path.join(base_dir, 'PVCI-plant-wide-latest.json'),
    ]
    
    old_path = None
    for fp in old_candidates:
        if os.path.exists(fp):
            old_path = fp
            break
    
    # Corrected JSON
    corrected_path = os.path.join(base_dir, 'isa18-flood-summary-CORRECTED-ENHANCED.json')
    
    if not old_path:
        print("⚠️  WARNING: No old JSON found for comparison")
        print("   Searched:")
        for fp in old_candidates:
            print(f"   - {fp}")
        print()
        print("   Showing corrected metrics only...")
        old_data = {}
    else:
        print(f"📁 OLD JSON:       {os.path.basename(old_path)}")
        old_data = load_json_file(old_path)
    
    if not os.path.exists(corrected_path):
        print(f"❌ ERROR: Corrected JSON not found: {corrected_path}")
        return
    
    print(f"📁 CORRECTED JSON: {os.path.basename(corrected_path)}")
    corrected_data = load_json_file(corrected_path)
    
    print()
    print("="*80)
    print("  OVERALL METRICS COMPARISON")
    print("="*80)
    print()
    
    # Extract metrics
    old_total = safe_get(old_data, 'overall', 'total_alarms')
    new_total = safe_get(corrected_data, 'overall', 'total_alarms')
    
    old_health = safe_get(old_data, 'overall', 'isa_overall_health_pct')
    new_health = safe_get(corrected_data, 'overall', 'isa_overall_health_pct')
    
    old_flood_windows = safe_get(old_data, 'overall', 'flood_windows_count')
    new_flood_windows = safe_get(corrected_data, 'overall', 'flood_windows_count')
    
    old_time_in_flood = safe_get(old_data, 'overall', 'percent_time_in_flood')
    new_time_in_flood = safe_get(corrected_data, 'overall', 'percent_time_in_flood')
    
    old_peak = safe_get(old_data, 'overall', 'peak_10min_count')
    new_peak = safe_get(corrected_data, 'overall', 'peak_10min_count')
    
    # Calculate differences
    def calc_diff(old, new):
        if old == 0:
            return 0, "N/A"
        diff = new - old
        pct_change = (diff / old) * 100
        return diff, f"{pct_change:+.1f}%"
    
    # Print comparison table
    print("┌─────────────────────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┐")
    print("│ Metric                              │ OLD (Events) │ NEW (Alarms) │ Difference   │ % Change     │")
    print("├─────────────────────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤")
    
    # Total alarms/events
    diff_total, pct_total = calc_diff(old_total, new_total)
    print(f"│ Total Records                       │ {old_total:>12,} │ {new_total:>12,} │ {diff_total:>+12,} │ {pct_total:>12} │")
    
    # ISA Health
    diff_health, pct_health = calc_diff(old_health, new_health)
    print(f"│ ISA Overall Health (%)              │ {old_health:>12.2f} │ {new_health:>12.2f} │ {diff_health:>+12.2f} │ {pct_health:>12} │")
    
    # Flood windows
    diff_flood, pct_flood = calc_diff(old_flood_windows, new_flood_windows)
    print(f"│ Flood Windows Count                 │ {old_flood_windows:>12,} │ {new_flood_windows:>12,} │ {diff_flood:>+12,} │ {pct_flood:>12} │")
    
    # Time in flood
    diff_time, pct_time = calc_diff(old_time_in_flood, new_time_in_flood)
    print(f"│ Time in Flood (%)                   │ {old_time_in_flood:>12.2f} │ {new_time_in_flood:>12.2f} │ {diff_time:>+12.2f} │ {pct_time:>12} │")
    
    # Peak
    diff_peak, pct_peak = calc_diff(old_peak, new_peak)
    print(f"│ Peak 10-min Count                   │ {old_peak:>12,} │ {new_peak:>12,} │ {diff_peak:>+12,} │ {pct_peak:>12} │")
    
    print("└─────────────────────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┘")
    
    print()
    print("="*80)
    print("  SOURCE ANALYSIS COMPARISON")
    print("="*80)
    print()
    
    # Compare unique sources
    old_sources = safe_get(old_data, 'unique_sources_summary', 'total_unique_sources')
    new_sources = safe_get(corrected_data, 'unique_sources_summary', 'total_unique_sources')
    
    old_healthy = safe_get(old_data, 'unique_sources_summary', 'healthy_sources')
    new_healthy = safe_get(corrected_data, 'unique_sources_summary', 'healthy_sources')
    
    old_unhealthy = safe_get(old_data, 'unique_sources_summary', 'unhealthy_sources')
    new_unhealthy = safe_get(corrected_data, 'unique_sources_summary', 'unhealthy_sources')
    
    print("┌─────────────────────────────────────┬──────────────┬──────────────┬──────────────┐")
    print("│ Source Metric                       │ OLD (Events) │ NEW (Alarms) │ Difference   │")
    print("├─────────────────────────────────────┼──────────────┼──────────────┼──────────────┤")
    
    diff_src, _ = calc_diff(old_sources, new_sources)
    print(f"│ Total Unique Sources                │ {old_sources:>12,} │ {new_sources:>12,} │ {diff_src:>+12,} │")
    
    diff_h, _ = calc_diff(old_healthy, new_healthy)
    print(f"│ Healthy Sources (< 10 alarms)       │ {old_healthy:>12,} │ {new_healthy:>12,} │ {diff_h:>+12,} │")
    
    diff_u, _ = calc_diff(old_unhealthy, new_unhealthy)
    print(f"│ Unhealthy Sources (≥ 10 alarms)     │ {old_unhealthy:>12,} │ {new_unhealthy:>12,} │ {diff_u:>+12,} │")
    
    print("└─────────────────────────────────────┴──────────────┴──────────────┴──────────────┘")
    
    print()
    print("="*80)
    print("  TOP UNHEALTHY SOURCES COMPARISON")
    print("="*80)
    print()
    
    # Compare top unhealthy sources
    old_top = safe_get(old_data, 'unhealthy_sources_top_n', 'sources', default=[])
    new_top = safe_get(corrected_data, 'unhealthy_sources_top_n', 'sources', default=[])
    
    if old_top or new_top:
        print("Top 5 Unhealthy Sources:")
        print()
        print("┌──────┬─────────────────────────┬──────────────┬──────────────┬──────────────┐")
        print("│ Rank │ Source                  │ OLD Count    │ NEW Count    │ Difference   │")
        print("├──────┼─────────────────────────┼──────────────┼──────────────┼──────────────┤")
        
        max_rows = max(len(old_top), len(new_top))
        for i in range(min(5, max_rows)):
            old_src = old_top[i] if i < len(old_top) else {}
            new_src = new_top[i] if i < len(new_top) else {}
            
            old_name = old_src.get('source', '-')[:23]
            new_name = new_src.get('source', '-')[:23]
            old_count = old_src.get('count', 0)
            new_count = new_src.get('count', 0)
            
            # Use new source name as primary (corrected)
            display_name = new_name if new_name != '-' else old_name
            
            diff = new_count - old_count if (old_count and new_count) else 0
            
            print(f"│ {i+1:>4} │ {display_name:<23} │ {old_count:>12,} │ {new_count:>12,} │ {diff:>+12,} │")
        
        print("└──────┴─────────────────────────┴──────────────┴──────────────┴──────────────┘")
    
    print()
    print("="*80)
    print("  DAILY BREAKDOWN COMPARISON (Sample)")
    print("="*80)
    print()
    
    # Compare by_day samples
    old_by_day = safe_get(old_data, 'by_day', default=[])
    new_by_day = safe_get(corrected_data, 'by_day', default=[])
    
    if old_by_day and new_by_day:
        print("First 5 Days:")
        print()
        print("┌────────────┬──────────────┬──────────────┬──────────────┐")
        print("│ Date       │ OLD Alarms   │ NEW Alarms   │ Difference   │")
        print("├────────────┼──────────────┼──────────────┼──────────────┤")
        
        for i in range(min(5, len(new_by_day))):
            new_day = new_by_day[i]
            date = new_day.get('date', 'Unknown')
            
            # Find matching old day
            old_day = next((d for d in old_by_day if d.get('date') == date), {})
            
            old_alarms = old_day.get('total_alarms', 0)
            new_alarms = new_day.get('total_alarms', 0)
            diff = new_alarms - old_alarms
            
            print(f"│ {date}  │ {old_alarms:>12,} │ {new_alarms:>12,} │ {diff:>+12,} │")
        
        print("└────────────┴──────────────┴──────────────┴──────────────┘")
    
    print()
    print("="*80)
    print("  KEY INSIGHTS")
    print("="*80)
    print()
    
    # Calculate insights
    if old_total > 0:
        events_filtered = old_total - new_total
        events_pct = (events_filtered / old_total) * 100
        
        print(f"✅ Alarm Filtering Results:")
        print(f"   • {events_filtered:,} events filtered out ({events_pct:.1f}% of original data)")
        print(f"   • {new_total:,} actual alarms retained")
        print()
        
        if new_health > old_health:
            health_improvement = new_health - old_health
            print(f"✅ Health Score Improvement:")
            print(f"   • ISA Health increased by {health_improvement:.2f} percentage points")
            print(f"   • From {old_health:.2f}% → {new_health:.2f}%")
            print()
        
        if new_flood_windows < old_flood_windows:
            flood_reduction = old_flood_windows - new_flood_windows
            flood_reduction_pct = (flood_reduction / old_flood_windows) * 100 if old_flood_windows > 0 else 0
            print(f"✅ Flood Windows Reduction:")
            print(f"   • {flood_reduction:,} fewer flood windows ({flood_reduction_pct:.1f}% reduction)")
            print(f"   • More accurate representation of actual alarm flood conditions")
            print()
    
    print(f"📊 Data Quality:")
    print(f"   • Corrected data now ISA 18.2 compliant")
    print(f"   • Events like ACK, OK, SHELVE filtered out")
    print(f"   • Only actual alarm occurrences counted")
    print()
    
    print(f"🎯 Recommendations:")
    print(f"   1. Use corrected metrics for all ISA 18.2 reporting")
    print(f"   2. Update frontend to display corrected health scores")
    print(f"   3. Use corrected data for alarm rationalization decisions")
    print(f"   4. Archive old JSON for historical reference if needed")
    print()
    
    # Save comparison report to file
    report_path = os.path.join(ROOT, 'PVCI-overall-health', 'comparison_report.txt')
    try:
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write("="*80 + "\n")
            f.write("ISA 18.2 ALARM DATA COMPARISON REPORT\n")
            f.write("Generated: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "\n")
            f.write("="*80 + "\n\n")
            
            f.write(f"Old JSON: {os.path.basename(old_path) if old_path else 'N/A'}\n")
            f.write(f"New JSON: {os.path.basename(corrected_path)}\n\n")
            
            f.write("OVERALL METRICS:\n")
            f.write(f"  Total Records:      {old_total:,} → {new_total:,} ({diff_total:+,})\n")
            f.write(f"  ISA Health:         {old_health:.2f}% → {new_health:.2f}% ({diff_health:+.2f})\n")
            f.write(f"  Flood Windows:      {old_flood_windows:,} → {new_flood_windows:,} ({diff_flood:+,})\n")
            f.write(f"  Time in Flood:      {old_time_in_flood:.2f}% → {new_time_in_flood:.2f}% ({diff_time:+.2f})\n")
            f.write(f"  Peak 10-min:        {old_peak:,} → {new_peak:,} ({diff_peak:+,})\n\n")
            
            f.write("SOURCES:\n")
            f.write(f"  Total Sources:      {old_sources:,} → {new_sources:,} ({diff_src:+,})\n")
            f.write(f"  Healthy:            {old_healthy:,} → {new_healthy:,} ({diff_h:+,})\n")
            f.write(f"  Unhealthy:          {old_unhealthy:,} → {new_unhealthy:,} ({diff_u:+,})\n")
        
        print(f"📄 Full report saved to: comparison_report.txt")
        print()
    except Exception as e:
        print(f"⚠️  Warning: Could not save report file: {e}")
        print()
    
    print("="*80)
    print("  ✅ COMPARISON COMPLETE")
    print("="*80)
    print()


def main():
    """Main function."""
    compare_metrics()


if __name__ == '__main__':
    main()
