# ✅ Cache File Naming - FIXED

## Problem (Pehle ki Problem)
Previously, all CSV files were saving to the same cache file, causing overwrites:
- `PVCI-merged/All_Merged.csv` → saved to `actual-calc.json`
- `VCMA/VCMA.csv` → **overwrote** `actual-calc.json` ❌

Pehle sab files ek hi JSON file mein save ho rahi thi aur overwrite ho jati thi.

---

## ✅ Solution (Hal)
Now each CSV file gets its own unique cache file based on the filename:

### New Naming Pattern
**Format:** `{csv_filename_without_extension}-actual-calc.json`

### Examples
| CSV File | Cache JSON File |
|----------|----------------|
| `All_Merged.csv` | `All_Merged-actual-calc.json` |
| `VCMA.csv` | `VCMA-actual-calc.json` |
| `Plant2_Data.csv` | `Plant2_Data-actual-calc.json` |
| `PP.csv` | `PP-actual-calc.json` |

**Urdu/Hindi Explanation:**
Ab har CSV file ka apna alag JSON cache file banega. File ka naam CSV ke naam se match karega. Jab aap kisi file ko regenerate karenge, sirf us file ka JSON update hoga, baki sab safe rahenge.

---

## 🔧 What Changed in Code

### Modified Function: `generate_cache_identifier()`
**Location:** `actual_calc_service.py` line ~1500

**Before:**
```python
if csv_relative_path is None and csv_file_name is None:
    return "actual-calc"  # ❌ Same for all files
```

**After:**
```python
# Extract filename without extension and sanitize it
file_base = os.path.splitext(csv_file_name)[0]
file_base_clean = re.sub(r'[^a-zA-Z0-9_-]', '_', file_base)

# Return format: {csv_filename}-actual-calc
identifier = f"{file_base_clean}-actual-calc"
return identifier
```

---

## 📁 File Storage Location
All cache files are stored in: `alarm_backend/PVCI-actual-calc/`

---

## 🎯 How It Works Now

### Scenario 1: Process All_Merged.csv
```python
results = run_actual_calc_with_cache(
    base_dir=BASE_DIR,
    alarm_data_dir=ALARM_DATA_DIR,
    csv_relative_path="PVCI-merged",
    csv_file_name="All_Merged.csv"
)
```
✅ Creates/Updates: `PVCI-actual-calc/All_Merged-actual-calc.json`

### Scenario 2: Process VCMA.csv
```python
results = run_actual_calc_with_cache(
    base_dir=BASE_DIR,
    alarm_data_dir=ALARM_DATA_DIR,
    csv_relative_path="VCMA",
    csv_file_name="VCMA.csv"
)
```
✅ Creates/Updates: `PVCI-actual-calc/VCMA-actual-calc.json`

### Scenario 3: Regenerate All_Merged.csv
```python
# Run again with same file
results = run_actual_calc_with_cache(
    base_dir=BASE_DIR,
    alarm_data_dir=ALARM_DATA_DIR,
    csv_relative_path="PVCI-merged",
    csv_file_name="All_Merged.csv",
    force_refresh=True  # Force regeneration
)
```
✅ Updates: `PVCI-actual-calc/All_Merged-actual-calc.json` (VCMA remains untouched)

---

## 🔄 Cache Update Rules

Each cache file is **automatically updated** when:
1. ✅ CSV file size changes
2. ✅ CSV file modified time changes  
3. ✅ Calculation parameters change
4. ✅ `force_refresh=True` is used

Each cache file is **independent** - updating one doesn't affect others.

---

## 📊 Benefits

### ✅ Separate Files
- Har CSV ka apna alag cache
- Koi overwrite nahi hoga

### ✅ Easy Management  
- File name se pata chal jata hai kis CSV ka cache hai
- Easy to find and delete specific caches

### ✅ Parallel Processing
- Multiple CSV files ko parallel process kar sakte ho
- Koi conflict nahi

### ✅ Smart Updates
- Sirf wo file update hogi jo change hui hai
- Baki sab safe rahenge

---

## 🧪 Testing

Test with multiple files to verify:

```bash
# Process VCMA
python -m PVCI_actual_calc.actual_calc_service --csv-rel VCMA --csv-file VCMA.csv

# Process All_Merged
python -m PVCI_actual_calc.actual_calc_service --csv-rel PVCI-merged --csv-file All_Merged.csv

# Check both files exist
ls PVCI-actual-calc/
# Should show:
# - VCMA-actual-calc.json
# - All_Merged-actual-calc.json
```

---

## 🎉 Summary

**Problem Solved:** ✅
- Each CSV file now has its own separate cache JSON
- No more overwrites
- Easy to identify which cache belongs to which CSV
- Independent updates for each file

**Har file ka apna alag JSON ab banega aur update hoga!** 🚀
