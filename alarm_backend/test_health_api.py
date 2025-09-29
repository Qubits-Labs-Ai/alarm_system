#!/usr/bin/env python3
"""Test the updated PVC-II health API"""

import requests
import json

def test_pvcII_health_api():
    """Test the updated API"""
    try:
        response = requests.get('http://localhost:8000/pvcII-health/overall')
        if response.status_code == 200:
            data = response.json()
            overall = data['overall']
            print('PVC-II Health Statistics:')
            print(f'   Health (Simple): {overall["health_pct_simple"]}%')
            print(f'   Health (Weighted): {overall["health_pct_weighted"]}%')
            print(f'   Unhealthy: {overall["unhealthy_percentage"]}%')
            print(f'   Total Sources: {overall["totals"]["sources"]}')
            print(f'   Healthy Sources: {overall["totals"]["healthy_sources"]}')
            print(f'   Unhealthy Sources: {overall["totals"]["unhealthy_sources"]}')
            print(f'   Files: {overall["totals"]["files"]}')
            
            print('\nUnhealthy Sources by Bins:')
            for bin_range, sources in overall["unhealthy_sources_by_bins"].items():
                print(f'   {bin_range}: {len(sources)} sources')
                
        else:
            print(f'API Error: {response.status_code}')
            print(response.text)
    except Exception as e:
        print(f'Connection Error: {e}')
        print('Make sure the backend server is running on port 8000')

if __name__ == "__main__":
    test_pvcII_health_api()
