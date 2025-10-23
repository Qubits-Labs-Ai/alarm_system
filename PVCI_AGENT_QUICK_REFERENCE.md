# PVCI Agent - Quick Reference Guide

## 🎯 What Was Fixed

### **The Problem (from your screenshot)**
```
Answer: Error: General Error: Internal Server Error
```

### **Root Causes**
1. ❌ Generic error handling hid real issues
2. ❌ Agent terminated early on zero rows
3. ❌ Poor system prompt → wrong SQL queries
4. ❌ No Priority mappings (HIGH→H, CRITICAL→E/U)
5. ❌ Weak retry logic

### **The Solution**
1. ✅ Enhanced 128-line system prompt with schema, examples, error recovery
2. ✅ Specific error messages: "Database query error. Try rephrasing..." 
3. ✅ Intelligent retry: LLM sees errors + hints → self-corrects
4. ✅ Exponential backoff for API retries (1s → 2s → 4s)
5. ✅ Tools return helpful suggestions

---

## 🏗️ Architecture at a Glance

```
User Query → FastAPI → GLM Agent → LLM (GLM-4.5) → Tools → SQLite
                           ↓
                  [Iterative Loop: max 4]
                  1. LLM generates SQL
                  2. Tool executes
                  3. If error → retry with fix
                  4. Format answer
```

---

## 🔄 How Retry Logic Works

### **Type 1: API Retry** (Network errors)
```python
for attempt in [1, 2, 3]:
    try:
        call_openrouter_api()
    except:
        wait_exponentially()  # 1s, 2s, 4s
```

### **Type 2: Query Retry** (SQL errors)
```python
Iteration 1: Bad SQL → Tool returns error + hints
Iteration 2: LLM sees hints → generates fixed SQL
Iteration 3: Success → Format answer
```

**Key:** Conversation history grows, LLM learns from mistakes

---

## 📝 System Prompt Changes

### Before (39 lines)
```
"You are a SQL agent. Use these columns: Event Time, Source, Priority..."
```
❌ No schema details, no examples, no error recovery

### After (128 lines)
```
"You are an Expert SQL Agent for industrial alarms.

DATABASE SCHEMA:
| Column | Type | Examples |
| Priority | TEXT | 'E'/'U' (Critical), 'H' (High) |

PRIORITY MAPPINGS:
- User says "HIGH" → Priority IN ('H', 'HIGH')

ERROR RECOVERY:
- If syntax error → Fix and retry
- If zero rows → Suggest broader filters

EXAMPLES:
SELECT Source, COUNT(*) FROM alerts GROUP BY Source;
```
✅ Complete guidance, self-correction enabled

---

## 🛠️ Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `glm_agent.py` | Enhanced prompt, retry logic, error handling | 25-128, 165-196, 341-387 |
| `data_tools.py` | Better error messages, validation, hints | 127-210, 215-285 |

---

## 🧪 Testing

### Quick Test
```bash
cd alarm_backend/PVCI-agent
python test_improvements.py
```

### Expected Results
- ✅ No "Internal Server Error"
- ✅ Agent retries on SQL errors
- ✅ Priority mappings work (HIGH→H)
- ✅ Helpful error messages with suggestions

---

## 🚀 Deployment

### 1. Restart Backend
```bash
# Kill existing process
# Restart:
cd alarm_backend
uvicorn main:app --reload --port 8000
```

### 2. Test from UI
- Go to `/pvci-agent` page
- Try: "Show me high priority alarms"
- Verify: No errors, correct Priority mapping

### 3. Monitor Logs
Look for:
- `⚠️ Retry X/3 after Y.XXs` - API retries
- `❌ Tool execution failed` - Tool errors (should recover)
- `✅` - Successful completions

---

## 📊 Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| Error Message | "Internal Server Error" | "Database query error. Try..." |
| Zero Rows | Early termination | Suggestions + retry |
| Priority Mapping | None | HIGH→H, CRITICAL→E/U |
| Retry Logic | Linear (0.4s, 0.8s) | Exponential (1s, 2s, 4s) |
| Tool Errors | Crash | Structured error + hints |
| Success Rate | ~60-70% | Target: 90%+ |

---

## 🎓 Key Concepts

### Priority Code Mappings
```
User Says        Database Has        Query Should Use
---------        ------------        ----------------
"HIGH"           'H'                 Priority IN ('H', 'HIGH')
"CRITICAL"       'E', 'U'            Priority IN ('E', 'U', 'CRITICAL')
"LOW"            'L'                 Priority IN ('L', 'LOW')
"J-CODED"        'J'                 Priority IN ('J', 'J-CODED')
```

### Column Name Rules
```sql
✅ Correct: SELECT "Event Time", "Location Tag" FROM alerts
❌ Wrong:   SELECT Event Time, Location Tag FROM alerts
```
**Why:** Column names with spaces must be quoted

### Date Filtering
```sql
✅ Correct: WHERE datetime("Event Time") >= datetime('now', '-7 days')
❌ Wrong:   WHERE "Event Time" > '2025-01-01'
```

---

## 🐛 Common Issues & Solutions

### Issue: "No results found"
**Solution:** Tool now returns:
```json
{
  "message": "Query returned zero results",
  "suggestions": [
    "Expand date range (last 7 days instead of 24 hours)",
    "Check Priority mappings (HIGH → 'H')",
    "Verify UPPERCASE filters",
    "Remove specific location filters"
  ]
}
```

### Issue: SQL syntax error
**Solution:** Tool returns:
```json
{
  "error": "SQL Query Error: no such column: event_time",
  "hints": [
    "Quote column names with spaces: \"Event Time\"",
    "Valid columns: Event Time, Location Tag, Source, ..."
  ]
}
```
LLM sees this and retries with fix.

### Issue: AI service error
**Solution:** API retry logic handles it:
- Attempt 1: Fails → Wait 1s
- Attempt 2: Fails → Wait 2.5s  
- Attempt 3: Success ✅

---

## 📖 Documentation

- **Complete Analysis:** `PVCI_AGENT_COMPLETE_ANALYSIS.md` (10,000+ words)
- **Improvement Guide:** `AGENT_IMPROVEMENTS.md` (3,000+ words)
- **Implementation Summary:** `IMPROVEMENTS_SUMMARY.md` (2,500+ words)
- **Test Suite:** `test_improvements.py`
- **This Guide:** `PVCI_AGENT_QUICK_REFERENCE.md`

---

## ✅ Checklist

**Before Testing:**
- [x] Code changes applied
- [x] System prompt enhanced
- [x] Error handling improved
- [x] Retry logic upgraded
- [ ] Backend restarted
- [ ] Test suite run
- [ ] UI tested manually

**Production Readiness:**
- [ ] All tests passing
- [ ] Error rate < 10%
- [ ] Average iterations < 3
- [ ] No "Internal Server Error" in logs
- [ ] Monitoring enabled

---

## 🆘 Quick Troubleshooting

### "Agent not working"
1. Check backend is running: `http://localhost:8000/agent/pvci/health`
2. Check database loaded: `ls -lh PVCI-agent/alerts.db`
3. Check API key in `.env`: `OPENROUTER_API_KEY=...`

### "Still getting errors"
1. Check server logs for full traceback
2. Look for retry messages: `⚠️ Retry X/3`
3. Verify tool execution: `[DEBUG] TOOL RESULT RAW OUTPUT`

### "Queries not working"
1. Test simple query: "Count all alarms"
2. Check Priority mapping: "Show me high priority alarms"
3. Verify date filtering: "Show alarms from last 7 days"

---

## 📞 Support

**Files to Check:**
- `alarm_backend/logs/` - Backend logs
- `alarm_backend/PVCI-agent/alerts.db` - Database
- Browser console - Frontend errors

**Key Indicators:**
- ✅ `⚠️ Retry X/3` - API retries working
- ✅ `❌ Tool execution failed` + recovery - Error handling working
- ❌ `Internal Server Error` - Still issues (shouldn't happen now)

---

**Last Updated:** January 23, 2025
**Status:** ✅ IMPROVED - READY FOR TESTING
