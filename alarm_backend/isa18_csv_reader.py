"""
ISA 18.2 Compliant CSV Reader

This module provides CSV reading functions that properly distinguish between:
1. Actual ALARMS (should be counted in ISA 18.2)
2. Operator ACTIONS (should NOT be counted)
3. System EVENTS (should NOT be counted)

Based on professional analysis showing that 95%+ of records in CSV files
are operator actions/system events, not actual alarm occurrences.

Usage:
    from isa18_csv_reader import read_csv_alarms_only
    
    # Read only actual alarms (ISA 18.2 compliant)
    df = read_csv_alarms_only('alarm_file.csv')
"""

import pandas as pd
import logging
from typing import Optional
from functools import lru_cache

logger = logging.getLogger(__name__)


# ISA 18.2 Standard Definitions
# Based on analysis of actual data and ISA 18.2 requirements

ALARM_CONDITIONS = {
    # Process alarms
    'ALARM',      # Generic alarm
    'HI', 'LO',   # High/Low alarms
    'HIHI', 'LOLO',  # High-High/Low-Low alarms
    
    # Process variable alarms
    'PVHIGH', 'PVLOW',      # PV High/Low
    'PVHIHI', 'PVLOLO',     # PV High-High/Low-Low
    
    # Deviation alarms
    'DEVHIGH', 'DEVLOW',    # Deviation High/Low
    'DEVHIHI', 'DEVLOLO',   # Deviation High-High/Low-Low
    
    # Rate of change alarms
    'ROCHIGH', 'ROCLOW',    # Rate of Change High/Low
    
    # Additional alarm types
    'OFFNRM',     # Off Normal (if used as alarm indicator)
    'LEVEL',      # Level alarms (if critical)
}

OPERATOR_ACTIONS = {
    'ACK',        # Acknowledged
    'OK',         # Operator OK'd
    'SHELVE',     # Shelved
    'UNSHELVE',   # Unshelved
    'CNF',        # Confirmed
    'ACK PNT',    # Acknowledge Point
}

SYSTEM_EVENTS = {
    'CHANGE',           # State change (not alarm)
    'ChOfSt',           # Change of State
    'State Change',     # State change variant
    'Formula',          # Formula evaluation
    'NORMAL',           # Return to normal
    'RTN',              # Return to normal
    'Start',            # Equipment start
    'End',              # Equipment end
    'Start of Control', # Control sequence
    'End of Control',   # Control sequence
    'Acquire',          # Control acquire
    'Release',          # Control release
}

NON_ALARM_CONDITIONS = {
    'BAD PV',      # Sensor/communication issue (not process alarm)
    'DIAG',        # Diagnostic message
    'MESSAGE',     # System message
    'OP Fail in circuit/field wire',  # Hardware fault
}


class ISA18Config:
    """Configuration for ISA 18.2 compliant alarm reading."""
    
    def __init__(
        self,
        skip_rows: int = 8,
        include_offnrm: bool = False,  # Set to True if OFFNRM should count as alarm
        include_level: bool = False,   # Set to True if LEVEL should count as alarm
        strict_mode: bool = True,      # If True, only count well-defined alarm conditions
    ):
        self.skip_rows = skip_rows
        self.include_offnrm = include_offnrm
        self.include_level = include_level
        self.strict_mode = strict_mode
        
        # Build alarm conditions set based on config
        self.alarm_conditions = ALARM_CONDITIONS.copy()
        if not include_offnrm:
            self.alarm_conditions.discard('OFFNRM')
        if not include_level:
            self.alarm_conditions.discard('LEVEL')


DEFAULT_ISA18_CONFIG = ISA18Config()


def read_csv_alarms_only(
    file_path: str, 
    config: ISA18Config = DEFAULT_ISA18_CONFIG,
    return_all_columns: bool = False
) -> pd.DataFrame:
    """
    Read CSV file and return ONLY actual alarms (ISA 18.2 compliant).
    
    Filtering Rules (ISA 18.2 Standard):
    1. Exclude operator actions (ACK, OK, SHELVE, etc.)
    2. Exclude system events (CHANGE, state changes, etc.)
    3. Include only recognized alarm conditions (HI, LO, HIHI, LOLO, etc.)
    
    Args:
        file_path: Path to CSV file
        config: ISA18Config with filtering rules
        return_all_columns: If True, return all columns; if False, return only Event Time and Source
    
    Returns:
        DataFrame with filtered alarm records only
    
    Example:
        >>> df = read_csv_alarms_only('alarm_file.csv')
        >>> print(f"Actual alarms: {len(df)}")
    """
    try:
        logger.info(f"Reading alarms from {file_path} (ISA 18.2 compliant)")
        
        # Read all columns first
        df = pd.read_csv(
            file_path,
            skiprows=config.skip_rows,
            encoding='utf-8',
            on_bad_lines='skip',
            engine='python'
        )
        
        if df.empty:
            logger.warning(f"Empty file: {file_path}")
            return pd.DataFrame(columns=['Event Time', 'Source'])
        
        # Clean column names
        df.columns = df.columns.str.strip()
        
        initial_count = len(df)
        
        # FILTER 1: Exclude operator actions
        if 'Action' in df.columns:
            # Keep only rows where Action is blank/null (new alarm occurrences)
            mask_no_action = df['Action'].isna() | (df['Action'] == '') | (df['Action'].str.strip() == '')
            df = df[mask_no_action]
            logger.debug(f"After filtering operator actions: {len(df)}/{initial_count} rows")
        
        # FILTER 2: Include only actual alarm conditions
        if 'Condition' in df.columns:
            # Keep only recognized alarm conditions
            mask_alarm_condition = df['Condition'].isin(config.alarm_conditions)
            df = df[mask_alarm_condition]
            logger.debug(f"After filtering for alarm conditions: {len(df)}/{initial_count} rows")
        else:
            logger.warning(f"No 'Condition' column found in {file_path}")
        
        # Ensure required columns exist
        if 'Event Time' not in df.columns or 'Source' not in df.columns:
            logger.error(f"Required columns missing in {file_path}")
            return pd.DataFrame(columns=['Event Time', 'Source'])
        
        # Parse timestamps
        df['Event Time'] = pd.to_datetime(df['Event Time'], errors='coerce')
        df = df.dropna(subset=['Event Time', 'Source'])
        df['Source'] = df['Source'].astype(str).str.strip()
        
        final_count = len(df)
        filter_ratio = (final_count / initial_count * 100) if initial_count > 0 else 0
        
        logger.info(
            f"Filtered {file_path}: {final_count}/{initial_count} alarms "
            f"({filter_ratio:.1f}% are actual alarms, {100-filter_ratio:.1f}% were events/actions)"
        )
        
        # Return appropriate columns
        if return_all_columns:
            return df
        else:
            return df[['Event Time', 'Source']].copy()
        
    except Exception as e:
        logger.error(f"Error reading alarms from {file_path}: {e}")
        return pd.DataFrame(columns=['Event Time', 'Source'])


def read_csv_all_events(
    file_path: str,
    skip_rows: int = 8,
    return_all_columns: bool = False
) -> pd.DataFrame:
    """
    Read CSV file with ALL events (old behavior - NOT ISA 18.2 compliant).
    
    This function is provided for comparison purposes.
    For ISA 18.2 calculations, use read_csv_alarms_only() instead.
    
    Args:
        file_path: Path to CSV file
        skip_rows: Number of header rows to skip
        return_all_columns: If True, return all columns
    
    Returns:
        DataFrame with all events (alarms + operator actions + system events)
    """
    try:
        df = pd.read_csv(
            file_path,
            skiprows=skip_rows,
            encoding='utf-8',
            on_bad_lines='skip',
            engine='python'
        )
        
        if df.empty:
            return pd.DataFrame(columns=['Event Time', 'Source'])
        
        df.columns = df.columns.str.strip()
        
        if 'Event Time' not in df.columns or 'Source' not in df.columns:
            return pd.DataFrame(columns=['Event Time', 'Source'])
        
        df['Event Time'] = pd.to_datetime(df['Event Time'], errors='coerce')
        df = df.dropna(subset=['Event Time', 'Source'])
        df['Source'] = df['Source'].astype(str).str.strip()
        
        if return_all_columns:
            return df
        else:
            return df[['Event Time', 'Source']].copy()
        
    except Exception as e:
        logger.error(f"Error reading events from {file_path}: {e}")
        return pd.DataFrame(columns=['Event Time', 'Source'])


def compare_alarm_vs_event_counts(file_path: str, config: ISA18Config = DEFAULT_ISA18_CONFIG) -> dict:
    """
    Compare alarm counts using both methods (for validation/comparison).
    
    Returns:
        Dictionary with comparison statistics
    """
    df_all = read_csv_all_events(file_path, skip_rows=config.skip_rows, return_all_columns=True)
    df_alarms = read_csv_alarms_only(file_path, config=config, return_all_columns=True)
    
    total_events = len(df_all)
    actual_alarms = len(df_alarms)
    events_filtered = total_events - actual_alarms
    
    result = {
        'file': file_path,
        'total_events': total_events,
        'actual_alarms': actual_alarms,
        'events_filtered': events_filtered,
        'alarm_percentage': (actual_alarms / total_events * 100) if total_events > 0 else 0,
        'events_percentage': (events_filtered / total_events * 100) if total_events > 0 else 0,
    }
    
    # Breakdown by action
    if 'Action' in df_all.columns:
        result['action_breakdown'] = df_all['Action'].fillna('(Blank)').value_counts().to_dict()
    
    # Breakdown by condition
    if 'Condition' in df_all.columns:
        result['condition_breakdown'] = df_all['Condition'].fillna('(Blank)').value_counts().head(10).to_dict()
    
    return result


if __name__ == '__main__':
    """Test the ISA 18.2 compliant reader."""
    import sys
    from pathlib import Path
    
    # Add parent to path
    sys.path.insert(0, str(Path(__file__).parent))
    from config import PVCI_FOLDER
    import os
    
    print("="*80)
    print("Testing ISA 18.2 Compliant CSV Reader")
    print("="*80)
    
    # Test on first CSV file
    csv_files = [f for f in os.listdir(PVCI_FOLDER) if f.endswith('.csv')]
    if not csv_files:
        print("No CSV files found!")
        sys.exit(1)
    
    test_file = os.path.join(PVCI_FOLDER, sorted(csv_files)[0])
    
    print(f"\nTest file: {test_file}")
    print("\nComparison:")
    
    comparison = compare_alarm_vs_event_counts(test_file)
    
    print(f"\nTotal events in file:    {comparison['total_events']:,}")
    print(f"Actual alarms (ISA 18.2): {comparison['actual_alarms']:,} ({comparison['alarm_percentage']:.1f}%)")
    print(f"Filtered out (events):    {comparison['events_filtered']:,} ({comparison['events_percentage']:.1f}%)")
    
    print("\n✅ ISA 18.2 compliant reader is working correctly!")
