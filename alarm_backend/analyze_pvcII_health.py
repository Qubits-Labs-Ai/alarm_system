#!/usr/bin/env python3
"""
PVC-II Health Analysis Script
Analyzes the PVCII-overall-health data to calculate accurate health percentages.
"""

import json
import os
from collections import defaultdict, Counter
from datetime import datetime

def analyze_pvcII_data():
    """Analyze PVC-II data and calculate comprehensive health statistics."""
    
    # Load the JSON data
    json_file_path = os.path.join(
        os.path.dirname(__file__), "PVCII-overall-health", "Why_Unhealthy_Report_WithSource.json"
    )
    
    if not os.path.exists(json_file_path):
        print(f"❌ File not found: {json_file_path}")
        return
    
    print(f"📂 Loading data from: {json_file_path}")
    
    with open(json_file_path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    
    print(f"📊 Total records loaded: {len(rows)}")
    
    # Analyze the data structure
    all_sources = set()
    all_conditions = set()
    all_priorities = set()
    all_files = set()
    location_tags = set()
    
    unhealthy_sources = defaultdict(int)  # source -> count of unhealthy intervals
    source_conditions = defaultdict(set)  # source -> set of conditions
    source_priorities = defaultdict(set)  # source -> set of priorities
    
    alarm_threshold = 10
    
    def _s(x):
        return "" if x is None else str(x)
    
    # Deduplicate per (Interval_Start, Source, Condition, Description, Source_File)
    grouped = {}
    
    for rec in rows:
        if not isinstance(rec, dict):
            continue
        
        source = _s(rec.get("Source"))
        condition = _s(rec.get("Condition"))
        priority = _s(rec.get("Priority"))
        source_file = _s(rec.get("Source_File") or rec.get("SourceFile"))
        location_tag = _s(rec.get("Location Tag"))
        
        if source:
            all_sources.add(source)
        if condition:
            all_conditions.add(condition)
        if priority:
            all_priorities.add(priority)
        if source_file:
            all_files.add(source_file)
        if location_tag:
            location_tags.add(location_tag)
        
        key = (
            _s(rec.get("Interval_Start")),
            source,
            condition,
            _s(rec.get("Description")),
            source_file,
        )
        
        if key not in grouped:
            grouped[key] = rec
    
    print(f"\n🔍 Data Analysis:")
    print(f"   📈 Unique sources: {len(all_sources)}")
    print(f"   📈 Unique conditions: {len(all_conditions)}")
    print(f"   📈 Unique priorities: {len(all_priorities)}")
    print(f"   📈 Unique files: {len(all_files)}")
    print(f"   📈 Location tags: {len(location_tags)}")
    print(f"   📈 Deduplicated intervals: {len(grouped)}")
    
    print(f"\n📋 Conditions found: {sorted(all_conditions)}")
    print(f"📋 Priorities found: {sorted(all_priorities)}")
    print(f"📋 Location tags: {sorted(location_tags)}")
    
    # Count unhealthy intervals per source
    for (_, src, _, _, _), rec in grouped.items():
        if not src:
            continue
        
        try:
            hv = rec.get("Hits_in_10min")
            hits = int(hv) if hv is not None else 0
        except Exception:
            try:
                hits = int(float(rec.get("Hits_in_10min") or 0))
            except Exception:
                hits = 0
        
        condition = _s(rec.get("Condition"))
        priority = _s(rec.get("Priority"))
        
        source_conditions[src].add(condition)
        source_priorities[src].add(priority)
        
        if hits >= alarm_threshold:
            unhealthy_sources[src] += 1
    
    # Calculate health statistics
    total_sources = len(all_sources)
    unhealthy_source_count = len(unhealthy_sources)
    healthy_source_count = total_sources - unhealthy_source_count
    
    if total_sources > 0:
        health_pct_simple = (healthy_source_count / total_sources) * 100
        unhealthy_pct = (unhealthy_source_count / total_sources) * 100
    else:
        health_pct_simple = 100.0
        unhealthy_pct = 0.0
    
    print(f"\n🏥 Health Statistics:")
    print(f"   ✅ Total sources: {total_sources}")
    print(f"   ❤️  Healthy sources: {healthy_source_count}")
    print(f"   ⚠️  Unhealthy sources: {unhealthy_source_count}")
    print(f"   📊 Health percentage: {health_pct_simple:.1f}%")
    print(f"   📊 Unhealthy percentage: {unhealthy_pct:.1f}%")
    
    # Analyze unhealthy sources by severity
    severity_bins = {"0-50": 0, "51-100": 0, "101-200": 0, "200+": 0}
    
    for src, bins in unhealthy_sources.items():
        if bins <= 50:
            severity_bins["0-50"] += 1
        elif bins <= 100:
            severity_bins["51-100"] += 1
        elif bins <= 200:
            severity_bins["101-200"] += 1
        else:
            severity_bins["200+"] += 1
    
    print(f"\n📈 Unhealthy Sources by Severity:")
    for bin_range, count in severity_bins.items():
        print(f"   {bin_range} bins: {count} sources")
    
    # Show top 10 most unhealthy sources
    if unhealthy_sources:
        print(f"\n🔥 Top 10 Most Unhealthy Sources:")
        top_unhealthy = sorted(unhealthy_sources.items(), key=lambda x: x[1], reverse=True)[:10]
        for i, (src, bins) in enumerate(top_unhealthy, 1):
            conditions = ", ".join(sorted(source_conditions[src]))
            priorities = ", ".join(sorted(source_priorities[src]))
            print(f"   {i:2d}. {src}: {bins} intervals")
            print(f"       Conditions: {conditions}")
            print(f"       Priorities: {priorities}")
    
    # Show some healthy sources for comparison
    healthy_sources_list = [src for src in all_sources if src not in unhealthy_sources]
    if healthy_sources_list:
        print(f"\n✅ Sample Healthy Sources (first 10):")
        for i, src in enumerate(healthy_sources_list[:10], 1):
            conditions = ", ".join(sorted(source_conditions.get(src, set())))
            priorities = ", ".join(sorted(source_priorities.get(src, set())))
            print(f"   {i:2d}. {src}")
            if conditions:
                print(f"       Conditions: {conditions}")
            if priorities:
                print(f"       Priorities: {priorities}")
    
    # Time range analysis
    time_stamps = []
    for rec in rows:
        event_time = rec.get("Event Time")
        if event_time:
            try:
                dt = datetime.fromisoformat(event_time.replace(" ", "T"))
                time_stamps.append(dt)
            except:
                pass
    
    if time_stamps:
        time_stamps.sort()
        print(f"\n⏰ Time Range Analysis:")
        print(f"   📅 Earliest event: {time_stamps[0]}")
        print(f"   📅 Latest event: {time_stamps[-1]}")
        print(f"   📅 Duration: {time_stamps[-1] - time_stamps[0]}")
    
    return {
        "total_sources": total_sources,
        "healthy_sources": healthy_source_count,
        "unhealthy_sources": unhealthy_source_count,
        "health_percentage": health_pct_simple,
        "unhealthy_percentage": unhealthy_pct,
        "severity_bins": severity_bins,
        "total_files": len(all_files),
        "conditions": sorted(all_conditions),
        "priorities": sorted(all_priorities),
        "location_tags": sorted(location_tags)
    }

if __name__ == "__main__":
    print("🔍 PVC-II Health Data Analysis")
    print("=" * 50)
    
    stats = analyze_pvcII_data()
    
    print(f"\n✅ Analysis Complete!")
    print(f"📊 Summary: {stats['health_percentage']:.1f}% healthy, {stats['unhealthy_percentage']:.1f}% unhealthy")
