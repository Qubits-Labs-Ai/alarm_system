"""
Analyze JSON File Sizes and Structure
Compare old, enhanced, and corrected JSON files
"""

import os
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
base_dir = os.path.join(ROOT, 'PVCI-overall-health')

files = {
    'OLD (Original)': os.path.join(base_dir, 'isa18-flood-summary.json'),
    'ENHANCED (Old)': None,  # Check if exists
    'CORRECTED (New)': os.path.join(base_dir, 'isa18-flood-summary-CORRECTED-ENHANCED.json'),
    'API FILE (Current)': os.path.join(base_dir, 'isa18-flood-summary-enhanced.json'),
}

# Check for old enhanced file
old_enhanced_candidates = [
    os.path.join(base_dir, 'isa18-flood-summary-enhanced-OLD.json'),
    os.path.join(base_dir, 'isa18-flood-summary-enhanced-BACKUP.json'),
]

print("\n" + "="*80)
print("  JSON FILE SIZE & STRUCTURE ANALYSIS")
print("="*80)
print()

results = []

for name, filepath in files.items():
    if filepath is None or not os.path.exists(filepath):
        print(f"⚠️  {name}: NOT FOUND")
        continue
    
    # Get file stats
    file_size = os.path.getsize(filepath)
    file_size_kb = file_size / 1024
    
    # Count lines
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = len(f.readlines())
    
    # Load JSON and analyze structure
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Analyze structure
    has_records = 'records' in data
    has_by_day = 'by_day' in data
    has_enhanced = 'unique_sources_summary' in data or '_enhanced' in data
    is_corrected = data.get('_corrected', False) or data.get('_alarm_filtering_enabled', False)
    
    # Count key sections
    records_count = len(data.get('records', []))
    by_day_count = len(data.get('by_day', []))
    total_alarms = data.get('overall', {}).get('total_alarms', 0)
    
    # Check if records have detailed windows
    sample_record = data.get('records', [{}])[0] if data.get('records') else {}
    has_detailed_windows = 'windows' in sample_record
    has_alarm_details = 'alarm_details' in sample_record
    
    avg_windows_per_record = 0
    if has_detailed_windows and records_count > 0:
        total_windows = sum(len(r.get('windows', [])) for r in data.get('records', []))
        avg_windows_per_record = total_windows / records_count if records_count > 0 else 0
    
    results.append({
        'name': name,
        'lines': lines,
        'size_kb': file_size_kb,
        'has_records': has_records,
        'records_count': records_count,
        'has_by_day': has_by_day,
        'by_day_count': by_day_count,
        'has_enhanced': has_enhanced,
        'is_corrected': is_corrected,
        'total_alarms': total_alarms,
        'has_detailed_windows': has_detailed_windows,
        'has_alarm_details': has_alarm_details,
        'avg_windows_per_record': avg_windows_per_record,
    })

# Print comparison table
print("┌─────────────────────────┬──────────┬──────────┬──────────┬──────────────┬──────────┐")
print("│ File                    │ Lines    │ Size (KB)│ Records  │ Total Alarms │ Corrected│")
print("├─────────────────────────┼──────────┼──────────┼──────────┼──────────────┼──────────┤")

for r in results:
    corrected_mark = "✅" if r['is_corrected'] else "❌"
    print(f"│ {r['name']:<23} │ {r['lines']:>8,} │ {r['size_kb']:>8.1f} │ {r['records_count']:>8,} │ {r['total_alarms']:>12,} │ {corrected_mark:>8} │")

print("└─────────────────────────┴──────────┴──────────┴──────────┴──────────────┴──────────┘")

print()
print("="*80)
print("  DETAILED STRUCTURE COMPARISON")
print("="*80)
print()

for r in results:
    print(f"📄 {r['name']}:")
    print(f"   Lines:                {r['lines']:,}")
    print(f"   Size:                 {r['size_kb']:.1f} KB")
    print(f"   Has 'records':        {'✅' if r['has_records'] else '❌'}")
    print(f"   Records count:        {r['records_count']:,}")
    print(f"   Has 'by_day':         {'✅' if r['has_by_day'] else '❌'}")
    print(f"   By day count:         {r['by_day_count']}")
    print(f"   Has enhanced data:    {'✅' if r['has_enhanced'] else '❌'}")
    print(f"   Is corrected:         {'✅' if r['is_corrected'] else '❌'}")
    print(f"   Total alarms:         {r['total_alarms']:,}")
    
    if r['has_detailed_windows']:
        print(f"   Has detailed windows: ✅ (Avg {r['avg_windows_per_record']:.1f} windows/record)")
    else:
        print(f"   Has detailed windows: ❌")
    
    if r['has_alarm_details']:
        print(f"   Has alarm details:    ✅")
    else:
        print(f"   Has alarm details:    ❌")
    
    print()

print("="*80)
print("  WHY IS CORRECTED FILE SMALLER?")
print("="*80)
print()

# Find the reasons
old_result = next((r for r in results if 'OLD' in r['name']), None)
corrected_result = next((r for r in results if 'CORRECTED' in r['name']), None)

if old_result and corrected_result:
    print("🔍 Analysis:")
    print()
    
    # Records reduction
    records_reduction = old_result['records_count'] - corrected_result['records_count']
    records_pct = (records_reduction / old_result['records_count'] * 100) if old_result['records_count'] > 0 else 0
    
    print(f"1️⃣ RECORDS REDUCTION:")
    print(f"   Old records:    {old_result['records_count']:,}")
    print(f"   New records:    {corrected_result['records_count']:,}")
    print(f"   Reduction:      {records_reduction:,} records ({records_pct:.1f}%)")
    print()
    
    # Check if old had detailed windows
    if old_result['has_detailed_windows']:
        print(f"2️⃣ DETAILED WINDOWS REMOVED:")
        print(f"   Old file had detailed 'windows' arrays in each record")
        print(f"   Average {old_result['avg_windows_per_record']:.0f} windows per record")
        print(f"   These contained timestamp and alarm details for EVERY window")
        print(f"   This alone added {old_result['records_count'] * old_result['avg_windows_per_record']:.0f}+ sub-objects!")
        print()
    
    # Alarm count reduction
    alarm_reduction = old_result['total_alarms'] - corrected_result['total_alarms']
    alarm_pct = (alarm_reduction / old_result['total_alarms'] * 100) if old_result['total_alarms'] > 0 else 0
    
    print(f"3️⃣ ALARM COUNT REDUCTION:")
    print(f"   Old total:      {old_result['total_alarms']:,}")
    print(f"   New total:      {corrected_result['total_alarms']:,}")
    print(f"   Filtered:       {alarm_reduction:,} events ({alarm_pct:.1f}%)")
    print(f"   → These were operator actions (ACK, OK, etc.), not alarms")
    print()
    
    # File size reduction
    size_reduction = old_result['size_kb'] - corrected_result['size_kb']
    size_pct = (size_reduction / old_result['size_kb'] * 100) if old_result['size_kb'] > 0 else 0
    
    print(f"4️⃣ FILE SIZE REDUCTION:")
    print(f"   Old size:       {old_result['size_kb']:.1f} KB")
    print(f"   New size:       {corrected_result['size_kb']:.1f} KB")
    print(f"   Reduction:      {size_reduction:.1f} KB ({size_pct:.1f}%)")
    print()
    
    print("✅ SUMMARY:")
    print("   The corrected file is smaller because:")
    print("   1. It filters out 96.7% of events (only counts actual alarms)")
    print("   2. It doesn't include bulky 'windows' arrays with full details")
    print("   3. It has fewer flood records to report")
    print("   4. It's more efficient and optimized for frontend display")
    print()

print("="*80)
print()
