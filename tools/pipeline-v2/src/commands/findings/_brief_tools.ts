import type { PromotedFinding, StudioBrief } from "@bp/domain";

import type { LoadedCorpus, PublishableIntervention } from "./_corpus.ts";
import {
  getRouteContextDigest,
  type InterventionSummary,
  type PromotedFindingSummary,
  type PublishableInterventionSummary,
  type RouteContextDigest,
  type SignalRowSummary,
} from "./_tools.ts";

// The brief-side digest is a per-route view richer than the finding-side
// digest in two places: (a) it carries the full promoted-finding objects
// (incl. approvedEvidenceRefs the model can re-cite), (b) it surfaces any
// existing brief on the same routeSlug so the model can dedup at draft time
// instead of waiting for the validator. Otherwise it reuses the finding-side
// digest helpers verbatim.

export type RouteBriefDigest = {
  routeId: string;
  routeSlug: string;
  signalRows: SignalRowSummary[];
  promotedFindings: PromotedFindingDetail[];
  interventions: InterventionSummary[];
  publishableInterventions: PublishableInterventionSummary[];
  contextAppendix: unknown;
  existingBriefs: ExistingBriefHint[];
};

export type PromotedFindingDetail = PromotedFindingSummary & {
  claimText: string;
  approvedEvidenceRefs: string[];
  confidence: string;
};

export type ExistingBriefHint = {
  id: string;
  title: string;
  summary: string;
  status: string;
  version: string;
};

// Heuristic: the route slug used by the studio briefs is the route id
// lowercased. SBS variants (e.g., "m15-sbs") would need a real catalog
// lookup, but the slug isn't load-bearing for the agent — it's used for
// brief.routeSlug and for matching against corpus.briefsByRouteSlug. The
// bridge command can rewrite if needed.
export function routeIdToBriefSlug(routeId: string): string {
  return routeId.toLowerCase();
}

function promotedFindingDetail(finding: PromotedFinding): PromotedFindingDetail {
  return {
    promotedFindingId: finding.promotedFindingId,
    detectorId: finding.detectorId,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    claimText: finding.claimText,
    approvedEvidenceRefs: [...finding.approvedEvidenceRefs],
  };
}

function existingBriefHint(brief: StudioBrief): ExistingBriefHint {
  return {
    id: brief.id,
    title: brief.title ?? "",
    summary: brief.summary ?? "",
    status: brief.status ?? "",
    version: brief.version ?? "",
  };
}

export function getRouteBriefDigest(
  corpus: LoadedCorpus,
  routeId: string,
): RouteBriefDigest {
  // Reuse the finding-side digest to fill the common bits, then enrich.
  const baseRaw = getRouteContextDigest(corpus, routeId) as RouteContextDigest;
  const routeSlug = routeIdToBriefSlug(routeId);
  const promoted = corpus.promotedFindingsByRoute.get(routeId as never) ?? [];
  const existing = corpus.briefsByRouteSlug.get(routeSlug) ?? [];
  return {
    routeId,
    routeSlug,
    signalRows: baseRaw.signalRows,
    promotedFindings: (promoted as PromotedFinding[]).map(promotedFindingDetail),
    interventions: baseRaw.interventions,
    publishableInterventions: baseRaw.publishableInterventions,
    contextAppendix: baseRaw.contextAppendix,
    existingBriefs: existing.map(existingBriefHint),
  };
}

// Re-export for callers that import everything from _brief_tools.ts.
export type { PublishableIntervention };
