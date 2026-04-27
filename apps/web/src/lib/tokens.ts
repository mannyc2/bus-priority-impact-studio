/** BusPulse design tokens — NYC transit-inspired, consumer-grade palette. */

export const colors = {
  accent: "#0055FF",
  hot: "#FF4D3A",
  warm: "#FF9F1C",
  good: "#2EC4B6",
  pop: "#E040FB",
  ink: "#1a1a2e",
  slate: "#4a4a6a",
  muted: "#8888a8",
  light: "#e8e8f0",
  surface: "#f4f4f8",
  white: "#fafafc",
} as const;

export const gradeColors = {
  A: colors.good,
  B: "#5BB0D0",
  C: colors.warm,
  D: colors.hot,
  F: colors.hot,
} as const;

/** Returns the color for a grade string like "A+", "B-", "D", "F". */
export function gradeColor(grade: string): string {
  const letter = grade.charAt(0) as keyof typeof gradeColors;
  return gradeColors[letter] ?? colors.muted;
}

export const speedBuckets = [
  { label: "< 4 mph", color: "#E53935", min: 0, max: 4 },
  { label: "4\u20136 mph", color: "#FB8C00", min: 4, max: 6 },
  { label: "6\u20138 mph", color: "#FDD835", min: 6, max: 8 },
  { label: "8\u201310 mph", color: "#7CB342", min: 8, max: 10 },
  { label: "10+ mph", color: "#2E7D32", min: 10, max: 99 },
] as const;

export function bucketColor(mph: number): string {
  const b = speedBuckets.find((b) => mph >= b.min && mph < b.max);
  return b ? b.color : "#999";
}

export const spacing = {
  "2xs": 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 20,
  "3xl": 24,
  "4xl": 32,
} as const;

export const radii = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 20,
  pill: 9999,
} as const;

export const shadows = {
  sm: "0 1px 4px rgba(0,0,0,0.06)",
  md: "0 2px 12px rgba(0,0,0,0.1)",
  lg: "0 4px 24px rgba(0,0,0,0.12)",
  sheet: "0 -4px 20px rgba(0,0,0,0.1)",
} as const;
