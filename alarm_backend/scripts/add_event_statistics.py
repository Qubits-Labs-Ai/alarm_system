"""
Add Event Statistics to Corrected JSON

This adds a comprehensive breakdown of:
1. Total records = Actual alarms + Events
2. Event types (ACK, OK, SHELVE, etc.)
3. Condition types (BAD PV, CHANGE, NORMAL, RTN, etc.)
4. Percentages and comparisons

For dashboard stats cards
"""

import os
import sys
import json
import logging
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# Add parent directory to path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import PVCI_FOLDER
from isa18_csv_reader import ISA18Config, ALARM_CONDITIONS, OPERATOR_ACTIONS, SYSTEM_EVENTS, NON_ALARM_CONDITIONS
from isa18_flood_monitor import _list_csv_files

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def analyze_all_records_with_event_stats(folder_path: str):
    """
    Analyze ALL records (alarms + events) and provide detailed statistics.
    
    Returns:
        dict with event_statistics section
    """
    import pandas as pd
    
    logger.info("Analyzing all records (alarms + events) for statistics...")
    
    config = ISA18Config()
    files = _list_csv_files(folder_path)
    
    # Statistics counters
    total_records = 0
    actual_alarms = 0
    events = 0
    
    # Event type breakdown
    by_action = defaultdict(int)  # ACK, OK, SHELVE, etc.
    by_condition = defaultdict(int)  # ALARM, HI, LO, BAD PV, CHANGE, etc.
    
    # For detailed classification
    alarm_conditions = set()
    event_conditions = set()
    
    for fp in files:
        try:
            # Read ALL rows (not filtered)
            # Use same approach as ISA18 CSV reader
            df = pd.read_csv(
                fp,
                skiprows=config.skip_rows,  # Skip header rows (8 by default)
                encoding='utf-8',
                on_bad_lines='skip',
                engine='python'
            )
            
            if df.empty:
                continue
            
            # Clean up
            df['Action'] = df['Action'].fillna('').astype(str).str.strip()
            df['Condition'] = df['Condition'].fillna('').astype(str).str.strip()
            df['Source'] = df['Source'].fillna('').astype(str).str.strip()
            
            # Remove empty sources
            df = df[df['Source'] != '']
            
            total_records += len(df)
            
            # Classify each row
            for _, row in df.iterrows():
                action = row['Action']
                condition = row['Condition']
                
                # Count by action
                if action:
                    by_action[action] += 1
                else:
                    by_action['(blank)'] += 1
                
                # Count by condition
                if condition:
                    by_condition[condition] += 1
                else:
                    by_condition['(blank)'] += 1
                
                # Classify as alarm or event
                is_alarm = _is_actual_alarm(action, condition)
                
                if is_alarm:
                    actual_alarms += 1
                    alarm_conditions.add(condition)
                else:
                    events += 1
                    event_conditions.add(condition)
        
        except Exception as e:
            logger.warning(f"Error reading {fp}: {e}")
            continue
    
    logger.info(f"Analysis complete: {total_records:,} total records")
    if total_records > 0:
        logger.info(f"  - {actual_alarms:,} actual alarms ({actual_alarms/total_records*100:.1f}%)")
        logger.info(f"  - {events:,} events ({events/total_records*100:.1f}%)")
    else:
        logger.warning("No records found to analyze")
    
    # Build result
    result = {
        'summary': {
            'total_records': total_records,
            'actual_alarms': actual_alarms,
            'actual_alarms_pct': round(actual_alarms / total_records * 100, 2) if total_records > 0 else 0,
            'events': events,
            'events_pct': round(events / total_records * 100, 2) if total_records > 0 else 0,
        },
        'by_action': {
            'summary': {
                'total_action_types': len(by_action),
                'top_actions': sorted(by_action.items(), key=lambda x: x[1], reverse=True)[:10],
            },
            'operator_actions': _classify_operator_actions(by_action),
            'all_actions': dict(sorted(by_action.items(), key=lambda x: x[1], reverse=True)),
        },
        'by_condition': {
            'summary': {
                'total_condition_types': len(by_condition),
                'alarm_conditions': sorted(list(alarm_conditions)),
                'event_conditions': sorted(list(event_conditions)),
            },
            'breakdown': _classify_conditions(by_condition),
            'all_conditions': dict(sorted(by_condition.items(), key=lambda x: x[1], reverse=True)),
        },
        'classification_rules': {
            'actual_alarm_criteria': 'Action is blank AND Condition is alarm-related (ALARM, HI, LO, HIHI, LOLO, etc.)',
            'event_criteria': 'Action is not blank (ACK, OK, SHELVE, etc.) OR Condition is non-alarm (CHANGE, NORMAL, RTN, BAD PV, etc.)',
        },
        'metadata': {
            'analyzed_at': datetime.now().isoformat(),
            'folder': folder_path,
            'files_analyzed': len(files),
        }
    }
    
    return result


def _is_actual_alarm(action: str, condition: str) -> bool:
    """
    Determine if a record is an actual alarm or an event.
    
    ISA 18.2 Standard Classification (same as ISA18Config):
    - Actual Alarm: Blank/empty action AND condition in ALARM_CONDITIONS set
    - Event: Non-blank action OR condition in OPERATOR_ACTIONS/SYSTEM_EVENTS/NON_ALARM_CONDITIONS
    """
    action_str = str(action).strip()
    condition_str = str(condition).strip()
    
    # Rule 1: If action is present (not blank/null), it's an operator action = NOT an alarm
    if action_str and action_str != '(blank)':
        return False
    
    # Rule 2: Check if condition is a recognized alarm condition
    if condition_str in ALARM_CONDITIONS:
        return True
    
    # Rule 3: Check if condition is operator action, system event, or non-alarm condition
    if (condition_str in OPERATOR_ACTIONS or 
        condition_str in SYSTEM_EVENTS or 
        condition_str in NON_ALARM_CONDITIONS):
        return False
    
    # Default: unknown conditions are NOT considered alarms (strict mode)
    return False


def _classify_operator_actions(by_action: dict) -> dict:
    """Classify actions into operator action types."""
    acknowledgements = {}
    resets = {}
    shelve_ops = {}
    other_ops = {}
    
    for action, count in by_action.items():
        action_upper = action.upper()
        
        if 'ACK' in action_upper:
            acknowledgements[action] = count
        elif 'OK' in action_upper or 'RESET' in action_upper or 'CLR' in action_upper:
            resets[action] = count
        elif 'SHELVE' in action_upper or 'SUPPRESS' in action_upper:
            shelve_ops[action] = count
        elif action != '(blank)':
            other_ops[action] = count
    
    return {
        'acknowledgements': {
            'count': sum(acknowledgements.values()),
            'types': acknowledgements,
        },
        'resets': {
            'count': sum(resets.values()),
            'types': resets,
        },
        'shelve_suppress': {
            'count': sum(shelve_ops.values()),
            'types': shelve_ops,
        },
        'other': {
            'count': sum(other_ops.values()),
            'types': other_ops,
        },
    }


def _classify_conditions(by_condition: dict) -> dict:
    """Classify conditions into alarm vs event types."""
    alarm_conditions = {}
    state_changes = {}
    quality_issues = {}
    other_conditions = {}
    
    for cond, count in by_condition.items():
        cond_upper = cond.upper()
        
        # Alarm conditions
        if any(kw in cond_upper for kw in ['ALARM', 'HI', 'LO', 'HIGH', 'LOW', 'URGENT', 'CRITICAL']):
            alarm_conditions[cond] = count
        # State changes
        elif any(kw in cond_upper for kw in ['CHANGE', 'NORMAL', 'RTN', 'RETURN']):
            state_changes[cond] = count
        # Quality/communication issues
        elif any(kw in cond_upper for kw in ['BAD', 'COMM', 'DISABLED', 'FAIL']):
            quality_issues[cond] = count
        else:
            other_conditions[cond] = count
    
    return {
        'alarm_conditions': {
            'count': sum(alarm_conditions.values()),
            'types': alarm_conditions,
        },
        'state_changes': {
            'count': sum(state_changes.values()),
            'types': state_changes,
        },
        'quality_issues': {
            'count': sum(quality_issues.values()),
            'types': quality_issues,
        },
        'other': {
            'count': sum(other_conditions.values()),
            'types': other_conditions,
        },
    }


def add_event_stats_to_corrected_json():
    """Add event statistics to the corrected JSON file."""
    
    print("\n" + "="*80)
    print("  ADDING EVENT STATISTICS TO CORRECTED JSON")
    print("="*80)
    print()
    
    # Load existing corrected JSON
    json_path = os.path.join(ROOT, 'PVCI-overall-health', 'isa18-flood-summary-CORRECTED-ENHANCED.json')
    
    if not os.path.exists(json_path):
        print(f"❌ ERROR: Corrected JSON not found: {json_path}")
        return
    
    print(f"📂 Loading: {os.path.basename(json_path)}")
    
    with open(json_path, 'r', encoding='utf-8') as f:
        corrected_data = json.load(f)
    
    print(f"✅ Loaded corrected JSON")
    print()
    
    # Analyze all records for event statistics
    print("🔄 Analyzing all records (alarms + events)...")
    event_stats = analyze_all_records_with_event_stats(PVCI_FOLDER)
    
    print()
    print("📊 Event Statistics Summary:")
    summary = event_stats['summary']
    print(f"   Total records:     {summary['total_records']:,}")
    print(f"   Actual alarms:     {summary['actual_alarms']:,} ({summary['actual_alarms_pct']:.1f}%)")
    print(f"   Events:            {summary['events']:,} ({summary['events_pct']:.1f}%)")
    print()
    
    # Add to corrected JSON
    corrected_data['event_statistics'] = event_stats
    
    # Save updated JSON
    print("💾 Saving updated JSON with event statistics...")
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(corrected_data, f, ensure_ascii=False, indent=2)
    
    # Also update API file
    api_path = os.path.join(ROOT, 'PVCI-overall-health', 'isa18-flood-summary-enhanced.json')
    with open(api_path, 'w', encoding='utf-8') as f:
        json.dump(corrected_data, f, ensure_ascii=False, indent=2)
    
    file_size_kb = os.path.getsize(json_path) / 1024
    
    print(f"✅ Updated file size: {file_size_kb:.1f} KB")
    print()
    
    print("="*80)
    print("  ✅ EVENT STATISTICS ADDED SUCCESSFULLY!")
    print("="*80)
    print()
    
    print("📋 What's Added:")
    print("   • event_statistics.summary - Total breakdown")
    print("   • event_statistics.by_action - Operator actions (ACK, OK, etc.)")
    print("   • event_statistics.by_condition - Condition types (BAD PV, CHANGE, etc.)")
    print("   • Classification rules - How alarms vs events are determined")
    print()
    
    print("🎯 Frontend Can Now Display:")
    print("   • Stats card: Total records vs Actual alarms")
    print("   • Stats card: Event types breakdown")
    print("   • Stats card: Most common operator actions")
    print("   • Stats card: Condition type distribution")
    print()


def main():
    """Main function."""
    
    print("""
╔════════════════════════════════════════════════════════════════════════════════╗
║                                                                                ║
║   Add Event Statistics to Corrected ISA 18.2 JSON                             ║
║   (For Dashboard Stats Cards)                                                 ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝

This analyzes ALL CSV records and adds:
✅ Actual alarms vs Events breakdown
✅ Operator action types (ACK, OK, SHELVE, etc.)
✅ Condition types (BAD PV, CHANGE, NORMAL, etc.)
✅ Percentage comparisons

Expected time: 30-60 seconds
    """)
    
    add_event_stats_to_corrected_json()


if __name__ == '__main__':
    main()
