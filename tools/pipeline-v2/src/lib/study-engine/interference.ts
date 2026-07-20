import type { StudyEventCandidateV3 } from "@bp/domain/studio/study";
import { monthIndex } from "./panel.ts";

/**
 * Routes with a real candidate intervention near the treated onset cannot be
 * controls. Operator approval governs which candidates are studied; it does
 * not erase interventions from the interference screen.
 */
export function eventRouteExclusions(
  event: StudyEventCandidateV3,
  candidates: readonly StudyEventCandidateV3[],
): Set<string> {
  const implementation = monthIndex(event.implementationMonth);
  return new Set(
    candidates.flatMap((candidate) =>
      Math.abs(monthIndex(candidate.implementationMonth) - implementation) <= 9
        ? [candidate.routeId]
        : [],
    ),
  );
}
