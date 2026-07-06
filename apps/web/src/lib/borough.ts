export const BOROUGH_COLOR = {
  Manhattan: "var(--bp-route-manhattan)",
  Bronx: "var(--bp-route-bronx)",
  Brooklyn: "var(--bp-route-brooklyn)",
  Queens: "var(--bp-route-queens)",
  "Staten Island": "var(--bp-route-si)",
} as const;

export function boroughColor(borough: string): string {
  const key = borough.toLowerCase();
  if (key.includes("brooklyn")) return BOROUGH_COLOR.Brooklyn;
  if (key.includes("bronx")) return BOROUGH_COLOR.Bronx;
  if (key.includes("queens")) return BOROUGH_COLOR.Queens;
  if (key.includes("staten")) return BOROUGH_COLOR["Staten Island"];
  return BOROUGH_COLOR.Manhattan;
}
