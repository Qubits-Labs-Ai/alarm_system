# Comprehensive Health Score Implementation Plan

**Status:** Planning Phase | **Target:** 4-6 weeks | **Priority:** High

---

## Executive Summary

### Current Problem
- "Activation-based Health" shows 93.44% for VCMA despite serious issues
- Only measures flood-free time (% windows with ≤2 alarms)
- Ignores: daily overload (100% bad days), chattering (82K), standing (797)

### Solution
**4-Tier Comprehensive Health Score:**
1. Load Compliance (40%) - Daily/window/peak volumes
2. Alarm Quality (30%) - Chattering, repeating, failures
3. Operator Response (20%) - Standing, ack/ok times  
4. System Reliability (10%) - Consistency, variability

### Expected Results
- VCMA: 93.44% → ~35% (Grade F, Critical) ✅ Realistic
- PVCI: 25.97% → ~18% (Grade F, Critical) ✅ Realistic

---

## Phase 1: Quick Rename ✅ COMPLETED

**Duration:** 2 hours | **Status:** Done

### Changes Made:
1. ✅ Frontend labels: "Flood-Free Time (10-min windows)"
2. ✅ Description: "Time Without Alarm Floods"
3. ✅ Backend docstring: Added limitations disclaimer
4. ✅ Comments updated in ActualCalcTabs.tsx

**Files Modified:**
- `ActivationOverloadSummary.tsx` (lines 66, 76)
- `ActualCalcTabs.tsx` (line 334)
- `actual_calc_service.py` (lines 798-823)

---

## Phase 2: Backend Calculator (4-5 days)

### 2.1 Create health_score_calculator.py (Day 1-2)

**New Module:** `alarm_backend/PVCI-actual-calc/health_score_calculator.py`

**Functions to implement:**
```python
# Tier 1 (40%)
def calculate_daily_load_score(alarms_per_day: float) -> float
def calculate_window_overload_score(overload_pct: float) -> float  
def calculate_peak_intensity_score(peak_count: int) -> float

# Tier 2 (30%)
def calculate_nuisance_score(repeating_pct, chattering_pct, total) -> float
def calculate_instrument_health_score(failures, total_sources) -> float

# Tier 3 (20%)
def calculate_standing_control_score(standing, total) -> float
def calculate_response_score(ack_delay, completion_rate) -> float

# Tier 4 (10%)
def calculate_consistency_score(days_over_pct, cv_daily) -> float

# Main
def calculate_comprehensive_health(metrics: dict) -> dict
```

**Thresholds (ISO 18.2 / EEMUA 191):**
| Metric | Excellent | Good | Acceptable | Poor | Critical |
|--------|-----------|------|------------|------|----------|
| Alarms/day | <144 | 144-216 | 216-288 | 288-720 | ≥720 |
| Flood-free | >95% | 90-95% | 80-90% | 70-80% | <70% |
| Peak 10-min | <10 | 10-20 | 20-50 | 50-100 | >100 |
| Chattering | <5% | 5-10% | 10-15% | 15-25% | >25% |
| Standing | <1% | 1-3% | 3-5% | 5-10% | >10% |

---

### 2.2 Add Required Metrics (Day 2)

**Update:** `actual_calc_service.py`

```python
# Calculate new metrics
cv_daily_alarms = std(daily_counts) / mean(daily_counts)
repeating_pct = (sum(Repeating_Alarms) / total_alarms) * 100
chattering_pct = (sum(Chattering_Count) / total_alarms) * 100
standing_pct = (sum(Standing_Alarms) / total_alarms) * 100

# Add to JSON output
output_dict["health_metrics"] = {
    "repeating_pct": repeating_pct,
    "chattering_pct": chattering_pct,
    "standing_pct": standing_pct,
    "cv_daily_alarms": cv_daily_alarms,
    "total_sources": len(summary)
}
```

---

### 2.3 Integrate Calculator (Day 3)

**Update:** `actual_calc_service.py` → `run_actual_calc()`

```python
from health_score_calculator import calculate_comprehensive_health

# After existing calculations
comprehensive_health = calculate_comprehensive_health({
    'avg_alarms_per_day': kpis['avg_alarms_per_day'],
    'overload_pct': act_metrics['activation_time_in_overload_windows_pct'],
    'peak_count': act_metrics['peak_10min_activation_count'],
    'repeating_pct': health_metrics['repeating_pct'],
    'chattering_pct': health_metrics['chattering_pct'],
    # ... all 12 required metrics
})

output_dict["comprehensive_health"] = comprehensive_health
```

**Add API endpoint in main.py:**
```python
@app.get("/actual-calc/{plant_id}/health")
def get_plant_comprehensive_health(plant_id: str, force_recompute: bool = False):
    result = run_actual_calc_with_cache(...)
    return result.get('comprehensive_health', {})
```

---

### 2.4 Unit Tests (Day 4)

**File:** `test_health_scores.py`

```python
def test_vcma_realistic_scenario():
    metrics = {
        'avg_alarms_per_day': 314.46,
        'chattering_pct': 78.5,
        # ... VCMA actual data
    }
    result = calculate_comprehensive_health(metrics)
    assert result['overall_health'] < 50
    assert result['grade'] == 'F'
    assert result['tier_scores']['alarm_quality'] < 30

# Add 20-30 test cases
```

---

### 2.5 Regenerate Caches (Day 4-5)

```bash
python actual_calc_service.py --plant VCMA --force-refresh
python actual_calc_service.py --plant PVCI --force-refresh

# Verify
python -c "
import json
with open('PVCI-actual-calc/VCMA-actual-calc.json') as f:
    data = json.load(f)
    print('Health:', data['comprehensive_health']['overall_health'])
"
```

---

## Phase 3: Frontend Display (5-7 days)

### 3.1 Types & API (Day 1)

**Files:**
- `src/types/healthScore.ts` - TypeScript interfaces
- `src/api/actualCalc.ts` - `fetchPlantHealthScore()` function

---

### 3.2 Health Card Component (Day 2-3)

**File:** `src/components/dashboard/ComprehensiveHealthCard.tsx`

**Features:**
- Large overall score with color coding
- Grade badge (A+ to F)
- Risk level banner
- 4 tier scores in grid
- Expandable detailed sub-scores
- Responsive design

---

### 3.3 Optional Radar Chart (Day 4)

**File:** `src/components/dashboard/HealthRadarChart.tsx`

**Visual:** 4-point radar showing tier scores (Load/Quality/Response/Reliability)

---

### 3.4 Dashboard Integration (Day 5)

**Update:** `DashboardPage.tsx`

```typescript
// Add to top of Actual Calc mode
{mode === 'Actual Calc' && (
  <div className="mb-6">
    <ComprehensiveHealthCard health={healthData} />
  </div>
)}

// Move ActivationOverloadSummary to "Detailed Analytics" tab
```

**Visual Hierarchy:**
1. **ComprehensiveHealthCard** (NEW - primary KPI)
2. Tabs: Alarm Summary | Frequency | Detailed Analytics
3. ActivationOverloadSummary → moved to Detailed Analytics

---

## Phase 4: Validation (1 week)

### Testing Checklist:
- [ ] Unit tests pass (20+ cases)
- [ ] VCMA health score ~30-40%
- [ ] PVCI health score <25%
- [ ] Peak intensity score penalizes 725-alarm window
- [ ] Chattering >70% results in poor quality score
- [ ] Standing alarms drag down response score
- [ ] Operator feedback session (3-5 operators)
- [ ] Cross-plant comparison validates
- [ ] Performance <100ms calculation time
- [ ] Documentation complete

---

## Phase 5: Deployment (1 week)

### 5.1 Staging (Day 1-2)
```bash
git checkout -b feature/comprehensive-health
# Deploy backend + frontend to staging
# Validate all features
```

### 5.2 Production Rollout (Day 3-5)

**Strategy:** Feature flag gradual rollout
- Day 3: Deploy with flag OFF
- Day 4: Enable for 10% → 50% users
- Day 5: Enable for 100% users

### 5.3 Monitoring
```python
# Log health scores
logger.info(f"Plant {plant_id}: {health:.1f}% (grade {grade})")

# Track tier changes
# Alert on critical scores (<30%)
```

---

## Deliverables

### Code:
- [ ] `health_score_calculator.py` (300-400 lines)
- [ ] `test_health_scores.py` (200+ lines)
- [ ] Updated `actual_calc_service.py`
- [ ] API endpoint `/actual-calc/{plant_id}/health`
- [ ] `ComprehensiveHealthCard.tsx` (200-300 lines)
- [ ] Type definitions
- [ ] API client functions

### Documentation:
- [ ] Technical specification (formulas, thresholds)
- [ ] User guide (operator-friendly)
- [ ] API documentation
- [ ] Test reports

### Data:
- [ ] Regenerated cache files with health scores
- [ ] Validation test results
- [ ] Operator feedback summary

---

## Success Criteria

1. ✅ Health score accurately reflects plant problems
2. ✅ VCMA shows ~35% (down from misleading 93%)
3. ✅ PVCI shows ~18% (down from 26%)
4. ✅ All four tiers calculated correctly
5. ✅ UI intuitive and actionable
6. ✅ No performance degradation
7. ✅ Operators validate score matches experience

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Threshold tuning needed | Medium | Operator feedback session, iterative tuning |
| Performance impact | Low | Calculation in cache generation, not real-time |
| User confusion | Medium | Clear documentation, tooltips, training |
| Scope creep | High | Stick to 4-tier model, defer advanced features |

---

## Timeline Summary

```
Week 1: Backend calculator + tests
Week 2: Frontend components
Week 3: Integration + validation
Week 4: Staging → Production rollout
Total: ~4 weeks
```

---

## Next Steps

**Immediate (Today):**
- [ ] Review this plan with team
- [ ] Confirm threshold values with operators
- [ ] Set up Git branch

**Week 1:**
- [ ] Implement `health_score_calculator.py`
- [ ] Write unit tests
- [ ] Integrate into actual_calc_service

**Week 2:**
- [ ] Build frontend components
- [ ] Integrate into dashboard
- [ ] Test end-to-end

**Week 3-4:**
- [ ] Validation testing
- [ ] Documentation
- [ ] Production deployment
