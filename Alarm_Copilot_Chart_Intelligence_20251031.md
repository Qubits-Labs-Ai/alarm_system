# 📊 Alarm Management Copilot — Chart Generation Intelligence

### 🕒 Generated: 2025-11-01 11:33:44

---

## 🎯 Objective of Chart Generation
The copilot should:
- Detect when visualization adds value.
- Automatically generate charts when they improve understanding.
- Skip charts for explanatory or definition-based questions.

---

## 🧠 When to Show Charts

| Intent Type | Example Query | Chart Needed? | Chart Type |
|--------------|----------------|----------------|-------------|
| **Descriptive / Fact-based** | “What is an alarm?” / “Define chattering alarm.” | ❌ No | — |
| **Count or KPI Query** | “Show alarms per 10 minutes today.” | ✅ Yes | Bar / Line |
| **Trend / Comparison Query** | “Compare alarm rate this week vs last week.” | ✅ Yes | Line / Area |
| **Distribution / Priority Mix** | “How many alarms per priority?” | ✅ Yes | Pie / Bar |
| **Root cause or correlation** | “Which tags cause most floods?” | ✅ Yes | Pareto / Horizontal Bar |
| **Text analysis or summary** | “Explain current alarm situation.” | ❌ (optional mini chart) | Text only |
| **Performance benchmarking** | “Are we above flood threshold this week?” | ✅ Yes | Threshold Line + Line Chart |

---

## ⚙️ Decision Logic (Pseudo Code)

```python
def should_show_chart(user_query):
    chart_keywords = ["trend", "compare", "distribution", "rate", "count",
                      "ratio", "per", "daily", "weekly", "pattern", "top", "summary"]
    descriptive_keywords = ["define", "what is", "explain", "describe", "how does"]
    
    query = user_query.lower()
    
    if any(word in query for word in descriptive_keywords):
        return False
    if any(word in query for word in chart_keywords):
        return True
    return False

def select_chart_type(user_query):
    if "trend" in user_query or "over time" in user_query:
        return "line"
    if "distribution" in user_query or "priority" in user_query:
        return "bar"
    if "compare" in user_query:
        return "grouped_bar"
    if "ratio" in user_query or "percentage" in user_query:
        return "pie"
    return "bar"  # default fallback
```

---

## 📊 Supported Chart Types

| Chart Type | Use-Case | Example |
|-------------|-----------|----------|
| **Line Chart** | Trends over time | Alarms per hour, Flood trends |
| **Bar Chart** | Count comparison | Alarms per tag, Alarms per priority |
| **Stacked Bar** | Multiple attributes comparison | Priority distribution per shift |
| **Pie / Donut Chart** | Percentage distribution | Alarm types or sources |
| **Area Chart** | Overlapping alarm rates | Normal vs flood comparison |
| **Histogram** | Frequency distribution | Alarm durations or delays |
| **Pareto Chart (Bar + Line)** | Root cause ranking | Top 10 noisy alarms |

---

## 🧩 Example Behavior

### 🔹 Query 1
> “What is a chattering alarm?”  
➡ **Text only.**

### 🔹 Query 2
> “Show alarm rate trend for the last 24 hours.”  
➡ **Line Chart + Summary.**

### 🔹 Query 3
> “Compare flood conditions between Monday and Tuesday.”  
➡ **Grouped Bar Chart + Text Insight.**

---

## 🧠 Flow Overview

```
User Query → Intent Classification → Chart Decision
             → Data Query → Chart Rendering → Response with Context
```

---

## 🎨 Chart Presentation Rules

- Auto color mapping for alarm priority or tag.
- Include threshold line for ISA-18.2 limits.
- Provide tooltip/legend for interactive charts.
- Add textual summary (e.g., “Critical alarms = 45%”).

---

## 💡 Enhancements

- Confidence threshold (chart only if enough data).
- “Show in chart” command for manual override.
- Cache frequent queries (alarms/hour).
- Auto-insights after charts (e.g., detect anomalies).

---

## ✅ Summary

| Component | Description |
|------------|--------------|
| **Decision Engine** | Detects need for chart |
| **Chart Type Selector** | Chooses best visualization |
| **Query Engine** | Fetches grouped data |
| **Chart Generator** | Renders with libraries (Matplotlib/Plotly) |
| **Response Composer** | Combines chart + insights |
| **Smart Rules** | Avoids charts for simple definitions |
