import json

data = json.load(open('D:/Qbit-dynamics/alarm_system/alarm_backend/PVCI-overall-health/isa18-flood-summary-CORRECTED-ENHANCED.json'))
estats = data['event_statistics']

print('\n=== EVENT STATISTICS ===\n')
print('SUMMARY:')
print(f'Total records: {estats["summary"]["total_records"]:,}')
print(f'Actual alarms: {estats["summary"]["actual_alarms"]:,} ({estats["summary"]["actual_alarms_pct"]:.1f}%)')
print(f'Events: {estats["summary"]["events"]:,} ({estats["summary"]["events_pct"]:.1f}%)')

print('\nTOP 5 ACTIONS:')
for act, cnt in estats['by_action']['summary']['top_actions'][:5]:
    print(f'  {act:20s}: {cnt:>10,}')

print('\nTOP 5 CONDITIONS:')
conds = list(estats['by_condition']['all_conditions'].items())[:5]
for k, v in conds:
    print(f'  {k:20s}: {cnt:>10,}')

print('\nOPERATOR ACTIONS BREAKDOWN:')
op_actions = estats['by_action']['operator_actions']
print(f'  Acknowledgements: {op_actions["acknowledgements"]["count"]:,}')
print(f'  Resets/OK:        {op_actions["resets"]["count"]:,}')
print(f'  Shelve/Suppress:  {op_actions["shelve_suppress"]["count"]:,}')
print(f'  Other:            {op_actions["other"]["count"]:,}')

print('\nCONDITIONS BREAKDOWN:')
cond_breakdown = estats['by_condition']['breakdown']
print(f'  Alarm conditions: {cond_breakdown["alarm_conditions"]["count"]:,}')
print(f'  State changes:    {cond_breakdown["state_changes"]["count"]:,}')
print(f'  Quality issues:   {cond_breakdown["quality_issues"]["count"]:,}')
print(f'  Other:            {cond_breakdown["other"]["count"]:,}')
