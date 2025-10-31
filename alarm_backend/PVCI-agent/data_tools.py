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

_PVCI_LOG_TOOL_PARAMS = os.getenv('PVCI_LOG_TOOL_PARAMS', '').strip().lower() in ('1','true','yes','y')

def _log_tool_params(func_name: str, params: dict):
    if not _PVCI_LOG_TOOL_PARAMS:
        return
    try:
        preview = {}
        for k, v in params.items():
            t = type(v).__name__
            try:
                s = str(v)
            except Exception:
                s = '<unprintable>'
            preview[k] = {"type": t, "preview": s[:160]}
        print(f"[PVCI][param-log] {func_name}: {json.dumps(preview)}")
    except Exception:
        try:
            print(f"[PVCI][param-log] {func_name}: <logging_failed>")
        except Exception:
            pass


# ==================== DOMAIN NOMENCLATURES ====================

# Descriptions for priority-like routing codes provided by user inputs
PRIORITY_DESCRIPTIONS: Dict[str, str] = {
    "H 00": "High priority, critical alarm",
    "H 15": "High priority (alternate route or group)",
    "J 00": "Journal entry or informational event",
    "J 15": "Journal with different routing",
    "L 00": "Low priority alarm",
    "U 00": "Utility or system-level alarm",
    "U 15": "Utility/system alarm (different routing)",
    "Journal": "Alarm without sound / buzzer",
    "None": "Unspecified/blank"
}

# Safe synonym lists we can reliably expand to dataset values for Priority
# Note: We keep expansions conservative to avoid misclassification.
PRIORITY_SYNONYMS: Dict[str, List[str]] = {
    # Canonical groups used in the dataset
    "CRITICAL": ["E", "U", "CRITICAL"],
    "HIGH": ["HIGH", "H"],
    "LOW": ["LOW", "L"],
    "JOURNAL": ["J", "J-CODED", "JCODED", "JOURNAL"],
    "UTILITY": ["U", "UTILITY", "SYSTEM"],
    # Mapped routing codes (best-effort suggestions)
    "H 00": ["H", "HIGH"],
    "H 15": ["H", "HIGH"],
    "J 00": ["J", "JOURNAL"],
    "J 15": ["J", "JOURNAL"],
    "L 00": ["L", "LOW"],
    "U 00": ["U", "UTILITY"],
    "U 15": ["U", "UTILITY"],
}

# Condition descriptions and selected synonym expansions to dataset-friendly values
CONDITION_DESCRIPTIONS: Dict[str, str] = {
    "ACTIVE": "The event/alarm condition is active (true) in the system.",
    "ALARM": "Alarm",
    "BAD PV": "Bad Process Variable",
    "BAD_COMPTERM": "Communication termination fault",
    "BADCTL": "Bad Control",
    "CHANGE": "Operator Action",
    "CHECKPOINT": "Redundancy sync or system backup event.",
    "CMDDIS": "Command disabled — manual or system lockout.",
    "CMFAIL": "Control module failure (hardware or execution failure).",
    "COLD START": "Controller powered up with full initialization.",
    "COMMS": "Communication error or loss detected.",
    "CONFIRMABLE MESSAGE": "Message requiring confirmation by user.",
    "DEVHI": "Deviation High",
    "DEVLOW": "Deviation Low",
    "DIAG": "Diagnostic alert.",
    "DISABL": "Block or function enabled/disabled by user or logic.",
    "DUPLICATE_INDEX": "Duplicate tag/index detected.",
    "ENABLE": "Block or function enabled/disabled by user or logic.",
    "EVENT": "General event logged by the system.",
    "FILREP": "File replication event between redundant servers.",
    "IDLE": "Device or block not active.",
    "INACTV": "The event/alarm condition has cleared or become inactive.",
    "IOPSWITCHOVER": "I/O redundancy switch occurred.",
    "LEVEL": "Level-related alarm or deviation.",
    "LOAD": "Controller module task state.",
    "MANCOMPERROR": "Manual control block error.",
    "MESSAGE": "Operator/system message logged.",
    "NETREDERROR": "Redundant network failure.",
    "OFFNET": "Node or device offline.",
    "OFFNRM": "Node back to normal network communication.",
    "OK": "Acknowledge/Returned to normal",
    "OPHIGH": "Controller output at upper limit.",
    "OPLOW": "Controller output at lower limit.",
    "POWRON": "Controller or node powered on.",
    "PVHI": "Process Variable High",
    "PVHIGH": "Process Variable High",
    "PVHIHI": "Process Variable High-High",
    "PVLL": "Process Variable Low Limit",
    "PVLO": "Process Variable Low",
    "PVLOW": "Process Variable Low",
    "PVLOLO": "Process Variable Low-Low",
    "RSHI": "Rate-of-change high",
    "RSLO": "Rate-of-change low",
    "RUN": "Controller state",
    "STATE": "State-based event",
    "SVCHG": "Service change — configuration change detected.",
    "SYNCH": "Synchronization of redundant controllers.",
    "UNCMD": "Uncommanded output change detected.",
    "WARM START": "Restart retaining previous state."
}

CONDITION_SYNONYMS: Dict[str, List[str]] = {
    # High side
    "PVHI": ["HI", "PVHI", "PVHIGH"],
    "PVHIGH": ["HI", "PVHI", "PVHIGH"],
    "PVHIHI": ["HIHI", "PVHIHI", "PVHIGHHIGH"],
    # Low side
    "PVLO": ["LO", "PVLO", "PVLOW"],
    "PVLOW": ["LO", "PVLO", "PVLOW"],
    "PVLOLO": ["LOLO", "PVLOLO", "PVLOWLOW"],
    # OK/clear
    "OK": ["OK"],
}

ACTION_DESCRIPTIONS: Dict[str, str] = {
    "ACK": "Acknowledged",
    "ACK PNT": "Acknowledged",
    "OK": "Returned to normal",
    "RESHELVE": "Shelve",
    "SHELVE": "Shelve",
    "UNSHELVE": "Removed from Shelve"
}

ACTION_SYNONYMS: Dict[str, List[str]] = {
    "ACK": ["ACK", "ACK PNT"],
    "OK": ["OK"],
    "SHELVE": ["SHELVE", "RESHELVE"],
    "UNSHELVE": ["UNSHELVE"]
}

# DCS tag prefix → meaning (subset; extendable)
DCS_TAGS: Dict[str, str] = {
    # Analyzer / Temperature / Flow / Pressure / Level families
    "AI": "Analyzer",
    "AIA": "Analyzer",
    "AIC": "Analyzer Controller",
    "AICA": "Analyzer Controller with Alarm",
    "AT": "Analyzer Transmitter",
    "AV": "Analog Valve / Air Valve",
    "AY": "Actuator",
    "CFA": "Control Flow Alarm",
    "CFB": "Control Flow Bypass",
    "CFC": "Control Flow Controller",
    "Chldet": "Chlorine Detector",
    "Chlorinedet": "Chlorine Gas Detector",
    "cm": "Centimeter",
    "FI": "Flow Indicator",
    "FIC": "Flow Indicating Controller",
    "FICA": "Flow Indicating Controller with Alarm",
    "FIR": "Flow Indicating Recorder",
    "FIT": "Flow Indicating Transmitter",
    "FT": "Flow Transmitter",
    "FQI": "Flow Quantity Indicator",
    "FIPP": "Flow Input Processing Point",
    "FIQ": "Flow Integrator",
    "FV": "Flow Valve / Flow Control Valve",
    "FCV": "Flow Control Valve",
    "FXV": "Fail-safe Control Valve",
    "FFIC": "Feed Flow Indicating Controller",
    "PI": "Pressure Indicator",
    "PIC": "Pressure Indicating Controller",
    "PICA": "Pressure Indicating Controller with Alarm",
    "PT": "Pressure Transmitter",
    "PTA": "Pressure Transmitter Alarm",
    "PAH": "Pressure Alarm High",
    "PALA": "Pressure Alarm Low Alarm",
    "PC": "Pressure Controller",
    "PDI": "Pressure Differential Indicator",
    "PDIA": "Pressure Differential Indicator Alarm",
    "PV": "Process Variable / Pressure Controller",
    "PIA": "Pressure Indicator Alarm",
    "LI": "Level Indicator",
    "LIA": "Level Indicator Alarm",
    "LIAS": "Level Indicator Alarm Switch",
    "LIC": "Level Indicating Controller",
    "LICA": "Level Indicating Controller with Alarm",
    "LT": "Level Transmitter",
    "LTC": "Low Temperature Chlorination reactor",
    "LV": "Level Valve",
    "LXV": "Level Control Valve (Manual/On-Off)",
    "Main": "Main Module / Primary System",
    "TI": "Temperature Indicator",
    "TIA": "Temperature Indicator Alarm",
    "TIC": "Temperature Indicating Controller",
    "TICA": "Temperature Indicating Controller with Alarm",
    "TT": "Temperature Transmitter",
    "TV": "Temperature Control Valve",
    "TDI": "Temperature Differential Indicator",

    # Valves / Discrete / Instruments
    "BV": "Block Valve",
    "XV": "On-Off Valve",
    "SV": "Solenoid Valve",
    "VI": "Visual Indicator",
    "XI": "Solenoid / On-Off Control",
    "ZI": "Vibration Indicator",
    "HS": "Hand Switch",
    "HV": "Hand Valve",

    # Digital/Analog IO
    "DI": "Digital Input",
    "DO": "Digital Output",
    "DP": "Differential Pressure",
    "DPI": "Differential Pressure Indicator",
    "DSQ": "Desuperheated Quench",
    "DUMMY": "Dummy",
    "AO": "Analog Output",
    "I": "Current Signal / Input",
    "II": "Interlock Input / Input Isolator",
    "IIAPC": "Input Interface for APC",
    "INC": "Increment / Incremental Control",
    "INTLOCK": "Interlock",
    "RTD": "Resistance Temperature Detector",

    # Control & Systems
    "APC": "Advanced Process Control",
    "BMS": "Burner Management System",
    "SCM": "System Control Module",
    "SYSMGT": "System Management",
    "OPC": "OPC Interface",
    "OVR": "OVR reactor",
    "OXY": "OXY reactor",
    "PRIMARY": "Primary Controller / Module",
    "Standard": "Standard Control Template",
    "GROUP": "Group Logic",
    "GRSCR": "Group Script / Sequence Control",
    "QSCA": "Quick Scan A",
    "QSCB": "Quick Scan B",
    "QSCC": "Quick Scan C",

    # Mechanical / Equipment
    "B": "Blower",
    "BL": "Blower",
    "FD": "Flame Detector",
    "FDA": "Flame Detector Assembly",
    "FDS": "Fire Detection System",
    "HF": "High Flow",
    "HIC": "Hand Indicating Controller",
    "FLAME": "Flame Detector",
    "FLAMEB": "Flame Backup Detector",
    "GR": "Chiller",
    "Heads": "Motor / Compressor Heads",
    "MCC": "Motor Control Center",
    "PP": "Pump",

    # Facilities / Networks / Modules
    "CA": "Control Air / Compressor Air",
    "CDA": "Clean Dry Air",
    "NDM": "Network Device Module",
    "NP": "Network Port",
    "IOLINK": "Input/Output Link",
    "Redundant": "Redundant Controller / Pair Module",
    "Server": "DCS Server Node",
    "STATION": "Operator Station",
    "STS": "Status Signal",
    "CONSOLE": "Operator Console",

    # Process Units / Special
    "FURNACE": "Furnace",
    "HCLC": "High Concentration Level Controller",
    "HTDC": "High Temperature Direct Chlorination reactor",
    "HTDCSHELTER": "Heat Detector Control Shelter",
    "OVR": "OVR reactor",
    "OXY": "OXY reactor",
    "SOP": "Seal Oil Pot",
    "SP": "Set Point",
    "VCLC": "Valve Control Logic Controller",

    # Misc / System
    "ALARMS": "Alarm",
    "Aux": "Auxiliary",
    "File": "System File Reference",
    "Filerep": "File Report",
    "Inventory": "Inventory (Mass/Volume) Module",
    "Module": "Module",
    "Printer": "System Printer",
    "PSH": "Pressure Switch High",
    "System": "DCS System Module",
    "TREND": "Trend Display",
    "DBN": "Debottlenecking",
    "Fast": "Fast Scan / Fast Response Loop",
    "OPC": "OLE for Process Control Interface",
    "test": "Test Tag"
}


def get_data_max_date():
    """Get the maximum date from the alerts database (for relative date calculations)."""
    try:
        conn = sqlite3.connect(DB_FILE)
        result = pd.read_sql_query("SELECT MAX(\"Event Time\") as max_date FROM alerts", conn)
        conn.close()
        max_date = result['max_date'].iloc[0]
        return max_date if max_date else "datetime('now')"
    except:
        return "datetime('now')"  # Fallback to 'now' if query fails


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
        # Routing codes and journal keyword
        rep(r"\bPRIORITY\b\s*=\s*'H\s*00'", "UPPER(\"Priority\") IN ('HIGH','H')")
        rep(r"\bPRIORITY\b\s*=\s*'H\s*15'", "UPPER(\"Priority\") IN ('HIGH','H')")
        rep(r"\bPRIORITY\b\s*=\s*'L\s*00'", "UPPER(\"Priority\") IN ('LOW','L')")
        rep(r"\bPRIORITY\b\s*=\s*'J\s*00'", "UPPER(\"Priority\") IN ('J','J-CODED','JCODED')")
        rep(r"\bPRIORITY\b\s*=\s*'J\s*15'", "UPPER(\"Priority\") IN ('J','J-CODED','JCODED')")
        rep(r"\bPRIORITY\b\s*=\s*'U\s*00'", "UPPER(\"Priority\") IN ('U','UTILITY','SYSTEM')")
        rep(r"\bPRIORITY\b\s*=\s*'U\s*15'", "UPPER(\"Priority\") IN ('U','UTILITY','SYSTEM')")
        rep(r"\bPRIORITY\b\s*=\s*'JOURNAL'", "UPPER(\"Priority\") IN ('J','J-CODED','JCODED','JOURNAL')")
        return s
    except Exception:
        return sql

def _normalize_condition_literals(sql: str) -> str:
    """
    Normalize common Condition literals to canonical IN(...) lists for robustness.
    Examples:
      UPPER("Condition") = 'HI'   -> IN ('HI','PVHI','PVHIGH')
      Condition = 'HIHI'           -> IN ('HIHI','PVHIHI','PVHIGHHIGH')
      UPPER(Condition) LIKE 'LO'   -> IN ('LO','PVLO','PVLOW')
    """
    try:
        s = sql
        def rep(pattern: str, replacement: str) -> None:
            nonlocal s
            s = re.sub(pattern, replacement, s, flags=re.IGNORECASE)

        # HI family
        rep(r"UPPER\(\s*\"?CONDITION\"?\s*\)\s*=\s*'HI'", "UPPER(\"Condition\") IN ('HI','PVHI','PVHIGH')")
        rep(r"\bCONDITION\b\s*=\s*'HI'", "UPPER(\"Condition\") IN ('HI','PVHI','PVHIGH')")
        rep(r"\bCONDITION\b\s+LIKE\s+'HI'", "UPPER(\"Condition\") IN ('HI','PVHI','PVHIGH')")

        # HIHI family
        rep(r"UPPER\(\s*\"?CONDITION\"?\s*\)\s*=\s*'HIHI'", "UPPER(\"Condition\") IN ('HIHI','PVHIHI','PVHIGHHIGH')")
        rep(r"\bCONDITION\b\s*=\s*'HIHI'", "UPPER(\"Condition\") IN ('HIHI','PVHIHI','PVHIGHHIGH')")

        # LO family
        rep(r"UPPER\(\s*\"?CONDITION\"?\s*\)\s*=\s*'LO'", "UPPER(\"Condition\") IN ('LO','PVLO','PVLOW')")
        rep(r"\bCONDITION\b\s*=\s*'LO'", "UPPER(\"Condition\") IN ('LO','PVLO','PVLOW')")
        rep(r"\bCONDITION\b\s+LIKE\s+'LO'", "UPPER(\"Condition\") IN ('LO','PVLO','PVLOW')")

        # LOLO family
        rep(r"UPPER\(\s*\"?CONDITION\"?\s*\)\s*=\s*'LOLO'", "UPPER(\"Condition\") IN ('LOLO','PVLOLO','PVLOWLOW')")
        rep(r"\bCONDITION\b\s*=\s*'LOLO'", "UPPER(\"Condition\") IN ('LOLO','PVLOLO','PVLOWLOW')")

        # OK
        rep(r"UPPER\(\s*\"?CONDITION\"?\s*\)\s*=\s*'OK'", "UPPER(\"Condition\") IN ('OK')")
        rep(r"\bCONDITION\b\s*=\s*'OK'", "UPPER(\"Condition\") IN ('OK')")

        return s
    except Exception:
        return sql

def _normalize_action_literals(sql: str) -> str:
    """
    Normalize Action synonyms (e.g., ACK PNT -> ACK; RESHELVE -> SHELVE).
    """
    try:
        s = sql
        def rep(pattern: str, replacement: str) -> None:
            nonlocal s
            s = re.sub(pattern, replacement, s, flags=re.IGNORECASE)

        rep(r"UPPER\(\s*\"?ACTION\"?\s*\)\s*=\s*'ACK PNT'", "UPPER(\"Action\") IN ('ACK','ACK PNT')")
        rep(r"\bACTION\b\s*=\s*'ACK PNT'", "UPPER(\"Action\") IN ('ACK','ACK PNT')")
        rep(r"UPPER\(\s*\"?ACTION\"?\s*\)\s*=\s*'RESHELVE'", "UPPER(\"Action\") IN ('SHELVE','RESHELVE')")
        rep(r"\bACTION\b\s*=\s*'RESHELVE'", "UPPER(\"Action\") IN ('SHELVE','RESHELVE')")
        return s
    except Exception:
        return sql

def normalize_query_literals(sql: str) -> str:
    """Apply all safe literal normalizations (priority, condition, action)."""
    sql = _normalize_priority_literals(sql)
    sql = _normalize_condition_literals(sql)
    sql = _normalize_action_literals(sql)
    return sql

def lookup_nomenclature(term: str) -> str:
    """
    Look up a domain term across Priority/Condition/Action/DCS dictionaries.
    Returns JSON with matches and suggested canonical forms.
    """
    try:
        t = (term or "").strip().upper()
        results = {"term": term, "matches": {}}

        # Priority
        p_matches = []
        for key, desc in PRIORITY_DESCRIPTIONS.items():
            if t == key.upper():
                p_matches.append({"code": key, "description": desc, "maps_to": PRIORITY_SYNONYMS.get(key, [])})
        for canon, syns in PRIORITY_SYNONYMS.items():
            if t == canon.upper() or t in [s.upper() for s in syns]:
                p_matches.append({"group": canon, "synonyms": syns})
        if p_matches:
            results["matches"]["priority"] = p_matches

        # Condition
        c_matches = []
        for key, desc in CONDITION_DESCRIPTIONS.items():
            if t == key.upper():
                c_matches.append({"code": key, "description": desc, "synonyms": CONDITION_SYNONYMS.get(key, [])})
        for canon, syns in CONDITION_SYNONYMS.items():
            if t == canon.upper() or t in [s.upper() for s in syns]:
                c_matches.append({"group": canon, "synonyms": syns})
        if c_matches:
            results["matches"]["condition"] = c_matches

        # Action
        a_matches = []
        for key, desc in ACTION_DESCRIPTIONS.items():
            if t == key.upper():
                a_matches.append({"code": key, "description": desc, "synonyms": ACTION_SYNONYMS.get(key, [])})
        for canon, syns in ACTION_SYNONYMS.items():
            if t == canon.upper() or t in [s.upper() for s in syns]:
                a_matches.append({"group": canon, "synonyms": syns})
        if a_matches:
            results["matches"]["action"] = a_matches

        # DCS tag by prefix (e.g., TI-101)
        dcs = []
        for prefix, meaning in DCS_TAGS.items():
            if t == prefix or t.startswith(prefix + "-"):
                dcs.append({"prefix": prefix, "meaning": meaning})
        if dcs:
            results["matches"]["dcs_tag"] = dcs

        if not results["matches"]:
            results["message"] = "No nomenclature matches found."

        return json.dumps(results, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Lookup failed: {str(e)}"})

def execute_sql_query(sql_query: str) -> str:
    """
    Executes a read-only SQL query (SELECT) against the 'alerts' database table.
    Returns JSON with data, metadata, and helpful error messages.
    """
    try:
        # Normalize literals (Priority/Condition/Action) to improve matching
        sql_query = normalize_query_literals(sql_query)
        
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
        sql_query = normalize_query_literals(sql_query)
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
        # Build time filter using actual data's max date
        conn = sqlite3.connect(DB_FILE)
        max_date = get_data_max_date()
        
        time_filter = ""
        if time_period == "last_30_days":
            time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-30 days')"
        elif time_period == "last_7_days":
            time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-7 days')"
        elif time_period == "last_24_hours":
            time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-1 day')"
        
        sql = f"SELECT * FROM alerts {time_filter}"
        df = pd.read_sql_query(sql, conn)
        conn.close()
        
        if df.empty:
            return json.dumps({"message": "No data available for the selected period."})
        
        # Calculate unique alarm activations using state machine
        df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
        df["Action"] = (
            df["Action"].fillna("").astype(str).str.upper().str.strip()
            .replace({"NAN": "", "NULL": "", "NONE": "", "ACK PNT": "ACK"})
        )
        
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


def analyze_bad_actors(top_n: int = 10, min_alarms: int = 50, time_period: str = "all", start_date: str = None, end_date: str = None) -> str:
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
    Time Filters (use either):
      - time_period: one of "all", "last_30_days", "last_7_days", "last_24_hours"
      - start_date/end_date: explicit ISO strings (e.g., "2025-01-01", "2025-01-31")
    """
    try:
        if not isinstance(top_n, int):
            try:
                top_n = int(top_n)
            except Exception:
                top_n = 10
        if not isinstance(min_alarms, int):
            try:
                min_alarms = int(min_alarms)
            except Exception:
                min_alarms = 50
        conn = sqlite3.connect(DB_FILE)
        max_date = get_data_max_date()
        # Build time filter
        time_filter = ""
        if start_date and end_date:
            time_filter = f'WHERE datetime("Event Time") BETWEEN datetime(\'{start_date}\') AND datetime(\'{end_date}\')'
        else:
            if time_period == "last_30_days":
                time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-30 days')"
            elif time_period == "last_7_days":
                time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-7 days')"
            elif time_period == "last_24_hours":
                time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-1 day')"
        
        sql = f"SELECT * FROM alerts {time_filter}"
        df = pd.read_sql_query(sql, conn)
        conn.close()
        
        if df.empty:
            return json.dumps({"message": "No data available."})
        
        df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
        df["Action"] = (
            df["Action"].fillna("").astype(str).str.upper().str.strip()
            .replace({"NAN": "", "NULL": "", "NONE": "", "ACK PNT": "ACK"})
        )
        
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
            "summary": f"Top {len(bad_actors)} bad actors identified with prescriptive recommendations.",
            "filters": {
                "time_period": time_period,
                "start_date": start_date,
                "end_date": end_date
            }
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
        df["Action"] = (
            df["Action"].fillna("").astype(str).str.upper().str.strip()
            .replace({"NAN": "", "NULL": "", "NONE": "", "ACK PNT": "ACK"})
        )
        
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


def analyze_flood_events(min_sources: int = 2, time_period: str = "all", start_date: str = None, end_date: str = None, summary_by_month: bool = False) -> str:
    """
    Detect and analyze alarm flood events (multiple sources simultaneously unhealthy).
    Identifies root causes and contributing sources.
    
    Args:
        min_sources: Minimum sources involved to qualify as flood (default 2)
        time_period: "all", "last_30_days", "last_7_days", "last_24_hours"
        start_date, end_date: Optional explicit ISO date strings to filter events (overrides time_period if both provided)
        summary_by_month: If True, include monthly flood counts and top contributing sources per month
    
    Returns flood periods with:
    - Flood start/end times
    - Sources involved and their contribution
    - Root cause analysis
    - Recommendations
    
    Example: analyze_flood_events(min_sources=3, time_period="last_7_days")
    """
    _log_tool_params("analyze_flood_events", {
        "min_sources": min_sources,
        "time_period": time_period,
        "start_date": start_date,
        "end_date": end_date,
        "summary_by_month": summary_by_month,
    })
    try:
        if not isinstance(min_sources, int):
            try:
                min_sources = int(min_sources)
            except Exception:
                min_sources = 2
        if isinstance(summary_by_month, str):
            summary_by_month = summary_by_month.strip().lower() in ('1','true','yes','y')
        conn = sqlite3.connect(DB_FILE)
        max_date = get_data_max_date()
        
        time_filter = ""
        if start_date and end_date:
            time_filter = f'WHERE datetime("Event Time") BETWEEN datetime(\'{start_date}\') AND datetime(\'{end_date}\')'
        else:
            if time_period == "last_30_days":
                time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-30 days')"
            elif time_period == "last_7_days":
                time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-7 days')"
            elif time_period == "last_24_hours":
                time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-1 day')"
        
        df = pd.read_sql_query(f"SELECT * FROM alerts {time_filter}", conn)
        conn.close()
        
        if df.empty:
            return json.dumps({"message": "No data for the selected period."})
        
        df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
        df["Action"] = (
            df["Action"].fillna("").astype(str).str.upper().str.strip()
            .replace({"NAN": "", "NULL": "", "NONE": "", "ACK PNT": "ACK"})
        )
        
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
        
        response = {
            "status": "success",
            "flood_count": len(unique_floods),
            "floods": unique_floods[:10],
            "summary": f"Detected {len(unique_floods)} flood events involving {min_sources}+ sources simultaneously.",
            "filters": {
                "time_period": time_period,
                "start_date": start_date,
                "end_date": end_date
            }
        }

        if summary_by_month and unique_floods:
            # Monthly counts and top contributing sources per month
            month_counts: Dict[str, int] = {}
            month_sources: Dict[str, Dict[str, int]] = {}
            act_df = pd.DataFrame(activations)
            act_df["Time"] = pd.to_datetime(act_df["Time"], errors="coerce")
            for f in unique_floods:
                s = pd.to_datetime(f["Flood_Start"]) 
                e = pd.to_datetime(f["Flood_End"]) 
                month_key = s.strftime("%Y-%m")
                month_counts[month_key] = month_counts.get(month_key, 0) + 1
                # Contributions in this flood window
                acts = act_df[(act_df["Time"] >= s) & (act_df["Time"] <= e)]
                counts = acts["Source"].value_counts().to_dict()
                if month_key not in month_sources:
                    month_sources[month_key] = {}
                for src, cnt in counts.items():
                    month_sources[month_key][src] = month_sources[month_key].get(src, 0) + cnt

            monthly_summary = []
            for m in sorted(month_counts.keys()):
                top = sorted(month_sources.get(m, {}).items(), key=lambda x: x[1], reverse=True)[:10]
                monthly_summary.append({
                    "month": m,
                    "flood_count": month_counts[m],
                    "top_sources": [{"Source": s, "Alarm_Activations": c} for s, c in top]
                })
            response["monthly_summary"] = monthly_summary

        return json.dumps(response, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Flood analysis failed: {str(e)}"})


def analyze_flood_events_raw(min_sources: int = 2, time_window_minutes: int = 10, time_period: str = "all") -> str:
    """
    Analyze flood events using RAW EVENT COUNTING (no state machine required).
    
    Works with ANY data pattern - counts all events per source per time window.
    Flood = Multiple sources alarming simultaneously within a time window.
    
    Args:
        min_sources: Minimum sources to qualify as flood (default 2)
        time_window_minutes: Window size in minutes (default 10)
        time_period: "all", "last_30_days", "last_7_days", "last_24_hours"
    
    Example: analyze_flood_events_raw(min_sources=3, time_period="last_7_days")
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        max_date = get_data_max_date()
        
        time_filter = ""
        if time_period == "last_30_days":
            time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-30 days')"
        elif time_period == "last_7_days":
            time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-7 days')"
        elif time_period == "last_24_hours":
            time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-1 day')"
        
        df = pd.read_sql_query(f"SELECT \"Event Time\", Source FROM alerts {time_filter}", conn)
        conn.close()
        
        if df.empty:
            return json.dumps({"status": "no_data", "message": f"No events found for {time_period}"})
        
        df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
        df = df.dropna(subset=["Event Time"])
        df["time_window"] = df["Event Time"].dt.floor(f'{time_window_minutes}min')
        
        window_source_counts = df.groupby(["time_window", "Source"]).size().reset_index(name='event_count')
        window_stats = window_source_counts.groupby("time_window").agg({
            'Source': 'count',
            'event_count': 'sum'
        }).reset_index()
        window_stats.columns = ['time_window', 'source_count', 'total_events']
        
        flood_windows = window_stats[window_stats['source_count'] >= min_sources].sort_values('source_count', ascending=False)
        
        if flood_windows.empty:
            return json.dumps({
                "status": "no_floods",
                "message": f"No floods with {min_sources}+ sources in {time_window_minutes}-min windows"
            })
        
        floods_detailed = []
        for _, flood in flood_windows.head(20).iterrows():
            window_time = flood['time_window']
            window_sources = window_source_counts[window_source_counts['time_window'] == window_time]
            top_sources = window_sources.nlargest(10, 'event_count')[['Source', 'event_count']].to_dict(orient='records')
            
            floods_detailed.append({
                "window_start": str(window_time),
                "window_end": str(window_time + pd.Timedelta(minutes=time_window_minutes)),
                "sources_involved": int(flood['source_count']),
                "total_events": int(flood['total_events']),
                "top_sources": top_sources,
                "severity": "critical" if flood['source_count'] >= min_sources * 2 else "high"
            })
        
        return json.dumps({
            "status": "success",
            "flood_count": len(flood_windows),
            "floods": floods_detailed,
            "summary": f"Detected {len(flood_windows)} flood windows"
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Flood analysis failed: {str(e)}"})


def get_isa_compliance_raw(time_period: str = "all") -> str:
    """
    Calculate ISA-18.2 compliance using RAW EVENT COUNTING (no state machine).
    
    ISA-18.2: Maximum 288 alarms per day per operator (12 per hour).
    
    Args:
        time_period: "all", "last_30_days", "last_7_days", "last_24_hours"
    
    Example: get_isa_compliance_raw("last_30_days")
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        max_date = get_data_max_date()
        
        time_filter = ""
        if time_period == "last_30_days":
            time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-30 days')"
        elif time_period == "last_7_days":
            time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-7 days')"
        elif time_period == "last_24_hours":
            time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-1 day')"
        
        df = pd.read_sql_query(f'SELECT "Event Time" FROM alerts {time_filter}', conn)
        conn.close()
        
        if df.empty:
            return json.dumps({"status": "no_data"})
        
        df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
        df["date"] = df["Event Time"].dt.date.astype(str)  # Convert to string for JSON
        daily_counts = df.groupby("date").size().reset_index(name='alarm_count')
        
        iso_threshold = 288
        days_over_288 = daily_counts[daily_counts['alarm_count'] > iso_threshold]
        days_over_720 = daily_counts[daily_counts['alarm_count'] >= 720]
        
        avg_per_day = daily_counts['alarm_count'].mean()
        compliance_pct = round((1 - len(days_over_288) / len(daily_counts)) * 100, 2) if len(daily_counts) > 0 else 100
        
        return json.dumps({
            "status": "success",
            "time_period": time_period,
            "total_days": len(daily_counts),
            "avg_alarms_per_day": round(avg_per_day, 2),
            "days_over_288": len(days_over_288),
            "days_over_720": len(days_over_720),
            "compliance_percentage": compliance_pct,
            "compliance_status": "compliant" if compliance_pct >= 80 else "non_compliant",
            "top_10_worst_days": daily_counts.nlargest(10, 'alarm_count').to_dict(orient='records')
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": f"ISA compliance failed: {str(e)}"})


def get_bad_actors_raw(top_n: int = 20, time_period: str = "all", min_events: int = 100) -> str:
    """
    Identify bad actor sources using RAW EVENT COUNTING.
    
    Bad actors = sources with excessive alarm events.
    
    Args:
        top_n: Number of top bad actors (default 20)
        time_period: "all", "last_30_days", "last_7_days"
        min_events: Minimum events to qualify (default 100)
    
    Example: get_bad_actors_raw(top_n=10, time_period="last_30_days")
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        max_date = get_data_max_date()
        
        time_filter = ""
        if time_period == "last_30_days":
            time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-30 days')"
        elif time_period == "last_7_days":
            time_filter = f"WHERE datetime(\"Event Time\") >= datetime('{max_date}', '-7 days')"
        
        df = pd.read_sql_query(f"""
            SELECT Source, COUNT(*) as event_count,
                   COUNT(DISTINCT date("Event Time")) as days_active
            FROM alerts {time_filter}
            GROUP BY Source
            HAVING event_count >= {min_events}
            ORDER BY event_count DESC
            LIMIT {top_n}
        """, conn)
        conn.close()
        
        if df.empty:
            return json.dumps({"status": "no_bad_actors"})
        
        total_events = df['event_count'].sum()
        df['percentage'] = round(df['event_count'] / total_events * 100, 2)
        df['events_per_day'] = round(df['event_count'] / df['days_active'], 2)
        
        return json.dumps({
            "status": "success",
            "bad_actor_count": len(df),
            "bad_actors": df.to_dict(orient='records'),
            "summary": f"Found {len(df)} bad actors with {total_events:,} events"
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Bad actor analysis failed: {str(e)}"})


# ==================== TOOL REGISTRY ====================

AVAILABLE_TOOLS = [
    # Original 6 tools
    execute_sql_query,
    analyze_alarm_behavior,
    get_isa_compliance_report,
    analyze_bad_actors,
    get_alarm_health_summary,
    analyze_flood_events,
    # Phase 1: New analysis tools
    # Nomenclature helper
    # Phase 1 Fix: Event-based tools (work with ANY data pattern)
    analyze_flood_events_raw,
    get_isa_compliance_raw,
    get_bad_actors_raw
]
