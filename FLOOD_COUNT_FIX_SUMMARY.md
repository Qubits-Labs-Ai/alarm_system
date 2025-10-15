# Flood Count Fix - Quick Summary

## ✅ What Was Fixed

The Unhealthy Bar Chart now clearly distinguishes between:
1. **Aggregate data** (sum across entire observation range)
2. **Single window data** (one 10-minute window)

---

## 🎯 Answer to Your Questions

### Q: Is this sum of all unhealthy flood windows or sum of total healthy/unhealthy both?

**A: It's the sum of ALL alarm events (both healthy AND unhealthy windows combined).**

Example for AI_PH10 with 1,489 alarms:
- ✅ Includes alarms from healthy windows (< 10 alarms/10min)
- ✅ Includes alarms from unhealthy windows (>= 10 alarms/10min)
- ✅ The source appears because total count >= threshold (10)
- ❌ NOT just unhealthy windows

### Q: How much time window data is this?

**A: It depends on the observation range:**
- If no filter applied: Could be weeks/months of data
- If date range applied: That specific range
- If window selected: Only that 10-minute window

**For AI_PH10's 1,489 alarms:**
- If observation is 14 days → ~2,016 windows → avg 0.74 alarms/window
- Most windows are healthy, but it appears because total exceeds threshold

---

## 📊 Visual Changes

### Before Fix
```
Unhealthy Bar Chart
Sources exceeding threshold of 10 hits

[Hover tooltip]
AI_PH10
Flood count: 1489
Local: 10/1/2025... - 10/14/2025...
```
❌ Confusing! Looks like a single window but shows huge count

### After Fix - Aggregate View
```
Unhealthy Bar Chart
Sources exceeding threshold of 10 hits (Aggregate totals across observation range)

[Hover tooltip]
AI_PH10
Total alarm count: 1489
⚠️ Aggregate data across entire observation range
Duration: 14 days (~2,016 windows)

Observation range:
Local: 10/1/2025... - 10/14/2025...
```
✅ Clear! Shows it's aggregate data with duration

### After Fix - Window View
```
Unhealthy Bar Chart
Sources exceeding threshold of 10 hits (Single 10-minute window)

[Hover tooltip]
AI_PH10
Flood count: 45
✓ Single 10-minute window data

Window:
Local: 10/14/2025, 2:06:24 PM - 10/14/2025, 2:16:24 PM
```
✅ Clear! Shows it's a single window with realistic count

---

## 🔍 Key Changes Made

| Element | Before | After (Aggregate) | After (Window) |
|---------|--------|-------------------|----------------|
| **Y-axis label** | Flood count | Total alarm count | Flood count |
| **Chart description** | Sources exceeding... | ...*(Aggregate totals)* | ...*(Single 10-minute window)* |
| **Tooltip label** | Flood count | Total alarm count | Flood count |
| **Visual indicator** | None | ⚠️ Amber warning | ✓ Green check |
| **Duration info** | None | Duration + window count | Window timespan |
| **Range label** | Local/UTC times | Observation range: | Window: |

---

## 🧪 How to Test

### Test 1: Aggregate View
1. Navigate to PVC-I Plant-Wide mode
2. Don't select any window (leave default view)
3. Hover over any bar
4. **Expected:** 
   - See amber ⚠️ warning
   - Label says "Total alarm count"
   - Shows duration (days/hours) and window count
   - Y-axis says "Total alarm count"

### Test 2: Single Window View
1. Click "10-min Window" button
2. Select a specific window from the slider
3. Hover over any bar
4. **Expected:**
   - See green ✓ checkmark
   - Label says "Flood count"
   - Shows single window timespan
   - Y-axis says "Flood count"
   - Counts are much smaller (10-100 range)

### Test 3: Switch Between Modes
1. Start in aggregate view → note the counts
2. Select a window → counts should drop dramatically
3. Clear window → counts go back to aggregate totals
4. Verify labels update correctly each time

---

## 📁 Files Changed

- ✅ `alarm_frontend/src/components/dashboard/UnhealthyBarChart.tsx`
  - Enhanced tooltip with duration calculation
  - Updated chart description
  - Updated Y-axis label
  - Added visual indicators

---

## 💡 Quick Reference

### When you see large counts (1000+):
→ It's **aggregate data** across many windows (days/weeks)

### When you see small counts (10-100):
→ It's **single window data** for 10 minutes

### Color coding:
- 🟡 **Amber/Yellow** = Aggregate warning
- 🟢 **Green** = Single window confirmation

---

## 📞 Need More Info?

See full analysis: `FLOOD_COUNT_ANALYSIS.md`

**Status:** ✅ Ready for Testing  
**Date:** October 14, 2025
