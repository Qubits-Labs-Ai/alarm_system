import pandas as pd

# Read first few rows to see format
with open('ALARM_DATA_DIR/VCMA/VCMA.csv', 'r') as f:
    for i in range(15):
        print(f"{i:2d}: {f.readline().strip()}")

print("\n" + "="*60)
print("Checking Event Time formats after skipping metadata:")
print("="*60)

df = pd.read_csv('ALARM_DATA_DIR/VCMA/VCMA.csv', skiprows=8, nrows=50)
print("\nFirst 20 Event Time values:")
for idx, val in enumerate(df['Event Time'].head(20)):
    print(f"  {idx:2d}: '{val}'")
