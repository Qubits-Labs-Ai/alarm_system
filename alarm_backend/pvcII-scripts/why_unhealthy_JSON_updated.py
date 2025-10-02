import pandas as pd
import json
import os
from collections import OrderedDict

file_path = r"C:\Users\New\PyCharmMiscProject\PVC-II\PVCII_Unhealthy_Report.xlsx"

try:
    # Excel ki sari sheets read karo
    sheets = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
    json_output = OrderedDict()

    # Summary sheet detect karo
    summary_sheet_name = next((n for n in sheets if "summary" in n.lower()), None)

    #  Pehle Summary sheet add karo
    if summary_sheet_name:
        df_summary = sheets[summary_sheet_name].copy()
        for col in df_summary.columns:
            if pd.api.types.is_datetime64_any_dtype(df_summary[col]):
                df_summary[col] = df_summary[col].astype(str)
        json_output["Summary"] = df_summary.to_dict(orient="records")

    #  Baaki sheets add karo
    for sheet_name, df in sheets.items():
        if sheet_name == summary_sheet_name:
            continue

        df = df.copy()
        if "__source_file" in df.columns:
            df = df.rename(columns={"__source_file": "SourceFile"})

        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                df[col] = df[col].astype(str)

        json_output[sheet_name] = df.to_dict(orient="records")

    #  JSON save
    output_file = os.path.join(os.path.dirname(file_path), "Why_Unhealthy_Report_With_Summary.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(json_output, f, ensure_ascii=False, indent=2)

    print(f"\n JSON file created successfully (Summary on top):\n{output_file}")

except Exception as e:
    print(f" Error: {e}")
