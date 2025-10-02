import os
import re
import pandas as pd

#  Folder containing all CSV files
folder_path = r"C:\Users\New\PyCharmMiscProject\PVC-II"

# ⚠ Unhealthy conditions list
UNHEALTHY_CONDITIONS = ["BAD PV", "OFFNRM", "DISABL"]


def extract_report_date(file_path):
    """CSV file ke top 5 lines me se 'Date/Time of Report' nikaalna."""
    with open(file_path, 'r', encoding='ISO-8859-1') as f:
        for _ in range(5):
            line = f.readline().strip().replace('\ufeff', '')
            if "Date/Time of Report" in line:
                match = re.search(r"Date/Time of Report:\s*(.*)", line)
                if match:
                    return match.group(1).strip().rstrip(',')
    return "Unknown"


def load_csv_with_header(file_path):
    """Header row detect kare aur Report_Date column add kare."""
    with open(file_path, 'r', encoding='ISO-8859-1') as f:
        lines = f.readlines()

    header_index = None
    for i, line in enumerate(lines):
        if "Event Time" in line and "Source" in line and "Condition" in line:
            header_index = i
            break

    if header_index is None:
        print(f" Header row not found in {os.path.basename(file_path)}")
        return None, None

    df = pd.read_csv(
        file_path,
        skiprows=header_index,
        encoding='ISO-8859-1',
        on_bad_lines='skip'
    )

    #  Source file name + Report Date add
    df["Source_File"] = os.path.basename(file_path)
    report_date = extract_report_date(file_path)
    df["Report_Date"] = report_date

    print(f" Loaded: {os.path.basename(file_path)} | Report Date: {report_date}")
    return df, report_date


#  Step 1: Load all CSV files
all_data = []
csv_files = [f for f in os.listdir(folder_path) if f.endswith(".csv")]
print(f"\n Found {len(csv_files)} CSV files in folder.\n")

for file in csv_files:
    file_path = os.path.join(folder_path, file)
    df, report_date = load_csv_with_header(file_path)
    if df is None:
        continue

    if "Event Time" not in df.columns:
        print(f" Skipping {file}, 'Event Time' column missing.")
        continue

    #  Convert Event Time → datetime, phir sirf time part rakho
    df["Event Time"] = pd.to_datetime(df["Event Time"], errors="coerce")
    df["Event Time"] = df["Event Time"].dt.strftime("%H:%M:%S")

    all_data.append(df)

if not all_data:
    print(" No valid CSV files loaded.")
    exit()

data = pd.concat(all_data, ignore_index=True)
print(f" Loaded {len(data)} total rows from {len(all_data)} files.\n")


# 🧪 Step 2: Filter unhealthy rows
unhealthy = data[data["Condition"].isin(UNHEALTHY_CONDITIONS)].copy()
unhealthy = unhealthy.dropna(subset=["Event Time"])
print(f" Unhealthy rows found: {len(unhealthy)}")


#  Step 3: Interval_Start banaye (sirf time part)
# Lekin dhyan: yaha original datetime chahiye interval group ke liye, isliye dobara convert karte hain temp me
temp_times = pd.to_datetime(unhealthy["Event Time"], format="%H:%M:%S", errors="coerce")
unhealthy["Interval_Start"] = temp_times.dt.floor("10min").dt.strftime("%H:%M:%S")


#  Step 4: Group for 10+ hits
grouped = (
    unhealthy
    .groupby(["Interval_Start", "Source", "Condition", "Description", "Source_File", "Report_Date"])
    .size()
    .reset_index(name="Hits_in_10min")
)

#  Step 5: Only keep intervals with 10+ hits
hot_intervals = grouped[grouped["Hits_in_10min"] >= 10]

#  Step 6: Merge back
filtered = pd.merge(
    unhealthy,
    hot_intervals,
    how="inner",
    on=["Interval_Start", "Source", "Condition", "Description", "Source_File", "Report_Date"]
)

#  Step 7: Clean up
filtered = filtered.drop_duplicates()
num_cols = filtered.select_dtypes(include=["number"]).columns
filtered[num_cols] = filtered[num_cols].fillna(0)
filtered = filtered.fillna("")


#  Step 8: Health Summary
total_rows = len(data)
total_unhealthy = len(unhealthy)
total_hot_intervals = len(hot_intervals)
unhealthy_percentage = (total_unhealthy / total_rows * 100) if total_rows > 0 else 0
healthy_percentage = 100 - unhealthy_percentage

if unhealthy_percentage < 1:
    health_status = "Healthy"
elif unhealthy_percentage < 5:
    health_status = "Moderate"
else:
    health_status = "Critical"

summary_df = pd.DataFrame([{
    "Total_Files": len(all_data),
    "Total_Rows": total_rows,
    "Total_Unhealthy_Rows": total_unhealthy,
    "Unhealthy_%": round(unhealthy_percentage, 2),
    "Healthy_%": round(healthy_percentage, 2),
    "Total_Hot_Intervals": total_hot_intervals,
    "Overall_Health_Status": health_status
}])


#  Step 9: Save Excel
excel_file = os.path.join(folder_path, "PVCII_Unhealthy_Report.xlsx")
with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
    filtered.to_excel(writer, index=False, sheet_name="Unhealthy_10min_OnlyHits")
    summary_df.to_excel(writer, index=False, sheet_name="Overall_Health_Summary")

print(f"\n Excel report generated with 2 sheets:\n{excel_file}")
