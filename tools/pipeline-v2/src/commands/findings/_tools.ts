import type {
  DocumentEvidenceCandidate,
  DocumentInterventionRecord,
  FindingReviewPacket,
  PromotedFinding,
  RouteMonthSignalFeature,
} from "@bp/domain";

import type {
  LoadedCorpus,
  PublishableIntervention,
} from "./_corpus.ts";

// Pure-function queries over a LoadedCorpus. These are the read-only "tools"
// the harness exposes — for the first cut we slice them into a prompt rather
// than registering pi-ai Tool[] entries (TypeBox parameter schemas would
// triple the surface area for no win on a single-prompt model). The runner
// builds a per-route corpus digest from these helpers; downstream slices can
// re-introduce true tool-use without changing the queries.

export type RouteContextDigest = {
  routeId: string;
  reviewPackets: ReviewPacketSummary[];
  signalRows: SignalRowSummary[];
  promotedFindings: PromotedFindingSummary[];
  interventions: InterventionSummary[];
  publishableInterventions: PublishableInterventionSummary[];
  documentCandidates: DocumentCandidateSummary[];
  contextAppendix: unknown;
};

export type ReviewPacketSummary = {
  packetId: string;
  detectorId: string;
  reasonCode: string;
  claimText: string;
  reviewRank: number;
  priorityScore: number;
  evidenceLinks: Array<{
    linkId: string;
    role: string;
    kind: string;
    ref: string;
    note: string | null;
  }>;
};

export type SignalRowSummary = {
  window: string;
  direction: string | null;
  routeWeightedAverageSpeedMph: number | null;
  hotspotCount: number;
  maxHotspotScore: number | null;
  permitTouchedEventCount: number;
  contextTouchedEventCount: number;
  uncertainty: RouteMonthSignalFeature["uncertainty"];
};

export type PromotedFindingSummary = {
  promotedFindingId: string;
  detectorId: string;
  category: string;
  severity: string;
  claimText: string;
};

export type InterventionSummary = {
  recordId: string;
  recordKind: string;
  primaryTreatments: string[];
  effectiveDate: string | null;
  routes: string[];
};

export type PublishableInterventionSummary = {
  recordId: string;
  status: string | null;
  primaryTreatments: string[];
};

export type DocumentCandidateSummary = {
  candidateId: string;
  candidateType: string;
  evidenceQuote: string;
};

function summarizeReviewPacket(packet: FindingReviewPacket): ReviewPacketSummary {
  const allLinks = [
    ...packet.evidence.primary,
    ...packet.evidence.context,
    ...packet.evidence.counterEvidence,
    ...packet.evidence.caveats,
  ];
  return {
    packetId: packet.packetId,
    detectorId: packet.candidate.detectorId,
    reasonCode: packet.candidate.reasonCode,
    claimText: packet.candidate.claimText,
    reviewRank: packet.reviewRank,
    priorityScore: packet.priority.score,
    evidenceLinks: allLinks.map((link) => ({
      linkId: link.linkId,
      role: link.evidenceRole,
      kind: link.evidenceKind,
      ref: link.evidenceRef,
      note: link.note,
    })),
  };
}

function summarizeSignalRow(row: RouteMonthSignalFeature): SignalRowSummary {
  return {
    window: row.window,
    direction: row.direction,
    routeWeightedAverageSpeedMph: row.routeWeightedAverageSpeedMph,
    hotspotCount: row.hotspotCount,
    maxHotspotScore: row.maxHotspotScore,
    permitTouchedEventCount: row.permitTouchedEventCount,
    contextTouchedEventCount: row.contextTouchedEventCount,
    uncertainty: row.uncertainty,
  };
}

function summarizePromotedFinding(finding: PromotedFinding): PromotedFindingSummary {
  return {
    promotedFindingId: finding.promotedFindingId,
    detectorId: finding.detectorId,
    category: finding.category,
    severity: finding.severity,
    claimText: finding.claimText,
  };
}

function summarizeInterventionRecord(
  record: DocumentInterventionRecord,
): InterventionSummary {
  return {
    recordId: record.recordId,
    recordKind: record.recordKind,
    primaryTreatments: [...record.primaryTreatments],
    effectiveDate: record.effectiveDate ?? null,
    routes: [...record.routes],
  };
}

function summarizePublishableIntervention(
  record: PublishableIntervention,
): PublishableInterventionSummary {
  return {
    recordId: record.recordId,
    status: (record.status as string | undefined) ?? null,
    primaryTreatments: (record.primaryTreatments as string[] | undefined) ?? [],
  };
}

function summarizeDocumentCandidate(
  candidate: DocumentEvidenceCandidate,
): DocumentCandidateSummary {
  return {
    candidateId: candidate.candidateId,
    candidateType: candidate.candidateType,
    evidenceQuote: candidate.evidenceQuote,
  };
}

export function listRoutes(corpus: LoadedCorpus): string[] {
  return [...corpus.routes].sort();
}

export function getRouteContextDigest(
  corpus: LoadedCorpus,
  routeId: string,
): RouteContextDigest {
  const reviewPackets = (corpus.reviewPacketsByRoute.get(routeId as never) ?? [])
    .slice()
    .sort((a, b) => a.reviewRank - b.reviewRank)
    .map(summarizeReviewPacket);
  const signalRows = (corpus.signalFeaturesByRoute.get(routeId as never) ?? []).map(
    summarizeSignalRow,
  );
  const promotedFindings = (
    corpus.promotedFindingsByRoute.get(routeId as never) ?? []
  ).map(summarizePromotedFinding);
  const interventions = (corpus.interventionRecordsByRoute.get(routeId as never) ?? []).map(
    summarizeInterventionRecord,
  );
  const publishableInterventions = (
    corpus.publishableInterventionsByRoute.get(routeId as never) ?? []
  ).map(summarizePublishableIntervention);
  // pull document candidates referenced by the route's intervention records
  const candidateIds = new Set<string>();
  for (const record of corpus.interventionRecordsByRoute.get(routeId as never) ?? []) {
    for (const id of record.evidenceCandidateIds ?? []) candidateIds.add(id);
  }
  const documentCandidates: DocumentCandidateSummary[] = [];
  for (const candidateId of candidateIds) {
    const candidate = corpus.documentCandidates.get(candidateId);
    if (candidate) documentCandidates.push(summarizeDocumentCandidate(candidate));
  }
  const contextAppendix = corpus.contextAppendixByRoute.get(routeId as never) ?? null;
  return {
    routeId,
    reviewPackets,
    signalRows,
    promotedFindings,
    interventions,
    publishableInterventions,
    documentCandidates,
    contextAppendix,
  };
}

export type CorpusInventory = {
  routes: number;
  reviewPackets: number;
  promotedFindings: number;
  signalFeatureRoutes: number;
  interventionRecords: number;
  publishableInterventions: number;
  documentCandidates: number;
  contextAppendixRoutes: number;
};

export function summarizeCorpusInventory(corpus: LoadedCorpus): CorpusInventory {
  return {
    routes: corpus.routes.size,
    reviewPackets: corpus.reviewPackets.size,
    promotedFindings: corpus.promotedFindings.size,
    signalFeatureRoutes: corpus.signalFeaturesByRoute.size,
    interventionRecords: corpus.interventionRecords.size,
    publishableInterventions: corpus.publishableInterventions.length,
    documentCandidates: corpus.documentCandidates.size,
    contextAppendixRoutes: corpus.contextAppendixByRoute.size,
  };
}
