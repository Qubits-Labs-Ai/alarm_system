"""FastAPI router for the PVC‑I agent (Phase 1)."""
from __future__ import annotations

from fastapi import APIRouter

from .schemas import AskRequest, AskResponse, Citation
from .data_store import store
from .llm import agent_llm
from .config import path_status

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
