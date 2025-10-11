# Event Statistics Feature

## Overview
Event Statistics provides a detailed breakdown of actual alarms vs operator actions and system events in the alarm data, following ISA 18.2 standards.

## What's Included

### Backend Changes

#### 1. Event Statistics Analysis (`add_event_statistics.py`)
- **Location:** `alarm_backend/scripts/add_event_statistics.py`
- **Purpose:** Analyzes all CSV records and classifies them as actual alarms or events
- **Output:** Adds `event_statistics` section to JSON files

#### 2. Classification Logic
Based on ISA 18.2 standards:
- **Actual Alarms:** Blank action + alarm condition (HI, LO, HIHI, LOLO, ALARM, etc.)
- **Events:** Non-blank action (ACK, OK, SHELVE) OR non-alarm conditions (CHANGE, NORMAL, RTN, BAD PV, etc.)

#### 3. JSON Structure
```json
{
  "event_statistics": {
    "summary": {
      "total_records": 934098,
      "actual_alarms": 74529,
      "actual_alarms_pct": 7.98,
      "events": 859569,
      "events_pct": 92.02
    },
    "by_action": {
      "operator_actions": {
        "acknowledgements": { "count": 42640, "types": {...} },
        "resets": { "count": 105253, "types": {...} },
        "shelve_suppress": { "count": 176, "types": {...} },
        "other": { "count": 2755, "types": {...} }
      }
    },
    "by_condition": {
      "breakdown": {
        "alarm_conditions": { "count": 90055, "types": {...} },
        "state_changes": { "count": 255586, "types": {...} },
        "quality_issues": { "count": 74664, "types": {...} },
        "other": { "count": 513793, "types": {...} }
      }
    }
  }
}
```

### Frontend Changes

#### 1. New Component: EventStatisticsCards
- **Location:** `alarm_frontend/src/components/dashboard/EventStatisticsCards.tsx`
- **Purpose:** Display event statistics in card format
- **Features:**
  - 4 main stats cards
  - Detailed breakdown section
  - Responsive grid layout

#### 2. Dashboard Integration
- **Location:** `alarm_frontend/src/pages/DashboardPage.tsx`
- **Display Condition:** Only shows for **PVC-I Plant-Wide (ISA 18.2)** mode
- **Position:** Below ISA Health Cards, above charts

## Stats Cards Display

### Card 1: Total Records
```
📄 Total Records
   934,098
   All CSV records processed
   74,529 alarms + 859,569 events
```

### Card 2: Actual Alarms
```
⚠️ Actual Alarms
   8.0%
   74,529 records
   True alarm occurrences
   Used for ISA 18.2 health
```

### Card 3: Operator Actions
```
✓ Operator Actions
   147,893
   ACK + OK/Reset actions
   42,640 ACK, 105,253 OK
```

### Card 4: System Events
```
📊 System Events
   92.0%
   859,569 records
   Non-alarm events
   State changes, quality issues
```

### Detailed Breakdown Card
Shows:
- **Alarm Conditions:** HI, LO, HIHI, LOLO counts
- **State Changes:** CHANGE, NORMAL, RTN counts
- **Quality Issues:** BAD PV, COMM, etc. counts

## Usage

### Backend
1. Event statistics are automatically included in corrected JSON
2. Generated via: `python scripts/add_event_statistics.py`
3. API endpoint serves: `isa18-flood-summary-enhanced.json`

### Frontend
1. Automatically displayed when:
   - Plant: PVC-I
   - Mode: Plant-Wide (ISA 18.2)
2. No additional configuration needed
3. Data fetched from enhanced API endpoint

## Key Metrics Explained

| Metric | Description | Example Value |
|--------|-------------|---------------|
| **Total Records** | All rows in CSV files | 934,098 |
| **Actual Alarms** | True alarm occurrences | 74,529 (8%) |
| **Events** | Operator actions + system events | 859,569 (92%) |
| **Acknowledgements** | ACK, ACK PNT actions | 42,640 |
| **Resets** | OK, RESET, CLR actions | 105,253 |
| **Alarm Conditions** | HI, LO, HIHI, LOLO states | 90,055 |
| **State Changes** | CHANGE, NORMAL, RTN | 255,586 |
| **Quality Issues** | BAD PV, COMM failures | 74,664 |

## Classification Rules

### Actual Alarms ✅
- Action column: **Blank** or empty
- Condition column: One of:
  - ALARM, HI, LO, HIHI, LOLO
  - PVHIGH, PVLOW, PVHIHI, PVLOLO
  - DEVHIGH, DEVLOW, ROCHIGH, ROCLOW

### Events ❌
- Action column: **Not blank** (ACK, OK, CNF, SHELVE, etc.)
- OR Condition column is one of:
  - CHANGE, ChOfSt, NORMAL, RTN
  - BAD PV, COMM, DIAG, MESSAGE

## Benefits

1. **Transparency:** Shows what percentage of data are actual alarms vs events
2. **ISA 18.2 Compliance:** Clarifies that health calculations use only actual alarms
3. **Data Quality:** Reveals the composition of alarm data
4. **Operator Insights:** Shows frequency of operator actions

## Files Modified/Created

### Backend
- ✅ `scripts/add_event_statistics.py` (new)
- ✅ `PVCI-overall-health/isa18-flood-summary-enhanced.json` (updated)
- ✅ `isa18_csv_reader.py` (used for classification)

### Frontend
- ✅ `components/dashboard/EventStatisticsCards.tsx` (new)
- ✅ `pages/DashboardPage.tsx` (updated)

## Testing

### Backend
```bash
# Verify event statistics in JSON
python -c "import json; data=json.load(open('PVCI-overall-health/isa18-flood-summary-enhanced.json')); print(data.get('event_statistics', {}).get('summary', {}))"
```

### Frontend
1. Start backend: `python main.py`
2. Start frontend: `npm run dev`
3. Navigate to PVC-I dashboard
4. Switch to "Plant-Wide (ISA 18.2)" mode
5. Event Statistics cards should appear below ISA Health cards

## Maintenance

- Event statistics are regenerated when running `generate_complete_corrected_json.py`
- To update separately: `python scripts/add_event_statistics.py`
- Classification rules defined in `isa18_csv_reader.py`

---

**Generated:** 2025-10-11  
**Version:** 1.0  
**Author:** Alarm System Team
