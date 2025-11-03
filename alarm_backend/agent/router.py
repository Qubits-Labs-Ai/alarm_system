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
from . import pvci_agent_bridge as bridge

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


@router.get("/validate")
def agent_validate(plant: str = "PVCI", period: str = "all"):
    try:
        dt = bridge.data_tools
        freq_cache = None
        cache_params = None
        fcr = json.loads(dt.get_frequency_summary_cached(plant_id=plant, period=period, validate=False))
        if isinstance(fcr, dict) and fcr.get("source") in ("cache", "cache-valid"):
            freq_obj = (fcr.get("frequency") or {})
            freq_cache = freq_obj.get("summary")
            cache_params = freq_obj.get("params")
        # Default DB metrics (period-based)
        fdb = json.loads(dt.get_frequency_summary_cached(plant_id=plant, period=period, force_db=True))
        freq_db = (fdb.get("frequency") or {}).get("summary")
        runtime_params = ((fdb.get("frequency") or {}).get("params") or {})

        # Date-aligned recompute if cache has daily table
        cache_path = None
        try:
            if hasattr(dt, "_resolve_actual_calc_json_path"):
                cache_path = dt._resolve_actual_calc_json_path(plant)
        except Exception:
            cache_path = None
        date_aligned_db = None
        try:
            if cache_path and os.path.exists(cache_path):
                with open(cache_path, "r", encoding="utf-8", errors="ignore") as f:
                    raw = json.load(f)
                freq_block = raw.get("frequency") if isinstance(raw, dict) else None
                apd = (freq_block or {}).get("alarms_per_day") if isinstance(freq_block, dict) else None
                dates = []
                if isinstance(apd, list) and apd:
                    for rec in apd:
                        if isinstance(rec, dict):
                            dv = rec.get("Date") or rec.get("date") or rec.get("day")
                            if isinstance(dv, str) and len(dv) >= 8:
                                dates.append(dv[:10])
                elif isinstance(apd, dict):
                    dates = list(apd.keys())
                if dates and hasattr(dt, "_db_frequency_kpis_for_dates"):
                    date_aligned_db = dt._db_frequency_kpis_for_dates(dates)
        except Exception:
            date_aligned_db = None
        if isinstance(date_aligned_db, dict):
            freq_db = date_aligned_db

        def r2(x):
            try:
                return round(float(x), 2)
            except Exception:
                return 0.0

        freq_diff = {}
        freq_match = None
        if freq_cache and freq_db:
            exact = ["total_unique_alarms", "days_over_288_count", "days_unacceptable_count", "total_days_analyzed"]
            approx = ["avg_alarms_per_day", "avg_alarms_per_hour", "avg_alarms_per_10min"]
            ok = True
            for k in exact:
                ca = int(freq_cache.get(k, -1))
                db = int(freq_db.get(k, -2))
                if ca != db:
                    ok = False
                freq_diff[k] = {"cache": ca, "db": db, "diff": ca - db}
            for k in approx:
                ca = r2(freq_cache.get(k, 0))
                db = r2(freq_db.get(k, 0))
                if abs(ca - db) > 0.01:
                    ok = False
                freq_diff[k] = {"cache": ca, "db": db, "diff": round(ca - db, 2)}
            freq_match = ok

        params_match = None
        try:
            if cache_params and runtime_params:
                keys = ["iso_threshold", "unacceptable_threshold", "unhealthy_threshold", "window_minutes"]
                params_match = all(str(cache_params.get(k)) == str(runtime_params.get(k)) for k in keys)
        except Exception:
            params_match = None

        unc_cache = None
        ucr = json.loads(dt.get_unhealthy_summary_cached(plant_id=plant))
        if isinstance(ucr, dict) and ucr.get("source", "").startswith("cache"):
            unc_cache = (ucr.get("unhealthy") or {})
        udb = json.loads(dt.get_unhealthy_summary_cached(plant_id=plant, force_db=True))
        unc_db = (udb.get("unhealthy") or {})
        unhealthy_match = None
        unhealthy_diff = {}
        if unc_cache and unc_db:
            ca = int(unc_cache.get("total_periods", -1))
            db = int(unc_db.get("total_periods", -2))
            unhealthy_match = (ca == db)
            unhealthy_diff = {"total_periods": {"cache": ca, "db": db, "diff": ca - db}}

        fld_cache = None
        fcr = json.loads(dt.get_floods_summary_cached(plant_id=plant))
        if isinstance(fcr, dict) and fcr.get("source", "").startswith("cache"):
            fld_cache = (fcr.get("floods") or {})
        fdb = json.loads(dt.get_floods_summary_cached(plant_id=plant, force_db=True))
        fld_db = (fdb.get("floods") or {})
        floods_match = None
        floods_diff = {}
        if fld_cache and fld_db:
            ca = int(fld_cache.get("flood_count", -1))
            db = int(fld_db.get("flood_count", -2))
            floods_match = (ca == db)
            floods_diff = {"flood_count": {"cache": ca, "db": db, "diff": ca - db}}

        return {
            "status": "success",
            "plant": plant,
            "period": period,
            "frequency": {
                "match": freq_match,
                "cache_present": freq_cache is not None,
                "params_match": params_match,
                "diff": freq_diff,
                "db": freq_db,
            },
            "unhealthy": {
                "match": unhealthy_match,
                "cache_present": unc_cache is not None,
                "diff": unhealthy_diff,
            },
            "floods": {
                "match": floods_match,
                "cache_present": fld_cache is not None,
                "diff": floods_diff,
            },
        }
    except Exception as e:
        logger.error(f"Validate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
