export type SeverityBands = {
  high: number;
  medium: number;
};

export type BasicSeverity = "low" | "medium" | "high";

export const DEFAULT_SEVERITY_BANDS: SeverityBands = {
  high: 85,
  medium: 70,
};

export function severityFromScore(
  score: number,
  bands: SeverityBands = DEFAULT_SEVERITY_BANDS,
): BasicSeverity {
  if (score >= bands.high) return "high";
  if (score >= bands.medium) return "medium";
  return "low";
}
