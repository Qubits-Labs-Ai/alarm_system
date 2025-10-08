"""Agent configuration for PVC-I chatbot backend.
Defines model, temperature, and data file paths.
"""
from __future__ import annotations

import os
from pathlib import Path

# Points to alarm_backend/
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "PVCI-overall-health"

# JSON sources
PVCI_HEALTH_JSON = DATA_DIR / "pvcI-overall-health.json"
ISA18_SUMMARY_JSON = DATA_DIR / "isa18-flood-summary.json"

# Model configuration (aligned with existing backend env usage)
AGENT_MODEL: str = os.getenv("AGENT_MODEL") or os.getenv("INSIGHTS_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL: str | None = os.getenv("OPENAI_BASE_URL") or None

# Safety controls
TEMPERATURE: float = float(os.getenv("AGENT_TEMPERATURE", "0"))
MAX_TOOL_CALLS: int = int(os.getenv("AGENT_MAX_TOOL_CALLS", "3"))

# Utility

def path_status() -> dict:
    return {
        "base_dir": str(BASE_DIR),
        "pvci_health_json": str(PVCI_HEALTH_JSON),
        "isa18_summary_json": str(ISA18_SUMMARY_JSON),
        "pvci_health_exists": PVCI_HEALTH_JSON.exists(),
        "isa18_summary_exists": ISA18_SUMMARY_JSON.exists(),
    }
