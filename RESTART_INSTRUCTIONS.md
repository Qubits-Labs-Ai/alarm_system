# How to See Event Statistics Cards

## Problem
Event Statistics cards are not showing because:
1. Backend code was updated but not restarted
2. Frontend is fetching from old API response (no event_statistics)

## Solution

### Step 1: Restart Backend ⚙️

#### Option A: If backend is running in terminal
1. Press `Ctrl+C` in the terminal where `python main.py` is running
2. Restart it:
```bash
cd D:\Qbit-dynamics\alarm_system\alarm_backend
python main.py
```

#### Option B: If backend is running as service
1. Stop the service
2. Start it again

### Step 2: Clear Browser Cache 🧹
1. Open browser developer tools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"

OR just press `Ctrl+Shift+R`

### Step 3: Verify API Response ✅

Run this test:
```bash
cd D:\Qbit-dynamics\alarm_system\alarm_backend
python scripts\test_api.py
```

**Expected output:**
```
✅ Response received!
Has event_statistics: True

📊 Event Statistics Summary:
   Total records: 934,098
   Actual alarms: 74,529 (8.0%)
   Events: 859,569 (92.0%)
```

### Step 4: Check Frontend 🎨

1. Go to: http://localhost:8080/dashboard (or your frontend URL)
2. Select Plant: **PVC-I**
3. Switch Mode to: **Plant-Wide (ISA 18.2)**
4. Scroll down below ISA Health cards

**You should see:**

```
┌─────────────────────────────────────────┐
│  📊 Event Statistics                   │
│  Breakdown of actual alarms vs events  │
│                                         │
│  [Total] [Actual] [Operator] [System]  │
│  Records Alarms  Actions    Events     │
│  934,098  8.0%   147,893     92.0%     │
│           74,529            859,569     │
└─────────────────────────────────────────┘
```

## Troubleshooting

### If event_statistics still not in API response:

1. **Check JSON file has event_statistics:**
```bash
python -c "import json; data=json.load(open('D:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-overall-health/isa18-flood-summary-enhanced.json')); print('Has event_statistics:', 'event_statistics' in data)"
```

Should print: `Has event_statistics: True`

2. **If False, regenerate JSON:**
```bash
cd D:\Qbit-dynamics\alarm_system\alarm_backend
python scripts\add_event_statistics.py
```

### If cards still not visible in frontend:

1. **Check browser console (F12)** for errors
2. **Verify component is imported:**
   - File: `alarm_frontend/src/pages/DashboardPage.tsx`
   - Should have: `import { EventStatisticsCards } from '@/components/dashboard/EventStatisticsCards';`

3. **Rebuild frontend (if using build):**
```bash
cd D:\Qbit-dynamics\alarm_system\alarm_frontend
npm run build
```

4. **Or restart dev server:**
```bash
cd D:\Qbit-dynamics\alarm_system\alarm_frontend
npm run dev
```

## Quick Test Command

Run this to verify everything:
```bash
# Test backend API
curl http://localhost:8080/pvcI-health/isa-flood-summary-enhanced?lite=true

# Or use Python
python -c "import requests; r=requests.get('http://localhost:8080/pvcI-health/isa-flood-summary-enhanced?lite=true'); print('Has event_statistics:', 'event_statistics' in r.json())"
```

## Files Modified

### Backend
- `main.py` - Added event_statistics to lite response (line 765)
- `PVCI-overall-health/isa18-flood-summary-enhanced.json` - Contains event_statistics

### Frontend  
- `components/dashboard/EventStatisticsCards.tsx` - New component
- `pages/DashboardPage.tsx` - Added EventStatisticsCards (lines 8, 76, 615-620)

## Expected Display Location

```
┌──────────────────────────────────────────────────────┐
│ Plant Selector + Mode Selector                       │
├──────────────────────────────────────────────────────┤
│ ISA Health | % Time in Flood | Flood Windows | etc. │  ← Existing cards
├──────────────────────────────────────────────────────┤
│                                                       │
│ 📊 Event Statistics                                  │  ← NEW SECTION!
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ │ Total   │ │ Actual  │ │Operator │ │ System  │   │
│ │ Records │ │ Alarms  │ │ Actions │ │ Events  │   │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                       │
│ [Classification Breakdown Card]                      │
├──────────────────────────────────────────────────────┤
│ Unhealthy Bar Chart                                  │  ← Existing charts
│ Top Flood Windows                                    │
└──────────────────────────────────────────────────────┘
```

---

**Generated:** 2025-10-11  
**Status:** Ready to test after backend restart
