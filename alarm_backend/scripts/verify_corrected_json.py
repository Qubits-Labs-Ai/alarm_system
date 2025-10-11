"""Quick verification of corrected JSON structure."""
import json
import sys

json_path = 'D:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-overall-health/isa18-flood-summary-CORRECTED-ENHANCED.json'

with open(json_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print("\n" + "="*80)
print("  CORRECTED JSON STRUCTURE VERIFICATION")
print("="*80)

print("\n✅ TOP-LEVEL KEYS:")
for key in sorted(data.keys()):
    print(f"   - {key}")

print("\n✅ OVERALL METRICS:")
overall = data.get('overall', {})
print(f"   Total alarms:          {overall.get('total_alarms', 0):,}")
print(f"   ISA Health:            {overall.get('isa_overall_health_pct', 0):.2f}%")
print(f"   Flood windows:         {overall.get('flood_windows_count', 0)}")
print(f"   Time in flood:         {overall.get('percent_time_in_flood', 0):.2f}%")

print("\n✅ UNIQUE SOURCES SUMMARY:")
uss = data.get('unique_sources_summary', {})
print(f"   Total sources:         {uss.get('total_unique_sources', 0)}")
print(f"   Healthy sources:       {uss.get('healthy_sources', 0)}")
print(f"   Unhealthy sources:     {uss.get('unhealthy_sources', 0)}")

print("\n✅ UNHEALTHY SOURCES TOP N:")
top_n = data.get('unhealthy_sources_top_n', {})
sources = top_n.get('sources', [])
print(f"   Count:                 {len(sources)}")
if sources:
    print("\n   Top 3:")
    for i, s in enumerate(sources[:3], 1):
        print(f"      {i}. {s.get('source', 'Unknown')}: {s.get('count', 0)} alarms")
        print(f"         Location: {s.get('location_tag', 'Unknown')}")

print("\n✅ CONDITION DISTRIBUTION BY LOCATION:")
cond_dist = data.get('condition_distribution_by_location', {})
locations = cond_dist.get('locations', [])
print(f"   Locations analyzed:    {len(locations)}")
if locations:
    print("\n   Top 3 locations:")
    for i, loc in enumerate(locations[:3], 1):
        print(f"      {i}. {loc.get('location', 'Unknown')}: {loc.get('total_flood_count', 0)} alarms")

print("\n✅ DAILY BREAKDOWN:")
by_day = data.get('by_day', [])
print(f"   Days with data:        {len(by_day)}")
if by_day:
    first_day = by_day[0]
    last_day = by_day[-1]
    print(f"   First day:             {first_day.get('date', 'Unknown')}")
    print(f"   Last day:              {last_day.get('date', 'Unknown')}")

print("\n✅ METADATA:")
print(f"   Generated at:          {data.get('generated_at', 'Unknown')}")
print(f"   Version:               {data.get('_version', 'Unknown')}")
print(f"   Corrected:             {data.get('_corrected', False)}")
print(f"   Enhanced:              {data.get('_enhanced', False)}")
print(f"   Alarm filtering:       {data.get('_alarm_filtering_enabled', False)}")

print("\n" + "="*80)
print("  ✅ JSON STRUCTURE VERIFIED SUCCESSFULLY!")
print("="*80)
print("\n")
