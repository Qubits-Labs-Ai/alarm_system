// Centralized chart color palette using CSS variables for consistent green theme
// Aligned with the new green and neutral color system

// Primary chart colors using CSS variables
export const CHART_GREEN_PRIMARY = "hsl(var(--chart-1))"; // Primary chart green
export const CHART_GREEN_SECONDARY = "hsl(var(--chart-2))"; // Teal-green
export const CHART_GREEN_TERTIARY = "hsl(var(--chart-3))"; // Forest green
export const CHART_GREEN_QUATERNARY = "hsl(var(--chart-4))"; // Darker green
export const CHART_GREEN_QUINARY = "hsl(var(--chart-5))"; // Deep green

// Legacy exports for backward compatibility
export const CHART_GREEN = CHART_GREEN_PRIMARY;
export const CHART_GREEN_DARK = CHART_GREEN_TERTIARY;
export const CHART_GREEN_MEDIUM = CHART_GREEN_PRIMARY;
export const CHART_GREEN_LIGHT = CHART_GREEN_SECONDARY;
export const CHART_GREEN_PALE = "hsl(var(--accent))";

// Success and status colors (use vars directly since they are defined as OKLCH values)
export const CHART_SUCCESS = "var(--success)";
export const CHART_WARNING = "var(--warning)";
export const CHART_DESTRUCTIVE = "var(--destructive)";

// Runtime helpers to resolve CSS variables and adapt to dark mode
function cssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v || '').trim();
}

function hslFromVar(name: string): string {
  const tuple = cssVar(name); // e.g. "96 62% 40%"
  return tuple ? `hsl(${tuple})` : '';
}

function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

function lightenHslTupleVar(name: string, delta: number): string {
  const tuple = cssVar(name); // e.g. "96 62% 40%"
  if (!tuple) return '';
  const parts = tuple.split(/\s+/);
  if (parts.length !== 3) return `hsl(${tuple})`;
  const [h, s, lRaw] = parts;
  const l = parseFloat(lRaw.replace('%', ''));
  const newL = Math.max(0, Math.min(95, l + delta));
  return `hsl(${h} ${s} ${newL}%)`;
}

// Adjust both hue (degrees) and lightness (%) of a CSS var HSL tuple
function shiftHueLightnessVar(name: string, hueDelta: number, lightnessDelta: number): string {
  const tuple = cssVar(name); // e.g. "96 62% 40%"
  if (!tuple) return '';
  const parts = tuple.split(/\s+/);
  if (parts.length !== 3) return `hsl(${tuple})`;
  const [hRaw, s, lRaw] = parts;
  const h = (parseFloat(hRaw) + hueDelta + 360) % 360;
  const l = parseFloat(lRaw.replace('%', ''));
  const newL = Math.max(0, Math.min(95, l + lightnessDelta));
  return `hsl(${h} ${s} ${newL}%)`;
}

// Helper to map priority -> green shades using CSS variables
export function priorityToGreen(priority?: string): string {
  switch ((priority || "").toLowerCase()) {
    case "critical":
    case "high":
      return isDarkMode() ? lightenHslTupleVar('--chart-3', 20) || CHART_GREEN_TERTIARY : CHART_GREEN_TERTIARY; // Forest green, lighter in dark
    case "medium":
      return isDarkMode() ? lightenHslTupleVar('--chart-1', 20) || CHART_GREEN_PRIMARY : CHART_GREEN_PRIMARY; // Primary green, lighter in dark
    case "low":
      return isDarkMode() ? lightenHslTupleVar('--chart-2', 22) || CHART_GREEN_SECONDARY : CHART_GREEN_SECONDARY; // Teal-green, lighter in dark
    default:
      return isDarkMode() ? lightenHslTupleVar('--chart-1', 20) || CHART_GREEN_PRIMARY : CHART_GREEN_PRIMARY;
  }
}

// Helper based on numeric magnitude with enhanced color mapping
export function magnitudeToGreen(value: number): string {
  if (isDarkMode()) {
    if (value >= 50) return lightenHslTupleVar('--chart-4', 18) || CHART_GREEN_QUATERNARY;
    if (value >= 25) return lightenHslTupleVar('--chart-3', 18) || CHART_GREEN_TERTIARY;
    if (value >= 15) return lightenHslTupleVar('--chart-1', 18) || CHART_GREEN_PRIMARY;
    if (value >= 5)  return lightenHslTupleVar('--chart-2', 18) || CHART_GREEN_SECONDARY;
    return lightenHslTupleVar('--chart-2', 22) || CHART_GREEN_SECONDARY;
  }
  if (value >= 50) return CHART_GREEN_QUATERNARY; // Very high values
  if (value >= 25) return CHART_GREEN_TERTIARY; // High values
  if (value >= 15) return CHART_GREEN_PRIMARY; // Medium values
  if (value >= 5) return CHART_GREEN_SECONDARY; // Low-medium values
  return CHART_GREEN_SECONDARY; // Low values
}

// Severity-based color mapping for professional risk assessment
export function severityToColor(severity: number): string {
  // Non-green statuses remain as theme tokens (already bright in dark mode)
  if (severity >= 80) return cssVar('--destructive') || CHART_DESTRUCTIVE; // Critical (red)
  if (severity >= 60) return cssVar('--warning') || CHART_WARNING; // High (orange/yellow)

  // Greens: use lighter tones in dark mode for better legibility
  if (severity >= 40) {
    return isDarkMode() ? lightenHslTupleVar('--chart-3', 20) || CHART_GREEN_TERTIARY : hslFromVar('--chart-3') || CHART_GREEN_TERTIARY;
  }
  if (severity >= 20) {
    return isDarkMode() ? lightenHslTupleVar('--chart-1', 22) || CHART_GREEN_PRIMARY : hslFromVar('--chart-1') || CHART_GREEN_PRIMARY;
  }
  // Minimal → success green
  return cssVar('--success') || CHART_SUCCESS;
}

// Generate a palette of distinct green shades using the theme's CSS variables.
// It cycles across the 5 base green tokens and varies lightness for additional distinct shades.
export function getGreenPalette(count: number): string[] {
  const bases: Array<{ varName: string; fallback: string }> = [
    { varName: '--chart-1', fallback: CHART_GREEN_PRIMARY },
    { varName: '--chart-2', fallback: CHART_GREEN_SECONDARY },
    { varName: '--chart-3', fallback: CHART_GREEN_TERTIARY },
    { varName: '--chart-4', fallback: CHART_GREEN_QUATERNARY },
    { varName: '--chart-5', fallback: CHART_GREEN_QUINARY },
  ];

  // Rings of (hueDelta, lightnessDelta) for stronger separation while staying in green vicinity
  // Dark mode uses brighter lightness for legibility
  const rings: Array<{ dh: number; dl: number }> = isDarkMode()
    ? [
        { dh: 0, dl: 18 },
        { dh: 10, dl: 12 },
        { dh: -10, dl: 8 },
        { dh: 16, dl: 22 },
        { dh: -16, dl: 26 },
        { dh: 24, dl: 14 },
        { dh: -24, dl: 10 },
      ]
    : [
        { dh: 0, dl: -12 },
        { dh: 10, dl: -6 },
        { dh: -10, dl: 0 },
        { dh: 16, dl: 8 },
        { dh: -16, dl: 14 },
        { dh: 24, dl: 20 },
        { dh: -24, dl: 26 },
      ];

  const palette: string[] = [];
  for (let i = 0; i < count; i++) {
    const base = bases[i % bases.length];
    const ring = rings[Math.floor(i / bases.length) % rings.length] || { dh: 0, dl: 0 };
    const tuple = cssVar(base.varName); // e.g. "96 62% 40%"
    let color = '';
    if (tuple) {
      if (ring.dh === 0 && ring.dl === 0) {
        color = `hsl(${tuple})`;
      } else {
        color = shiftHueLightnessVar(base.varName, ring.dh, ring.dl);
      }
    }
    if (!color) color = base.fallback;
    palette.push(color);
  }
  return palette;
}
