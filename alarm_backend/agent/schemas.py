"""Pydantic schemas for PVC-I agent requests and responses."""
from __future__ import annotations

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    query: str = Field(..., description="Natural language question about PVC‑I health")
    top_n: Optional[int] = Field(50, ge=1, le=1000)
    start_time: Optional[str] = Field(None, description="ISO-8601 start time for windowed queries")
    end_time: Optional[str] = Field(None, description="ISO-8601 end time for windowed queries")


class Citation(BaseModel):
    source: str
    key: Optional[str] = None
    note: Optional[str] = None


class AskResponse(BaseModel):
    answer: str
    citations: List[Citation] = Field(default_factory=list)
    used_tools: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)


# Optional tool result DTOs (reserved for Phase 2+)
class OverallHealthResult(BaseModel):
    simple_pct: float
    weighted_pct: float
    totals: Dict[str, Any]


class LowestIsaDayResult(BaseModel):
    date: str
    isa_health_pct: float


class WorstFileResult(BaseModel):
    filename: str
    health_pct: float
