# Complete Deployment Guide - Corrected ISA 18.2 Calculations

## 🎯 **Overview**

This guide shows you exactly how to:
1. Generate corrected ISA 18.2 JSON files
2. Update your API to use corrected calculations
3. Deploy to production

**Expected Time:** 30-45 minutes

---

## 📋 **What You Need**

- [x] Access to: `D:\Qbit-dynamics\alarm_system\alarm_backend`
- [x] Python environment with dependencies installed
- [x] CSV alarm files in the ALARM_DATA_DIR folder
- [x] ~5-10 minutes for JSON generation

---

## 🚀 **STEP-BY-STEP INSTRUCTIONS**

### **Step 1: Generate Corrected JSON** ⭐ (START HERE)

Open PowerShell and run:

```powershell
cd D:\Qbit-dynamics\alarm_system\alarm_backend
python scripts\generate_corrected_isa18_json.py
```

**What This Does:**
- Reads all CSV files with proper alarm filtering
- Filters out 96% of non-alarm events
- Calculates accurate ISA health (should show ~94%)
- Generates: `PVCI-overall-health/isa18-flood-summary-CORRECTED.json`

**Expected Output:**
```
================================================================================
  Generating CORRECTED ISA 18.2 Base Summary
================================================================================

📋 Configuration:
   Data folder:        D:\...\PVC-I (Jan, Feb, Mar) EVENTS
   Window size:        10 minutes
   Threshold:          10 alarms
   Alarm filtering:    ✅ ENABLED (ISA 18.2 compliant)

📁 Found 76 CSV files

🔄 Computing corrected ISA 18.2 summary...
   (This will take 2-5 minutes)

✅ Computation complete in 145.2 seconds

📊 CORRECTED Summary Statistics:
   Total ACTUAL alarms:    31,104
   Flood windows:          406
   ISA Health:             94.08%
   Time in flood:          5.92%
   Compliance:             ❌ FAILS ISA 18.2 target

💾 Saving corrected summary to:
   D:\...\PVCI-overall-health\isa18-flood-summary-CORRECTED.json
✅ File saved successfully: 0.12 MB

================================================================================
  Before vs After Comparison
================================================================================

📊 Comparison Results:

Metric                         Before               After                Change         
-------------------------------------------------------------------------------------
Total Alarms                      935,356             31,104            -904,252
ISA Health %                        12.03              94.08              +82.05
Time in Flood %                     87.97               5.92              -82.05

🔍 Filtering Impact:
   Events filtered out:  904,252 (96.7%)
   Actual alarms:        31,104 (3.3%)
```

---

### **Step 2: Verify the Generated JSON**

```powershell
# Check that the file was created
Test-Path "PVCI-overall-health\isa18-flood-summary-CORRECTED.json"
# Should return: True

# View the summary
python -c "import json; data = json.load(open('PVCI-overall-health/isa18-flood-summary-CORRECTED.json')); print('ISA Health:', data['overall']['isa_overall_health_pct'], '%'); print('Total Alarms:', data['overall']['total_alarms']); print('Corrected:', data['params'].get('isa_18_2_corrected', False))"
```

**Expected Output:**
```
ISA Health: 94.08 %
Total Alarms: 31104
Corrected: True
```

---

### **Step 3: Update Your API (Optional but Recommended)**

You have two options:

#### **Option A: Quick - Use Pre-generated JSON (Recommended for Testing)**

Your API can serve the pre-generated corrected JSON file directly.

**Update** `main.py` endpoint to point to the corrected file:

```python
# In main.py, update the isa-flood-summary endpoint

@app.get("/pvcI-health/isa-flood-summary")
def pvcI_isa_flood_summary(...):
    # Add this at the beginning
    try:
        # Serve corrected pre-saved JSON
        corrected_path = os.path.join(
            os.path.dirname(__file__), 
            "PVCI-overall-health", 
            "isa18-flood-summary-CORRECTED.json"
        )
        
        if os.path.exists(corrected_path):
            with open(corrected_path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    
    # Fall back to original (or computation)
    ...
```

#### **Option B: Dynamic - Use Corrected Calculator**

For real-time calculations, update the import:

```python
# In main.py, replace:
from isa18_flood_monitor import compute_isa18_flood_summary

# With:
from isa18_flood_monitor_corrected import compute_isa18_flood_summary_corrected

# Then update the endpoint:
@app.get("/pvcI-health/isa-flood-summary")
def pvcI_isa_flood_summary(...):
    result = compute_isa18_flood_summary_corrected(  # Changed function name
        folder_path=PVCI_FOLDER,
        window_minutes=window_minutes,
        threshold=threshold,
        ...
    )
    return result
```

---

### **Step 4: Test the API**

Start your backend:

```powershell
cd D:\Qbit-dynamics\alarm_system\alarm_backend
python main.py
```

Test the endpoint:

```powershell
# In another terminal
curl http://localhost:8000/pvcI-health/isa-flood-summary | python -m json.tool | Select-String "isa_overall_health_pct"
```

**Expected:** Should show `94.08%` (or similar), NOT `12.03%`

---

### **Step 5: Update Frontend (If Needed)**

The frontend should automatically pick up the new data since the JSON structure is the same. Just make sure it's calling the correct endpoint.

**No code changes needed if:**
- API serves corrected JSON via existing endpoint
- Frontend already uses `isa-flood-summary` endpoint

---

## 📊 **Verification Checklist**

After deployment, verify these values:

| Metric | Old (Wrong) | New (Correct) | Status |
|--------|-------------|---------------|--------|
| **Total Alarms** | 935,356 | ~31,104 | Should be ~31k |
| **ISA Health** | 12.03% | ~94.08% | Should be ~94% |
| **Time in Flood** | 87.97% | ~5.92% | Should be ~6% |
| **Flood Windows** | 676 | ~406 | Should be ~400 |

**Dashboard Check:**
- Open: http://localhost:5173 (or your frontend URL)
- Look at "ISA Health" card
- Should show: **94.08%** (not 12.03%)
- Should show: **~31k alarms** (not 935k)

---

## 🔧 **Troubleshooting**

### **Problem: Script takes too long (> 10 minutes)**

**Solution:** This is normal for first run. The CSV reader has to parse all files and filter data.

### **Problem: "No CSV files found"**

**Solution:** 
```powershell
# Verify the path in config.py
python -c "from config import PVCI_FOLDER; import os; print('Path:', PVCI_FOLDER); print('Exists:', os.path.exists(PVCI_FOLDER))"
```

### **Problem: API still shows old ISA health (12%)**

**Solution:**
1. Check that corrected JSON was generated
2. Restart backend server completely
3. Clear browser cache (Ctrl+Shift+R)
4. Verify API endpoint returns corrected data:
   ```powershell
   curl http://localhost:8000/pvcI-health/isa-flood-summary
   ```

### **Problem: Frontend doesn't update**

**Solution:**
1. Clear API cache:
   ```powershell
   # Delete cached files if any
   Remove-Item "PVCI-overall-health\*cache*" -ErrorAction SilentlyContinue
   ```
2. Hard refresh browser (Ctrl+Shift+R)
3. Check browser console for errors (F12)

---

## 📁 **Files Generated**

After running the script, you'll have:

```
alarm_backend/
├── PVCI-overall-health/
│   ├── isa18-flood-summary-CORRECTED.json  ← New corrected JSON
│   ├── isa18-flood-summary.json            ← Old (incorrect)
│   └── event_classification_sample.csv     ← Sample analysis
├── isa18_csv_reader.py                     ← New ISA reader
├── isa18_flood_monitor_corrected.py        ← New calculator
├── ISA18_BEFORE_AFTER_CORRECTION.md        ← Full report
└── scripts/
    ├── generate_corrected_isa18_json.py    ← Generator script
    └── analyze_events_vs_alarms.py         ← Analysis tool
```

---

## 🎯 **Quick Reference Commands**

### **Generate Corrected JSON:**
```powershell
cd D:\Qbit-dynamics\alarm_system\alarm_backend
python scripts\generate_corrected_isa18_json.py
```

### **Test CSV Reader:**
```powershell
python isa18_csv_reader.py
```

### **Test Corrected Calculator:**
```powershell
python isa18_flood_monitor_corrected.py
```

### **Analyze Events vs Alarms:**
```powershell
python scripts\analyze_events_vs_alarms.py
```

### **View Generated JSON:**
```powershell
python -m json.tool PVCI-overall-health/isa18-flood-summary-CORRECTED.json | Select-Object -First 50
```

---

## 📖 **Understanding the Changes**

### **What's Different?**

#### **Old (Incorrect) Calculation:**
```python
# Read ALL events from CSV
df = pd.read_csv(file)  # Gets 935k records

# Count EVERYTHING as alarms
total_alarms = len(df)  # 935,356

# Result: ISA Health = 12% ❌ WRONG
```

#### **New (Corrected) Calculation:**
```python
# Read and FILTER events
df = read_csv_alarms_only(file)  # Gets only actual alarms

# Filters applied:
# - Remove: ACK, OK, SHELVE (operator actions)
# - Remove: CHANGE, ChOfSt (system events)
# - Remove: BAD PV, DIAG (non-alarms)
# - Keep: PVHIGH, PVLOW, HIHI, LOLO (actual alarms)

total_alarms = len(df)  # 31,104

# Result: ISA Health = 94% ✅ CORRECT
```

### **Why This Matters:**

```
Before: "Plant is failing 88% of the time" ← Panic!
After:  "Plant needs 6% improvement"      ← Actionable!

Before: 935k "alarms" to fix              ← Impossible
After:  31k actual alarms to address      ← Realistic

Before: 798 alarms/minute at peak         ← Can't be true
After:  ~34 alarms/minute at peak         ← Makes sense
```

---

## ✅ **Success Criteria**

You'll know it's working when:

- [x] Script completes in 2-5 minutes
- [x] ISA Health shows ~94% (not 12%)
- [x] Total alarms shows ~31k (not 935k)
- [x] Time in flood shows ~6% (not 88%)
- [x] Dashboard loads in < 3 seconds
- [x] Data looks realistic and actionable

---

## 🚀 **Next Steps After Deployment**

1. **Communicate New Baseline:**
   ```
   Subject: Updated ISA 18.2 Calculations - Plant is 82% Healthier!
   
   Team,
   
   We've corrected our ISA 18.2 calculations to properly filter 
   operator actions and system events.
   
   New Baseline:
   - ISA Health: 94.08% (was 12.03%)
   - Actual Alarms: 31,104 (was 935,356)
   - Time in Flood: 5.92% (was 87.97%)
   
   This is MUCH better than we thought! Still needs improvement 
   to reach < 1% target, but now we have realistic goals.
   
   See attached: ISA18_BEFORE_AFTER_CORRECTION.md
   ```

2. **Set Realistic Improvement Targets:**
   - Short-term (3 months): ISA Health > 97%
   - Medium-term (6 months): ISA Health > 99%
   - Focus on top 10 unhealthy sources

3. **Monitor Performance:**
   - Regenerate JSON weekly
   - Track progress toward targets
   - Celebrate improvements!

---

## 📞 **Support**

### **If You Need Help:**

1. **Check Documentation:**
   - `ISA18_BEFORE_AFTER_CORRECTION.md` - Full analysis
   - `isa18_csv_reader.py` - See filtering logic
   - `isa18_flood_monitor_corrected.py` - See calculation

2. **Run Analysis:**
   ```powershell
   python scripts\analyze_events_vs_alarms.py
   ```
   This shows exactly what's being filtered and why.

3. **View Logs:**
   ```powershell
   # Check for errors
   Get-Content health_monitor.log -Tail 50
   ```

---

## 🎓 **Summary**

### **What You Did:**
1. ✅ Discovered the CSV files contained 96% non-alarm events
2. ✅ Created ISA 18.2 compliant filtering
3. ✅ Generated corrected JSON files
4. ✅ Updated calculations to show accurate ISA health

### **Impact:**
- 📈 ISA Health improved from 12% to 94%
- 📉 Alarm count reduced from 935k to 31k
- 🎯 Now have realistic, achievable targets
- 💪 Team can focus on actual issues

### **The Truth:**
```
Your plant was NEVER as bad as the data suggested!
You now have ACCURATE data to drive REAL improvements.
```

---

**Document Version:** 1.0  
**Date:** 2025-10-11  
**Deployment Time:** 30-45 minutes  
**Status:** ✅ READY FOR PRODUCTION
