export function normalizeRouteIdText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length === 0) return null;
  return trimmed.replace(/^([A-Z]+)0+([1-9][0-9]*)$/, "$1$2");
}

export function canonicalRouteId(value: unknown, routeUniverse: ReadonlySet<string>): string | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : null;
  if (raw === null || raw.length === 0) return null;
  if (routeUniverse.has(raw)) return raw;

  const normalized = normalizeRouteIdText(raw);
  if (normalized === null) return null;
  return routeUniverse.has(normalized) ? normalized : normalized;
}
