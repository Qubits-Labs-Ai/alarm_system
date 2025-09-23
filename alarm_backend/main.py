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
import google.generativeai as genai
from dotenv import load_dotenv
from collections import Counter
from statistics import mean
from pathlib import Path
import hashlib

load_dotenv(dotenv_path=Path(__file__).parent / '.env')  # Load .env from alarm_backend directory explicitly

# Configure Gemini client
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

class ChartInsightRequest(BaseModel):
    chartTitle: str
    chartData: List[Dict[str, Any]]

# Configure logger
logger = logging.getLogger(__name__)

app = FastAPI(title="Plant Alarm Data System", version="1.0", default_response_class=ORJSONResponse)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://0.0.0.0:8080",
        "http://localhost:8081",
        "all",
        "http://127.0.0.1:8081",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define the ALARM_DATA_DIR path
BASE_DIR = os.path.dirname(__file__)
ALARM_DATA_DIR = os.path.join(BASE_DIR, "ALARM_DATA_DIR")
INSIGHTS_CACHE_DIR = Path(os.path.join(BASE_DIR, "INSIGHTS_CACHE"))
INSIGHTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)

def _compute_cache_key(title: str, rows: List[Dict[str, Any]]) -> str:
    # Build a compact signature: title + first 200 rows with stable keys
    sample = rows[:200]
    payload = {
        "title": title,
        "rows": sample,
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _read_cache(key: str) -> Dict[str, Any] | None:
    f = INSIGHTS_CACHE_DIR / f"{key}.json"
    if not f.exists():
        return None
    try:
        with f.open("r", encoding="utf-8") as fp:
            return json.load(fp)
    except Exception:
        return None


def _write_cache(key: str, data: Dict[str, Any]) -> None:
    f = INSIGHTS_CACHE_DIR / f"{key}.json"
    try:
        with f.open("w", encoding="utf-8") as fp:
            json.dump(data, fp, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"Failed to write insight cache: {e}")


@app.post("/insights")
async def get_chart_insight(request: ChartInsightRequest, regenerate: bool = False):
    """Generate AI-powered insights for a given chart's data."""
    logger.info(f"Received insight request for chart: {request.chartTitle}")
    logger.info(f"Chart data contains {len(request.chartData)} records.")

    # Helper: simple heuristic fallback generator
    def _generate_fallback_insight(title: str, rows: List[Dict[str, Any]]) -> str:
        n = len(rows)
        if n == 0:
            return (
                f"""
### 📊 Descriptive Analysis

No unhealthy incidents are present for **{title}** in the selected window.

### 🩺 Diagnostic Analysis

System is operating within thresholds in the selected window.

### 💡 Prescriptive Recommendations

Maintain current operating parameters and continue monitoring.
"""
            )
        sources = [str(r.get("source", "?")) for r in rows]
        src_counts = Counter(sources)
        top_sources = src_counts.most_common(5)
        hits_list = [int(r.get("hits") or r.get("flood_count") or 0) for r in rows]
        over_by_list = [int(r.get("over_by", 0)) for r in rows]
        priorities = [str(r.get("priority") or r.get("priority_severity") or "") for r in rows]
        pr_counts = Counter(priorities)
        avg_hits = round(mean([h for h in hits_list if isinstance(h, (int, float))]) if any(isinstance(h, (int, float)) for h in hits_list) else 0, 1)
        max_hits = max(hits_list) if hits_list else 0
        uniq_sources = len(src_counts)
        top_sources_md = "\n".join([f"- {name}: {cnt} incidents" for name, cnt in top_sources])
        pr_summary = ", ".join([f"{k or 'Unknown'}: {v}" for k, v in pr_counts.items() if k]) or "N/A"
        return f"""
### 📊 Descriptive Analysis

For **{title}**, we detected **{n}** unhealthy incidents across **{uniq_sources}** unique sources.

- Average hits per incident: **{avg_hits}**
- Peak hits in a single 10-min window: **{max_hits}**
- Priority distribution: {pr_summary}
- Top impacted sources (by incident frequency):
{top_sources_md or '- (no dominant sources)'}

### 🩺 Diagnostic Analysis

The distribution suggests that {'multiple sources are contributing' if uniq_sources > 3 else 'a small set of sources is dominant'}. High-hit windows (max {max_hits}) indicate either bursty conditions (process upsets) or repeated sensor chatter. The presence of over-threshold values (avg over_by ≈ {round(mean(over_by_list),1) if over_by_list else 0}) points to:

1. Threshold exceedances during transient operations (startups/shutdowns/batch transitions).
2. Potential sensor drift or fouling causing repeated alarms.
3. Localized control loop oscillation or upstream variability.

### 💡 Prescriptive Recommendations

1. Immediate: Review top sources above. Validate sensor health and check recent maintenance or parameter changes.
2. Short-Term: Correlate these incidents with process logs (rates, temperatures, setpoints) to identify time-aligned causes.
3. Long-Term: Tune alarm thresholds and deadbands for chattering sources; schedule calibration for sensors with recurring exceedances.
"""

    # Cache lookup unless regeneration is requested
    cache_key = _compute_cache_key(request.chartTitle, request.chartData)
    if not regenerate:
        cached = _read_cache(cache_key)
        if cached and isinstance(cached.get("insight"), str):
            meta = cached.get("meta") or {}
            # Normalize meta for cache hits
            meta.update({
                "provider": meta.get("provider") or cached.get("provider", "cache"),
                "model": meta.get("model") or cached.get("model", "unknown"),
                "cached": True,
                "generated_at": cached.get("generated_at"),
                "cache_key": cache_key,
            })
            return {"insight": cached["insight"], "meta": meta}

    # Check API key and log status
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY not set; returning fallback insight.")
        fb = _generate_fallback_insight(request.chartTitle, request.chartData)
        now = datetime.utcnow().isoformat() + "Z"
        meta = {
            "provider": "fallback",
            "model": None,
            "cached": False,
            "generated_at": now,
            "cache_key": cache_key,
            "error": "no_api_key",
        }
        _write_cache(cache_key, {
            "chartTitle": request.chartTitle,
            "generated_at": now,
            "insight": fb + "\n\n> Note: Fallback heuristic insight used (no AI key configured).",
            "cache_key": cache_key,
            "provider": "fallback",
            "model": None,
            "meta": meta,
        })
        return {"insight": fb + "\n\n> Note: Fallback heuristic insight used (no AI key configured).", "meta": meta}
    
    logger.info(f"Gemini API key found (length: {len(api_key)})")

    # Basic data validation
    if not request.chartTitle or not request.chartData:
        raise HTTPException(status_code=400, detail="Chart title and data are required.")

    # Prepare the data for the prompt by converting it to a compact JSON string
    # We'll also truncate it to avoid exceeding token limits
    data_summary = json.dumps(request.chartData[:20], indent=2) # Send first 20 records as a sample

    system_prompt = """
As an expert Plant Operations Analyst for a major chemical manufacturing facility (Engro Polymer & Chemicals Ltd.), your task is to provide a concise, actionable analysis of operational data presented in markdown format. Your insights must be structured into three specific sections: Descriptive, Diagnostic, and Prescriptive.

**Tone and Style:**
- **Professional and Authoritative:** Use industry-standard terminology.
- **Concise:** Get straight to the point. No filler.
- **Data-Driven:** Reference specific data points or trends from the provided information.
- **Action-Oriented:** Focus on practical, actionable recommendations.

**Output Format (Strict Markdown):**

### 📊 Descriptive Analysis
*(Summarize what the data shows. What are the key facts, trends, or outliers? Example: "The data shows a surge in alarms from the PVC-I unit, with 85% of incidents occurring in the last 2 hours.")*

### 🩺 Diagnostic Analysis
*(Provide potential root causes for the observations. What could be causing this? Example: "This pattern is often indicative of a sensor calibration issue or an upstream process fluctuation.")*

### 💡 Prescriptive Recommendations
*(Give clear, actionable next steps. What should the operations team do right now? Example: "1. **Immediate:** Dispatch a technician to inspect sensors on Reactor B. 2. **Short-Term:** Correlate these alarms with batch production logs to identify any process deviations.")*
"""

    user_prompt = f"""
Analyze the following data for the chart titled '{request.chartTitle}'. The data represents unhealthy operational signals.

**Chart Title:** {request.chartTitle}
**Number of Unhealthy Records:** {len(request.chartData)}

**Data Sample (first 20 records):**
```json
{data_summary}
```

Please provide your analysis in the specified markdown format.
"""

    try:
        logger.info("Attempting Gemini API call...")
        
        # Create the model with system instruction
        model_name = 'gemini-2.5-flash'
        model = genai.GenerativeModel(model_name, system_instruction=system_prompt)
        
        # Only pass user content; system instruction is set at model-level
        # Also sanitize by stripping markdown code fences to avoid unnecessary blocking
        full_prompt = user_prompt.replace("```json", "").replace("```", "")
        
        # Generate content with safety settings (enum-based)
        safety_settings = {
            genai.types.HarmCategory.HARM_CATEGORY_HARASSMENT: genai.types.HarmBlockThreshold.BLOCK_NONE,
            genai.types.HarmCategory.HARM_CATEGORY_HATE_SPEECH: genai.types.HarmBlockThreshold.BLOCK_NONE,
            genai.types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: genai.types.HarmBlockThreshold.BLOCK_NONE,
            genai.types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: genai.types.HarmBlockThreshold.BLOCK_NONE,
        }
        
        response = model.generate_content(
            full_prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.5,
                max_output_tokens=1024,
            ),
            safety_settings=safety_settings
        )

        # Check if response was blocked by safety filters
        if not response.candidates or not response.candidates[0].content.parts:
            finish_reason = response.candidates[0].finish_reason if response.candidates else "UNKNOWN"
            # Log safety ratings for diagnosis
            try:
                ratings = getattr(response.candidates[0], "safety_ratings", [])
                for r in ratings or []:
                    logger.warning(f"Safety rating: category={getattr(r,'category',None)}, probability={getattr(r,'probability',None)}, blocked={getattr(r,'blocked',None)}")
            except Exception:
                pass
            logger.warning(f"Gemini response blocked. Finish reason: {finish_reason}")
            # Retry once with simplified prompt and alternate model
            alt_model_name = 'gemini-1.5-flash'
            alt_model = genai.GenerativeModel(alt_model_name, system_instruction=system_prompt)
            simple_prompt = (
                "Provide a concise, safe, technical summary in markdown with Descriptive, Diagnostic, Prescriptive sections based on the following industrial telemetry.\n\n"
                + user_prompt.replace("```json", "").replace("```", "")
            )
            response2 = alt_model.generate_content(
                simple_prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.4,
                    max_output_tokens=900,
                ),
                safety_settings=safety_settings
            )
            if not response2.candidates or not response2.candidates[0].content.parts:
                finish_reason2 = response2.candidates[0].finish_reason if response2.candidates else "UNKNOWN"
                logger.warning(f"Gemini retry blocked. Finish reason: {finish_reason2}")
                raise Exception(f"Response blocked by safety filters. Finish reason: {finish_reason2}")
            else:
                insight = response2.text.strip()
                finish_reason = response2.candidates[0].finish_reason if response2.candidates else None
                now = datetime.utcnow().isoformat() + "Z"
                meta = {
                    "provider": "gemini",
                    "model": alt_model_name,
                    "cached": False,
                    "generated_at": now,
                    "cache_key": cache_key,
                    "finish_reason": finish_reason,
                }
                _write_cache(cache_key, {
                    "chartTitle": request.chartTitle,
                    "generated_at": now,
                    "insight": insight,
                    "cache_key": cache_key,
                    "provider": "gemini",
                    "model": alt_model_name,
                    "meta": meta,
                })
                return {"insight": insight, "meta": meta}
        
        logger.info("Gemini API call successful!")
        insight = response.text.strip()
        finish_reason = response.candidates[0].finish_reason if response.candidates else None
        now = datetime.utcnow().isoformat() + "Z"
        meta = {
            "provider": "gemini",
            "model": model_name,
            "cached": False,
            "generated_at": now,
            "cache_key": cache_key,
            "finish_reason": finish_reason,
        }
        _write_cache(cache_key, {
            "chartTitle": request.chartTitle,
            "generated_at": now,
            "insight": insight,
            "cache_key": cache_key,
            "provider": "gemini",
            "model": model_name,
            "meta": meta,
        })
        return {"insight": insight, "meta": meta}
    except Exception as e:
        logger.error(f"Gemini API Error - Type: {type(e).__name__}")
        logger.error(f"Gemini API Error - Message: {str(e)}")
        if hasattr(e, 'response'):
            logger.error(f"Gemini API Error - Response: {e.response}")
        if hasattr(e, 'status_code'):
            logger.error(f"Gemini API Error - Status Code: {e.status_code}")
        
        # Provide a robust fallback instead of a 500 to keep UX responsive
        fb = _generate_fallback_insight(request.chartTitle, request.chartData)
        now = datetime.utcnow().isoformat() + "Z"
        meta = {
            "provider": "fallback",
            "model": locals().get("model_name"),
            "cached": False,
            "generated_at": now,
            "cache_key": cache_key,
            "error": str(e),
        }
        _write_cache(cache_key, {
            "chartTitle": request.chartTitle,
            "generated_at": now,
            "insight": fb + f"\n\n> Note: Fallback heuristic insight used due to AI service error: {str(e)}",
            "cache_key": cache_key,
            "provider": "fallback",
            "model": locals().get("model_name"),
            "meta": meta,
        })
        return {"insight": fb + f"\n\n> Note: Fallback heuristic insight used due to AI service error: {str(e)}", "meta": meta}


@app.get("/debug/env")
def debug_env():
    """Debug endpoint to check environment variables"""
    api_key = os.getenv("GEMINI_API_KEY")
    return {
        "api_key_present": bool(api_key),
        "api_key_length": len(api_key) if api_key else 0,
        "api_key_prefix": api_key[:10] + "..." if api_key and len(api_key) > 10 else api_key
    }

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
