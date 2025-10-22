# PVCI Agent Integration Guide

## Overview

The PVCI Agent is a professional SQL analysis agent with real-time streaming capabilities, integrated into the Plant Health Monitoring Dashboard. It provides ChatGPT-style interaction for analyzing alarm data.

## Architecture

### Backend Components

**Location**: `alarm_backend/PVCI-agent/`

1. **glm_agent.py** - Core streaming agent
   - Uses OpenRouter GLM-4.5-air model
   - Streams events: `reasoning`, `answer_stream`, `tool_call`, `tool_result`, `answer_complete`, `complete`, `error`
   - Supports OPENROUTER_API_KEY (preferred) or OPENAI_API_KEY (fallback)

2. **data_tools.py** - SQLite tools
   - `execute_sql_query(sql_query)` - SELECT-only SQL execution
   - `analyze_alarm_behavior(sql_query)` - Alarm logic analysis
   - Database: `PVCI-agent/alerts.db` (SQLite)
   - Data source: `ALARM_DATA_DIR/PVCI-merged/All_Merged.csv`

3. **alarm_logic.py** - Analysis algorithms
   - Per-source classification (active, stale, chattering)
   - Unhealthy detection (>=10 alarms in 10 minutes)
   - Bad actor identification
   - Flood detection (>=50 total alarms in window)

**Integration Bridge**: `alarm_backend/agent/pvci_agent_bridge.py`
- Imports PVCI-agent modules using `importlib` (bypasses hyphen in folder name)
- Exports: `run_glm_agent`, `AVAILABLE_TOOLS`, `load_data`, `DB_FILE`

### API Endpoints

**Base**: `/agent/pvci/`

1. **POST /stream** - SSE streaming endpoint
   - Request: `{query, plant, sessionId, requestId}`
   - Response: `text/event-stream`
   - Events: JSON lines with `data: {...}\n\n` format
   - Auto-enriches events with `sessionId`, `requestId`, `plant`

2. **POST /reload-db** - Reload alerts database
   - Loads CSV into SQLite
   - Returns: `{status, message, db_path, csv_path, row_count}`

3. **GET /health** - Health check (existing)
4. **POST /ask** - Non-streaming endpoint (existing, for RAG mode)

### Frontend Components

**Location**: `alarm_frontend/src/components/agent/`

1. **AgentPanel.tsx** - Main modal container
   - Manages chat state and streaming
   - Handles user input and message history
   - Displays session ID

2. **ChatThread.tsx** - Message list with auto-scroll
   - Empty state with suggestions
   - Renders all messages

3. **MessageRow.tsx** - Individual message display
   - Collapsible reasoning panel
   - Tool call/result display
   - Streaming indicator (blinking cursor)

**API Client**: `alarm_frontend/src/api/agentSSE.ts`
- `streamAgentQuery()` - Connect to SSE endpoint
- `generateRequestId()` / `generateSessionId()` - ID generators
- Typed event interfaces

### UI Integration

**Dashboard Button**: PVC-I only (line 715-724 in `DashboardPage.tsx`)
- Shows when `selectedPlant.id === 'pvcI'`
- Opens AgentPanel modal on click
- Green theme aligned with existing design

## Event Flow

```
User sends query
  ↓
Frontend: streamAgentQuery(query, plant, sessionId, requestId)
  ↓
Backend: /agent/pvci/stream receives POST
  ↓
run_glm_agent() streams events:
  1. reasoning (thinking/planning)
  2. tool_call (SQL query to execute)
  3. tool_result (query result preview, 500 chars)
  4. answer_stream (token-by-token response)
  5. answer_complete (final answer)
  6. complete (iteration count)
  ↓
Frontend: Updates UI in real-time
  - Shows reasoning in collapsible panel
  - Displays tool status
  - Streams answer with typing effect
  - Shows errors if any
```

## Database Schema

**Table**: `alerts`

**Columns**:
- `Event Time` (datetime)
- `Location Tag` (text, UPPERCASE)
- `Source` (text, UPPERCASE)
- `Condition` (text, UPPERCASE)
- `Action` (text, UPPERCASE)
- `Priority` (text, UPPERCASE)
- `Description` (text)
- `Value` (numeric)
- `Units` (text, UPPERCASE)

**Notes**:
- All text columns normalized to UPPERCASE
- SELECT-only queries enforced
- Results limited to 10 rows in tool output

## Environment Setup

**Required**: `alarm_backend/.env`

```env
# Preferred (OpenRouter GLM)
OPENROUTER_API_KEY=sk-or-v1-...

# Fallback (OpenAI compatible)
OPENAI_API_KEY=sk-...
```

**Optional**: Base URL override
```env
OPENAI_BASE_URL=https://openrouter.ai/api/v1
```

## Data Loading

### Initial Load (Automatic)
Backend initializes DB on first import of `pvci_agent_bridge`.

### Manual Reload
```bash
curl -X POST http://localhost:8000/agent/pvci/reload-db
```

Or via frontend: call `/agent/pvci/reload-db` endpoint

**Source CSV**: `alarm_backend/ALARM_DATA_DIR/PVCI-merged/All_Merged.csv`

## Usage Examples

### User Queries

1. **Top sources**:
   ```
   Show me the top 10 sources by alarm count
   ```

2. **Alarm analysis**:
   ```
   Analyze alarm behavior for high priority alarms
   ```

3. **Location insights**:
   ```
   What are the most active locations?
   ```

4. **Chattering detection**:
   ```
   List alarms with chattering behavior
   ```

### Expected Flow

1. User types query and clicks "Send"
2. "Reasoning" panel shows thinking (collapsible)
3. Tool status appears: "Tool: execute_sql_query"
4. Result preview shown (first 500 chars)
5. Answer streams token-by-token
6. Final answer appears with timestamp

## Security

- **API Keys**: Server-side only, never exposed to browser
- **CORS**: Currently `*` (tighten for production)
- **SQL Injection**: Prevented by SELECT-only enforcement and parameterized queries
- **Rate Limiting**: TODO - Add per-session/IP limits
- **Session Auth**: TODO - Integrate with existing auth system

## Performance

- **Streaming**: Real-time token delivery (<50ms latency)
- **Database**: SQLite with indexed columns (fast for <1M rows)
- **Tool Output**: Truncated to 500 chars for preview
- **Timeouts**: Server-side model timeout (default: GLM API limits)

## Testing Checklist

### Backend
- [ ] DB loads correctly from CSV
- [ ] `/agent/pvci/stream` returns SSE events
- [ ] `/agent/pvci/reload-db` refreshes data
- [ ] `execute_sql_query` rejects non-SELECT
- [ ] Tool returns valid JSON
- [ ] Env key fallback works

### Frontend
- [ ] "PVCI Agent" button appears on PVC-I
- [ ] Modal opens/closes correctly
- [ ] Messages display properly
- [ ] Streaming works (typing effect)
- [ ] Reasoning panel toggles
- [ ] Tool status shows
- [ ] Stop button cancels stream
- [ ] Session ID displayed

### Integration
- [ ] End-to-end query flow works
- [ ] Multiple queries in same session
- [ ] Cancel mid-stream
- [ ] Error handling displays
- [ ] Mobile responsive

## Troubleshooting

### "API key missing" error
- Check `alarm_backend/.env` has `OPENROUTER_API_KEY` or `OPENAI_API_KEY`
- Restart backend after adding key

### "DB file not found" error
- Run `/agent/pvci/reload-db` endpoint
- Check CSV exists at `ALARM_DATA_DIR/PVCI-merged/All_Merged.csv`

### No streaming events
- Check browser console for SSE errors
- Verify CORS allows localhost:5173 (or your frontend port)
- Check backend logs for exceptions

### Tool results empty
- Verify DB has data: `sqlite3 PVCI-agent/alerts.db "SELECT COUNT(*) FROM alerts;"`
- Check SQL query syntax in reasoning panel

## Future Enhancements

- [ ] Download full CSV of tool results (by requestId)
- [ ] Table renderer for tool results in UI
- [ ] Per-session rate limiting
- [ ] Auth gate for agent endpoints
- [ ] Metrics/logging dashboard
- [ ] Multi-turn conversation context
- [ ] Tool result caching
- [ ] Advanced visualizations from queries

## Maintenance

**Update data**: Re-run `/agent/pvci/reload-db` when new CSV is available

**Update model**: Change `model` parameter in `router.py` line 63

**Update tools**: Add new functions to `AVAILABLE_TOOLS` in `data_tools.py`

**Update prompt**: Modify `SYSTEM_PROMPT` in `glm_agent.py`
