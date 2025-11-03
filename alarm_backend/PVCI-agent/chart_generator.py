"""
Chart data generation for PVCI Agent inline charts.
Converts SQL results and tool outputs into Recharts-compatible JSON format.
"""

from typing import Dict, Any, List, Optional
import re


def generate_chart_data(
    chart_type: str,
    data: List[Dict[str, Any]],
    query: str = "",
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generate chart configuration from data.
    
    Args:
        chart_type: "line" | "bar" | "pie" | "scatter" | "area"
        data: List of records from SQL/tool result
        query: Original user query (for title extraction)
        metadata: Optional metadata (title, colors, etc.)
    
    Returns:
        {
            "type": chart_type,
            "data": [...],  # Recharts format
            "config": {
                "xKey": str,
                "yKeys": List[str],
                "title": str,
                "xLabel": str,
                "yLabel": str,
                "colors": List[str],
                "tooltip": bool,
                "legend": bool,
                "height": int,
                ...
            }
        }
    """
    metadata = metadata or {}
    
    if not data or len(data) < 2:
        # Need at least 2 data points for a meaningful chart
        return None
    
    if chart_type == "line":
        return generate_line_chart(data, query, metadata)
    elif chart_type == "bar":
        return generate_bar_chart(data, query, metadata)
    elif chart_type == "pie":
        return generate_pie_chart(data, query, metadata)
    elif chart_type == "scatter":
        return generate_scatter_chart(data, query, metadata)
    elif chart_type == "area":
        return generate_area_chart(data, query, metadata)
    else:
        # Default to bar chart
        return generate_bar_chart(data, query, metadata)


def generate_line_chart(data: List[Dict], query: str, metadata: Dict) -> Dict:
    """Generate line chart configuration for time series data."""
    
    keys = list(data[0].keys()) if data else []
    
    # Auto-detect time/date key
    time_key = next(
        (k for k in keys if any(t in k.lower() for t in ["time", "date", "timestamp", "bin", "window", "period"])),
        keys[0] if keys else "x"
    )
    
    # Auto-detect numeric value keys (exclude the time key)
    value_keys = [
        k for k in keys 
        if k != time_key and isinstance(data[0].get(k), (int, float))
    ]
    
    # If no numeric keys found, use all non-time keys
    if not value_keys:
        value_keys = [k for k in keys if k != time_key]
    
    # Format data for Recharts
    chart_data = []
    for row in data:
        point = {time_key: str(row[time_key])}
        for vk in value_keys:
            point[vk] = row[vk]
        chart_data.append(point)
    
    # Generate title
    title = metadata.get("title") or extract_title_from_query(query, "Trend Over Time")
    
    return {
        "type": "line",
        "data": chart_data,
        "config": {
            "xKey": time_key,
            "yKeys": value_keys,
            "title": title,
            "xLabel": format_label(time_key),
            "yLabel": format_label(value_keys[0]) if value_keys else "Value",
            "colors": metadata.get("colors") or [
                "hsl(var(--chart-1))", 
                "hsl(var(--chart-2))", 
                "hsl(var(--chart-3))"
            ],
            "tooltip": True,
            "legend": len(value_keys) > 1,
            "height": 300,
            "responsive": True
        }
    }


def generate_bar_chart(data: List[Dict], query: str, metadata: Dict) -> Dict:
    """Generate bar chart configuration for rankings/comparisons."""
    
    keys = list(data[0].keys()) if data else []
    
    # Auto-detect label key (typically source, location, name, etc.)
    label_key = next(
        (k for k in keys if any(t in k.lower() for t in ["source", "location", "name", "label", "tag", "priority"])),
        keys[0] if keys else "label"
    )
    
    # Auto-detect numeric value keys
    value_keys = [
        k for k in keys 
        if k != label_key and isinstance(data[0].get(k), (int, float))
    ]
    
    # If no numeric keys, use all non-label keys
    if not value_keys:
        value_keys = [k for k in keys if k != label_key]
    
    # Sort by first value key (descending) for better visualization
    if value_keys and value_keys[0] in data[0]:
        try:
            data_sorted = sorted(data, key=lambda x: x.get(value_keys[0], 0), reverse=True)
        except (TypeError, KeyError):
            data_sorted = data
    else:
        data_sorted = data
    
    # Limit to top 20 for readability
    chart_data = data_sorted[:20]
    
    # Generate title
    title = metadata.get("title") or extract_title_from_query(query, "Comparison")
    
    # Use vertical layout if many items
    layout = "vertical" if len(chart_data) > 10 else "horizontal"
    
    return {
        "type": "bar",
        "data": chart_data,
        "config": {
            "xKey": label_key,
            "yKeys": value_keys,
            "title": title,
            "xLabel": format_label(label_key),
            "yLabel": format_label(value_keys[0]) if value_keys else "Count",
            "colors": metadata.get("colors") or [
                "hsl(var(--chart-1))", 
                "hsl(var(--chart-2))"
            ],
            "tooltip": True,
            "legend": len(value_keys) > 1,
            "height": 350,
            "layout": layout,
            "responsive": True
        }
    }


def generate_pie_chart(data: List[Dict], query: str, metadata: Dict) -> Dict:
    """Generate pie chart configuration for distributions."""
    
    keys = list(data[0].keys()) if data else []
    
    # Auto-detect name/label key
    label_key = next(
        (k for k in keys if any(t in k.lower() for t in ["name", "label", "priority", "condition", "category", "type"])),
        keys[0] if keys else "name"
    )
    
    # Auto-detect numeric value key
    value_key = next(
        (k for k in keys if k != label_key and isinstance(data[0].get(k), (int, float))),
        keys[1] if len(keys) > 1 else "value"
    )
    
    # Transform to name/value format expected by Recharts Pie
    chart_data = [
        {
            "name": str(row.get(label_key, "Unknown")),
            "value": row.get(value_key, 0)
        }
        for row in data
    ]
    
    # Limit to top 10 slices + "Others" for readability
    if len(chart_data) > 10:
        top_10 = chart_data[:10]
        others_sum = sum(item["value"] for item in chart_data[10:])
        if others_sum > 0:
            chart_data = top_10 + [{"name": "Others", "value": others_sum}]
        else:
            chart_data = top_10
    
    # Generate title
    title = metadata.get("title") or extract_title_from_query(query, "Distribution")
    
    return {
        "type": "pie",
        "data": chart_data,
        "config": {
            "nameKey": "name",
            "valueKey": "value",
            "title": title,
            "colors": metadata.get("colors") or [
                "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
                "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-accent))"
            ],
            "tooltip": True,
            "legend": True,
            "height": 350,
            "responsive": True
        }
    }


def generate_scatter_chart(data: List[Dict], query: str, metadata: Dict) -> Dict:
    """Generate scatter chart configuration for correlation analysis."""
    
    keys = list(data[0].keys()) if data else []
    
    # Find numeric keys for X and Y axes
    numeric_keys = [k for k in keys if isinstance(data[0].get(k), (int, float))]
    
    if len(numeric_keys) < 2:
        # Fall back to bar chart if not enough numeric data
        return generate_bar_chart(data, query, metadata)
    
    x_key = numeric_keys[0]
    y_key = numeric_keys[1]
    
    # Use first non-numeric key as name/label if available
    name_key = next((k for k in keys if k not in numeric_keys), None)
    
    # Format data
    chart_data = []
    for row in data:
        point = {
            "x": row.get(x_key, 0),
            "y": row.get(y_key, 0)
        }
        if name_key:
            point["name"] = str(row.get(name_key, ""))
        chart_data.append(point)
    
    title = metadata.get("title") or extract_title_from_query(query, "Correlation")
    
    return {
        "type": "scatter",
        "data": chart_data,
        "config": {
            "xKey": "x",
            "yKey": "y",
            "nameKey": "name" if name_key else None,
            "title": title,
            "xLabel": format_label(x_key),
            "yLabel": format_label(y_key),
            "colors": metadata.get("colors") or ["hsl(var(--chart-1))"],
            "tooltip": True,
            "legend": False,
            "height": 350,
            "responsive": True
        }
    }


def generate_area_chart(data: List[Dict], query: str, metadata: Dict) -> Dict:
    """Generate area chart configuration (stacked areas for cumulative trends)."""
    
    # Area charts are similar to line charts but with filled areas
    line_config = generate_line_chart(data, query, metadata)
    line_config["type"] = "area"
    
    return line_config


def extract_title_from_query(query: str, default: str = "Chart") -> str:
    """Extract meaningful title from user query."""
    
    # Remove common stop words
    stop_words = {
        "show", "me", "the", "a", "an", "what", "which", "how", "many", 
        "create", "make", "generate", "plot", "chart", "graph", "of"
    }
    
    words = [w for w in query.lower().split() if w not in stop_words]
    
    # Capitalize and join (max 5 words for brevity)
    if len(words) >= 2:
        title = " ".join(words[:5]).title()
        # Limit title length
        if len(title) > 50:
            title = title[:47] + "..."
        return title
    else:
        return default


def format_label(key: str) -> str:
    """Format database key into human-readable label."""
    
    # Replace underscores with spaces
    label = key.replace("_", " ")
    
    # Title case
    label = label.title()
    
    # Handle common abbreviations
    label = label.replace("Id", "ID")
    label = label.replace("Db", "DB")
    label = label.replace("Sql", "SQL")
    label = label.replace("Pvc", "PVC")
    
    return label


def detect_chart_type_from_data(data: List[Dict]) -> Optional[str]:
    """
    Auto-detect appropriate chart type based on data structure.
    Used when user doesn't specify chart type explicitly.
    """
    
    if not data or len(data) < 2:
        return None
    
    keys = list(data[0].keys())
    
    # Check for time series data
    has_time = any(
        any(t in k.lower() for t in ["time", "date", "timestamp", "bin", "window", "period"])
        for k in keys
    )
    
    if has_time:
        return "line"
    
    # Check for categorical data with counts
    has_category = any(
        any(t in k.lower() for t in ["source", "location", "name", "priority", "condition"])
        for k in keys
    )
    
    has_count = any(
        any(t in k.lower() for t in ["count", "total", "sum", "hits", "alarms"])
        for k in keys
    )
    
    if has_category and has_count:
        # Determine if bar or pie is more appropriate
        if len(data) <= 10:
            return "pie"  # Smaller datasets work well as pie
        else:
            return "bar"  # Larger datasets better as bar
    
    # Check for multiple numeric columns (potential correlation)
    numeric_keys = [k for k in keys if isinstance(data[0].get(k), (int, float))]
    
    if len(numeric_keys) >= 2:
        return "scatter"
    
    # Default to bar chart
    return "bar"
