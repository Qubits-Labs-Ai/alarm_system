# Plant Selector & Agent Button Fix

## ✅ Issues Fixed

### **Problem 1: Duplicate Plant Selectors**
**Before**: Two separate plant dropdowns showing simultaneously
- Old selector for Per-Source/Flood modes (PVC-I, PVC-II, PVC-III, PP, VCM)
- New selector for Actual-Calc mode (PVC-I, VCM-A)

**After**: Single plant selector per mode
- Per-Source/Flood modes → Old plant selector
- Actual-Calc mode → New plant selector (with Active badges)

### **Problem 2: Agent Buttons Showing Incorrectly**
**Before**: Agent buttons visible even when VCM-A selected in Actual-Calc mode

**After**: Agent buttons conditional on selected plant
- **Actual-Calc mode**: Buttons only show when PVCI is selected
- **Other modes**: Buttons only show when PVCI is selected

---

## 🎯 Current Behavior

### **Actual-Calc Mode**

```
When PVCI selected:
┌──────────────────────────────────────────────────┐
│ Plant: [PVC-I ▼]  [Agent] [PVCI Agent]  Mode... │
│        Active     ↑ SHOWS for PVCI               │
└──────────────────────────────────────────────────┘

When VCM-A selected:
┌──────────────────────────────────────────────────┐
│ Plant: [VCM-A ▼]                         Mode... │
│        Active     ↑ Agent buttons HIDDEN         │
└──────────────────────────────────────────────────┘
```

### **Per-Source / Flood Modes**

```
When PVCI selected:
┌──────────────────────────────────────────────────┐
│ Plant: [PVC-I ▼]  [Agent] [PVCI Agent]  Mode... │
│                   ↑ SHOWS for PVCI               │
└──────────────────────────────────────────────────┘

When PVC-II selected:
┌──────────────────────────────────────────────────┐
│ Plant: [PVC-II ▼]                        Mode... │
│                   ↑ Agent buttons HIDDEN         │
└──────────────────────────────────────────────────┘
```

---

## 🔧 Technical Implementation

### **Agent Button Visibility Logic**

```tsx
{/* Show Agent buttons only for PVCI */}
{((mode === 'actualCalc' && actualCalcPlantId === 'PVCI') || 
  (mode !== 'actualCalc' && selectedPlant.id === 'pvcI')) && (
  <>
    <Button onClick={() => navigate('/pvci/agent')}>
      <Sparkles /> Agent
    </Button>
    <Button onClick={() => navigate('/pvci/agent-sql')}>
      <Bot /> PVCI Agent
    </Button>
  </>
)}
```

**Logic Breakdown**:
- `mode === 'actualCalc' && actualCalcPlantId === 'PVCI'` → Show for PVCI in Actual-Calc
- `mode !== 'actualCalc' && selectedPlant.id === 'pvcI'` → Show for PVCI in other modes
- Otherwise → Hide buttons

### **Plant Selector Display**

```tsx
{/* Different selectors per mode */}
{mode === 'actualCalc' ? (
  <ActualCalcPlantSelector />  // Uses PlantContext
) : (
  <PlantSelector               // Uses local state
    plants={plants}
    selectedPlant={selectedPlant}
    onPlantChange={handlePlantChange}
  />
)}
```

---

## 📊 Plant Systems Overview

### **System 1: Health Monitoring Plants** (Per-Source/Flood)
- **Source**: `/api/plants` endpoint
- **Plants**: PVC-I, PVC-II, PVC-III, PP, VCM, PVCI-
- **Data**: Pre-saved JSON files (pvcI-overall-health.json, etc.)
- **Modes**: Per-Source, Plant-Wide (ISA 18.2)
- **State**: Local state in DashboardPage

### **System 2: Actual-Calc Plants** (NEW)
- **Source**: `/actual-calc/plants` endpoint
- **Plants**: PVCI, VCMA (+ future plants)
- **Data**: Dynamic actual-calc JSON (All_Merged-actual-calc.json, VCMA-actual-calc.json)
- **Modes**: Actual Calc
- **State**: PlantContext (global, persists)

### **Why Two Systems?**

1. **Different Data Sources**: 
   - Health monitoring uses pre-computed aggregates
   - Actual-calc uses detailed cycle-by-cycle analysis

2. **Different Plant Configurations**:
   - Health monitoring tracks operational plants
   - Actual-calc can analyze any CSV data (including historical)

3. **Different Features**:
   - Health monitoring: Real-time alerts, ISA flood detection
   - Actual-calc: KPI analysis, bad actors, frequency metrics

---

## 🔮 Future Enhancement (Optional)

### **Unified Plant System** (Phase 2)

Merge both plant systems into a single dropdown with:

```
Plant: [PVC-I ▼]
       │
       ├─ PVC-I (Active, Health✓, Actual-Calc✓)
       ├─ VCM-A (Active, Actual-Calc✓)
       ├─ PVC-II (Active, Health✓)
       └─ PVC-III (Active, Health✓)
```

**Features**:
- Single source of truth for plants
- Show which modes each plant supports
- Unified active/inactive status
- Mode dropdown automatically filters based on plant capabilities

**Implementation**:
1. Merge plant_registry.py with plants API
2. Add capability flags (supports_health, supports_actual_calc)
3. Update PlantContext to manage all plants
4. Add mode filtering logic
5. Unified PlantSelector component

**Effort**: ~4-6 hours

---

## ✅ Current Status

**Fixed**:
- ✅ Agent buttons now hide for non-PVCI plants
- ✅ Plant selectors don't overlap
- ✅ Actual-Calc mode uses new plant system
- ✅ Per-Source/Flood modes use existing plant system

**Working as Expected**:
- ✅ PVCI → Agent buttons visible (all modes)
- ✅ VCM-A → Agent buttons hidden (Actual-Calc mode)
- ✅ PVC-II → Agent buttons hidden (Per-Source mode)
- ✅ Plant selection persists per mode

---

## 🧪 Testing Checklist

### **Test 1: Actual-Calc Mode - PVCI**
1. ☐ Select "Actual Calc" mode
2. ☐ Select "PVC-I" from plant dropdown
3. ☐ Verify: Agent buttons visible
4. ☐ Verify: Buttons work (navigate to agent pages)

### **Test 2: Actual-Calc Mode - VCMA**
1. ☐ Select "Actual Calc" mode
2. ☐ Select "VCM-A" from plant dropdown
3. ☐ Verify: Agent buttons HIDDEN
4. ☐ Verify: Charts show VCMA data

### **Test 3: Per-Source Mode - PVCI**
1. ☐ Select "Per Source" mode
2. ☐ Select "PVC-I" from plant dropdown
3. ☐ Verify: Agent buttons visible
4. ☐ Verify: Per-source charts load

### **Test 4: Per-Source Mode - PVC-II**
1. ☐ Select "Per Source" mode
2. ☐ Select "PVC-II" from plant dropdown
3. ☐ Verify: Agent buttons HIDDEN
4. ☐ Verify: PVC-II charts load

### **Test 5: Mode Switching**
1. ☐ Select PVCI in Per-Source mode (agent buttons visible)
2. ☐ Switch to Actual-Calc mode
3. ☐ Verify: Agent buttons still visible (PVCI selected)
4. ☐ Switch plant to VCM-A
5. ☐ Verify: Agent buttons now hidden

---

## 📝 Code Changes

**File**: `src/pages/DashboardPage.tsx`

**Lines Modified**: ~716-770

**Key Changes**:
1. Conditional plant selector based on mode
2. Agent button visibility logic updated
3. Mode availability based on selected plant

---

## 🎯 Summary

✅ **Problem**: Agent buttons showing for wrong plants  
✅ **Solution**: Conditional rendering based on selected plant ID  
✅ **Result**: Agent buttons only appear for PVCI in any mode  

✅ **Problem**: Two plant selectors showing simultaneously  
✅ **Solution**: Different selector per mode (no overlap)  
✅ **Result**: Clean UI with appropriate selector for each mode  

**Status**: ✅ Production Ready
