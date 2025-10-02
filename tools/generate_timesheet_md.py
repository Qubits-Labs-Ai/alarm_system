import argparse
import csv
from datetime import datetime
from pathlib import Path
from typing import List, Dict

HEADER_MD = """# Project: {project} — Weekly Timesheet ({start} to {end})

Note: Weekdays only (Sat/Sun = Leave). Hours are capped at 6.0 and humanized per week rules.
Update guidance: Treat the CSV as the source of truth. When updating, add new rows to the CSV first, then mirror them here.

| Date       | Day       | Hours | Task |
|------------|-----------|-------|------|
"""


def parse_args():
    parser = argparse.ArgumentParser(description="Generate Markdown timesheet from CSV with multi-line tasks.")
    parser.add_argument(
        "--csv",
        dest="csv_path",
        type=Path,
        default=Path(r"d:\Qbit-dynamics\alarm_system\Project_Alarm_Management_System_Timesheet_2025-09-10_to_2025-09-30.csv"),
        help="Path to source CSV (Date,Day,Hours,Task)",
    )
    parser.add_argument(
        "--md",
        dest="md_path",
        type=Path,
        default=Path(r"d:\Qbit-dynamics\alarm_system\Project_Alarm_Management_System_Timesheet_2025-09-10_to_2025-09-30.md"),
        help="Path to output Markdown file",
    )
    parser.add_argument(
        "--project",
        dest="project",
        default="Alarm Management System",
        help="Project title to show in Markdown header",
    )
    return parser.parse_args()


def load_rows(csv_path: Path) -> List[Dict[str, str]]:
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        # Normalize keys
        field_map = {k.lower(): k for k in reader.fieldnames or []}
        required = ["date", "day", "hours", "task"]
        for req in required:
            if req not in field_map:
                raise ValueError(f"CSV missing required column: {req}")
        rows = []
        for r in reader:
            rows.append({
                "date": r[field_map["date"]].strip(),
                "day": r[field_map["day"]].strip(),
                "hours": r[field_map["hours"]].strip(),
                "task": r[field_map["task"]].strip(),
            })
        return rows


def derive_range(rows: List[Dict[str, str]]):
    dates = []
    for r in rows:
        try:
            dates.append(datetime.strptime(r["date"], "%Y-%m-%d").date())
        except Exception:
            # leave as-is if parsing fails
            pass
    if not dates:
        return ("", "")
    return (min(dates).isoformat(), max(dates).isoformat())


def task_to_multiline(task: str) -> str:
    # Split on semicolon and convert to HTML line breaks for Markdown tables
    parts = [p.strip() for p in task.split(";") if p.strip()]
    return "<br>".join(parts) if parts else task.strip()


def render_md(project: str, start: str, end: str, rows: List[Dict[str, str]]) -> str:
    header = HEADER_MD.format(project=project, start=start or "", end=end or "")
    lines = [header]
    for r in rows:
        lines.append(
            f"| {r['date']} | {r['day']} | {r['hours']}   | {task_to_multiline(r['task'])} |\n"
        )
    return "".join(lines)


def main():
    args = parse_args()
    rows = load_rows(args.csv_path)
    start, end = derive_range(rows)
    md = render_md(args.project, start, end, rows)
    args.md_path.parent.mkdir(parents=True, exist_ok=True)
    args.md_path.write_text(md, encoding="utf-8")
    print(f"Wrote Markdown to: {args.md_path}")


if __name__ == "__main__":
    main()
