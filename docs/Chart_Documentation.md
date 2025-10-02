# Plant Health Charts — Quick Reference

This document summarizes what each chart shows, its axes, encodings, and tooltip contents. Terminology: Frequency = count of unhealthy 10‑minute windows (hits ≥ 10). Flood Count = peak sliding 10‑minute events inside an incident (severity).

## Unhealthy Sources Timeline (`UnhealthySourcesChart.tsx`)
- **Purpose**: Timeline of unhealthy windows by source with severity.
- **X‑axis**: Peak window start time.
- **Y‑axis**: Alarm Source.
- **Encodings**:
  - Size = Flood Count (severity per window).
  - Color = Priority level (dark to light green).
- **Tooltip**:
  - Source, Flood Count
  - Peak Window: start → end
  - Priority, Location (if provided)
  - Condition, Description (if provided)
  - Note: Hits/Over‑by and Rate/min are hidden in this tooltip.
- **Controls**: Month, Window Mode (Peak Activity | Most Recent), Time Range; Top sources summary panel.

## Unhealthy Sources Analysis — Bar (`UnhealthySourcesBarChart.tsx`)
- **Purpose**: Rank sources by total severity in the selected window.
- **X‑axis**: Alarm Source.
- **Y‑axis**: Total Flood Count (sum of `flood_count` across windows).
- **Legend**: Color by priority or magnitude.
- **Tooltip**:
  - Total Flood, Frequency, Max Flood, Avg Flood
  - Latest Incident: Peak Window start → end
  - Priority, Location, Condition, Description (when available)
  - Threshold note: 10 alarms/10min; shows Over by for context
- **Controls**: Month, Window Mode, Time Range, Top N (10/20/50), Sort (By Flood | A‑Z), AI Insights.

## Unhealthy Sources Word Cloud (`UnhealthySourcesWordCloud.tsx`)
- **Purpose**: Visual prominence of sources by combined risk.
- **Axes**: None (layout cloud).
- **Encodings**:
  - Size = Weighted score (Frequency × 30% + Flood × 70%, configurable)
  - Color = Severity scale (greens), mostly horizontal orientation
- **Tooltip**: Not used; details provided via side panels.
- **Side Panels**:
  - Analytics: Total Sources, Displayed, Total Frequency, Total Flood
  - Definitions: Frequency and Flood
  - Controls: Frequency Weight slider, Top N (words), Month, Window Mode, Time Range

## Top Offenders • Pareto (`ParetoTopOffendersChart.tsx`)
- **Purpose**: Identify the vital few sources contributing ~80% of impact.
- **X‑axis**: Alarm Source.
- **Y‑axis (left)**: Flood Count (or Exceedance when metric toggled).
- **Y‑axis (right)**: Cumulative %.
- **Reference**: 80% line on right axis.
- **Tooltip**:
  - Flood/Exceedance, Share of total, Cumulative %, Frequency, Latest time
- **Controls**: Month, Window Mode, Time Range, Metric (Flood | Exceedance), Top N.

## Priority Breakdown Donut (`PriorityBreakdownDonut.tsx`)
- **Purpose**: Distribution of total flood by raw DCS priority categories.
- **Axes**: None (donut chart).
- **Slices**: Sum of `flood_count` per category (Critical, High, Medium, Low, J‑coded, Not Provided, Other). Zero‑value categories hidden.
- **Center Label**: Total Alarms (sum flood_count).
- **Tooltip**: Category name and flood total.
- **Controls**: Month, Window Mode, Time Range. Category Details view lists Top Sources and Recent incidents within the selected category.

---

Notes:
- Frequency = number of unhealthy fixed 10‑minute bins per source (hits ≥ 10).
- Flood Count = severity: max events in any sliding 10‑minute window within the incident.
- Threshold line at 10 is informational for per‑window context.

## Condition Distribution by Location (`ConditionDistributionByLocation.tsx`)
- **Purpose**: Show where (locations) total flood is coming from, broken down by condition stacks.
- **X‑axis**: Flood Count (numeric axis).
- **Y‑axis**: Location (categorical axis).
- **Encodings**:
  - Horizontal stacked bars per location.
  - Each stack segment = sum of flood for a specific condition (e.g., PVHIGH, PVLOW).
  - Optional highlight for very high segments.
- **Tooltip**:
  - Location name
  - Total flood for the row
  - Per‑condition values with percentages of the row total
- **Controls**: Month, Window Mode, Time Range, Top N locations, Sort (By Total | A–Z), Highlight Very High.
