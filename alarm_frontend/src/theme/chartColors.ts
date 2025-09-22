// Centralized chart color palette for a consistent green theme
// Base green requested: #7bb652

export const CHART_GREEN = "#7bb652"; // base
export const CHART_GREEN_DARK = "#5f9b42"; // darker shade for high priority / primary series
export const CHART_GREEN_MEDIUM = "#7bb652"; // medium (base)
export const CHART_GREEN_LIGHT = "#a3d17c"; // lighter shade for medium/secondary
export const CHART_GREEN_PALE = "#d7ebc7"; // pale shade for accents / backgrounds

// Helper to map priority -> green shades
export function priorityToGreen(priority?: string): string {
  switch ((priority || "").toLowerCase()) {
    case "high":
      return CHART_GREEN_DARK;
    case "medium":
      return CHART_GREEN_MEDIUM;
    case "low":
      return CHART_GREEN_LIGHT;
    default:
      return CHART_GREEN_MEDIUM;
  }
}

// Helper based on numeric magnitude (e.g., flood/hits)
export function magnitudeToGreen(value: number): string {
  if (value >= 25) return CHART_GREEN_DARK;
  if (value >= 15) return CHART_GREEN_MEDIUM;
  return CHART_GREEN_LIGHT;
}
