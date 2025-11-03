# 📊 PVCI Agent Charts - Quick Reference

**Status**: ✅ FULLY OPERATIONAL  
**Last Updated**: November 3, 2025

---

## 🚀 Quick Start

Charts are **automatically generated** when you ask questions that can be visualized. No special syntax needed!

---

## 📝 Sample Queries That Generate Charts

### Bar Charts (Rankings/Comparisons)
```
✅ "Show me the top 10 alarm sources"
✅ "What are the worst sources by alarm count?"
✅ "Compare alarm counts across locations"
✅ "List most active sources"
```

### Line Charts (Trends Over Time)
```
✅ "Show alarm trend over the last 7 days"
✅ "Display alarm frequency timeline"
✅ "What's the hourly alarm pattern?"
✅ "Show me alarm history for January"
```

### Pie Charts (Distributions)
```
✅ "Show priority distribution"
✅ "What's the breakdown by condition?"
✅ "Display alarm percentage by type"
✅ "Show location distribution"
```

### Scatter Charts (Correlations)
```
✅ "Show correlation between alarm count and duration"
✅ "Plot alarms vs time windows"
✅ "Compare count against frequency"
```

---

## 🎯 How to Request Specific Chart Types

Use these keywords to get a specific chart type:

| Want This | Say This |
|-----------|----------|
| **Bar Chart** | "Show **bar chart** of..." |
| **Line Chart** | "Create **line chart** of..." |
| **Pie Chart** | "Display **pie chart** of..." |
| **Scatter Plot** | "Plot **scatter chart** of..." |

**Example**: *"Create a line chart of alarm trends"* → Guarantees line chart

---

## 🔍 Chart Detection Rules

The agent automatically detects when to create charts based on:

### 1. Explicit Requests (Confidence: 90%)
- Keywords: "chart", "graph", "plot", "visualize"
- Example: "Show me a chart of top sources"

### 2. Implicit Patterns

| Pattern | Chart Type | Confidence |
|---------|-----------|------------|
| "trend", "over time" | Line | 80% |
| "top", "most", "ranking" | Bar | 75% |
| "distribution", "breakdown" | Pie | 70% |
| "correlation", "vs" | Scatter | 65% |

### 3. Minimum Requirements
- ✅ At least **2 data points** required
- ✅ Confidence threshold: **60%**
- ❌ No chart if data is empty or invalid

---

## 🎨 Chart Features

### Auto-Formatting
- **Titles**: Extracted from your query
- **Labels**: Auto-formatted (e.g., "alarm_count" → "Alarm Count")
- **Sorting**: Bar charts sorted descending automatically
- **Colors**: Theme-aware (matches dashboard)

### Smart Limits
- **Bar charts**: Top 20 items
- **Pie charts**: Top 10 + "Others" category
- **Line charts**: All data points (up to 100)

### Interactivity
- ✅ Hover tooltips with detailed data
- ✅ Collapsible sections
- ✅ Light/dark mode compatible
- ✅ Responsive design

---

## 📊 Chart Types Explained

### Bar Chart (Vertical/Horizontal)
**Best For**: Rankings, comparisons, top-N lists  
**Auto-Selected When**: Query contains "top", "most", "ranking"  
**Layout**: Horizontal if >10 items, vertical otherwise

### Line Chart
**Best For**: Time series, trends, historical data  
**Auto-Selected When**: Query contains dates, "trend", "over time"  
**Features**: Smooth lines, multiple series support

### Pie Chart
**Best For**: Percentage distribution, breakdowns  
**Auto-Selected When**: Query contains "distribution", "breakdown"  
**Features**: Slices with labels, legend

### Scatter Chart
**Best For**: Correlation analysis, relationships  
**Auto-Selected When**: Query contains "correlation", "vs"  
**Features**: Points with optional names

---

## 🧪 Testing Your Charts

### Test in Agent Page
1. Start backend: `cd alarm_backend/PVCI-agent && python -m uvicorn main:app --reload`
2. Start frontend: `cd alarm_frontend && npm run dev`
3. Go to: `http://localhost:5173/agent`
4. Try sample queries above

### Run Unit Tests
```bash
cd alarm_backend/PVCI-agent
python test_chart_generation.py
```

Expected: `[SUCCESS] ALL TESTS PASSED`

---

## 🎛️ Configuration

### Adjust Chart Behavior

**Backend** (`glm_agent.py`):
```python
MIN_CONFIDENCE = 0.6      # Lower = more charts
MIN_DATA_POINTS = 2       # Minimum data required
```

**Chart Generator** (`chart_generator.py`):
```python
BAR_CHART_LIMIT = 20      # Max bars shown
PIE_CHART_LIMIT = 10      # Max slices (+ Others)
```

**Frontend** (`AgentInlineChart.tsx`):
```typescript
DEFAULT_HEIGHT = 300      // Chart height in pixels
```

---

## 🐛 Troubleshooting

### Chart Not Appearing?

**Check Data**:
- ✅ Tool returned at least 2 records
- ✅ Data has valid numeric/string fields
- ✅ No SQL errors

**Check Query**:
- ✅ Contains visualization keywords
- ✅ Confidence ≥ 60%
- ✅ Not a generic question (e.g., "Hello")

**Check Console**:
- Backend: Look for `[Chart Generation]` logs
- Frontend: Check browser console for errors

### Chart Type Not What Expected?

**Override with explicit request**:
- Instead of: "Show top sources"
- Say: "Show **bar chart** of top sources"

---

## 📚 Examples by Use Case

### Daily Monitoring
```
"Show me today's alarm trend"           → Line chart
"What are the top sources today?"       → Bar chart
"Priority breakdown for today"          → Pie chart
```

### Historical Analysis
```
"Alarm trend over last 30 days"         → Line chart
"Top 10 sources in January"             → Bar chart
"Monthly priority distribution"         → Pie chart
```

### Comparative Analysis
```
"Compare top 5 sources"                 → Bar chart
"Correlation between alarms and time"   → Scatter chart
"Show all priorities side by side"      → Bar chart
```

### Performance Review
```
"Worst performing sources this month"   → Bar chart
"Alarm frequency timeline"              → Line chart
"Priority distribution breakdown"       → Pie chart
```

---

## ✨ Pro Tips

1. **Be Specific**: "Top 10 sources" → Better chart than "Show sources"
2. **Use Time Frames**: "Last 7 days" → Better than "recent"
3. **Request Explicitly**: "Create bar chart" → Guaranteed chart type
4. **Check Tool Results**: Charts only generated if tool returns data
5. **Experiment**: Try different phrasings to see chart variations

---

## 📖 Additional Resources

- **Full Documentation**: `CHART_INTEGRATION_COMPLETE.md`
- **Implementation Plan**: `CHART_INTEGRATION_PLAN.md`
- **Backend Code**: `chart_generator.py` (382 lines)
- **Frontend Component**: `src/components/agent/AgentInlineChart.tsx`

---

## 🎉 Summary

**Charts make data visual and insights immediate.**

- ✅ Automatic detection
- ✅ 5 chart types supported
- ✅ Professional styling
- ✅ Fully tested and operational

**Just ask your question naturally, and the agent will visualize it!**

---

**Questions?** Check the full docs or run the test suite!
