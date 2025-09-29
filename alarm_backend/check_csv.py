import pandas as pd
import os

csv_file = os.path.join('PVCII-overall-health', 'PVCII_Unhealthy_10min_OnlyHits.csv')
df = pd.read_csv(csv_file)
print(f'CSV Records: {len(df)}')
print(f'Unique Sources in CSV: {df["Source"].nunique()}')
print('CSV Sources:', sorted(df['Source'].unique()))
