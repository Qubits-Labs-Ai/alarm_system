import os
import asyncio
import json
import inspect
import re
from collections import Counter
from typing import AsyncGenerator, Dict, Any, List, Callable, Optional
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

# --- Tool schema builder (adds enums/ranges/descriptions) ---
def build_tool_schema(func: Callable) -> Dict[str, Any]:
    params = inspect.signature(func).parameters
    properties: Dict[str, Any] = {}
    required: List[str] = []

    def _base_type(ann) -> str:
        if ann == int:
            return "integer"
        if ann == float:
            return "number"
        if ann == bool:
            return "boolean"
        return "string"

    def _desc(name: str) -> str:
        mapping = {
            "sql_query": "A valid SQLite SELECT query for the 'alerts' table (must start with SELECT).",
            "time_period": "One of: all, last_30_days, last_7_days, last_24_hours.",
            "period": "One of: all, last_30_days, last_7_days, last_24_hours.",
            "top_n": "Number of top items to return (1-100).",
            "min_alarms": "Minimum unique alarms to qualify (>=1).",
            "min_events": "Minimum raw events to qualify (>=1).",
            "min_sources": "Minimum sources for a flood (>=2).",
            "time_window_minutes": "Window size in minutes (1-120).",
            "window_minutes": "Sliding window size in minutes (1-120).",
            "summary_by_month": "If true, return monthly summary as well.",
            "plant_id": "Plant identifier (e.g., PVCI).",
            "force_db": "If true, compute from live DB instead of cache.",
            "validate": "If true, validate cache parity against DB KPIs.",
            "term": "Nomenclature term to look up (e.g., HI, ACK, FLOOD).",
            "start_date": "Start date (YYYY-MM-DD).",
            "end_date": "End date (YYYY-MM-DD).",
        }
        return mapping.get(name, f"The {name} parameter")

    def _constrain(name: str, schema: Dict[str, Any]):
        # Enums
        if name in ("time_period", "period"):
            schema["enum"] = ["all", "last_30_days", "last_7_days", "last_24_hours"]
        # Ranges
        if name == "top_n":
            schema["minimum"] = 1
            schema["maximum"] = 100
        if name in ("min_alarms", "min_events"):
            schema["minimum"] = 1
        if name == "min_sources":
            schema["minimum"] = 2
            schema["maximum"] = 100
        if name in ("time_window_minutes", "window_minutes"):
            schema["minimum"] = 1
            schema["maximum"] = 120
        if name in ("start_date", "end_date") and schema.get("type") == "string":
            schema["pattern"] = r"^\\d{4}-\\d{2}-\\d{2}$"

    for param_name, param in params.items():
        json_type = _base_type(param.annotation)
        prop: Dict[str, Any] = {"type": json_type, "description": _desc(param_name)}
        _constrain(param_name, prop)
        properties[param_name] = prop
        if param.default is inspect._empty:
            required.append(param_name)

    return {
        "type": "function",
        "function": {
            "name": func.__name__,
            "description": func.__doc__ or f"Execute the {func.__name__} function",
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required
            }
        }
    }

# --- Intent → SQL Template Mapping ---

_TIME_PERIOD_MAP = {
    "last_30_days": [r"last\s*30\s*days", r"month"],
    "last_7_days": [r"last\s*7\s*days", r"week"],
    "last_24_hours": [r"last\s*24\s*hours", r"today", r"last\s*day"],
}

_PRIORITY_GROUPS = {
    "critical": ["E", "U", "CRITICAL"],
    "high": ["H", "HIGH"],
    "low": ["L", "LOW"],
    "j": ["J", "J-CODED", "JCODED", "JOURNAL"],
}

def _extract_time_period(q: str) -> str:
    ql = q.lower()
    for key, pats in _TIME_PERIOD_MAP.items():
        for p in pats:
            if re.search(p, ql):
                return key
    return "all"

def _extract_top_n(q: str, default: int = 10) -> int:
    m = re.search(r"top\s*(\d{1,3})", q, flags=re.IGNORECASE)
    if m:
        try:
            n = int(m.group(1))
            if n < 1:
                return default
            return n if n <= 100 else 100
        except Exception:
            return default
    return default

def _extract_min_sources(q: str, default: int = 2) -> int:
    m = re.search(r"(min(?:imum)?\s*sources?|sources?)\D*(\d{1,3})", q, flags=re.IGNORECASE)
    if m:
        try:
            v = int(m.group(2))
            return v if v >= 2 else 2
        except Exception:
            return default
    return default

def _detect_raw(q: str) -> bool:
    return bool(re.search(r"\braw\b|event-?based|events?\b", q, flags=re.IGNORECASE))

def _detect_cached(q: str) -> bool:
    return bool(re.search(r"\bcache|kpi|summary|overall health\b", q, flags=re.IGNORECASE))

def _extract_source_like(q: str) -> str | None:
    m = re.search(r"\b([A-Z]{1,4})[- ]?%?\b", q)
    if m:
        tag = m.group(1).upper()
        if tag in {"TI","TT","TIC","PI","PT","PIC","FI","FIT","FIC","LI","LT","LIC","BV","XV","FCV","RTD","SV"}:
            return f"{tag}-%"
    return None

def _extract_priority_group(q: str) -> List[str] | None:
    ql = q.lower()
    if "critical" in ql:
        return _PRIORITY_GROUPS["critical"]
    if "high" in ql:
        return _PRIORITY_GROUPS["high"]
    if re.search(r"\blow\b", ql):
        return _PRIORITY_GROUPS["low"]
    if "j" in ql or "journal" in ql:
        return _PRIORITY_GROUPS["j"]
    return None

def classify_intent(query: str) -> Dict[str, Any] | None:
    q = query.strip()
    ql = q.lower()

    time_period = _extract_time_period(q)
    top_n = _extract_top_n(q, default=10)
    min_sources = _extract_min_sources(q, default=2)
    source_like = _extract_source_like(q)
    priority_group = _extract_priority_group(q)
    want_raw = _detect_raw(q)

    if re.search(r"(isa|eemua).*(compliance|288|720)", ql):
        _eng = os.getenv("PVCI_AGENT_ENGINEERING_TOOLS", "").strip().lower() in ("1","true","yes","y")
        if want_raw and _eng:
            return {"type": "tool", "name": "get_isa_compliance_raw", "args": {"time_period": time_period}}
        return {"type": "tool", "name": "get_isa_compliance_report", "args": {"time_period": time_period}}

    if re.search(r"(bad actors|worst sources|top offenders)", ql):
        _eng = os.getenv("PVCI_AGENT_ENGINEERING_TOOLS", "").strip().lower() in ("1","true","yes","y")
        if want_raw and _eng:
            return {"type": "tool", "name": "get_bad_actors_raw", "args": {"top_n": top_n, "time_period": time_period, "min_events": 100}}
        return {"type": "tool", "name": "analyze_bad_actors", "args": {"top_n": top_n, "min_alarms": 50, "time_period": time_period}}

    if re.search(r"(flood|disturbance|plant-?wide)", ql):
        _eng = os.getenv("PVCI_AGENT_ENGINEERING_TOOLS", "").strip().lower() in ("1","true","yes","y")
        if want_raw and _eng:
            return {"type": "tool", "name": "analyze_flood_events_raw", "args": {"min_sources": min_sources, "time_period": time_period, "time_window_minutes": 10}}
        return {"type": "tool", "name": "analyze_flood_events", "args": {"min_sources": min_sources, "time_period": time_period, "summary_by_month": bool(re.search(r"month", ql))}}

    # Direct behavior keywords → activation-first path with bounded period
    if re.search(r"(chatter|chattering|standing|stale)", ql):
        tp_used = time_period if time_period != "all" else "last_7_days"
        _eng = os.getenv("PVCI_AGENT_ENGINEERING_TOOLS", "").strip().lower() in ("1","true","yes","y")
        if want_raw and _eng:
            return {"type": "tool", "name": "get_bad_actors_raw", "args": {"top_n": top_n, "time_period": tp_used, "min_events": 100}}
        return {"type": "tool", "name": "analyze_bad_actors", "args": {"top_n": top_n, "min_alarms": 50, "time_period": tp_used}}

    # Option A (refined): For 'unhealthy' questions, prefer activation-based bad-actors with a bounded period
    if re.search(r"\bunhealthy\b", ql):
        # Default to last_7_days (tighter, faster) when user didn't specify
        tp_used = time_period if time_period != "all" else "last_7_days"
        if want_raw:
            return {"type": "tool", "name": "get_bad_actors_raw", "args": {"top_n": top_n, "time_period": tp_used, "min_events": 100}}
        return {"type": "tool", "name": "analyze_bad_actors", "args": {"top_n": top_n, "min_alarms": 50, "time_period": tp_used}}

    # Keep explicit health summary/status queries mapped to detailed health summary
    if re.search(r"(health status|health summary|marginal)", ql):
        return {"type": "tool", "name": "get_alarm_health_summary", "args": {"source_filter": source_like}}

    if _detect_cached(q):
        if re.search(r"frequency|288|720|kpi|compliance", ql):
            return {"type": "tool", "name": "get_frequency_summary_cached", "args": {}}
        if re.search(r"unhealthy|bad actors", ql):
            return {"type": "tool", "name": "get_unhealthy_summary_cached", "args": {}}
        if re.search(r"flood", ql):
            return {"type": "tool", "name": "get_floods_summary_cached", "args": {}}
        if re.search(r"overall health|cache", ql):
            return {"type": "tool", "name": "read_overall_health_cache", "args": {}}

    if re.search(r"top\s*\d+\s*sources|top sources|worst sources", ql):
        # Default to a bounded period to prevent long-running full-history scans
        tp_used = time_period if time_period != "all" else "last_30_days"
        if want_raw:
            return {"type": "tool", "name": "get_bad_actors_raw", "args": {"top_n": top_n, "time_period": tp_used, "min_events": 100}}
        return {"type": "tool", "name": "analyze_bad_actors", "args": {"top_n": top_n, "min_alarms": 50, "time_period": tp_used}}

    # Location ranking (e.g., "most active locations", "top locations") → template SQL
    if re.search(r"(most\s+active\s+locations?|top\s*\d*\s*locations?|top\s+locations?|locations?\s+by\s+(count|activity))", ql):
        return {"type": "template", "template": "TOP_N_LOCATIONS", "time_period": time_period, "top_n": top_n}

    if re.search(r"priority\s+(breakdown|distribution)", ql):
        return {"type": "template", "template": "PRIORITY_DISTRIB", "time_period": time_period, "source_like": source_like}

    if re.search(r"hourly|by hour", ql):
        return {"type": "template", "template": "HOURLY_SERIES", "time_period": time_period, "source_like": source_like}

    if re.search(r"daily|by day", ql):
        return {"type": "template", "template": "DAILY_SERIES", "time_period": time_period, "source_like": source_like}

    if re.search(r"monthly|by month", ql):
        return {"type": "template", "template": "MONTHLY_SERIES", "time_period": time_period, "source_like": source_like}

    return None


# --- Chart Intent Detection ---

def detect_chart_intent(query: str, tool_result: Dict[str, Any] = None) -> Dict[str, Any] | None:
    """
    Detect if query should generate an inline chart.
    
    Returns:
        {
            "should_chart": bool,
            "chart_type": "line" | "bar" | "pie" | "scatter" | "area",
            "confidence": 0.0-1.0,
            "reason": str
        }
    """
    ql = query.lower()
    
    # Explicit chart requests (high confidence)
    if any(kw in ql for kw in ["chart", "graph", "plot", "visualize", "show me a"]):
        chart_type = detect_specific_chart_type(query)
        return {
            "should_chart": True,
            "chart_type": chart_type,
            "confidence": 0.9,
            "reason": "explicit_request"
        }
    
    # Implicit chart opportunities based on query patterns
    
    # Trend/time series analysis
    if any(kw in ql for kw in ["trend", "over time", "history", "timeline", "daily", "hourly", "monthly"]):
        return {
            "should_chart": True,
            "chart_type": "line",
            "confidence": 0.8,
            "reason": "trend_analysis"
        }
    
    # Rankings and comparisons
    if any(kw in ql for kw in ["top", "most", "worst", "best", "ranking", "compare", "comparison"]):
        return {
            "should_chart": True,
            "chart_type": "bar",
            "confidence": 0.75,
            "reason": "comparison"
        }
    
    # Distributions and breakdowns
    if any(kw in ql for kw in ["distribution", "breakdown", "percentage", "proportion", "share"]):
        # Pie for smaller datasets, bar for larger
        return {
            "should_chart": True,
            "chart_type": "pie",  # Will auto-adjust based on data size
            "confidence": 0.7,
            "reason": "distribution"
        }
    
    # Correlation analysis
    if any(kw in ql for kw in ["correlation", "relationship", "vs", "versus", "against"]):
        return {
            "should_chart": True,
            "chart_type": "scatter",
            "confidence": 0.65,
            "reason": "correlation"
        }
    
    # Analyze tool result if provided
    if tool_result:
        result_intent = analyze_tool_result_chartability(tool_result)
        if result_intent:
            return result_intent
    
    return None


def detect_specific_chart_type(query: str) -> str:
    """Detect specific chart type from explicit user request."""
    ql = query.lower()
    
    if any(kw in ql for kw in ["line", "trend", "over time", "time series"]):
        return "line"
    
    if any(kw in ql for kw in ["bar", "column", "ranking", "top"]):
        return "bar"
    
    if any(kw in ql for kw in ["pie", "donut", "distribution"]):
        return "pie"
    
    if any(kw in ql for kw in ["scatter", "correlation", "relationship"]):
        return "scatter"
    
    if any(kw in ql for kw in ["area", "stacked", "cumulative"]):
        return "area"
    
    # Default to bar for generic requests
    return "bar"


def analyze_tool_result_chartability(tool_result: Dict[str, Any]) -> Dict[str, Any] | None:
    """Analyze if tool result contains chartable data."""
    try:
        # Accept common payload shapes from different tools
        data = (
            tool_result.get("data")
            or tool_result.get("bad_actors")
            or tool_result.get("top_offenders")
            or []
        )
        
        if not data or not isinstance(data, list) or len(data) < 2:
            return None
        
        first_row = data[0]
        if not isinstance(first_row, dict):
            return None
        
        keys = list(first_row.keys())
        
        # Has time series data
        has_time = any(
            any(t in str(k).lower() for t in ["time", "date", "timestamp", "bin", "window", "period", "day", "hour", "month"])
            for k in keys
        )
        
        if has_time:
            return {
                "should_chart": True,
                "chart_type": "line",
                "confidence": 0.7,
                "reason": "timeseries_data"
            }
        
        # Has categorical + numeric data (good for bar/pie)
        has_category = any(
            any(t in str(k).lower() for t in ["source", "location", "name", "priority", "condition"])
            for k in keys
        )
        
        has_count = any(
            any(t in str(k).lower() for t in ["count", "total", "sum", "hits", "alarms", "events"])
            for k in keys
        )
        
        if has_category and has_count:
            # Pie for smaller datasets (<=10), bar for larger
            chart_type = "pie" if len(data) <= 10 else "bar"
            return {
                "should_chart": True,
                "chart_type": chart_type,
                "confidence": 0.7,
                "reason": "aggregated_data"
            }
        
        # Multiple numeric columns (potential correlation)
        numeric_count = sum(1 for k in keys if isinstance(first_row.get(k), (int, float)))
        
        if numeric_count >= 2:
            return {
                "should_chart": True,
                "chart_type": "scatter",
                "confidence": 0.6,
                "reason": "numeric_data"
            }
        
        return None
        
    except Exception as e:
        print(f"[Chart Detection Error] {e}")
        return None


_TEMPLATES = {
    "TOP_N_SOURCES": 'SELECT Source, COUNT(*) AS cnt FROM alerts {WHERE} GROUP BY Source ORDER BY cnt DESC LIMIT {limit}',
    "TOP_N_LOCATIONS": 'SELECT "Location Tag" AS location, COUNT(*) AS cnt FROM alerts {WHERE} GROUP BY "Location Tag" ORDER BY cnt DESC LIMIT {limit}',
    "PRIORITY_DISTRIB": 'SELECT Priority, COUNT(*) AS cnt FROM alerts {WHERE} GROUP BY Priority ORDER BY cnt DESC',
    "HOURLY_SERIES": 'SELECT strftime(\'%H\', "Event Time") AS hour, COUNT(*) AS cnt FROM alerts {WHERE} GROUP BY hour ORDER BY hour',
    "DAILY_SERIES": 'SELECT date("Event Time") AS day, COUNT(*) AS cnt FROM alerts {WHERE} GROUP BY day ORDER BY day',
    "MONTHLY_SERIES": 'SELECT strftime(\'%Y-%m\', "Event Time") AS month, COUNT(*) AS cnt FROM alerts {WHERE} GROUP BY month ORDER BY month',
}

def _time_clause(tp: str) -> str | None:
    if tp == "last_30_days":
        return 'datetime("Event Time") >= datetime((SELECT MAX("Event Time") FROM alerts), "-30 days")'
    if tp == "last_7_days":
        return 'datetime("Event Time") >= datetime((SELECT MAX("Event Time") FROM alerts), "-7 days")'
    if tp == "last_24_hours":
        return 'datetime("Event Time") >= datetime((SELECT MAX("Event Time") FROM alerts), "-1 day")'
    return None

def _build_where(intent: Dict[str, Any]) -> str:
    clauses = []
    tc = _time_clause(intent.get("time_period") or "all")
    if tc:
        clauses.append(tc)
    sl = intent.get("source_like")
    if sl:
        clauses.append(f"Source LIKE '{sl}'")
    pg = intent.get("priority_group")
    if pg:
        vals = ",".join([f"'{v}'" for v in pg])
        clauses.append(f"Priority IN ({vals})")
    return (" WHERE " + " AND ".join(clauses)) if clauses else ""

def build_sql_from_template(intent: Dict[str, Any]) -> str:
    base = _TEMPLATES[intent["template"]]
    where_sql = _build_where(intent)
    limit = intent.get("top_n", 10)
    return base.format(WHERE=where_sql, limit=limit)

def _summarize_tool_output(tool_name: str, args: Dict[str, Any], result: str) -> str:
    try:
        data = json.loads(result)
    except Exception:
        return (result or "").strip()
    # Generic timeout handling
    if isinstance(data, dict) and data.get("status") == "timeout":
        msg = data.get("message") or "Operation timed out."
        sugg = data.get("suggestions") or []
        sugg_txt = "; ".join(sugg[:3]) if sugg else "Specify a shorter period (e.g., last_7_days) or use a cached/raw tool."
        return f"{msg}\nSuggestions: {sugg_txt}"
    if not isinstance(data, dict):
        try:
            if isinstance(data, list):
                n = len(data)
                return f"Found {n} rows. Showing JSON array."
        except Exception:
            pass
        return (result or "").strip()
    name = (tool_name or "").strip()
    if name == "analyze_flood_events":
        fc = int(data.get("flood_count") or 0)
        floods = data.get("floods") or []
        time_period = ((data.get("filters") or {}).get("time_period") or args.get("time_period") or "all")
        src_counter: Counter[str] = Counter()
        loc_counter: Counter[str] = Counter()
        for f in floods[:5000]:
            try:
                for s in (f.get("Sources_Involved") or []):
                    src_counter[str(s)] += 1
                for lk, lv in (f.get("Top_Locations") or {}).items():
                    try:
                        loc_counter[str(lk)] += int(lv)
                    except Exception:
                        pass
            except Exception:
                pass
        top_sources = ", ".join([f"{s} ({c})" for s, c in src_counter.most_common(5)]) or "N/A"
        top_locs = ", ".join([f"{k} ({v})" for k, v in loc_counter.most_common(5)]) or "N/A"
        first3 = []
        for f in floods[:3]:
            try:
                fs = f.get("Flood_Start")
                fe = f.get("Flood_End")
                sc = f.get("Source_Count")
                first3.append(f"{fs} → {fe} ({sc} sources)")
            except Exception:
                pass
        windows_preview = "; ".join(first3) or "N/A"
        ms = int(args.get("min_sources") or 2)
        return (
            f"Detected {fc} flood window(s) (min_sources={ms}, period={time_period}).\n"
            f"Top contributors: {top_sources}.\n"
            f"Top locations: {top_locs}.\n"
            f"Sample windows: {windows_preview}.\n"
            f"Tip: Ask 'Show raw events for <start> to <end>' to drill into a specific window."
        )
    if name == "analyze_bad_actors":
        offenders = data.get("top_offenders") or data.get("bad_actors") or []
        tn = int(args.get("top_n") or 10)
        tp = args.get("time_period") or ((data.get("filters") or {}).get("time_period") or "all")
        # Build detailed preview list
        lines = []
        for r in offenders[:min(tn, 10)]:
            if not isinstance(r, dict):
                lines.append(f"- **[source]** {str(r)}")
                continue
            src = str(r.get("Source"))
            ua = r.get("Unique_Alarms")
            chat = r.get("Chattering_Episodes")
            stand = r.get("Standing_Alarms")
            rep = r.get("Repeating_Alarms")
            issues = r.get("Primary_Issues")
            lines.append(
                f"- **[source]** {src} — unique={ua}, chattering={chat}, standing={stand}, repeating={rep} | issues: {issues}"
            )
        # Aggregate recommendations
        recs = []
        for r in offenders:
            if isinstance(r, dict) and r.get("Recommendations"):
                recs.extend([s.strip() for s in str(r.get("Recommendations")).split("|") if s.strip()])
        recs = list(dict.fromkeys(recs))[:6]
        rec_bullets = "\n".join([f"- **[action]** {x}" for x in recs]) if recs else "- **[action]** Review necessity, add deadband/delay, validate setpoints/priorities"
        body = []
        body.append(f"## Findings\n- **[scope]** Bad Actors (activation-based), period={tp}, Top {min(tn, len(offenders))}\n" + ("\n".join(lines) or "- **[note]** No offenders found"))
        body.append("## Key Observations\n- **[method]** Activation-based (unique alarms), aligned with ISA/EEMUA\n- **[impact]** Focus remediation on highest unique-activation sources first")
        body.append("## Recommendations\n" + rec_bullets)
        body.append("## Next Actions\n- **[tool]** get_isa_compliance_report('last_30_days')\n- **[tool]** analyze_flood_events(min_sources=3)\n- **[tool]** get_unhealthy_summary_cached()")
        return "\n\n".join(body)
    if name == "get_bad_actors_raw":
        offenders = data.get("bad_actors") or []
        tn = int(args.get("top_n") or 10)
        tp = args.get("time_period") or "all"
        # Compose detailed list and categorize sources
        sys_prefixes = ("EVENT_", "REPORT", "OP_", "SCM", "SYSTEM", "SYSMGT", "STATION")
        instr_prefixes = ("TI-","TT-","TIC-","PI-","PT-","PIC-","FI-","FIT-","FIC-","LI-","LT-","LIC-","BV-","XV-","FCV-","RTD-","SV-")
        lines = []
        table_rows = []
        sys_count = sys_events = 0
        inst_count = inst_events = 0
        total_events = 0
        for idx, r in enumerate(offenders[:min(tn, 10)], start=1):
            if not isinstance(r, dict):
                lines.append(f"- **[source]** {str(r)}")
                continue
            src = str(r.get("Source"))
            cnt = int(r.get("event_count") or r.get("count") or 0)
            epd = r.get("events_per_day")
            total_events += cnt
            if src.upper().startswith(sys_prefixes):
                sys_count += 1
                sys_events += cnt
            if src.upper().startswith(tuple(x.strip('-').upper() for x in instr_prefixes)) or src.upper().startswith(instr_prefixes):
                inst_count += 1
                inst_events += cnt
            if epd is not None:
                lines.append(f"- **[source]** {src} — {cnt} events; {epd}/day")
            else:
                lines.append(f"- **[source]** {src} — {cnt} events")
            # Build table row (Rank, Source, Events, Events/Day)
            try:
                epd_disp = (f"{round(float(epd),2)}" if epd is not None else "-")
            except Exception:
                epd_disp = str(epd) if epd is not None else "-"
            table_rows.append(f"| {idx} | {src} | {cnt} | {epd_disp} |")
        head_heavy = False
        try:
            if len(offenders) >= 3:
                c0 = int((offenders[0] or {}).get("event_count", 0))
                c2 = int((offenders[2] or {}).get("event_count", 1)) or 1
                head_heavy = c0 > 2 * c2
        except Exception:
            pass
        obs = []
        obs.append(f"- **[scope]** Raw events, period={tp}, Top {min(tn, len(offenders))}")
        if total_events:
            if sys_events:
                obs.append(f"- **[system load]** System/event-like sources: {sys_count} of Top {min(tn, len(offenders))} (≈{round(sys_events*100/max(1,total_events),1)}% of events)")
            if inst_events:
                obs.append(f"- **[instrument load]** Instrument tags: {inst_count} (≈{round(inst_events*100/max(1,total_events),1)}% of events)")
        if head_heavy:
            obs.append("- **[distribution]** Head-heavy: top source far exceeds next peers")
        # Heuristic suspected reasons per source (raw fallback)
        suspected = []
        try:
            for r in offenders[:min(tn, 10)]:
                if not isinstance(r, dict):
                    continue
                src = str(r.get("Source"))
                cnt = int(r.get("event_count") or r.get("count") or 0)
                epd = r.get("events_per_day")
                perc = r.get("percentage")
                reasons = []
                if src.upper().startswith(sys_prefixes):
                    reasons.append("System/informational stream — candidate for J-coding or suppression")
                if src.upper().startswith(tuple(x.strip('-').upper() for x in instr_prefixes)) or src.upper().startswith(instr_prefixes):
                    try:
                        if epd is not None and float(epd) >= 50:
                            reasons.append("High repetition — likely nuisance/repeating; consider deadband/delay")
                    except Exception:
                        pass
                try:
                    if perc is not None and float(perc) >= 10.0:
                        reasons.append("Major contributor — review priority and operator action requirement")
                except Exception:
                    pass
                if not reasons:
                    reasons.append("High event volume — validate priority, necessity, and suppression rules")
                suspected.append(f"- **[reason]** {src}: " + "; ".join(reasons))
        except Exception:
            pass
        recs = [
            "Convert to activation-based analysis for prescriptions (unique alarms)",
            "Re-route system/informational streams to J-coded or reduce verbosity",
            "Apply deadband/delay and review setpoints/priorities on repetitive instruments",
            "Rationalize priorities where operator action is not required"
        ]
        rec_bullets = "\n".join([f"- **[action]** {x}" for x in recs])
        body = []
        # Add compact table for quick scanning
        if table_rows:
            table = (
                "| Rank | Source | Events | Events/Day |\n"
                "| ---: | --- | ---: | ---: |\n" +
                "\n".join(table_rows)
            )
            body.append("## Top offenders (raw)\n" + table)
        # Keep detailed list
        body.append("## Findings\n" + ("\n".join(lines) or "- **[note]** No offenders found"))
        if suspected:
            body.append("## Suspected reasons (heuristics)\n" + ("\n".join(suspected)))
        body.append("## Key observations\n" + ("\n".join(obs)))
        body.append("## Recommendations\n" + rec_bullets)
        body.append("## Next actions\n- **[tool]** analyze_bad_actors(top_n=10, min_alarms=50, time_period='last_7_days')\n- **[tool]** get_isa_compliance_report('last_30_days')\n- **[tool]** analyze_flood_events(min_sources=3)")
        return "\n\n".join(body)
    if name == "execute_sql_query":
        rows = (data.get("data") or []) if isinstance(data, dict) else []
        if not rows:
            # Fall back to compact default
            n = 0
            try:
                n = int((data.get("metadata") or {}).get("row_count") or 0)
            except Exception:
                pass
            cols = []
            try:
                cols = list((data.get("metadata") or {}).get("columns") or [])
            except Exception:
                cols = []
            return f"Returned {n} row(s). Columns: {', '.join(cols) if cols else 'N/A'}."

        # Detect common aggregate shapes
        first = rows[0] if isinstance(rows[0], dict) else {}
        keys = {k.lower(): k for k in first.keys()}

        label_key = None
        count_key = None
        for lk in ("location", "Source", "Priority", "name", "Location Tag"):
            if lk in first:
                label_key = lk
                break
            if lk.lower() in keys:
                label_key = keys[lk.lower()]
                break
        for ck in ("cnt", "count", "total"):
            if ck in first:
                count_key = ck
                break
            if ck.lower() in keys:
                count_key = keys[ck.lower()]
                break

        # Compose humanized summary when we have a clear (label, count) table
        if label_key and count_key:
            # Compute totals and head-heaviness
            try:
                totals = [int((r or {}).get(count_key) or 0) for r in rows]
            except Exception:
                totals = []
            s_total = sum(totals) if totals else 0
            head_heavy = False
            try:
                if len(totals) >= 3 and totals[2] > 0 and totals[0] > 2 * totals[2]:
                    head_heavy = True
            except Exception:
                pass

            # Build top list (cap 10 for readability)
            lines = []
            for idx, r in enumerate(rows[:10], start=1):
                try:
                    lbl = str(r.get(label_key))
                    c = int(r.get(count_key) or 0)
                    share = f" (~{round(c*100/max(1,s_total),1)}%)" if s_total else ""
                    lines.append(f"- **[rank {idx}]** {lbl} — {c}{share}")
                except Exception:
                    continue

            obs = []
            if head_heavy:
                obs.append("- **[distribution]** Head-heavy: top item significantly exceeds next peers")
            if s_total:
                obs.append(f"- **[coverage]** Top {min(10,len(rows))} cover ~{round(sum(totals[:min(10,len(totals))])*100/max(1,s_total),1)}% of the returned activity")

            # Determine context label
            table_label = "locations" if label_key.lower().startswith("location") else label_key

            body = []
            body.append(f"## Findings\n- **[scope]** Top {table_label} by alarm count\n" + ("\n".join(lines) or "- **[note]** No rows"))
            if obs:
                body.append("## Key Observations\n" + "\n".join(obs))
            body.append("## Next Actions\n- **[ask]** Drill into the top item (e.g., show top sources within that location)\n- **[ask]** Switch to activation-based analysis for prescriptions (analyze_bad_actors)")
            return "\n\n".join(body)

        # Unknown shape → compact fallback
        try:
            n = len(rows)
            cols = list(first.keys()) if isinstance(first, dict) else []
            return f"Returned {n} row(s). Columns: {', '.join(cols) if cols else 'N/A'}."
        except Exception:
            return (result or "").strip()
    if name in ("get_isa_compliance_report", "get_isa_compliance_raw"):
        if name == "get_isa_compliance_report":
            # Prefer direct metrics from activation-based tool; fallback to frequency.summary if present
            m = data.get("metrics") if isinstance(data, dict) else None
            if isinstance(m, dict) and m:
                apd = m.get("avg_alarms_per_day")
                over = m.get("days_over_iso_threshold") or m.get("days_over_288_count")
                crit = m.get("days_critically_overloaded") or m.get("days_unacceptable_count")
            else:
                freq = data.get("frequency") or {}
                summ = freq.get("summary") or {}
                apd = summ.get("avg_alarms_per_day")
                over = summ.get("days_over_288_count")
                crit = summ.get("days_unacceptable_count")
            presc = data.get("prescription") or ""
            tp = args.get("time_period") or data.get("period") or "all"
            status = data.get("compliance_status") or ""
            parts = []
            if apd is not None:
                parts.append(f"avg/day={apd}")
            if over is not None:
                parts.append(f">288/day={over}")
            if crit is not None:
                parts.append(f"≥720/day={crit}")
            met = ", ".join(parts) if parts else "—"
            base = f"ISA/EEMUA compliance (activation-based) for period={tp}: {status}. Metrics: {met}."
            presc_txt = presc or "Reduce overload by rationalizing noisy alarms and improving suppression/priority."
            return base + f"\nRecommendations: {presc_txt}\nNext: Drill into bad actors (analyze_bad_actors) or floods (analyze_flood_events)."
        else:
            tp = args.get("time_period") or data.get("time_period") or "all"
            avg = data.get("avg_alarms_per_day") or (data.get("metrics", {}) if isinstance(data, dict) else {}).get("avg_alarms_per_day")
            d288 = data.get("days_over_288") or data.get("days_over_288_count")
            base = f"ISA/EEMUA (raw events) for period={tp}: avg/day={avg}, >288/day={d288}."
            return base + "\nNote: Prefer activation-based metrics for compliance decisions (get_isa_compliance_report)."
    if name == "get_alarm_health_summary":
        summ = data.get("summary") or {}
        total = summ.get("total_sources")
        healthy = summ.get("healthy")
        marginal = summ.get("marginal")
        unhealthy = summ.get("unhealthy")
        worst = data.get("sources") or []
        worst_preview = ", ".join([f"{w.get('Source')} (score {w.get('Health_Score')})" for w in worst[:5] if isinstance(w, dict)])
        presc = data.get("prescription") or "Focus first on UNHEALTHY sources; address standing/stale patterns."
        line1 = f"Health Summary: total={total}, healthy={healthy}, marginal={marginal}, unhealthy={unhealthy}."
        line2 = f"Worst sources: {worst_preview or 'N/A'}."
        line3 = f"Recommendations: {presc}"
        line4 = "Next: Run bad actor analysis for prescriptions (analyze_bad_actors) or check floods (analyze_flood_events)."
        return "\n".join([line1, line2, line3, line4])
    if name == "execute_sql_query":
        rows = data.get("data") if isinstance(data, dict) else None
        if isinstance(rows, list):
            row_count = int(data.get("row_count") or len(rows))
            cols = data.get("columns") or (list(rows[0].keys()) if rows else [])
            if ("Source" in cols) and ("cnt" in cols or "count" in cols or "event_count" in cols):
                def _get_cnt(r: dict):
                    return r.get("cnt") or r.get("count") or r.get("event_count")
                top = [(str(r.get('Source')), int(_get_cnt(r))) for r in rows if r.get('Source') is not None and _get_cnt(r) is not None]
                preview = ", ".join([f"{s} ({c})" for s, c in top[:10]])
                names = [s for s, _ in top[:10]]
                system_like = any([(n or "").upper().startswith(tuple(["EVENT_","REPORT","OP_"])) for n in names])
                interp_bits = []
                if system_like:
                    interp_bits.append("High share of system/event sources; consider routing to J-coded or reducing verbosity.")
                if len(top) >= 3 and top[0][1] > 2 * max(1, top[2][1]):
                    interp_bits.append("Head-heavy distribution suggests a few dominant offenders.")
                interp = " ".join(interp_bits) or "Use activation-based analysis to identify true bad actors (unique alarms)."
                recs = [
                    "Prioritize activation-based bad actor analysis to target noise effectively.",
                    "Apply deadband/delay and review setpoints/priorities on repetitive offenders.",
                    "Separate informational/system streams into J-coded or non-annunciated paths."
                ]
                nexts = [
                    "Run analyze_bad_actors(top_n=10, min_alarms=50)",
                    "Check get_isa_compliance_report('last_30_days')",
                    "Investigate plant-wide floods via analyze_flood_events(min_sources=3)"
                ]
                return (
                    f"Top {row_count} sources by total events (raw): {preview}.\n"
                    f"Interpretation: {interp}\n"
                    f"Recommendations: {recs[0]} {recs[1]} {recs[2]}\n"
                    f"Next: {nexts[0]} | {nexts[1]} | {nexts[2]}"
                )
            cols_preview = ", ".join([str(c) for c in cols[:8]])
            return f"Returned {row_count} row(s). Columns: {cols_preview}."
        if isinstance(data, dict) and data.get("status") == "success" and int(data.get("row_count") or 0) == 0:
            return "No rows returned. Try widening the time range or removing filters."
        return "Processed query. See JSON keys for details."
    # Fallback: compact echo of keys
    keys = ", ".join(list(data.keys())[:8])
    return f"Processed {tool_name}. Keys: {keys}."

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

## AVAILABLE TOOLS

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

### HELPER TOOL

**lookup_nomenclature(term: str)**
Resolve canonical meanings, synonyms, and mappings for terms (Priority, Condition, Action, DCS tags).

**Use For**: Disambiguation before building SQL; e.g., "HIHI", "ACK", "TI", "CRITICAL".

### CACHE-AWARE TOOLS

**get_frequency_summary_cached(plant_id?: str, force_db?: bool, validate?: bool)**
High-level ISO/EEMUA frequency summary using precomputed cache when valid.

**Use For**: Fast plant-wide KPIs. Set `force_db=true` to compute live; `validate=true` to compare cache vs DB.

**get_unhealthy_summary_cached(plant_id?: str, force_db?: bool, validate?: bool)**
Returns unhealthy windows and bad actors summary from cache or live DB.

**Use For**: Quick identification of problematic sources.

**get_floods_summary_cached(plant_id?: str, force_db?: bool, validate?: bool)**
Returns flood windows (overlapping unhealthy periods across sources).

**Use For**: Plant-wide disturbance detection.

**read_overall_health_cache()**
Fetch overall health cached JSON blob.

**Use For**: Debugging data path and UI parity.

### RAW EVENT VARIANTS

Event-based calculations on raw events (no state machine). Use when the user asks for raw/event counts or when state semantics are not desired.

**analyze_flood_events_raw(min_sources: int = 2, time_window_minutes: int = 10, time_period: str = "all")**
Detect floods using raw event activations in a rolling window.

**get_isa_compliance_raw(time_period: str = "all")**
ISO-style daily counts using raw event timestamps. Not state-machine unique activations.

**get_bad_actors_raw(top_n: int = 20, time_period: str = "all", min_events: int = 100)**
Top sources by raw event counts.

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
 - Raw variants also exist (event-based): use when the user asks for raw/event counts or when state-machine semantics are not desired

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

## AUTOMATIC CHART GENERATION

📊 **IMPORTANT: You HAVE chart generation capabilities!**

**Charts are automatically generated** when you return data that can be visualized. Do NOT tell users you cannot create charts.

**How It Works:**
1. You execute tools (execute_sql_query, analyze_bad_actors, etc.)
2. If the data is chartable, a chart is automatically generated
3. Charts appear inline with your answer - you don't need to do anything special

**Triggers for Charts:**
- User asks for "chart", "plot", "graph", "visualize" → Chart generated
- User asks for "top sources", "trends", "distribution" → Chart auto-generated
- User asks for "breakdown", "comparison", "ranking" → Chart auto-generated

**Chart Types Generated:**
- **Bar charts**: Top N lists, rankings, comparisons
- **Line charts**: Time series, trends, patterns over time
- **Pie charts**: Distributions, breakdowns, percentages
- **Scatter charts**: Correlations, relationships

**What You Should Do:**
✅ Focus on getting accurate data from tools
✅ Let the system handle chart generation automatically
✅ If user asks for a chart, just return the data normally
✅ Mention charts in your answer: "Here's the data (chart generated below)"

**What NOT to Do:**
❌ Never say "I cannot generate charts"
❌ Never say "I don't have chart capabilities"
❌ Never say "charts are not available"
❌ Don't try to create ASCII charts or text visualizations

**Example:**
- User: "Show top 10 sources with a chart"
- You: Call execute_sql_query → Return data → Say "Here are the top 10 sources (visualized below):"
- System: Automatically generates bar chart inline

**Remember:** Charts require at least 2 data points. If query returns 0-1 rows, no chart will appear (which is fine).

---

## CRITICAL RULES

✅ **Classify query FIRST** (Fast Path vs Data Path)
✅ **Fast Path**: Answer immediately, no tools
✅ **Data Path**: ALWAYS call tools, never fabricate data
✅ **Charts**: Available automatically - never say you can't generate them
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

    # Build proper JSON Schema for tools (with enums/ranges/descriptions)
    tools_schema = [build_tool_schema(t) for t in tools]

    formatted_prompt = SYSTEM_PROMPT.format(
        tools_schema=json.dumps([t['function'] for t in tools_schema], indent=2)
    )

    messages = [
        {"role": "system", "content": formatted_prompt},
        {"role": "user", "content": query}
    ]

    # Request-scoped chart dedup and cap (UX: avoid noisy duplicates)
    MAX_CHARTS_PER_REQUEST = int(os.getenv("AGENT_MAX_CHARTS", "3"))
    emitted_chart_sigs = set()
    emitted_chart_count = 0

    # Friendly period label for titles
    _period_key = _extract_time_period(query)
    def _period_label(k: str) -> str:
        mapping = {
            "all": "All",
            "last_30_days": "Last 30 days",
            "last_7_days": "Last 7 days",
            "last_24_hours": "Last 24 hours",
        }
        return mapping.get((k or "").lower(), "All")
    _friendly_period = _period_label(_period_key)

    def _tool_label(name: Optional[str]) -> str:
        if not name:
            return ""
        if name == "execute_sql_query":
            return "SQL template"
        try:
            return name.replace("_", " ").title()
        except Exception:
            return str(name)

    tool_map = {t.__name__: t for t in tools}

    # Pre-route via Intent → SQL Template mapping for faster, deterministic answers
    pre_routed = False
    try:
        mapped = classify_intent(query)
    except Exception:
        mapped = None
    if mapped:
        import time as _t
        start_ts = _t.time()
        try:
            if mapped.get("type") == "tool":
                fn_name = mapped.get("name")
                fn_args = mapped.get("args", {}) or {}
                fn = tool_map.get(fn_name)
                if fn:
                    # Announce and execute tool
                    yield {"type": "reasoning", "content": f"Recognized intent. Executing {fn_name} via template router..."}
                    yield {"type": "tool_call", "data": {"name": fn_name, "arguments": json.dumps(fn_args)}}
                    used_tool_name = fn_name
                    used_args = dict(fn_args)
                    try:
                        # Guard against long-running computations with per-tool timeouts
                        _timeout = 10
                        try:
                            if fn_name == "analyze_bad_actors":
                                _timeout = 20  # Allow more time for activation-based analysis to produce descriptive reasons
                        except Exception:
                            _timeout = 10
                        result = await asyncio.wait_for(asyncio.to_thread(fn, **fn_args), timeout=_timeout)
                    except asyncio.TimeoutError:
                        # Primary tool timed out ─ stream fallback path
                        timeout_payload = {
                            "status": "timeout",
                            "message": f"{fn_name} took too long.",
                            "suggestions": [
                                "Use a shorter period (e.g., last_7_days)",
                                "Try cached/raw alternative"
                            ]
                        }
                        yield {"type": "tool_result", "content": json.dumps(timeout_payload)}
                        # Fallback: if bad-actors timed out, switch to raw last_7_days; else keep existing result
                        if fn_name == "analyze_bad_actors":
                            # First try a tighter activation-based window before falling back to raw
                            if (fn_args.get("time_period") or "") != "last_7_days":
                                yield {"type": "reasoning", "content": "Primary analysis timed out. Retrying activation-based for last_7_days..."}
                                fb_args = {
                                    "top_n": int(fn_args.get("top_n") or 10),
                                    "min_alarms": int(fn_args.get("min_alarms") or 50),
                                    "time_period": "last_7_days"
                                }
                                yield {"type": "tool_call", "data": {"name": "analyze_bad_actors", "arguments": json.dumps(fb_args)}}
                                fb_fn = tool_map.get("analyze_bad_actors")
                                try:
                                    result = await asyncio.wait_for(asyncio.to_thread(fb_fn, **fb_args), timeout=12)
                                    used_tool_name = "analyze_bad_actors"
                                    used_args = fb_args
                                except Exception as e:
                                    # If retry also fails, fall back to raw last_7_days
                                    yield {"type": "reasoning", "content": "Retry failed. Falling back to raw bad actors for last_7_days..."}
                                    rb_args = {"top_n": int(fn_args.get("top_n") or 10), "time_period": "last_7_days", "min_events": 100}
                                    yield {"type": "tool_call", "data": {"name": "get_bad_actors_raw", "arguments": json.dumps(rb_args)}}
                                    rb_fn = tool_map.get("get_bad_actors_raw")
                                    try:
                                        result = await asyncio.wait_for(asyncio.to_thread(rb_fn, **rb_args), timeout=12)
                                        used_tool_name = "get_bad_actors_raw"
                                        used_args = rb_args
                                    except Exception as e2:
                                        result = json.dumps({"error": str(e2)})
                            else:
                                # Already last_7_days; go directly to raw fallback
                                yield {"type": "reasoning", "content": "Primary analysis timed out. Falling back to raw bad actors for last_7_days..."}
                                rb_args = {"top_n": int(fn_args.get("top_n") or 10), "time_period": "last_7_days", "min_events": 100}
                                yield {"type": "tool_call", "data": {"name": "get_bad_actors_raw", "arguments": json.dumps(rb_args)}}
                                rb_fn = tool_map.get("get_bad_actors_raw")
                                try:
                                    result = await asyncio.wait_for(asyncio.to_thread(rb_fn, **rb_args), timeout=12)
                                    used_tool_name = "get_bad_actors_raw"
                                    used_args = rb_args
                                except Exception as e:
                                    result = json.dumps({"error": str(e)})
                        elif fn_name == "get_alarm_health_summary":
                            # Option B: health summary timeout → cached unhealthy summary
                            yield {"type": "reasoning", "content": "Primary health summary timed out. Falling back to cached unhealthy summary..."}
                            fb_args = {}
                            yield {"type": "tool_call", "data": {"name": "get_unhealthy_summary_cached", "arguments": json.dumps(fb_args)}}
                            fb_fn = tool_map.get("get_unhealthy_summary_cached")
                            try:
                                result = await asyncio.wait_for(asyncio.to_thread(fb_fn, **fb_args), timeout=12)
                                used_tool_name = "get_unhealthy_summary_cached"
                                used_args = fb_args
                            except Exception as e:
                                result = json.dumps({"error": str(e)})
                        else:
                            result = json.dumps(timeout_payload)
                    except Exception as e:
                        result = json.dumps({"error": str(e)})
                    # Show compact tool result, then provide a human-friendly summary as the final answer
                    yield {"type": "tool_result", "content": (result[:500] + ("..." if len(result) > 500 else ""))}
                    
                    # Chart generation for template router tool path
                    try:
                        parsed_result = None
                        if isinstance(result, str):
                            try:
                                parsed_result = json.loads(result)
                            except Exception:
                                pass
                        elif isinstance(result, dict):
                            parsed_result = result
                        
                        chart_intent = detect_chart_intent(query, parsed_result)
                        
                        if chart_intent and chart_intent.get("should_chart") and chart_intent["confidence"] >= 0.6:
                            chart_data_source = None
                            if parsed_result and isinstance(parsed_result, dict):
                                chart_data_source = (
                                    parsed_result.get("data")
                                    or parsed_result.get("bad_actors")
                                    or parsed_result.get("top_offenders")
                                    or []
                                )
                            
                            if chart_data_source and isinstance(chart_data_source, list) and len(chart_data_source) >= 2:
                                from chart_generator import generate_chart_data
                                
                                # Prefer the actual tool period used (args) over query-detected period
                                try:
                                    _title_period = _period_label((used_args or {}).get("time_period") or _period_key)
                                except Exception:
                                    _title_period = _friendly_period
                                chart_payload = generate_chart_data(
                                    chart_type=chart_intent["chart_type"],
                                    data=chart_data_source,
                                    query=query,
                                    metadata={
                                        "reason": chart_intent["reason"],
                                        "title_suffix": f"{_title_period} — {_tool_label(used_tool_name)}".strip()
                                    }
                                )
                                
                                if chart_payload:
                                    # Deduplicate and cap chart emissions for this request
                                    try:
                                        _sig_src = f"{chart_payload.get('type','')}|{(chart_payload.get('config') or {}).get('title','')}"
                                        _sig = f"{_sig_src}|{len(chart_payload.get('data') or [])}"
                                    except Exception:
                                        _sig = str(type(chart_payload))
                                    if (_sig not in emitted_chart_sigs) and (emitted_chart_count < MAX_CHARTS_PER_REQUEST):
                                        emitted_chart_sigs.add(_sig)
                                        emitted_chart_count += 1
                                        yield {"type": "chart_data", "data": chart_payload}
                    except Exception as chart_err:
                        print(f"[Chart Generation] Failed: {chart_err}")
                    
                    final_text = _summarize_tool_output(used_tool_name, used_args, result)
                    yield {"type": "answer_stream", "content": final_text}
                    yield {"type": "answer_complete", "content": final_text}
                    yield {"type": "complete", "data": {"iterations": 1, "response_time": round(_t.time() - start_ts, 2), "query_path": "Data Path (Template Router)", "provider": "template_router"}}
                    pre_routed = True
                # if tool not found, fall through to LLM
            elif mapped.get("type") == "template":
                sql = build_sql_from_template(mapped)
                fn = tool_map.get("execute_sql_query")
                if fn:
                    yield {"type": "reasoning", "content": "Recognized pattern. Using SQL template via execute_sql_query..."}
                    yield {"type": "tool_call", "data": {"name": "execute_sql_query", "arguments": json.dumps({"sql_query": sql})}}
                    try:
                        result = await asyncio.wait_for(asyncio.to_thread(fn, sql_query=sql), timeout=20)
                    except asyncio.TimeoutError:
                        result = json.dumps({
                            "status": "timeout",
                            "message": "SQL template execution took too long. Please refine filters or add a LIMIT.",
                            "suggestions": [
                                "Add WHERE time filter (e.g., last_7_days)",
                                "Filter by Source LIKE 'TI-%'",
                                "Use a smaller LIMIT (e.g., LIMIT 500)"
                            ]
                        })
                    except Exception as e:
                        result = json.dumps({"error": str(e)})
                    yield {"type": "tool_result", "content": (result[:500] + ("..." if len(result) > 500 else ""))}
                    
                    # Chart generation for SQL template path
                    try:
                        parsed_result = None
                        if isinstance(result, str):
                            try:
                                parsed_result = json.loads(result)
                            except Exception:
                                pass
                        elif isinstance(result, dict):
                            parsed_result = result
                        
                        chart_intent = detect_chart_intent(query, parsed_result)
                        
                        if chart_intent and chart_intent.get("should_chart") and chart_intent["confidence"] >= 0.6:
                            chart_data_source = None
                            if parsed_result and isinstance(parsed_result, dict):
                                chart_data_source = (
                                    parsed_result.get("data")
                                    or parsed_result.get("bad_actors")
                                    or parsed_result.get("top_offenders")
                                    or []
                                )
                            
                            if chart_data_source and isinstance(chart_data_source, list) and len(chart_data_source) >= 2:
                                from chart_generator import generate_chart_data
                                
                                chart_payload = generate_chart_data(
                                    chart_type=chart_intent["chart_type"],
                                    data=chart_data_source,
                                    query=query,
                                    metadata={"reason": chart_intent["reason"]}
                                )
                                
                                if chart_payload:
                                    # Deduplicate and cap chart emissions for this request
                                    try:
                                        _sig_src = f"{chart_payload.get('type','')}|{(chart_payload.get('config') or {}).get('title','')}"
                                        _sig = f"{_sig_src}|{len(chart_payload.get('data') or [])}"
                                    except Exception:
                                        _sig = str(type(chart_payload))
                                    if (_sig not in emitted_chart_sigs) and (emitted_chart_count < MAX_CHARTS_PER_REQUEST):
                                        emitted_chart_sigs.add(_sig)
                                        emitted_chart_count += 1
                                        yield {"type": "chart_data", "data": chart_payload}
                    except Exception as chart_err:
                        print(f"[Chart Generation] Failed: {chart_err}")
                    
                    # Summarize template SQL output into human-readable text (avoid raw JSON in final answer)
                    try:
                        final_text = _summarize_tool_output("execute_sql_query", {"sql_query": sql}, result)
                    except Exception:
                        final_text = result
                    yield {"type": "answer_stream", "content": final_text}
                    yield {"type": "answer_complete", "content": final_text}
                    yield {"type": "complete", "data": {"iterations": 1, "response_time": round(_t.time() - start_ts, 2), "query_path": "Data Path (Template Router)", "provider": "template_router"}}
                    pre_routed = True
            # If pre_routed handled, return early
            if pre_routed:
                return
        except Exception:
            # On any router error, fall back to LLM path
            pass
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

                        # Chart generation: Check if tool result should generate a chart
                        try:
                            # Parse tool result if it's JSON
                            parsed_result = None
                            if isinstance(tool_result, str):
                                try:
                                    parsed_result = json.loads(tool_result)
                                except Exception:
                                    pass
                            elif isinstance(tool_result, dict):
                                parsed_result = tool_result
                            
                            # Detect chart intent
                            chart_intent = detect_chart_intent(query, parsed_result)
                            
                            if chart_intent and chart_intent.get("should_chart") and chart_intent["confidence"] >= 0.6:
                                # Extract data for charting
                                chart_data_source = None
                                if parsed_result and isinstance(parsed_result, dict):
                                    chart_data_source = (
                                        parsed_result.get("data")
                                        or parsed_result.get("bad_actors")
                                        or parsed_result.get("top_offenders")
                                        or []
                                    )
                                
                                if chart_data_source and isinstance(chart_data_source, list) and len(chart_data_source) >= 2:
                                    from .chart_generator import generate_chart_data
                                    
                                    # Prefer the actual tool period used (args) over query-detected period
                                    try:
                                        _title_period = _period_label((fn_args or {}).get("time_period") or _period_key)
                                    except Exception:
                                        _title_period = _friendly_period
                                    chart_payload = generate_chart_data(
                                        chart_type=chart_intent["chart_type"],
                                        data=chart_data_source,
                                        query=query,
                                        metadata={
                                            "reason": chart_intent["reason"],
                                            "title_suffix": f"{_title_period} — {_tool_label(fn_name)}"
                                        }
                                    )
                                    
                                    if chart_payload:
                                        # Deduplicate and cap chart emissions for this request
                                        try:
                                            _sig_src = f"{chart_payload.get('type','')}|{(chart_payload.get('config') or {}).get('title','')}"
                                            _sig = f"{_sig_src}|{len(chart_payload.get('data') or [])}"
                                        except Exception:
                                            _sig = str(type(chart_payload))
                                        if (_sig not in emitted_chart_sigs) and (emitted_chart_count < MAX_CHARTS_PER_REQUEST):
                                            emitted_chart_sigs.add(_sig)
                                            emitted_chart_count += 1
                                            yield {"type": "chart_data", "data": chart_payload}
                        except Exception as chart_err:
                            # Chart generation is non-critical, log and continue
                            print(f"[Chart Generation] Failed: {chart_err}")

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
                    # Guard against long-running tool execution with per-tool timeout
                    _timeout = 10
                    try:
                        if tool_name == "analyze_bad_actors":
                            _timeout = 20
                    except Exception:
                        _timeout = 10
                    try:
                        tool_result = await asyncio.wait_for(asyncio.to_thread(tool_func, **tool_args), timeout=_timeout)
                    except asyncio.TimeoutError:
                        # Standard timeout payload to keep UX responsive; downstream summary handles nicely
                        tool_result = json.dumps({
                            "status": "timeout",
                            "message": f"{tool_name} took too long.",
                            "suggestions": [
                                "Use a shorter period (e.g., last_7_days)",
                                "Try cached/raw alternative"
                            ]
                        })
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

                # Chart generation for main LLM loop (after tool execution)
                try:
                    parsed_result = None
                    if isinstance(tool_result, str):
                        try:
                            parsed_result = json.loads(tool_result)
                        except Exception:
                            pass
                    elif isinstance(tool_result, dict):
                        parsed_result = tool_result
                    
                    chart_intent = detect_chart_intent(query, parsed_result)
                    
                    if chart_intent and chart_intent.get("should_chart") and chart_intent["confidence"] >= 0.6:
                        chart_data_source = None
                        if parsed_result and isinstance(parsed_result, dict):
                            chart_data_source = (
                                parsed_result.get("data")
                                or parsed_result.get("bad_actors")
                                or parsed_result.get("top_offenders")
                                or []
                            )
                        
                        if chart_data_source and isinstance(chart_data_source, list) and len(chart_data_source) >= 2:
                            from chart_generator import generate_chart_data
                            
                            chart_payload = generate_chart_data(
                                chart_type=chart_intent["chart_type"],
                                data=chart_data_source,
                                query=query,
                                metadata={
                                    "reason": chart_intent["reason"],
                                    "title_suffix": f"{_friendly_period} — {_tool_label(tool_name)}"
                                }
                            )
                            
                            if chart_payload:
                                print(f"[Chart Generation] Generating {chart_payload['type']} chart (confidence: {chart_intent['confidence']}, reason: {chart_intent['reason']})")
                                # Deduplicate and cap chart emissions for this request
                                try:
                                    _sig_src = f"{chart_payload.get('type','')}|{(chart_payload.get('config') or {}).get('title','')}"
                                    _sig = f"{_sig_src}|{len(chart_payload.get('data') or [])}"
                                except Exception:
                                    _sig = str(type(chart_payload))
                                if (_sig not in emitted_chart_sigs) and (emitted_chart_count < MAX_CHARTS_PER_REQUEST):
                                    emitted_chart_sigs.add(_sig)
                                    emitted_chart_count += 1
                                    yield {"type": "chart_data", "data": chart_payload}
                        else:
                            if chart_data_source is not None:
                                print(f"[Chart Generation] Insufficient data points: {len(chart_data_source) if isinstance(chart_data_source, list) else 'N/A'} (need >= 2)")
                except Exception as chart_err:
                    print(f"[Chart Generation] Failed: {chart_err}")
                    import traceback
                    traceback.print_exc()

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
