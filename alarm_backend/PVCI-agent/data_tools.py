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


# ==================== TOOL REGISTRY ====================

AVAILABLE_TOOLS = [
    execute_sql_query,
    analyze_alarm_behavior
]
