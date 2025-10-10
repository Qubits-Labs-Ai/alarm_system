"""LLM wrapper with OpenAI function-calling and tool dispatch (Phase 2)."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple

from openai import OpenAI

from .config import AGENT_MODEL, TEMPERATURE, MAX_TOOL_CALLS, OPENAI_BASE_URL
from .prompts import SYSTEM_PROMPT
from .tools import (
    tool_overall_health,
    tool_lowest_isa_day,
    tool_worst_file,
    tool_unhealthy_sources_top,
    tool_window_source_details,
    tool_isa_overall,
    tool_isa_top_windows,
    tool_isa_day_summary,
    tool_compare_health_metrics,
    tool_unhealthy_breakdown,
    tool_calc_methodology,
)
from .schemas import AskRequest


def _make_client() -> OpenAI:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        # Create a dummy client; calls will still fail with clear error
        return OpenAI()
    if OPENAI_BASE_URL:
        return OpenAI(api_key=api_key, base_url=OPENAI_BASE_URL)
    return OpenAI(api_key=api_key)


TOOLS_SPEC: List[dict] = [
    {
        "type": "function",
        "function": {
            "name": "overall_health",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lowest_isa_day",
            "description": "Get the day with the lowest ISA health percentage.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "unhealthy_sources_top",
            "description": "Top incidents from per_source.unhealthy_bin_details in cached JSON (if available).",
            "parameters": {
                "type": "object",
                "properties": {
                    "top_n": {"type": "integer", "minimum": 1, "maximum": 1000},
                    "sort_by": {"type": "string", "enum": ["total_hits", "bins_count", "max_hits"]},
                    "windows_per_source": {"type": "integer", "minimum": 0, "maximum": 10}
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "window_source_details",
            "description": "Return per-source/location/condition counts for a time window using CSV events (ground truth).",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_time": {"type": "string", "description": "ISO-8601"},
                    "end_time": {"type": "string", "description": "ISO-8601"},
                    "top_n": {"type": "integer", "minimum": 1, "maximum": 1000}
                },
                "required": ["start_time", "end_time"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "isa_overall",
            "description": "Return ISA-18 method plant-wide overall metrics from isa18-flood-summary.json.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "isa_top_windows",
            "description": "Return top flood windows from ISA-18 method summary (records/windows).",
            "parameters": {
                "type": "object",
                "properties": {
                    "top_n": {"type": "integer", "minimum": 1, "maximum": 1000},
                    "sort_by": {"type": "string", "enum": ["peak_10min_count", "count", "duration"]}
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "isa_day_summary",
            "description": "Return ISA daily summary for a given date.",
            "parameters": {
                "type": "object",
                "properties": {"date": {"type": "string"}},
                "required": ["date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_health_metrics",
            "description": "Compare ISA-18 method with PVC-I method for the same plant (simple/weighted).",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "unhealthy_breakdown",
            "description": "Aggregate unhealthy incidents by a facet (location, condition, or source) from cached JSON.",
            "parameters": {
                "type": "object",
                "properties": {
                    "by": {"type": "string", "enum": ["location", "condition", "source"]},
                    "top_n": {"type": "integer", "minimum": 1, "maximum": 1000}
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calc_methodology",
            "description": "Return a concise description of how PVC-I plant-wide health is calculated.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

DISPATCH = {
    "overall_health": lambda args: tool_overall_health(),
    "lowest_isa_day": lambda args: tool_lowest_isa_day(),
    "worst_file": lambda args: tool_worst_file(),
    "unhealthy_sources_top": lambda args: tool_unhealthy_sources_top(
        int(args.get("top_n") or 50), str(args.get("sort_by") or "total_hits"), int(args.get("windows_per_source") or 0)
    ),
    "window_source_details": lambda args: tool_window_source_details(
        args.get("start_time"), args.get("end_time"), int(args.get("top_n") or 100)
    ),
    "isa_overall": lambda args: tool_isa_overall(),
    "isa_top_windows": lambda args: tool_isa_top_windows(
        int(args.get("top_n") or 10), str(args.get("sort_by") or "peak_10min_count")
    ),
    "isa_day_summary": lambda args: tool_isa_day_summary(str(args.get("date"))),
    "compare_health_metrics": lambda args: tool_compare_health_metrics(),
    "unhealthy_breakdown": lambda args: tool_unhealthy_breakdown(str(args.get("by") or "location"), int(args.get("top_n") or 20)),
    "calc_methodology": lambda args: tool_calc_methodology(),
}


class AgentLLM:
    def __init__(self) -> None:
        self.client = _make_client()

    def ask(self, payload: AskRequest) -> Dict[str, Any]:
        q = (payload.query or "").strip()
        messages: List[Dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": q},
        ]
        # Provide optional constraints as a separate message to guide tool selection
        hints: List[str] = []
        if payload.start_time and payload.end_time:
            hints.append(f"start_time={payload.start_time}")
            hints.append(f"end_time={payload.end_time}")
        if payload.top_n:
            hints.append(f"top_n={payload.top_n}")
        if hints:
            messages.append({"role": "user", "content": "Constraints: " + ", ".join(hints)})

        used_tools: List[str] = []
        citations: List[Dict[str, Any]] = []

        # Fast-path for common 'compare' intent to improve reliability and avoid multi-tool errors
        ql = q.lower()
        # Treat 'alarm' as synonymous with 'source' for per-source intent
        has_source_terms = any(
            t in ql
            for t in [
                "per-source",
                "per source",
                "source",
                "sources",
                "alarm",
                "alarms",
                "alarm source",
                "alarm sources",
                "tags",
                "tag",
                "tagnames",
                "tag name",
                "location",
                "condition",
            ]
        )
        # Extra cues for listing/ranking style questions (English + Roman-Urdu)
        has_ranking_terms = any(
            t in ql
            for t in [
                "top",
                "most",
                "max",
                "highest",
                "peak",
                "zyada",          # roman-Urdu: more/most
                "list",
                "ranking",
                "rank",
                "list karo",
                "dikhao",
                "dikha do",
                "dikhado",
            ]
        )
        has_unhealthy_terms = any(t in ql for t in ["unhealthy", "flood"]) 
        has_plant_terms = any(t in ql for t in [
            "isa", "plant-wide", "plant wide", "10-minute", "10 min", "10min", "window", "windows", "flood window", "percent time in flood"
        ])
        if ("compare" in ql) and ("isa" in ql) and ("pvc" in ql or "pvc-i" in ql):
            try:
                cmp_data = tool_compare_health_metrics() or {"data": {}, "citations": []}
                one_call_messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Using only the provided metrics for the SAME plant, write a concise comparison (bullets) between two calculation methods (ISA-18 method vs PVC-I method).\n"
                            "Metrics JSON: " + json.dumps(cmp_data.get("data", {}), ensure_ascii=False) + "\n"
                            "Do not invent numbers; include a short delta note."
                        ),
                    },
                ]
                resp = self.client.chat.completions.create(
                    model=AGENT_MODEL,
                    messages=one_call_messages,
                    temperature=TEMPERATURE,
                )
                choice = resp.choices[0]
                content = (choice.message.content or "").strip()
                return {
                    "answer": content or "Not available in current data.",
                    "citations": cmp_data.get("citations", []),
                    "used_tools": ["compare_health_metrics"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": getattr(choice, "finish_reason", None),
                        "mode": "single_call_compare",
                    },
                }
            except Exception as e:
                # Fall back to returning raw metrics to avoid 500
                cmp_data = cmp_data if 'cmp_data' in locals() else {"data": {}}
                return {
                    "answer": "Not available in current data.",
                    "citations": cmp_data.get("citations", []),
                    "used_tools": ["compare_health_metrics"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": f"error:{type(e).__name__}",
                    },
                }

        # General per-source fast-path: if user mentions alarm/source but not plant-wide terms,
        # default to top unhealthy sources to avoid ISA snapshot fallback on short queries like "alarm".
        if has_source_terms and not has_plant_terms:
            try:
                top_n = int(payload.top_n or 10)
                top_data = tool_unhealthy_sources_top(top_n=top_n, sort_by="total_hits", windows_per_source=2) or {"data": []}
                by_loc = tool_unhealthy_breakdown(by="location", top_n=10) or {"data": []}
                by_cond = tool_unhealthy_breakdown(by="condition", top_n=10) or {"data": []}
                citations = []
                for csrc in (top_data.get("citations") or []) + (by_loc.get("citations") or []) + (by_cond.get("citations") or []):
                    try:
                        citations.append({
                            "source": csrc.get("source"),
                            "key": csrc.get("key"),
                            "note": csrc.get("note"),
                        })
                    except Exception:
                        pass

                one_call_messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Using only the provided JSON, list the sources contributing most to unhealthiness (concise).\n"
                            "Include a brief overview and 5-8 key sources with inline numbers (no tables).\n"
                            "JSON top_sources: " + json.dumps(top_data.get("data", []), ensure_ascii=False) + "\n"
                            "JSON by_location: " + json.dumps(by_loc.get("data", []), ensure_ascii=False) + "\n"
                            "JSON by_condition: " + json.dumps(by_cond.get("data", []), ensure_ascii=False)
                        ),
                    },
                ]
                resp = self.client.chat.completions.create(
                    model=AGENT_MODEL,
                    messages=one_call_messages,
                    temperature=TEMPERATURE,
                )
                choice = resp.choices[0]
                content = (choice.message.content or "").strip()
                return {
                    "answer": content or "Not available in current data.",
                    "citations": citations,
                    "used_tools": ["unhealthy_sources_top", "unhealthy_breakdown"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": getattr(choice, "finish_reason", None),
                        "mode": "single_call_per_source_default",
                    },
                }
            except Exception as e:
                return {
                    "answer": "Not available in current data.",
                    "citations": [],
                    "used_tools": ["unhealthy_sources_top", "unhealthy_breakdown"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": f"error:{type(e).__name__}",
                    },
                }

        # Plant-window ranking intent: list Top ISA windows (avoid mixing with generic snapshot)
        if has_plant_terms and has_ranking_terms and not has_source_terms:
            try:
                top_n = int(payload.top_n or 10)
                isa_w = tool_isa_top_windows(top_n=top_n, sort_by="peak_10min_count") or {"data": []}
                citations = []
                for csrc in (isa_w.get("citations") or []):
                    try:
                        citations.append({
                            "source": csrc.get("source"),
                            "key": csrc.get("key"),
                            "note": csrc.get("note"),
                        })
                    except Exception:
                        pass

                one_call_messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Using only the ISA-18 method windows JSON, list the Top "
                            + str(top_n)
                            + " 10-minute flood windows. For each item, include window_start, window_end, and peak_10min_count (concise bullets, no tables).\n"
                            "ISA top_windows: " + json.dumps(isa_w.get("data", []), ensure_ascii=False)
                        ),
                    },
                ]
                resp = self.client.chat.completions.create(
                    model=AGENT_MODEL,
                    messages=one_call_messages,
                    temperature=TEMPERATURE,
                )
                choice = resp.choices[0]
                content = (choice.message.content or "").strip()
                return {
                    "answer": content or "Not available in current data.",
                    "citations": citations,
                    "used_tools": ["isa_top_windows"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": getattr(choice, "finish_reason", None),
                        "mode": "single_call_top_windows",
                    },
                }
            except Exception as e:
                return {
                    "answer": "Not available in current data.",
                    "citations": [],
                    "used_tools": ["isa_top_windows"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": f"error:{type(e).__name__}",
                    },
                }

        # ISA-priority fast-path for plant-wide/window phrasing (no explicit per-source intent)
        if has_plant_terms and not has_source_terms:
            try:
                top_n = int(payload.top_n or 10)
                isa_o = tool_isa_overall() or {"data": {}}
                isa_w = tool_isa_top_windows(top_n=top_n, sort_by="peak_10min_count") or {"data": []}
                citations = []
                for csrc in (isa_o.get("citations") or []) + (isa_w.get("citations") or []):
                    try:
                        citations.append({
                            "source": csrc.get("source"),
                            "key": csrc.get("key"),
                            "note": csrc.get("note"),
                        })
                    except Exception:
                        pass

                one_call_messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Using only the provided ISA-18 method JSON, summarize plant-wide health and the top 10-minute windows.\n"
                            "ISA overall: " + json.dumps(isa_o.get("data", {}), ensure_ascii=False) + "\n"
                            "ISA top_windows: " + json.dumps(isa_w.get("data", []), ensure_ascii=False)
                        ),
                    },
                ]
                resp = self.client.chat.completions.create(
                    model=AGENT_MODEL,
                    messages=one_call_messages,
                    temperature=TEMPERATURE,
                )
                choice = resp.choices[0]
                content = (choice.message.content or "").strip()
                return {
                    "answer": content or "Not available in current data.",
                    "citations": citations,
                    "used_tools": ["isa_overall", "isa_top_windows"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": getattr(choice, "finish_reason", None),
                        "mode": "single_call_isa_priority",
                    },
                }
            except Exception as e:
                return {
                    "answer": "Not available in current data.",
                    "citations": [],
                    "used_tools": ["isa_overall", "isa_top_windows"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": f"error:{type(e).__name__}",
                    },
                }

        # Ambiguous but ranking/unhealthy intent: default to Top 10 unhealthy sources (avoid generic snapshot)
        if (has_ranking_terms or has_unhealthy_terms) and not (has_source_terms or has_plant_terms):
            try:
                top_n = int(payload.top_n or 10)
                top_data = tool_unhealthy_sources_top(top_n=top_n, sort_by="total_hits", windows_per_source=2) or {"data": []}
                by_loc = tool_unhealthy_breakdown(by="location", top_n=10) or {"data": []}
                by_cond = tool_unhealthy_breakdown(by="condition", top_n=10) or {"data": []}
                citations = []
                for csrc in (top_data.get("citations") or []) + (by_loc.get("citations") or []) + (by_cond.get("citations") or []):
                    try:
                        citations.append({
                            "source": csrc.get("source"),
                            "key": csrc.get("key"),
                            "note": csrc.get("note"),
                        })
                    except Exception:
                        pass

                one_call_messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Using only the provided JSON, list the sources contributing most to unhealthiness (concise).\n"
                            "Include a brief overview and 5-8 key sources with inline numbers (no tables).\n"
                            "JSON top_sources: " + json.dumps(top_data.get("data", []), ensure_ascii=False) + "\n"
                            "JSON by_location: " + json.dumps(by_loc.get("data", []), ensure_ascii=False) + "\n"
                            "JSON by_condition: " + json.dumps(by_cond.get("data", []), ensure_ascii=False)
                        ),
                    },
                ]
                resp = self.client.chat.completions.create(
                    model=AGENT_MODEL,
                    messages=one_call_messages,
                    temperature=TEMPERATURE,
                )
                choice = resp.choices[0]
                content = (choice.message.content or "").strip()
                return {
                    "answer": content or "Not available in current data.",
                    "citations": citations,
                    "used_tools": ["unhealthy_sources_top", "unhealthy_breakdown"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": getattr(choice, "finish_reason", None),
                        "mode": "single_call_ambiguous_top_sources",
                    },
                }
            except Exception as e:
                return {
                    "answer": "Not available in current data.",
                    "citations": [],
                    "used_tools": ["unhealthy_sources_top", "unhealthy_breakdown"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": f"error:{type(e).__name__}",
                    },
                }

        # Ambiguous phrasing: consult both (ISA first, PVC-I overall as secondary context)
        # Only trigger when there are domain hints to avoid overriding general chat (now handled by the model itself)
        if (
            not has_source_terms
            and not has_plant_terms
            and (
                has_unhealthy_terms
                or ("health" in ql)
                or ("status" in ql)
                or ("overall" in ql)
                or ("pvc" in ql)
                or ("pvc-i" in ql)
                or ("isa" in ql)
            )
        ):
            try:
                isa_o = tool_isa_overall() or {"data": {}}
                pvc_o = tool_overall_health() or {"data": {}}
                citations = []
                for csrc in (isa_o.get("citations") or []) + (pvc_o.get("citations") or []):
                    try:
                        citations.append({
                            "source": csrc.get("source"),
                            "key": csrc.get("key"),
                            "note": csrc.get("note"),
                        })
                    except Exception:
                        pass
                one_call_messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Defaulting to ISA-18 method (plant-wide). Provide a concise snapshot and optionally add PVC-I method overall as secondary context. These are two calculation methods for the SAME plant.\n"
                            "ISA-18 overall: " + json.dumps(isa_o.get("data", {}), ensure_ascii=False) + "\n"
                            "PVC-I overall: " + json.dumps(pvc_o.get("data", {}), ensure_ascii=False)
                        ),
                    },
                ]
                resp = self.client.chat.completions.create(
                    model=AGENT_MODEL,
                    messages=one_call_messages,
                    temperature=TEMPERATURE,
                )
                choice = resp.choices[0]
                content = (choice.message.content or "").strip()
                return {
                    "answer": content or "Not available in current data.",
                    "citations": citations,
                    "used_tools": ["isa_overall", "overall_health"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": getattr(choice, "finish_reason", None),
                        "mode": "single_call_ambiguous_both",
                    },
                }
            except Exception as e:
                return {
                    "answer": "Not available in current data.",
                    "citations": [],
                    "used_tools": ["isa_overall", "overall_health"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": f"error:{type(e).__name__}",
                    },
                }

        # Fast-path for per-source queries asking about top/most or unhealthy/flood drivers
        if has_source_terms and (has_unhealthy_terms or has_ranking_terms):
            try:
                top_n = int(payload.top_n or 10)
                top_data = tool_unhealthy_sources_top(top_n=top_n, sort_by="total_hits", windows_per_source=2) or {"data": []}
                by_loc = tool_unhealthy_breakdown(by="location", top_n=10) or {"data": []}
                by_cond = tool_unhealthy_breakdown(by="condition", top_n=10) or {"data": []}
                citations = []
                for csrc in (top_data.get("citations") or []) + (by_loc.get("citations") or []) + (by_cond.get("citations") or []):
                    try:
                        citations.append({
                            "source": csrc.get("source"),
                            "key": csrc.get("key"),
                            "note": csrc.get("note"),
                        })
                    except Exception:
                        pass

                one_call_messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Using only the provided JSON, write a professional, descriptive analysis of the sources making the plant most unhealthy.\n"
                            "Structure the answer as follows (avoid raw lists of JSON fields):\n"
                            "1) Overview: 2-3 sentences summarizing overall risk and the main drivers.\n"
                            "2) Top Sources (5-8): For each, write 1-2 compact sentences: source name, total hits, why it's unhealthy (over_by/frequency), dominant location/condition; mention up to two peak windows inline.\n"
                            "3) Trends: 2-3 sentences describing patterns by location and by condition.\n"
                            "4) Actions: 2-4 prioritized, actionable recommendations.\n"
                            "Constraints: Do not dump raw JSON or long bullet lists; use short paragraphs with inline numbers, no tables; keep it crisp (~150-220 words); do not invent numbers.\n"
                            "JSON top_sources: " + json.dumps(top_data.get("data", []), ensure_ascii=False) + "\n"
                            "JSON by_location: " + json.dumps(by_loc.get("data", []), ensure_ascii=False) + "\n"
                            "JSON by_condition: " + json.dumps(by_cond.get("data", []), ensure_ascii=False)
                        ),
                    },
                ]
                resp = self.client.chat.completions.create(
                    model=AGENT_MODEL,
                    messages=one_call_messages,
                    temperature=TEMPERATURE,
                )
                choice = resp.choices[0]
                content = (choice.message.content or "").strip()
                return {
                    "answer": content or "Not available in current data.",
                    "citations": citations,
                    "used_tools": ["unhealthy_sources_top", "unhealthy_breakdown"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": getattr(choice, "finish_reason", None),
                        "mode": "single_call_unhealthy_sources",
                    },
                }
            except Exception as e:
                return {
                    "answer": "Not available in current data.",
                    "citations": [],
                    "used_tools": ["unhealthy_sources_top", "unhealthy_breakdown"],
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": f"error:{type(e).__name__}",
                    },
                }

        for _ in range(MAX_TOOL_CALLS):
            try:
                resp = self.client.chat.completions.create(
                    model=AGENT_MODEL,
                    messages=messages,
                    temperature=TEMPERATURE,
                    tools=TOOLS_SPEC,
                    tool_choice="auto",
                )
            except Exception as e:
                # Return a structured fallback instead of raising 500
                return {
                    "answer": "Not available in current data.",
                    "citations": citations,
                    "used_tools": used_tools,
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": f"error:{type(e).__name__}",
                    },
                }
            choice = resp.choices[0]
            msg = choice.message

            tool_calls = getattr(msg, "tool_calls", None) or []
            if not tool_calls:
                # Final answer
                answer = (msg.content or "").strip()
                return {
                    "answer": answer,
                    "citations": citations,
                    "used_tools": used_tools,
                    "meta": {
                        "model": AGENT_MODEL,
                        "temperature": TEMPERATURE,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "finish_reason": getattr(choice, "finish_reason", None),
                    },
                }

            # Execute requested tools
            messages.append({"role": "assistant", "content": None, "tool_calls": [tc.dict() for tc in tool_calls]})  # type: ignore
            for tc in tool_calls:
                name = tc.function.name
                raw_args = tc.function.arguments or "{}"
                try:
                    args = json.loads(raw_args)
                except Exception:
                    args = {}

                dispatcher = DISPATCH.get(name)
                if not dispatcher:
                    tool_result = {"error": f"unknown tool {name}"}
                else:
                    tool_result = dispatcher(args) or {}

                # Aggregate citations/used tools
                used_tools.append(name)
                for c in (tool_result.get("citations") or []):
                    try:
                        # Basic shape normalization
                        citations.append({
                            "source": c.get("source"),
                            "key": c.get("key"),
                            "note": c.get("note"),
                        })
                    except Exception:
                        pass

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": name,
                        "content": json.dumps(tool_result, ensure_ascii=False),
                    }
                )

        # If we exit the loop without a final answer, return a safe fallback
        return {
            "answer": "Not available in current data.",
            "citations": citations,
            "used_tools": used_tools,
            "meta": {
                "model": AGENT_MODEL,
                "temperature": TEMPERATURE,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "finish_reason": "max_tool_calls_exceeded",
            },
        }


# Singleton
agent_llm = AgentLLM()
