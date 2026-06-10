import { detectorScopeIdentityKey } from "./detector-readiness-projection";

// Shared cap-policy helpers (S2.2 in docs/research/backend-goal-finish-detectors.md).
//
// Every per-detector review-queue re-derived the same three primitives for cap-bias accounting and
// control sampling: borough-prefix extraction, score-rank computation (to detect cap suppression by
// rank), and borough-round-robin sampling (so cap-suppressed/clean/skipped controls are spread across
// boroughs instead of dominated by one). This module owns those mechanics so new slices import them
// instead of copying them. Detector-specific *qualification* predicates (what counts as a qualifying
// cell, which fields feed the cap floor) intentionally stay in each review-queue — only the shared
// mechanics live here.

/** Borough/route-family prefix (leading letters, upper-cased) used for cap-bias accounting. */
export function boroughPrefix(routeId: string | null): string {
  if (routeId === null) return "unknown";
  const match = routeId.match(/^[A-Za-z]+/);
  return match === null ? "unknown" : match[0].toUpperCase();
}

export type RankableCandidate = {
  readonly detectorId: string;
  readonly scopeId: string;
  readonly detectorScore: number | null;
};

/**
 * Rank emitted candidates by detector score (desc), tie-broken by scopeId (asc), returning a
 * detector-scope identity key -> 1-based rank map. A rank greater than the production candidate cap
 * marks a cell as cap-suppressed in a high-limit inventory run.
 */
export function rankByDetectorScore(
  candidates: ReadonlyArray<RankableCandidate>,
): Map<string, number> {
  const rankByKey = new Map<string, number>();
  [...candidates]
    .map((candidate) => ({
      key: detectorScopeIdentityKey({
        detectorId: candidate.detectorId,
        scopeId: candidate.scopeId,
      }),
      score: candidate.detectorScore ?? 0,
      scopeId: candidate.scopeId,
    }))
    .sort((left, right) => right.score - left.score || left.scopeId.localeCompare(right.scopeId))
    .forEach((entry, index) => {
      rankByKey.set(entry.key, index + 1);
    });
  return rankByKey;
}

/**
 * Pick up to `limit` rows, cycling boroughs in sorted order so a control stratum (cap-suppressed,
 * clean, skipped, borough-spread) is spread across boroughs rather than dominated by the largest one.
 * Within each borough, rows are taken in their incoming (already priority-sorted) order.
 */
export function roundRobinByBorough<T>(
  rows: readonly T[],
  limit: number,
  boroughOf: (row: T) => string,
): T[] {
  if (limit <= 0) return [];
  const byBorough = new Map<string, T[]>();
  for (const row of rows) {
    const key = boroughOf(row);
    const list = byBorough.get(key) ?? [];
    list.push(row);
    byBorough.set(key, list);
  }
  const boroughs = [...byBorough.keys()].sort((left, right) => left.localeCompare(right));
  const picked: T[] = [];
  let round = 0;
  while (picked.length < limit) {
    let added = false;
    for (const borough of boroughs) {
      const list = byBorough.get(borough);
      const row = list === undefined ? undefined : list[round];
      if (row === undefined) continue;
      picked.push(row);
      added = true;
      if (picked.length >= limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return picked;
}
