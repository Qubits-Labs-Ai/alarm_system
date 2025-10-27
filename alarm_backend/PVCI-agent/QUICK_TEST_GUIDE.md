# PVCI Agent Quick Test Guide

## 🚀 Fast Path Tests (Should be <2 seconds, NO tool calls)

### Test 1: Greeting
```json
{
  "query": "Hello",
  "sessionId": "test-greeting",
  "requestId": "req-001",
  "plant": "PVCI"
}
```
**Expected**: Friendly greeting + offer examples | **Time**: <2s | **Tools**: 0

---

### Test 2: Capabilities
```json
{
  "query": "What can you do?",
  "sessionId": "test-capabilities",
  "requestId": "req-002",
  "plant": "PVCI"
}
```
**Expected**: List capabilities + example queries | **Time**: <2s | **Tools**: 0

---

### Test 3: Help Request
```json
{
  "query": "Help me understand this system",
  "sessionId": "test-help",
  "requestId": "req-003",
  "plant": "PVCI"
}
```
**Expected**: System overview + guidance | **Time**: <2s | **Tools**: 0

---

### Test 4: Theory Question
```json
{
  "query": "What is chattering?",
  "sessionId": "test-theory",
  "requestId": "req-004",
  "plant": "PVCI"
}
```
**Expected**: Chattering explanation | **Time**: <2s | **Tools**: 0

---

### Test 5: System Info
```json
{
  "query": "What data is available?",
  "sessionId": "test-info",
  "requestId": "req-005",
  "plant": "PVCI"
}
```
**Expected**: Database schema description | **Time**: <2s | **Tools**: 0

---

## 🔍 Data Path Tests (Should use tools, 3-8 seconds)

### Test 6: Top Sources
```json
{
  "query": "Show me the top 10 alarm sources",
  "sessionId": "test-top-sources",
  "requestId": "req-006",
  "plant": "PVCI"
}
```
**Expected**: `execute_sql_query` → Table of top sources | **Time**: 3-5s | **Tools**: 1

---

### Test 7: Priority Filter
```json
{
  "query": "List high priority alarms from today",
  "sessionId": "test-priority",
  "requestId": "req-007",
  "plant": "PVCI"
}
```
**Expected**: `execute_sql_query` with Priority filter | **Time**: 3-5s | **Tools**: 1

---

### Test 8: Behavioral Analysis
```json
{
  "query": "Analyze chattering in critical alarms",
  "sessionId": "test-behavior",
  "requestId": "req-008",
  "plant": "PVCI"
}
```
**Expected**: `analyze_alarm_behavior` → Analysis report | **Time**: 4-7s | **Tools**: 1-2

---

### Test 9: Location Breakdown
```json
{
  "query": "Compare alarm counts by location",
  "sessionId": "test-location",
  "requestId": "req-009",
  "plant": "PVCI"
}
```
**Expected**: `execute_sql_query` with GROUP BY location | **Time**: 3-5s | **Tools**: 1

---

### Test 10: Time Range Query
```json
{
  "query": "Show alarms from last 24 hours",
  "sessionId": "test-timerange",
  "requestId": "req-010",
  "plant": "PVCI"
}
```
**Expected**: `execute_sql_query` with datetime filter | **Time**: 3-5s | **Tools**: 1

---

## 📊 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Fast Path Response Time | <2s | Check SSE event timestamps |
| Fast Path Tool Calls | 0 | Check for `tool_call` events |
| Data Path Response Time | 3-8s | Check SSE event timestamps |
| Data Path Tool Calls | 1-2 | Count `tool_call` events |
| Answer Accuracy | 100% | Verify results match query |
| Error Rate | <5% | Track `error` events |

---

## 🔍 What to Look For

### ✅ Good Signs (Fast Path)
- No `tool_call` events
- Single `answer_stream` event
- Response time <2 seconds
- Friendly, helpful tone
- Includes example queries

### ✅ Good Signs (Data Path)
- One or more `tool_call` events
- `tool_result` events present
- Formatted data (tables/lists)
- Cites data source
- Professional tone

### ❌ Red Flags
- Fast Path query calls tools (unnecessary)
- Data Path query doesn't call tools (fabricated data)
- Response time >10 seconds
- SQL syntax errors
- Empty results without helpful suggestions
- Generic "I'll analyze..." without actual tool execution

---

## 🛠️ Testing Commands

### Using cURL:
```bash
# Fast Path Test
curl -X POST http://localhost:8000/pvci/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello", "sessionId": "test-001", "requestId": "req-001", "plant": "PVCI"}' \
  --no-buffer

# Data Path Test
curl -X POST http://localhost:8000/pvci/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "Show top 10 sources", "sessionId": "test-002", "requestId": "req-002", "plant": "PVCI"}' \
  --no-buffer
```

### Using Python:
```python
import requests
import json

def test_agent(query, session_id):
    url = "http://localhost:8000/pvci/stream"
    payload = {
        "query": query,
        "sessionId": session_id,
        "requestId": f"req-{session_id}",
        "plant": "PVCI"
    }
    
    response = requests.post(url, json=payload, stream=True)
    
    for line in response.iter_lines():
        if line:
            line_str = line.decode('utf-8')
            if line_str.startswith('data: '):
                event = json.loads(line_str[6:])
                print(f"{event.get('type')}: {event.get('content', '')[:100]}")

# Fast Path
test_agent("Hello", "test-fast-001")

# Data Path
test_agent("Show top 10 sources", "test-data-001")
```

---

## 📈 Performance Comparison

### Before Optimization:
- Generic questions: 7-9 seconds
- Unnecessary tool calls on greetings/help
- Unclear when tools would be used

### After Optimization (Target):
- Generic questions: <2 seconds (**70-80% faster**)
- Zero tool calls on Fast Path
- Clear classification logic

---

## 🐛 Troubleshooting

### Issue: Fast Path still calling tools
**Solution**: Check LLM reasoning - model should explicitly classify as "Fast Path" before responding

### Issue: Data Path not calling tools
**Solution**: Check query - ensure it clearly requests data analysis, not just theory

### Issue: Slow Fast Path responses (>3s)
**Solution**: Check OpenRouter API latency, consider Gemini fallback

### Issue: SQL errors on Data Path
**Solution**: Check error recovery - agent should retry with fixed SQL

---

## 🎯 Priority Tests

**Must Pass**:
1. ✅ Test 1 (Greeting) - Fast Path validation
2. ✅ Test 2 (Capabilities) - Fast Path validation
3. ✅ Test 6 (Top Sources) - Data Path validation
4. ✅ Test 8 (Behavior Analysis) - Data Path validation

**Nice to Have**:
- All other tests
- Edge cases
- Error scenarios

---

## 📝 Test Results Template

```markdown
# Test Results - [Date]

## Fast Path Tests
- [ ] Test 1: Greeting - ___s, ___tools
- [ ] Test 2: Capabilities - ___s, ___tools
- [ ] Test 3: Help - ___s, ___tools
- [ ] Test 4: Theory - ___s, ___tools
- [ ] Test 5: System Info - ___s, ___tools

## Data Path Tests
- [ ] Test 6: Top Sources - ___s, ___tools
- [ ] Test 7: Priority Filter - ___s, ___tools
- [ ] Test 8: Behavioral Analysis - ___s, ___tools
- [ ] Test 9: Location Breakdown - ___s, ___tools
- [ ] Test 10: Time Range - ___s, ___tools

## Summary
- Average Fast Path: ___s (Target: <2s)
- Average Data Path: ___s (Target: 3-8s)
- Fast Path Tool Calls: ___ (Target: 0)
- Data Path Tool Calls: ___ (Target: 1-2)
- Overall Success Rate: ___%
```
