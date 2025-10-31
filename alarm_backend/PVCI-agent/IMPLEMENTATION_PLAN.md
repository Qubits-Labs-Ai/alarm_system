# PVCI Agent - Step-by-Step Fix Plan
**37 Problems → 7 Phases → Fully Verified**

## PHASE 1: Critical Iterations & Tools (Days 1-4) 🔴

### 1.1 Fix Max Iterations Problem
**Files**: `glm_agent.py`

**Implementation**:
- Add error pattern matching dictionary (line 42)
- Implement auto-fix for "no such column" errors
- Increase iterations to 12 with budget tracking
- Add iteration context: `{"errors_seen": [], "queries_attempted": []}`

**Verification**:
```bash
# Test auto-fix
curl -X POST http://localhost:8000/agent/pvci/stream -d '{"query": "SELECT Event Time FROM alerts LIMIT 5"}'
# Expected: Auto-quotes "Event Time" and succeeds

# Test iteration limit
curl -X POST http://localhost:8000/agent/pvci/stream -d '{"query": "Complex chattering analysis across all sources"}'
# Expected: Completes in <12 iterations
```

**Success Metrics**: Auto-fix rate >70%, max iteration hits <5%

---

### 1.2 Expand Tool Library (6 → 20 tools)
**Files**: `data_tools.py` (after line 777)

**Add 14 New Tools**:
1. `get_alarm_statistics(source_filter, time_period, group_by)` - mean, median, percentiles
2. `detect_anomalies(metric, threshold_sigma, time_window)` - statistical outliers
3. `get_time_series_trend(source, aggregation, metric)` - hourly/daily trends
4. `compare_time_periods(period1, period2, metric)` - before/after analysis
5. `analyze_correlations(target_source, time_window, min_correlation)` - cascade analysis
6. `get_maintenance_metrics(source_filter)` - MTBF, MTTR, availability
7. `generate_summary_report(time_period, include_charts)` - executive dashboard
8. `export_data_csv(sql_query, max_rows)` - CSV export
9. `get_current_active_alarms(priority_filter, location_filter)` - real-time active
10. `check_threshold_violations(thresholds)` - SLA monitoring
11. `forecast_alarm_load(forecast_hours, method)` - load prediction
12. `predict_bad_actors(lookback_days, prediction_days)` - risk prediction
13. `get_priority_distribution(time_period, location)` - priority breakdown
14. `analyze_operator_response(time_period)` - response time analysis

**Update Registry**: Line 782-789 → expand to 20 tools

**Verification**:
```python
# test_new_tools.py
for tool in NEW_TOOLS:
    result = tool(**test_params[tool.__name__])
    assert "error" not in json.loads(result)
    print(f"✅ {tool.__name__}")
```

---

## PHASE 2: Validation & Schema (Days 5-6) 🔴

### 2.1 Add Parameter Validation
**Files**: `data_tools.py` (after line 11)

**Implementation**:
```python
def validate_parameters(func):
    """Decorator for runtime parameter validation"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        # Type checking
        # Range validation (1-1000 for top_n)
        # Enum checking (time_period in valid values)
        # SQL injection prevention
    return wrapper

# Apply to all tools
@validate_parameters
def analyze_bad_actors(top_n: int = 10, min_alarms: int = 50):
    ...
```

**Verification**:
```python
# Test invalid params
assert "error" in analyze_bad_actors(top_n=-5)
assert "error" in get_isa_compliance_report(time_period="yesterday")
assert "error" in execute_sql_query("SELECT * FROM alerts")  # no LIMIT
```

---

### 2.2 Improve JSON Schema
**Files**: `glm_agent.py` (replace lines 322-356)

**Implementation**:
- Parse docstrings for descriptions
- Add enums for time_period, aggregation, metric
- Add ranges for integers (min/max)
- Include defaults and examples

**Verification**:
```python
schema = build_tool_schema(analyze_bad_actors)
assert schema['function']['parameters']['properties']['top_n']['minimum'] == 1
assert 'enum' in schema['function']['parameters']['properties']['time_period']
```

---

## PHASE 3: Error Recovery (Days 7-9) 🟠

### 3.1 Intelligent Retry Logic
**Files**: `glm_agent.py`

**Implementation**:
- Error pattern database with 10+ patterns
- Auto-fix functions (quote columns, add LIMIT, expand filters)
- Retry budget per error type
- Query simplification on repeated failures

**Verification**:
```bash
# Test each error pattern
- Column name error → auto-quotes
- Syntax error → simplifies query
- Empty result → expands date range
- Table missing → fails fast with clear message
```

---

## PHASE 4: Performance (Days 10-12) 🟠

### 4.1 Add Caching Layer
**Files**: New `cache.py`

**Implementation**:
```python
class QueryCache:
    def __init__(self, max_size=1000, ttl=300):
        self.cache = {}  # key: (query_hash, params) → value: result
    
    def get(self, key): ...
    def set(self, key, value): ...
    def invalidate(self, pattern): ...
```

**Apply to**: `execute_sql_query`, expensive tools

**Verification**:
- First query: >500ms
- Cached query: <10ms
- Cache hit rate >50% after 100 queries

---

### 4.2 Connection Pooling
**Files**: `data_tools.py` (replace line 14)

**Implementation**:
```python
from contextlib import contextmanager

class DBConnectionPool:
    def __init__(self, db_path, pool_size=5):
        self.pool = [sqlite3.connect(db_path) for _ in range(pool_size)]
    
    @contextmanager
    def get_connection(self):
        conn = self.pool.pop()
        try:
            yield conn
        finally:
            self.pool.append(conn)

pool = DBConnectionPool(DB_FILE)

# Usage in tools:
with pool.get_connection() as conn:
    df = pd.read_sql_query(sql, conn)
```

**Verification**:
- No file lock errors under load
- 10 concurrent queries complete successfully

---

## PHASE 5: Multi-Plant & Architecture (Days 13-15) 🟠

### 5.1 Add Multi-Plant Support
**Files**: All tool functions

**Implementation**:
- Add `plant_id` parameter to all tools
- Filter queries by plant: `WHERE plant_id = ?`
- Update schema to include plant_id
- Integrate with plant_registry.py

**Verification**:
```python
result1 = analyze_bad_actors(plant_id="PVCI")
result2 = analyze_bad_actors(plant_id="VCMA")
assert result1 != result2
```

---

### 5.2 Refactor Architecture
**Files**: Split `glm_agent.py` (751 lines)

**New Structure**:
- `agent_core.py` - main loop logic
- `agent_models.py` - model management
- `agent_streaming.py` - SSE streaming
- `agent_errors.py` - error handling
- `agent_tools.py` - tool execution

---

## PHASE 6: Monitoring & Quality (Days 16-18) 🟡

### 6.1 Add Metrics Tracking
**Files**: New `metrics.py`

**Track**:
- Query path (Fast/Data), response time, iterations
- Tool usage frequency, success rate, avg duration
- Error patterns, cache hit rate
- User satisfaction (if feedback added)

**Dashboard**: `/agent/pvci/metrics` endpoint

---

### 6.2 Improve Health Check
**Files**: `router.py` line 23-27

**Add Checks**:
- Database connectivity and size
- OpenRouter API availability
- Disk space, memory usage
- Recent error rate
- Average response time

---

## PHASE 7: Testing & Polish (Days 19-21) 🟡

### 7.1 Comprehensive Test Suite
**Files**: New `tests/` directory

**Create**:
- `test_tools.py` - all 20 tools
- `test_validation.py` - parameter validation
- `test_error_recovery.py` - retry logic
- `test_performance.py` - load testing
- `test_integration.py` - end-to-end

**Run**: `pytest tests/ --cov=. --cov-report=html`

**Target**: >85% code coverage

---

### 7.2 Documentation
**Files**: Update all docstrings, create API docs

**Create**:
- `API_REFERENCE.md` - all tools documented
- `ERROR_GUIDE.md` - common errors and fixes
- `PERFORMANCE_TUNING.md` - optimization tips
- Update inline comments

---

## VERIFICATION CHECKLIST

### Automated Tests
```bash
# Run full test suite
pytest tests/ -v

# Load test (100 concurrent users)
locust -f tests/load_test.py --users 100 --spawn-rate 10

# Integration test
python tests/integration_test.py
```

### Manual Verification
- [ ] Max iteration failures <5%
- [ ] Auto-fix success rate >70%
- [ ] Query coverage >90%
- [ ] Response time <5s for 90% of queries
- [ ] Cache hit rate >50%
- [ ] All 20 tools functional
- [ ] No parameter validation bypasses
- [ ] Multi-plant support working
- [ ] Metrics dashboard accessible
- [ ] Documentation complete

### Performance Benchmarks
| Metric | Before | Target | After |
|--------|--------|--------|-------|
| Avg Response Time | 8-12s | <5s | ? |
| Max Iterations Hit | 15-20% | <5% | ? |
| Tool Success Rate | 85% | >95% | ? |
| Cache Hit Rate | 0% | >50% | ? |
| Query Coverage | 60% | >90% | ? |

---

## ROLLOUT STRATEGY

**Week 1**: Phase 1-2 (Critical fixes)
- Deploy to staging
- Run smoke tests
- Monitor for 2 days

**Week 2**: Phase 3-4 (Recovery & Performance)
- Deploy to staging
- Load testing
- Monitor metrics

**Week 3**: Phase 5-7 (Architecture & Polish)
- Final integration testing
- Documentation review
- Production deployment

**Post-Deployment**:
- Monitor error rates for 1 week
- Collect user feedback
- Iterate on problem areas
