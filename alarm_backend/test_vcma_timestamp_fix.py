"""
Test script to verify VCMA timestamp parsing fix.

This demonstrates how the new filter date extraction works:
1. Extracts "Before 2/28/2025 11:59:59 PM" from metadata
2. Uses it as seed timestamp (NOT the report date 3/18/2025)
3. Forward-fills to reconstruct truncated MM:SS.S timestamps
"""

import os
import sys
from pathlib import Path
import pandas as pd

# Add PVCI-actual-calc directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'PVCI-actual-calc'))
from actual_calc_service import detect_metadata_rows

def test_vcma_metadata_extraction():
    """Test that filter date is correctly extracted and prioritized over report date."""
    
    csv_path = Path(__file__).parent / "ALARM_DATA_DIR" / "VCMA" / "VCMA.csv"
    
    if not csv_path.exists():
        print(f"❌ CSV not found: {csv_path}")
        return
    
    print("=" * 80)
    print("VCMA TIMESTAMP FIX VERIFICATION")
    print("=" * 80)
    
    # Test metadata extraction
    skiprows, seed_datetime = detect_metadata_rows(str(csv_path))
    
    print(f"\n📋 Metadata Detection Results:")
    print(f"   - Rows to skip: {skiprows}")
    print(f"   - Seed datetime: {seed_datetime}")
    print(f"   - Date: {seed_datetime.date() if seed_datetime else 'None'}")
    print(f"   - Time: {seed_datetime.time() if seed_datetime else 'None'}")
    
    # Read first few rows to show metadata
    print(f"\n📄 CSV Metadata (first 6 rows):")
    sample = pd.read_csv(csv_path, nrows=6, header=None)
    for idx, row in sample.iterrows():
        row_text = ' '.join(str(val) for val in row.values if pd.notna(val))[:100]
        print(f"   Row {idx}: {row_text}")
    
    # Read actual data rows
    print(f"\n📊 Actual Data (rows after metadata):")
    df = pd.read_csv(csv_path, skiprows=skiprows, nrows=10)
    print(f"   Columns: {list(df.columns)}")
    print(f"\n   First 10 Event Times:")
    for idx, et in enumerate(df['Event Time'].head(10), 1):
        print(f"      {idx:2d}. {et}")
    
    # Expected behavior
    print(f"\n✅ EXPECTED BEHAVIOR:")
    print(f"   1. Extract filter date: '2/28/2025 11:59:59 PM' from metadata line 3")
    print(f"   2. Use as seed: {seed_datetime if seed_datetime else 'NOT FOUND!'}")
    print(f"   3. Reconstruct truncated times:")
    print(f"      - '59:56.2' → 2025-02-28 23:59:56.2  (NOT 2025-03-18 11:59:56.2)")
    print(f"      - '58:53.3' → 2025-02-28 23:58:53.3  (NOT 2025-03-18 11:58:53.3)")
    print(f"      - '52:47.3' → 2025-02-28 23:52:47.3  (NOT 2025-03-18 11:52:47.3)")
    
    # Validation
    print(f"\n🔍 VALIDATION:")
    if seed_datetime:
        expected_date = pd.Timestamp("2025-02-28 23:59:59")
        if seed_datetime == expected_date:
            print(f"   ✅ PASS: Seed datetime matches expected filter date!")
        else:
            print(f"   ⚠️  MISMATCH:")
            print(f"      Expected: {expected_date}")
            print(f"      Got:      {seed_datetime}")
    else:
        print(f"   ❌ FAIL: No seed datetime extracted from metadata!")
    
    print("\n" + "=" * 80)
    print("To regenerate VCMA cache with fix:")
    print("  1. Delete: PVCI-actual-calc/VCMA-actual-calc.json")
    print("  2. Run: python test_actual_calc.py --plant VCMA")
    print("  3. Verify timestamps in JSON are now in Feb 2025 (not March)")
    print("=" * 80)

if __name__ == "__main__":
    test_vcma_metadata_extraction()
