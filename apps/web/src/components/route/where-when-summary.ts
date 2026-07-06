import type { RouteDossierSummaryForDetail, StudioSegment } from "@/studio/api-contract";

type SegmentWithId = Pick<StudioSegment, "id">;

/** Worst-segment badge ("N mo worst") for the segment the dossier flags as the
 * persistent slowest. Rendered in the slow-segments table row detail. */
export function whereWhenSegmentBadge({
  segment,
  dossier,
}: {
  segment: SegmentWithId;
  dossier: RouteDossierSummaryForDetail | null;
}): string | null {
  const worst = dossier?.worstSegment ?? null;
  if (worst === null || worst.segmentId !== segment.id) return null;
  return `${worst.persistenceMonths} mo worst`;
}
