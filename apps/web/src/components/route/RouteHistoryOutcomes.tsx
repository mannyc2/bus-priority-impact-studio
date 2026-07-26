import { DescriptiveStudyCard, StudyCard } from "@/components/study/StudyCard";
import { studiesByEventId } from "@/components/study/study-display";
import type {
  RouteStudiesArtifact,
  StudioIntervention,
  StudyArtifact,
} from "@/studio/api-contract";

export type TreatmentComparisonCard = {
  title: string;
  routeDeltaLabel: string;
  adjustedDeltaLabel: string;
  caveat: string;
  study?: StudyArtifact;
};

/**
 * Pure peer-adjusted comparisons for the chronology's `peer_adjusted` evidence
 * state. These are comparison-adjusted, never causal, and stay muted and
 * unlinked wherever they render (plan 089 decision D26).
 */
export function interventionComparisonCards(
  events: readonly StudioIntervention[],
  studies: RouteStudiesArtifact | null = null,
): TreatmentComparisonCard[] {
  const studyByEventId = studiesByEventId(studies);
  return events.flatMap((event) => {
    const cohort = event.comparisonCohort;
    if (cohort === undefined) return [];
    const study = event.eventId === undefined ? undefined : studyByEventId.get(event.eventId);
    return [
      {
        title: event.title,
        routeDeltaLabel: signedMph(cohort.routeSpeedDeltaMph),
        adjustedDeltaLabel: signedMph(cohort.adjustedSpeedDeltaMph),
        caveat: cohort.caveat,
        ...(study === undefined ? {} : { study }),
      },
    ];
  });
}

/**
 * The approved study-card anatomy (comp 075), rendered inside the change entry
 * it belongs to. The `?study=` deep-link ring lives on the shell, so the URL
 * contract keeps working now that outcomes no longer have their own card.
 */
export function ChangeStudyCard({
  title,
  study,
  highlighted,
}: {
  title: string;
  study: StudyArtifact;
  highlighted: boolean;
}) {
  return (
    <div
      className={`rounded-[3px] bg-[var(--bp-color-card)] p-4 ${
        highlighted
          ? "shadow-[0_0_0_1px_var(--bp-color-rule),0_0_0_3px_var(--bp-color-accent-bg),0_0_0_4px_var(--bp-color-accent)]"
          : "shadow-[0_0_0_1px_var(--bp-color-rule)]"
      }`}
    >
      {study.claimTier === "descriptive" ? (
        <DescriptiveStudyCard title={title} study={study} />
      ) : (
        <StudyCard title={title} study={study} />
      )}
    </div>
  );
}

export function signedMph(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mph`;
}
