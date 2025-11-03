# PVCI Agent Inline Charts System - Implementation Plan

## 📋 Overview

Add **inline chart generation** to PVCI Agent. When users ask questions that can be visualized, the agent automatically generates and displays charts inline with the response.

---

## 🎯 Goals

1. **Automatic Detection**: Agent detects when visualization enhances understanding
2. **Real-time Generation**: Charts generated during streaming response
3. **Multiple Types**: Support line, bar, pie, scatter charts
4. **Seamless Integration**: Charts appear inline with text
5. **Explicit Requests**: Handle "create chart", "show graph", etc.

---

## 🏗️ Architecture Flow

```
User Query → Intent Analyzer → Data Processor → Chart Generator → SSE Stream → Frontend Renderer
```

---

## 📦 Implementation Components

### 1. Backend: Chart Intent Detection

**File**: `glm_agent.py`

Add function to detect when charts should be generated:

```python
def detect_chart_intent(query: str) -> Dict[str, Any] | None:
    """Detect if query should generate a chart."""
    ql = query.lower()
    
    # Explicit requests
    if any(kw in ql for kw in ["chart", "graph", "plot", "visualize"]):
        return {"should_chart": True, "chart_type": detect_specific_type(query), "confidence": 0.9}
    
    # Implicit opportunities
    if any(kw in ql for kw in ["trend", "over time", "history"]):
        return {"should_chart": True, "chart_type": "line", "confidence": 0.8}
    
    if any(kw in ql for kw in ["top", "most", "compare", "ranking"]):
        return {"should_chart": True, "chart_type": "bar", "confidence": 0.7}
    
    if any(kw in ql for kw in ["distribution", "breakdown", "percentage"]):
        return {"should_chart": True, "chart_type": "pie", "confidence": 0.7}
    
    return None
```

### 2. Backend: Chart Data Generator

**File**: `chart_generator.py` (NEW)

```python
"""Generate Recharts-compatible chart configurations."""

def generate_chart_data(chart_type: str, data: List[Dict], query: str = "") -> Dict:
    """Generate chart config from SQL results."""
    
    if chart_type == "bar":
        return {
            "type": "bar",
            "data": data[:20],  # Limit to top 20
            "config": {
                "xKey": auto_detect_label_key(data),
                "yKeys": auto_detect_value_keys(data),
                "title": extract_title_from_query(query),
                "layout": "vertical" if len(data) > 10 else "horizontal",
                "colors": ["hsl(var(--chart-1))"],
                "height": 350
            }
        }
    
    # Similar for line, pie, scatter...
```

### 3. Backend: Stream Chart Event

**File**: `glm_agent.py` - Modify `stream_query()`

```python
async def stream_query(query: str, plant: str = "PVCI", **kwargs):
    # ... existing code ...
    
    # After tool execution
    chart_intent = detect_chart_intent(query)
    
    if chart_intent and chart_intent["confidence"] >= 0.6:
        tool_data = tool_result.get("data", [])
        
        if len(tool_data) >= 2:  # Need at least 2 data points
            from .chart_generator import generate_chart_data
            
            chart_payload = generate_chart_data(
                chart_type=chart_intent["chart_type"],
                data=tool_data,
                query=query
            )
            
            # Stream chart event
            yield {
                "type": "chart_data",
                "data": chart_payload
            }
```

### 4. Frontend: Update Event Types

**File**: `agentSSE.ts`

```typescript
export type AgentEventType =
  | 'reasoning'
  | 'answer_stream'
  | 'tool_call'
  | 'tool_result'
  | 'chart_data'        // NEW
  | 'answer_complete'
  | 'complete'
  | 'error';

export interface ChartDataPayload {
  type: 'line' | 'bar' | 'pie' | 'scatter';
  data: Array<Record<string, any>>;
  config: {
    xKey?: string;
    yKeys?: string[];
    title: string;
    colors?: string[];
    height?: number;
    layout?: 'horizontal' | 'vertical';
  };
}
```

### 5. Frontend: Handle Chart Events

**File**: `PVCIAgentPage.tsx`

```typescript
// Add to Message type
type Message = {
  // ... existing fields ...
  charts?: ChartDataPayload[];  // NEW
};

// In onEvent handler
case "chart_data": {
  const chartPayload = event.data as ChartDataPayload;
  updated.charts = [...(updated.charts || []), chartPayload];
  updated._openSection = `chart-${(updated.charts || []).length - 1}`;
  return updated;
}
```

### 6. Frontend: Create Chart Component

**File**: `components/agent/AgentInlineChart.tsx` (NEW)

```tsx
import { LineChart, BarChart, PieChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  chartData: ChartDataPayload;
}

export const AgentInlineChart: React.FC<Props> = ({ chartData }) => {
  const { type, data, config } = chartData;

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={data} layout={config.layout}>
            <XAxis dataKey={config.xKey} />
            <YAxis />
            <Tooltip />
            {config.yKeys?.map((key, idx) => (
              <Bar key={key} dataKey={key} fill={config.colors?.[idx]} />
            ))}
          </BarChart>
        );
      // Similar for line, pie...
    }
  };

  return (
    <Card className="border border-border/60 my-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{config.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={config.height || 300}>
          {renderChart()}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
```

### 7. Frontend: Render Charts in Message

**File**: `PVCIAgentPage.tsx` - In `renderMessage()`

```tsx
{/* After tool results, before answer */}
{m.charts && m.charts.length > 0 && (
  <div className="mb-3 space-y-2">
    {m.charts.map((chart, idx) => (
      <Collapsible key={idx} open={isOpen(`chart-${idx}`)}>
        <CollapsibleTrigger className="flex items-center w-full px-3 py-2 bg-muted/30">
          <span className="text-xs font-medium">📊 {chart.config.title}</span>
          <ChevronDown className="h-4 w-4 ml-auto" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <AgentInlineChart chartData={chart} />
        </CollapsibleContent>
      </Collapsible>
    ))}
  </div>
)}
```

---

## 📊 Supported Chart Types

| Type | Triggers | Example Query |
|------|----------|---------------|
| **Bar** | "top", "most", "compare" | "Top 10 sources by count" |
| **Line** | "trend", "over time" | "Alarm frequency trend" |
| **Pie** | "distribution", "breakdown" | "Priority breakdown" |
| **Scatter** | "correlation", "relationship" | "Alarms vs duration" |

---

## 🚀 Implementation Steps

### Phase 1: Core Infrastructure ✅ COMPLETE
1. ✅ Create `chart_generator.py` with `generate_chart_data()` function
2. ✅ Add `detect_chart_intent()` to `glm_agent.py`
3. ✅ Update `stream_query()` to yield chart_data events
4. ✅ Update `agentSSE.ts` event types
5. ✅ Create `AgentInlineChart.tsx` component
6. ✅ Handle chart events in `PVCIAgentPage.tsx`
7. ✅ Render charts in message bubbles

### Phase 2: Testing 🔄 IN PROGRESS
- Test explicit chart requests: "Show bar chart of top sources"
- Test implicit detection: "What are the top sources?" → auto bar chart
- Test edge cases: 0 results, 1 result, malformed data

### Phase 3: Polish
- Add collapsible chart sections
- Implement download/export
- Add error handling
- Optimize performance

---

## 🧪 Test Queries

**Explicit Requests**:
- "Show me a bar chart of top 10 sources"
- "Create a line chart of alarm trends over last 7 days"
- "Plot priority distribution as pie chart"

**Implicit Detection**:
- "What are the top sources?" → Bar chart
- "Show alarm frequency over time" → Line chart
- "Priority breakdown" → Pie chart

**Edge Cases**:
- "Top sources" with 0 results → No chart
- Non-visual query → Text only
- SQL error → Fallback to text

---

## ⚡ Performance Considerations

- **Data Limiting**: Max 100 points per chart (aggregate if more)
- **Lazy Loading**: Render charts only when visible
- **Error Handling**: Non-critical failures don't break response
- **Streaming**: Send chart as soon as data available

---

## 🎨 UI/UX Guidelines

- Match existing dashboard chart styles
- Use theme colors (`hsl(var(--chart-1))`, etc.)
- Responsive design (mobile-friendly)
- Dark/light mode compatible
- Collapsible by default
- Show tooltips on hover

---

## 📝 Example End-to-End Flow

**Query**: "Show top 10 sources by alarm count"

1. **Detection**: Keywords "top 10" + "count" → Bar chart (confidence: 0.85)
2. **Tool**: `analyze_bad_actors(limit=10)` → Returns 10 sources
3. **Generation**: Bar chart config created (vertical bars, sorted)
4. **Streaming**: `chart_data` event sent
5. **Rendering**: Collapsible bar chart displayed in agent response

---

## 🐛 Error Handling

| Error | Handling |
|-------|----------|
| No data | Skip chart, text only |
| Invalid format | Log warning, text only |
| Generation crash | Catch exception, continue |
| Render error | Show placeholder |

---

## 📚 Dependencies

**Backend**: No new dependencies required

**Frontend**: 
- ✅ `recharts` (already installed)
- ✅ React/TypeScript (already installed)

---

## 🎯 Success Metrics

1. Chart generation rate: % of queries that produce charts
2. Auto-detection accuracy: % correct predictions
3. User engagement: Chart interaction rate
4. Performance: Render time < 500ms
5. Error rate: < 1% chart generation failures

---

## 📖 Next Steps

1. Review this plan
2. Create `chart_generator.py` file
3. Implement chart intent detection
4. Add streaming support
5. Create frontend component
6. Test with sample queries
7. Iterate based on feedback

---

**Estimated Timeline**: 2-3 weeks
**Priority**: Medium-High (enhances user experience significantly)
**Risk**: Low (non-breaking, graceful fallbacks)
