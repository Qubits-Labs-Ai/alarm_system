"""
Comprehensive Plant Health Score Calculator
ISO 18.2 / EEMUA 191 Compliant

Calculates multi-dimensional health score (0-100%) with grade and risk level.
"""

import numpy as np
from typing import Dict, Any


# ============================================================================
# TIER 1: LOAD COMPLIANCE (40% weight)
# ============================================================================

def calculate_daily_load_score(alarms_per_day: float) -> float:
    """
    Score based on average daily alarm load vs ISO 18.2 thresholds.
    
    ISO Thresholds:
    - Excellent: <144 alarms/day → 100%
    - Good: 144-216 → 90-100%
    - Acceptable: 216-288 → 70-90%
    - Manageable: 288-720 → 40-70%
    - Unacceptable: ≥720 → 0-40%
    """
    if alarms_per_day < 144:
        return 100.0
    elif alarms_per_day < 216:
        # Linear interpolation: 144→100%, 216→90%
        return 90.0 + (216 - alarms_per_day) / (216 - 144) * 10.0
    elif alarms_per_day < 288:
        # Linear interpolation: 216→90%, 288→70%
        return 70.0 + (288 - alarms_per_day) / (288 - 216) * 20.0
    elif alarms_per_day < 720:
        # Linear interpolation: 288→70%, 720→40%
        return 40.0 + (720 - alarms_per_day) / (720 - 288) * 30.0
    else:
        # Exponential decay for extreme overload
        penalty = min(40.0, 40.0 * np.exp(-(alarms_per_day - 720) / 500))
        return max(0.0, penalty)


def calculate_window_overload_score(overload_pct: float) -> float:
    """
    Score based on flood-free time (inverse of overload percentage).
    
    This is the current "activation_overall_health_pct" but contextualized.
    
    Thresholds:
    - Excellent: >95% flood-free → 100%
    - Good: 90-95% → 85-100%
    - Acceptable: 80-90% → 70-85%
    - Poor: <80% → 0-70%
    """
    flood_free_pct = 100.0 - overload_pct
    
    if flood_free_pct >= 95:
        return 100.0
    elif flood_free_pct >= 90:
        return 85.0 + (flood_free_pct - 90) / 5 * 15.0
    elif flood_free_pct >= 80:
        return 70.0 + (flood_free_pct - 80) / 10 * 15.0
    else:
        # Below 80% flood-free is poor
        return max(0.0, flood_free_pct * 0.875)


def calculate_peak_intensity_score(peak_10min_count: int) -> float:
    """
    Score based on worst-case 10-minute window load.
    
    ISO Guidance:
    - Excellent: <10 alarms → 100%
    - Good: 10-20 → 85-100%
    - Acceptable: 20-50 → 60-85%
    - Poor: 50-100 → 30-60%
    - Critical: >100 → 0-30%
    """
    if peak_10min_count < 10:
        return 100.0
    elif peak_10min_count < 20:
        return 85.0 + (20 - peak_10min_count) / 10 * 15.0
    elif peak_10min_count < 50:
        return 60.0 + (50 - peak_10min_count) / 30 * 25.0
    elif peak_10min_count < 100:
        return 30.0 + (100 - peak_10min_count) / 50 * 30.0
    else:
        # Severe penalty for extreme peaks (e.g., 725 alarms)
        return max(0.0, 30.0 * np.exp(-(peak_10min_count - 100) / 100))


# ============================================================================
# TIER 2: ALARM QUALITY (30% weight)
# ============================================================================

def calculate_nuisance_score(
    repeating_pct: float,
    chattering_pct: float,
    total_alarms: int
) -> float:
    """
    Score based on repeating and chattering alarm percentages.
    
    Repeating: Legitimate alarms that recur (acceptable to some degree)
    Chattering: Rapid-fire alarms within 30 sec (serious quality issue)
    
    Scoring:
    - Repeating: Allow up to 70% (process alarms naturally repeat)
    - Chattering: Penalize heavily (should be <5%)
    """
    # Repeating score (mild penalty)
    if repeating_pct <= 70:
        repeating_score = 100.0
    elif repeating_pct <= 85:
        repeating_score = 100.0 - (repeating_pct - 70) * 2
    else:
        repeating_score = max(50.0, 70.0 - (repeating_pct - 85))
    
    # Chattering score (severe penalty)
    if chattering_pct <= 5:
        chattering_score = 100.0
    elif chattering_pct <= 15:
        chattering_score = 80.0 - (chattering_pct - 5) * 2
    elif chattering_pct <= 25:
        chattering_score = 60.0 - (chattering_pct - 15) * 3
    else:
        # Very severe for excessive chattering
        chattering_score = max(0.0, 30.0 - (chattering_pct - 25))
    
    # Weighted combination: chattering is worse than repeating
    return repeating_score * 0.3 + chattering_score * 0.7


def calculate_instrument_health_score(
    instrument_failure_count: int,
    total_sources: int
) -> float:
    """
    Score based on sources with FAIL/BAD instrument conditions.
    
    Target: <2% of sources should have instrument failures
    """
    if total_sources == 0:
        return 100.0
    
    failure_pct = (instrument_failure_count / total_sources) * 100
    
    if failure_pct < 2:
        return 100.0
    elif failure_pct < 5:
        return 90.0 - (failure_pct - 2) * 10
    elif failure_pct < 10:
        return 60.0 - (failure_pct - 5) * 6
    else:
        return max(0.0, 60.0 - (failure_pct - 10) * 3)


# ============================================================================
# TIER 3: OPERATOR RESPONSE (20% weight)
# ============================================================================

def calculate_standing_control_score(
    standing_count: int,
    total_alarms: int
) -> float:
    """
    Score based on standing alarms (active >24 hours).
    
    Standing alarms indicate operator fatigue or alarm acceptance.
    ISO Guidance: <1% of alarms should become standing
    """
    if total_alarms == 0:
        return 100.0
    
    standing_pct = (standing_count / total_alarms) * 100
    
    if standing_pct < 1:
        return 100.0
    elif standing_pct < 3:
        return 85.0 - (standing_pct - 1) * 15
    elif standing_pct < 5:
        return 55.0 - (standing_pct - 3) * 15
    elif standing_pct < 10:
        return 25.0 - (standing_pct - 5) * 5
    else:
        return max(0.0, 25.0 - (standing_pct - 10) * 2)


def calculate_response_score(
    avg_ack_delay_min: float,
    completion_rate_pct: float
) -> float:
    """
    Score based on operator response times and completion rate.
    
    ISO 18.2 Targets:
    - Acknowledge: <10 minutes average
    - Completion: >95% alarms cleared
    """
    # Acknowledgment speed (60% of score)
    if avg_ack_delay_min < 10:
        ack_score = 100.0
    elif avg_ack_delay_min < 30:
        ack_score = 80.0 - (avg_ack_delay_min - 10) / 20 * 30
    elif avg_ack_delay_min < 60:
        ack_score = 50.0 - (avg_ack_delay_min - 30) / 30 * 30
    else:
        # Very poor for delays >60 min
        ack_score = max(20.0, 50.0 - (avg_ack_delay_min - 60) / 10 * 5)
    
    # Completion rate (40% of score)
    if completion_rate_pct >= 95:
        completion_score = 100.0
    elif completion_rate_pct >= 85:
        completion_score = 80.0 + (completion_rate_pct - 85) * 2
    elif completion_rate_pct >= 70:
        completion_score = 50.0 + (completion_rate_pct - 70) * 2
    else:
        completion_score = max(0.0, completion_rate_pct - 20)
    
    return ack_score * 0.6 + completion_score * 0.4


# ============================================================================
# TIER 4: SYSTEM RELIABILITY (10% weight)
# ============================================================================

def calculate_consistency_score(
    days_over_threshold_pct: float,
    cv_daily_alarms: float
) -> float:
    """
    Score based on alarm system predictability and consistency.
    
    Good alarm systems have:
    - Few days exceeding thresholds (<10%)
    - Predictable daily load (CV < 0.5)
    """
    # Days over threshold penalty
    if days_over_threshold_pct <= 10:
        threshold_score = 100.0
    elif days_over_threshold_pct <= 30:
        threshold_score = 80.0 - (days_over_threshold_pct - 10) * 2
    elif days_over_threshold_pct <= 50:
        threshold_score = 40.0 - (days_over_threshold_pct - 30) * 1.5
    else:
        threshold_score = max(0.0, 10.0 - (days_over_threshold_pct - 50) * 0.2)
    
    # Variability penalty (CV = coefficient of variation)
    if cv_daily_alarms < 0.3:
        variability_score = 100.0
    elif cv_daily_alarms < 0.5:
        variability_score = 90.0 - (cv_daily_alarms - 0.3) * 50
    elif cv_daily_alarms < 1.0:
        variability_score = 70.0 - (cv_daily_alarms - 0.5) * 40
    else:
        variability_score = max(20.0, 70.0 - (cv_daily_alarms - 1.0) * 20)
    
    return threshold_score * 0.6 + variability_score * 0.4


# ============================================================================
# COMPOSITE SCORE CALCULATION
# ============================================================================

def calculate_comprehensive_health(metrics: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate comprehensive plant health score combining all tiers.
    
    Args:
        metrics: Dictionary with keys:
            - avg_alarms_per_day: float
            - overload_pct: float (activation_time_in_overload_windows_pct)
            - peak_count: int (peak_10min_activation_count)
            - repeating_pct: float
            - chattering_pct: float
            - total_alarms: int
            - instrument_failures: int
            - total_sources: int
            - standing_count: int
            - avg_ack_delay: float (minutes)
            - completion_rate: float (percentage)
            - days_over_threshold_pct: float
            - cv_daily_alarms: float
    
    Returns:
        Dictionary with:
            - overall_health: float (0-100)
            - grade: str (A+, A, B, C, D, F)
            - risk_level: str (Low, Medium, High, Critical)
            - tier_scores: dict (4 tier scores scaled to 0-100)
            - sub_scores: dict (8 sub-scores)
            - interpretation: str (human-readable summary)
    """
    # Calculate all sub-scores
    daily_load = calculate_daily_load_score(metrics['avg_alarms_per_day'])
    window_overload = calculate_window_overload_score(metrics['overload_pct'])
    peak_intensity = calculate_peak_intensity_score(metrics['peak_count'])
    
    nuisance = calculate_nuisance_score(
        metrics['repeating_pct'],
        metrics['chattering_pct'],
        metrics['total_alarms']
    )
    instrument = calculate_instrument_health_score(
        metrics['instrument_failures'],
        metrics['total_sources']
    )
    
    standing = calculate_standing_control_score(
        metrics['standing_count'],
        metrics['total_alarms']
    )
    response = calculate_response_score(
        metrics['avg_ack_delay'],
        metrics['completion_rate']
    )
    
    consistency = calculate_consistency_score(
        metrics['days_over_threshold_pct'],
        metrics['cv_daily_alarms']
    )
    
    # Calculate tier scores (weighted sub-scores)
    # Each tier contributes its weight to the overall score
    tier1_score = (
        daily_load * 0.20 +      # 20% weight
        window_overload * 0.10 +  # 10% weight
        peak_intensity * 0.10     # 10% weight
    )  # Total: 40%
    
    tier2_score = (
        nuisance * 0.15 +         # 15% weight
        instrument * 0.15         # 15% weight
    )  # Total: 30%
    
    tier3_score = (
        standing * 0.10 +         # 10% weight
        response * 0.10           # 10% weight
    )  # Total: 20%
    
    tier4_score = consistency * 0.10  # 10% weight
    
    # Overall health is sum of weighted tier scores
    overall_health = tier1_score + tier2_score + tier3_score + tier4_score
    overall_health = round(max(0.0, min(100.0, overall_health)), 2)
    
    # Determine grade
    if overall_health >= 95:
        grade = "A+"
        risk_level = "Low"
    elif overall_health >= 85:
        grade = "A"
        risk_level = "Low"
    elif overall_health >= 75:
        grade = "B"
        risk_level = "Medium"
    elif overall_health >= 60:
        grade = "C"
        risk_level = "Medium"
    elif overall_health >= 50:
        grade = "D"
        risk_level = "High"
    else:
        grade = "F"
        risk_level = "Critical"
    
    # Generate interpretation
    interpretation = _generate_interpretation(overall_health, grade, risk_level, {
        'tier1': tier1_score * 2.5,  # Scale to 0-100 for display
        'tier2': tier2_score * 3.33,
        'tier3': tier3_score * 5.0,
        'tier4': tier4_score * 10.0
    })
    
    return {
        'overall_health': overall_health,
        'grade': grade,
        'risk_level': risk_level,
        'tier_scores': {
            'load_compliance': round(tier1_score * 2.5, 2),      # Scale 0-40 → 0-100
            'alarm_quality': round(tier2_score * 3.33, 2),       # Scale 0-30 → 0-100
            'operator_response': round(tier3_score * 5.0, 2),    # Scale 0-20 → 0-100
            'system_reliability': round(tier4_score * 10.0, 2)   # Scale 0-10 → 0-100
        },
        'sub_scores': {
            'daily_load_score': round(daily_load, 2),
            'window_overload_score': round(window_overload, 2),
            'peak_intensity_score': round(peak_intensity, 2),
            'nuisance_score': round(nuisance, 2),
            'instrument_health_score': round(instrument, 2),
            'standing_control_score': round(standing, 2),
            'response_score': round(response, 2),
            'consistency_score': round(consistency, 2)
        },
        'interpretation': interpretation
    }


def _generate_interpretation(
    overall_health: float,
    grade: str,
    risk_level: str,
    tier_scores: Dict[str, float]
) -> str:
    """Generate human-readable interpretation of health score."""
    if overall_health >= 85:
        return "Excellent alarm management. System operates within industry best practices."
    elif overall_health >= 75:
        return "Good alarm management with room for minor improvements in specific areas."
    elif overall_health >= 60:
        return "Acceptable alarm management but several areas need attention to meet standards."
    elif overall_health >= 50:
        return "Poor alarm management. Significant improvements required to reduce operator burden."
    else:
        # Find worst tier
        worst_tier = min(tier_scores, key=tier_scores.get)
        tier_names = {
            'tier1': 'alarm load compliance',
            'tier2': 'alarm quality',
            'tier3': 'operator response',
            'tier4': 'system reliability'
        }
        return (f"Critical alarm management issues requiring immediate action. "
                f"Primary concern: {tier_names.get(worst_tier, 'multiple areas')}.")
