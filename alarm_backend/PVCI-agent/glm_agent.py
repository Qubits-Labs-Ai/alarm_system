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
load_dotenv(override=True)  # Ensure latest .env overrides any existing env vars
CLIENT_API_KEY = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
try:
    GEMINI_THINKING_BUDGET = int(os.getenv("GEMINI_THINKING_BUDGET", "-1"))
except Exception:
    GEMINI_THINKING_BUDGET = -1

if not CLIENT_API_KEY:
    raise ValueError("❌ API key missing! Please set OPENROUTER_API_KEY or OPENAI_API_KEY in your .env file.")

# --- Initialize client ---
# Masked log to verify which key is loaded (without exposing the secret)
try:
    _key_preview = f"{CLIENT_API_KEY[:6]}...{CLIENT_API_KEY[-4:]}"
    print(f"[PVCI Agent] Using OPENROUTER_API_KEY: {_key_preview} | Base URL: https://openrouter.ai/api/v1")
except Exception:
    pass

client = AsyncOpenAI(
    api_key=CLIENT_API_KEY,
    base_url="https://openrouter.ai/api/v1"
)

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

---

## AVAILABLE TOOLS

### 1. execute_sql_query(sql_query: str)
Executes SELECT queries, returns JSON results (max 10 rows).

**Use For**: Counts, lists, aggregations, trends

**Query Guidelines:**
- Only SELECT allowed (no INSERT/UPDATE/DELETE)
- Use LIMIT to avoid large results
- Quote column names with spaces: "Event Time"
- Use UPPER() for text comparisons
- Date functions: datetime(), DATE(), strftime()

**Example Queries:**
```sql
-- Top 10 sources by count
SELECT Source, COUNT(*) as cnt FROM alerts GROUP BY Source ORDER BY cnt DESC LIMIT 10;

-- High priority in last 24h
SELECT "Event Time", Source, Description FROM alerts 
WHERE Priority IN ('H', 'HIGH') AND datetime("Event Time") >= datetime('now', '-1 day')
ORDER BY "Event Time" DESC LIMIT 10;

-- Location distribution
SELECT "Location Tag", COUNT(*) as cnt FROM alerts 
GROUP BY "Location Tag" ORDER BY cnt DESC LIMIT 10;
```

### 2. analyze_alarm_behavior(sql_query: str)
Runs advanced analysis (chattering, stale, floods, bad actors) on query results.

**Use For**: Behavioral patterns, alarm health, ISA-18.2 compliance

**CRITICAL REQUIREMENTS:**
- SQL MUST return: "Event Time", "Source", "Action", "Condition"
- Best practice: Use `SELECT * FROM alerts WHERE ...`
- Cover meaningful time range (hours/days, not seconds)
- Example: `SELECT * FROM alerts WHERE Priority IN ('H', 'HIGH') LIMIT 1000`

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
        max_iterations: int = 8  # Increased to allow multiple retries on errors
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Runs the LLM agent, handling function calling and streaming reasoning/output.
    
    Model Options:
    - "z-ai/glm-4.5-air:free" (default)
    - "google/gemini-2.0-flash-exp:free"
    - "anthropic/claude-3.5-sonnet" (requires credits)
    """

    # Build proper JSON Schema for tools
    tools_schema = []
    for t in tools:
        params = inspect.signature(t).parameters
        properties = {}
        required = []
        
        for param_name, param in params.items():
            # Build JSON Schema for each parameter
            param_type = "string"  # Default to string (covers sql_query)
            
            # Provide clear descriptions for known parameters
            if param_name == "sql_query":
                param_desc = "A valid SQLite SELECT query to execute against the 'alerts' table. Must start with SELECT."
            else:
                param_desc = f"The {param_name} parameter"
            
            properties[param_name] = {
                "type": param_type,
                "description": param_desc
            }
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
                    tool_result = await asyncio.to_thread(tool_func, **tool_args)
                except Exception as tool_error:
                    print(f"❌ Tool '{tool_name}' execution failed: {tool_error}")
                    # Provide error context to LLM for potential retry
                    import traceback
                    tool_result = json.dumps({
                        "error": f"Tool execution failed: {str(tool_error)}",
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
