import json
import pandas as pd
from datetime import datetime
from typing import Dict, List, Any
import numpy as np

class AlarmSystemInsightsGenerator:
    def __init__(self, data: Dict[str, Any]):
        """Initialize the insights generator with alarm system data"""
        self.data = data
        self.overall_health = data['overall']['health_pct_simple']
        self.weighted_health = data['overall']['health_pct_weighted']
        self.totals = data['overall']['totals']
        self.files = data.get('files', [])
        
    def generate_comprehensive_insights(self) -> Dict[str, Any]:
        """Generate complete insights including descriptive and prescriptive analysis"""
        
        insights = {
            "timestamp": datetime.now().isoformat(),
            "descriptive_analysis": self._generate_descriptive_analysis(),
            "prescriptive_analysis": self._generate_prescriptive_analysis(),
            "summary": self._generate_summary(),
            "key_metrics": self._calculate_key_metrics()
        }
        
        return insights
    
    def _generate_descriptive_analysis(self) -> Dict[str, Any]:
        """Generate detailed descriptive analysis of the system"""
        
        # Analyze unhealthy patterns
        unhealthy_analysis = self._analyze_unhealthy_patterns()
        
        descriptive = {
            "system_overview": {
                "title": "System Health Overview",
                "description": f"The PVCI plant alarm management system is currently operating at {self.overall_health:.2f}% health efficiency. "
                               f"This indicates that approximately {100 - self.overall_health:.2f}% of monitored time periods contain alarm floods or excessive alarms.",
                "details": {
                    "total_monitoring_points": self.totals['sources'],
                    "monitoring_periods": self.totals['files'],
                    "total_time_bins_analyzed": self.totals['total_bins'],
                    "healthy_operation_periods": self.totals['healthy_bins'],
                    "problematic_periods": self.totals['unhealthy_bins'],
                    "weighted_health_score": f"{self.weighted_health:.2f}%"
                }
            },
            
            "alarm_flooding_analysis": {
                "title": "Alarm Flooding Patterns",
                "description": "Alarm flooding occurs when operators receive more than 10 alarms in a 10-minute window, reducing their ability to respond effectively.",
                "findings": unhealthy_analysis['flooding_patterns']
            },
            
            "temporal_patterns": {
                "title": "Time-Based Patterns",
                "description": "Analysis of when alarm issues typically occur",
                "findings": self._analyze_temporal_patterns()
            },
            
            "source_behavior": {
                "title": "Alarm Source Behavior Analysis",
                "description": "Detailed analysis of individual alarm sources and their contribution to system health",
                "findings": unhealthy_analysis['source_analysis']
            }
        }
        
        return descriptive
    
    def _generate_prescriptive_analysis(self) -> Dict[str, Any]:
        """Generate actionable recommendations for system improvement"""
        
        recommendations = []
        priority_levels = {"critical": [], "high": [], "medium": [], "low": []}
        
        # Analyze system health for recommendations
        if self.overall_health < 90:
            priority_levels["critical"].append({
                "recommendation": "Implement Alarm Rationalization Program",
                "action": "Conduct a comprehensive alarm rationalization study to eliminate nuisance alarms and properly configure alarm priorities.",
                "expected_impact": "Could improve system health by 15-25%",
                "implementation_time": "2-3 months",
                "resources_needed": ["Alarm management specialist", "Process engineers", "Operations team"]
            })
        
        if self.weighted_health < self.overall_health - 5:
            priority_levels["high"].append({
                "recommendation": "Address High-Frequency Alarm Sources",
                "action": "Focus on the top 10% of alarm sources that contribute to 80% of alarm floods. Implement advanced alarm suppression logic.",
                "expected_impact": f"Could reduce unhealthy bins by up to 40%",
                "implementation_time": "1-2 months",
                "resources_needed": ["Control system engineer", "DCS configuration access"]
            })
        
        # Analyze unhealthy bin percentage
        unhealthy_percentage = (self.totals['unhealthy_bins'] / self.totals['total_bins']) * 100
        if unhealthy_percentage > 10:
            priority_levels["high"].append({
                "recommendation": "Implement Dynamic Alarm Management",
                "action": "Deploy state-based alarming that adjusts alarm limits based on process conditions (startup, shutdown, steady-state).",
                "expected_impact": "Reduce false alarms by 30-50% during transient conditions",
                "implementation_time": "3-4 months",
                "resources_needed": ["Advanced process control engineer", "Alarm management software"]
            })
        
        # Add medium priority recommendations
        priority_levels["medium"].extend([
            {
                "recommendation": "Operator Training Enhancement",
                "action": "Conduct targeted training for operators on alarm response procedures, focusing on frequently occurring alarm scenarios.",
                "expected_impact": "Improve response time by 20-30%",
                "implementation_time": "1 month",
                "resources_needed": ["Training coordinator", "Operations supervisors"]
            },
            {
                "recommendation": "Alarm Shelving Implementation",
                "action": "Implement temporary alarm suppression (shelving) for known issues awaiting maintenance.",
                "expected_impact": "Reduce operator alarm load by 10-15%",
                "implementation_time": "2-3 weeks",
                "resources_needed": ["Control system configuration"]
            }
        ])
        
        # Add low priority recommendations
        priority_levels["low"].extend([
            {
                "recommendation": "Monthly Alarm Performance Review",
                "action": "Establish monthly KPI reviews for alarm system performance with operations and engineering teams.",
                "expected_impact": "Continuous improvement of 2-3% per quarter",
                "implementation_time": "Immediate",
                "resources_needed": ["Management commitment", "1-2 hours monthly"]
            }
        ])
        
        prescriptive = {
            "overall_strategy": {
                "title": "Recommended Improvement Strategy",
                "description": f"Based on the current health score of {self.overall_health:.2f}%, a phased improvement approach is recommended.",
                "phases": [
                    {
                        "phase": 1,
                        "name": "Quick Wins",
                        "duration": "0-1 month",
                        "focus": "Address top 5 bad actors and implement basic alarm suppression"
                    },
                    {
                        "phase": 2,
                        "name": "Systematic Improvement",
                        "duration": "1-3 months",
                        "focus": "Comprehensive alarm rationalization and priority adjustment"
                    },
                    {
                        "phase": 3,
                        "name": "Advanced Optimization",
                        "duration": "3-6 months",
                        "focus": "Implement dynamic alarming and predictive analytics"
                    }
                ]
            },
            "prioritized_recommendations": priority_levels,
            "expected_outcomes": {
                "short_term": "15-20% improvement in alarm health within 1 month",
                "medium_term": "30-40% improvement within 3 months",
                "long_term": "Achieve and maintain >95% alarm health within 6 months"
            }
        }
        
        return prescriptive
    
    def _generate_summary(self) -> Dict[str, Any]:
        """Generate executive summary of the analysis"""
        
        # Calculate key statistics
        unhealthy_rate = (self.totals['unhealthy_bins'] / self.totals['total_bins']) * 100
        avg_file_health = np.mean([f['health_pct'] for f in self.files]) if self.files else 0
        
        # Determine system status
        if self.overall_health >= 95:
            status = "EXCELLENT"
            status_color = "green"
        elif self.overall_health >= 90:
            status = "GOOD"
            status_color = "yellow"
        elif self.overall_health >= 80:
            status = "NEEDS IMPROVEMENT"
            status_color = "orange"
        else:
            status = "CRITICAL"
            status_color = "red"
        
        summary = {
            "executive_summary": {
                "status": status,
                "status_indicator": status_color,
                "headline": f"PVCI Plant Alarm System Health: {self.overall_health:.1f}%",
                "key_findings": [
                    f"System experiencing alarm floods in {unhealthy_rate:.1f}% of monitored periods",
                    f"Average file health across all monitoring periods: {avg_file_health:.1f}%",
                    f"Total of {self.totals['unhealthy_bins']} problematic time periods identified out of {self.totals['total_bins']} analyzed",
                    f"Weighted health score ({self.weighted_health:.1f}%) suggests concentrated issues in specific areas"
                ],
                "immediate_actions": self._get_immediate_actions(),
                "risk_assessment": self._assess_operational_risk()
            }
        }
        
        return summary
    
    def _analyze_unhealthy_patterns(self) -> Dict[str, Any]:
        """Analyze patterns in unhealthy alarm occurrences"""
        
        patterns = {
            "flooding_patterns": {
                "total_flood_events": self.totals['unhealthy_bins'],
                "flood_rate": f"{(self.totals['unhealthy_bins'] / self.totals['total_bins']) * 100:.2f}%",
                "severity_distribution": self._calculate_severity_distribution(),
                "trending": self._analyze_trending()
            },
            "source_analysis": {
                "total_unique_sources": self.totals['sources'],
                "sources_per_file": f"{self.totals['sources'] / self.totals['files']:.0f} average",
                "concentration_analysis": "High concentration of alarms from specific sources indicates opportunity for targeted improvement"
            }
        }
        
        return patterns
    
    def _analyze_temporal_patterns(self) -> Dict[str, Any]:
        """Analyze time-based patterns in the data"""
        
        # Extract dates from filenames if available
        file_patterns = []
        for file_info in self.files:
            file_patterns.append({
                "file": file_info['filename'],
                "health": file_info['health_pct'],
                "unhealthy_count": file_info['unhealthy_bins']
            })
        
        return {
            "file_based_analysis": file_patterns[:5],  # Show top 5 for brevity
            "observation": "Variation in health scores across different time periods suggests process-related or operational factors"
        }
    
    def _calculate_severity_distribution(self) -> Dict[str, Any]:
        """Calculate the distribution of alarm severity"""
        
        # Based on unhealthy percentage thresholds
        unhealthy_pct = (self.totals['unhealthy_bins'] / self.totals['total_bins']) * 100
        
        if unhealthy_pct < 5:
            severity = "Low"
        elif unhealthy_pct < 10:
            severity = "Moderate"
        elif unhealthy_pct < 15:
            severity = "High"
        else:
            severity = "Critical"
        
        return {
            "current_severity": severity,
            "unhealthy_percentage": f"{unhealthy_pct:.2f}%",
            "interpretation": f"With {unhealthy_pct:.2f}% unhealthy bins, the system shows {severity.lower()} alarm flooding severity"
        }
    
    def _analyze_trending(self) -> str:
        """Analyze trending patterns in the data"""
        
        if len(self.files) < 2:
            return "Insufficient data for trend analysis"
        
        # Simple trend analysis based on file health percentages
        health_values = [f['health_pct'] for f in self.files[:10]]  # Last 10 files
        if len(health_values) > 1:
            trend = "improving" if health_values[-1] > health_values[0] else "degrading"
            return f"System health appears to be {trend} based on recent data"
        
        return "Trend analysis in progress"
    
    def _calculate_key_metrics(self) -> Dict[str, Any]:
        """Calculate key performance metrics"""
        
        return {
            "alarm_flood_rate": f"{(self.totals['unhealthy_bins'] / self.totals['total_bins']) * 100:.2f}%",
            "system_availability": f"{self.overall_health:.2f}%",
            "monitoring_coverage": f"{self.totals['sources']} sources across {self.totals['files']} files",
            "performance_gap": f"{100 - self.overall_health:.2f}%",
            "improvement_potential": f"{100 - self.weighted_health:.2f}% (weighted)"
        }
    
    def _get_immediate_actions(self) -> List[str]:
        """Get immediate actions based on current health"""
        
        actions = []
        
        if self.overall_health < 90:
            actions.append("Schedule emergency alarm rationalization meeting")
            actions.append("Identify and suppress top 5 nuisance alarms")
        
        if self.weighted_health < 85:
            actions.append("Review and adjust alarm priorities for critical equipment")
            actions.append("Implement temporary alarm suppression for known issues")
        
        actions.append("Brief operations team on current alarm system status")
        
        return actions
    
    def _assess_operational_risk(self) -> Dict[str, Any]:
        """Assess operational risk based on alarm system health"""
        
        if self.overall_health >= 95:
            risk_level = "Low"
            risk_description = "System operating within best practice guidelines"
        elif self.overall_health >= 90:
            risk_level = "Medium-Low"
            risk_description = "Minor alarm management issues present but manageable"
        elif self.overall_health >= 80:
            risk_level = "Medium"
            risk_description = "Significant alarm flooding affecting operator effectiveness"
        elif self.overall_health >= 70:
            risk_level = "Medium-High"
            risk_description = "Serious alarm management issues requiring immediate attention"
        else:
            risk_level = "High"
            risk_description = "Critical alarm flooding compromising safe and efficient operations"
        
        return {
            "risk_level": risk_level,
            "description": risk_description,
            "mitigation_priority": "Immediate" if self.overall_health < 80 else "Standard"
        }


# Function to analyze specific unhealthy source details
def analyze_unhealthy_source(source_name: str, source_data: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze a specific unhealthy source in detail"""
    
    analysis = {
        "source_name": source_name,
        "health_score": f"{source_data.get('health_pct', 0):.2f}%",
        "total_occurrences": source_data.get('total_bins', 0),
        "unhealthy_events": source_data.get('unhealthy_bins', 0),
        "files_affected": source_data.get('files_touched', 0),
        
        "detailed_analysis": {
            "frequency_analysis": _analyze_frequency(source_data),
            "pattern_identification": _identify_patterns(source_data),
            "root_cause_hypothesis": _hypothesize_root_cause(source_data),
            "specific_recommendations": _get_source_specific_recommendations(source_data)
        }
    }
    
    return analysis

def _analyze_frequency(source_data: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze alarm frequency for a specific source"""
    
    unhealthy_details = source_data.get('unhealthy_bin_details', [])
    if not unhealthy_details:
        return {"status": "No unhealthy events to analyze"}
    
    # Calculate statistics from unhealthy bins
    hits_list = [detail.get('hits', 0) for detail in unhealthy_details]
    rates_list = [detail.get('rate_per_min', 0) for detail in unhealthy_details]
    
    return {
        "average_hits_per_event": np.mean(hits_list) if hits_list else 0,
        "max_hits_in_window": max(hits_list) if hits_list else 0,
        "average_rate_per_minute": np.mean(rates_list) if rates_list else 0,
        "peak_rate_observed": max(rates_list) if rates_list else 0,
        "total_flood_events": len(unhealthy_details)
    }

def _identify_patterns(source_data: Dict[str, Any]) -> List[str]:
    """Identify patterns in alarm occurrences"""
    
    patterns = []
    unhealthy_details = source_data.get('unhealthy_bin_details', [])
    
    if not unhealthy_details:
        return ["No patterns identified due to lack of unhealthy events"]
    
    # Analyze conditions
    conditions = [detail.get('condition', '') for detail in unhealthy_details]
    if conditions:
        most_common = max(set(conditions), key=conditions.count)
        patterns.append(f"Most common trigger condition: {most_common}")
    
    # Analyze timing
    if len(unhealthy_details) > 1:
        patterns.append(f"Alarm flooding occurs across {len(unhealthy_details)} separate time windows")
    
    # Analyze severity
    over_threshold = [detail.get('over_pct', 0) for detail in unhealthy_details]
    if over_threshold:
        avg_over = np.mean(over_threshold)
        patterns.append(f"Alarms exceed threshold by average of {avg_over:.1f}%")
    
    return patterns

def _hypothesize_root_cause(source_data: Dict[str, Any]) -> List[str]:
    """Generate hypothesis for root causes"""
    
    hypotheses = []
    health_pct = source_data.get('health_pct', 100)
    unhealthy_details = source_data.get('unhealthy_bin_details', [])
    
    if health_pct < 95:
        hypotheses.append("Possible control loop oscillation or tuning issues")
    
    if health_pct < 90:
        hypotheses.append("Potential equipment malfunction or sensor drift")
    
    # Check for specific conditions
    for detail in unhealthy_details:
        if 'Start of Control' in detail.get('condition', ''):
            hypotheses.append("Process transitions triggering excessive alarms")
        if 'Recovery' in detail.get('description', ''):
            hypotheses.append("Recovery sequences generating alarm floods")
    
    return hypotheses if hypotheses else ["Further investigation needed to determine root cause"]

def _get_source_specific_recommendations(source_data: Dict[str, Any]) -> List[str]:
    """Get specific recommendations for this alarm source"""
    
    recommendations = []
    health_pct = source_data.get('health_pct', 100)
    
    if health_pct < 98:
        recommendations.append("Review and adjust alarm deadband settings")
    
    if health_pct < 95:
        recommendations.append("Implement alarm delay timers to filter transient conditions")
        recommendations.append("Consider alarm suppression during known process transitions")
    
    if health_pct < 90:
        recommendations.append("Urgent: Investigate equipment condition and sensor calibration")
        recommendations.append("Review control logic and implement conditional alarming")
    
    return recommendations if recommendations else ["System performing within acceptable limits"]


# Example usage function
def generate_insights_for_chart_click(json_data: Dict[str, Any], 
                                      selected_source: str = None) -> Dict[str, Any]:
    """
    Main function to generate insights when user clicks on the AI insights button
    
    Args:
        json_data: The complete JSON data from the alarm system
        selected_source: Optional - specific source to analyze in detail
    
    Returns:
        Dictionary containing all insights
    """
    
    # Generate overall system insights
    insights_generator = AlarmSystemInsightsGenerator(json_data)
    system_insights = insights_generator.generate_comprehensive_insights()
    
    # If a specific source is selected, add detailed source analysis
    if selected_source and selected_source in json_data:
        source_insights = analyze_unhealthy_source(selected_source, json_data[selected_source])
        system_insights['selected_source_analysis'] = source_insights
    
    return system_insights


# Example usage with your data
if __name__ == "__main__":
    # Sample data (truncated version of your JSON)
    sample_data = {
        "plant_folder": "D:\\Qbit-dynamics\\alarm_system\\alarm_backend\\ALARM_DATA_DIR\\PVC-I (Jan, Feb, Mar) EVENTS",
        "generated_at": "2025-09-19T16:11:57.920170+00:00",
        "overall": {
            "health_pct_simple": 93.77833,
            "health_pct_weighted": 88.8659,
            "totals": {
                "files": 76,
                "sources": 26740,
                "total_bins": 186077,
                "healthy_bins": 165359,
                "unhealthy_bins": 20718
            }
        },
        "files": [
            {
                "filename": "02feb.csv",
                "num_sources": 179,
                "health_pct": 94.951685,
                "total_bins": 890,
                "healthy_bins": 825,
                "unhealthy_bins": 65
            }
        ],
        "UP_RECOVERY": {
            "files_touched": 68,
            "total_bins": 2019,
            "healthy_bins": 1988,
            "unhealthy_bins": 31,
            "health_pct": 98.464586,
            "unhealthy_bin_details": []
        }
    }
    
    # Generate insights
    insights = generate_insights_for_chart_click(sample_data, "UP_RECOVERY")
    
    # Print formatted output
    print(json.dumps(insights, indent=2))