import argparse
import csv
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Tuple


HEADER_MD = """# Project: {project} — Weekly Timesheet ({start} to {end})\n\nNote: Weekdays only (Sat/Sun = Leave). Hours are capped at 6.0 and humanized per week rules.\nUpdate guidance: Treat the CSV as the source of truth. When updating, add new rows to the CSV first, then mirror them here.\n\n| Date       | Day       | Hours | Task |\n|------------|-----------|-------|------|\n"""


@dataclass
class TimesheetRow:
    date: str
    day: str
    hours: str
    task: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Regenerate timesheet Markdown from CSV and export to PDF.")
    parser.add_argument("--csv", dest="csv_path", type=Path,
                        default=Path(r"d:\\Qbit-dynamics\\alarm_system\\Project_Alarm_Management_System_Timesheet_2025-09-10_to_2025-09-30.csv"))
    parser.add_argument("--md", dest="md_path", type=Path,
                        default=Path(r"d:\\Qbit-dynamics\\alarm_system\\Project_Alarm_Management_System_Timesheet_2025-09-10_to_2025-09-30.md"))
    parser.add_argument("--pdf", dest="pdf_path", type=Path,
                        default=Path(r"d:\\Qbit-dynamics\\alarm_system\\Project_Alarm_Management_System_Timesheet_2025-09-10_to_2025-09-30.pdf"))
    parser.add_argument("--project", dest="project", default="Alarm Management System")
    parser.add_argument("--normalize-csv", dest="normalize_csv", action="store_true",
                        help="Normalize and rewrite the CSV (trim fields, fix Day from Date, normalize semicolons)")
    return parser.parse_args()


def load_csv(csv_path: Path) -> List[TimesheetRow]:
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        field_map = {k.lower(): k for k in (reader.fieldnames or [])}
        required = ["date", "day", "hours", "task"]
        for req in required:
            if req not in field_map:
                raise ValueError(f"CSV missing required column: {req}")
        rows: List[TimesheetRow] = []
        for r in reader:
            rows.append(TimesheetRow(
                date=r[field_map["date"]].strip(),
                day=r[field_map["day"]].strip(),
                hours=r[field_map["hours"]].strip(),
                task=r[field_map["task"]].strip(),
            ))
        return rows


def derive_range(rows: List[TimesheetRow]) -> Tuple[str, str]:
    dates = []
    for r in rows:
        try:
            dates.append(datetime.strptime(r.date, "%Y-%m-%d").date())
        except Exception:
            pass
    if not dates:
        return ("", "")
    return (min(dates).isoformat(), max(dates).isoformat())


def task_to_multiline(task: str) -> str:
    parts = [p.strip() for p in task.split(";") if p.strip()]
    return "<br>".join(parts) if parts else task.strip()


def weekday_name(d) -> str:
    # Monday=0 ... Sunday=6
    names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return names[d.weekday()]


def normalize_and_rewrite_csv(csv_path: Path) -> None:
    """Rewrites CSV with trimmed values, normalized Task (semicolon + single space), and Day derived from Date."""
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        field_map = {k.lower(): k for k in (reader.fieldnames or [])}
        required = ["date", "day", "hours", "task"]
        for req in required:
            if req not in field_map:
                raise ValueError(f"CSV missing required column: {req}")
        rows: List[Dict[str, str]] = []
        for r in reader:
            date_raw = (r[field_map["date"]] or "").strip()
            day_raw = (r[field_map["day"]] or "").strip()
            hours_raw = (r[field_map["hours"]] or "").strip()
            task_raw = (r[field_map["task"]] or "").strip()

            # Normalize date and derive day if possible
            try:
                d = datetime.strptime(date_raw, "%Y-%m-%d").date()
                day_val = weekday_name(d)
                date_val = d.isoformat()
            except Exception:
                day_val = day_raw
                date_val = date_raw

            # Normalize hours (keep as string, trim)
            hours_val = hours_raw

            # Normalize tasks -> join with '; '
            tasks = [p.strip() for p in task_raw.replace("\n", ";").split(";") if p.strip()]
            task_val = "; ".join(tasks)

            rows.append({"Date": date_val, "Day": day_val, "Hours": hours_val, "Task": task_val})

    # Rewrite CSV with consistent header casing
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["Date", "Day", "Hours", "Task"])
        writer.writeheader()
        writer.writerows(rows)


def write_markdown(md_path: Path, project: str, start: str, end: str, rows: List[TimesheetRow]) -> None:
    md_path.parent.mkdir(parents=True, exist_ok=True)
    with md_path.open("w", encoding="utf-8") as f:
        f.write(HEADER_MD.format(project=project, start=start, end=end))
        for r in rows:
            f.write(f"| {r.date} | {r.day} | {r.hours}   | {task_to_multiline(r.task)} |\n")


# ---------- PDF Backends ----------

def try_pandoc(md_path: Path, pdf_path: Path) -> Tuple[bool, str]:
    if not shutil.which("pandoc"):
        return False, "pandoc not found"
    try:
        subprocess.run([
            "pandoc", str(md_path), "-o", str(pdf_path), "--from", "gfm"
        ], check=True)
        return True, "pandoc succeeded"
    except subprocess.CalledProcessError as e:
        return False, f"pandoc failed: {e}"


def try_weasyprint(md_path: Path, pdf_path: Path) -> Tuple[bool, str]:
    try:
        import markdown as md
        from weasyprint import HTML, CSS
    except Exception as e:
        return False, f"weasyprint/markdown import failed: {e}"
    try:
        text = md_path.read_text(encoding="utf-8")
        html = md.markdown(text, extensions=["tables"])  # supports GFM-like tables
        css = CSS(string="""
            body { font-family: Arial, sans-serif; }
            h1 { font-size: 18pt; margin: 0 0 10px 0; }
            p { margin: 0 0 6px 0; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; }
            th { background: #f5f5f5; }
        """)
        HTML(string=html).write_pdf(str(pdf_path), stylesheets=[css])
        return True, "weasyprint succeeded"
    except Exception as e:
        return False, f"weasyprint failed: {e}"


def try_pdfkit(md_path: Path, pdf_path: Path) -> Tuple[bool, str]:
    try:
        import markdown as md
        import pdfkit  # requires wkhtmltopdf installed on system
    except Exception as e:
        return False, f"pdfkit/markdown import failed: {e}"
    try:
        html = md.markdown(md_path.read_text(encoding="utf-8"), extensions=["tables"]) 
        tmp_html = pdf_path.with_suffix(".tmp.html")
        tmp_html.write_text(html, encoding="utf-8")
        pdfkit.from_file(str(tmp_html), str(pdf_path))
        try:
            tmp_html.unlink(missing_ok=True)
        except Exception:
            pass
        return True, "pdfkit succeeded"
    except Exception as e:
        return False, f"pdfkit failed: {e}"


def try_reportlab(csv_path: Path, pdf_path: Path, title: str, subtitle: str) -> Tuple[bool, str]:
    # Direct CSV -> PDF table rendering
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.units import mm
    except Exception as e:
        return False, f"reportlab import failed: {e}"
    try:
        # Load CSV rows
        with csv_path.open(newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            data = list(reader)
        # Convert semicolon-separated Task field into multi-line Paragraphs
        styles = getSampleStyleSheet()
        header = data[0]
        body = []
        task_idx = header.index("Task") if "Task" in header else len(header) - 1
        for row in data[1:]:
            r = row.copy()
            tasks = [t.strip() for t in (r[task_idx] or "").split(";") if t.strip()]
            r[task_idx] = Paragraph("<br/>".join(tasks), styles["Normal"])
            body.append(r)
        tbl = Table([header] + body, repeatRows=1)
        tbl.setStyle(TableStyle([
            ("GRID", (0,0), (-1,-1), 0.5, colors.grey),
            ("BACKGROUND", (0,0), (-1,0), colors.whitesmoke),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("FONTSIZE", (0,0), (-1,-1), 9),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        doc = SimpleDocTemplate(str(pdf_path), pagesize=landscape(A4), leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm)
        title_style = styles["Title"]
        title_style.fontSize = 18
        title_style.leading = 22
        subtitle_style = styles["Normal"]
        story = [Paragraph(title, title_style), Paragraph(subtitle, subtitle_style), Spacer(1, 6), tbl]
        doc.build(story)
        return True, "reportlab succeeded"
    except Exception as e:
        return False, f"reportlab failed: {e}"


def export_pdf(csv_path: Path, md_path: Path, pdf_path: Path, title: str, subtitle: str) -> str:
    # Try multiple backends in order
    ok, msg = try_pandoc(md_path, pdf_path)
    if ok:
        return msg
    ok, msg = try_weasyprint(md_path, pdf_path)
    if ok:
        return msg
    ok, msg = try_pdfkit(md_path, pdf_path)
    if ok:
        return msg
    ok, msg = try_reportlab(csv_path, pdf_path, title, subtitle)
    if ok:
        return msg
    return "All exporters failed. Install one of: pandoc, weasyprint, pdfkit(wkhtmltopdf), reportlab."


def main():
    args = parse_args()
    if args.normalize_csv:
        normalize_and_rewrite_csv(args.csv_path)
        print(f"Normalized CSV: {args.csv_path}")
    rows = load_csv(args.csv_path)
    start, end = derive_range(rows)
    write_markdown(args.md_path, args.project, start, end, rows)
    print(f"Wrote Markdown to: {args.md_path}")
    title = f"Project: {args.project}"
    subtitle = f"Weekly Timesheet ({start} to {end})"
    msg = export_pdf(args.csv_path, args.md_path, args.pdf_path, title, subtitle)
    print(f"PDF export: {msg}")
    if Path(args.pdf_path).exists():
        print(f"Wrote PDF to: {args.pdf_path}")


if __name__ == "__main__":
    main()
