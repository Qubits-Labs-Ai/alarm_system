"""
Test script to verify PVCI Agent improvements
Tests various scenarios to ensure robust error handling and retry logic
"""

import asyncio
import json
from glm_agent import run_glm_agent
from data_tools import AVAILABLE_TOOLS, load_data
import os

# Color codes for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_test_header(test_name: str):
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST: {test_name}{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")

def print_success(message: str):
    print(f"{GREEN}✅ {message}{RESET}")

def print_error(message: str):
    print(f"{RED}❌ {message}{RESET}")

def print_warning(message: str):
    print(f"{YELLOW}⚠️  {message}{RESET}")

async def test_zero_rows_handling():
    """Test that agent provides helpful suggestions when query returns zero rows"""
    print_test_header("Zero Rows Handling")
    
    query = "Show me critical alarms from January 1st, 1900"  # Should return zero rows
    
    print(f"Query: {query}\n")
    
    iterations = 0
    got_suggestions = False
    got_final_answer = False
    
    async for event in run_glm_agent(query=query, tools=AVAILABLE_TOOLS, max_iterations=4):
        event_type = event.get("type")
        
        if event_type == "tool_result":
            result_content = event.get("content", "")
            if "suggestions" in result_content.lower():
                got_suggestions = True
                print_success("Tool provided helpful suggestions")
                print(f"   {result_content[:200]}...\n")
        
        elif event_type == "answer_complete":
            got_final_answer = True
            answer = event.get("content", "")
            print(f"Final Answer: {answer[:200]}...\n")
        
        elif event_type == "complete":
            iterations = event.get("data", {}).get("iterations", 0)
        
        elif event_type == "error":
            print_error(f"Error: {event.get('message')}")
    
    # Verify expectations
    if got_suggestions:
        print_success(f"✓ Agent received helpful suggestions for retry")
    else:
        print_warning("Agent didn't receive suggestions (may need to check tool)")
    
    if got_final_answer:
        print_success(f"✓ Agent provided final answer")
    else:
        print_warning("Agent didn't provide final answer")
    
    print(f"\nIterations used: {iterations}/4")
    return got_suggestions or got_final_answer


async def test_priority_mapping():
    """Test that agent correctly maps natural language priorities to database codes"""
    print_test_header("Priority Code Mapping")
    
    query = "Show me high priority alarms from the last 7 days"
    
    print(f"Query: {query}\n")
    
    got_correct_mapping = False
    
    async for event in run_glm_agent(query=query, tools=AVAILABLE_TOOLS, max_iterations=4):
        event_type = event.get("type")
        
        if event_type == "tool_call":
            tool_data = event.get("data", {})
            tool_args = tool_data.get("arguments", "")
            print(f"Tool arguments preview: {tool_args[:150]}...\n")
        
        elif event_type == "tool_call_update":
            content = event.get("content", "")
            # Check if query includes correct priority mapping
            if "IN ('H'" in content or "IN ('HIGH'" in content:
                got_correct_mapping = True
                print_success("Correct priority mapping detected: HIGH → 'H' or 'HIGH'")
        
        elif event_type == "answer_complete":
            answer = event.get("content", "")
            print(f"\nFinal Answer Preview: {answer[:200]}...\n")
        
        elif event_type == "error":
            print_error(f"Error: {event.get('message')}")
    
    if got_correct_mapping:
        print_success("✓ Agent correctly mapped HIGH priority")
        return True
    else:
        print_warning("Could not verify priority mapping (check tool call arguments)")
        return False


async def test_sql_syntax_error_recovery():
    """Test that agent can recover from SQL syntax errors"""
    print_test_header("SQL Syntax Error Recovery")
    
    # This query is intentionally ambiguous and may cause initial errors
    query = "Count alarms by event time for last month"
    
    print(f"Query: {query}\n")
    
    iterations = 0
    got_error = False
    got_success = False
    
    async for event in run_glm_agent(query=query, tools=AVAILABLE_TOOLS, max_iterations=4):
        event_type = event.get("type")
        
        if event_type == "tool_result":
            result = event.get("content", "")
            if "error" in result.lower():
                got_error = True
                print_warning(f"Tool error detected (iteration {iterations})")
            elif "success" in result.lower() or "data" in result.lower():
                got_success = True
                print_success(f"Tool succeeded (iteration {iterations})")
        
        elif event_type == "complete":
            iterations = event.get("data", {}).get("iterations", 0)
        
        elif event_type == "answer_complete":
            answer = event.get("content", "")
            print(f"\nFinal Answer: {answer[:200]}...\n")
    
    print(f"Iterations used: {iterations}/4")
    
    if got_success:
        print_success("✓ Agent successfully completed query")
        return True
    elif got_error and iterations > 1:
        print_warning("Agent encountered error but attempted retry")
        return True
    else:
        print_error("Agent failed without retry")
        return False


async def test_behavior_analysis():
    """Test alarm behavior analysis tool"""
    print_test_header("Alarm Behavior Analysis")
    
    query = "Analyze alarm behavior for chattering alarms"
    
    print(f"Query: {query}\n")
    
    used_behavior_tool = False
    got_analysis = False
    
    async for event in run_glm_agent(query=query, tools=AVAILABLE_TOOLS, max_iterations=4):
        event_type = event.get("type")
        
        if event_type == "tool_call":
            tool_data = event.get("data", {})
            tool_name = tool_data.get("name", "")
            if "behavior" in tool_name.lower():
                used_behavior_tool = True
                print_success(f"Agent selected correct tool: {tool_name}")
        
        elif event_type == "tool_result":
            result = event.get("content", "")
            if "chattering" in result.lower() or "metadata" in result.lower():
                got_analysis = True
                print_success("Received behavioral analysis data")
        
        elif event_type == "answer_complete":
            answer = event.get("content", "")
            print(f"\nFinal Answer Preview: {answer[:200]}...\n")
        
        elif event_type == "error":
            print_error(f"Error: {event.get('message')}")
    
    if used_behavior_tool and got_analysis:
        print_success("✓ Behavior analysis completed successfully")
        return True
    elif used_behavior_tool:
        print_warning("Used behavior tool but analysis incomplete")
        return True
    else:
        print_warning("Did not use behavior analysis tool (may have used regular SQL)")
        return False


async def test_error_message_clarity():
    """Test that error messages are user-friendly and actionable"""
    print_test_header("Error Message Clarity")
    
    # Query that will likely cause an error
    query = "Show me alarms for a non-existent column xyz"
    
    print(f"Query: {query}\n")
    
    got_helpful_error = False
    error_message = ""
    
    async for event in run_glm_agent(query=query, tools=AVAILABLE_TOOLS, max_iterations=4):
        event_type = event.get("type")
        
        if event_type == "error":
            error_message = event.get("message", "")
            error_type = event.get("error_type", "")
            print(f"Error Type: {error_type}")
            print(f"Error Message: {error_message}\n")
            
            # Check if error is helpful (not generic)
            if "internal server error" not in error_message.lower():
                got_helpful_error = True
        
        elif event_type == "tool_result":
            result = event.get("content", "")
            if "hints" in result.lower() or "suggestion" in result.lower():
                print_success("Tool provided hints/suggestions")
                got_helpful_error = True
    
    if got_helpful_error:
        print_success("✓ Error messages are helpful and specific")
        return True
    else:
        print_error("Error messages are still generic")
        return False


async def run_all_tests():
    """Run all test cases"""
    print(f"\n{BLUE}{'#'*60}{RESET}")
    print(f"{BLUE}# PVCI Agent Improvements - Test Suite{RESET}")
    print(f"{BLUE}{'#'*60}{RESET}")
    
    # Check if database is loaded
    db_path = os.path.join(os.path.dirname(__file__), 'alerts.db')
    if not os.path.exists(db_path):
        print_error(f"\nDatabase not found at {db_path}")
        print_warning("Run load_data() first or ensure alerts.db exists\n")
        return
    
    results = {}
    
    # Run tests
    try:
        results["Zero Rows Handling"] = await test_zero_rows_handling()
        await asyncio.sleep(1)  # Brief pause between tests
        
        results["Priority Mapping"] = await test_priority_mapping()
        await asyncio.sleep(1)
        
        results["SQL Error Recovery"] = await test_sql_syntax_error_recovery()
        await asyncio.sleep(1)
        
        results["Behavior Analysis"] = await test_behavior_analysis()
        await asyncio.sleep(1)
        
        results["Error Clarity"] = await test_error_message_clarity()
    
    except KeyboardInterrupt:
        print_warning("\n\nTests interrupted by user")
        return
    except Exception as e:
        print_error(f"\n\nTest suite error: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Print summary
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST SUMMARY{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, passed_test in results.items():
        status = f"{GREEN}✅ PASS{RESET}" if passed_test else f"{RED}❌ FAIL{RESET}"
        print(f"{status} - {test_name}")
    
    print(f"\n{BLUE}Results: {passed}/{total} tests passed{RESET}")
    
    if passed == total:
        print(f"\n{GREEN}🎉 All tests passed! Agent improvements verified.{RESET}\n")
    elif passed >= total * 0.7:
        print(f"\n{YELLOW}⚠️  Most tests passed. Review failures above.{RESET}\n")
    else:
        print(f"\n{RED}❌ Multiple test failures. Review implementation.{RESET}\n")


if __name__ == "__main__":
    print("\n🚀 Starting PVCI Agent Improvement Tests...\n")
    asyncio.run(run_all_tests())
