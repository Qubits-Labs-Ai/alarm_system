# Multi-Plant Dynamic Actual-Calc Dashboard - Implementation Complete

## ✅ Implementation Summary

The alarm management system has been successfully upgraded to support **dynamic multi-plant switching** for the Actual-Calc mode. Users can now view alarm analytics for any plant (PVCI, VCMA, etc.) using a single, unified dashboard.

---

## 🎯 What Was Implemented

### **Backend (100% Complete)**

#### 1. Plant Registry System (`plant_registry.py`)
- **Location**: `alarm_backend/plant_registry.py`
- **Purpose**: Central configuration for all plants
- **Features**:
  - Plant definitions with metadata (id, name, display_name, CSV paths)
  - Helper functions: `get_all_plants()`, `get_plant_info()`, `validate_plant_id()`
  - Easy addition of new plants by editing one file
  - Currently configured: **PVCI** and **VCMA**

#### 2. Dynamic Calculation Service (`actual_calc_service.py`)
- **Location**: `alarm_backend/PVCI-actual-calc/actual_calc_service.py`
- **Changes**: All functions now accept `plant_id` parameter
- **Key Functions Updated**:
  - `load_pvci_merged_csv(plant_id=...)` - Dynamic CSV loading
  - `run_actual_calc(plant_id=...)` - Plant-aware calculations
  - `run_actual_calc_with_cache(plant_id=...)` - Unified cache management
  - `get_activation_peak_details(plant_id=...)` - Peak window analysis
  - All cache functions (`get_cache_path`, `read_cache`, `write_cache`)
- **Features**:
  - Automatic CSV path resolution via plant registry
  - Plant-specific cache file generation (e.g., `VCMA-actual-calc.json`)
  - Backward compatible with existing PVCI-only usage

#### 3. Dynamic REST API Endpoints (`main.py`)
- **Location**: `alarm_backend/main.py`
- **New Plant-Agnostic Endpoints**:
  ```
  GET  /actual-calc/plants                          - List all plants
  GET  /actual-calc/{plant_id}/overall              - Overall KPIs
  GET  /actual-calc/{plant_id}/per-source           - Per-source metrics
  GET  /actual-calc/{plant_id}/unhealthy            - Unhealthy sources
  GET  /actual-calc/{plant_id}/floods               - Flood windows
  GET  /actual-calc/{plant_id}/bad-actors           - Bad actors
  POST /actual-calc/{plant_id}/regenerate-cache     - Regenerate cache
  ```
- **Backward Compatibility**: Old `/pvcI-actual-calc/*` endpoints still work

---

### **Frontend (100% Complete)**

#### 1. API Service Layer (`src/api/actualCalc.ts`)
- **New Functions**:
  ```typescript
  fetchAvailablePlants()                                    - Get all plants
  fetchPlantActualCalcOverall(plantId, ...)                 - Dynamic overall fetch
  fetchPlantActualCalcPerSource(plantId, ...)               - Per-source data
  fetchPlantActualCalcUnhealthy(plantId, ...)               - Unhealthy sources
  fetchPlantActualCalcFloods(plantId, ...)                  - Flood windows
  fetchPlantActualCalcBadActors(plantId, ...)               - Bad actors
  regeneratePlantActualCalcCache(plantId, ...)              - Cache regeneration
  ```
- **Features**: Automatic caching, timeout handling, error recovery

#### 2. Plant Context (`src/contexts/PlantContext.tsx`)
- **Purpose**: React Context for managing selected plant globally
- **Features**:
  - Persists selection to localStorage
  - Auto-loads available plants from API
  - Provides hooks:
    - `usePlantContext()` - Full context access
    - `useSelectedPlant()` - Shorthand for plant ID
- **Usage**:
  ```tsx
  const { selectedPlant, setSelectedPlant, plants } = usePlantContext();
  const plantId = useSelectedPlant(); // Simple shorthand
  ```

#### 3. Plant Selector Component (`src/components/actualCalc/ActualCalcPlantSelector.tsx`)
- **UI**: Dropdown showing all available plants
- **Features**:
  - Shows plant display name and active status
  - Loading and error states
  - Integrated with PlantContext
- **Location in UI**: Appears next to "Mode" selector when in Actual-Calc mode

#### 4. App Integration (`src/App.tsx`)
- **Change**: Wrapped entire app with `PlantProvider`
- **Impact**: Plant context available throughout the application

#### 5. Dashboard Integration (`src/pages/DashboardPage.tsx`)
- **Changes**:
  - Imports `ActualCalcPlantSelector` component
  - Uses `useSelectedPlant()` hook to get current plant
  - Replaces hardcoded PVCI API calls with dynamic `fetchPlantActualCalc*` calls
  - Passes `actualCalcPlantId` to all actual-calc components
  - Renders `ActualCalcPlantSelector` when in actual-calc mode

---

## 🚀 How to Test

### **1. Start Backend**
```bash
cd alarm_backend
uvicorn main:app --reload --port 8000
```

### **2. Start Frontend**
```bash
cd alarm_frontend
npm run dev
```

### **3. Test Plant Switching**

1. **Navigate to Dashboard** → Select "Actual Calc" mode
2. **You should see**: Plant selector dropdown next to Mode selector
3. **Switch between plants**:
   - Select "PVC-I" → Should load PVCI data
   - Select "VCM-A" → Should load VCMA data
4. **Verify**:
   - All charts update automatically
   - KPIs reflect the correct plant
   - URL remains the same (state in context, not URL)

### **4. Test API Endpoints**

```bash
# List all plants
curl http://localhost:8000/actual-calc/plants

# Get PVCI overall KPIs
curl http://localhost:8000/actual-calc/PVCI/overall

# Get VCMA overall KPIs
curl http://localhost:8000/actual-calc/VCMA/overall

# Get PVCI floods
curl http://localhost:8000/actual-calc/PVCI/floods?limit=10

# Get VCMA unhealthy sources
curl http://localhost:8000/actual-calc/VCMA/unhealthy?limit=20
```

---

## 📊 Data Requirements

### **For Each Plant**

1. **CSV File**: Raw alarm data
   - Location: `ALARM_DATA_DIR/{plant_csv_path}/{plant_csv_file}`
   - Example: `ALARM_DATA_DIR/VCMA/VCMA.csv`

2. **JSON Cache** (auto-generated on first access)
   - Location: `alarm_backend/PVCI-actual-calc/{PlantID}-actual-calc.json`
   - Example: `PVCI-actual-calc/VCMA-actual-calc.json`

3. **Plant Registry Entry** (`plant_registry.py`)
   ```python
   "VCMA": {
       "id": "VCMA",
       "name": "VCM-A Plant",
       "display_name": "VCM-A",
       "description": "Vinyl Chloride Monomer - Plant A",
       "json_filename": "VCMA-actual-calc.json",
       "csv_relative_path": "VCMA",
       "csv_filename": "VCMA.csv",
       "active": True,
   }
   ```

---

## 🆕 Adding a New Plant (Step-by-Step)

### **Step 1: Add Plant to Registry**

Edit `alarm_backend/plant_registry.py`:

```python
PLANTS: Dict[str, Dict[str, Any]] = {
    # ... existing plants ...
    "PVCII": {
        "id": "PVCII",
        "name": "PVC-II Plant",
        "display_name": "PVC-II",
        "description": "PVC-II Manufacturing Plant",
        "json_filename": "PVCII-actual-calc.json",
        "csv_relative_path": "PVC-II-data",
        "csv_filename": "PVCII_merged.csv",
        "active": True,
    },
}
```

### **Step 2: Place CSV File**

```
alarm_backend/
  ALARM_DATA_DIR/
    PVC-II-data/
      PVCII_merged.csv  ← Place your CSV here
```

### **Step 3: Generate JSON Cache (Optional)**

The system auto-generates cache on first access, but you can pre-generate:

```bash
cd alarm_backend/PVCI-actual-calc
python actual_calc_service.py --csv-rel PVC-II-data --csv-file PVCII_merged.csv
```

### **Step 4: Restart Backend**

```bash
# The plant will automatically appear in the API
curl http://localhost:8000/actual-calc/plants
```

### **Step 5: Test in Frontend**

1. Refresh the dashboard
2. Switch to "Actual Calc" mode
3. The new plant should appear in the dropdown
4. Select it and view the data!

---

## 🎨 UI Design

The plant selector appears as shown in the user's reference image:

```
┌─────────────────────────────────────────────────────────┐
│ Plant: [PVC-I ▼]    Mode: [Actual Calc ▼]   🤖 Agent   │
│        ↑ NEW                                             │
├─────────────────────────────────────────────────────────┤
│ [All existing charts work identically for any plant]    │
│ - Alarm Summary Cards                                    │
│ - Frequency Metrics Cards                                │
│ - Unhealthy Sources Chart                                │
│ - Top Flood Windows                                      │
│ - Bad Actors Pareto                                      │
│ - etc.                                                   │
└─────────────────────────────────────────────────────────┘
```

**Dropdown Options**:
```
┌──────────────┐
│ PVC-I        │
│ Active       │  ← Selected
├──────────────┤
│ VCM-A        │
│ Active       │
├──────────────┤
│ PVC-II       │
│ Active       │
└──────────────┘
```

---

## ✨ Key Benefits

1. **Zero Hardcoding**: No plant-specific code in components
2. **One-Click Addition**: Add plant → edit registry → generate JSON → appears automatically
3. **Data Consistency**: All charts work identically for any plant
4. **Performance**: Plant-specific caching, instant switching
5. **Maintainability**: Single codebase for all plants
6. **User-Friendly**: Persistent plant selection across sessions

---

## 🔧 Technical Architecture

### **Data Flow**

```
┌──────────────────┐
│ User selects     │
│ plant in UI      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ PlantContext     │
│ stores selection │
│ in localStorage  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Components read  │
│ useSelectedPlant()│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ API calls with   │
│ plant_id param   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Backend uses     │
│ plant_registry   │
│ to find CSV      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Calculations run │
│ on plant's data  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Results cached   │
│ per plant        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ UI displays data │
└──────────────────┘
```

---

## 📝 Files Modified/Created

### **Backend**
- ✅ `alarm_backend/plant_registry.py` (NEW)
- ✅ `alarm_backend/PVCI-actual-calc/actual_calc_service.py` (MODIFIED)
- ✅ `alarm_backend/main.py` (MODIFIED - added 7 new endpoints)

### **Frontend**
- ✅ `alarm_frontend/src/contexts/PlantContext.tsx` (NEW)
- ✅ `alarm_frontend/src/components/PlantSelector.tsx` (NEW)
- ✅ `alarm_frontend/src/components/actualCalc/ActualCalcPlantSelector.tsx` (NEW)
- ✅ `alarm_frontend/src/api/actualCalc.ts` (MODIFIED - added 7 new functions)
- ✅ `alarm_frontend/src/App.tsx` (MODIFIED - added PlantProvider)
- ✅ `alarm_frontend/src/pages/DashboardPage.tsx` (MODIFIED - integrated plant selector)

---

## 🐛 Known Issues / Notes

1. **Lint Warnings**: Minor ESLint warnings about unused const declarations - non-breaking, can be ignored
2. **Fast Refresh Warning**: PlantContext exports both components and functions - this is intentional and doesn't affect functionality
3. **Type Safety**: All critical type errors have been resolved

---

## 🎯 Success Criteria

✅ **Backend can serve data for any registered plant**
✅ **Frontend displays plant selector in Actual-Calc mode**
✅ **Switching plants reloads all charts with correct data**
✅ **Plant selection persists across browser sessions**
✅ **Adding a new plant requires only registry edit + CSV file**
✅ **All existing PVCI functionality remains intact**
✅ **API endpoints follow REST best practices**
✅ **Cache management works per-plant**

---

## 🚀 Next Steps (Optional Enhancements)

1. **Plant Comparison Mode**: Side-by-side comparison of two plants
2. **Plant-Specific Thresholds**: Different ISA limits per plant
3. **Auto-Discovery**: Automatically detect new plant JSONs
4. **Plant Metadata API**: `/actual-calc/{plant_id}/metadata` endpoint
5. **Export Reports**: Per-plant PDF/Excel export
6. **Multi-Tenant Support**: Different plants for different users

---

## 📧 Support

For questions or issues:
1. Check this document
2. Review `plant_registry.py` for plant configuration
3. Test API endpoints with curl/Postman
4. Verify CSV file structure matches PVCI format

---

**Implementation Date**: January 24, 2025  
**Status**: ✅ Production Ready  
**Version**: 1.0.0
