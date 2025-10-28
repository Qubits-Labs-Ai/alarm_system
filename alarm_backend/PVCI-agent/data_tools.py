# data_tools.py (FINAL VERSION with Alarm Logic Integration + SQLite + Data Cleaning)

import pandas as pd
import json
import sqlite3
import io
import os
from typing import Dict, List, Any, Optional
import inspect
import re
from alarm_logic import analyze as alarm_analyze   #  import alarm logic analyzer

# --- Global Database Configuration ---
DB_FILE = os.path.join(os.path.dirname(__file__), 'alerts.db')
TABLE_NAME = 'alerts'

# Sahi column names (used for both CSV loading and database table creation)
COLUMN_NAMES = [
    "Event Time", "Location Tag", "Source", "Condition", "Action",
    "Priority", "Description", "Value", "Units", "Extra"
]
# Columns we will actually use, excluding 'Extra'
USED_COLUMNS = COLUMN_NAMES[:-1]


def load_data(file_path: str, sheet_name: str = 'alert_data'):
    """
    Loads data from the CSV file, cleans it, and writes it to an SQLite database.
    This replaces the global SHEETS dictionary with a permanent database file.
    """
    try:
        # 1. Robust CSV Reading & Cleaning
        with open(file_path, 'rb') as f:
            binary_data = f.read().replace(b'\x00', b'')
        data_string = binary_data.decode('latin1', errors='ignore').replace('\r', '')
        data_io = io.StringIO(data_string)

        df = pd.read_csv(
            data_io,
            sep=',',
            engine='python',
            header=None,
            skiprows=1,
            names=COLUMN_NAMES,
            on_bad_lines='skip'
        )

        if 'Extra' in df.columns:
            df = df.drop(columns=['Extra'])

        df.columns = df.columns.str.strip()
        df = df.dropna(how='all')  # Drop rows where all values are NaN

        # 2. Type Conversion (Crucial for SQLite)
        if 'Event Time' in df.columns:
            df['Event Time'] = pd.to_datetime(df['Event Time'], errors='coerce')
            df = df.dropna(subset=['Event Time'])  # Drop rows with bad 'Event Time'

        # Ensure 'Value' is numeric, coercing errors to NaN before dropping rows
        if 'Value' in df.columns:
            df['Value'] = pd.to_numeric(df['Value'], errors='coerce')

        # ===  CRITICAL FIX: DATA NORMALIZATION ===
        text_cols_to_clean = ["Location Tag", "Source", "Condition", "Action", "Priority", "Description", "Units"]
        for col in text_cols_to_clean:
            if col in df.columns:
                df[col] = df[col].astype(str).str.strip().str.upper()
        # ===========================================

        if len(df) == 0:
            raise Exception("Data load failed: Zero valid rows found after cleanup.")

        # 3. Write to SQLite Database
        conn = sqlite3.connect(DB_FILE)
        df.to_sql(TABLE_NAME, conn, if_exists='replace', index=False)
        conn.close()

        print(f" Data Loaded: {len(df)} rows written to SQLite database '{DB_FILE}' in table '{TABLE_NAME}'.")
        return True

    except FileNotFoundError:
        print(f" Error: File '{file_path}' not found.")
        return False
    except Exception as e:
        print(f" Error loading data to SQLite: {e}")
        return False


# ==================== SQL EXECUTION TOOL ====================

def _normalize_priority_literals(sql: str) -> str:
    """
    Make natural-language priority filters compatible with dataset codes.
    Examples:
      UPPER("Priority") = 'HIGH'  -> UPPER("Priority") IN ('HIGH','H')
      "Priority" = 'low'          -> UPPER("Priority") IN ('LOW','L')
      priority LIKE 'critical'     -> UPPER("Priority") IN ('CRITICAL','E','U')
      'J-CODED'/'JCODED'           -> IN ('J','J-CODED','JCODED')
    """
    try:
        s = sql
        # Unified patterns (case-insensitive)
        def rep(pattern: str, replacement: str) -> None:
            nonlocal s
            s = re.sub(pattern, replacement, s, flags=re.IGNORECASE)

        # Normalize spacing/quotes variants
        # HIGH
        rep(r"UPPER\(\s*\"?PRIORITY\"?\s*\)\s*=\s*'HIGH'", "UPPER(\"Priority\") IN ('HIGH','H')")
        rep(r"\bPRIORITY\b\s*=\s*'HIGH'", "UPPER(\"Priority\") IN ('HIGH','H')")
        rep(r"\bPRIORITY\b\s+LIKE\s+'HIGH'", "UPPER(\"Priority\") IN ('HIGH','H')")
        # LOW
        rep(r"UPPER\(\s*\"?PRIORITY\"?\s*\)\s*=\s*'LOW'", "UPPER(\"Priority\") IN ('LOW','L')")
        rep(r"\bPRIORITY\b\s*=\s*'LOW'", "UPPER(\"Priority\") IN ('LOW','L')")
        rep(r"\bPRIORITY\b\s+LIKE\s+'LOW'", "UPPER(\"Priority\") IN ('LOW','L')")
        # CRITICAL (E/U)
        rep(r"UPPER\(\s*\"?PRIORITY\"?\s*\)\s*=\s*'CRITICAL'", "UPPER(\"Priority\") IN ('CRITICAL','E','U')")
        rep(r"\bPRIORITY\b\s*=\s*'CRITICAL'", "UPPER(\"Priority\") IN ('CRITICAL','E','U')")
        rep(r"\bPRIORITY\b\s+LIKE\s+'CRITICAL'", "UPPER(\"Priority\") IN ('CRITICAL','E','U')")
        # J-CODED
        rep(r"\bPRIORITY\b\s*=\s*'J-CODED'", "UPPER(\"Priority\") IN ('J','J-CODED','JCODED')")
        rep(r"\bPRIORITY\b\s*=\s*'JCODED'", "UPPER(\"Priority\") IN ('J','J-CODED','JCODED')")
        return s
    except Exception:
        return sql

def execute_sql_query(sql_query: str) -> str:
    """
    Executes a read-only SQL query (SELECT) against the 'alerts' database table.
    Returns JSON with data, metadata, and helpful error messages.
    """
    try:
        # Normalize priority literals (HIGH->H, CRITICAL->E/U)
        sql_query = _normalize_priority_literals(sql_query)
        
        # Validate query
        sql_upper = sql_query.strip().upper()
        if not sql_upper.startswith('SELECT'):
            return json.dumps({
                "error": "Only SELECT statements are allowed.",
                "hint": "Use SELECT to query data. No INSERT, UPDATE, or DELETE operations permitted."
            })
        
        # Check for dangerous keywords (double-check)
        dangerous = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'TRUNCATE']
        for keyword in dangerous:
            if keyword in sql_upper:
                return json.dumps({
                    "error": f"Forbidden keyword: {keyword}",
                    "hint": "Only read-only SELECT queries are allowed."
                })
        
        # Execute query
        conn = sqlite3.connect(DB_FILE)
        result_df = pd.read_sql_query(sql_query, conn)
        conn.close()
        
        # Handle empty results with helpful suggestions
        if result_df.empty:
            return json.dumps({
                "message": "Query returned zero results.",
                "row_count": 0,
                "suggestions": [
                    "Try expanding the date range (e.g., last 7 days instead of 24 hours)",
                    "Check Priority mappings: Use 'H' or 'HIGH' for high priority, 'E'/'U' for critical",
                    "Verify text filters are UPPERCASE (e.g., WHERE UPPER(Source) = 'TI-101')",
                    "Remove specific Location or Source filters to see if data exists",
                    "Check the date format: Use datetime('now', '-1 day') for relative dates"
                ]
            })
        
        # Return results with metadata
        result_rows = result_df.head(10).to_dict(orient='records')
        return json.dumps({
            "status": "success",
            "data": result_rows,
            "row_count": len(result_df),
            "columns": list(result_df.columns),
            "truncated": len(result_df) > 10,
            "note": "Showing first 10 rows" if len(result_df) > 10 else None
        }, indent=2)
    
    except sqlite3.OperationalError as e:
        error_msg = str(e)
        hints = []
        
        # Provide specific hints based on error type
        if "no such column" in error_msg.lower():
            hints.append("Column name error. Quote column names with spaces: \"Event Time\", \"Location Tag\"")
            hints.append("Valid columns: Event Time, Location Tag, Source, Condition, Action, Priority, Description, Value, Units")
        elif "syntax error" in error_msg.lower():
            hints.append("SQL syntax error. Check quotes, parentheses, and commas.")
            hints.append("Use double quotes for column names, single quotes for values.")
        elif "no such table" in error_msg.lower():
            hints.append("Table 'alerts' not found. Database may not be loaded. Ask admin to run /reload-db.")
        else:
            hints.append("Try simplifying the query. Use basic SELECT with minimal WHERE clauses.")
        
        return json.dumps({
            "error": f"SQL Query Error: {error_msg}",
            "query": sql_query,
            "hints": hints
        })
    
    except Exception as e:
        return json.dumps({
            "error": f"Unexpected error during SQL execution: {str(e)}",
            "type": type(e).__name__,
            "hint": "This may be a database connection or query processing issue. Try a simpler query."
        })


# ==================== ALARM BEHAVIOR ANALYSIS TOOL ====================

def analyze_alarm_behavior(sql_query: str) -> str:
    """
    Tool: Execute the given SELECT SQL, run alarm logic, return JSON string.
    Expectation: SQL should return rows with at least 'Event Time' and 'Source' columns.
    """
    try:
        sql_query = _normalize_priority_literals(sql_query)
        if not sql_query.strip().upper().startswith("SELECT"):
            return json.dumps({
                "error": "Only SELECT queries allowed.",
                "hint": "Use SELECT * FROM alerts WHERE ... to get data for behavioral analysis."
            })

        conn = sqlite3.connect(DB_FILE)
        df = pd.read_sql_query(sql_query, conn)
        conn.close()

        if df.empty:
            return json.dumps({
                "message": "Query returned zero rows.",
                "hint": "Alarm behavior analysis requires data. Try expanding date range or removing strict filters."
            })

        # Normalize column names like existing cleaning
        cols = {c.upper(): c for c in df.columns}
        if 'SOURCE' in cols:
            df = df.rename(columns={cols['SOURCE']: 'Source'})
        if 'EVENT TIME' in cols:
            df = df.rename(columns={cols['EVENT TIME']: 'Event Time'})
        
        # Validate required columns
        if 'Event Time' not in df.columns:
            return json.dumps({
                "error": "Missing required column: 'Event Time'",
                "hint": "Your SELECT query must include the \"Event Time\" column for time-based analysis.",
                "available_columns": list(df.columns)
            })
        
        if 'Source' not in df.columns:
            return json.dumps({
                "error": "Missing required column: 'Source'",
                "hint": "Your SELECT query must include the 'Source' column for per-source analysis.",
                "available_columns": list(df.columns)
            })

        # Run alarm logic analysis
        result = alarm_analyze(df, time_col="Event Time")
        
        # Enrich result with summary stats
        result["metadata"] = {
            "total_rows_analyzed": len(df),
            "unique_sources": df['Source'].nunique() if 'Source' in df.columns else 0,
            "time_range": {
                "start": str(df['Event Time'].min()) if 'Event Time' in df.columns else None,
                "end": str(df['Event Time'].max()) if 'Event Time' in df.columns else None
            }
        }
        
        return json.dumps(result, default=str, indent=2)

    except sqlite3.OperationalError as e:
        return json.dumps({
            "error": f"SQL Error: {str(e)}",
            "hint": "Check your SQL syntax. Remember to quote column names with spaces: \"Event Time\"",
            "retry_action": "Fix the SQL syntax error and try again with the corrected query."
        })
    except KeyError as e:
        missing_col = str(e).strip("'\"")
        return json.dumps({
            "error": f"Missing required column: {missing_col}",
            "type": "KeyError",
            "hint": "Your SQL query didn't include all required columns for behavioral analysis.",
            "required_columns": ["Event Time", "Source", "Action", "Condition"],
            "retry_action": f"Change your SQL query to: SELECT * FROM alerts WHERE [your conditions] to include all columns."
        })
    except Exception as e:
        error_msg = str(e)
        # Check if it's a column-related error
        if "column" in error_msg.lower() or "key" in error_msg.lower():
            return json.dumps({
                "error": f"Column error: {error_msg}",
                "type": type(e).__name__,
                "hint": "Missing required columns for analysis. Use SELECT * FROM alerts instead of selecting specific columns.",
                "retry_action": "Rewrite query as: SELECT * FROM alerts WHERE [your conditions]"
            })
        return json.dumps({
            "error": f"Analysis failed: {error_msg}",
            "type": type(e).__name__,
            "hint": "This may be a data processing issue. Ensure your query returns valid alarm data.",
            "retry_action": "Try simplifying your query or expanding the date range."
        })


# ==================== ADVANCED ANALYSIS TOOLS ====================

def get_isa_compliance_report(time_period: str = "all") -> str:
    """
    Get ISO 18.2 / EEMUA 191 compliance metrics based on unique alarm activations.
    Returns alarm frequency analysis with:
    - Average alarms per day/hour/10min
    - % days exceeding ISO threshold (288 alarms/day)
    - % days critically overloaded (≥720 alarms/day)
    - Detailed daily breakdown
    
    Args:
        time_period: "all", "last_30_days", "last_7_days", or "last_24_hours"
    
    Example: get_isa_compliance_report("last_30_days")
    """
    try:
        # Build time filter
        time_filter = ""
        if time_period == "last_30_days":
            time_filter = "WHERE datetime(\"Event Time\") >= datetime('now', '-30 days')"
        elif time_period == "last_7_days":
            time_filter = "WHERE datetime(\"Event Time\") >= datetime('now', '-7 days')"
        elif time_period == "last_24_hours":
            time_filter = "WHERE datetime(\"Event Time\") >= datetime('now', '-1 day')"
        
        sql = f"SELECT * FROM alerts {time_filter}"
        conn = sqlite3.connect(DB_FILE)
        df = pd.read_sql_query(sql, conn)
        conn.close()
        
        if df.empty:
            return json.dumps({"message": "No data available for the selected period."})
        
        # Calculate unique alarm activations using state machine
        df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
        df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
        
        activations = []
        for src, group in df.groupby("Source"):
            state = "IDLE"
            for _, row in group.sort_values("Event Time").iterrows():
                action = row["Action"]
                t = row["Event Time"]
                if action == "" and state in ["IDLE", "ACKED"]:
                    activations.append({"Source": src, "Time": t})
                    state = "ACTIVE"
                elif action == "ACK" and state == "ACTIVE":
                    state = "ACKED"
                elif action == "OK":
                    state = "IDLE"
        
        if not activations:
            return json.dumps({"message": "No alarm activations found in the period."})
        
        act_df = pd.DataFrame(activations)
        act_df["Date"] = act_df["Time"].dt.date
        daily_counts = act_df.groupby("Date").size().reset_index(name="Alarms")
        
        total_alarms = len(act_df)
        total_days = (act_df["Time"].max() - act_df["Time"].min()).days + 1
        total_hours = (act_df["Time"].max() - act_df["Time"].min()).total_seconds() / 3600
        
        avg_per_day = total_alarms / total_days if total_days > 0 else 0
        avg_per_hour = total_alarms / total_hours if total_hours > 0 else 0
        avg_per_10min = avg_per_hour / 6
        
        # ISO thresholds
        days_over_288 = daily_counts[daily_counts["Alarms"] > 288]
        days_over_720 = daily_counts[daily_counts["Alarms"] >= 720]
        
        pct_over_288 = (len(days_over_288) / len(daily_counts)) * 100 if len(daily_counts) > 0 else 0
        pct_over_720 = (len(days_over_720) / len(daily_counts)) * 100 if len(daily_counts) > 0 else 0
        
        # Compliance assessment
        if pct_over_288 > 10:
            compliance = "NON-COMPLIANT - Urgent Action Required"
            prescription = "Plant significantly exceeds ISO 18.2 threshold. Immediate rationalization needed."
        elif pct_over_288 > 0:
            compliance = "MARGINAL - Improvement Needed"
            prescription = "Some days exceed ISO threshold. Review and optimize alarm configuration."
        else:
            compliance = "COMPLIANT"
            prescription = "Plant meets ISO 18.2 standards. Maintain current alarm management practices."
        
        return json.dumps({
            "status": "success",
            "period": time_period,
            "compliance_status": compliance,
            "prescription": prescription,
            "metrics": {
                "total_unique_alarms": total_alarms,
                "avg_alarms_per_day": round(avg_per_day, 2),
                "avg_alarms_per_hour": round(avg_per_hour, 2),
                "avg_alarms_per_10min": round(avg_per_10min, 2),
                "total_days_analyzed": total_days,
                "days_over_iso_threshold": len(days_over_288),
                "pct_days_over_iso": round(pct_over_288, 1),
                "days_critically_overloaded": len(days_over_720),
                "pct_days_critical": round(pct_over_720, 1)
            },
            "worst_days": daily_counts.nlargest(5, "Alarms").to_dict(orient="records"),
            "iso_thresholds": {
                "acceptable": "≤288 alarms/day",
                "overloaded": ">288 alarms/day",
                "unacceptable": "≥720 alarms/day"
            }
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": f"ISA compliance analysis failed: {str(e)}"})


def analyze_bad_actors(top_n: int = 10, min_alarms: int = 50) -> str:
    """
    Identify top 'Bad Actor' alarm sources with prescriptive recommendations.
    Analyzes unique alarm activations, chattering episodes, and standing alarms.
    
    Args:
        top_n: Number of top offenders to return (default 10)
        min_alarms: Minimum unique alarms to be considered (default 50)
    
    Returns detailed source-level analysis with:
    - Unique alarm count
    - Chattering episodes
    - Standing alarms
    - Repeating alarm count
    - Specific recommendations per source
    
    Example: analyze_bad_actors(top_n=15, min_alarms=100)
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        df = pd.read_sql_query("SELECT * FROM alerts", conn)
        conn.close()
        
        if df.empty:
            return json.dumps({"message": "No data available."})
        
        df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
        df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
        df["Condition"] = df["Condition"].fillna("").astype(str).str.upper().str.strip() if "Condition" in df.columns else ""
        
        # Calculate per-source metrics using state machine
        bad_actors = []
        for src, group in df.groupby("Source"):
            group = group.sort_values("Event Time")
            
            # Count unique alarms
            state = "IDLE"
            unique_alarms = 0
            alarm_times = []
            standing_count = 0
            active_start = None
            
            for _, row in group.iterrows():
                action = row["Action"]
                t = row["Event Time"]
                
                if action == "" and state in ["IDLE", "ACKED"]:
                    unique_alarms += 1
                    alarm_times.append(t)
                    state = "ACTIVE"
                    active_start = t
                elif action == "ACK" and state == "ACTIVE":
                    # Check if standing (>60 min before ACK)
                    if active_start and (t - active_start).total_seconds() / 60 > 60:
                        standing_count += 1
                    state = "ACKED"
                elif action == "OK":
                    state = "IDLE"
                    active_start = None
            
            if unique_alarms < min_alarms:
                continue
            
            # Chattering detection (sliding 10-min window)
            chattering_episodes = 0
            in_chatter = False
            window = []
            for t in alarm_times:
                # Remove old
                window = [wt for wt in window if (t - wt).total_seconds() / 60 <= 10]
                window.append(t)
                if not in_chatter and len(window) >= 3:
                    chattering_episodes += 1
                    in_chatter = True
                if len(window) < 3:
                    in_chatter = False
            
            repeating = max(0, unique_alarms - 1)
            
            # Prescription based on pattern
            issues = []
            recommendations = []
            
            if chattering_episodes > 5:
                issues.append(f"{chattering_episodes} chattering episodes")
                recommendations.append("Add deadband or delay to reduce oscillation")
            if standing_count > unique_alarms * 0.3:
                issues.append(f"{standing_count} standing alarms")
                recommendations.append("Review setpoints - may be too sensitive")
            if repeating > unique_alarms * 0.8:
                issues.append(f"{repeating} repeating alarms")
                recommendations.append("Investigate root cause - recurring process issue")
            
            if not issues:
                issues = ["High activation count"]
                recommendations = ["Review alarm necessity and priority"]
            
            bad_actors.append({
                "Source": src,
                "Unique_Alarms": unique_alarms,
                "Chattering_Episodes": chattering_episodes,
                "Standing_Alarms": standing_count,
                "Repeating_Alarms": repeating,
                "Primary_Issues": ", ".join(issues),
                "Recommendations": " | ".join(recommendations)
            })
        
        # Sort by unique alarms
        bad_actors = sorted(bad_actors, key=lambda x: x["Unique_Alarms"], reverse=True)[:top_n]
        
        return json.dumps({
            "status": "success",
            "top_offenders": bad_actors,
            "total_sources_analyzed": len(bad_actors),
            "summary": f"Top {len(bad_actors)} bad actors identified with prescriptive recommendations."
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Bad actor analysis failed: {str(e)}"})


def get_alarm_health_summary(source_filter: str = None) -> str:
    """
    Get comprehensive health summary for alarm sources.
    Includes chattering, standing, stale, repeating classifications.
    
    Args:
        source_filter: Optional SQL LIKE pattern (e.g., "TI-%", "REACTOR%")
    
    Returns per-source breakdown with health status and action items.
    
    Example: get_alarm_health_summary("TI-%")
    """
    try:
        source_condition = ""
        if source_filter:
            source_condition = f"WHERE Source LIKE '{source_filter}'"
        
        conn = sqlite3.connect(DB_FILE)
        df = pd.read_sql_query(f"SELECT * FROM alerts {source_condition}", conn)
        conn.close()
        
        if df.empty:
            return json.dumps({"message": "No sources match the filter."})
        
        df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
        df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
        
        health_data = []
        for src, group in df.groupby("Source"):
            group = group.sort_values("Event Time")
            
            # State machine analysis
            state = "IDLE"
            unique_alarms = 0
            standing = 0
            stale = 0
            active_start = None
            last_alarm_time = None
            
            for _, row in group.iterrows():
                action = row["Action"]
                t = row["Event Time"]
                
                if action == "" and state in ["IDLE", "ACKED"]:
                    unique_alarms += 1
                    state = "ACTIVE"
                    active_start = t
                    # Check if stale (>60min since last alarm)
                    if last_alarm_time and (t - last_alarm_time).total_seconds() / 60 > 60:
                        stale += 1
                    last_alarm_time = t
                elif action == "ACK" and state == "ACTIVE":
                    if active_start and (t - active_start).total_seconds() / 60 > 60:
                        standing += 1
                    state = "ACKED"
                elif action == "OK":
                    state = "IDLE"
                    active_start = None
            
            # Health classification
            health_score = 100
            health_issues = []
            
            if standing > unique_alarms * 0.2:
                health_score -= 30
                health_issues.append("High standing alarms")
            if stale > unique_alarms * 0.3:
                health_score -= 25
                health_issues.append("Many stale alarms")
            if unique_alarms > 200:
                health_score -= 20
                health_issues.append("Excessive activations")
            
            if health_score >= 80:
                status = "HEALTHY"
            elif health_score >= 60:
                status = "MARGINAL"
            else:
                status = "UNHEALTHY"
            
            health_data.append({
                "Source": src,
                "Health_Status": status,
                "Health_Score": max(0, health_score),
                "Unique_Alarms": unique_alarms,
                "Standing_Alarms": standing,
                "Stale_Alarms": stale,
                "Issues": ", ".join(health_issues) if health_issues else "None"
            })
        
        # Summary statistics
        total_sources = len(health_data)
        healthy = sum(1 for h in health_data if h["Health_Status"] == "HEALTHY")
        marginal = sum(1 for h in health_data if h["Health_Status"] == "MARGINAL")
        unhealthy = sum(1 for h in health_data if h["Health_Status"] == "UNHEALTHY")
        
        return json.dumps({
            "status": "success",
            "summary": {
                "total_sources": total_sources,
                "healthy": healthy,
                "marginal": marginal,
                "unhealthy": unhealthy,
                "health_rate_pct": round((healthy / total_sources) * 100, 1) if total_sources > 0 else 0
            },
            "sources": sorted(health_data, key=lambda x: x["Health_Score"])[:20],  # Worst 20
            "prescription": f"Focus on {unhealthy} unhealthy sources first. Review standing and stale alarm configurations."
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Health summary failed: {str(e)}"})


def analyze_flood_events(min_sources: int = 2, time_period: str = "all") -> str:
    """
    Detect and analyze alarm flood events (multiple sources simultaneously unhealthy).
    Identifies root causes and contributing sources.
    
    Args:
        min_sources: Minimum sources involved to qualify as flood (default 2)
        time_period: "all", "last_30_days", "last_7_days", "last_24_hours"
    
    Returns flood periods with:
    - Flood start/end times
    - Sources involved and their contribution
    - Root cause analysis
    - Recommendations
    
    Example: analyze_flood_events(min_sources=3, time_period="last_7_days")
    """
    try:
        time_filter = ""
        if time_period == "last_30_days":
            time_filter = "WHERE datetime(\"Event Time\") >= datetime('now', '-30 days')"
        elif time_period == "last_7_days":
            time_filter = "WHERE datetime(\"Event Time\") >= datetime('now', '-7 days')"
        elif time_period == "last_24_hours":
            time_filter = "WHERE datetime(\"Event Time\") >= datetime('now', '-1 day')"
        
        conn = sqlite3.connect(DB_FILE)
        df = pd.read_sql_query(f"SELECT * FROM alerts {time_filter}", conn)
        conn.close()
        
        if df.empty:
            return json.dumps({"message": "No data for the selected period."})
        
        df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
        df["Action"] = df["Action"].fillna("").astype(str).str.upper().str.strip()
        
        # Get unique activations
        activations = []
        for src, group in df.groupby("Source"):
            state = "IDLE"
            for _, row in group.sort_values("Event Time").iterrows():
                action = row["Action"]
                t = row["Event Time"]
                if action == "" and state in ["IDLE", "ACKED"]:
                    activations.append({"Source": src, "Time": t})
                    state = "ACTIVE"
                elif action == "ACK":
                    state = "ACKED"
                elif action == "OK":
                    state = "IDLE"
        
        if not activations:
            return json.dumps({"message": "No alarm activations found."})
        
        act_df = pd.DataFrame(activations)
        
        # Detect 10-min windows with >= 10 alarms per source (unhealthy)
        window_minutes = 10
        unhealthy_periods = []
        for src, group in act_df.groupby("Source"):
            times = group["Time"].sort_values().tolist()
            for i in range(len(times)):
                window_end = times[i]
                window_start = window_end - pd.Timedelta(minutes=window_minutes)
                count = sum(1 for t in times if window_start <= t <= window_end)
                if count >= 10:
                    unhealthy_periods.append({
                        "Source": src,
                        "Start": window_start,
                        "End": window_end
                    })
        
        if not unhealthy_periods:
            return json.dumps({
                "status": "success",
                "flood_count": 0,
                "message": "No flood events detected in the period."
            })
        
        unh_df = pd.DataFrame(unhealthy_periods)
        
        # Find overlapping unhealthy periods (floods)
        floods = []
        for _, row in unh_df.iterrows():
            s1, e1 = row["Start"], row["End"]
            overlapping = unh_df[(unh_df["Start"] <= e1) & (unh_df["End"] >= s1)]
            sources = set(overlapping["Source"])
            if len(sources) >= min_sources:
                floods.append({
                    "Flood_Start": str(s1),
                    "Flood_End": str(e1),
                    "Sources_Involved": list(sources),
                    "Source_Count": len(sources)
                })
        
        # Deduplicate floods
        unique_floods = []
        seen = set()
        for f in floods:
            key = (f["Flood_Start"], f["Flood_End"])
            if key not in seen:
                seen.add(key)
                unique_floods.append(f)
        
        # Root cause analysis
        for flood in unique_floods[:10]:  # Top 10 floods
            sources = flood["Sources_Involved"]
            # Identify common location tags
            locations = df[df["Source"].isin(sources)]["Location Tag"].value_counts().head(3).to_dict() if "Location Tag" in df.columns else {}
            flood["Top_Locations"] = locations
            
            if len(set(locations.keys())) == 1:
                flood["Root_Cause"] = f"Localized issue in {list(locations.keys())[0]}"
                flood["Recommendation"] = "Investigate process upset or equipment failure in this location."
            else:
                flood["Root_Cause"] = "Plant-wide disturbance"
                flood["Recommendation"] = "Review process conditions, utility failures, or cascade effects."
        
        return json.dumps({
            "status": "success",
            "flood_count": len(unique_floods),
            "floods": unique_floods[:10],
            "summary": f"Detected {len(unique_floods)} flood events involving {min_sources}+ sources simultaneously."
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Flood analysis failed: {str(e)}"})


# ==================== TOOL REGISTRY ====================

AVAILABLE_TOOLS = [
    execute_sql_query,
    analyze_alarm_behavior,
    get_isa_compliance_report,
    analyze_bad_actors,
    get_alarm_health_summary,
    analyze_flood_events
]
