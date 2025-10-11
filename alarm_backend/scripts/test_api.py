import requests
import json

try:
    print("Testing API endpoint...")
    r = requests.get('http://localhost:8080/pvcI-health/isa-flood-summary-enhanced', params={'lite': 'true'})
    
    print(f"Status: {r.status_code}")
    print(f"Content-Type: {r.headers.get('content-type')}")
    print(f"Response length: {len(r.text)} chars")
    
    if r.status_code == 200:
        data = r.json()
        print(f"\n✅ Response received!")
        print(f"Top-level keys: {list(data.keys())}")
        print(f"\nHas event_statistics: {'event_statistics' in data}")
        
        if 'event_statistics' in data:
            estats = data['event_statistics']
            print(f"\n📊 Event Statistics Summary:")
            summary = estats.get('summary', {})
            print(f"   Total records: {summary.get('total_records', 'N/A'):,}")
            print(f"   Actual alarms: {summary.get('actual_alarms', 'N/A'):,} ({summary.get('actual_alarms_pct', 0):.1f}%)")
            print(f"   Events: {summary.get('events', 'N/A'):,} ({summary.get('events_pct', 0):.1f}%)")
        else:
            print("\n❌ event_statistics NOT in response!")
            print("Available keys:", list(data.keys()))
    else:
        print(f"\n❌ Error: Status {r.status_code}")
        print(r.text[:500])
        
except requests.exceptions.ConnectionError:
    print("❌ Backend not running on port 8080")
except Exception as e:
    print(f"❌ Error: {e}")
