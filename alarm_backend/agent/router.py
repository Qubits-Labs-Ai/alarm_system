"""FastAPI router for the PVC‑I agent (Phase 1)."""
from __future__ import annotations

import os
import json
import asyncio
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator

from .schemas import AskRequest, AskResponse, Citation, StreamRequest
from .data_store import store
from .llm import agent_llm
from .config import path_status
from .pvci_agent_bridge import run_glm_agent, AVAILABLE_TOOLS, load_data, DB_FILE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pvci", tags=["agent-pvci"])


@router.get("/health")
def agent_health():
    paths = path_status()
    stats = store.stats()
    return {"paths": paths, "stats": stats}


@router.post("/reload")
def agent_reload():
    return store.reload()


@router.post("/ask", response_model=AskResponse)
def agent_ask(payload: AskRequest):
    result = agent_llm.ask(payload)
    return AskResponse(
        answer=result.get("answer", ""),
        citations=[Citation(**c) for c in result.get("citations", [])],
        used_tools=result.get("used_tools", []),
        meta=result.get("meta", {}),
    )


@router.post("/stream")
async def agent_stream(payload: StreamRequest):
    """
    SSE streaming endpoint for PVCI Agent.
    Yields events: reasoning, answer_stream, tool_call, tool_result, answer_complete, complete, error
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            logger.info(
                f"Agent stream started: sessionId={payload.sessionId}, "
                f"requestId={payload.requestId}, plant={payload.plant}"
            )
            # Send a small 'ready' event immediately so the client UI can clear spinners
            yield 'data: {"type": "ready", "message": "stream open"}\n\n'
            await asyncio.sleep(0)
            
            # Stream events from run_glm_agent
            async for event in run_glm_agent(
                query=payload.query,
                tools=AVAILABLE_TOOLS,
                model="z-ai/glm-4.5-air:free",  # Use GLM model as requested
                max_iterations=12  # Increased to 12 with intelligent retry budget
            ):
                # Enrich event with request metadata
                event_with_meta = {
                    **event,
                    "sessionId": payload.sessionId,
                    "requestId": payload.requestId,
                    "plant": payload.plant,
                }
                
                # Format as SSE
                yield f"data: {json.dumps(event_with_meta)}\n\n"
                
                # Log key events
                event_type = event.get("type")
                if event_type in ["tool_call", "answer_complete", "complete", "error"]:
                    logger.info(f"Event: {event_type} | requestId={payload.requestId}")
                
                # Allow cancellation
                await asyncio.sleep(0)
                
        except asyncio.CancelledError:
            logger.warning(f"Stream cancelled: requestId={payload.requestId}")
            yield f'data: {{"type": "error", "message": "Stream cancelled by client"}}\n\n'
        except Exception as e:
            logger.error(f"Stream error: {e} | requestId={payload.requestId}")
            yield f'data: {{"type": "error", "message": "{str(e)}"}}\n\n'
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("/reload-db")
def agent_reload_db():
    """
    Reload PVCI alerts data into SQLite database.
    Loads from ALARM_DATA_DIR/PVCI-merged/All_Merged.csv
    """
    try:
        # Get ALARM_DATA_DIR from parent main.py context
        backend_dir = os.path.dirname(os.path.dirname(__file__))
        alarm_data_dir = os.path.join(backend_dir, "ALARM_DATA_DIR")
        csv_path = os.path.join(alarm_data_dir, "PVCI-merged", "All_Merged.csv")
        
        if not os.path.exists(csv_path):
            raise HTTPException(
                status_code=404,
                detail=f"CSV file not found: {csv_path}"
            )
        
        logger.info(f"Reloading PVCI data from {csv_path}")
        success = load_data(file_path=csv_path)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to load data into database"
            )
        
        # Get row count from DB
        import sqlite3
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM alerts")
        row_count = cursor.fetchone()[0]
        conn.close()
        
        logger.info(f"Database reloaded: {row_count} rows")
        
        return {
            "status": "success",
            "message": f"Loaded {row_count} rows into alerts database",
            "db_path": DB_FILE,
            "csv_path": csv_path,
            "row_count": row_count,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reload DB error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
