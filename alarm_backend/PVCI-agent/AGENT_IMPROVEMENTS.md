# PVCI Agent Improvement Plan

## Critical Issues & Solutions

### 1. **Enhanced System Prompt**

#### Current Problems:
- Lacks schema details and examples
- No guidance on error recovery
- Missing business context (Priority codes)
- Doesn't explain retry strategies

#### Improved Prompt Structure:

```python
ENHANCED_SYSTEM_PROMPT = """
You are an **Expert SQL Data Analysis Agent** specialized in industrial alarm systems. Your mission is to analyze user queries about alarm data and provide accurate, actionable insights.

## DATABASE SCHEMA

**Table:** `alerts`

| Column | Type | Description | Example Values |
|--------|------|-------------|----------------|
| Event Time | DATETIME | Alarm timestamp | '2025-01-15 14:32:10' |
| Location Tag | TEXT | Plant location code | 'REACTOR-01', 'TANK-05' |
| Source | TEXT | Alarm source identifier | 'TI-101', 'PI-205' |
| Condition | TEXT | Alarm condition type | 'HI', 'LO', 'HIHI', 'LOLO' |
| Action | TEXT | Operator action | 'ACK' (acknowledged), 'OK' (cleared), NULL (active) |
| Priority | TEXT | Alarm priority code | 'E'/'U' (Critical), 'H' (High), 'L' (Low), 'J' (J-coded) |
| Description | TEXT | Alarm description | 'High Temperature Alarm' |
| Value | NUMERIC | Alarm value | 156.7, 2.3 |
| Units | TEXT | Measurement units | '°C', 'bar', 'kg/h' |

**IMPORTANT PRIORITY MAPPINGS:**
- User says "HIGH" → Query: `Priority IN ('H', 'HIGH')`
- User says "CRITICAL" → Query: `Priority IN ('E', 'U', 'CRITICAL')`
- User says "LOW" → Query: `Priority IN ('L', 'LOW')`
- User says "J-CODED" → Query: `Priority IN ('J', 'J-CODED', 'JCODED')`

**DATA NORMALIZATION:**
- All text fields are stored in UPPERCASE
- Always use UPPER() function or uppercase literals in WHERE clauses
- Dates use 'YYYY-MM-DD HH:MM:SS' format

## AVAILABLE TOOLS

### 1. `execute_sql_query(sql_query: str)` → str
Executes a SELECT query and returns JSON results.

**Usage Guidelines:**
- Only SELECT statements allowed (no INSERT, UPDATE, DELETE)
- Use LIMIT to avoid overwhelming results (default: top 10)
- Use ORDER BY to sort meaningfully
- GROUP BY for aggregations
- Use date functions: `DATE()`, `strftime()`, `datetime()`

**Example Queries:**
```sql
-- Top 10 sources by alarm count
SELECT Source, COUNT(*) as alarm_count 
FROM alerts 
GROUP BY Source 
ORDER BY alarm_count DESC 
LIMIT 10;

-- High priority alarms in last 24 hours
SELECT "Event Time", Source, Description, Priority
FROM alerts
WHERE Priority IN ('H', 'HIGH')
  AND datetime("Event Time") >= datetime('now', '-1 day')
ORDER BY "Event Time" DESC;

-- Alarm distribution by location and priority
SELECT "Location Tag", Priority, COUNT(*) as count
FROM alerts
GROUP BY "Location Tag", Priority
ORDER BY count DESC;
```

### 2. `analyze_alarm_behavior(sql_query: str)` → str
Runs advanced alarm analysis (chattering, stale, bad actors, floods) on SQL query results.

**When to Use:**
- User asks about "chattering", "stale", "unhealthy", "bad actor" alarms
- User wants behavioral insights beyond simple counts
- User asks "analyze behavior" or "alarm patterns"

**Requirements:**
- SQL must return 'Event Time' and 'Source' columns
- Results should cover a meaningful time range (hours/days)

**Example:**
```sql
SELECT * FROM alerts 
WHERE Priority IN ('E', 'U') 
AND datetime("Event Time") >= datetime('now', '-7 days');
```

## WORKFLOW

### Step 1: Understand Intent
- Parse user query for: time ranges, priorities, locations, sources
- Identify if simple count/list OR behavioral analysis needed
- Check for ambiguous terms (e.g., "important" → clarify priority)

### Step 2: Construct Query
- Start with appropriate tool (execute_sql_query OR analyze_alarm_behavior)
- Build SQL with proper filters, joins, aggregations
- Apply UPPERCASE normalization to text filters
- Add LIMIT clause to prevent overwhelming results

### Step 3: Handle Tool Response
- **If successful:** Parse JSON, format as human-readable answer
- **If error:** Analyze error message:
  - SQL syntax error → Fix query syntax and retry
  - "zero rows" → Explain filters may be too restrictive, suggest broader query
  - Column not found → Check schema and fix column name
  - Operational error → Retry with simpler query

### Step 4: Provide Answer
- Clear, concise English summary
- Include key numbers and insights
- If tables/lists: format with markdown
- Always cite the data source (e.g., "Based on 1,245 alarms from Jan 2025")

## ERROR RECOVERY RULES

1. **Query Returns Zero Rows:**
   - Don't just say "no results"
   - Suggest: "No alarms found with these filters. Try expanding the date range or checking if Priority='H' (not 'HIGH')."
   
2. **SQL Syntax Error:**
   - Fix the error and retry (you have 4 iterations)
   - Common fixes: quote column names with spaces, fix date formats, check uppercase

3. **Tool Timeout:**
   - Simplify query (remove complex JOINs, reduce date range)
   - Add LIMIT to reduce result size

4. **Ambiguous Request:**
   - Ask clarifying question in reasoning
   - Make best guess and proceed (don't block on minor ambiguities)

## RESPONSE FORMATTING

- Use **markdown** for structure
- Use tables for comparisons
- Use bullet points for lists
- **Bold** key numbers
- Include units (e.g., "156.7 °C", "24 alarms")

## EXAMPLES

**User:** "Show me the top 10 sources by alarm count"
**Tool Call:** execute_sql_query
**SQL:** `SELECT Source, COUNT(*) as alarm_count FROM alerts GROUP BY Source ORDER BY alarm_count DESC LIMIT 10;`
**Answer:** "Here are the top 10 alarm sources by count: [formatted table with Source and Count columns]"

**User:** "Analyze alarm behavior for high priority alarms"
**Tool Call:** analyze_alarm_behavior
**SQL:** `SELECT * FROM alerts WHERE Priority IN ('H', 'HIGH');`
**Answer:** "Analysis of high-priority alarms: [summary of chattering, stale, bad actors with specific numbers]"

**User:** "What are the most active locations?"
**Tool Call:** execute_sql_query
**SQL:** `SELECT "Location Tag", COUNT(*) as alarm_count FROM alerts GROUP BY "Location Tag" ORDER BY alarm_count DESC LIMIT 10;`
**Answer:** "The most active locations are: [formatted list with counts]"

## CRITICAL REMINDERS

- ✅ ALWAYS use tools - never make up data
- ✅ Quote column names with spaces: "Event Time", "Location Tag"
- ✅ Apply UPPERCASE normalization to text filters
- ✅ Map user priority terms to database codes (HIGH→H, CRITICAL→E/U)
- ✅ If query fails, analyze error and retry with fix
- ✅ Provide complete answers, not just raw data dumps
- ✅ Include context (time ranges, sample sizes) in answers

You are professional, accurate, and helpful. Always provide complete answers based on tool results.
"""
```

---

### 2. **Enhanced Retry Logic with Exponential Backoff**

```python
async def _create_stream_with_retry():
    """Create a streaming completion with smart retry logic."""
    import random
    
    max_retries = 3
    base_delay = 1.0
    
    for attempt in range(max_retries):
        try:
            return await client.chat.completions.create(
                model=model,
                messages=messages,
                tools=tools_schema,
                stream=True,
                extra_body={"reasoning": {"effort": "high"}},
            )
        except Exception as e:
            error_str = str(e).lower()
            
            # Non-retryable errors
            if any(x in error_str for x in ['authentication', 'api key', 'invalid', 'permission']):
                logger.error(f"Non-retryable error: {e}")
                raise
            
            # Last attempt - raise
            if attempt == max_retries - 1:
                logger.error(f"Max retries reached: {e}")
                raise
            
            # Exponential backoff with jitter
            delay = base_delay * (2 ** attempt) + random.uniform(0, 0.5)
            logger.warning(f"Retry {attempt+1}/{max_retries} after {delay:.2f}s: {e}")
            await asyncio.sleep(delay)
```

---

### 3. **Improved Tool Error Handling**

```python
# In the tool execution section (around line 154-170)
tool_func = tool_map.get(tool_name)
try:
    tool_result = await asyncio.to_thread(tool_func, **tool_args)
except Exception as tool_error:
    # Log detailed error
    logger.error(f"Tool {tool_name} failed: {tool_error}", exc_info=True)
    
    # Provide helpful error context to LLM
    tool_result = json.dumps({
        "error": f"Tool execution failed: {str(tool_error)}",
        "tool": tool_name,
        "suggestion": "Try simplifying the query or checking SQL syntax. Common issues: unquoted column names with spaces, incorrect date formats, or case-sensitive filters (use UPPER())."
    })

# Parse tool result for structured errors
try:
    result_obj = json.loads(tool_result)
    if "error" in result_obj:
        error_msg = result_obj.get("error", "")
        # Don't auto-terminate - let LLM retry with fixed query
        logger.warning(f"Tool returned error: {error_msg}")
        # Include helpful hint in the result
        if "syntax" in error_msg.lower():
            result_obj["hint"] = "SQL syntax issue. Check column names (quote if they have spaces), date formats, and case sensitivity."
        elif "zero rows" in error_msg.lower() or "no results" in error_msg.lower():
            result_obj["hint"] = "No matching records. Try: 1) Expand date range, 2) Check Priority mappings (HIGH→H, CRITICAL→E/U), 3) Verify UPPERCASE filters"
        tool_result = json.dumps(result_obj)
except:
    pass  # Not JSON, continue
```

---

### 4. **Better Error Messages for Frontend**

```python
# Replace line 223 with more specific error handling
except asyncio.TimeoutError:
    yield {
        "type": "error", 
        "message": "Request timeout. The query may be too complex or the database is busy. Try a simpler query with LIMIT.",
        "iteration": iteration,
        "error_type": "timeout"
    }
    break
except json.JSONDecodeError as e:
    yield {
        "type": "error",
        "message": f"Tool returned invalid JSON: {str(e)}. This may be a backend issue.",
        "iteration": iteration,
        "error_type": "json_decode"
    }
    break
except Exception as e:
    # Log full traceback server-side
    logger.error(f"Agent error at iteration {iteration}", exc_info=True)
    
    # User-friendly error message
    error_msg = str(e)
    if "openrouter" in error_msg.lower() or "api" in error_msg.lower():
        user_message = "AI service error. Please try again in a moment."
    elif "database" in error_msg.lower() or "sql" in error_msg.lower():
        user_message = "Database query error. Try rephrasing your question or using simpler filters."
    else:
        user_message = f"Unexpected error: {error_msg}"
    
    yield {
        "type": "error",
        "message": user_message,
        "iteration": iteration,
        "error_type": "general",
        "debug": error_msg  # Include for debugging (hide in production UI)
    }
    break
```

---

### 5. **Add Query Validation**

Add a new function in `data_tools.py`:

```python
def validate_sql_query(sql: str) -> tuple[bool, str]:
    """
    Validates SQL query for common issues before execution.
    Returns (is_valid, error_message)
    """
    sql_upper = sql.upper().strip()
    
    # Must be SELECT
    if not sql_upper.startswith('SELECT'):
        return False, "Only SELECT queries are allowed"
    
    # Check for dangerous keywords
    dangerous = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'TRUNCATE']
    for keyword in dangerous:
        if keyword in sql_upper:
            return False, f"Forbidden keyword: {keyword}"
    
    # Check for required table name
    if 'FROM ALERTS' not in sql_upper and 'FROM `ALERTS`' not in sql_upper and 'FROM "ALERTS"' not in sql_upper:
        return False, "Query must reference the 'alerts' table"
    
    # Warn if no LIMIT (optional warning)
    if 'LIMIT' not in sql_upper and 'COUNT' not in sql_upper:
        # This is just a warning, not an error
        logger.warning(f"Query has no LIMIT clause: {sql[:100]}")
    
    return True, ""

# Use in execute_sql_query:
def execute_sql_query(sql_query: str) -> str:
    """Executes a read-only SQL query against the 'alerts' database table."""
    try:
        # Validate first
        is_valid, error_msg = validate_sql_query(sql_query)
        if not is_valid:
            return json.dumps({"error": f"Invalid query: {error_msg}"})
        
        # Normalize priority literals
        sql_query = _normalize_priority_literals(sql_query)
        
        # Execute
        conn = sqlite3.connect(DB_FILE)
        result_df = pd.read_sql_query(sql_query, conn)
        conn.close()
        
        if result_df.empty:
            return json.dumps({
                "message": "Query returned zero results.",
                "suggestion": "Try expanding filters (e.g., broader date range, remove specific location filters, or check Priority mappings: HIGH→'H', CRITICAL→'E'/'U')"
            })
        
        # Return results with metadata
        return json.dumps({
            "data": result_df.head(10).to_dict(orient='records'),
            "row_count": len(result_df),
            "columns": list(result_df.columns),
            "truncated": len(result_df) > 10
        }, indent=2)
        
    except sqlite3.OperationalError as e:
        return json.dumps({
            "error": f"SQL Query Error: {str(e)}",
            "query": sql_query,
            "hint": "Common fixes: 1) Quote column names with spaces (e.g., \"Event Time\"), 2) Check date formats (YYYY-MM-DD HH:MM:SS), 3) Use UPPER() for text comparisons"
        })
    except Exception as e:
        logger.error(f"SQL execution error: {e}", exc_info=True)
        return json.dumps({
            "error": f"Unexpected error: {str(e)}",
            "type": type(e).__name__
        })
```

---

### 6. **Add Iteration Budget Management**

```python
# In run_glm_agent, around line 94:
iteration_budget = {
    "total": max_iterations,
    "used": 0,
    "tool_calls": 0,
    "retries": 0
}

while iteration < max_iterations:
    iteration += 1
    iteration_budget["used"] = iteration
    
    # ... existing code ...
    
    if function_call_info and function_call_info.get("name"):
        iteration_budget["tool_calls"] += 1
        
        # Warn if too many tool calls without progress
        if iteration_budget["tool_calls"] > 3 and not final_answer_stream:
            logger.warning(f"Agent made {iteration_budget['tool_calls']} tool calls without final answer")
            # Could optionally inject a message to force conclusion
    
    # At the end, include budget in completion event
    yield {
        "type": "complete",
        "data": {
            "iterations": iteration,
            "budget": iteration_budget
        }
    }
```

---

### 7. **Add Prompt Examples Database**

Create `prompt_examples.py`:

```python
# Few-shot examples to inject into system prompt
FEW_SHOT_EXAMPLES = [
    {
        "user": "Show me critical alarms from last week",
        "reasoning": "User wants critical priority alarms. Map 'critical' to Priority IN ('E','U','CRITICAL'). Time range: last 7 days.",
        "tool": "execute_sql_query",
        "sql": """SELECT "Event Time", Source, "Location Tag", Description, Priority 
FROM alerts 
WHERE Priority IN ('E', 'U', 'CRITICAL') 
  AND datetime("Event Time") >= datetime('now', '-7 days')
ORDER BY "Event Time" DESC 
LIMIT 100;""",
        "answer": "Found 87 critical alarms in the last week. Top sources: TI-101 (23 alarms), PI-205 (15 alarms)..."
    },
    {
        "user": "Which location has the most alarms?",
        "reasoning": "Need to group by Location Tag and count. Order by count descending.",
        "tool": "execute_sql_query",
        "sql": """SELECT "Location Tag", COUNT(*) as alarm_count 
FROM alerts 
GROUP BY "Location Tag" 
ORDER BY alarm_count DESC 
LIMIT 1;""",
        "answer": "REACTOR-01 has the most alarms with 1,234 total occurrences."
    },
    {
        "user": "Analyze chattering alarms",
        "reasoning": "User wants behavioral analysis. Use analyze_alarm_behavior tool with all alarms or recent subset.",
        "tool": "analyze_alarm_behavior",
        "sql": """SELECT * FROM alerts 
WHERE datetime("Event Time") >= datetime('now', '-30 days');""",
        "answer": "Chattering analysis: Found 45 sources with chattering behavior (alarms within 60 seconds). Top chattering source: TI-101 with 127 rapid-fire alarms..."
    }
]
```

Then inject these into the system prompt dynamically.

---

## Summary of Improvements

| Issue | Current State | Improved Solution |
|-------|---------------|-------------------|
| **System Prompt** | Basic, lacks schema details | Comprehensive with schema, examples, mappings |
| **Retry Logic** | Generic catch-all, short delays | Exponential backoff, error classification |
| **Error Handling** | "General Error: Internal Server Error" | Specific, actionable error messages |
| **Tool Errors** | Early termination on "zero rows" | Guided retry with hints |
| **Query Validation** | None | Pre-execution validation |
| **Iteration Management** | Simple counter | Budget tracking with warnings |
| **Examples** | None | Few-shot examples for guidance |

---

## Implementation Priority

1. **HIGH PRIORITY** (Do First):
   - ✅ Replace system prompt with enhanced version
   - ✅ Improve error messages (lines 222-224)
   - ✅ Add query validation to `data_tools.py`

2. **MEDIUM PRIORITY** (Do Next):
   - ✅ Enhance retry logic with exponential backoff
   - ✅ Improve tool error handling (don't early-terminate)
   - ✅ Add iteration budget tracking

3. **LOW PRIORITY** (Nice to Have):
   - ✅ Add few-shot examples
   - ✅ Add query optimization hints
   - ✅ Add telemetry/metrics logging

---

## Testing Plan

1. **Test Cases to Run:**
   - ❌ Query that returns zero rows (should suggest fixes)
   - ❌ Query with syntax error (should retry with fix)
   - ❌ Query using "HIGH" priority (should map to 'H')
   - ❌ Complex query requiring multiple tool calls
   - ❌ Ambiguous question requiring clarification

2. **Success Criteria:**
   - No "Internal Server Error" messages
   - Agent retries intelligently on errors
   - Helpful error messages guide user
   - Completes within 4 iterations for 90% of queries

---

## Monitoring & Observability

Add logging for:
- Tool call success/failure rates
- Average iterations per query
- Error types distribution
- Retry patterns
- Query performance metrics

This will help identify patterns and further optimize the agent.
