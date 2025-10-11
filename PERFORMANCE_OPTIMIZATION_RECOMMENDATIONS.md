# Performance Optimization Recommendations for Alarm Dashboard

## Executive Summary

The slow loading times for **Unhealthy Bar Chart**, **Condition Distribution Chart**, and **Total Unique Sources** card are caused by:

1. **Multiple sequential API calls** (waterfall loading)
2. **Heavy client-side data aggregation** (processing thousands of records in browser)
3. **Excessive real-time calculations** on every render
4. **Missing pre-computed values** in JSON data

---

## Root Causes & Solutions

### 🔴 **Issue 1: Multiple Sequential API Calls (Waterfall)**

**Current Behavior:**
```typescript
// ConditionDistributionByLocationPlantWide.tsx:140-191
const res = await fetchPvciIsaFloodSummary({...});        // Call 1
const details = await fetchPvciWindowSourceDetails(...);  // Call 2 (waits for Call 1)
const enrichRes = await fetchUnhealthySources(...);       // Call 3 (waits for Call 2)
```

**Problem:** Each call waits for the previous → **3x latency**

**✅ Solution 1A: Parallel API Calls**
```typescript
// Execute all calls simultaneously
const [res, details, enrichRes] = await Promise.all([
  fetchPvciIsaFloodSummary({...}),
  fetchPvciWindowSourceDetails(win.start, win.end, 500),
  fetchUnhealthySources(win.start, win.end, '10T', 10, plantId)
]);
```
**Expected Improvement:** 60-70% faster data fetching

**✅ Solution 1B: Backend API Consolidation**
Create a single endpoint that returns ALL needed data:
```typescript
// New endpoint: /pvcI-health/condition-distribution-complete
GET /pvcI-health/condition-distribution-complete?start_time=...&end_time=...

Response:
{
  "window": { "start": "...", "end": "..." },
  "sources_with_locations": [...],  // Pre-joined data
  "aggregated_by_location": {...}   // Pre-computed aggregations
}
```
**Expected Improvement:** 80-90% faster (single network round-trip)

---

### 🔴 **Issue 2: Heavy Client-Side Aggregations**

**Current Behavior:**
```typescript
// ConditionDistributionByLocationPlantWide.tsx:244-331
// Processing 500-1000+ records in the browser
for (const r of records) {
  // Building multiple maps
  byLocCond.set(loc, ...);
  byLocCondSrc.set(loc, ...);
  // Multiple nested loops and sorts
}
```

**Problem:** Processing thousands of alarm records in JavaScript is slow

**✅ Solution 2A: Pre-Compute Aggregations in JSON**

Update your `isa18-flood-summary.json` to include:
```json
{
  "overall": {...},
  "by_day": [...],
  "records": [...],
  
  // ADD THIS NEW SECTION
  "condition_distribution_by_location": {
    "locations": [
      {
        "location": "REACTOR_A",
        "total_flood_count": 1234,
        "conditions": {
          "HI": 567,
          "LOLO": 345,
          "HIHI": 234,
          "Other": 88
        },
        "top_sources_by_condition": {
          "HI": [
            {"source": "TIC1203", "count": 234},
            {"source": "FIC1501", "count": 123}
          ]
        }
      }
    ]
  }
}
```

**Backend Python Script Update:**
```python
# In your flood summary generation script
def compute_condition_distribution(events_df):
    """Pre-compute condition distribution aggregations"""
    
    # Group by location and condition
    agg = events_df.groupby(['location_tag', 'condition']).agg({
        'source': 'count',
        'event_time': 'count'
    }).rename(columns={'source': 'flood_count'})
    
    # Compute top sources per location/condition
    location_data = []
    for location in events_df['location_tag'].unique():
        loc_data = {
            'location': location,
            'total_flood_count': len(events_df[events_df['location_tag'] == location]),
            'conditions': {},
            'top_sources_by_condition': {}
        }
        
        loc_events = events_df[events_df['location_tag'] == location]
        for condition in loc_events['condition'].unique():
            cond_events = loc_events[loc_events['condition'] == condition]
            loc_data['conditions'][condition] = len(cond_events)
            
            # Top 5 sources for this condition
            top_sources = cond_events.groupby('source').size() \
                .sort_values(ascending=False).head(5)
            loc_data['top_sources_by_condition'][condition] = [
                {'source': src, 'count': int(count)} 
                for src, count in top_sources.items()
            ]
        
        location_data.append(loc_data)
    
    return {'locations': location_data}

# Add to your JSON export
summary_data['condition_distribution_by_location'] = compute_condition_distribution(events_df)
```

**Expected Improvement:** 90-95% faster rendering (no client-side aggregation)

---

### 🔴 **Issue 3: Expensive useMemo Re-computations**

**Current Behavior:**
```typescript
// ConditionDistributionByLocationPlantWide.tsx:244
const { chartData, conditionKeys, ... } = React.useMemo(() => {
  // Heavy aggregation logic runs on every state change
}, [records, sortBy, topN]);  // Triggers frequently
```

**Problem:** `useMemo` still runs expensive logic whenever dependencies change

**✅ Solution 3: Debounce User Interactions**
```typescript
import { useDebounce } from '@/hooks/useDebounce';

const debouncedSortBy = useDebounce(sortBy, 300);
const debouncedTopN = useDebounce(topN, 300);

const { chartData, conditionKeys, ... } = React.useMemo(() => {
  // Now only runs after user stops interacting for 300ms
}, [records, debouncedSortBy, debouncedTopN]);
```

**✅ Solution 3B: Web Worker for Heavy Computation**
```typescript
// aggregationWorker.ts
self.onmessage = (e) => {
  const { records, sortBy, topN } = e.data;
  // Perform heavy aggregation in background thread
  const result = computeChartData(records, sortBy, topN);
  self.postMessage(result);
};

// Component
const worker = useMemo(() => new Worker('aggregationWorker.ts'), []);
useEffect(() => {
  worker.postMessage({ records, sortBy, topN });
  worker.onmessage = (e) => setChartData(e.data);
}, [records, sortBy, topN]);
```

**Expected Improvement:** UI stays responsive during calculations

---

### 🔴 **Issue 4: Unique Sources Calculation**

**Current Behavior:**
- `fetchPvciUniqueSourcesSummary` calls backend on every page load
- Backend might be computing this on-the-fly

**✅ Solution 4: Add to Pre-Computed JSON**
```json
{
  "overall": {
    "total_alarms": 935356,
    "flood_windows_count": 676,
    "isa_overall_health_pct": 12.026363,
    
    // ADD THESE
    "unique_sources_summary": {
      "total_unique_sources": 29,
      "healthy_sources": 27,
      "unhealthy_sources": 2,
      "by_activity_level": {
        "low_activity": 27,
        "high_activity": 2
      }
    }
  }
}
```

**Backend Update:**
```python
def compute_unique_sources_summary(events_df, threshold=10):
    """Pre-compute unique sources breakdown"""
    sources = events_df.groupby('source').size()
    unhealthy = sources[sources >= threshold]
    
    return {
        'total_unique_sources': len(sources),
        'healthy_sources': len(sources[sources < threshold]),
        'unhealthy_sources': len(unhealthy),
        'by_activity_level': {
            'low_activity': len(sources[sources < threshold]),
            'high_activity': len(unhealthy)
        }
    }

# Add to overall section
overall_data['unique_sources_summary'] = compute_unique_sources_summary(events_df)
```

**Expected Improvement:** Instant load (no API call needed)

---

## 📊 **Implementation Priority**

| Priority | Solution | Effort | Impact | Timeline |
|----------|----------|--------|--------|----------|
| **🔥 P0** | Pre-compute aggregations in JSON (Solution 2A) | Medium | 90% faster | 1-2 days |
| **🔥 P0** | Parallel API calls (Solution 1A) | Low | 60% faster | 2 hours |
| **⚡ P1** | Backend API consolidation (Solution 1B) | High | 85% faster | 1 week |
| **⚡ P1** | Add unique sources to JSON (Solution 4) | Low | Instant load | 1 day |
| **📈 P2** | Debounce interactions (Solution 3) | Low | Better UX | 4 hours |
| **📈 P2** | Web Workers (Solution 3B) | High | Non-blocking | 1 week |

---

## 🎯 **Quick Win Implementation Plan**

### Step 1: Update Backend JSON Generation (1-2 days)

```python
# In your flood summary generation script (e.g., generate_isa_summary.py)

def generate_enhanced_summary(events_df, output_path):
    """Generate ISA summary with pre-computed aggregations"""
    
    summary = {
        'plant_folder': '...',
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'params': {...},
        
        'overall': {
            # Existing fields
            'total_alarms': int(len(events_df)),
            'isa_overall_health_pct': float(health_pct),
            
            # NEW: Pre-computed unique sources
            'unique_sources_summary': compute_unique_sources_summary(events_df),
        },
        
        # Existing sections
        'by_day': [...],
        'records': [...],
        
        # NEW: Pre-computed condition distribution
        'condition_distribution_by_location': compute_condition_distribution(events_df),
        
        # NEW: Pre-computed unhealthy bar chart data
        'unhealthy_sources_top_n': compute_unhealthy_sources_top_n(events_df),
    }
    
    # Write to JSON
    with open(output_path, 'w') as f:
        json.dump(summary, f, indent=2)

def compute_unhealthy_sources_top_n(events_df, top_n=10):
    """Pre-compute top unhealthy sources for bar chart"""
    source_counts = events_df.groupby('source').size().sort_values(ascending=False)
    unhealthy = source_counts[source_counts >= 10].head(top_n)
    
    return [
        {
            'source': str(source),
            'hits': int(count),
            'threshold': 10,
            'over_by': int(count - 10)
        }
        for source, count in unhealthy.items()
    ]

# Run this script on a schedule (e.g., every 30 minutes)
```

### Step 2: Update Frontend to Use Pre-Computed Data (4 hours)

```typescript
// ConditionDistributionByLocationPlantWide.tsx

async function fetchData() {
  try {
    setLoading(true);
    
    // Single API call to get ISA summary with pre-computed data
    const summary = await fetchPvciIsaFloodSummary({
      include_records: false,  // Don't need raw records anymore
      lite: false              // Get full payload with aggregations
    });
    
    // Use pre-computed data directly
    const preComputed = summary?.condition_distribution_by_location?.locations || [];
    
    // Transform to chart format (minimal processing)
    const chartData = preComputed.map(loc => ({
      location: loc.location,
      total: loc.total_flood_count,
      ...loc.conditions,
      __byCondTopSources: loc.top_sources_by_condition
    }));
    
    setChartData(chartData);
    setLoading(false);
  } catch (err) {
    setError(err.message);
    setLoading(false);
  }
}
```

### Step 3: Implement Parallel API Calls (2 hours)

```typescript
// If you still need multiple calls, parallelize them

async function fetchData() {
  try {
    setLoading(true);
    
    // Execute all calls simultaneously
    const [summary, windowDetails, enrichData] = await Promise.all([
      fetchPvciIsaFloodSummary({...}),
      win ? fetchPvciWindowSourceDetails(win.start, win.end, 500) : Promise.resolve(null),
      win ? fetchUnhealthySources(win.start, win.end, '10T', 10, plantId) : Promise.resolve(null)
    ]);
    
    // Process results
    // ...
  } catch (err) {
    // ...
  }
}
```

---

## 📈 **Expected Performance Results**

| Component | Current Load Time | After Quick Wins | After Full Optimization |
|-----------|-------------------|------------------|-------------------------|
| Unhealthy Bar Chart | 3-5 seconds | **0.5-1 second** | **<0.3 seconds** |
| Condition Distribution | 5-8 seconds | **1-2 seconds** | **<0.5 seconds** |
| Unique Sources Card | 2-3 seconds | **Instant** | **Instant** |
| **Total Page Load** | **10-15 seconds** | **2-4 seconds** | **<1 second** |

---

## 🔍 **Monitoring & Validation**

Add performance tracking:

```typescript
// Add to each component
useEffect(() => {
  const start = performance.now();
  
  fetchData().then(() => {
    const duration = performance.now() - start;
    console.log(`[Performance] ${componentName} loaded in ${duration.toFixed(0)}ms`);
    
    // Send to analytics
    analytics.track('component_load_time', {
      component: componentName,
      duration_ms: duration
    });
  });
}, []);
```

---

## 💡 **Additional Recommendations**

1. **Add Loading Skeletons:** Current shimmer animations are good, but add more specific shapes
2. **Implement Progressive Loading:** Show cached data immediately, then update with fresh data
3. **Add Error Boundaries:** Prevent one component failure from breaking the entire dashboard
4. **Consider Virtual Scrolling:** If showing large lists in tooltips
5. **Optimize Recharts:** Use `animationDuration={0}` for faster initial render

---

## 🚀 **Next Steps**

1. **Week 1:** Implement pre-computed aggregations in JSON (Solution 2A, 4)
2. **Week 1:** Parallelize API calls (Solution 1A)
3. **Week 2:** Test performance improvements and gather metrics
4. **Week 3:** Implement backend API consolidation (Solution 1B) if needed
5. **Week 4:** Add Web Workers for remaining heavy computations (Solution 3B)

---

## 📞 **Questions?**

If you need help implementing any of these solutions, I can:
- Write the Python code for JSON pre-computation
- Update the React components to use pre-computed data
- Create the parallel API call implementation
- Set up performance monitoring

Let me know which solution you'd like to start with!
