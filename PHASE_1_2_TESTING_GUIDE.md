# Phase 1 & 2 Testing Guide

## Bugs Fixed

### 1. ✅ Calendar Component Data Mapping (FIXED)
**Problem**: Calendar showed "Invalid Date 0" for all cells
**Root Cause**: Backend returns `Date` and `Alarm_Count` (capitalized), frontend expected `date` and `alarm_count` (lowercase)
**Fix**: Updated `CalendarDailyHeatmap.tsx` line 111 to use correct field names
**Status**: READY TO TEST (should work immediately after browser refresh)

### 2. ✅ Missing INSTRUMENT_KEYWORDS Constant (FIXED)
**Problem**: HTTP 500 errors on `/summary/categories`, `/summary/sankey`, `/summary/hourly_matrix`
**Root Cause**: `INSTRUMENT_KEYWORDS` constant referenced but never defined in `actual_calc_service.py`
**Fix**: Added `INSTRUMENT_KEYWORDS = ["FAIL", "BAD", "INSTRUMENT"]` constant at line 192
**Status**: NEEDS BACKEND RESTART

## Testing Steps

### Step 1: Restart Backend
```bash
cd d:\Qbit-dynamics\alarm_system\alarm_backend
# Stop current server (Ctrl+C)
uvicorn main:app --reload --port 8000
```

### Step 2: Clear Browser Cache & Refresh
- Press `Ctrl + Shift + R` (hard refresh)
- Or clear site data in DevTools

### Step 3: Test Each Chart

#### ✅ CalendarDailyHeatmap (Should Work Immediately)
- **Location**: Dashboard → Mode: Actual Calc → Alarm Summary tab
- **Expected**: Calendar shows actual dates and alarm counts with color coding
- **Verify**: 
  - Green cells = OK days (<216 alarms)
  - Yellow cells = Manageable (216-287 alarms)  
  - Orange cells = Overloaded (288-719 alarms)
  - Red cells = Unacceptable (≥720 alarms)

#### ✅ CompositionSankey (Should Work After Backend Restart)
- **Location**: Same tab, top-left chart
- **Expected**: Proportional bars showing Total → Standing/Nuisance/Flood/Other
- **Verify**: Sub-categories shown (Stale/IF for Standing, Chattering/IF-Chattering for Nuisance)

#### ✅ TotalsWaterfall (Should Work After Backend Restart)
- **Location**: Same tab, top-right chart  
- **Expected**: Waterfall showing Total → -Standing → -Nuisance → -Flood → =Other
- **Verify**: Summary table shows percentages

#### ✅ CategoryTrendArea (Should Work After Backend Restart)
- **Location**: Same tab, full-width chart below Sankey/Waterfall
- **Expected**: Stacked area chart with Day/Week/Month toggle
- **Verify**: Toggle changes aggregation, colors match category scheme

#### ✅ SeasonalityHeatmap (Should Work After Backend Restart)
- **Location**: Same tab, bottom-right chart
- **Expected**: 7×24 heatmap (Monday-Sunday × 0-23 hours)
- **Verify**: Green intensity shows alarm patterns, star marks peak hour

## Phase 1 & 2 Components Summary

### Phase 1: ✅ Category Trend
- CategoryTrendArea with Day/Week/Month grain

### Phase 2: ✅ Four Additional Charts
1. CompositionSankey - Proportional category flow
2. TotalsWaterfall - Exclusive reconciliation  
3. CalendarDailyHeatmap - ISO compliance calendar
4. SeasonalityHeatmap - Hour × DOW patterns

### Backend Endpoints
- `GET /actual-calc/{plant_id}/summary/categories?grain=day|week|month&include_system=true|false`
- `GET /actual-calc/{plant_id}/summary/hourly_matrix?include_system=true|false`
- `GET /actual-calc/{plant_id}/summary/sankey?include_system=true|false`

### Category Classification Logic
**Precedence**: Standing > Nuisance > Flood > Other (mutually exclusive)

- **Standing**: Alarms active ≥60 minutes
  - Sub-types: Stale (normal) vs Instrument Failure (FAIL/BAD in condition)
- **Nuisance**: Chattering episodes (≥3 alarms in 10 minutes)
  - Sub-types: Chattering vs IF-Chattering
- **Flood**: Alarms during overlapping unhealthy periods from ≥2 sources
- **Other**: All remaining activations

### Known Performance Notes
- First load may take 10-30 seconds (processes entire CSV)
- Results cached for 15 minutes
- Calendar uses existing cached data (instant load)

## Troubleshooting

### If Calendar Still Shows Invalid Date:
- Check browser console for API response
- Verify `/actual-calc/{plant_id}/overall` returns `frequency.alarms_per_day` array
- Expected structure: `[{Date: "2025-01-01", Alarm_Count: 123}, ...]`

### If New Charts Return 500:
1. Check backend console for Python traceback
2. Verify `INSTRUMENT_KEYWORDS` is defined (line 192)
3. Check sys.path includes `PVCI-actual-calc` directory
4. Verify imports: `compute_exclusive_categories_per_activation`, `compute_category_sankey`, etc.

### If Charts Load But Show No Data:
- Verify plant has cached data: Check `PVCI-actual-calc/*.json` files
- Regenerate cache: Click "Regenerate Cache" button in dashboard
- Check logs for classification completion

## Next: Phase 3 (Future)
- Standing Timeline (Gantt chart)
- Nuisance Pareto with Top-N=15 default
- Optional: Treemap with Area/System hierarchy (requires source catalog mapping)
