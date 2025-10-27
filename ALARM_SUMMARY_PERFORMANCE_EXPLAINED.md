# Alarm Summary Performance - Why It's Slow & How We Fixed It

## Why These 3 Charts Take 2-4 Minutes (vs <1s for Other Charts)

### **Fast Charts** (existing ones - load in <1 second):
| Chart | Data Source | Processing |
|-------|-------------|------------|
| KPI Cards | `All_Merged-actual-calc.json` | ✅ Pre-computed JSON |
| Bad Actors | `All_Merged-actual-calc.json` | ✅ Pre-computed JSON |
| Unhealthy Sources | `All_Merged-actual-calc.json` | ✅ Pre-computed JSON |
| Flood Windows | `All_Merged-actual-calc.json` | ✅ Pre-computed JSON |
| Plant-wide Charts | `All_Merged-actual-calc.json` | ✅ Pre-computed JSON |
| Per-source Mode | `All_Merged-actual-calc.json` | ✅ Pre-computed JSON |

**Why they're fast:**
- Data is **pre-computed** during JSON generation (runs once, offline)
- Backend just reads JSON and returns it
- No CSV parsing, no state machines, no heavy computation

---

### **Slow Charts** (these 3 new ones - take 2-4 minutes):
| Chart | Data Source | Processing |
|-------|-------------|------------|
| Alarm Composition (Sankey) | Raw CSV (65MB) | ❌ ON-DEMAND computation |
| Category Trend (Area) | Raw CSV (65MB) | ❌ ON-DEMAND computation |
| Alarm Seasonality (Heatmap) | Raw CSV (65MB) | ❌ ON-DEMAND computation |

**Why they're slow:**
1. **Load entire CSV** (65MB for PVCI, 29MB for VCMA)
2. **Parse millions of timestamps** (each row has `Event Time`)
3. **Run state machine** for ALL alarm activations (Blank → ACK → OK)
4. **Compute exclusive categories** for each activation:
   - Standing (alarms active ≥60 min)
   - Nuisance (chattering episodes: ≥3 alarms in 10 min)
   - Flood (overlapping unhealthy periods from ≥2 sources)
   - Other (remaining)
5. **Aggregate** by time/hour/flow diagrams

**Why not pre-computed?**
- These are **new features** we added recently
- The main JSON generation (`run_actual_calc()`) doesn't include them yet
- We're computing them **on-demand** when user requests

---

## Performance Comparison

### CSV Sizes:
- **PVCI**: `All_Merged.csv` = **65.6 MB** (larger dataset)
- **VCMA**: `VCMA.csv` = **29.5 MB** (smaller dataset)

### Load Times (First Run):
- **PVCI**: ~2-3 minutes (more rows to process)
- **VCMA**: ~1-2 minutes (fewer rows)
- **Cached**: <1 second (both plants)

---

## Solution Implemented: **Two-Layer Caching**

### Layer 1: **RAM Cache** (15 minutes)
- Stores results in memory (`app.state`)
- **Survives**: Multiple requests within 15 min
- **Lost**: When backend restarts or cache expires
- **Speed**: Instant (<10ms)

### Layer 2: **Disk Cache** (24 hours) ✅ **NEW!**
- Stores results in JSON files:
  - `d:\Qbit-dynamics\alarm_system\alarm_backend\PVCI-actual-calc\PVCI-summary-categories-cache.json`
  - `d:\Qbit-dynamics\alarm_system\alarm_backend\PVCI-actual-calc\PVCI-summary-hourly-cache.json`
  - `d:\Qbit-dynamics\alarm_system\alarm_backend\PVCI-actual-calc\PVCI-summary-sankey-cache.json`
  - *(same for VCMA)*
- **Survives**: Backend restarts, server reboots
- **Auto-invalidates**: When parameters change (thresholds, filters)
- **Speed**: Fast (<1 second, just reading JSON)

---

## Cache Behavior Examples

| Scenario | First Load | Second Load (within 15 min) | After Backend Restart |
|----------|-----------|----------------------------|----------------------|
| **Before (no disk cache)** | 2-4 min | <1s (RAM) | ❌ 2-4 min again |
| **After (with disk cache)** | 2-4 min | <1s (RAM) | ✅ <1s (disk) |

---

## Why Not Just Pre-Compute Everything?

### Short Answer:
We **should** add these to the main JSON generation. That's the long-term solution.

### Why We Didn't Yet:
1. **Quick feature addition**: We added these charts for ISA-18.2 compliance analysis
2. **Separate from main KPIs**: These are advanced visualizations, not core metrics
3. **Flexible parameters**: Users can toggle `include_system` on/off dynamically

### **Next Step (Phase 2)**: 
Modify `run_actual_calc()` in `actual_calc_service.py` to pre-compute:
- Category time series (day/week/month)
- Hourly seasonality matrix
- Sankey composition data

Then these will also load in <1 second from the main JSON.

---

## Technical Details

### Cache Key (ensures correctness):
```python
cache_key = (
    plant_id,           # "PVCI" or "VCMA"
    grain,              # "day", "week", "month" (categories only)
    include_system,     # True/False
    stale_min,          # 60
    chatter_min,        # 10
    unhealthy_threshold,# 10
    window_minutes,     # 10
    flood_source_threshold,  # 2
)
```

If any parameter changes → cache invalidated → recomputes

### Cache Priority:
1. **Check disk cache** (persistent)
2. **Check RAM cache** (fastest)
3. **Compute from CSV** (slowest)
4. **Save to both caches**

---

## File Locations

### Cache Files:
```
d:\Qbit-dynamics\alarm_system\alarm_backend\PVCI-actual-calc\
├── PVCI-summary-categories-cache.json  (Category Trend data)
├── PVCI-summary-hourly-cache.json      (Seasonality Heatmap data)
├── PVCI-summary-sankey-cache.json      (Composition Sankey data)
├── VCMA-summary-categories-cache.json
├── VCMA-summary-hourly-cache.json
└── VCMA-summary-sankey-cache.json
```

### Main Pre-Computed Data:
```
d:\Qbit-dynamics\alarm_system\alarm_backend\PVCI-actual-calc\
├── All_Merged-actual-calc.json   (PVCI - all other charts)
└── VCMA-actual-calc.json         (VCMA - all other charts)
```

---

## Benefits of Two-Layer Caching

### For Development:
- ✅ **No more waiting** after backend restarts
- ✅ **Test different plants** without re-computing
- ✅ **Switch between tabs** instantly

### For Production:
- ✅ **Multiple users** share same cache
- ✅ **Load balancing** works (shared disk cache)
- ✅ **Fast cold starts** after deployments

---

## Monitoring Cache Performance

### Backend Logs:
```bash
# Disk cache hit (fast path)
[DISK CACHE] HIT for PVCI/categories (age: 2.3h)

# RAM cache hit (fastest path)
[RAM CACHE] summary/categories hit for PVCI, grain=day

# Cache saved after computation
[DISK CACHE] Saved PVCI/categories (1234.5 KB)
```

### Cache File Sizes (approx):
- **Categories**: ~1-2 MB (time series data)
- **Hourly**: ~100-200 KB (168 rows: 7 days × 24 hours)
- **Sankey**: ~50-100 KB (aggregated totals)

---

## Future Optimization: Pre-Compute in Main JSON

### Current Flow:
```
User Request → Load CSV → Parse → State Machine → Compute → Cache → Return
              ⬆️ 2-4 minutes on first load
```

### Ideal Flow (after Phase 2):
```
Offline: CSV → Parse → State Machine → Compute → Save to JSON
                         ⬆️ runs once when CSV changes

User Request → Read JSON → Return
              ⬆️ <1 second always
```

### Implementation Plan:
1. Modify `run_actual_calc()` to call:
   - `compute_category_time_series(activations, grain="day")`
   - `compute_hourly_seasonality_matrix(activations)`
   - `compute_category_sankey(activations)`
2. Save results in main JSON under new keys:
   - `category_time_series`
   - `hourly_seasonality`
   - `sankey_composition`
3. Update frontend APIs to read from main JSON instead of `/summary/*` endpoints

---

## Summary

| Aspect | Before | After (Disk Cache) | Future (Pre-Compute) |
|--------|--------|-------------------|---------------------|
| **First load** | 2-4 min | 2-4 min | <1s |
| **Cached load** | <1s | <1s | <1s |
| **After restart** | ❌ 2-4 min | ✅ <1s | ✅ <1s |
| **Cache expires** | 15 min | 24 hours | Never (regenerates with CSV) |
| **Storage** | RAM only | RAM + Disk | Main JSON |

**Current Status**: ✅ **Disk caching implemented** - You'll only wait 2-4 min once per day (or after parameter changes)
**Next Goal**: Pre-compute in main JSON generation for instant loads always
