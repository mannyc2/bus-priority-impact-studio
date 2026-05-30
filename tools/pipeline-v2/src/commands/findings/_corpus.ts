import * as z from "zod";

import {
  type AgentFindingProposalCorpusPaths,
  type DocumentEvidenceCandidate,
  DocumentEvidenceCandidateSchema,
  type DocumentInterventionRecord,
  DocumentInterventionRecordSchema,
  type FindingEvidenceLink,
  type FindingPromotionQueueArtifact,
  FindingPromotionQueueArtifactSchema,
  type FindingReviewPacket,
  FindingReviewPacketsArtifactSchema,
  type FindingSignalFeaturesArtifact,
  FindingSignalFeaturesArtifactSchema,
  type IsoMonth,
  IsoMonthSchema,
  type PromotedFinding,
  PromotedFindingsArtifactSchema,
  type RouteId,
  RouteIdSchema,
  type RouteMonthSignalFeature,
  type StudioBrief,
} from "@bp/domain";

import { readOptionalJsonArtifact } from "../../lib/json.ts";

// Minimal shape we read out of context-appendix.json. The full appendix has
// many optional per-route sections; we only need routeId + the raw payload so
// agent tools can return whatever section was requested.
const ContextAppendixRouteSchema = z
  .object({ routeId: z.string().min(1) })
  .catchall(z.unknown());

const ContextAppendixArtifactSchema = z
  .object({
    artifactKind: z.string().optional(),
    routes: z.array(ContextAppendixRouteSchema).optional(),
  })
  .catchall(z.unknown());

export type ContextAppendixRoute = z.output<typeof ContextAppendixRouteSchema>;

// Publishable intervention artifact (intervention-publishable-v1.json). Schema
// matches the PromotionArtifact type in tools/pipeline-v2/src/commands/docs/tier2/_shared.ts
// but is intentionally permissive — we only read the fields the harness needs.
const PublishableInterventionSchema = z
  .object({
    recordId: z.string().min(1),
    sourceId: z.string().min(1).optional(),
    timelineLayer: z.string().optional(),
    status: z.string().optional(),
    recordKind: z.string().optional(),
    routes: z.array(z.string()).optional(),
    primaryTreatments: z.array(z.string()).optional(),
    customTreatments: z.array(z.string()).optional(),
    serviceMode: z.string().nullable().optional(),
    corridor: z.unknown().optional(),
    effectiveDate: z.string().nullable().optional(),
    datePrecision: z.string().nullable().optional(),
  })
  .catchall(z.unknown());

const PublishableInterventionArtifactSchema = z
  .object({
    version: z.literal(1).optional(),
    generatedAt: z.string().optional(),
    summary: z.unknown().optional(),
    publishableInterventions: z.array(PublishableInterventionSchema).optional(),
  })
  .catchall(z.unknown());

const PublishableByRouteArtifactSchema = z
  .object({
    version: z.literal(1).optional(),
    generatedAt: z.string().optional(),
    summary: z.unknown().optional(),
    interventionsByRoute: z.record(z.string(), z.array(z.unknown())).optional(),
  })
  .catchall(z.unknown());

export type PublishableIntervention = z.output<typeof PublishableInterventionSchema>;
export type PublishableByRoute = z.output<typeof PublishableByRouteArtifactSchema>;

// On disk the intervention-records artifact is wrapped in
// `{ documentInterventionRecords: [...] }`. The strict per-record schema rejects
// even mildly drifted records, so we keep the loader permissive and let
// `_validation.ts` catch problems on the proposal side. Records are typed as
// `unknown` and narrowed by callers.
const InterventionRecordsArtifactSchema = z
  .object({
    documentInterventionRecords: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .catchall(z.unknown())
  .or(z.array(z.record(z.string(), z.unknown())));

const DocumentCandidatesArtifactSchema = z
  .object({
    documentEvidenceCandidates: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .catchall(z.unknown())
  .or(z.array(z.record(z.string(), z.unknown())));

// Permissive briefs-artifact shape. On disk this is
// `{ schemaVersion, generatedAt, briefs: [{ brief, route }, ...], quality }`
// (see StudioBriefsResponseSchema). We narrow each `card.brief` lazily so a
// drifted serving release doesn't crash the loader — briefs the agent can't
// safely use for dedupe just get skipped.
const BriefsArtifactSchema = z
  .object({
    briefs: z
      .array(
        z
          .object({
            brief: z.record(z.string(), z.unknown()),
          })
          .catchall(z.unknown()),
      )
      .optional(),
  })
  .catchall(z.unknown());

export type CorpusPathInput = {
  month: string;
  reviewPacketsPath?: string | null;
  promotionQueuePath?: string | null;
  promotedFindingsPath?: string | null;
  signalFeaturesPath?: string | null;
  contextAppendixPath?: string | null;
  interventionPublishablePath?: string | null;
  interventionPublishableByRoutePath?: string | null;
  interventionRecordsPath?: string | null;
  documentCandidatesPath?: string | null;
  briefsPath?: string | null;
};

export type LoadedCorpus = {
  month: IsoMonth;
  paths: AgentFindingProposalCorpusPaths;
  routes: ReadonlySet<RouteId>;
  reviewPackets: ReadonlyMap<string, FindingReviewPacket>;
  reviewPacketsByRoute: ReadonlyMap<RouteId, FindingReviewPacket[]>;
  evidenceLinks: ReadonlyMap<string, FindingEvidenceLink>;
  promotionQueue: FindingPromotionQueueArtifact | null;
  promotedFindings: ReadonlyMap<string, PromotedFinding>;
  promotedFindingsByRoute: ReadonlyMap<RouteId, PromotedFinding[]>;
  signalFeaturesArtifact: FindingSignalFeaturesArtifact | null;
  signalFeaturesByRoute: ReadonlyMap<RouteId, RouteMonthSignalFeature[]>;
  contextAppendixByRoute: ReadonlyMap<RouteId, ContextAppendixRoute>;
  interventionRecords: ReadonlyMap<string, DocumentInterventionRecord>;
  interventionRecordsByRoute: ReadonlyMap<RouteId, DocumentInterventionRecord[]>;
  documentCandidates: ReadonlyMap<string, DocumentEvidenceCandidate>;
  publishableInterventions: readonly PublishableIntervention[];
  publishableInterventionsByRoute: ReadonlyMap<RouteId, PublishableIntervention[]>;
  briefs: ReadonlyMap<string, StudioBrief>;
  briefsByRouteSlug: ReadonlyMap<string, StudioBrief[]>;
};

function parseRouteId(value: string | null | undefined): RouteId | null {
  if (!value) return null;
  const parsed = RouteIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function pushByRoute<T>(
  index: Map<RouteId, T[]>,
  routeId: RouteId | null,
  value: T,
): void {
  if (routeId === null) return;
  const existing = index.get(routeId);
  if (existing) {
    existing.push(value);
  } else {
    index.set(routeId, [value]);
  }
}

export async function loadCorpus(input: CorpusPathInput): Promise<LoadedCorpus> {
  const month = IsoMonthSchema.parse(input.month);

  const reviewPacketsArtifact = await readOptionalJsonArtifact(
    input.reviewPacketsPath ?? null,
    FindingReviewPacketsArtifactSchema,
  );
  const promotionQueueArtifact = await readOptionalJsonArtifact(
    input.promotionQueuePath ?? null,
    FindingPromotionQueueArtifactSchema,
  );
  const promotedFindingsArtifact = await readOptionalJsonArtifact(
    input.promotedFindingsPath ?? null,
    PromotedFindingsArtifactSchema,
  );
  const signalFeaturesArtifact = await readOptionalJsonArtifact(
    input.signalFeaturesPath ?? null,
    FindingSignalFeaturesArtifactSchema,
  );
  const contextAppendixArtifact = await readOptionalJsonArtifact(
    input.contextAppendixPath ?? null,
    ContextAppendixArtifactSchema,
  );
  const publishableArtifact = await readOptionalJsonArtifact(
    input.interventionPublishablePath ?? null,
    PublishableInterventionArtifactSchema,
  );
  const publishableByRouteArtifact = await readOptionalJsonArtifact(
    input.interventionPublishableByRoutePath ?? null,
    PublishableByRouteArtifactSchema,
  );
  const interventionRecordsRaw = await readOptionalJsonArtifact(
    input.interventionRecordsPath ?? null,
    InterventionRecordsArtifactSchema,
  );
  const documentCandidatesRaw = await readOptionalJsonArtifact(
    input.documentCandidatesPath ?? null,
    DocumentCandidatesArtifactSchema,
  );
  const briefsRaw = await readOptionalJsonArtifact(
    input.briefsPath ?? null,
    BriefsArtifactSchema,
  );

  const reviewPackets = new Map<string, FindingReviewPacket>();
  const reviewPacketsByRoute = new Map<RouteId, FindingReviewPacket[]>();
  const evidenceLinks = new Map<string, FindingEvidenceLink>();
  for (const packet of reviewPacketsArtifact?.packets ?? []) {
    reviewPackets.set(packet.packetId, packet);
    const routeId = packet.candidate.routeId ?? null;
    pushByRoute(reviewPacketsByRoute, routeId, packet);
    for (const link of [
      ...packet.evidence.primary,
      ...packet.evidence.context,
      ...packet.evidence.counterEvidence,
      ...packet.evidence.caveats,
    ]) {
      evidenceLinks.set(link.linkId, link);
    }
  }

  const promotedFindings = new Map<string, PromotedFinding>();
  const promotedFindingsByRoute = new Map<RouteId, PromotedFinding[]>();
  for (const finding of promotedFindingsArtifact?.findings ?? []) {
    promotedFindings.set(finding.promotedFindingId, finding);
    pushByRoute(promotedFindingsByRoute, finding.routeId, finding);
  }

  const signalFeaturesByRoute = new Map<RouteId, RouteMonthSignalFeature[]>();
  for (const feature of signalFeaturesArtifact?.features ?? []) {
    pushByRoute(signalFeaturesByRoute, feature.routeId, feature);
  }

  const contextAppendixByRoute = new Map<RouteId, ContextAppendixRoute>();
  for (const route of contextAppendixArtifact?.routes ?? []) {
    const routeId = parseRouteId(route.routeId);
    if (routeId) contextAppendixByRoute.set(routeId, route);
  }

  const interventionRecordList: ReadonlyArray<Record<string, unknown>> = Array.isArray(
    interventionRecordsRaw,
  )
    ? interventionRecordsRaw
    : (interventionRecordsRaw?.documentInterventionRecords ?? []);
  const interventionRecords = new Map<string, DocumentInterventionRecord>();
  const interventionRecordsByRoute = new Map<RouteId, DocumentInterventionRecord[]>();
  for (const raw of interventionRecordList) {
    const parsed = DocumentInterventionRecordSchema.safeParse(raw);
    const record = parsed.success
      ? parsed.data
      : (raw as unknown as DocumentInterventionRecord);
    const recordId = (raw["recordId"] as string | undefined) ?? null;
    if (!recordId) continue;
    interventionRecords.set(recordId, record);
    const routes = (raw["routes"] as readonly string[] | undefined) ?? [];
    for (const routeIdRaw of routes) {
      const routeId = parseRouteId(routeIdRaw);
      pushByRoute(interventionRecordsByRoute, routeId, record);
    }
  }

  const documentCandidateList: ReadonlyArray<Record<string, unknown>> = Array.isArray(
    documentCandidatesRaw,
  )
    ? documentCandidatesRaw
    : (documentCandidatesRaw?.documentEvidenceCandidates ?? []);
  const documentCandidates = new Map<string, DocumentEvidenceCandidate>();
  for (const raw of documentCandidateList) {
    const candidateId = (raw["candidateId"] as string | undefined) ?? null;
    if (!candidateId) continue;
    const parsed = DocumentEvidenceCandidateSchema.safeParse(raw);
    const candidate = parsed.success
      ? parsed.data
      : (raw as unknown as DocumentEvidenceCandidate);
    documentCandidates.set(candidateId, candidate);
  }

  const briefs = new Map<string, StudioBrief>();
  const briefsByRouteSlug = new Map<string, StudioBrief[]>();
  for (const card of briefsRaw?.briefs ?? []) {
    const raw = card.brief as Record<string, unknown>;
    const id = (raw["id"] as string | undefined) ?? null;
    const routeSlug = (raw["routeSlug"] as string | undefined) ?? null;
    if (!id || !routeSlug) continue;
    // Keep the raw object — downstream validators only read structural fields
    // (id, title, summary, claims, evidence). Strict parsing is the brief
    // proposal's job, not the existing-brief dedupe corpus.
    const brief = raw as unknown as StudioBrief;
    briefs.set(id, brief);
    const arr = briefsByRouteSlug.get(routeSlug) ?? [];
    arr.push(brief);
    briefsByRouteSlug.set(routeSlug, arr);
  }

  const publishableInterventions = publishableArtifact?.publishableInterventions ?? [];
  const publishableInterventionsByRoute = new Map<RouteId, PublishableIntervention[]>();
  for (const record of publishableInterventions) {
    for (const routeIdRaw of record.routes ?? []) {
      const routeId = parseRouteId(routeIdRaw);
      pushByRoute(publishableInterventionsByRoute, routeId, record);
    }
  }
  // by-route projection isn't strictly required but we keep it loaded so the
  // corpus path is recorded; downstream tools can prefer the projection if
  // present without re-deriving it.
  if (publishableByRouteArtifact?.interventionsByRoute) {
    for (const routeIdRaw of Object.keys(publishableByRouteArtifact.interventionsByRoute)) {
      parseRouteId(routeIdRaw);
    }
  }

  const routes = new Set<RouteId>();
  for (const id of reviewPacketsByRoute.keys()) routes.add(id);
  for (const id of promotedFindingsByRoute.keys()) routes.add(id);
  for (const id of signalFeaturesByRoute.keys()) routes.add(id);
  for (const id of contextAppendixByRoute.keys()) routes.add(id);
  for (const id of interventionRecordsByRoute.keys()) routes.add(id);
  for (const id of publishableInterventionsByRoute.keys()) routes.add(id);

  const paths: AgentFindingProposalCorpusPaths = {
    reviewPackets: input.reviewPacketsPath ?? null,
    promotionQueue: input.promotionQueuePath ?? null,
    promotedFindings: input.promotedFindingsPath ?? null,
    signalFeatures: input.signalFeaturesPath ?? null,
    contextAppendix: input.contextAppendixPath ?? null,
    interventionPublishable: input.interventionPublishablePath ?? null,
    interventionPublishableByRoute: input.interventionPublishableByRoutePath ?? null,
    interventionRecords: input.interventionRecordsPath ?? null,
    documentCandidates: input.documentCandidatesPath ?? null,
  };

  return {
    month,
    paths,
    routes,
    reviewPackets,
    reviewPacketsByRoute,
    evidenceLinks,
    promotionQueue: promotionQueueArtifact,
    promotedFindings,
    promotedFindingsByRoute,
    signalFeaturesArtifact,
    signalFeaturesByRoute,
    contextAppendixByRoute,
    interventionRecords,
    interventionRecordsByRoute,
    documentCandidates,
    publishableInterventions,
    publishableInterventionsByRoute,
    briefs,
    briefsByRouteSlug,
  };
}
