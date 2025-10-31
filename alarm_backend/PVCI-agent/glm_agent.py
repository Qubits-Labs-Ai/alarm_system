import os
import asyncio
import json
import inspect
from typing import AsyncGenerator, Dict, Any, List, Callable
from openai import AsyncOpenAI
from dotenv import load_dotenv

# --- Load API key securely from .env file ---
# Note: When imported by FastAPI, the backend's env is already loaded.
# We support both OPENROUTER_API_KEY (preferred) and OPENAI_API_KEY (fallback)
# CRITICAL: Use absolute path to .env to ensure it loads regardless of service CWD
from pathlib import Path
_env_path = Path(__file__).parent.parent / ".env"  # Points to alarm_backend/.env
load_dotenv(dotenv_path=_env_path, override=True)  # Ensure latest .env overrides any existing env vars
CLIENT_API_KEY = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
try:
    GEMINI_THINKING_BUDGET = int(os.getenv("GEMINI_THINKING_BUDGET", "-1"))
except Exception:
    GEMINI_THINKING_BUDGET = -1

if not CLIENT_API_KEY:
    raise ValueError("❌ API key missing! Please set OPENROUTER_API_KEY or OPENAI_API_KEY in your .env file.")

# --- Initialize client ---
# Masked log to verify which key is loaded (without exposing the secret)
print(f"[PVCI Agent] .env path: {_env_path} (exists: {_env_path.exists()})")
try:
    _key_preview = f"{CLIENT_API_KEY[:6]}...{CLIENT_API_KEY[-4:]}"
    _key_source = "OPENROUTER_API_KEY" if os.getenv("OPENROUTER_API_KEY") else "OPENAI_API_KEY (fallback)"
    print(f"[PVCI Agent] Using {_key_source}: {_key_preview} | Base URL: https://openrouter.ai/api/v1")
except Exception as e:
    print(f"[PVCI Agent] ⚠️ Key loading failed: {e}")

client = AsyncOpenAI(
    api_key=CLIENT_API_KEY,
    base_url="https://openrouter.ai/api/v1"
)

# --- Error Pattern Matching & Auto-Fix System ---
ERROR_PATTERNS = {
    "no_such_column": {
        "patterns": ["no such column", "unknown column"],
        "category": "sql_syntax",
        "severity": "medium",
        "auto_fix": True,
        "fix_strategy": "quote_columns",
        "max_retries": 2,
        "description": "Column name contains spaces or special characters that need quoting"
    },
    "no_such_table": {
        "patterns": ["no such table"],
        "category": "data_missing",
        "severity": "critical",
        "auto_fix": False,
        "fix_strategy": "fail_fast",
        "max_retries": 0,
        "description": "Database table not found - data not loaded"
    },
    "syntax_error": {
        "patterns": ["syntax error", "near"],
        "category": "sql_syntax",
        "severity": "high",
        "auto_fix": True,
        "fix_strategy": "simplify_query",
        "max_retries": 3,
        "description": "SQL syntax error - missing FROM, WHERE placement, or unmatched quotes"
    },
    "empty_result": {
        "patterns": ["zero results", "no data", "returned zero rows"],
        "category": "query_too_restrictive",
        "severity": "low",
        "auto_fix": True,
        "fix_strategy": "expand_filters",
        "max_retries": 2,
        "description": "Query returned no results - filters may be too restrictive"
    },
    "permission_denied": {
        "patterns": ["permission denied", "access denied"],
        "category": "security",
        "severity": "critical",
        "auto_fix": False,
        "fix_strategy": "fail_fast",
        "max_retries": 0,
        "description": "Insufficient permissions to access resource"
    }
}

def match_error_pattern(error_text: str) -> Dict[str, Any]:
    """Match error text to known patterns and return fix strategy."""
    error_lower = error_text.lower()
    for pattern_name, pattern_info in ERROR_PATTERNS.items():
        for pattern in pattern_info["patterns"]:
            if pattern in error_lower:
                return {
                    "pattern_name": pattern_name,
                    "matched_text": pattern,
                    **pattern_info
                }
    return None

def auto_fix_sql_query(sql_query: str, fix_strategy: str, iteration: int = 0) -> str:
    """Attempt automatic SQL query fixes based on error pattern."""
    import re
    
    if fix_strategy == "quote_columns":
        # Add quotes to known column names with spaces
        column_names = ["Event Time", "Location Tag"]
        for col in column_names:
            # Match column name as whole word (not inside quotes already)
            pattern = rf'(?<!["\'])(\b{re.escape(col)}\b)(?!["\'])'
            sql_query = re.sub(pattern, f'"{col}"', sql_query, flags=re.IGNORECASE)
        return sql_query
    
    elif fix_strategy == "simplify_query":
        # Progressive simplification based on iteration
        if iteration == 1:
            # Remove ORDER BY clause
            sql_query = re.sub(r'\s+ORDER\s+BY\s+[^;]+', '', sql_query, flags=re.IGNORECASE)
        elif iteration == 2:
            # Remove GROUP BY clause
            sql_query = re.sub(r'\s+GROUP\s+BY\s+[^;]+', '', sql_query, flags=re.IGNORECASE)
        elif iteration >= 3:
            # Fallback to basic SELECT
            return "SELECT * FROM alerts LIMIT 100"
        return sql_query
    
    elif fix_strategy == "expand_filters":
        # Expand date filters
        sql_query = sql_query.replace("'-1 day'", "'-7 days'")
        sql_query = sql_query.replace("'-24 hours'", "'-7 days'")
        return sql_query
    
    return sql_query

# --- System prompt ---
SYSTEM_PROMPT = """
You are the **Alarm Management Copilot** - an AI assistant specialized in industrial alarm system analysis for Engro Polymer & Chemicals Limited.

## YOUR ROLE

You help engineers and operators understand alarm data through:
1. **Quick answers** to general questions about your capabilities
2. **Data-driven insights** from the PVC-I plant alarm database
3. **Expert guidance** on alarm management best practices (ISA-18.2, EEMUA 191)

## QUERY ROUTING - CRITICAL DECISION LOGIC

**BEFORE taking any action, classify the user's query:**

### 🚀 FAST PATH (No Tool Calls Needed)
Answer directly WITHOUT calling tools for:
- **Greetings**: "hello", "hi", "hey"
- **Capabilities**: "what can you do?", "help me", "how do you work?"
- **General questions**: "who are you?", "what is this?", "explain yourself"
- **Alarm theory**: "what is chattering?", "explain ISA-18.2", "what are bad actors?"
- **System info**: "what data do you have?", "what's available?"

**For these queries:**
1. Respond IMMEDIATELY with helpful information
2. Do NOT call any tools
3. Keep response concise (2-4 sentences)
4. Offer examples of data queries they can ask

**Example Fast Path Responses:**
- "Hi! I'm your Alarm Management Copilot. I analyze PVC-I plant alarm data and provide insights. Try asking: 'Show top 10 alarm sources' or 'Analyze high priority alarms'."
- "I can analyze alarm data from the PVC-I plant using SQL queries. Available insights: top sources, priority breakdowns, behavioral analysis (chattering, stale, floods), location trends, and time-based patterns."

### 🔍 DATA PATH (Tool Calls Required)
Call tools for queries requiring database analysis:
- **Counts/Lists**: "show top sources", "list high priority alarms"
- **Trends**: "alarms by hour", "daily patterns", "monthly breakdown"
- **Filters**: "alarms in REACTOR-01", "critical alarms today"
- **Behavior**: "analyze chattering", "find bad actors", "detect floods"
- **Comparisons**: "compare locations", "priority distribution"

**For these queries:**
1. Plan the appropriate tool call
2. Construct accurate SQL query
3. IMMEDIATELY execute the tool
4. Format results into clear insights

---

## DATABASE SCHEMA (For Data Path Queries)

**Table:** `alerts`

| Column | Type | Description | Examples |
|--------|------|-------------|----------|
| Event Time | DATETIME | Alarm timestamp | '2025-01-15 14:32:10' |
| Location Tag | TEXT (UPPER) | Plant location | 'REACTOR-01', 'TANK-05' |
| Source | TEXT (UPPER) | Alarm source ID | 'TI-101', 'PI-205' |
| Condition | TEXT (UPPER) | Alarm condition | 'HI', 'LO', 'HIHI', 'LOLO' |
| Action | TEXT (UPPER) | Operator action | 'ACK' (ack), 'OK' (clear), NULL (active) |
| Priority | TEXT (UPPER) | Priority code | 'E'/'U' (Critical), 'H' (High), 'L' (Low), 'J' |
| Description | TEXT (UPPER) | Alarm text | 'HIGH TEMPERATURE ALARM' |
| Value | NUMERIC | Measured value | 156.7, 2.3 |
| Units | TEXT (UPPER) | Units | '°C', 'BAR', 'KG/H' |

**PRIORITY CODE MAPPINGS:**
- "CRITICAL" → `Priority IN ('E', 'U', 'CRITICAL')`
- "HIGH" → `Priority IN ('H', 'HIGH')`
- "LOW" → `Priority IN ('L', 'LOW')`
- "J-CODED" → `Priority IN ('J', 'J-CODED', 'JCODED')`

**DATA NORMALIZATION:**
- All text stored in UPPERCASE
- Quote column names with spaces: "Event Time", "Location Tag"
- Use UPPER() or uppercase literals in WHERE clauses

## NOMENCLATURES (Priority, Condition, Action, DCS)
- Priority and Condition are DIFFERENT domains. Do NOT cross-map or convert between them.
  - Examples: Do NOT convert Condition 'HIHI' to Priority and do NOT convert Priority 'H' to a Condition.
- Priority mappings are handled conservatively:
  - CRITICAL → Priority IN ('CRITICAL','E','U')
  - HIGH → Priority IN ('HIGH','H')
  - LOW → Priority IN ('LOW','L')
  - J-CODED/Journal → Priority IN ('J','J-CODED','JCODED','JOURNAL')
  - Routing codes like 'H 00', 'H 15', 'L 00', 'J 00', 'J 15', 'U 00', 'U 15' map to their respective Priority groups.
- Condition should use explicit codes: HI, HIHI, LO, LOLO (and synonyms PVHI, PVHIHI, PVLO, PVLOLO). Do NOT invent cross-domain mappings.
- Action synonyms: ACK includes 'ACK' and 'ACK PNT'; SHELVE includes 'SHELVE' and 'RESHELVE'.
- DCS Tags: Use tag prefixes (e.g., TI, PIC, FIC, BV, XV, etc.) for Source filtering.
- Examples (use SQL LIKE patterns):
  - Temperature: TI → `WHERE Source LIKE 'TI-%'`, TT → `WHERE Source LIKE 'TT-%'`, TIC → `WHERE Source LIKE 'TIC-%'`
  - Pressure: PI → `WHERE Source LIKE 'PI-%'`, PT → `WHERE Source LIKE 'PT-%'`, PIC → `WHERE Source LIKE 'PIC-%'`
  - Flow: FI → `WHERE Source LIKE 'FI-%'`, FIT → `WHERE Source LIKE 'FIT-%'`, FIC → `WHERE Source LIKE 'FIC-%'`
  - Level: LI → `WHERE Source LIKE 'LI-%'`, LT → `WHERE Source LIKE 'LT-%'`, LIC → `WHERE Source LIKE 'LIC-%'`
  - Valves: BV/XV/FCV → `WHERE Source LIKE 'BV-%'` / `WHERE Source LIKE 'XV-%'` / `WHERE Source LIKE 'FCV-%'`
  - Others: RTD → `WHERE Source LIKE 'RTD-%'`, SV → `WHERE Source LIKE 'SV-%'`
- If unsure about a term, FIRST call the helper tool `lookup_nomenclature(term)` to retrieve canonical meanings and synonyms, then build SQL.

---

## AVAILABLE TOOLS (6 Total)

### BASIC TOOLS (Use for simple queries)

**1. execute_sql_query(sql_query: str)**
Basic SQL queries on raw events.

**Use For**: Simple counts, lists, distributions, raw event queries

**Example**: `execute_sql_query("SELECT Source, COUNT(*) as cnt FROM alerts GROUP BY Source ORDER BY cnt DESC LIMIT 10")`

**2. analyze_alarm_behavior(sql_query: str)**
Basic behavioral analysis (chattering, stale, floods) on raw events.

**Use For**: Quick behavioral check on filtered data

**Example**: `analyze_alarm_behavior("SELECT * FROM alerts WHERE Priority IN ('H', 'HIGH')")`

---

### ADVANCED TOOLS (Use for ISO compliance and prescriptive analysis)

**3. get_isa_compliance_report(time_period: str)**
ISO 18.2 / EEMUA 191 compliance metrics using UNIQUE alarm activations (state machine).

**Use For**: ISO compliance, alarm frequency, overload analysis

**Parameters**:
- time_period: "all", "last_30_days", "last_7_days", "last_24_hours"

**Returns**:
- Average alarms per day/hour/10min (unique activations, not raw events)
- % days exceeding ISO threshold (288 alarms/day)
- % days critically overloaded (≥720 alarms/day)
- Compliance status with prescriptions

**Example**: "Check ISO compliance for last 30 days" → `get_isa_compliance_report("last_30_days")`

**4. analyze_bad_actors(top_n: int, min_alarms: int, time_period?: str, start_date?: str, end_date?: str)**
Identify top offending sources with PRESCRIPTIVE RECOMMENDATIONS.

**Use For**: Finding worst sources, getting actionable recommendations

**Parameters**:
- top_n: Number of top offenders (default 10)
- min_alarms: Minimum unique alarms to include (default 50)
- time_period: "all", "last_30_days", "last_7_days", "last_24_hours"
- start_date/end_date: explicit ISO date strings (e.g., "2025-01-01" to "2025-01-31"). If both provided, overrides time_period

**Returns**:
- Top N sources by unique alarm count
- Chattering episodes (sliding window analysis)
- Standing alarms (>60min active)
- Repeating alarms
- Specific recommendations per source (deadband, setpoint review, root cause investigation)

**Examples**:
- "What are the worst 15 sources?" → `analyze_bad_actors(top_n=15, min_alarms=50)`
- "Bad actors in January 2025" → `analyze_bad_actors(top_n=10, min_alarms=50, start_date="2025-01-01", end_date="2025-01-31")`

**5. get_alarm_health_summary(source_filter: str)**
Comprehensive health assessment for alarm sources.

**Use For**: Health scoring, finding unhealthy sources, filtering by pattern

**Parameters**:
- source_filter: Optional SQL LIKE pattern (e.g., "TI-%", "REACTOR%", None for all)

**Returns**:
- Per-source health status (HEALTHY/MARGINAL/UNHEALTHY)
- Health score (0-100)
- Standing and stale alarm counts
- Summary statistics
- Prescriptive recommendations

**Example**: "Health status of temperature instruments" → `get_alarm_health_summary("TI-%")`

**6. analyze_flood_events(min_sources: int, time_period?: str, start_date?: str, end_date?: str, summary_by_month?: bool)**
Detect alarm floods (multiple sources simultaneously unhealthy) with root cause analysis.

**Use For**: Flood detection, plant-wide disturbances, cascade effects

**Parameters**:
- min_sources: Minimum sources for flood (default 2)
- time_period: "all", "last_30_days", "last_7_days", "last_24_hours"
- start_date/end_date: explicit ISO date strings (overrides time_period when both provided)
- summary_by_month: If true, also return monthly flood counts and top contributing sources per month

**Returns**:
- Flood periods with start/end times
- Sources involved in each flood
- Root cause analysis (localized vs plant-wide)
- Top locations affected
- Optional monthly summary when requested
- Specific recommendations

**Examples**:
- "Find floods in last 7 days" → `analyze_flood_events(min_sources=3, time_period="last_7_days")`
- "Which month had more floods and who contributed?" → `analyze_flood_events(min_sources=2, start_date="2025-01-01", end_date="2025-03-31", summary_by_month=True)`

---

### WHEN TO USE WHICH TOOL

**Use Basic Tools (1-2) when:**
- User wants raw event counts
- Simple filtering by priority/location
- Quick behavioral check
- No prescriptions needed

**Use Advanced Tools (3-6) when:**
- User asks about ISO/EEMUA compliance
- User wants recommendations or prescriptions
- User asks about "bad actors", "worst sources"
- User needs health assessment
- User asks about floods or plant-wide issues
- User wants actionable insights

**Key Differences**:
- Basic tools work on RAW EVENTS
- Advanced tools use STATE MACHINE for UNIQUE ALARM counting (Blank→ACK→OK)
- Advanced tools provide PRESCRIPTIVE recommendations
- Advanced tools are ISO/EEMUA 191 compliant

---

## ERROR RECOVERY (You have 8 iterations)

**If query returns zero rows:**
- Explain why (filters too restrictive)
- Suggest: expand date range, check Priority mappings, verify UPPERCASE
- Retry with broader filters

**If SQL syntax error:**
- Fix immediately (quote columns, fix dates, check case)
- Retry in SAME response

**If tool error (missing columns):**
- Change to `SELECT * FROM alerts WHERE ...`
- Retry immediately
- Never give up after first error!

**Multi-Iteration Flow:**
1. Tool call → Error
2. Fix query → Retry
3. Success → Format results

---

## RESPONSE FORMAT

**Fast Path (Generic):**
- 2-4 sentences, friendly tone
- Offer example queries
- No tool calls

**Data Path (Analysis):**
- Use markdown tables/bullets
- Include key numbers
- Cite data source
- Professional, concise

---

## CRITICAL RULES

✅ **Classify query FIRST** (Fast Path vs Data Path)
✅ **Fast Path**: Answer immediately, no tools
✅ **Data Path**: ALWAYS call tools, never fabricate data
✅ Quote column names with spaces
✅ Apply UPPERCASE to text filters
✅ Map Priority correctly (HIGH→H, CRITICAL→E/U)
✅ If error, fix and retry immediately

---

## DECISION TREE

```
User Query
    |
    ├─→ Generic/Greeting/Help? → FAST PATH (direct answer, <2 sec)
    │
    └─→ Needs Data Analysis? → DATA PATH
            |
            ├─→ Count/List/Trend? → execute_sql_query
            └─→ Behavior/Pattern? → analyze_alarm_behavior
```

**REMEMBER**: Generic questions = instant response. Data questions = tool calls.

AVAILABLE TOOLS:
{tools_schema}
"""


async def run_glm_agent(
        query: str,
        tools: List[Callable],
        model: str = "z-ai/glm-4.5-air:free",  # Default to GLM per user preference
        max_iterations: int = 12  # Increased to 12 with intelligent retry budget
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Runs the LLM agent, handling function calling and streaming reasoning/output.
    
    Model Options:
    - "z-ai/glm-4.5-air:free" (default)
    - "google/gemini-2.5-pro"
    """

    # Build proper JSON Schema for tools
    tools_schema = []
    for t in tools:
        params = inspect.signature(t).parameters
        properties = {}
        required = []
        
        for param_name, param in params.items():
            ann = param.annotation
            if ann == int:
                json_type = "integer"
            elif ann == float:
                json_type = "number"
            elif ann == bool:
                json_type = "boolean"
            else:
                json_type = "string"

            if param_name == "sql_query":
                param_desc = "A valid SQLite SELECT query to execute against the 'alerts' table. Must start with SELECT."
            else:
                param_desc = f"The {param_name} parameter"

            properties[param_name] = {
                "type": json_type,
                "description": param_desc
            }
            if param.default is inspect._empty:
                required.append(param_name)
        
        tools_schema.append({
            "type": "function",
            "function": {
                "name": t.__name__,
                "description": t.__doc__ or f"Execute the {t.__name__} function",
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required
                }
            }
        })

    formatted_prompt = SYSTEM_PROMPT.format(
        tools_schema=json.dumps([t['function'] for t in tools_schema], indent=2)
    )

    messages = [
        {"role": "system", "content": formatted_prompt},
        {"role": "user", "content": query}
    ]

    tool_map = {t.__name__: t for t in tools}
    iteration = 0
    # Track whether we've executed at least one tool in this session. If false, route
    # any model content to the reasoning channel to avoid showing planning text in the Answer panel.
    any_tool_used = False
    
    # Iteration budget tracking to prevent infinite loops on specific error types
    iteration_budget = {
        "sql_errors": 4,      # Max 4 SQL syntax retries
        "empty_results": 3,   # Max 3 empty result retries
        "tool_errors": 3,     # Max 3 tool execution errors
        "total_errors": 0     # Total error count
    }
    
    # Track error patterns for intelligent retry
    error_history = {
        "patterns_seen": [],
        "auto_fixes_attempted": {},
        "last_sql_query": None
    }
    
    # Track query classification for analytics
    import time
    start_time = time.time()

    async def _create_stream_with_retry():
        """Create a streaming completion with smart exponential backoff retry logic."""
        import random
        max_retries = 3
        base_delay = 1.0
        
        fallback_to_gemini = False
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
                
                # Non-retryable errors (auth, permission, invalid params)
                if any(keyword in error_str for keyword in ['authentication', 'api key', 'invalid', 'permission', 'unauthorized']):
                    print(f"❌ Non-retryable error: {e}")
                    raise
                
                # On OpenRouter rate limit and GEMINI available, switch provider
                if ('rate limit' in error_str or '429' in error_str) and GEMINI_API_KEY:
                    print("⚠️ OpenRouter rate limited. Falling back to Google Gemini provider.")
                    fallback_to_gemini = True
                    break

                # Last attempt - raise the error
                if attempt == max_retries - 1:
                    print(f"❌ Max retries ({max_retries}) reached: {e}")
                    if GEMINI_API_KEY and ('rate limit' in error_str or '429' in error_str):
                        fallback_to_gemini = True
                        break
                    else:
                        raise
                
                # Exponential backoff with jitter
                delay = base_delay * (2 ** attempt) + random.uniform(0, 0.5)
                print(f"⚠️ Retry {attempt + 1}/{max_retries} after {delay:.2f}s due to: {type(e).__name__}")
                await asyncio.sleep(delay)

        if fallback_to_gemini:
            return None  # Signal caller to invoke Gemini fallback

    while iteration < max_iterations:
        iteration += 1

        try:
            # Emit an immediate reasoning hint so the UI updates instantly
            if iteration == 1:
                yield {"type": "reasoning", "content": "Analyzing query and planning steps..."}

            response_stream = await _create_stream_with_retry()

            if response_stream is None and GEMINI_API_KEY:
                # Gemini fallback path (single or two-turn with one function call)
                try:
                    yield {"type": "reasoning", "content": "Provider fell back to Google Gemini due to rate limits. Attempting response..."}
                    # Import on-demand to avoid hard runtime dependency when not used
                    from google import genai as google_genai
                except Exception as imp_err:
                    yield {"type": "error", "message": f"Gemini fallback unavailable: {imp_err}"}
                    break

                try:
                    gemini_client = google_genai.Client(api_key=GEMINI_API_KEY)
                    # google-genai expects actual callable functions, not schema dicts
                    # Pass the tools list directly (Python callables)

                    def _oai_messages_to_gemini_contents(msgs: List[Dict[str, Any]]):
                        contents = []
                        for m in msgs:
                            role = m.get("role", "user")
                            text = m.get("content", "")
                            if role == "system":
                                # Prepend system to first user message for simplicity
                                contents.append({"role": "user", "parts": [{"text": text}]})
                            elif role in ("user", "assistant"):
                                contents.append({"role": role, "parts": [{"text": text}]})
                            elif role == "tool":
                                # Provide tool result as assistant part to give model the context
                                contents.append({"role": "assistant", "parts": [{"text": text}]})
                        return contents

                    def _extract_text(resp):
                        try:
                            return getattr(resp, 'text', None) or resp.text  # SDK convenience
                        except Exception:
                            try:
                                # Fallback parse from candidates
                                cands = getattr(resp, 'candidates', [])
                                if cands and 'content' in cands[0] and 'parts' in cands[0]['content']:
                                    for p in cands[0]['content']['parts']:
                                        if 'text' in p:
                                            return p['text']
                            except Exception:
                                return None
                        return None

                    # First turn - pass actual Python callables as tools
                    _genai_config = {}
                    if tools:
                        _genai_config["tools"] = tools  # Pass actual callable functions
                    if GEMINI_THINKING_BUDGET is not None and GEMINI_THINKING_BUDGET >= 0:
                        _genai_config["thinking"] = {"budgetTokens": GEMINI_THINKING_BUDGET}

                    resp = gemini_client.models.generate_content(
                        model=GEMINI_MODEL,
                        contents=_oai_messages_to_gemini_contents(messages),
                        config=_genai_config if _genai_config else None,
                    )

                    # Handle function call if present (single tool call support)
                    fn_calls = []
                    try:
                        parts = resp.candidates[0].content.parts  # SDK structure
                        for p in parts:
                            if hasattr(p, 'function_call') or (isinstance(p, dict) and 'functionCall' in p):
                                fc = getattr(p, 'function_call', None) or p['functionCall']
                                fn_calls.append(fc)
                    except Exception:
                        pass

                    if fn_calls:
                        fc = fn_calls[0]
                        fn_name = getattr(fc, 'name', None) or fc.get('name')
                        fn_args = getattr(fc, 'args', None) or fc.get('args') or {}
                        try:
                            args_json = json.dumps(fn_args)
                        except Exception:
                            args_json = json.dumps({})
                        yield {"type": "tool_call", "data": {"name": fn_name, "arguments": args_json}}
                        try:
                            tool_func = tool_map.get(fn_name)
                            tool_result = await asyncio.to_thread(tool_func, **(fn_args or {})) if tool_func else json.dumps({"error": f"Tool '{fn_name}' not found"})
                        except Exception as tool_err:
                            tool_result = json.dumps({"error": str(tool_err)})
                        yield {"type": "tool_result", "content": tool_result[:500] + ("..." if len(tool_result) > 500 else "")}

                        # Second turn: provide tool result
                        messages.append({
                            "role": "assistant",
                            "tool_calls": [{"id": "gemini-fc-1", "function": {"name": fn_name, "arguments": args_json}, "type": "function"}]
                        })
                        messages.append({"role": "tool", "tool_call_id": "gemini-fc-1", "content": tool_result[:5000]})

                        _genai_config2 = {}
                        if tools:
                            _genai_config2["tools"] = tools  # Pass actual callable functions
                        if GEMINI_THINKING_BUDGET is not None and GEMINI_THINKING_BUDGET >= 0:
                            _genai_config2["thinking"] = {"budgetTokens": GEMINI_THINKING_BUDGET}

                        resp2 = gemini_client.models.generate_content(
                            model=GEMINI_MODEL,
                            contents=_oai_messages_to_gemini_contents(messages),
                            config=_genai_config2 if _genai_config2 else None,
                        )
                        final_text = _extract_text(resp2) or ""
                    else:
                        final_text = _extract_text(resp) or ""

                    if final_text:
                        response_time = time.time() - start_time
                        query_path = "Data Path (Gemini)" if fn_calls else "Fast Path (Gemini)"
                        print(f"[PVCI Agent] {query_path} | Response Time: {response_time:.2f}s | Iterations: {iteration}")
                        
                        # Simulate streaming
                        yield {"type": "answer_stream", "content": final_text}
                        yield {"type": "answer_complete", "content": final_text}
                        yield {
                            "type": "complete", 
                            "data": {
                                "iterations": iteration,
                                "response_time": round(response_time, 2),
                                "query_path": query_path,
                                "provider": "gemini"
                            }
                        }
                        break
                    else:
                        yield {"type": "error", "message": "Gemini fallback returned no content."}
                        break

                except Exception as gerr:
                    yield {"type": "error", "message": f"Gemini fallback failed: {gerr}"}
                    break

            function_call_info = None
            final_answer_stream = ""
            tool_call_announced = False

            async for chunk in response_stream:
                if chunk.choices:
                    delta = chunk.choices[0].delta

                    # Stream reasoning tokens immediately
                    if hasattr(delta, "reasoning") and delta.reasoning:
                        # Emit incremental reasoning chunks for real-time UI updates
                        yield {"type": "reasoning", "content": delta.reasoning}
                        continue

                    # Handle tool call deltas; announce early once when name is known
                    if delta.tool_calls:
                        tool_call = delta.tool_calls[0]
                        if not function_call_info:
                            function_call_info = {
                                "id": tool_call.id,
                                "name": getattr(tool_call.function, "name", None),
                                "arguments": ""
                            }
                        # Announce tool call early (without waiting for arguments to complete)
                        if (
                            not tool_call_announced
                            and getattr(tool_call, "function", None) is not None
                            and getattr(tool_call.function, "name", None)
                        ):
                            yield {"type": "tool_call", "data": {"name": tool_call.function.name, "arguments": ""}}
                            tool_call_announced = True
                        if getattr(tool_call.function, "arguments", None):
                            function_call_info["arguments"] += tool_call.function.arguments
                            # Stream incremental tool argument chunks to the UI
                            yield {"type": "tool_call_update", "content": tool_call.function.arguments}
                        continue

                    # Stream answer content (reasoning has its own separate channel via delta.reasoning)
                    if delta.content:
                        final_answer_stream += delta.content
                        yield {"type": "answer_stream", "content": delta.content}
                        continue

            # We already streamed reasoning incrementally; no buffered emit here

            if function_call_info and function_call_info.get("name"):
                tool_name = function_call_info["name"]
                # Do not emit another tool_call event here to avoid duplicates in UI

                try:
                    tool_args = json.loads(function_call_info["arguments"])
                except json.JSONDecodeError:
                    yield {"type": "error", "message": f"Tool arguments JSON decode error for {tool_name}"}
                    break

                tool_func = tool_map.get(tool_name)
                if not tool_func:
                    yield {"type": "error", "message": f"Tool '{tool_name}' not found in registry"}
                    break
                
                # Offload potentially blocking tool execution to a thread to keep SSE responsive
                try:
                    # Coerce arguments to annotated types when possible
                    sig = inspect.signature(tool_func)
                    coerced = {}
                    for pname, p in sig.parameters.items():
                        if pname in tool_args:
                            v = tool_args[pname]
                            if p.annotation == int:
                                try:
                                    v = int(v)
                                except Exception:
                                    pass
                            elif p.annotation == float:
                                try:
                                    v = float(v)
                                except Exception:
                                    pass
                            elif p.annotation == bool:
                                if isinstance(v, str):
                                    lv = v.strip().lower()
                                    if lv in ("1","true","yes","y"): v = True
                                    elif lv in ("0","false","no","n"): v = False
                            coerced[pname] = v
                    tool_args.update(coerced)
                    tool_result = await asyncio.to_thread(tool_func, **tool_args)
                except Exception as tool_error:
                    error_msg = str(tool_error)
                    print(f"❌ Tool '{tool_name}' execution failed: {error_msg}")
                    
                    # Track total errors
                    iteration_budget["total_errors"] += 1
                    
                    # Match error against known patterns
                    error_pattern = match_error_pattern(error_msg)
                    
                    if error_pattern:
                        print(f"🔍 Matched error pattern: {error_pattern['pattern_name']} (severity: {error_pattern['severity']})")
                        error_history["patterns_seen"].append(error_pattern['pattern_name'])
                        
                        # Check if we should auto-fix
                        if error_pattern['auto_fix'] and tool_name == "execute_sql_query":
                            sql_query = tool_args.get("sql_query", "")
                            fix_strategy = error_pattern['fix_strategy']
                            pattern_name = error_pattern['pattern_name']
                            
                            # Track auto-fix attempts
                            if pattern_name not in error_history["auto_fixes_attempted"]:
                                error_history["auto_fixes_attempted"][pattern_name] = 0
                            
                            # Check if we've exceeded retry budget for this error type
                            if error_history["auto_fixes_attempted"][pattern_name] < error_pattern['max_retries']:
                                error_history["auto_fixes_attempted"][pattern_name] += 1
                                
                                # Attempt auto-fix
                                fixed_query = auto_fix_sql_query(
                                    sql_query, 
                                    fix_strategy, 
                                    error_history["auto_fixes_attempted"][pattern_name]
                                )
                                
                                if fixed_query != sql_query:
                                    print(f"🔧 Auto-fixing query (attempt {error_history['auto_fixes_attempted'][pattern_name]}/{error_pattern['max_retries']})")
                                    
                                    # Yield reasoning event about auto-fix
                                    yield {
                                        "type": "reasoning",
                                        "content": f"🔧 Auto-fixing {error_pattern['description']}: {error_pattern['matched_text']}\nAttempt {error_history['auto_fixes_attempted'][pattern_name]}/{error_pattern['max_retries']}"
                                    }
                                    
                                    # Try executing fixed query
                                    try:
                                        tool_result = await asyncio.to_thread(tool_func, sql_query=fixed_query)
                                        print(f"✅ Auto-fix successful!")
                                        
                                        # Success - proceed with result
                                    except Exception as retry_error:
                                        print(f"❌ Auto-fix failed: {retry_error}")
                                        # Fall through to error response below
                                        tool_result = json.dumps({
                                            "error": f"Auto-fix attempt failed: {str(retry_error)}",
                                            "original_error": error_msg,
                                            "pattern": error_pattern['pattern_name'],
                                            "fix_attempted": fix_strategy,
                                            "suggestion": f"After {error_history['auto_fixes_attempted'][pattern_name]} attempts, unable to auto-fix. {error_pattern['description']}"
                                        })
                                else:
                                    # No fix possible
                                    tool_result = json.dumps({
                                        "error": error_msg,
                                        "pattern": error_pattern['pattern_name'],
                                        "description": error_pattern['description'],
                                        "suggestion": "Manual intervention required"
                                    })
                            else:
                                # Exceeded retry budget
                                print(f"⚠️ Exceeded retry budget for {pattern_name}")
                                tool_result = json.dumps({
                                    "error": error_msg,
                                    "pattern": pattern_name,
                                    "retry_budget_exceeded": True,
                                    "attempts": error_history['auto_fixes_attempted'][pattern_name],
                                    "suggestion": f"Exceeded maximum {error_pattern['max_retries']} retries. Try a different approach."
                                })
                        
                        elif not error_pattern['auto_fix']:
                            # Fail fast for non-fixable errors
                            print(f"🛑 Non-fixable error: {pattern_name}")
                            tool_result = json.dumps({
                                "error": error_msg,
                                "pattern": pattern_name,
                                "severity": error_pattern['severity'],
                                "description": error_pattern['description'],
                                "auto_fix_available": False,
                                "suggestion": "This error cannot be automatically fixed. " + 
                                            ("Database not loaded. Please reload data." if pattern_name == "no_such_table" else "Manual intervention required.")
                            })
                            # For critical errors, break the loop
                            if error_pattern['severity'] == "critical":
                                yield {
                                    "type": "error",
                                    "message": f"Critical error: {error_pattern['description']}",
                                    "details": tool_result
                                }
                                break
                        else:
                            # Auto-fix not applicable for this tool
                            tool_result = json.dumps({
                                "error": error_msg,
                                "pattern": pattern_name,
                                "tool": tool_name,
                                "suggestion": error_pattern['description']
                            })
                    else:
                        # Unknown error pattern - generic handling
                        tool_result = json.dumps({
                            "error": f"Tool execution failed: {error_msg}",
                            "tool": tool_name,
                            "type": type(tool_error).__name__,
                            "suggestion": "Try simplifying the query. Common issues: unquoted column names with spaces, incorrect date formats, or case-sensitive filters (use UPPER())."
                        })

                print("\n\n[DEBUG] TOOL RESULT RAW OUTPUT:\n", tool_result[:500], "\n")

                yield {
                    "type": "tool_result",
                    "content": tool_result[:500] + "..." if len(tool_result) > 500 else tool_result
                }

                # Let the LLM see the tool result and decide next steps
                # Don't short-circuit on errors - the enhanced system prompt guides retry strategy

                # Mark that we have successfully executed at least one tool during this session
                any_tool_used = True

                messages.append({
                    "role": "assistant",
                    "tool_calls": [{
                        "id": function_call_info["id"],
                        "function": {
                            "name": tool_name,
                            "arguments": function_call_info["arguments"]
                        },
                        "type": "function"
                    }]
                })

                messages.append({
                    "role": "tool",
                    "tool_call_id": function_call_info["id"],
                    "content": tool_result[:5000]
                })

                continue

            # Only break if we have a complete answer (text content after tool execution)
            if final_answer_stream:
                response_time = time.time() - start_time
                query_path = "Data Path" if any_tool_used else "Fast Path"
                print(f"[PVCI Agent] {query_path} | Response Time: {response_time:.2f}s | Iterations: {iteration} | Tools Used: {any_tool_used}")
                
                yield {"type": "answer_complete", "content": final_answer_stream.strip()}
                yield {
                    "type": "complete", 
                    "data": {
                        "iterations": iteration,
                        "response_time": round(response_time, 2),
                        "query_path": query_path,
                        "tools_used": any_tool_used
                    }
                }
                break

            # If no tool was called AND no content was generated, that's an error
            # But if a tool was just called (continue above), we'll loop to next iteration
            if not final_answer_stream and not function_call_info:
                yield {"type": "error", "message": "Model did not provide a response or a tool call."}
                break
            
            # If we only have reasoning or tool calls, continue to next iteration
            # The model needs another turn to process tool results

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
                "message": f"Tool returned invalid JSON: {str(e)}. This may be a backend processing issue.",
                "iteration": iteration,
                "error_type": "json_decode"
            }
            break
        except Exception as e:
            # Log full traceback for debugging
            import traceback
            print(f"\n❌ AGENT ERROR at iteration {iteration}:")
            print(traceback.format_exc())
            
            # Provide user-friendly error message based on error type
            error_msg = str(e)
            error_lower = error_msg.lower()
            
            if "openrouter" in error_lower or "api" in error_lower:
                user_message = "AI service error. Please try again in a moment."
                error_type = "api_error"
            elif "database" in error_lower or "sql" in error_lower:
                user_message = "Database query error. Try rephrasing your question or using simpler filters."
                error_type = "database_error"
            elif "timeout" in error_lower:
                user_message = "Request timeout. Try a simpler query or narrower date range."
                error_type = "timeout"
            else:
                user_message = f"Unexpected error: {error_msg[:200]}"
                error_type = "general"
            
            yield {
                "type": "error",
                "message": user_message,
                "iteration": iteration,
                "error_type": error_type,
                "debug": error_msg  # Full error for debugging (can be hidden in production UI)
            }
            break

    if iteration >= max_iterations:
        yield {"type": "error", "message": "Max iterations reached without final answer"}
