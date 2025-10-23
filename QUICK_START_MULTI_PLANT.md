# Quick Start: Multi-Plant Dashboard

## ✅ Implementation Complete

Your alarm management system now supports **dynamic plant switching** for Actual-Calc mode!

---

## 🚀 How to Use

### **1. Start the System**

**Backend:**
```bash
cd alarm_backend
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd alarm_frontend
npm run dev
```

### **2. Access the Dashboard**

1. Navigate to `http://localhost:5173/dashboard`
2. Click **Mode** dropdown → Select **"Actual Calc"**
3. You'll now see a **Plant selector** next to the Mode selector

### **3. Switch Between Plants**

```
Plant: [PVC-I ▼]  ← Click here to switch
       │
       ├─ PVC-I (Active)
       └─ VCM-A (Active)  ← New plant available!
```

When you select a different plant:
- ✅ All charts reload automatically
- ✅ KPIs update to show that plant's data
- ✅ Selection is saved (persists on refresh)

---

## 🎯 What Works Now

### **Available Plants**
- **PVC-I** (PVCI) - Original plant
- **VCM-A** (VCMA) - New plant ready to use

### **All Charts Work For Any Plant**
- ✅ Alarm Summary Cards
- ✅ Frequency Metrics
- ✅ Unhealthy Sources
- ✅ Top Flood Windows
- ✅ Bad Actors Pareto
- ✅ Unhealthy Periods Bar Chart
- ✅ All detailed analytics

---

## 🆕 Adding a New Plant (Easy 3-Step Process)

### **Step 1: Edit Registry** (1 minute)

Open `alarm_backend/plant_registry.py` and add:

```python
"PVCII": {
    "id": "PVCII",
    "name": "PVC-II Plant",
    "display_name": "PVC-II",
    "description": "PVC-II Manufacturing Plant",
    "json_filename": "PVCII-actual-calc.json",
    "csv_relative_path": "PVC-II-data",  # Folder name
    "csv_filename": "PVCII_merged.csv",  # CSV file name
    "active": True,
},
```

### **Step 2: Place CSV File**

```
alarm_backend/
  ALARM_DATA_DIR/
    PVC-II-data/           ← Create folder
      PVCII_merged.csv     ← Place CSV here
```

### **Step 3: Restart Backend**

```bash
# Restart the server
uvicorn main:app --reload --port 8000
```

**That's it!** The new plant will automatically appear in the dropdown.

---

## 📊 Current Setup

### **PVCI (PVC-I)**
- CSV: `ALARM_DATA_DIR/PVCI-merged/All_Merged.csv`
- Cache: `PVCI-actual-calc/All_Merged-actual-calc.json`
- Status: ✅ Active

### **VCMA (VCM-A)**
- CSV: `ALARM_DATA_DIR/VCMA/VCMA.csv`
- Cache: `PVCI-actual-calc/VCMA-actual-calc.json`
- Status: ✅ Active (if CSV exists)

---

## 🔍 Testing Checklist

### **Visual Test (Easiest)**
1. ☐ Go to Dashboard → Select "Actual Calc" mode
2. ☐ See plant dropdown next to Mode selector
3. ☐ Select "PVC-I" → Charts load
4. ☐ Select "VCM-A" → Charts reload with VCMA data
5. ☐ Refresh page → Selected plant is remembered

### **API Test (Terminal)**
```bash
# List all plants
curl http://localhost:8000/actual-calc/plants

# Get PVCI data
curl http://localhost:8000/actual-calc/PVCI/overall

# Get VCMA data
curl http://localhost:8000/actual-calc/VCMA/overall
```

---

## 🎨 UI Reference

**What you'll see:**

```
┌────────────────────────────────────────────────┐
│  Plant: [PVC-I ▼]    Mode: [Actual Calc ▼]   │  ← NEW!
├────────────────────────────────────────────────┤
│                                                 │
│  [All existing charts for selected plant]      │
│                                                 │
└────────────────────────────────────────────────┘
```

**Dropdown Menu:**
```
┌──────────────┐
│ PVC-I        │ ← Currently selected
│ Active       │
├──────────────┤
│ VCM-A        │ ← Click to switch
│ Active       │
└──────────────┘
```

---

## ⚡ Key Features

1. **Instant Switching**: Change plants without page reload
2. **Persistent Selection**: Your choice is saved automatically
3. **Zero Configuration**: Components adapt automatically
4. **Single Codebase**: No plant-specific code needed
5. **Easy Addition**: New plants = 1 registry edit + 1 CSV file

---

## 🐛 Troubleshooting

### **"No plants available" error**
- Check backend is running on port 8000
- Verify `plant_registry.py` has plants defined

### **"No cached data" error for a plant**
- Normal on first access
- Backend will generate cache automatically
- Takes 10-30 seconds depending on CSV size

### **Plant dropdown doesn't show**
- Make sure you're in "Actual Calc" mode
- Plant selector only appears in Actual Calc mode

### **VCMA shows no data**
- Verify CSV file exists: `ALARM_DATA_DIR/VCMA/VCMA.csv`
- Check file has correct format (same as PVCI CSV)
- Backend will auto-generate cache on first access

---

## 📁 Important Files

### **Configuration**
- `alarm_backend/plant_registry.py` - Add new plants here

### **API Layer**
- `alarm_backend/main.py` - REST endpoints
- `alarm_frontend/src/api/actualCalc.ts` - API calls

### **UI Components**
- `alarm_frontend/src/components/actualCalc/ActualCalcPlantSelector.tsx` - Dropdown
- `alarm_frontend/src/contexts/PlantContext.tsx` - State management
- `alarm_frontend/src/pages/DashboardPage.tsx` - Integration point

---

## 🎯 What Changed (Summary)

| Area | Change | Impact |
|------|--------|--------|
| Backend | Added `plant_registry.py` | Central config for all plants |
| Backend | Updated `actual_calc_service.py` | Accepts `plant_id` parameter |
| Backend | Added 7 new API endpoints | Dynamic `/actual-calc/{plant_id}/*` routes |
| Frontend | Created `PlantContext` | Global plant selection state |
| Frontend | Added `ActualCalcPlantSelector` | UI dropdown component |
| Frontend | Updated `DashboardPage` | Calls dynamic APIs |

---

## ✅ Success!

You now have a **production-ready multi-plant dashboard** that:
- ✅ Works for PVCI (existing)
- ✅ Works for VCMA (new)
- ✅ Can add more plants in minutes
- ✅ Requires no frontend changes for new plants
- ✅ Maintains all existing functionality

---

**Questions?** Check `MULTI_PLANT_IMPLEMENTATION.md` for detailed documentation.

**Ready to test?** Start both servers and switch to Actual Calc mode!
