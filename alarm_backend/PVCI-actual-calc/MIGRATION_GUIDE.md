# 🔄 Cache File Migration Guide

## Current State
You currently have: `actual-calc.json` (18 MB) - **OLD FORMAT**

## After Running with New Code

### When you run for VCMA.csv:
```bash
python -m PVCI_actual_calc.actual_calc_service --csv-rel VCMA --csv-file VCMA.csv
```
✅ Creates: `VCMA-actual-calc.json`

### When you run for All_Merged.csv:
```bash
python -m PVCI_actual_calc.actual_calc_service --csv-rel PVCI-merged --csv-file All_Merged.csv
```
✅ Creates: `All_Merged-actual-calc.json`

---

## 🗑️ Old Cache File

The old `actual-calc.json` file will **NOT be used anymore**.

You can safely delete it once you've generated the new cache files:

```bash
# After running calculations for both files, you can delete:
rm PVCI-actual-calc/actual-calc.json
```

---

## 📋 Quick Start

### Option 1: Generate Both Caches
```bash
cd alarm_backend

# Generate VCMA cache
python -m PVCI_actual_calc.actual_calc_service --csv-rel VCMA --csv-file VCMA.csv

# Generate All_Merged cache  
python -m PVCI_actual_calc.actual_calc_service --csv-rel PVCI-merged --csv-file All_Merged.csv

# Verify files exist
ls PVCI-actual-calc/*.json
```

Expected output:
```
VCMA-actual-calc.json
All_Merged-actual-calc.json
actual-calc.json (old - can be deleted)
```

### Option 2: Let API Generate Automatically
The cache files will be created automatically when you call the API endpoints with different CSV parameters.

---

## ✅ Verification

After running both calculations, check:

```bash
ls -lh PVCI-actual-calc/*.json
```

You should see:
- ✅ `VCMA-actual-calc.json` - New format
- ✅ `All_Merged-actual-calc.json` - New format
- ⚠️ `actual-calc.json` - Old format (can delete)

---

## 🎯 Benefits of New System

1. **No More Overwrites**: Each CSV has its own cache
2. **Clear Naming**: File name tells you which CSV it's for
3. **Independent Updates**: Regenerating one doesn't affect others
4. **Easy Management**: Know exactly what each cache is for

---

## ❓ FAQ

**Q: Will my API still work?**
A: ✅ Yes! The API will automatically create the new cache files with the correct names.

**Q: What if I run without specifying csv_file_name?**
A: It will use the default (VCMA.csv) and create `VCMA-actual-calc.json`

**Q: Can I delete the old cache?**
A: ✅ Yes, but wait until you've generated the new ones first to avoid recalculation.

**Q: Do I need to change my API calls?**
A: ❌ No changes needed! The system will automatically use the new naming.

---

## 🚀 Ready to Use

The code is now updated and ready. Just run your calculations and the new cache files will be created automatically with the proper naming scheme!

**Har file ka apna alag JSON ab banega!** 🎉
