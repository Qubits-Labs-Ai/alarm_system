import os
import pandas as pd

# 📁 PVC-II folder path
folder_path = r"C:\Users\New\PyCharmMiscProject\PVC-II"

# 🧠 Unhealthy conditions list
UNHEALTHY_CONDITIONS = ["BAD PV", "OFFNRM", "DISABL"]

def load_csv_with_header(file_path):
    """Detect header row dynamically (where 'Event Time' column starts)."""
    with open(file_path, 'r', encoding='ISO-8859-1') as f:
        lines = f.readlines()

    header_index = None
    for i, line in enumerate(lines):
        if "Event Time" in line and "Source" in line and "Condition" in line:
            header_index = i
            break

    if header_index is None:
        print(f"⚠️ Header row not found in {os.path.basename(file_path)}")
        return None

    df = pd.read_csv(file_path, skiprows=header_index, encoding='ISO-8859-1')
    df["Source_File"] = os.path.basename(file_path)
    return df

# 🔸 Step 1: Load all CSV files
all_data = []
csv_files = [f for f in os.listdir(folder_path) if f.endswith(".csv")]
print(f"📂 Found {len(csv_files)} CSV files in folder.")

for file in csv_files:
    file_path = os.path.join(folder_path, file)
    df = load_csv_with_header(file_path)
    if df is None:
        continue

    if "Event Time" not in df.columns:
        print(f"⚠️ Skipping {file}, 'Event Time' column missing.")
        continue

    df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
    all_data.append(df)

if not all_data:
    print("❌ No valid CSV files loaded.")
    exit()

data = pd.concat(all_data, ignore_index=True)
print(f"✅ Loaded {len(data)} rows from {len(all_data)} files.")

# 🔸 Step 2: Filter only unhealthy rows
unhealthy = data[data["Condition"].isin(UNHEALTHY_CONDITIONS)].copy()
unhealthy = unhealthy.dropna(subset=["Event Time"])
print(f"⚠️ Unhealthy rows found: {len(unhealthy)}")

# 🔸 Step 3: Create 10-minute interval column
unhealthy["Interval_Start"] = unhealthy["Event Time"].dt.floor("10min")

# 🔸 Step 4: Group to find only those intervals with 10+ hits
grouped = (
    unhealthy
    .groupby(["Interval_Start", "Source", "Condition", "Description", "Source_File"])
    .size()
    .reset_index(name="Hits_in_10min")
)

# 🔸 Step 5: Keep only intervals with 10+ hits
hot_intervals = grouped[grouped["Hits_in_10min"] >= 10]

# 🔸 Step 6: Filter original unhealthy data to keep only those intervals
filtered = pd.merge(
    unhealthy,
    hot_intervals,
    how="inner",
    on=["Interval_Start", "Source", "Condition", "Description", "Source_File"]
)

# 🔸 Step 7: Remove duplicates if any
filtered = filtered.drop_duplicates()

# 🔸 Step 8: Fill NaNs → numeric with 0, others with ""
num_cols = filtered.select_dtypes(include=["number"]).columns
filtered[num_cols] = filtered[num_cols].fillna(0)
filtered = filtered.fillna("")

# 🔸 Step 9: Save final report
output_file = os.path.join(folder_path, "PVCII_Unhealthy_10min_OnlyHits.csv")
filtered.to_csv(output_file, index=False)

print(f"\n✅ Final 10-min Interval Unhealthy Hits Report saved at:\n{output_file}")
print("\n📊 Sample Output:")
print(filtered.head(15))
