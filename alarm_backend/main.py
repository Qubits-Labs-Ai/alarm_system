from fastapi import FastAPI, HTTPException
from pvcI_files import list_pvc_files, read_pvc_file, read_all_pvc_files
from pvcI_health_monitor import (
    compute_pvcI_file_health,
    compute_pvcI_overall_health,
    compute_pvcI_overall_health_weighted,
    HealthConfig,
)
from pvcI_health_monitor import compute_pvcI_unhealthy_sources
from fastapi.responses import ORJSONResponse
from fastapi.middleware.cors import CORSMiddleware
from config import PVCI_FOLDER
import os
import re
import logging
import json
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import List, Any, Dict
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI, APIError, APIConnectionError, RateLimitError, BadRequestError, AuthenticationError, PermissionDeniedError

# Configure logger
logger = logging.getLogger(__name__)

app = FastAPI(title="Plant Alarm Data System", version="1.0", default_response_class=ORJSONResponse)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load environment and initialize OpenAI client and in-memory cache
# Explicitly load .env from the backend folder and allow override so a correct key
# in alarm_backend/.env is not shadowed by a conflicting OS environment variable.
dotenv_path = Path(__file__).with_name(".env")
try:
    load_dotenv(dotenv_path=dotenv_path, override=True)
except Exception:
    pass

OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
OPENAI_BASE_URL = (os.getenv("OPENAI_BASE_URL") or "").strip()

# Safe diagnostic (does not expose the key)
try:
    logger.info(f"Loaded env for insights from {dotenv_path}. OPENAI_API_KEY present={bool(OPENAI_API_KEY)}")
except Exception:
    pass

try:
    if OPENAI_API_KEY:
        if OPENAI_BASE_URL:
            openai_client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)
        else:
            openai_client = OpenAI(api_key=OPENAI_API_KEY)
    else:
        openai_client = None
except Exception:
    openai_client = None

INSIGHT_CACHE: Dict[str, Dict[str, Any]] = {}
# Define the ALARM_DATA_DIR path
BASE_DIR = os.path.dirname(__file__)
ALARM_DATA_DIR = os.path.join(BASE_DIR, "ALARM_DATA_DIR")

# -------- Utility: sanitize sensitive tokens in error strings --------
import re as _re

def _sanitize_error_message(msg: str) -> str:
    """Remove any API key-like tokens from error strings before returning/logging.
    Replaces patterns like 'sk-...' and 'sk-proj-...' with masked tokens.
    """
    if not isinstance(msg, str):
        try:
            msg = str(msg)
        except Exception:
            return ""
    # Mask any token starting with sk- followed by a run of safe chars
    msg = _re.sub(r"sk-[A-Za-z0-9\-_]{4,}", "sk-***", msg)
    # Also mask project/session keys which might appear differently
    msg = _re.sub(r"(api_key|api-key|OPENAI_API_KEY)\s*[:=]\s*[^\s,'\"]+", r"\1=***", msg, flags=_re.I)
    return msg


@app.get("/plants")
def get_all_plants():
    """Return list of all available plants with metadata"""
    try:
        if not os.path.exists(ALARM_DATA_DIR):
            raise HTTPException(status_code=404, detail="ALARM_DATA_DIR not found")
        
        plant_map = {}  # Use dict to avoid duplicates
        directories = [d for d in os.listdir(ALARM_DATA_DIR) 
                      if os.path.isdir(os.path.join(ALARM_DATA_DIR, d))]
        
        for directory in directories:
            # Extract plant name from directory name using more precise matching
            plant_name = None
            if "PVC-III" in directory:  # Check PVC-III first (more specific)
                plant_name = "PVC-III"
            elif "PVC-II" in directory:  # Then PVC-II
                plant_name = "PVC-II"
            elif "PVC-I" in directory:   # Then PVC-I
                plant_name = "PVC-I"
            elif directory.startswith("PP"):
                plant_name = "PP"
            elif directory.startswith("VCM"):
                plant_name = "VCM"
            else:
                # Fallback: extract first word/code before space or parenthesis
                match = re.match(r'^([A-Z-]+)', directory)
                plant_name = match.group(1) if match else directory.split()[0]
            
            # Count files in the directory
            dir_path = os.path.join(ALARM_DATA_DIR, directory)
            file_count = len([f for f in os.listdir(dir_path) 
                            if os.path.isfile(os.path.join(dir_path, f))])
            
            # Only add if not already present (avoid duplicates)
            if plant_name not in plant_map:
                plant_map[plant_name] = {
                    "plant_code": plant_name,
                    "directory_name": directory,
                    "file_count": file_count,
                    "directory_path": directory
                }
            else:
                # If duplicate, add file counts together
                plant_map[plant_name]["file_count"] += file_count
        
        plants = list(plant_map.values())
        
        return {
            "total_plants": len(plants),
            "plants": plants
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/all-pvci-files")
def get_all_pvc_files():
    """Return list of all PVC-I plant files"""
    try:
        files = list_pvc_files()
        return {"total_files": len(files), "files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/pvc-file/{filename}")
def get_pvc_file_data(filename: str):
    """Return metadata + first 10 rows of a specific PVC-I file"""
    try:
        file_data = read_pvc_file(filename)
        return file_data
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File {filename} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/pvcI-files-data")
def get_all_pvc_files_data():
    """Return data from all PVC-I files, including first 10 rows of each file"""
    try:
        files_data = read_all_pvc_files()
        return files_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/pvcI-health/overall", response_class=ORJSONResponse)
def get_pvcI_overall_health(
    bin_size: str = "10T",
    alarm_threshold: int = 10,
    max_workers: int = 12,  # Increased workers for better parallelization
    per_file_timeout: int | None = 1800,  # Increased timeout to 2 minutes
    include_daily: bool = False,   # new: avoid huge payloads by default
    offset: int = 0,               # new: paginate daily_results
    limit: int = 20,
    force_recompute: bool = False,  # New parameter to force recomputation
    raw: bool = False               # New: return the saved JSON as-is when available
):
    """Get overall health metrics for all files with improved timeout handling."""
    try:
        # Use pre-saved JSON data for better performance, but check for errors
        json_file_path = os.path.join(os.path.dirname(__file__), "PVCI-overall-health", "pvcI-overall-health.json")
        
        use_saved_data = False
        if os.path.exists(json_file_path) and not force_recompute:
            import json
            with open(json_file_path, 'r', encoding='utf-8') as f:
                saved_data = json.load(f)
            
            # Check if saved data has errors (incomplete processing)
            errors = saved_data.get("errors", [])
            has_timeout_errors = any("Timed out" in str(error) for error in errors)
            
            if not has_timeout_errors:
                use_saved_data = True
            else:
                logger.warning(f"Saved data has timeout errors: {errors}. Recomputing with better timeout settings.")
        
        if use_saved_data:
            # If caller requests raw, return the saved JSON exactly as stored
            if raw:
                return saved_data

            # Otherwise, transform into the compact API format for the dashboard
            overall = saved_data.get("overall", {})
            files_data = saved_data.get("files", [])

            unhealthy_sources_by_bins = {}
            for file_data in files_data:
                filename = file_data.get("filename", "")
                unhealthy_bins = file_data.get("unhealthy_bins", 0)
                if unhealthy_bins > 0:
                    if unhealthy_bins <= 50:
                        bin_range = "0-50"
                    elif unhealthy_bins <= 100:
                        bin_range = "51-100"
                    elif unhealthy_bins <= 200:
                        bin_range = "101-200"
                    else:
                        bin_range = "200+"

                    if bin_range not in unhealthy_sources_by_bins:
                        unhealthy_sources_by_bins[bin_range] = []
                    unhealthy_sources_by_bins[bin_range].append({
                        "filename": filename,
                        "unhealthy_bins": unhealthy_bins,
                        "num_sources": file_data.get("num_sources", 0),
                        "health_pct": file_data.get("health_pct", 0)
                    })

            result = {
                "plant_folder": saved_data.get("plant_folder", ""),
                "generated_at": saved_data.get("generated_at", ""),
                "overall": {
                    "health_pct_simple": overall.get("health_pct_simple", 0),
                    "health_pct_weighted": overall.get("health_pct_weighted", 0),
                    "unhealthy_percentage": round(100 - overall.get("health_pct_simple", 0), 2),
                    "totals": overall.get("totals", {}),
                    "unhealthy_sources_by_bins": unhealthy_sources_by_bins
                }
            }

            if include_daily:
                result["files"] = files_data[offset:offset + limit]

            return result
        else:
            # Compute fresh data with improved timeout settings and optimizations
            config = HealthConfig(bin_size=bin_size, alarm_threshold=alarm_threshold)
            
            # Use optimized settings for large datasets
            result = compute_pvcI_overall_health(
                PVCI_FOLDER, 
                config, 
                max_workers=max_workers, 
                per_file_timeout=per_file_timeout,
                include_details=True,  # Keep detailed per-source data
                limit_unhealthy_per_source=50  # Reasonable limit for unhealthy details
            )

            # trim or paginate the heavy part
            if "daily_results" in result:
                if not include_daily:
                    result.pop("daily_results")
                else:
                    result["daily_results"] = result["daily_results"][offset: offset + limit]

            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/pvcI-health/overall/weighted")
def get_pvcI_overall_health_weighted_endpoint(
    bin_size: str = "10T",
    alarm_threshold: int = 10,
    max_workers: int = 4,
    per_file_timeout: int | None = 30
):
    """Get overall health metrics (weighted by total bins across all files)"""
    try:
        config = HealthConfig(bin_size=bin_size, alarm_threshold=alarm_threshold)
        return compute_pvcI_overall_health_weighted(PVCI_FOLDER, config, max_workers, per_file_timeout)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/pvcI-health/unhealthy-sources", response_class=ORJSONResponse)
def get_pvcI_unhealthy_sources(
    start_time: str | None = None,
    end_time: str | None = None,
    bin_size: str = "10T",
    alarm_threshold: int = 10,
    max_workers: int = 4,
    per_file_timeout: int | None = 30,
):
    """
    Get detailed unhealthy source bins with full metadata for plotting.
    """
    try:
        # 1) Fast path: serve from pre-saved overall-health JSON so charts don't hang
        json_file_path = os.path.join(
            os.path.dirname(__file__), "PVCI-overall-health", "pvcI-overall-health.json"
        )

        if os.path.exists(json_file_path):
            with open(json_file_path, "r", encoding="utf-8") as f:
                saved_data = json.load(f)

            # Prefer real alarm sources from per_source.unhealthy_bin_details
            per_source = saved_data.get("per_source") or {}
            if isinstance(per_source, dict) and per_source:
                # Prepare optional time filters
                def _parse_iso(ts: str | None):
                    if not ts:
                        return None
                    try:
                        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    except Exception:
                        return None

                start_dt = _parse_iso(start_time)
                end_dt = _parse_iso(end_time)

                def _in_range(bstart: datetime, bend: datetime) -> bool:
                    if start_dt and bend < start_dt:
                        return False
                    if end_dt and bstart > end_dt:
                        return False
                    return True

                records = []
                # Exclude non-alarm/meta sources (e.g., REPORT, $ACTIVITY_...)
                def _is_valid_alarm_source(name: str) -> bool:
                    if not name:
                        return False
                    name = name.strip()
                    up = name.upper()
                    # Exclude only obvious meta like REPORT; allow $ACTIVITY_... as real sources
                    if up == "REPORT" or "REPORT" in up:
                        return False
                    return True
                for src_name, stats in per_source.items():
                    if not _is_valid_alarm_source(str(src_name)):
                        continue
                    for det in (stats.get("unhealthy_bin_details") or []):
                        bstart = _parse_iso(det.get("bin_start"))
                        bend = _parse_iso(det.get("bin_end"))
                        if not bstart or not bend:
                            continue
                        if start_dt or end_dt:
                            if not _in_range(bstart, bend):
                                continue

                        hits = int(det.get("hits", 0) or 0)
                        if hits <= 0:
                            continue
                        thr = int(det.get("threshold", alarm_threshold) or alarm_threshold)

                        # Priority per-bin based on how much the threshold is exceeded (severity label)
                        if hits >= thr + 15:
                            prio_sev = "High"
                        elif hits >= thr + 5:
                            prio_sev = "Medium"
                        else:
                            prio_sev = "Low"

                        record = {
                            "event_time": bstart.isoformat(),
                            "bin_end": bend.isoformat(),
                            "source": str(src_name),  # real alarm tag/source
                            "hits": hits,
                            "threshold": thr,
                            "over_by": int(det.get("over_by", max(0, hits - thr))),
                            "rate_per_min": float(det.get("rate_per_min", round(hits / 10.0, 2))),
                            # pass-through human fields when present in JSON
                            "location_tag": det.get("location_tag"),
                            "condition": det.get("condition", "Alarm Threshold Exceeded"),
                            "action": det.get("action", "Monitor and Investigate"),
                            # keep both: raw priority from JSON (if any) and computed severity label
                            "priority": det.get("priority"),
                            "priority_severity": prio_sev,
                            "description": det.get("description", f"Source exceeded {thr} alarms in 10-minute window"),
                            "value": hits,
                            "units": "alarms",
                            # pass-through extras when available in saved JSON
                            "flood_count": det.get("flood_count"),
                            "peak_window_start": det.get("peak_window_start"),
                            "peak_window_end": det.get("peak_window_end"),
                            "setpoint_value": det.get("setpoint_value"),
                            "raw_units": det.get("units"),
                        }
                        records.append(record)

                # Sort by hits desc
                records.sort(key=lambda r: r["hits"], reverse=True)

                return {
                    "count": len(records),
                    "records": records,
                    "isHistoricalData": True,
                    "note": "Unhealthy sources derived from per-source details in saved JSON",
                }

            # If per_source missing (older JSON), fall back to file-level aggregation (less accurate)
            files_data = saved_data.get("files", []) or []
            if files_data:
                records = []
                generated_at = saved_data.get("generated_at")
                try:
                    base_time = (
                        datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
                        if generated_at
                        else datetime.utcnow()
                    )
                except Exception:
                    base_time = datetime.utcnow()

                for idx, file_data in enumerate(files_data):
                    hits = int(file_data.get("unhealthy_bins", 0) or 0)
                    if hits <= 0:
                        continue

                    event_time = base_time + timedelta(minutes=idx * 10)
                    source_name = str(file_data.get("filename", "")).replace(".csv", "")

                    record = {
                        "event_time": event_time.isoformat(),
                        "bin_end": (event_time + timedelta(minutes=10)).isoformat(),
                        "source": source_name,
                        "hits": hits,
                        "threshold": alarm_threshold,
                        "over_by": max(0, hits - alarm_threshold),
                        "rate_per_min": round(hits / 10.0, 2),
                        "location_tag": "01",
                        "condition": "Alarm Threshold Exceeded",
                        "action": "Monitor and Investigate",
                        "priority": "High" if hits > 100 else ("Medium" if hits > 50 else "Low"),
                        "description": f"Source exceeded {alarm_threshold} alarms in 10-minute window",
                        "value": hits,
                        "units": "alarms",
                    }
                    records.append(record)

                records.sort(key=lambda r: r["hits"], reverse=True)

                return {
                    "count": len(records),
                    "records": records,
                    "isHistoricalData": True,
                    "note": "Unhealthy sources synthesized from file-level stats in saved JSON",
                }

        # 2) Fallback: compute in real-time (may be slower)
        config = HealthConfig(bin_size=bin_size, alarm_threshold=alarm_threshold)
        result = compute_pvcI_unhealthy_sources(
            PVCI_FOLDER, config, max_workers, per_file_timeout, start_time, end_time
        )
        return result
    except Exception as e:
        logger.error(f"Error in unhealthy-sources endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/pvcI-health/{filename}")
def get_pvcI_file_health_endpoint(filename: str):
    """Get health metrics for a specific file"""
    try:
        # Validate filename
        if not filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="Only CSV files are supported")
        
        file_path = os.path.join(PVCI_FOLDER, filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File {filename} not found")
        
        # Log file access
        print(f"Processing file: {file_path}")
        
        result = compute_pvcI_file_health(file_path)
        return result
    except HTTPException as he:
        return result
    except Exception as e:
        logger.error(f"Error processing file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@app.post("/pvcI-health/regenerate-cache")
def regenerate_pvcI_health_cache(
    bin_size: str = "10T",
    alarm_threshold: int = 10,
    max_workers: int = 12,  # More workers for batch processing
    per_file_timeout: int = 300  # 5 minutes per file for batch processing
):
    """Regenerate the complete health cache with all files - use for background processing."""
    try:
        import json
        from datetime import datetime
        
        logger.info("Starting complete health cache regeneration...")
        
        config = HealthConfig(bin_size=bin_size, alarm_threshold=alarm_threshold)
        
        # Use maximum performance settings for complete processing
        result = compute_pvcI_overall_health(
            PVCI_FOLDER, 
            config, 
            max_workers=max_workers, 
            per_file_timeout=per_file_timeout,
            include_details=False,  # Skip detailed data for cache
            limit_unhealthy_per_source=None  # No limits for complete data
        )
        
        # Save the complete result to JSON file
        json_file_path = os.path.join(os.path.dirname(__file__), "PVCI-overall-health", "health-all-pvcI.json")
        os.makedirs(os.path.dirname(json_file_path), exist_ok=True)
        
        with open(json_file_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, default=str)
        
        logger.info(f"Health cache regenerated successfully. Processed {result.get('overall', {}).get('totals', {}).get('files', 0)} files.")
        
        return {
            "status": "success",
            "message": f"Health cache regenerated successfully",
            "files_processed": result.get('overall', {}).get('totals', {}).get('files', 0),
            "total_sources": result.get('overall', {}).get('totals', {}).get('sources', 0),
            "errors": result.get('errors', []),
            "generated_at": result.get('generated_at')
        }
        
    except Exception as e:
        logger.error(f"Error regenerating health cache: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to regenerate cache: {str(e)}")


# -------------------- AI Insights Endpoint --------------------
class InsightRequest(BaseModel):
    chartTitle: str
    chartData: Any

def _hash_payload(title: str, data: Any, model: str) -> str:
    try:
        trimmed = data
        if isinstance(data, list):
            def _sev(rec: Dict[str, Any]):
                return int((rec or {}).get('flood_count') or (rec or {}).get('hits') or 0)
            trimmed = sorted(data, key=_sev, reverse=True)[:200]
        s = json.dumps({"t": title, "d": trimmed, "m": model}, default=str, ensure_ascii=False)
        import hashlib as _hl
        return _hl.sha1(s.encode('utf-8')).hexdigest()
    except Exception:
        import hashlib as _hl
        return _hl.sha1((title + model + str(type(data))).encode('utf-8')).hexdigest()

def _build_prompt(title: str, data: Any) -> str:
    summary: Dict[str, Any] = {"total_incidents": 0, "unique_sources": 0, "total_flood_count": 0, "top_sources": []}
    records: List[Dict[str, Any]] = []
    if isinstance(data, list):
        for r in data:
            if isinstance(r, dict):
                records.append(r)
        summary["total_incidents"] = len(records)
        summary["unique_sources"] = len({(r.get('source') or '').strip() for r in records})
        total_flood = 0
        by_source: Dict[str, Dict[str, Any]] = {}
        for r in records:
            hits = int(r.get('flood_count') or r.get('hits') or 0)
            total_flood += hits
            src = str(r.get('source') or 'Unknown')
            if src not in by_source:
                by_source[src] = {"incidents": 0, "total": 0, "max": 0}
            by_source[src]["incidents"] += 1
            by_source[src]["total"] += hits
            by_source[src]["max"] = max(by_source[src]["max"], hits)
        summary["total_flood_count"] = total_flood
        top = sorted(({"source": s, **m} for s, m in by_source.items()), key=lambda x: x["total"], reverse=True)[:10]
        summary["top_sources"] = top

    prompt = (
        f"You are an expert Alarm Management analyst. Analyze an alarm flooding chart called '{title}'.\n"
        "The chart shows time-windowed incidents where a source exceeded 10 alarms in 10 minutes.\n"
        "Fields per incident (when present): source, peak_window_start/end, flood_count or hits, threshold, over_by, rate_per_min, priority, location_tag, condition, description.\n\n"
        "Context summary (computed):\n"
        f"- Total incidents: {summary['total_incidents']}\n"
        f"- Unique sources: {summary['unique_sources']}\n"
        f"- Total flood count: {summary['total_flood_count']}\n"
        f"- Top sources by total flood (source, incidents, total, max): {json.dumps(summary['top_sources'], ensure_ascii=False)}\n\n"
        "Write a concise, professional markdown insight grounded ONLY in the provided context.\n"
        "Structure strictly as sections with headings: \n"
        "1) Executive Summary (2-3 bullet points)\n"
        "2) Key Drivers & Patterns (bullets)\n"
        "3) Source-Level Observations (bullets referencing top actors)\n"
        "4) Temporal/Operational Context (bullets)\n"
        "5) Recommended Actions (prioritized, actionable, specific).\n"
        "Avoid speculation and vendor language. Keep it under 220 words."
    )
    return prompt

@app.post("/insights")
def generate_insights_endpoint(payload: InsightRequest, regenerate: bool = False):
    try:
        if openai_client is None:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured on server.")

        model = os.getenv("INSIGHTS_MODEL", "gpt-4o-mini")
        cache_key = _hash_payload(payload.chartTitle, payload.chartData, model)

        if not regenerate and cache_key in INSIGHT_CACHE:
            cached = INSIGHT_CACHE[cache_key]
            return {
                "insight": cached["insight"],
                "meta": {**cached.get("meta", {}), "cached": True, "cache_key": cache_key},
            }

        system_msg = "You are a senior Alarm Management SME. Be precise, concise, and action-oriented."
        prompt = _build_prompt(payload.chartTitle, payload.chartData)

        preview_records = []
        if isinstance(payload.chartData, list):
            def _sev2(r: Dict[str, Any]):
                return int((r or {}).get('flood_count') or (r or {}).get('hits') or 0)
            for r in sorted(payload.chartData, key=_sev2, reverse=True)[:50]:
                preview_records.append({
                    "source": r.get("source"),
                    "flood": int((r.get("flood_count") or r.get("hits") or 0)),
                    "priority": r.get("priority") or r.get("priority_severity"),
                    "rate_per_min": r.get("rate_per_min"),
                    "over_by": r.get("over_by"),
                })

        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt},
            {"role": "user", "content": f"Preview incidents: {json.dumps(preview_records, ensure_ascii=False)}"},
        ]

        try:
            completion = openai_client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.4,
                max_tokens=700,
            )
        except AuthenticationError as e:
            msg = _sanitize_error_message(e)
            logger.error(f"OpenAI auth error: {msg}")
            raise HTTPException(status_code=401, detail="OpenAI authentication failed. Please verify OPENAI_API_KEY on the server.")
        except PermissionDeniedError as e:
            msg = _sanitize_error_message(e)
            logger.error(f"OpenAI permission error: {msg}")
            raise HTTPException(status_code=403, detail="OpenAI API access denied for the requested model. Check model access/permissions.")
        except RateLimitError as e:
            msg = _sanitize_error_message(e)
            logger.warning(f"OpenAI rate limit: {msg}")
            raise HTTPException(status_code=429, detail="OpenAI rate limit exceeded. Please try again shortly.")
        except BadRequestError as e:
            msg = _sanitize_error_message(e)
            logger.error(f"OpenAI bad request: {msg}")
            raise HTTPException(status_code=400, detail="OpenAI request was invalid. Verify inputs and model name.")
        except APIConnectionError as e:
            msg = _sanitize_error_message(e)
            logger.error(f"OpenAI connection error: {msg}")
            raise HTTPException(status_code=502, detail="Failed to connect to OpenAI. Please try again.")
        except APIError as e:
            msg = _sanitize_error_message(e)
            logger.error(f"OpenAI API error: {msg}")
            raise HTTPException(status_code=502, detail="OpenAI service error. Please try again.")
        content = (completion.choices[0].message.content or "").strip()
        finish_reason = getattr(completion.choices[0], "finish_reason", None)

        result = {
            "insight": content,
            "meta": {
                "provider": "openai",
                "model": model,
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "cache_key": cache_key,
                "finish_reason": finish_reason,
            },
        }
        INSIGHT_CACHE[cache_key] = result
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))
