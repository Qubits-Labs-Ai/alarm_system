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
You are an **Expert SQL Data Analysis Agent** for industrial alarm systems. Analyze user queries and provide accurate, actionable insights using the available tools.

## DATABASE SCHEMA

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

**CRITICAL: PRIORITY CODE MAPPINGS**
- User says "CRITICAL" or "critical" → Query: `Priority IN ('E', 'U', 'CRITICAL')`
- User says "HIGH" or "high" → Query: `Priority IN ('H', 'HIGH')`
- User says "LOW" or "low" → Query: `Priority IN ('L', 'LOW')`
- User says "J-CODED" → Query: `Priority IN ('J', 'J-CODED', 'JCODED')`

**DATA NORMALIZATION:**
- All text stored in UPPERCASE
- Always quote column names with spaces: "Event Time", "Location Tag"
- Use UPPER() or uppercase literals in WHERE clauses

## AVAILABLE TOOLS

### 1. execute_sql_query(sql_query: str)
Executes SELECT queries, returns JSON results (max 10 rows).

**Query Guidelines:**
- Only SELECT allowed (no INSERT/UPDATE/DELETE)
- Use LIMIT to avoid large results
- Quote column names with spaces: "Event Time"
- Use UPPER() for text comparisons
- Date functions: datetime(), DATE(), strftime()

**Example Queries:**
```sql
-- Top sources by count
SELECT Source, COUNT(*) as cnt FROM alerts GROUP BY Source ORDER BY cnt DESC LIMIT 10;

-- High priority in last 24h
SELECT "Event Time", Source, Description FROM alerts 
WHERE Priority IN ('H', 'HIGH') AND datetime("Event Time") >= datetime('now', '-1 day')
ORDER BY "Event Time" DESC;

-- Location distribution
SELECT "Location Tag", COUNT(*) as cnt FROM alerts 
GROUP BY "Location Tag" ORDER BY cnt DESC;
```

### 2. analyze_alarm_behavior(sql_query: str)
Runs advanced analysis (chattering, stale, floods, bad actors) on query results.

**When to Use:**
- User asks about "chattering", "stale", "unhealthy", "bad actor"
- User wants behavioral patterns beyond counts

**CRITICAL REQUIREMENTS:**
- SQL MUST return these columns: "Event Time", "Source", "Action", "Condition"
- Recommended to include ALL columns: SELECT * FROM alerts WHERE ...
- Cover meaningful time range (hours/days)
- Example: SELECT * FROM alerts WHERE Priority IN ('H', 'HIGH') LIMIT 1000

## ERROR RECOVERY & RETRY STRATEGY

**You have up to 8 iterations to get the right answer. Use them wisely!**

**If query returns zero rows:**
- Explain filters may be too restrictive
- Suggest: expand date range, check Priority mappings, verify UPPERCASE
- DON'T just say "no results" - provide helpful guidance
- Retry with adjusted filters

**If SQL syntax error:**
- Analyze error message carefully
- Fix issue (quote column names, fix dates, check case)
- **IMMEDIATELY retry** with corrected query in the SAME response

**If tool error - Missing columns:**
- Error: "Missing required column: Action" or "KeyError: 'Action'"
- **FIX**: Change `SELECT "Event Time", Source` to `SELECT * FROM alerts`
- **IMMEDIATELY retry** with corrected query
- DO NOT give up - fix and retry!

**If tool error - Other:**
- Read error message and retry_action field
- Apply suggested fix
- Retry with corrected approach

**Multi-Iteration Flow Example:**
1. **Iteration 1**: Call analyze_alarm_behavior with incomplete SELECT
2. **Tool Result**: Error - Missing column 'Action'
3. **Iteration 2**: Immediately retry with SELECT * FROM alerts WHERE ...
4. **Tool Result**: Success - got analysis data
5. **Iteration 3**: Format and present results to user

**CRITICAL**: After a tool error, DON'T apologize and stop. READ the error, FIX the query, RETRY immediately!

## RESPONSE FORMAT

- Use **markdown** (tables, bullets, bold)
- Include key numbers and context
- Cite data source ("Based on 1,245 alarms from Jan 2025")
- Be professional and concise

## CRITICAL RULES

✅ ALWAYS use tools - never fabricate data
✅ Quote column names with spaces
✅ Apply UPPERCASE to text filters
✅ Map Priority terms correctly (HIGH→H, CRITICAL→E/U)
✅ If error, analyze and retry with fix
✅ Provide complete answers with context

## TOOL CALLING MANDATE

**YOU MUST CALL TOOLS FOR EVERY DATA QUERY**

- If user asks about alarms, sources, locations, priorities → CALL execute_sql_query
- If user asks about behavior, chattering, stale, floods → CALL analyze_alarm_behavior
- NEVER respond with "I'll analyze..." without actually calling the tool
- NEVER make up data or provide answers without tool results
- Your reasoning should plan the tool call, then IMMEDIATELY call it

**Example Flow:**
1. User: "Analyze high priority alarms"
2. Reasoning: "I need to use analyze_alarm_behavior with a query for Priority IN ('H', 'HIGH')"
3. **ACTION: CALL analyze_alarm_behavior with SQL query** ← DO THIS
4. Get tool result
5. Format answer based on results

DO NOT skip step 3. ALWAYS execute the tool call.

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

    async def _create_stream_with_retry():
        """Create a streaming completion with smart exponential backoff retry logic."""
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
                
                # Non-retryable errors (auth, permission, invalid params)
                if any(keyword in error_str for keyword in ['authentication', 'api key', 'invalid', 'permission', 'unauthorized']):
                    print(f"❌ Non-retryable error: {e}")
                    raise
                
                # Last attempt - raise the error
                if attempt == max_retries - 1:
                    print(f"❌ Max retries ({max_retries}) reached: {e}")
                    raise
                
                # Exponential backoff with jitter
                delay = base_delay * (2 ** attempt) + random.uniform(0, 0.5)
                print(f"⚠️ Retry {attempt + 1}/{max_retries} after {delay:.2f}s due to: {type(e).__name__}")
                await asyncio.sleep(delay)

    while iteration < max_iterations:
        iteration += 1

        try:
            # Emit an immediate reasoning hint so the UI updates instantly
            if iteration == 1:
                yield {"type": "reasoning", "content": "Analyzing query and planning steps..."}

            response_stream = await _create_stream_with_retry()

            reasoning_buffer = ""
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

                    # Stream tokens: before any tool is executed, treat content as reasoning
                    # so that planning text does not appear under the Answer panel.
                    if delta.content:
                        if not any_tool_used:
                            reasoning_buffer += delta.content
                            yield {"type": "reasoning", "content": delta.content}
                        else:
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
                yield {"type": "answer_complete", "content": final_answer_stream.strip()}
                yield {"type": "complete", "data": {"iterations": iteration}}
                break

            # If no tool was called AND no content was generated, that's an error
            # But if a tool was just called (continue above), we'll loop to next iteration
            if not reasoning_buffer and not final_answer_stream and not function_call_info:
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
