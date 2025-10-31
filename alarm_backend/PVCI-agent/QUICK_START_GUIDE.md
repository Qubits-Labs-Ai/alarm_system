# PVCI Agent Fix - Quick Start Guide

## 📋 Pre-Implementation Checklist

Before starting implementation, ensure:

- [ ] Backend server running on port 8000
- [ ] Database loaded (903K+ rows, 1,231 sources)
- [ ] OpenRouter API key configured in `.env`
- [ ] Git branch created: `git checkout -b fix/pvci-agent-improvements`
- [ ] Backup created: `cp -r PVCI-agent PVCI-agent.backup`

## 🚀 Implementation Order (3-Week Plan)

### Week 1: Critical Fixes (Days 1-7)

**Day 1-2: Max Iterations Fix**
```bash
# 1. Edit glm_agent.py
# - Add error pattern database (line 42)
# - Add auto-fix functions (after line 305)
# - Update error handling (line 630)
# - Increase max_iterations to 12

# 2. Test
python tests/verify_phase1.py
# Expected: Auto-fix tests pass
```

**Day 3-5: Tool Expansion**
```bash
# 1. Edit data_tools.py
# - Add 14 new tools (after line 777)
# - Update AVAILABLE_TOOLS registry (line 782-789)

# 2. Test each new tool
python -c "from data_tools import get_alarm_statistics; print(get_alarm_statistics())"

# 3. Verify all tools
python tests/verify_phase1.py
# Expected: 20 tools available
```

**Day 6-7: Parameter Validation**
```bash
# 1. Add validation decorator to data_tools.py (after line 11)
# 2. Apply @validate_parameters to all 20 tools
# 3. Add SQL validation function

# 4. Test validation
python tests/verify_phase2.py
# Expected: All invalid params rejected
```

### Week 2: Recovery & Performance (Days 8-14)

**Day 8-10: Error Recovery**
```bash
# 1. Implement error pattern matching
# 2. Add auto-fix functions (quote columns, add LIMIT)
# 3. Add retry budget tracking
# 4. Test with intentionally broken queries

# Verify: Errors recover automatically
```

**Day 11-12: Caching**
```bash
# 1. Create cache.py
# 2. Add QueryCache class
# 3. Wrap execute_sql_query with caching
# 4. Add cache metrics

# Verify: Second query <10ms
```

**Day 13-14: Connection Pooling**
```bash
# 1. Create DBConnectionPool class
# 2. Replace all sqlite3.connect() calls
# 3. Add pool metrics

# Test: 10 concurrent queries succeed
```

### Week 3: Architecture & Polish (Days 15-21)

**Day 15-17: Multi-Plant Support**
```bash
# 1. Add plant_id parameter to all tools
# 2. Update schemas with plant_id
# 3. Filter queries by plant
# 4. Test with PVCI and VCMA data

# Verify: Different results per plant
```

**Day 18-19: Monitoring**
```bash
# 1. Create metrics.py
# 2. Track query path, response time, tool usage
# 3. Add /metrics endpoint
# 4. Enhance /health endpoint

# Verify: Metrics accessible via API
```

**Day 20-21: Testing & Documentation**
```bash
# 1. Write comprehensive tests
# 2. Update all docstrings
# 3. Create API_REFERENCE.md
# 4. Create ERROR_GUIDE.md

# Run full test suite
pytest tests/ --cov=. --cov-report=html
# Target: >85% coverage
```

## ✅ Verification Commands

### Quick Health Check
```bash
# Check if agent is responding
curl -X POST http://localhost:8000/agent/pvci/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello", "sessionId": "test"}'

# Should return Fast Path response in <2s
```

### Test Auto-Fix
```bash
# Query with column name error (should auto-fix)
curl -X POST http://localhost:8000/agent/pvci/stream \
  -d '{"query": "SELECT Event Time, Source FROM alerts LIMIT 5", "sessionId": "autofix"}'

# Expected: Auto-quotes "Event Time" and succeeds
```

### Test Tool Availability
```python
# Verify 20 tools loaded
python -c "from data_tools import AVAILABLE_TOOLS; print(f'{len(AVAILABLE_TOOLS)} tools available')"

# Expected: 20 tools available
```

### Test Parameter Validation
```python
# Should reject invalid parameters
python -c "from data_tools import analyze_bad_actors; print(analyze_bad_actors(top_n=-5))"

# Expected: {"error": "Invalid type for top_n..."}
```

### Run Phase Verification
```bash
# Verify Phase 1 (Critical fixes)
python tests/verify_phase1.py

# Verify Phase 2 (Validation)
python tests/verify_phase2.py

# Verify all phases
bash tests/verify_all.sh
```

## 🔍 Debugging Common Issues

### Issue 1: Max Iterations Still Hit
**Symptom**: Queries fail with "Max iterations reached"

**Debug**:
```python
# Check iteration context tracking
# In glm_agent.py, add logging:
print(f"Iteration {iteration}: {iteration_context}")
```

**Fix**: Verify error pattern matching is working, check auto-fix functions

### Issue 2: Tools Not Called
**Symptom**: Agent responds without calling tools

**Debug**:
```python
# Check tool schema generation
from glm_agent import build_tool_schema
from data_tools import execute_sql_query
schema = build_tool_schema(execute_sql_query)
print(json.dumps(schema, indent=2))
```

**Fix**: Verify schema has proper types, enums, descriptions

### Issue 3: Parameter Validation Not Working
**Symptom**: Invalid parameters accepted

**Debug**:
```python
# Check decorator is applied
import inspect
from data_tools import analyze_bad_actors
print(inspect.getsource(analyze_bad_actors))
# Should see @validate_parameters
```

**Fix**: Ensure decorator is applied to all tools

### Issue 4: Cache Not Working
**Symptom**: Repeated queries still slow

**Debug**:
```python
# Check cache hit rate
from cache import cache
print(f"Hit rate: {cache.hits / (cache.hits + cache.misses) * 100:.1f}%")
```

**Fix**: Verify cache key generation, check TTL settings

## 📊 Success Metrics Dashboard

After each phase, check these metrics:

```python
# metrics.py utility
from metrics import get_agent_metrics

metrics = get_agent_metrics(last_n_queries=100)

print(f"""
Agent Performance Metrics (Last 100 Queries)
============================================
Avg Response Time: {metrics['avg_response_time']:.2f}s (target: <5s)
Max Iteration Hit Rate: {metrics['max_iteration_rate']:.1f}% (target: <5%)
Tool Success Rate: {metrics['tool_success_rate']:.1f}% (target: >95%)
Cache Hit Rate: {metrics['cache_hit_rate']:.1f}% (target: >50%)
Query Coverage: {metrics['query_coverage']:.1f}% (target: >90%)

Query Path Distribution:
- Fast Path: {metrics['fast_path_count']} ({metrics['fast_path_pct']:.1f}%)
- Data Path: {metrics['data_path_count']} ({metrics['data_path_pct']:.1f}%)

Tool Usage (Top 10):
{metrics['top_tools']}
""")
```

## 🎯 Acceptance Criteria

Before marking phase complete, verify:

### Phase 1: Critical Fixes
- [ ] Auto-fix success rate >70%
- [ ] Average iterations <5
- [ ] Max iteration hit rate <5%
- [ ] All 20 tools functional
- [ ] Agent calls new tools correctly

### Phase 2: Validation
- [ ] All invalid parameters rejected
- [ ] Clear error messages with hints
- [ ] Schema has types, enums, ranges
- [ ] No crashes from bad input

### Phase 3: Error Recovery
- [ ] Auto-fix works for column quotes
- [ ] Query simplification on repeated errors
- [ ] Retry budget prevents infinite loops
- [ ] Clear error messages with fix suggestions

### Phase 4: Performance
- [ ] Cache hit rate >50%
- [ ] Cached queries <10ms
- [ ] No file lock errors
- [ ] 10 concurrent queries succeed

### Phase 5: Multi-Plant
- [ ] Different results per plant
- [ ] Plant filtering works correctly
- [ ] Schema includes plant_id
- [ ] Compatible with plant_registry.py

### Phase 6: Monitoring
- [ ] Metrics endpoint accessible
- [ ] Health check comprehensive
- [ ] Response times tracked
- [ ] Tool usage monitored

### Phase 7: Testing
- [ ] Test coverage >85%
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Documentation complete

## 📞 Support & Resources

**Documentation**:
- Implementation Plan: `IMPLEMENTATION_PLAN.md`
- Problem Analysis: `ANALYSIS_REPORT.md` (37 problems detailed)
- API Reference: `API_REFERENCE.md` (after Phase 7)

**Testing**:
- Phase 1 Tests: `tests/verify_phase1.py`
- Phase 2 Tests: `tests/verify_phase2.py`
- Full Suite: `tests/verify_all.sh`

**Monitoring**:
- Metrics: `GET /agent/pvci/metrics`
- Health: `GET /agent/pvci/health`
- Logs: Check console output for iteration tracking

**Rollback**:
```bash
# If issues occur, rollback:
git checkout main
rm -rf PVCI-agent
mv PVCI-agent.backup PVCI-agent
# Restart backend server
```

## 🏁 Ready to Start?

1. Read `IMPLEMENTATION_PLAN.md` for detailed steps
2. Create git branch: `git checkout -b fix/pvci-agent-improvements`
3. Start with Phase 1: Max Iterations Fix
4. Test each change: `python tests/verify_phase1.py`
5. Commit frequently: `git commit -m "Phase 1.1: Add error pattern matching"`
6. Move to next phase when verification passes

Good luck! 🚀
