import type { RouteInterventionComparison } from "@bp/db";
import { buildStudioInterventionsFromComparisons } from "@bp/domain/studio/interventions";
import { routeKey } from "./_release-routes.ts";
import type {
  DocumentChunkIndex,
  ManualInterventionCandidate,
  ManualInterventionCandidatesArtifact,
  StudioIntervention,
} from "./_release-types.ts";

function interventionLayerForCandidate(
  candidate: ManualInterventionCandidate,
): NonNullable<StudioIntervention["timelineLayer"]> {
  if (candidate.qualityTier === "canonical_milestone") return "canonical_milestone";
  if (candidate.qualityTier === "implemented_treatment_component") return "treatment_component";
  if (candidate.qualityTier === "planned_or_proposed") return "planned_or_proposed";
  return "treatment_component";
}

function manualInterventionTone(
  candidate: ManualInterventionCandidate,
): NonNullable<StudioIntervention["tone"]> {
  if (candidate.status === "implemented") return "good";
  if (candidate.status === "planned" || candidate.status === "proposed") return "warn";
  return "accent";
}

function detailForManualIntervention(candidate: ManualInterventionCandidate): string {
  const componentText =
    candidate.components.length === 1
      ? candidate.components[0]?.description
      : `${candidate.components.length.toLocaleString("en-US")} curated treatment components`;
  const corridor = candidate.location.corridor;
  const extent =
    candidate.location.from && candidate.location.to
      ? `${candidate.location.from} to ${candidate.location.to}`
      : null;
  return [componentText, corridor, extent].filter(Boolean).join(" · ");
}

function sourceLinksForManualIntervention(
  candidate: ManualInterventionCandidate,
): NonNullable<StudioIntervention["sourceLinks"]> {
  const byUrl = new Map<string, { label: string; url: string }>();
  for (const evidence of candidate.evidence) {
    if (evidence.sourceUrl === undefined) continue;
    if (!byUrl.has(evidence.sourceUrl)) {
      byUrl.set(evidence.sourceUrl, {
        label: evidence.sourceTitle || evidence.sourceId,
        url: evidence.sourceUrl,
      });
    }
  }
  return [...byUrl.values()].toSorted(
    (left, right) => left.label.localeCompare(right.label) || left.url.localeCompare(right.url),
  );
}

function sourceSpanRefsForManualIntervention(
  candidate: ManualInterventionCandidate,
  chunkIndex: DocumentChunkIndex,
): NonNullable<StudioIntervention["sourceSpanRefs"]> {
  const chunkIds = [...new Set(candidate.evidence.flatMap((evidence) => evidence.chunkIds))];
  return chunkIds.flatMap((chunkId) => {
    const chunk = chunkIndex.get(chunkId);
    return chunk === undefined ? [] : [chunk];
  });
}

function buildStudioInterventionFromManualCandidate(
  candidate: ManualInterventionCandidate,
  chunkIndex: DocumentChunkIndex,
): StudioIntervention {
  const sourceSpanChunkIds = [
    ...new Set(candidate.evidence.flatMap((evidence) => evidence.chunkIds)),
  ]
    .filter((chunkId) => chunkId.length > 0)
    .toSorted();
  const sourceSpanRefs = sourceSpanRefsForManualIntervention(candidate, chunkIndex);
  const sourceLinks = sourceLinksForManualIntervention(candidate);
  const evidenceCount = candidate.evidence.length;
  const componentCount = candidate.components.length;

  return {
    candidateId: candidate.candidateId,
    timelineLayer: interventionLayerForCandidate(candidate),
    qualityTier: candidate.qualityTier,
    status: candidate.status,
    interventionType: candidate.interventionType,
    year: candidate.implementationDate ?? candidate.dateUnknownReason ?? "date unknown",
    title: candidate.canonicalName,
    detail: detailForManualIntervention(candidate),
    tone: manualInterventionTone(candidate),
    sourceLabel: "Manual intervention registry",
    sourceDetail: `${componentCount.toLocaleString("en-US")} component${
      componentCount === 1 ? "" : "s"
    }; ${evidenceCount.toLocaleString("en-US")} evidence ref${
      evidenceCount === 1 ? "" : "s"
    }; ${candidate.dateRole}`,
    sourceSpanChunkIds,
    ...(sourceSpanRefs.length > 0 ? { sourceSpanRefs } : {}),
    ...(sourceLinks.length > 0 ? { sourceLinks } : {}),
  };
}

export function manualInterventionIndex(
  artifact: ManualInterventionCandidatesArtifact | null,
  chunkIndex: DocumentChunkIndex,
): Map<string, StudioIntervention[]> {
  const byRoute = new Map<string, StudioIntervention[]>();
  for (const candidate of artifact?.candidates ?? []) {
    if (
      candidate.qualityTier !== "canonical_milestone" &&
      candidate.qualityTier !== "implemented_treatment_component" &&
      candidate.qualityTier !== "planned_or_proposed"
    ) {
      continue;
    }
    const intervention = buildStudioInterventionFromManualCandidate(candidate, chunkIndex);
    for (const routeId of candidate.routesAffected ?? []) {
      const key = routeKey(routeId);
      const group = byRoute.get(key) ?? [];
      group.push(intervention);
      byRoute.set(key, group);
    }
  }
  for (const [key, group] of byRoute) {
    byRoute.set(
      key,
      group.toSorted((a, b) => {
        const dateOrder = a.year.localeCompare(b.year);
        return dateOrder === 0 ? a.title.localeCompare(b.title) : dateOrder;
      }),
    );
  }
  return byRoute;
}

export function buildRouteInterventions(
  comparisons: readonly RouteInterventionComparison[],
  manualInterventions: readonly StudioIntervention[],
): StudioIntervention[] {
  return [
    ...buildStudioInterventionsFromComparisons(
      comparisons.map((comparison) => ({
        ...comparison,
        comparisonRouteIds: comparison.comparisonRouteIds,
      })),
    ).map((intervention) => ({
      ...intervention,
      timelineLayer: "evaluation" as const,
    })),
    ...manualInterventions,
  ].toSorted((a, b) => {
    const monthOrder = a.year.localeCompare(b.year);
    return monthOrder === 0 ? a.title.localeCompare(b.title) : monthOrder;
  });
}

export async function documentChunkIndex(
  path: string,
  fromRepoRoot: (relative: string) => string,
): Promise<DocumentChunkIndex> {
  const file = Bun.file(fromRepoRoot(path));
  if (!(await file.exists())) {
    return new Map();
  }
  const artifact = (await file.json()) as {
    chunks: Array<{ chunkId: string; pageRefs: number[]; excerpt: string }>;
  };
  return new Map(
    artifact.chunks.map((chunk) => [
      chunk.chunkId,
      {
        chunkId: chunk.chunkId,
        pageRefs: chunk.pageRefs,
        excerpt: chunk.excerpt,
      },
    ]),
  );
}
