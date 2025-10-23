"""
Plant Registry - Central Configuration for Multi-Plant Alarm System

This module defines all available plants and their data sources for the actual-calc mode.
When a new plant JSON is generated, add its entry here to make it available in the system.
"""

import os
from typing import Dict, List, Any, Optional
from pathlib import Path

# ============================================================================
# PLANT DEFINITIONS
# ============================================================================

PLANTS: Dict[str, Dict[str, Any]] = {
    "PVCI": {
        "id": "PVCI",
        "name": "PVC-I Plant",
        "display_name": "PVC-I",
        "description": "PVC-I Manufacturing Plant - Merged Data",
        "json_filename": "All_Merged-actual-calc.json",
        "csv_relative_path": "PVCI-merged",
        "csv_filename": "All_Merged.csv",
        "active": True,
    },
    "VCMA": {
        "id": "VCMA",
        "name": "VCM-A Plant",
        "display_name": "VCM-A",
        "description": "Vinyl Chloride Monomer - Plant A",
        "json_filename": "VCMA-actual-calc.json",
        "csv_relative_path": "VCMA",
        "csv_filename": "VCMA.csv",
        "active": True,
    },
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_all_plants() -> List[Dict[str, Any]]:
    """
    Get list of all active plants.
    
    Returns:
        List of plant info dicts with keys: id, name, display_name, description
    """
    return [
        {
            "id": p["id"],
            "name": p["name"],
            "display_name": p["display_name"],
            "description": p["description"],
            "active": p.get("active", True),
        }
        for p in PLANTS.values()
        if p.get("active", True)
    ]


def get_plant_info(plant_id: str) -> Optional[Dict[str, Any]]:
    """
    Get information for a specific plant by ID.
    
    Args:
        plant_id: Plant identifier (e.g., "PVCI", "VCMA")
        
    Returns:
        Plant info dict or None if not found
    """
    return PLANTS.get(plant_id.upper())


def get_plant_json_path(plant_id: str, base_dir: str) -> Optional[str]:
    """
    Get full path to plant's actual-calc JSON file.
    
    Args:
        plant_id: Plant identifier
        base_dir: Base directory of alarm_backend
        
    Returns:
        Full path to JSON file or None if plant not found
    """
    plant = get_plant_info(plant_id)
    if not plant:
        return None
    
    json_path = os.path.join(
        base_dir,
        "PVCI-actual-calc",
        plant["json_filename"]
    )
    return json_path


def get_plant_csv_info(plant_id: str) -> Optional[Dict[str, str]]:
    """
    Get CSV location info for a plant.
    
    Args:
        plant_id: Plant identifier
        
    Returns:
        Dict with keys: csv_relative_path, csv_filename or None if not found
    """
    plant = get_plant_info(plant_id)
    if not plant:
        return None
    
    return {
        "csv_relative_path": plant["csv_relative_path"],
        "csv_filename": plant["csv_filename"],
    }


def validate_plant_id(plant_id: str) -> bool:
    """
    Check if a plant ID is valid and active.
    
    Args:
        plant_id: Plant identifier to validate
        
    Returns:
        True if valid and active, False otherwise
    """
    plant = get_plant_info(plant_id)
    return plant is not None and plant.get("active", True)


def get_default_plant_id() -> str:
    """
    Get the default plant ID (first active plant).
    
    Returns:
        Default plant ID
    """
    active_plants = get_all_plants()
    if active_plants:
        return active_plants[0]["id"]
    return "PVCI"  # Fallback


# ============================================================================
# AUTO-DISCOVERY (Optional - for future enhancement)
# ============================================================================

def discover_plants(base_dir: str) -> List[str]:
    """
    Auto-discover plant JSON files in PVCI-actual-calc directory.
    Looks for files matching pattern: *-actual-calc.json
    
    Args:
        base_dir: Base directory of alarm_backend
        
    Returns:
        List of discovered plant IDs
    """
    actual_calc_dir = os.path.join(base_dir, "PVCI-actual-calc")
    if not os.path.exists(actual_calc_dir):
        return []
    
    discovered = []
    for filename in os.listdir(actual_calc_dir):
        if filename.endswith("-actual-calc.json") and filename != "actual-calc.json":
            # Extract plant ID from filename (e.g., "VCMA-actual-calc.json" -> "VCMA")
            plant_id = filename.replace("-actual-calc.json", "").upper()
            discovered.append(plant_id)
    
    return discovered


# ============================================================================
# USAGE EXAMPLES
# ============================================================================

if __name__ == "__main__":
    # Example usage
    print("=" * 60)
    print("PLANT REGISTRY - Available Plants")
    print("=" * 60)
    
    all_plants = get_all_plants()
    for plant in all_plants:
        print(f"\n📍 {plant['display_name']}")
        print(f"   ID: {plant['id']}")
        print(f"   Name: {plant['name']}")
        print(f"   Description: {plant['description']}")
    
    print("\n" + "=" * 60)
    print("Default Plant:", get_default_plant_id())
    print("=" * 60)
