# Event Statistics - Quick Start

## 🚀 TO SEE THE NEW EVENT STATISTICS CARDS:

### 1. Restart Backend (REQUIRED!)
```bash
# Stop current backend (Ctrl+C)
# Then restart:
cd D:\Qbit-dynamics\alarm_system\alarm_backend
python main.py
```

### 2. Open Dashboard
- URL: http://localhost:8080/dashboard (or your URL)
- Plant: **PVC-I**
- Mode: **Plant-Wide (ISA 18.2)**

### 3. Look for New Section
Below ISA Health cards, you'll see:

## 📊 Event Statistics Section

### 4 Cards:
1. **Total Records** - 934,098 (all CSV entries)
2. **Actual Alarms** - 8.0% (74,529 alarms)
3. **Operator Actions** - 147,893 (ACK + OK)
4. **System Events** - 92.0% (859,569 events)

### Detailed Breakdown Card:
- Alarm Conditions: 90,055
- State Changes: 255,586
- Quality Issues: 74,664

---

## 🔧 Quick Fixes

### Cards not showing?
```bash
# 1. Verify JSON has data
python -c "import json; print('Has stats:', 'event_statistics' in json.load(open('D:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-overall-health/isa18-flood-summary-enhanced.json')))"

# 2. Test API
cd D:\Qbit-dynamics\alarm_system\alarm_backend
python scripts\test_api.py

# 3. Clear browser cache
# Press Ctrl+Shift+R in browser
```

### Regenerate stats if missing:
```bash
cd D:\Qbit-dynamics\alarm_system\alarm_backend
python scripts\add_event_statistics.py
```

---

## 📋 What It Shows

**Key Insight:** Only 8% of CSV records are actual alarms!
- 92% are operator actions (ACK, OK) and system events (CHANGE, NORMAL)
- ISA 18.2 health uses only the 8% actual alarms
- This explains why your plant is healthier than raw counts suggest

---

## ✅ Verification Checklist

- [ ] Backend restarted
- [ ] Browser cache cleared
- [ ] In PVC-I Plant-Wide mode
- [ ] Event Statistics section visible
- [ ] 4 cards showing data
- [ ] Detailed breakdown card present

---

**Need more help?** See `RESTART_INSTRUCTIONS.md`
