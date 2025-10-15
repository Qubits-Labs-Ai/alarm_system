# Unhealthy Bar Chart - Flood Count Analysis & Fix

## Problem Statement

The Unhealthy Bar Chart in PVC-I Plant-Wide mode was showing misleading information:
- **AI_PH10** displayed a flood count of **1,489**
- The tooltip showed a 10-minute window time range
- This created confusion about whether the count was for a single window or aggregate data

## Root Cause Analysis

### How Flood Count is Calculated

#### Backend Logic (`isa18_flood_monitor_enhanced.py`)

The `compute_unhealthy_sources_top_n()` function (lines 449-580):

```python
def compute_unhealthy_sources_top_n(...):
    # Iterates through ALL CSV alarm files
    for fp in files:
        df = _read_rows_for_file(fp, alarms_only=alarms_only, include_system=include_system)
        
        # Counts EVERY alarm event for each source
        for _, row in df.iterrows():
            src = str(row.get("Source", "") or "Unknown").strip()
            source_data[src]["count"] += 1  # <-- Sums ALL events
    
    # Then filters to show only sources with count >= threshold
    unhealthy = {
        src: data 
        for src, data in source_data.items() 
        if data["count"] >= threshold  # <-- Only affects which sources are shown
    }
```

**Key Finding:** The flood count represents **ALL alarm events across the entire observation range**, NOT per window.

### Answer to Your Questions

#### Q1: Is this the sum of all unhealthy flood windows or sum of total healthy/unhealthy both?

**Answer: It's the sum of ALL alarm events (both healthy and unhealthy windows combined).**

The backend logic:
1. **Counts EVERY single alarm event** for each source across all time
2. **Applies time filtering** (if start_time/end_time are provided)
3. **Filters which sources to display** based on total count >= threshold (10)
4. **Does NOT** filter events based on whether they're in healthy or unhealthy windows

So **AI_PH10 with 1,489 alarms** means:
- This source had 1,489 total alarm events in the observation range
- These events occurred across BOTH healthy windows (< 10 alarms/10min) and unhealthy windows (>= 10 alarms/10min)
- The source only appears in the chart because its total count exceeds the threshold

#### Q2: How much time window data does this represent?

The observation range varies based on:
- **If no date range filter**: Covers all available CSV data (could be months)
- **If date range applied**: Covers that specific range
- **If specific window selected**: Shows only that 10-minute window's data

## Chart Behavior

### Two Operating Modes

| State | Flood Count Represents | Data Source |
|-------|------------------------|-------------|
| **No window selected** | Total aggregate count across entire observation range | `fetchPvciIsaFloodSummaryEnhanced()` → `unhealthy_sources_top_n` |
| **Window selected** | Count only within that specific 10-minute window | `topWindows[].top_sources` from pre-computed data |

### Code Reference

**Frontend:** `alarm_frontend/src/pages/DashboardPage.tsx`, lines 203-479

```typescript
// Line 209: Flood mode logic
if (mode === 'flood' && selectedPlant.id === 'pvcI') {
  if (selectedWindow) {
    // Use window-specific pre-computed top_sources
    bars = (topSources || []).map((s) => ({
      hits: Number(s.count || 0),  // <-- Window-specific count
      ...
    }));
  } else {
    // Use enhanced endpoint for aggregate data
    const enhancedRes = await fetchPvciIsaFloodSummaryEnhanced({...});
    const unhealthySources = enhancedRes?.unhealthy_sources_top_n;
    bars = filteredSources.map((s: any) => ({
      hits: Number(s.hits || 0),  // <-- Aggregate total count
      ...
    }));
  }
}
```

## Implemented Solution

### Changes Made

#### 1. Enhanced Tooltip Information

**File:** `alarm_frontend/src/components/dashboard/UnhealthyBarChart.tsx`

**Changes:**
- Added detection for aggregate vs. window-specific data
- Calculate and display observation duration
- Show approximate number of 10-minute windows
- Clear visual indicators (⚠️ for aggregate, ✓ for single window)

**Tooltip now shows:**

For **Aggregate Data** (no window selected):
```
AI_PH10
Total alarm count: 1489
⚠️ Aggregate data across entire observation range
Duration: 14 days (~2,016 windows)

Observation range:
Local: 10/1/2025, 2:06:24 PM - 10/14/2025, 2:18:24 PM
UTC: 10/1/2025, 9:06:24 AM - 10/14/2025, 9:18:24 AM
```

For **Single Window Data** (window selected):
```
AI_PH10
Flood count: 45
✓ Single 10-minute window data

Window:
Local: 10/14/2025, 2:06:24 PM - 10/14/2025, 2:16:24 PM
UTC: 10/14/2025, 9:06:24 AM - 10/14/2025, 9:16:24 AM
```

#### 2. Updated Chart Title/Description

**Before:**
```
Unhealthy Bar Chart
Sources exceeding threshold of 10 hits
```

**After (Aggregate mode):**
```
Unhealthy Bar Chart
Sources exceeding threshold of 10 hits (Aggregate totals across observation range)
```

**After (Window selected):**
```
Unhealthy Bar Chart
Sources exceeding threshold of 10 hits (Single 10-minute window)
```

#### 3. Updated Y-Axis Label

- **Aggregate mode:** "Total alarm count"
- **Window-specific mode:** "Flood count"

### Visual Design

- **Aggregate indicator:** Amber/yellow color (⚠️ warning style)
- **Window-specific indicator:** Green color (✓ confirmation style)
- **Consistent labeling:** "Observation range" vs "Window"
- **Duration display:** Shows days/hours + approximate window count

## Testing Recommendations

1. **Test Aggregate View:**
   - Open PVC-I Plant-Wide mode
   - Don't select any window
   - Hover over bars → Should see amber warning with duration
   - Verify Y-axis says "Total alarm count"

2. **Test Window-Specific View:**
   - Select a 10-minute window from the dropdown
   - Hover over bars → Should see green checkmark
   - Verify Y-axis says "Flood count"
   - Counts should be much smaller (10-100 range typically)

3. **Test Date Range Filter:**
   - Apply different observation ranges
   - Verify duration in tooltip updates correctly
   - Verify window count approximation is reasonable

## Example Calculation

For **AI_PH10** with **1,489 alarms** over **14 days**:

```
Duration: 14 days = 20,160 minutes
10-minute windows: 20,160 / 10 = 2,016 windows
Average alarms per window: 1,489 / 2,016 ≈ 0.74 alarms/window

This means:
- Most windows are HEALTHY (< 10 alarms)
- A few windows have HIGH spikes (causing unhealthy status)
- The 1,489 total includes both healthy and unhealthy windows
```

This is why it's critical to distinguish aggregate totals from single-window counts!

## Impact

### User Benefits

1. **No more confusion** about time ranges
2. **Clear understanding** of data scope
3. **Visual indicators** for quick recognition
4. **Accurate context** for decision-making

### Technical Benefits

1. **Explicit labeling** prevents misinterpretation
2. **Calculation transparency** builds trust
3. **Mode-aware UI** adapts to data type
4. **Maintains backward compatibility** with existing code

## Future Enhancements (Optional)

1. **Add "per window average" metric** to aggregate view
2. **Show healthy vs unhealthy window breakdown**
3. **Add sparkline visualization** showing trend over time
4. **Include peak window information** in aggregate tooltip
5. **Add export functionality** with full metadata

## Related Files

- `alarm_frontend/src/components/dashboard/UnhealthyBarChart.tsx` - Chart component
- `alarm_frontend/src/pages/DashboardPage.tsx` - Data fetching logic
- `alarm_backend/isa18_flood_monitor_enhanced.py` - Backend aggregation logic
- `alarm_frontend/src/api/plantHealth.ts` - API client

---

**Date:** October 14, 2025  
**Author:** AI Analysis & Implementation  
**Status:** ✅ Implemented and Ready for Testing
