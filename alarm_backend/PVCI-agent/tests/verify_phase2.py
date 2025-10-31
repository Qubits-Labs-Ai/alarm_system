"""
Phase 2 Verification Script
Tests parameter validation and schema improvements
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import json
from data_tools import *

class Phase2Verifier:
    def __init__(self):
        self.results = {
            "validation": {},
            "schema": {},
            "overall": {"passed": 0, "failed": 0}
        }
    
    def test_invalid_top_n(self):
        """Test 2.1.1: Reject invalid top_n parameter"""
        print("\n[Test 2.1.1] Invalid top_n rejection...")
        
        try:
            result = analyze_bad_actors(top_n=-5, min_alarms=50)
            parsed = json.loads(result)
            
            if "error" in parsed and "range" in result.lower():
                print("✅ PASS: Rejected negative top_n")
                self.results["validation"]["top_n_negative"] = "PASS"
                self.results["overall"]["passed"] += 1
                return True
        except Exception as e:
            pass
        
        print("❌ FAIL: Did not reject negative top_n")
        self.results["validation"]["top_n_negative"] = "FAIL"
        self.results["overall"]["failed"] += 1
        return False
    
    def test_invalid_time_period(self):
        """Test 2.1.2: Reject invalid time_period enum"""
        print("\n[Test 2.1.2] Invalid time_period rejection...")
        
        try:
            result = get_isa_compliance_report(time_period="yesterday")
            parsed = json.loads(result)
            
            if "error" in parsed and "time_period" in result.lower():
                print("✅ PASS: Rejected invalid time_period")
                self.results["validation"]["time_period_enum"] = "PASS"
                self.results["overall"]["passed"] += 1
                return True
        except Exception as e:
            pass
        
        print("❌ FAIL: Did not reject invalid time_period")
        self.results["validation"]["time_period_enum"] = "FAIL"
        self.results["overall"]["failed"] += 1
        return False
    
    def test_sql_without_limit(self):
        """Test 2.1.3: Reject SQL without LIMIT"""
        print("\n[Test 2.1.3] SQL LIMIT enforcement...")
        
        try:
            result = execute_sql_query("SELECT * FROM alerts")
            parsed = json.loads(result)
            
            if "error" in parsed and "limit" in result.lower():
                print("✅ PASS: Rejected query without LIMIT")
                self.results["validation"]["sql_limit"] = "PASS"
                self.results["overall"]["passed"] += 1
                return True
        except Exception as e:
            pass
        
        print("❌ FAIL: Did not enforce LIMIT clause")
        self.results["validation"]["sql_limit"] = "FAIL"
        self.results["overall"]["failed"] += 1
        return False
    
    def test_sql_excessive_limit(self):
        """Test 2.1.4: Reject excessive LIMIT"""
        print("\n[Test 2.1.4] Excessive LIMIT rejection...")
        
        try:
            result = execute_sql_query("SELECT * FROM alerts LIMIT 50000")
            parsed = json.loads(result)
            
            if "error" in parsed and ("large" in result.lower() or "maximum" in result.lower()):
                print("✅ PASS: Rejected excessive LIMIT")
                self.results["validation"]["sql_limit_max"] = "PASS"
                self.results["overall"]["passed"] += 1
                return True
        except Exception as e:
            pass
        
        print("❌ FAIL: Did not reject excessive LIMIT")
        self.results["validation"]["sql_limit_max"] = "FAIL"
        self.results["overall"]["failed"] += 1
        return False
    
    def test_valid_parameters_accepted(self):
        """Test 2.1.5: Accept valid parameters"""
        print("\n[Test 2.1.5] Valid parameters accepted...")
        
        try:
            result = analyze_bad_actors(top_n=10, min_alarms=50)
            parsed = json.loads(result)
            
            if "error" not in parsed or ("status" in parsed and parsed["status"] == "success"):
                print("✅ PASS: Accepted valid parameters")
                self.results["validation"]["valid_params"] = "PASS"
                self.results["overall"]["passed"] += 1
                return True
        except Exception as e:
            print(f"Exception: {e}")
        
        print("❌ FAIL: Rejected valid parameters")
        self.results["validation"]["valid_params"] = "FAIL"
        self.results["overall"]["failed"] += 1
        return False
    
    def test_schema_has_types(self):
        """Test 2.2.1: Schema includes proper types"""
        print("\n[Test 2.2.1] Schema type definitions...")
        
        try:
            from glm_agent import build_tool_schema
            schema = build_tool_schema(analyze_bad_actors)
            
            props = schema['function']['parameters']['properties']
            top_n_type = props.get('top_n', {}).get('type')
            
            if top_n_type == 'integer':
                print("✅ PASS: Schema has correct types (integer)")
                self.results["schema"]["types"] = "PASS"
                self.results["overall"]["passed"] += 1
                return True
        except Exception as e:
            print(f"Exception: {e}")
        
        print("❌ FAIL: Schema types incorrect or missing")
        self.results["schema"]["types"] = "FAIL"
        self.results["overall"]["failed"] += 1
        return False
    
    def test_schema_has_enums(self):
        """Test 2.2.2: Schema includes enum constraints"""
        print("\n[Test 2.2.2] Schema enum constraints...")
        
        try:
            from glm_agent import build_tool_schema
            schema = build_tool_schema(get_isa_compliance_report)
            
            props = schema['function']['parameters']['properties']
            time_period_enum = props.get('time_period', {}).get('enum')
            
            if time_period_enum and len(time_period_enum) > 0:
                print(f"✅ PASS: Schema has enums: {time_period_enum}")
                self.results["schema"]["enums"] = "PASS"
                self.results["overall"]["passed"] += 1
                return True
        except Exception as e:
            print(f"Exception: {e}")
        
        print("❌ FAIL: Schema missing enums")
        self.results["schema"]["enums"] = "FAIL"
        self.results["overall"]["failed"] += 1
        return False
    
    def test_schema_has_ranges(self):
        """Test 2.2.3: Schema includes min/max ranges"""
        print("\n[Test 2.2.3] Schema range constraints...")
        
        try:
            from glm_agent import build_tool_schema
            schema = build_tool_schema(analyze_bad_actors)
            
            props = schema['function']['parameters']['properties']
            top_n_min = props.get('top_n', {}).get('minimum')
            top_n_max = props.get('top_n', {}).get('maximum')
            
            if top_n_min is not None and top_n_max is not None:
                print(f"✅ PASS: Schema has ranges: min={top_n_min}, max={top_n_max}")
                self.results["schema"]["ranges"] = "PASS"
                self.results["overall"]["passed"] += 1
                return True
        except Exception as e:
            print(f"Exception: {e}")
        
        print("❌ FAIL: Schema missing min/max ranges")
        self.results["schema"]["ranges"] = "FAIL"
        self.results["overall"]["failed"] += 1
        return False
    
    def test_schema_has_descriptions(self):
        """Test 2.2.4: Schema includes parameter descriptions"""
        print("\n[Test 2.2.4] Schema parameter descriptions...")
        
        try:
            from glm_agent import build_tool_schema
            schema = build_tool_schema(analyze_bad_actors)
            
            props = schema['function']['parameters']['properties']
            top_n_desc = props.get('top_n', {}).get('description', '')
            
            # Check if description is meaningful (not just generic)
            if top_n_desc and len(top_n_desc) > 20:
                print(f"✅ PASS: Schema has descriptions")
                self.results["schema"]["descriptions"] = "PASS"
                self.results["overall"]["passed"] += 1
                return True
        except Exception as e:
            print(f"Exception: {e}")
        
        print("❌ FAIL: Schema missing good descriptions")
        self.results["schema"]["descriptions"] = "FAIL"
        self.results["overall"]["failed"] += 1
        return False
    
    def run_all_tests(self):
        """Run all Phase 2 verification tests"""
        print("="*60)
        print("PHASE 2 VERIFICATION - Validation & Schema")
        print("="*60)
        
        # Test 2.1: Parameter validation
        self.test_invalid_top_n()
        self.test_invalid_time_period()
        self.test_sql_without_limit()
        self.test_sql_excessive_limit()
        self.test_valid_parameters_accepted()
        
        # Test 2.2: Schema improvements
        self.test_schema_has_types()
        self.test_schema_has_enums()
        self.test_schema_has_ranges()
        self.test_schema_has_descriptions()
        
        # Summary
        print("\n" + "="*60)
        print("PHASE 2 SUMMARY")
        print("="*60)
        print(f"✅ Passed: {self.results['overall']['passed']}")
        print(f"❌ Failed: {self.results['overall']['failed']}")
        
        total = self.results['overall']['passed'] + self.results['overall']['failed']
        success_rate = (self.results['overall']['passed'] / total * 100) if total > 0 else 0
        print(f"Success Rate: {success_rate:.1f}%")
        
        if success_rate >= 80:
            print("\n🎉 PHASE 2 VERIFICATION PASSED")
            print("Proceed to Phase 3")
            return True
        else:
            print("\n⚠️ PHASE 2 VERIFICATION FAILED")
            print("Fix failing tests before proceeding")
            return False

if __name__ == "__main__":
    verifier = Phase2Verifier()
    success = verifier.run_all_tests()
    exit(0 if success else 1)
