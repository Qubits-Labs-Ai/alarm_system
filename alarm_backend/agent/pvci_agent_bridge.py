"""
Import bridge for PVCI-agent module (bypasses hyphen in folder name).
Provides: run_glm_agent, AVAILABLE_TOOLS, load_data
"""
import os
import sys
import importlib.util
from typing import Any, Callable, List

# Get the path to PVCI-agent directory
BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
PVCI_AGENT_DIR = os.path.join(BACKEND_DIR, "PVCI-agent")

# CRITICAL: Add PVCI-agent to sys.path so internal imports work
# This allows data_tools.py to import alarm_logic directly
if PVCI_AGENT_DIR not in sys.path:
    sys.path.insert(0, PVCI_AGENT_DIR)

def _load_module_from_path(module_name: str, file_path: str):
    """Load a Python module from an absolute file path."""
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module {module_name} from {file_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

# Load alarm_logic module FIRST (dependency of data_tools)
alarm_logic_path = os.path.join(PVCI_AGENT_DIR, "alarm_logic.py")
alarm_logic = _load_module_from_path("alarm_logic", alarm_logic_path)

# Load data_tools module (now alarm_logic is available)
data_tools_path = os.path.join(PVCI_AGENT_DIR, "data_tools.py")
data_tools = _load_module_from_path("data_tools", data_tools_path)

# Load glm_agent module
glm_agent_path = os.path.join(PVCI_AGENT_DIR, "glm_agent.py")
glm_agent = _load_module_from_path("glm_agent", glm_agent_path)

# Export the key functions and constants
run_glm_agent = glm_agent.run_glm_agent
AVAILABLE_TOOLS: List[Callable] = data_tools.AVAILABLE_TOOLS
load_data = data_tools.load_data
DB_FILE = data_tools.DB_FILE

__all__ = ["run_glm_agent", "AVAILABLE_TOOLS", "load_data", "DB_FILE"]
