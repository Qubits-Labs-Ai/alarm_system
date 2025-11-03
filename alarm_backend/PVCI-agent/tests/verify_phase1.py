cd"""
Phase 1 Verification Script
Tests max iteration fixes and new tool expansion
"""
import asyncio
import json
import requests
import time
from typing import Dict, List

BASE_URL = "http://localhost:8000/agent/pvci"

class Phase1Verifier:
    def __init__(self):
        self.results = {
            "iteration_fixes": {},
            "new_tools": {},
            "overall": {"passed": 0, "failed": 0}
        }
    
    def test_auto_fix_column_quotes(self):
        """Test 1.1.1: Auto-fix column name quotes"""
        print("\n[Test 1.1.1] Auto-fix column name quotes...")
        
        query = "SELECT Event Time, Source FROM alerts LIMIT 5"
        response = requests.post(
            f"{BASE_URL}/stream",
            json={"query": query, "sessionId": "test_autofix", "requestId": "1"}
        )
        
        events = []
        for line in response.iter_lines():
            if line.startswith(b"data: "):
                event = json.loads(line[6:])
                events.append(event)
        
        # Check if completed successfully (not error)
        completed = any(e.get("type") == "complete" for e in events)
        error = any(e.get("type") == "error" for e in events)
        
        if completed and not error:
            print("✅ PASS: Auto-fixed column quotes")
            self.results["iteration_fixes"]["auto_fix_columns"] = "PASS"
            self.results["overall"]["passed"] += 1
            return True
        else:
            print("❌ FAIL: Could not auto-fix column quotes")
            self.results["iteration_fixes"]["auto_fix_columns"] = "FAIL"
            self.results["overall"]["failed"] += 1
            return False
    
    def test_max_iterations_increased(self):
        """Test 1.1.2: Max iterations increased to 12"""
        print("\n[Test 1.1.2] Max iterations increased...")
        
        # Complex query that requires multiple iterations
        query = """Analyze chattering behavior for all temperature instruments in REACTOR area 
                   with high priority that occurred in last 7 days and provide recommendations"""
        
        response = requests.post(
            f"{BASE_URL}/stream",
            json={"query": query, "sessionId": "test_iterations", "requestId": "2"}
        )
        
        iteration_count = 0
        completed = False
        
        for line in response.iter_lines():
            if line.startswith(b"data: "):
                event = json.loads(line[6:])
                if event.get("type") == "complete":
                    completed = True
                    iteration_count = event.get("data", {}).get("iterations", 0)
        
        if completed and iteration_count <= 12:
            print(f"✅ PASS: Completed in {iteration_count} iterations (≤12)")
            self.results["iteration_fixes"]["max_iterations"] = f"PASS ({iteration_count})"
            self.results["overall"]["passed"] += 1
            return True
        else:
            print(f"❌ FAIL: Exceeded iterations or failed")
            self.results["iteration_fixes"]["max_iterations"] = "FAIL"
            self.results["overall"]["failed"] += 1
            return False
    
    def test_iteration_budget_tracking(self):
        """Test 1.1.3: Iteration budget prevents infinite loops"""
        print("\n[Test 1.1.3] Iteration budget tracking...")
        
        # Query that will cause repeated SQL errors
        query = "SELECT nonexistent_column FROM alerts LIMIT 10"
        
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/stream",
            json={"query": query, "sessionId": "test_budget", "requestId": "3"}
        )
        
        error_found = False
        duration = 0
        
        for line in response.iter_lines():
            if line.startswith(b"data: "):
                event = json.loads(line[6:])
                if event.get("type") == "error":
                    error_found = True
                    duration = time.time() - start_time
                    break
        
        # Should fail fast (within 10 seconds) instead of hitting max iterations
        if error_found and duration < 10:
            print(f"✅ PASS: Failed fast in {duration:.2f}s")
            self.results["iteration_fixes"]["budget_tracking"] = "PASS"
            self.results["overall"]["passed"] += 1
            return True
        else:
            print(f"❌ FAIL: Took too long or didn't fail properly")
            self.results["iteration_fixes"]["budget_tracking"] = "FAIL"
            self.results["overall"]["failed"] += 1
            return False
    
    def test_new_tool_availability(self):
        """Test 1.2.1: All 20 tools available"""
        print("\n[Test 1.2.1] Testing new tool availability...")
        
        # Import data_tools to check AVAILABLE_TOOLS
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from data_tools import AVAILABLE_TOOLS
        
        tool_names = [t.__name__ for t in AVAILABLE_TOOLS]
        expected_count = 20
        actual_count = len(tool_names)
        
        if actual_count >= expected_count:
            print(f"✅ PASS: {actual_count} tools available (expected {expected_count})")
            self.results["new_tools"]["count"] = f"PASS ({actual_count})"
            self.results["overall"]["passed"] += 1
            
            # List new tools
            new_tools = [
                "get_alarm_statistics", "detect_anomalies", "get_time_series_trend",
                "compare_time_periods", "analyze_correlations", "get_maintenance_metrics",
                "generate_summary_report", "export_data_csv", "get_current_active_alarms",
                "check_threshold_violations", "forecast_alarm_load", "predict_bad_actors"
            ]
            
            found_new = [t for t in new_tools if t in tool_names]
            print(f"   New tools found: {len(found_new)}/{len(new_tools)}")
            print(f"   Tools: {', '.join(found_new[:5])}...")
            
            return True
        else:
            print(f"❌ FAIL: Only {actual_count} tools (expected {expected_count})")
            self.results["new_tools"]["count"] = f"FAIL ({actual_count})"
            self.results["overall"]["failed"] += 1
            return False
    
    def test_tool_execution_statistics(self):
        """Test 1.2.2: New statistical tool works"""
        print("\n[Test 1.2.2] Testing get_alarm_statistics...")
        
        query = "Get alarm statistics for last 7 days grouped by source"
        
        response = requests.post(
            f"{BASE_URL}/stream",
            json={"query": query, "sessionId": "test_stats", "requestId": "4"}
        )
        
        tool_called = False
        completed = False
        
        for line in response.iter_lines():
            if line.startswith(b"data: "):
                event = json.loads(line[6:])
                if event.get("type") == "tool_call":
                    tool_name = event.get("data", {}).get("name", "")
                    if "statistics" in tool_name.lower():
                        tool_called = True
                if event.get("type") == "complete":
                    completed = True
        
        if tool_called and completed:
            print("✅ PASS: Statistics tool executed successfully")
            self.results["new_tools"]["statistics"] = "PASS"
            self.results["overall"]["passed"] += 1
            return True
        else:
            print("❌ FAIL: Statistics tool not called or failed")
            self.results["new_tools"]["statistics"] = "FAIL"
            self.results["overall"]["failed"] += 1
            return False
    
    def test_tool_execution_trends(self):
        """Test 1.2.3: New trend analysis tool works"""
        print("\n[Test 1.2.3] Testing get_time_series_trend...")
        
        query = "Show hourly alarm trend for last 24 hours"
        
        response = requests.post(
            f"{BASE_URL}/stream",
            json={"query": query, "sessionId": "test_trend", "requestId": "5"}
        )
        
        tool_called = False
        completed = False
        
        for line in response.iter_lines():
            if line.startswith(b"data: "):
                event = json.loads(line[6:])
                if event.get("type") == "tool_call":
                    tool_name = event.get("data", {}).get("name", "")
                    if "trend" in tool_name.lower() or "series" in tool_name.lower():
                        tool_called = True
                if event.get("type") == "complete":
                    completed = True
        
        if tool_called and completed:
            print("✅ PASS: Trend tool executed successfully")
            self.results["new_tools"]["trends"] = "PASS"
            self.results["overall"]["passed"] += 1
            return True
        else:
            print("❌ FAIL: Trend tool not called or failed")
            self.results["new_tools"]["trends"] = "FAIL"
            self.results["overall"]["failed"] += 1
            return False
    
    def run_all_tests(self):
        """Run all Phase 1 verification tests"""
        print("="*60)
        print("PHASE 1 VERIFICATION - Max Iterations & Tool Expansion")
        print("="*60)
        
        # Test 1.1: Iteration fixes
        self.test_auto_fix_column_quotes()
        self.test_max_iterations_increased()
        self.test_iteration_budget_tracking()
        
        # Test 1.2: New tools
        self.test_new_tool_availability()
        self.test_tool_execution_statistics()
        self.test_tool_execution_trends()
        
        # Summary
        print("\n" + "="*60)
        print("PHASE 1 SUMMARY")
        print("="*60)
        print(f"✅ Passed: {self.results['overall']['passed']}")
        print(f"❌ Failed: {self.results['overall']['failed']}")
        
        total = self.results['overall']['passed'] + self.results['overall']['failed']
        success_rate = (self.results['overall']['passed'] / total * 100) if total > 0 else 0
        print(f"Success Rate: {success_rate:.1f}%")
        
        if success_rate >= 80:
            print("\n🎉 PHASE 1 VERIFICATION PASSED")
            print("Proceed to Phase 2")
            return True
        else:
            print("\n⚠️ PHASE 1 VERIFICATION FAILED")
            print("Fix failing tests before proceeding")
            return False

if __name__ == "__main__":
    verifier = Phase1Verifier()
    success = verifier.run_all_tests()
    exit(0 if success else 1)
