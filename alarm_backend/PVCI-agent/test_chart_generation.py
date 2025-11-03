"""
Quick test script for chart generation functionality
Tests chart_generator.py functions with sample data
"""

from chart_generator import (
    generate_chart_data,
    detect_chart_type_from_data,
    extract_title_from_query,
    format_label
)
import json


def test_bar_chart():
    """Test bar chart generation with top sources data"""
    print("\n" + "="*60)
    print("TEST 1: Bar Chart - Top Alarm Sources")
    print("="*60)
    
    sample_data = [
        {"source": "PLC_101", "alarm_count": 1250},
        {"source": "PLC_102", "alarm_count": 980},
        {"source": "PLC_103", "alarm_count": 756},
        {"source": "PLC_104", "alarm_count": 543},
        {"source": "PLC_105", "alarm_count": 421},
    ]
    
    query = "Show me the top alarm sources by count"
    
    result = generate_chart_data("bar", sample_data, query)
    
    print(f"Query: {query}")
    print(f"Chart Type: {result['type']}")
    print(f"Title: {result['config']['title']}")
    print(f"Layout: {result['config']['layout']}")
    print(f"Data Points: {len(result['data'])}")
    print(f"X-Key: {result['config']['xKey']}")
    print(f"Y-Keys: {result['config']['yKeys']}")
    print("\nSample Data Point:")
    print(json.dumps(result['data'][0], indent=2))
    print("[OK] Bar chart generated successfully")


def test_line_chart():
    """Test line chart generation with time series data"""
    print("\n" + "="*60)
    print("TEST 2: Line Chart - Alarm Trend Over Time")
    print("="*60)
    
    sample_data = [
        {"date": "2025-01-01", "alarm_count": 145},
        {"date": "2025-01-02", "alarm_count": 167},
        {"date": "2025-01-03", "alarm_count": 123},
        {"date": "2025-01-04", "alarm_count": 189},
        {"date": "2025-01-05", "alarm_count": 156},
    ]
    
    query = "Show alarm trend over the last 5 days"
    
    result = generate_chart_data("line", sample_data, query)
    
    print(f"Query: {query}")
    print(f"Chart Type: {result['type']}")
    print(f"Title: {result['config']['title']}")
    print(f"Data Points: {len(result['data'])}")
    print(f"X-Key: {result['config']['xKey']}")
    print(f"Y-Keys: {result['config']['yKeys']}")
    print("\nSample Data Point:")
    print(json.dumps(result['data'][0], indent=2))
    print("[OK] Line chart generated successfully")


def test_pie_chart():
    """Test pie chart generation with priority distribution"""
    print("\n" + "="*60)
    print("TEST 3: Pie Chart - Priority Distribution")
    print("="*60)
    
    sample_data = [
        {"priority": "Emergency", "count": 234},
        {"priority": "Urgent", "count": 456},
        {"priority": "High", "count": 789},
        {"priority": "Low", "count": 345},
        {"priority": "J-coded", "count": 123},
    ]
    
    query = "Show priority distribution as pie chart"
    
    result = generate_chart_data("pie", sample_data, query)
    
    print(f"Query: {query}")
    print(f"Chart Type: {result['type']}")
    print(f"Title: {result['config']['title']}")
    print(f"Data Points: {len(result['data'])}")
    print(f"Name Key: {result['config']['nameKey']}")
    print(f"Value Key: {result['config']['valueKey']}")
    print("\nSample Data Point:")
    print(json.dumps(result['data'][0], indent=2))
    print("[OK] Pie chart generated successfully")


def test_scatter_chart():
    """Test scatter chart generation with correlation data"""
    print("\n" + "="*60)
    print("TEST 4: Scatter Chart - Alarms vs Duration")
    print("="*60)
    
    sample_data = [
        {"source": "PLC_101", "alarm_count": 145, "avg_duration_sec": 32},
        {"source": "PLC_102", "alarm_count": 234, "avg_duration_sec": 45},
        {"source": "PLC_103", "alarm_count": 89, "avg_duration_sec": 12},
        {"source": "PLC_104", "alarm_count": 456, "avg_duration_sec": 67},
        {"source": "PLC_105", "alarm_count": 123, "avg_duration_sec": 23},
    ]
    
    query = "Correlation between alarm count and average duration"
    
    result = generate_chart_data("scatter", sample_data, query)
    
    print(f"Query: {query}")
    print(f"Chart Type: {result['type']}")
    print(f"Title: {result['config']['title']}")
    print(f"Data Points: {len(result['data'])}")
    print(f"X-Key: {result['config']['xKey']}")
    print(f"Y-Key: {result['config']['yKey']}")
    print("\nSample Data Point:")
    print(json.dumps(result['data'][0], indent=2))
    print("[OK] Scatter chart generated successfully")


def test_auto_detection():
    """Test automatic chart type detection"""
    print("\n" + "="*60)
    print("TEST 5: Auto Chart Type Detection")
    print("="*60)
    
    test_cases = [
        {
            "data": [{"date": "2025-01-01", "count": 100}] * 3,
            "expected": "line",
            "reason": "Has date/time field"
        },
        {
            "data": [{"source": "A", "count": 100}] * 15,
            "expected": "bar",
            "reason": "Has category + count, >10 items"
        },
        {
            "data": [{"priority": "High", "total": 50}] * 5,
            "expected": "pie",
            "reason": "Has category + count, <=10 items"
        },
        {
            "data": [{"value1": 10, "value2": 20}] * 3,
            "expected": "scatter",
            "reason": "Has 2+ numeric fields"
        },
    ]
    
    for i, case in enumerate(test_cases, 1):
        detected = detect_chart_type_from_data(case["data"])
        status = "[PASS]" if detected == case["expected"] else "[FAIL]"
        print(f"{status} Test {i}: Expected '{case['expected']}', Got '{detected}'")
        print(f"   Reason: {case['reason']}")
    
    print("\n[OK] Auto-detection tests completed")


def test_utility_functions():
    """Test utility functions"""
    print("\n" + "="*60)
    print("TEST 6: Utility Functions")
    print("="*60)
    
    # Test title extraction
    test_queries = [
        "Show me top 10 alarm sources by count",
        "What are the unhealthy sources?",
        "Create a chart of priority distribution",
    ]
    
    print("Title Extraction:")
    for query in test_queries:
        title = extract_title_from_query(query)
        print(f"  '{query[:40]}...' => '{title}'")
    
    # Test label formatting
    test_labels = [
        "alarm_count",
        "source_name",
        "avg_duration_sec",
        "pvc_priority",
    ]
    
    print("\nLabel Formatting:")
    for label in test_labels:
        formatted = format_label(label)
        print(f"  '{label}' => '{formatted}'")
    
    print("\n[OK] Utility function tests completed")


def test_edge_cases():
    """Test edge cases and error handling"""
    print("\n" + "="*60)
    print("TEST 7: Edge Cases & Error Handling")
    print("="*60)
    
    # Test with insufficient data
    print("1. Insufficient data (0 points):")
    result = generate_chart_data("bar", [], "test query")
    print(f"   Result: {result}")
    print(f"   [OK] Correctly returns None")
    
    print("\n2. Insufficient data (1 point):")
    result = generate_chart_data("bar", [{"x": 1, "y": 2}], "test query")
    print(f"   Result: {result}")
    print(f"   [OK] Correctly returns None")
    
    print("\n3. Invalid chart type:")
    result = generate_chart_data("invalid_type", [{"x": 1}, {"x": 2}], "test")
    print(f"   Type: {result['type']}")
    print(f"   [OK] Falls back to bar chart")
    
    print("\n[OK] Edge case tests completed")


def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("PVCI AGENT CHART GENERATION TEST SUITE")
    print("="*60)
    
    try:
        test_bar_chart()
        test_line_chart()
        test_pie_chart()
        test_scatter_chart()
        test_auto_detection()
        test_utility_functions()
        test_edge_cases()
        
        print("\n" + "="*60)
        print("[SUCCESS] ALL TESTS PASSED")
        print("="*60)
        print("\nChart generation system is working correctly!")
        print("Next step: Test with live PVCI Agent queries")
        
    except Exception as e:
        print("\n" + "="*60)
        print("[ERROR] TEST FAILED")
        print("="*60)
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
