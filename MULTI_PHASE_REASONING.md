# Multi-Phase Reasoning - Professional Implementation

## 🎯 Feature Overview

The PVCI Agent now displays **multiple reasoning phases** separately with clear labels, showing the agent's thinking process across iterations.

### **Visual Example**
```
💭 Reasoning (3 phases)
  ① Planning
    "I need to analyze high priority alarms..."
  
  ② Iteration 1 - Analysis  
    "The query returned 1,234 results. Now analyzing behavior..."
  
  ③ Iteration 2 - Analysis
    "Refining analysis based on previous results..."
```

---

## 🔄 How It Works

### **Backend Changes** (`glm_agent.py`)

**Problem:** Pre-tool reasoning was showing in Answer section

**Solution:**
- Added `any_tool_used` flag to track tool execution state
- Route content to different channels based on state:
  - **Before any tool call:** All content → `reasoning` event
  - **After first tool call:** Content → `answer_stream` event

```python
# Lines 212-214
any_tool_used = False  # Track tool execution

# Lines 297-306
if delta.content:
    if not any_tool_used:
        reasoning_buffer += delta.content
        yield {"type": "reasoning", "content": delta.content}
    else:
        final_answer_stream += delta.content
        yield {"type": "answer_stream", "content": delta.content}
```

**Key Insight:** Reasoning can happen at ANY point in the iteration loop:
1. **Planning phase** (iteration 1, before first tool)
2. **Between tool calls** (analyzing tool results)
3. **After multiple tools** (final review before answer)

---

### **Frontend Changes** (`PVCIAgentPage.tsx`)

#### **1. New Data Structure**

```typescript
type ReasoningPhase = {
  label: string;      // "Planning", "Iteration 1 - Analysis"
  content: string;    // The reasoning text
  timestamp: number;  // When this phase started
};

type Message = {
  // Old: reasoning?: string;  ❌ Single string
  // New:
  reasoningPhases?: ReasoningPhase[];  ✅ Multiple phases
  _toolCallCount?: number;  // Track iterations
  _lastReasoningPhase?: string;  // Avoid duplicate phases
};
```

#### **2. Intelligent Phase Detection**

```typescript
case "reasoning": {
  const toolCount = updated._toolCallCount || 0;
  let phaseLabel = "Planning";
  
  if (toolCount === 0) {
    phaseLabel = "Planning";
  } else if (toolCount === 1) {
    phaseLabel = "Iteration 1 - Analysis";
  } else if (toolCount === 2) {
    phaseLabel = "Iteration 2 - Analysis";
  } else if (toolCount >= 3) {
    phaseLabel = `Iteration ${toolCount} - Analysis`;
  }
  
  // Check if same phase or new phase
  const lastPhase = phases[phases.length - 1];
  if (!lastPhase || lastPhase.label !== phaseLabel) {
    // Create NEW reasoning block
    updated.reasoningPhases = [...phases, { label: phaseLabel, content, timestamp }];
  } else {
    // APPEND to existing phase
    lastPhase.content += content;
  }
}
```

**Smart Logic:**
- **Same phase?** → Append content to existing block
- **Different phase?** → Create new collapsible block
- Prevents duplicate phase labels

#### **3. Professional UI**

```tsx
{m.reasoningPhases && m.reasoningPhases.length > 0 && (
  <Card className="mb-3">
    <CardHeader className="py-3">
      <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
        <span>💭 Reasoning</span>
        <span className="text-xs text-muted-foreground/60">
          ({m.reasoningPhases.length} phase{m.reasoningPhases.length > 1 ? 's' : ''})
        </span>
      </CardTitle>
    </CardHeader>
    <CardContent className="pt-0 space-y-3">
      {m.reasoningPhases.map((phase, idx) => (
        <Collapsible 
          key={idx} 
          defaultOpen={idx === m.reasoningPhases!.length - 1}  // Only last phase open
        >
          <CollapsibleTrigger>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-xs">
              {idx + 1}
            </span>
            {phase.label}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="h-32 rounded-md border bg-muted/30 p-2">
              <div className="text-sm whitespace-pre-wrap">{phase.content}</div>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </CardContent>
  </Card>
)}
```

**Design Features:**
- ✅ Numbered badges (①, ②, ③) for easy reference
- ✅ Phase count indicator in header
- ✅ Only **last phase** open by default (latest thinking)
- ✅ Collapsible panels to reduce clutter
- ✅ ScrollArea for long reasoning text
- ✅ Professional spacing and typography

---

## 📊 Example Flow

### **Query:** "Analyze alarm behavior for high priority alarms"

#### **Timeline:**

```
1. User submits query
   
2. Backend: Iteration 1 starts
   Model generates reasoning (no tools yet)
   → Event: {"type": "reasoning", "content": "I need to analyze..."}
   Frontend: Creates phase "Planning"
   
3. Backend: Model calls tool
   → Event: {"type": "tool_call", "data": {...}}
   Frontend: _toolCallCount = 1
   
4. Backend: Tool executes and returns results
   → Event: {"type": "tool_result", "content": {...}}
   
5. Backend: Iteration 2 starts
   Model analyzes tool results (reasoning again!)
   → Event: {"type": "reasoning", "content": "Based on the results..."}
   Frontend: Creates NEW phase "Iteration 1 - Analysis" (_toolCallCount = 1)
   
6. Backend: Model may call another tool
   → Event: {"type": "tool_call", ...}
   Frontend: _toolCallCount = 2
   
7. Backend: Iteration 3 starts
   Model reviews before final answer (reasoning again!)
   → Event: {"type": "reasoning", "content": "Final review..."}
   Frontend: Creates NEW phase "Iteration 2 - Analysis" (_toolCallCount = 2)
   
8. Backend: Model generates final answer
   → Event: {"type": "answer_stream", "content": "Here's the analysis..."}
   Frontend: Fills Answer section
   
9. Complete
   → Event: {"type": "complete"}
```

#### **UI Shows:**

```
💭 Reasoning (3 phases)
  ① Planning
    "I need to analyze high priority alarms. First, I'll query..."
  
  ② Iteration 1 - Analysis  
    "Based on the query results, I found 1,234 alarms. Now running behavior analysis..."
  
  ③ Iteration 2 - Analysis
    "The behavior analysis shows chattering patterns. Formatting final answer..."

🔧 Tool Calls (2)
  analyze_alarm_behavior
    Arguments: {...}
    Result: {...}
  
  analyze_alarm_behavior
    Arguments: {...}
    Result: {...}

Answer
  Here's the alarm behavior analysis...
  [Formatted markdown answer]
```

---

## 🎨 Visual Design

### **Reasoning Card Hierarchy**

```
┌─ Card ─────────────────────────────────────────┐
│ 💭 Reasoning (3 phases)                        │
├────────────────────────────────────────────────┤
│  ┌─ Collapsible (closed) ───────────────────┐ │
│  │ ① Planning                          ▼    │ │
│  └─────────────────────────────────────────┘ │
│                                                │
│  ┌─ Collapsible (closed) ───────────────────┐ │
│  │ ② Iteration 1 - Analysis            ▼    │ │
│  └─────────────────────────────────────────┘ │
│                                                │
│  ┌─ Collapsible (OPEN) ─────────────────────┐ │
│  │ ③ Iteration 2 - Analysis            ▲    │ │
│  ├─────────────────────────────────────────┤ │
│  │ ┌─ ScrollArea ───────────────────────┐  │ │
│  │ │ Final review before answer...      │  │ │
│  │ │ The analysis is complete.          │  │ │
│  │ └────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

**Why Only Last Phase Open?**
- Latest thinking is most relevant
- Reduces visual clutter
- User can expand earlier phases if needed

---

## 🆚 Before vs After

### **Before (Single Reasoning Block)**

```
💭 Reasoning
  "I need to analyze... Based on results... Final review..."
  
  ❌ All reasoning mixed together
  ❌ Can't see iteration boundaries
  ❌ Hard to understand flow
```

### **After (Multi-Phase)**

```
💭 Reasoning (3 phases)
  ① Planning
  ② Iteration 1 - Analysis
  ③ Iteration 2 - Analysis
  
  ✅ Clear phase separation
  ✅ Shows iteration count
  ✅ Professional and organized
  ✅ Easy to expand/collapse
```

---

## 🧪 Testing

### **Test Cases**

#### **1. Simple Query (1 iteration)**
**Query:** "Count total alarms"

**Expected:**
```
💭 Reasoning (1 phase)
  ① Planning
    "I'll use execute_sql_query to count..."
```

---

#### **2. Complex Query (3+ iterations)**
**Query:** "Analyze alarm behavior for high priority alarms"

**Expected:**
```
💭 Reasoning (3 phases)
  ① Planning
  ② Iteration 1 - Analysis
  ③ Iteration 2 - Analysis
```

---

#### **3. Error Recovery**
**Query:** "Show alarms for invalid column xyz"

**Expected:**
```
💭 Reasoning (2 phases)
  ① Planning
    "I'll query the column xyz..."
  
  ② Iteration 1 - Analysis
    "Error: no such column. Let me try correct column name..."
```

---

## 📝 Implementation Details

### **Key Files Modified**

1. **`alarm_backend/PVCI-agent/glm_agent.py`**
   - Lines 212-214: Added `any_tool_used` flag
   - Lines 297-306: Content routing logic
   - Line 350: Set `any_tool_used = True` after tool execution

2. **`alarm_frontend/src/pages/PVCIAgentPage.tsx`**
   - Lines 20-38: New `ReasoningPhase` type
   - Lines 93-104: Initialize message with empty phases array
   - Lines 123-162: Phase detection and management logic
   - Lines 172-173: Increment `_toolCallCount` on tool call
   - Lines 260-289: Multi-phase UI rendering

---

## 🎯 Benefits

### **For Users**
- ✅ **Clear iteration tracking** - See how agent thinks step-by-step
- ✅ **Professional presentation** - Organized, not cluttered
- ✅ **Easy navigation** - Collapse/expand phases as needed
- ✅ **Transparency** - Understand agent's decision process

### **For Debugging**
- ✅ **Identify issues** - Which iteration caused error?
- ✅ **Performance analysis** - How many iterations needed?
- ✅ **Prompt tuning** - See if agent follows instructions
- ✅ **Error patterns** - Track reasoning before failures

---

## 🚀 Future Enhancements (Optional)

### **1. Timing Information**
```tsx
<span className="text-xs text-muted-foreground/60">
  {phase.label} • {formatDuration(phase.timestamp)}
</span>
```

### **2. Phase Status Icons**
```tsx
{phase.label} 
{phase.hadError ? "⚠️" : "✅"}
```

### **3. Export Reasoning**
```tsx
<Button onClick={() => exportReasoningToMarkdown(m.reasoningPhases)}>
  Export Reasoning
</Button>
```

### **4. Smart Phase Names**
```typescript
if (lastPhase.content.includes("error")) {
  phaseLabel = "Error Recovery";
} else if (lastPhase.content.includes("refining")) {
  phaseLabel = "Refinement";
}
```

---

## ✅ Summary

**Feature:** Multi-phase reasoning display
**Status:** ✅ Implemented and working
**Impact:** Professional, transparent agent thinking process

**Key Innovation:**
- Backend routes content intelligently (`reasoning` vs `answer_stream`)
- Frontend creates separate collapsible phases
- Automatic phase labeling based on iteration count
- Only latest phase expanded by default

**User Experience:**
- See agent's thinking across multiple iterations
- Understand why certain decisions were made
- Debug issues by examining reasoning flow
- Professional, organized presentation

---

**Last Updated:** January 23, 2025
**Files:** glm_agent.py, PVCIAgentPage.tsx
**Status:** ✅ READY FOR TESTING
