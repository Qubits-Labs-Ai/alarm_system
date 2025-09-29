import pandas as pd
import json
import os

# 📂 Path to your CSV file (combined report)
file_path = r"C:\Users\New\PyCharmMiscProject\PVC-II\PVCII_Unhealthy_10min_OnlyHits.csv"

try:
    # ✅ CSV file load karo (NOT Excel)
    df = pd.read_csv(file_path)

    # Agar "__source_file" column hai toh rename karke rakho
    if "__source_file" in df.columns:
        df = df.rename(columns={"__source_file": "SourceFile"})

    # 🧠 Convert datetime columns (jaise "Event Time") to string
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            df[col] = df[col].astype(str)

    # 📄 Convert entire dataframe to JSON (list of records)
    data = df.to_dict(orient="records")

    # 📤 Save JSON
    output_file = os.path.join(os.path.dirname(file_path), "Why_Unhealthy_Report_WithSource.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"✅ JSON file saved at: {output_file}")

except Exception as e:
    print(f"❌ Error: {e}")
