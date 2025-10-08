"""Lightweight data access layer for agent tools (Phase 1).
Loads and caches PVC‑I JSON files with simple helpers.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

from .config import PVCI_HEALTH_JSON, ISA18_SUMMARY_JSON


class DataStore:
    def __init__(self) -> None:
        self._pvci_data: Optional[Dict[str, Any]] = None
        self._isa_data: Optional[Dict[str, Any]] = None
        self._pvci_mtime: Optional[float] = None
        self._isa_mtime: Optional[float] = None
        # Attempt initial load (best-effort)
        try:
            self._load_if_changed()
        except Exception:
            pass

    def _read_json(self, path: Path) -> Dict[str, Any]:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _load_if_changed(self) -> None:
        # PVCI health
        if PVCI_HEALTH_JSON.exists():
            mtime = os.path.getmtime(PVCI_HEALTH_JSON)
            if self._pvci_mtime is None or mtime != self._pvci_mtime:
                self._pvci_data = self._read_json(PVCI_HEALTH_JSON)
                self._pvci_mtime = mtime
        # ISA18 summary
        if ISA18_SUMMARY_JSON.exists():
            mtime = os.path.getmtime(ISA18_SUMMARY_JSON)
            if self._isa_mtime is None or mtime != self._isa_mtime:
                self._isa_data = self._read_json(ISA18_SUMMARY_JSON)
                self._isa_mtime = mtime

    def reload(self) -> Dict[str, Any]:
        self._pvci_mtime = None
        self._isa_mtime = None
        self._load_if_changed()
        return self.stats()

    def stats(self) -> Dict[str, Any]:
        return {
            "pvci_loaded": self._pvci_data is not None,
            "isa_loaded": self._isa_data is not None,
            "pvci_generated_at": (self._pvci_data or {}).get("generated_at"),
            "isa_generated_at": (self._isa_data or {}).get("generated_at"),
            "pvci_keys": list((self._pvci_data or {}).keys())[:10],
            "isa_keys": list((self._isa_data or {}).keys())[:10],
        }

    # Raw accessors
    def get_pvci_data(self) -> Optional[Dict[str, Any]]:
        self._load_if_changed()
        return self._pvci_data

    def get_isa_data(self) -> Optional[Dict[str, Any]]:
        self._load_if_changed()
        return self._isa_data

    # Structured helpers (safe)
    def get_pvci_overall(self) -> Optional[Dict[str, Any]]:
        data = self.get_pvci_data() or {}
        return data.get("overall")

    def get_files(self):
        data = self.get_pvci_data() or {}
        return data.get("files") or []

    def get_per_source(self):
        data = self.get_pvci_data() or {}
        return data.get("per_source") or {}

    def get_by_day(self):
        data = self.get_isa_data() or {}
        return data.get("by_day") or []

    # ISA helpers
    def get_isa_overall(self):
        data = self.get_isa_data() or {}
        return data.get("overall") or {}

    def get_isa_windows(self):
        """Return array of per-window summaries if present.

        Some dumps may use key name 'records', others 'windows'. Return whichever exists.
        """
        data = self.get_isa_data() or {}
        windows = data.get("records")
        if isinstance(windows, list) and windows:
            return windows
        windows = data.get("windows")
        if isinstance(windows, list) and windows:
            return windows
        return []


# Singleton store
store = DataStore()
