"""
Professional Analysis: Events vs Alarms in CSV Files

This script analyzes your CSV files to distinguish between:
1. Actual ALARMS (should be counted in ISA 18.2)
2. EVENTS (operator actions, system events - should NOT be counted)

Based on ISA 18.2 standard, only NEW alarm occurrences should count,
not operator acknowledgments or other state changes.
"""

import pandas as pd
import os
import sys
from pathlib import Path
from collections import defaultdict, Counter

# Add parent directory to path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import PVCI_FOLDER


def read_csv_with_all_columns(file_path: str, skip_rows: int = 8) -> pd.DataFrame:
    """Read CSV with ALL columns to analyze Actions and Conditions."""
    try:
        # Read with all columns
        df = pd.read_csv(
            file_path,
            skiprows=skip_rows,
            encoding='utf-8',
            on_bad_lines='skip',
            engine='python'
        )
        
        # Clean column names
        df.columns = df.columns.str.strip()
        
        return df
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return pd.DataFrame()


def analyze_single_file(file_path: str):
    """Analyze a single CSV file for events vs alarms."""
    print(f"\n{'='*80}")
    print(f"Analyzing: {os.path.basename(file_path)}")
    print(f"{'='*80}")
    
    df = read_csv_with_all_columns(file_path)
    
    if df.empty:
        print("❌ File is empty or could not be read")
        return None
    
    print(f"\n📋 Columns found: {list(df.columns)}")
    print(f"📊 Total rows: {len(df):,}")
    
    # Check for Action column
    if 'Action' in df.columns:
        print(f"\n✅ 'Action' column found!")
        action_counts = df['Action'].fillna('(Blank)').value_counts()
        print(f"\n📈 Action Distribution:")
        for action, count in action_counts.items():
            percentage = (count / len(df)) * 100
            print(f"   {str(action):20s}: {count:7,} ({percentage:5.2f}%)")
    else:
        print(f"\n⚠️  'Action' column NOT found")
    
    # Check for Condition column
    if 'Condition' in df.columns:
        print(f"\n✅ 'Condition' column found!")
        condition_counts = df['Condition'].fillna('(Blank)').value_counts()
        print(f"\n📈 Condition Distribution (top 20):")
        for cond, count in condition_counts.head(20).items():
            percentage = (count / len(df)) * 100
            print(f"   {str(cond):30s}: {count:7,} ({percentage:5.2f}%)")
    else:
        print(f"\n⚠️  'Condition' column NOT found")
    
    # Sample rows
    print(f"\n📝 Sample Rows (first 10):")
    if 'Action' in df.columns and 'Condition' in df.columns:
        print(df[['Event Time', 'Source', 'Action', 'Condition']].head(10).to_string(index=False))
    elif 'Condition' in df.columns:
        print(df[['Event Time', 'Source', 'Condition']].head(10).to_string(index=False))
    else:
        print(df.head(10).to_string(index=False))
    
    return df


def classify_event_types(df: pd.DataFrame):
    """
    Classify events into categories based on ISA 18.2 standard.
    
    ISA 18.2 Categories:
    - ALARM: New alarm occurrence (should be counted)
    - OPERATOR_ACTION: ACK, OK, SHELVE, ACK PNT (should NOT be counted)
    - SYSTEM_EVENT: CHANGE, state changes (should NOT be counted)
    - RETURN_TO_NORMAL: Alarm clears (should NOT be counted)
    """
    
    if 'Action' not in df.columns and 'Condition' not in df.columns:
        print("\n⚠️  Cannot classify: Missing Action and Condition columns")
        return None
    
    print(f"\n{'='*80}")
    print("🔍 EVENT CLASSIFICATION (ISA 18.2 Standard)")
    print(f"{'='*80}")
    
    classifications = []
    
    for idx, row in df.iterrows():
        action = str(row.get('Action', '')).strip()
        condition = str(row.get('Condition', '')).strip()
        
        # Classification logic
        if action in ['ACK', 'OK', 'SHELVE', 'ACK PNT', 'CNF']:
            event_type = 'OPERATOR_ACTION'
            should_count = False
            reason = f"Operator action: {action}"
        
        elif action == '' or action == 'nan' or action == '(Blank)':
            # No action = likely a new alarm or system event
            if condition in ['ALARM', 'HI', 'LO', 'HIHI', 'LOLO', 'PVHIGH', 'PVLOW', 'PVHIHI', 'PVLOLO']:
                event_type = 'ALARM'
                should_count = True
                reason = f"New alarm: {condition}"
            elif condition in ['CHANGE', 'NORMAL', 'RTN']:
                event_type = 'SYSTEM_EVENT'
                should_count = False
                reason = f"System event: {condition}"
            else:
                event_type = 'UNKNOWN'
                should_count = False
                reason = f"Unknown condition: {condition}"
        
        else:
            event_type = 'UNKNOWN'
            should_count = False
            reason = f"Unknown action: {action}"
        
        classifications.append({
            'event_type': event_type,
            'should_count': should_count,
            'reason': reason,
            'action': action,
            'condition': condition
        })
    
    # Add classification column
    df['event_type'] = [c['event_type'] for c in classifications]
    df['should_count_in_ISA'] = [c['should_count'] for c in classifications]
    df['classification_reason'] = [c['reason'] for c in classifications]
    
    # Summary
    print(f"\n📊 Classification Summary:")
    print(f"   Total events: {len(df):,}")
    
    type_counts = df['event_type'].value_counts()
    for event_type, count in type_counts.items():
        percentage = (count / len(df)) * 100
        print(f"   {event_type:20s}: {count:7,} ({percentage:5.2f}%)")
    
    should_count = df['should_count_in_ISA'].sum()
    should_not_count = (~df['should_count_in_ISA']).sum()
    
    print(f"\n🎯 ISA 18.2 Counting Decision:")
    print(f"   ✅ Should count (actual alarms):     {should_count:7,} ({should_count/len(df)*100:5.2f}%)")
    print(f"   ❌ Should NOT count (events/actions): {should_not_count:7,} ({should_not_count/len(df)*100:5.2f}%)")
    
    return df


def analyze_all_files_summary(folder_path: str, max_files: int = 5):
    """Analyze multiple files to get overall statistics."""
    
    print(f"\n{'='*80}")
    print(f"COMPREHENSIVE ANALYSIS: Events vs Alarms")
    print(f"{'='*80}")
    print(f"Folder: {folder_path}")
    
    csv_files = [f for f in os.listdir(folder_path) if f.lower().endswith('.csv')]
    csv_files = sorted(csv_files)[:max_files]
    
    print(f"\nAnalyzing {len(csv_files)} files (limited to {max_files} for performance)")
    
    all_actions = Counter()
    all_conditions = Counter()
    total_rows = 0
    total_alarms = 0
    total_events = 0
    
    for file_name in csv_files:
        file_path = os.path.join(folder_path, file_name)
        print(f"\n📄 Processing: {file_name}...")
        
        df = read_csv_with_all_columns(file_path)
        if df.empty:
            continue
        
        total_rows += len(df)
        
        if 'Action' in df.columns:
            all_actions.update(df['Action'].fillna('(Blank)').tolist())
        
        if 'Condition' in df.columns:
            all_conditions.update(df['Condition'].fillna('(Blank)').tolist())
        
        # Classify
        if 'Action' in df.columns or 'Condition' in df.columns:
            df_classified = classify_event_types(df)
            if df_classified is not None:
                total_alarms += df_classified['should_count_in_ISA'].sum()
                total_events += (~df_classified['should_count_in_ISA']).sum()
    
    # Overall summary
    print(f"\n{'='*80}")
    print(f"📊 OVERALL SUMMARY ({len(csv_files)} files)")
    print(f"{'='*80}")
    print(f"\nTotal rows processed: {total_rows:,}")
    print(f"Actual alarms (should count): {total_alarms:,} ({total_alarms/total_rows*100:.2f}%)")
    print(f"Events/Actions (should NOT count): {total_events:,} ({total_events/total_rows*100:.2f}%)")
    
    print(f"\n📈 All Actions Found (across {len(csv_files)} files):")
    for action, count in all_actions.most_common():
        percentage = (count / total_rows) * 100
        print(f"   {str(action):20s}: {count:7,} ({percentage:5.2f}%)")
    
    print(f"\n📈 All Conditions Found (top 20):")
    for cond, count in all_conditions.most_common(20):
        percentage = (count / total_rows) * 100
        print(f"   {str(cond):30s}: {count:7,} ({percentage:5.2f}%)")
    
    # Recommendations
    print(f"\n{'='*80}")
    print(f"💡 RECOMMENDATIONS")
    print(f"{'='*80}")
    
    if '(Blank)' in all_actions or all_actions.get('(Blank)', 0) / total_rows > 0.5:
        print("""
1. ⚠️  HIGH percentage of blank Actions detected!
   - This suggests these are NEW ALARM occurrences
   - ISA 18.2: Count these as alarms
   - Operator actions (ACK, OK, SHELVE) should have Action populated
        """)
    
    operator_actions = sum(all_actions.get(a, 0) for a in ['ACK', 'OK', 'SHELVE', 'ACK PNT', 'CNF'])
    if operator_actions > 0:
        print(f"""
2. ✅ Operator actions detected: {operator_actions:,} ({operator_actions/total_rows*100:.2f}%)
   - These should be EXCLUDED from ISA 18.2 calculation
   - Filter Rule: WHERE Action IS NULL OR Action = ''
        """)
    
    change_events = all_conditions.get('CHANGE', 0)
    if change_events > 0:
        print(f"""
3. ⚠️  CHANGE events detected: {change_events:,} ({change_events/total_rows*100:.2f}%)
   - These are system state changes, NOT alarms
   - Should be EXCLUDED from ISA 18.2 calculation
   - Filter Rule: WHERE Condition != 'CHANGE'
        """)
    
    print(f"""
4. 📋 Proposed Filter for ISA 18.2 (Actual Alarms Only):
   
   WHERE (Action IS NULL OR Action = '')
     AND Condition IN ('ALARM', 'HI', 'LO', 'HIHI', 'LOLO', 
                       'PVHIGH', 'PVLOW', 'PVHIHI', 'PVLOLO')
     AND Condition NOT IN ('CHANGE', 'NORMAL', 'RTN')
    """)


def main():
    """Main analysis function."""
    
    print(f"""
{'='*80}
   ISA 18.2 Events vs Alarms Professional Analysis
{'='*80}

This tool analyzes your CSV files to determine:
1. Which records are ACTUAL ALARMS (should count in ISA 18.2)
2. Which records are EVENTS (operator actions, should NOT count)

Based on the screenshot you provided, the file contains:
- Action column: ACK, ACK PNT, CNF, OK, SHELVE, (Blanks)
- These actions indicate operator responses to alarms

ISA 18.2 Standard Rule:
➡️  Count only NEW alarm occurrences
➡️  Do NOT count operator acknowledgments or state changes
    """)
    
    if not os.path.exists(PVCI_FOLDER):
        print(f"\n❌ ERROR: Folder not found: {PVCI_FOLDER}")
        return
    
    # Get first CSV file for detailed analysis
    csv_files = [f for f in os.listdir(PVCI_FOLDER) if f.lower().endswith('.csv')]
    if not csv_files:
        print(f"\n❌ ERROR: No CSV files found in {PVCI_FOLDER}")
        return
    
    # Detailed analysis of first file
    first_file = os.path.join(PVCI_FOLDER, sorted(csv_files)[0])
    df = analyze_single_file(first_file)
    
    if df is not None and ('Action' in df.columns or 'Condition' in df.columns):
        df_classified = classify_event_types(df)
        
        if df_classified is not None:
            # Save sample
            output_path = os.path.join(ROOT, 'PVCI-overall-health', 'event_classification_sample.csv')
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            df_classified.head(100).to_csv(output_path, index=False)
            print(f"\n💾 Sample classification saved to: {output_path}")
    
    # Comprehensive analysis across multiple files
    analyze_all_files_summary(PVCI_FOLDER, max_files=5)
    
    print(f"\n{'='*80}")
    print("✅ Analysis Complete!")
    print(f"{'='*80}\n")


if __name__ == '__main__':
    main()
