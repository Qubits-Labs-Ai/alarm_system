# Alarm Seasonality Chart - Weekend vs Weekday Analysis Enhancement

## Overview

The **Alarm Seasonality** chart in the Actual-Calc dashboard has been enhanced with intelligent weekend vs weekday pattern analysis. Instead of just displaying a generic statement, the chart now **automatically analyzes your data** and provides **specific, actionable insights** about operational differences between weekends and weekdays.

---

## What Changed

### 1. **Automatic Pattern Detection**
The system now calculates:
- **Weekday Average** (Mon-Fri): Average alarm activations per hour across all weekdays
- **Weekend Average** (Sat-Sun): Average alarm activations per hour across weekends
- **Percentage Difference**: How much weekday and weekend patterns differ
- **Variance Analysis**: Statistical measure of consistency within each group

### 2. **Visual Enhancements**
- **Weekend rows (Sat/Sun)** are now highlighted with a subtle background color and border
- **Weekend labels** appear in a darker color to make them stand out
- **New statistics cards** show weekday and weekend averages side-by-side

### 3. **Intelligent Insights**
The insights section now provides:
- **Data-driven analysis** based on actual calculated metrics
- **Automatic detection** of significant differences (>15% variance)
- **Contextual explanations** of what the patterns mean
- **Actionable recommendations** based on the detected patterns

---

## Understanding "Weekend vs Weekday Differences Indicate Process Variation"

### What It Means

This pattern refers to **how your industrial process operates differently** on weekends compared to weekdays. The analysis helps you understand:

#### **If Weekend Activity is HIGHER:**
- **Possible Causes:**
  - Understaffing during weekends
  - Deferred maintenance issues surfacing
  - Different operational procedures
  - Equipment running unattended
  
- **What to Do:**
  - Review weekend staffing levels
  - Investigate recurring weekend alarms
  - Check if maintenance activities trigger unnecessary alarms
  - Consider weekend-specific alarm suppression rules

#### **If Weekday Activity is HIGHER:**
- **Possible Causes:**
  - Higher production volumes during the week
  - More operators = more interventions
  - Batch processing schedules
  - Planned weekend downtime
  
- **What to Do:**
  - This is typical for scheduled operations
  - Ensure weekend alarm coverage matches activity level
  - Consider if weekday peaks correlate with shift changes

#### **If Weekend and Weekday are SIMILAR:**
- **What It Means:**
  - 24/7 continuous operations
  - Consistent staffing patterns
  - Stable operational procedures
  - Minimal schedule variation
  
- **What to Do:**
  - This indicates good operational consistency
  - Continue monitoring for any emerging patterns

---

## New Features Breakdown

### 1. Weekend vs Weekday Pattern Analysis Card

**Green Indicator (●)**: Consistent operations (difference <15%)
**Amber Indicator (●)**: Significant difference detected (>15%)

The card shows:
- Which period (weekend/weekday) has higher activity
- Exact percentage difference
- Specific average values for comparison
- Explanation of what this means for your operations
- Recommended actions based on the pattern

### 2. High Variability Warning (Conditional)

If your alarm patterns show high variance (>30% coefficient of variation), you'll see an amber warning card explaining:
- **What it means**: Unpredictable operational behavior
- **Potential causes**: Shift changes, batch cycles, equipment cycling
- **Recommended actions**: Investigate peak hours, standardize procedures

### 3. Enhanced Statistics Grid

Now includes 5 metrics:
1. **Average (All Hours)**: Overall baseline
2. **Peak Hour**: Highest activity period
3. **Peak vs Average**: How much higher the peak is
4. **Weekday Average**: Mon-Fri average (highlighted)
5. **Weekend Average**: Sat-Sun average (highlighted)

### 4. "How to Read This Chart" Guide

Explains:
- What darker cells mean
- What the star (★) indicates
- Why weekend rows are highlighted
- How to interpret vertical patterns (time-based cycles)
- How to interpret horizontal patterns (daily rhythms)

---

## Technical Implementation

### Calculations Performed

```typescript
// Weekend vs Weekday Averages
weekdayIndices = [0, 1, 2, 3, 4] // Mon-Fri
weekendIndices = [5, 6]          // Sat-Sun

weekdayAvg = average of all activations on Mon-Fri
weekendAvg = average of all activations on Sat-Sun

// Percentage Difference
weekdayWeekendDiffPct = ((weekdayAvg - weekendAvg) / weekdayAvg) × 100

// Standard Deviation (Variance)
weekdayStdDev = σ of weekday values
weekendStdDev = σ of weekend values

// Pattern Detection
hasSignificantDifference = |weekdayWeekendDiffPct| > 15%
highVariance = (σ / mean) > 0.3 for either group
```

### Data Source

The analysis uses the same backend data from:
- **Backend Function**: `compute_hourly_seasonality_matrix()` in `actual_calc_service.py`
- **API Endpoint**: `/actual-calc/{plant_id}/summary/hourly_matrix`
- **Data Structure**: 7×24 matrix (7 days × 24 hours) with average activations per cell

---

## Example Scenarios

### Scenario 1: Continuous Manufacturing Plant
```
Weekday Average: 52.3 activations/hour
Weekend Average: 51.8 activations/hour
Difference: 0.96% (Not significant)

Insight: "Consistent operational pattern - 24/7 continuous operations"
```

### Scenario 2: Batch Processing Facility
```
Weekday Average: 68.4 activations/hour
Weekend Average: 23.1 activations/hour
Difference: 66.2% (Significant)

Insight: "Weekday activity is 66.2% higher - Lower weekend activity 
suggests reduced production schedules or planned downtime"
```

### Scenario 3: Understaffed Weekend Operations
```
Weekday Average: 45.2 activations/hour
Weekend Average: 72.8 activations/hour
Difference: 61.0% (Significant)

Insight: "Weekend activity is 61.0% higher - May indicate understaffing, 
deferred maintenance issues, or different operational procedures"
```

---

## Benefits

1. **Automatic Analysis**: No manual calculation needed
2. **Data-Driven Insights**: Based on actual metrics, not generic statements
3. **Actionable Recommendations**: Specific next steps for each pattern
4. **Visual Clarity**: Weekend rows highlighted for easy pattern recognition
5. **Operational Intelligence**: Understand your process behavior better

---

## Files Modified

- `alarm_frontend/src/components/actualCalc/AlarmSummary/SeasonalityHeatmap.tsx`

### Changes Made:
- Added weekend vs weekday calculation logic (lines 172-198)
- Enhanced heatmap with weekend row highlighting (lines 237-262)
- Expanded statistics grid to 5 cards (lines 287-314)
- Replaced generic insights with intelligent analysis (lines 316-407)

---

## Next Steps

1. **Review your plant's data** in the Alarm Seasonality chart
2. **Check the weekend vs weekday analysis** to understand your operational patterns
3. **Act on recommendations** if significant differences are detected
4. **Monitor trends** over time to see if interventions improve consistency

---

**Last Updated**: 2025-11-26
**Component**: Alarm Seasonality Heatmap
**Location**: Actual-Calc Dashboard → Alarm Summary Tab
