import type { ReactNode } from "react";
import { treatmentRecordAnchorId } from "@/components/route/route-intervention-model";
import { SectionCard } from "@/components/SectionCard";
import { DescriptiveStudyCard, StudyCard } from "@/components/study/StudyCard";
import { studiesByEventId } from "@/components/study/study-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export function RouteHistoryOutcomes({
  interventions,
  studies,
  studyKey,
}: {
  interventions: readonly StudioIntervention[];
  studies: RouteStudiesArtifact | null;
  studyKey?: string | undefined;
}) {
  const published = studies?.studies ?? [];
  const comparisonCards = interventionComparisonCards(interventions, studies);
  const titleByEventId = new Map(
    interventions.flatMap((event) =>
      event.eventId === undefined ? [] : ([[event.eventId, event.title]] as const),
    ),
  );
  const peerAdjusted = comparisonCards.filter((card) => card.study === undefined);
  const count = published.length + peerAdjusted.length;
  return (
    <section id="route-history-outcomes" className="scroll-mt-20">
      <SectionCard
        title="Outcomes"
        sub="Published studies and descriptive comparisons keep their evidence tier."
        right={
          <span className="font-mono text-[10px] text-[var(--bp-color-ink-55)]">
            {count} {count === 1 ? "result" : "results"}
          </span>
        }
      >
        {count === 0 ? (
          <Alert variant="info">
            <AlertTitle variant="info">No published outcome</AlertTitle>
            <AlertDescription>
              No approved study or peer-adjusted comparison is attached to this exact route.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-3">
            {published.map((study, index) => {
              const eventId = study.provenance.event[0]?.sourceEventId;
              const title =
                (eventId === null || eventId === undefined
                  ? undefined
                  : titleByEventId.get(eventId)) ??
                `${humanizeStudyFamily(study.treatmentFamily)} (${study.implementationMonth})`;
              return (
                <ComparisonCardShell
                  key={study.eventKey}
                  highlighted={study.eventKey === studyKey}
                  targetId={treatmentRecordAnchorId(`study:${study.eventKey}`)}
                >
                  <div className="mb-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
                    {study.claimTier === "gated_estimate"
                      ? "Matched-control study"
                      : "Descriptive study"}
                  </div>
                  {study.claimTier === "descriptive" ? (
                    <DescriptiveStudyCard title={title} study={study} />
                  ) : (
                    <StudyCard
                      title={title}
                      study={study}
                      defaultChartVisible={published.length <= 4 || index < 2}
                    />
                  )}
                </ComparisonCardShell>
              );
            })}
            {peerAdjusted.map((card) => (
              <div
                key={card.title}
                className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 text-[var(--bp-color-ink-70)] shadow-[0_0_0_1px_var(--bp-color-rule)]"
              >
                <LegacyComparisonCardBody card={card} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </section>
  );
}

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

function ComparisonCardShell({
  highlighted,
  targetId,
  children,
}: {
  highlighted: boolean;
  targetId: string;
  children: ReactNode;
}) {
  return (
    <div
      id={targetId}
      tabIndex={-1}
      className={`rounded-[3px] bg-[var(--bp-color-card)] p-4 outline-none transition-shadow duration-700 focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)] ${
        highlighted
          ? "shadow-[0_0_0_1px_var(--bp-color-rule),0_0_0_3px_var(--bp-color-accent-bg),0_0_0_4px_var(--bp-color-accent)]"
          : "shadow-[0_0_0_1px_var(--bp-color-rule)]"
      }`}
    >
      {children}
    </div>
  );
}

function LegacyComparisonCardBody({ card }: { card: TreatmentComparisonCard }) {
  return (
    <div>
      <span className="text-[10px] text-[var(--bp-color-ink-55)]">
        Peer-adjusted comparison; Descriptive only
      </span>
      <div className="mt-2 text-[13px] font-semibold">{card.title}</div>
      <div className="mt-1 font-mono text-[11px] text-[var(--bp-color-ink-70)]">
        {`${card.routeDeltaLabel} route; ${card.adjustedDeltaLabel} peer-adjusted`}
      </div>
      <div className="mt-1 text-[10.5px] text-[var(--bp-color-ink-55)]">{card.caveat}</div>
    </div>
  );
}

function signedMph(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mph`;
}

function humanizeStudyFamily(value: string): string {
  const label = value.replaceAll("_", " ");
  return `${label[0]?.toUpperCase() ?? ""}${label.slice(1)}`;
}
