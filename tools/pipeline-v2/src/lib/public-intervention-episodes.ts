import type { LocalInterventionEvent } from "@bp/db/local";
import type {
  MtaWikiOperationalOccurrenceImportArtifactV5,
  OperationalOccurrenceRowV2,
  OperationalOccurrenceTreatmentMemberV2,
} from "@bp/domain/documents/operational-occurrence";
import type {
  RouteDossierSummary,
  StudioInterventionCorpus,
  StudioRouteEvidenceArtifactV2,
} from "@bp/domain/studio";
import {
  type PublicEpisodeResolutionAuditArtifact,
  PublicEpisodeResolutionAuditArtifactSchema,
} from "@bp/domain/studio/public-intervention-episode-audit";
import {
  type PublicEpisodeCitation,
  type PublicEpisodeComponent,
  type PublicEpisodeDate,
  type PublicEpisodeFinding,
  type PublicInterventionEpisode,
  type PublicInterventionEpisodesArtifact,
  PublicInterventionEpisodesArtifactSchema,
  type PublicNetworkBuildoutSnapshot,
  type PublicProposedPlan,
  type PublicRouteInterventionHistoryArtifact,
  PublicRouteInterventionHistoryArtifactSchema,
} from "@bp/domain/studio/public-intervention-episodes";
import type { StudyIndexArtifact } from "@bp/domain/studio/study";
import {
  PROGRAMME_SCOPED_RECORD_IDS,
  REVIEWED_EPISODE_OVERRIDES,
  REVIEWED_RECONCILIATIONS,
  type ReviewedPhase,
  type ReviewedReconciliation,
  type ReviewedRouteRole,
} from "../inputs/public-episode-reconciliations.ts";
import { decodeSchemaStrict } from "./schema-decode.ts";

type RouteIdentity = {
  routeId: string;
  slug: string;
  label: string;
  corridor: string | null;
};

type AuditRecord = {
  recordId: string;
  disposition: "included" | "supporting" | "excluded" | "unresolved";
  note: string;
};

type AuditRow = PublicEpisodeResolutionAuditArtifact["audits"][number];
type WithheldRow = PublicEpisodeResolutionAuditArtifact["withheld"][number];
type MutableEpisode = Omit<PublicInterventionEpisode, "components" | "citations"> & {
  components: PublicEpisodeComponent[];
  citations: PublicEpisodeCitation[];
};
type MutableAudit = Omit<AuditRow, "sourceEventIds" | "records"> & {
  sourceEventIds: string[];
  records: AuditRecord[];
};

export type PublicEpisodeBuildInput = {
  generatedAt: string;
  occurrences: MtaWikiOperationalOccurrenceImportArtifactV5;
  routeEvidence: StudioRouteEvidenceArtifactV2;
  corpus: StudioInterventionCorpus;
  studies: StudyIndexArtifact;
  registryEvents: readonly LocalInterventionEvent[];
  dossiers: ReadonlyMap<string, RouteDossierSummary>;
  sourceHashes: {
    occurrenceArtifact: string;
    routeEvidenceArtifact: string;
    corpusArtifact: string;
    studyIndexArtifact: string;
    aceRegistry: string;
  };
};

export type PublicEpisodeBuildOutput = {
  publicArtifact: PublicInterventionEpisodesArtifact;
  routeArtifacts: readonly PublicRouteInterventionHistoryArtifact[];
  auditArtifact: PublicEpisodeResolutionAuditArtifact;
};

const KIND_LABELS: Readonly<Record<string, string>> = {
  bus_lane: "Bus lanes",
  busway: "Busways",
  buses: "Buses",
  camera_enforcement: "Camera enforcement",
  fares: "Fare payment",
  other: "Other work",
  passenger_information: "Passenger information",
  route_and_schedule: "Routes and schedules",
  select_bus_service: "Select Bus Service",
  signal_priority: "Signal priority",
  stops: "Stops and boarding",
  street_design: "Street design",
};

const FAMILY_TO_KIND: Readonly<Record<string, string>> = {
  automated_bus_lane_enforcement: "camera_enforcement",
  bus_lane: "bus_lane",
  bus_stop_or_boarding: "stops",
  busway: "busway",
  capital_or_infrastructure: "street_design",
  curb_management: "street_design",
  customer_information: "passenger_information",
  enforcement: "camera_enforcement",
  fare_collection: "fares",
  pedestrian_or_accessibility: "street_design",
  route_redesign: "route_and_schedule",
  service_pattern: "route_and_schedule",
  signage_and_markings: "street_design",
  signal_priority: "signal_priority",
  traffic_restriction: "street_design",
  vehicle_or_fleet: "buses",
};

const OTHER_TITLE = (routes: string): string => `Documented work on the ${routes}`;

const TITLE_BY_KIND: Readonly<Record<string, (routes: string) => string>> = {
  bus_lane: (routes) => `Bus lane added on the ${routes}`,
  busway: (routes) => `Busway opened on the ${routes}`,
  buses: (routes) => `New buses on the ${routes}`,
  camera_enforcement: (routes) => `Camera enforcement began on the ${routes}`,
  fares: (routes) => `Fare payment changed on the ${routes}`,
  other: OTHER_TITLE,
  passenger_information: (routes) => `Passenger information changed on the ${routes}`,
  route_and_schedule: (routes) => `Service changed on the ${routes}`,
  select_bus_service: (routes) => `Select Bus Service began on the ${routes}`,
  signal_priority: (routes) => `Signal priority added on the ${routes}`,
  stops: (routes) => `Stops changed on the ${routes}`,
  street_design: (routes) => `Street changes on the ${routes}`,
};

const COMPONENT_LABEL_FIXUPS: Readonly<Record<string, string>> = {
  "bus lane": "Bus lane",
  "off board fare collection": "Off-board fare collection",
  "off-board fare collection": "Off-board fare collection",
  "off-board fare payment": "Off-board fare payment",
  "offset bus lane": "Offset bus lane",
  "offset bus lanes": "Offset bus lanes",
  "transit signal priority": "Signal priority",
};

const INTERNAL_VOCABULARY =
  /\b(atomic|bundle|treatment|treatments|occurrence|record|records|projection|canonical|schema|artifact|corpus|dataset|source-stated|cohort)\b/iu;
const COMPONENT_LABEL_CAP = 44;
const REVIEW_ROUTE_SLUGS = ["m15-sbs", "q52-sbs", "bx41", "b44", "b44-sbs", "bx38"] as const;
const MANUAL_MINT_CAP = 8;
const ACE_SOURCE_ID = "mta_ace_routes";
const ACE_SOURCE_URL =
  "https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement";
const FIRST_BUILDOUT_YEAR = 2007;
const LAST_BUILDOUT_YEAR = 2026;

const FIXED_BUILDOUT_SERIES = [
  {
    familyKey: "bus_lane" as const,
    label: "Bus lanes",
    routesByYear: [
      11, 12, 12, 14, 16, 32, 39, 42, 45, 49, 53, 66, 78, 93, 134, 139, 187, 208, 293, 293,
    ],
  },
  {
    familyKey: "select_bus_service" as const,
    label: "Select Bus Service",
    routesByYear: [0, 2, 2, 3, 5, 8, 12, 13, 15, 19, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30],
  },
  {
    familyKey: "signal_priority" as const,
    label: "Signal priority",
    routesByYear: [0, 0, 0, 0, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  },
  {
    familyKey: "busway" as const,
    label: "Busway",
    routesByYear: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 3, 3, 3, 3, 3, 3],
  },
  {
    familyKey: "other" as const,
    label: "Other documented work",
    routesByYear: [0, 0, 0, 0, 2, 2, 5, 5, 5, 5, 5, 6, 7, 7, 7, 10, 10, 10, 10, 10],
  },
] as const;

export function episodeIdFor(decisionKey: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < decisionKey.length; index += 1) {
    hash ^= decisionKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let mix = hash ^ 0x9e3779b9;
  for (let index = decisionKey.length - 1; index >= 0; index -= 1) {
    mix ^= decisionKey.charCodeAt(index);
    mix = Math.imul(mix, 0x85ebca6b) >>> 0;
  }
  return `ep_${hash.toString(16).padStart(8, "0")}${mix.toString(16).padStart(8, "0")}`;
}

export function buildPublicInterventionEpisodes(
  input: PublicEpisodeBuildInput,
): PublicEpisodeBuildOutput {
  assertCoherentWikiRelease(input);
  assertManualReconciliationContract(input);

  const routeById = new Map<string, RouteIdentity>();
  const routeBySlug = new Map<string, RouteIdentity>();
  const treatmentById = new Map<
    string,
    StudioRouteEvidenceArtifactV2["routes"][number]["interventions"][number]
  >();
  const citationBySourceId = new Map<
    string,
    StudioRouteEvidenceArtifactV2["routes"][number]["citations"][number]
  >();
  for (const bundle of input.routeEvidence.routes) {
    const identity = {
      routeId: bundle.routeId,
      slug: bundle.routeSlug,
      label: bundle.routeIdentity.displayLabel,
      corridor: bundle.routeIdentity.officialLongName,
    };
    routeById.set(bundle.routeId, identity);
    routeBySlug.set(bundle.routeSlug, identity);
    for (const intervention of bundle.interventions) {
      if (!treatmentById.has(intervention.recordId)) {
        treatmentById.set(intervention.recordId, intervention);
      }
    }
    for (const citation of bundle.citations) {
      const current = citationBySourceId.get(citation.sourceId);
      if (
        current === undefined ||
        (current.sourceTitle === undefined && citation.sourceTitle !== undefined)
      ) {
        citationBySourceId.set(citation.sourceId, citation);
      }
    }
  }

  const studiesByEventKey = new Map(input.studies.studies.map((study) => [study.eventKey, study]));
  const attachments = new Map<string, ReviewedReconciliation[]>();
  const minting: ReviewedReconciliation[] = [];
  for (const decision of REVIEWED_RECONCILIATIONS) {
    if (decision.attachesToOccurrenceId === null) {
      minting.push(decision);
    } else {
      const current = attachments.get(decision.attachesToOccurrenceId) ?? [];
      current.push(decision);
      attachments.set(decision.attachesToOccurrenceId, current);
    }
  }
  const overrides = new Map(
    REVIEWED_EPISODE_OVERRIDES.map((override) => [override.occurrenceId, override]),
  );

  const episodes: PublicInterventionEpisode[] = [];
  const audits: AuditRow[] = [];
  for (const occurrence of input.occurrences.occurrences) {
    const attached = attachments.get(occurrence.occurrence_id) ?? [];
    const built = buildOccurrenceEpisode({
      occurrence,
      attached,
      override: overrides.get(occurrence.occurrence_id),
      routeById,
      treatmentById,
      citationBySourceId,
      studiesByEventKey,
    });
    episodes.push(built.episode);
    audits.push(built.audit);
  }
  for (const decision of minting) {
    const built = buildReconciledEpisode({
      decision,
      routeById,
      treatmentById,
      citationBySourceId,
      studiesByEventKey,
    });
    episodes.push(built.episode);
    audits.push(built.audit);
  }

  const registry = admitAceRegistry({
    episodes,
    audits,
    events: input.registryEvents,
    routeById,
  });
  const publicEpisodes = registry.episodes.toSorted(compareEpisodesNewestFirst);
  const releaseId = `public-interventions-v1:${input.occurrences.sourceRelease.releaseId}:${input.sourceHashes.aceRegistry.slice(0, 12)}`;
  const occurrenceCoverageEnd =
    input.occurrences.occurrences
      .map((occurrence) => occurrence.resolved_onset.date)
      .toSorted()
      .at(-1) ?? null;

  const sources = [
    {
      sourceId: "mta-wiki-operational-occurrences",
      releaseId: input.occurrences.sourceRelease.releaseId,
      sha256: input.sourceHashes.occurrenceArtifact,
      coverageEnd: occurrenceCoverageEnd,
    },
    {
      sourceId: "mta-wiki-route-evidence",
      releaseId: input.routeEvidence.source.wikiRelease,
      sha256: input.sourceHashes.routeEvidenceArtifact,
      coverageEnd: null,
    },
    {
      sourceId: "reviewed-intervention-corpus",
      releaseId: input.corpus.generatedAt,
      sha256: input.sourceHashes.corpusArtifact,
      coverageEnd: null,
    },
    {
      sourceId: ACE_SOURCE_ID,
      releaseId: registry.registryReleaseId,
      sha256: input.sourceHashes.aceRegistry,
      coverageEnd: registry.coverageEnd,
    },
    {
      sourceId: "published-study-index",
      releaseId: input.studies.analysisMonth,
      sha256: input.sourceHashes.studyIndexArtifact,
      coverageEnd: input.studies.analysisMonth,
    },
  ];
  const proposedPlans = buildProposedPlans(input.corpus);
  const publicArtifact = decodeSchemaStrict(PublicInterventionEpisodesArtifactSchema, {
    artifactKind: "bp.studio.public_intervention_episodes.v1",
    schemaVersion: 1,
    release: {
      releaseId,
      publishedAt: input.generatedAt,
      coverageEnd: "2026-05",
      sources,
    },
    networkBuildout: buildNetworkSnapshot(registry.registryEvents),
    proposedPlans,
    episodes: publicEpisodes,
  });

  const routeArtifacts = [...routeById.values()]
    .map((route): PublicRouteInterventionHistoryArtifact | null => {
      const routeEpisodes = publicEpisodes.filter((episode) =>
        episode.routes.some((candidate) => candidate.routeId === route.routeId),
      );
      if (routeEpisodes.length === 0) return null;
      return decodeSchemaStrict(PublicRouteInterventionHistoryArtifactSchema, {
        artifactKind: "bp.studio.route_intervention_history.v1",
        schemaVersion: 1,
        releaseId,
        route,
        episodes: routeEpisodes,
      });
    })
    .filter((artifact): artifact is PublicRouteInterventionHistoryArtifact => artifact !== null);

  const claimed = claimedRecordsByRoute(publicEpisodes, registry.audits);
  const auditArtifact = decodeSchemaStrict(PublicEpisodeResolutionAuditArtifactSchema, {
    artifactKind: "bp.quality.intervention_episode_resolution.v1",
    schemaVersion: 1,
    releaseId,
    generatedAt: input.generatedAt,
    scope: {
      upstreamOccurrenceCount: input.occurrences.occurrences.length,
      reconciliationDecisionCount: REVIEWED_RECONCILIATIONS.length,
      localMintedEpisodeCount: minting.length,
      registryEventCount: registry.registryEvents.length,
      registryAttachedEventCount: registry.attachedCount,
      registryMintedEpisodeCount: registry.mintedCount,
      episodeCount: publicEpisodes.length,
      routeReachCount: new Set(
        publicEpisodes.flatMap((episode) => episode.routes.map((route) => route.routeId)),
      ).size,
      reviewedRouteCount: REVIEW_ROUTE_SLUGS.length,
      releasePins: [
        {
          label: "Occurrence release",
          value: input.occurrences.sourceRelease.releaseId,
        },
        {
          label: "Occurrence manifest",
          value: input.occurrences.sourceRelease.manifestSha256,
        },
        {
          label: "Route evidence release",
          value: input.routeEvidence.source.wikiRelease,
        },
        {
          label: "Route evidence manifest",
          value: input.routeEvidence.source.manifestSha256,
        },
        {
          label: "Reviewed corpus",
          value: input.corpus.sourceCorpus.sha256,
        },
        {
          label: "ACE registry",
          value: input.sourceHashes.aceRegistry,
        },
      ],
    },
    audits: registry.audits,
    withheld: collectWithheld({
      routeEvidence: input.routeEvidence,
      audits: registry.audits,
      claimedByRoute: claimed.byRoute,
      claimedAnywhere: claimed.anywhere,
    }),
    reviewRoutes: REVIEW_ROUTE_SLUGS.map((slug) => {
      const route = routeBySlug.get(slug);
      if (route === undefined)
        throw new Error(`Review route ${slug} is absent from route evidence.`);
      const bundle = input.routeEvidence.routes.find((candidate) => candidate.routeSlug === slug);
      if (bundle === undefined) throw new Error(`Review route bundle ${slug} is absent.`);
      const dossier = input.dossiers.get(slug);
      return {
        routeId: route.routeId,
        slug,
        label: route.label,
        corridor: route.corridor,
        timelineCount: bundle.timeline.length,
        treatmentCount: bundle.interventions.length,
        projectCount: bundle.projects.length,
        changeCandidateCount:
          bundle.timeline.length + bundle.interventions.length + bundle.projects.length,
        speed:
          dossier?.speed.sparkline.map((point) => ({
            month: point.month,
            value: point.value,
          })) ?? [],
      };
    }),
  });

  return { publicArtifact, routeArtifacts, auditArtifact };
}

function assertCoherentWikiRelease(input: PublicEpisodeBuildInput): void {
  const occurrenceRelease = input.occurrences.sourceRelease;
  const evidenceRelease = input.routeEvidence.source;
  if (occurrenceRelease.releaseId !== evidenceRelease.wikiRelease) {
    throw new Error(
      `Wiki release mismatch: occurrences ${occurrenceRelease.releaseId}, route evidence ${evidenceRelease.wikiRelease}.`,
    );
  }
  if (occurrenceRelease.manifestSha256 !== evidenceRelease.manifestSha256) {
    throw new Error("Wiki release manifest mismatch between occurrences and route evidence.");
  }
}

function assertManualReconciliationContract(input: PublicEpisodeBuildInput): void {
  const occurrenceIds = new Set(
    input.occurrences.occurrences.map((occurrence) => occurrence.occurrence_id),
  );
  const active = REVIEWED_RECONCILIATIONS.filter(
    (decision) => decision.replacementState === "active",
  );
  if (active.length !== REVIEWED_RECONCILIATIONS.length) {
    throw new Error("Only active manual reconciliation decisions may be published.");
  }
  const minting = active.filter((decision) => decision.attachesToOccurrenceId === null);
  if (minting.length > MANUAL_MINT_CAP) {
    throw new Error(
      `Manual reconciliation mint cap exceeded: ${minting.length}/${MANUAL_MINT_CAP}.`,
    );
  }
  const episodeIds = active.map((decision) => decision.publicEpisodeId);
  if (new Set(episodeIds).size !== episodeIds.length) {
    throw new Error("Manual reconciliation decisions contain duplicate publicEpisodeId values.");
  }
  const claimedRecords = active.flatMap((decision) => [
    ...decision.includedRecordIds,
    ...decision.supportingRecordIds,
  ]);
  if (new Set(claimedRecords).size !== claimedRecords.length) {
    throw new Error("A raw record is claimed by more than one manual reconciliation decision.");
  }
  for (const decision of active) {
    if (
      decision.validForOccurrenceRelease.releaseId !== input.occurrences.sourceRelease.releaseId ||
      decision.validForOccurrenceRelease.manifestSha256 !==
        input.occurrences.sourceRelease.manifestSha256
    ) {
      throw new Error(
        `Manual reconciliation ${decision.decisionId} is stale for the selected occurrence release.`,
      );
    }
    if (
      decision.attachesToOccurrenceId !== null &&
      !occurrenceIds.has(decision.attachesToOccurrenceId)
    ) {
      throw new Error(
        `Manual reconciliation ${decision.decisionId} attaches to a missing occurrence.`,
      );
    }
  }
}

function buildOccurrenceEpisode(input: {
  occurrence: OperationalOccurrenceRowV2;
  attached: readonly ReviewedReconciliation[];
  override:
    | {
        title?: string;
        summary?: string;
        phase?: ReviewedPhase;
        caveat?: string;
        reviewerNote: string;
      }
    | undefined;
  routeById: ReadonlyMap<string, RouteIdentity>;
  treatmentById: ReadonlyMap<
    string,
    StudioRouteEvidenceArtifactV2["routes"][number]["interventions"][number]
  >;
  citationBySourceId: ReadonlyMap<
    string,
    StudioRouteEvidenceArtifactV2["routes"][number]["citations"][number]
  >;
  studiesByEventKey: ReadonlyMap<string, StudyIndexArtifact["studies"][number]>;
}): { episode: PublicInterventionEpisode; audit: AuditRow } {
  const { occurrence, attached } = input;
  const episodeId = episodeIdFor(`occurrence|${occurrence.occurrence_id}`);
  const members = occurrenceMembers(occurrence);
  const primaryFamily =
    occurrence.treatment.kind === "bundle"
      ? (occurrence.treatment.bundle_family ?? members[0]?.treatment_family ?? "")
      : (members[0]?.treatment_family ?? "");
  const kindKeys = uniqueStrings([
    familyKind(primaryFamily),
    ...members.map((member) => familyKind(member.treatment_family)),
    ...attached.flatMap((decision) => decision.kindKeys),
  ]);
  const routeIds = occurrence.routes.map((route) => route.gtfs_route_id);
  const routeLabels = routeIds.map((routeId) => routeIdentity(input.routeById, routeId).label);
  const attachedRecordIds = new Set(attached.flatMap((decision) => decision.componentRecordIds));
  const components = dedupeComponents([
    ...members.map((member) =>
      componentFor(
        episodeId,
        member.treatment_record_id,
        member.treatment_family,
        input.treatmentById,
      ),
    ),
    ...[...attachedRecordIds]
      .filter((recordId) => !members.some((member) => member.treatment_record_id === recordId))
      .map((recordId) => componentFor(episodeId, recordId, "", input.treatmentById)),
  ]);
  const authored = attached.find((decision) => decision.title.length > 0);
  const title =
    input.override?.title ??
    authored?.title ??
    composeTitle(kindKeys[0] ?? "other", routeLabels, routeIds.length);
  const citedSourceIds = uniqueStrings([
    ...occurrence.source_ids,
    ...attached.flatMap((decision) => decision.citedSourceIds),
  ]);
  const studyEventKey =
    attached.find((decision) => decision.studyEventKey !== null)?.studyEventKey ?? null;

  const episode: PublicInterventionEpisode = {
    episodeId,
    title,
    summary: input.override?.summary ?? authored?.summary ?? "",
    date: publicDate(occurrence.resolved_onset.date, occurrence.resolved_onset.precision, null),
    phase: input.override?.phase ?? authored?.phase ?? occurrencePhase(kindKeys[0] ?? "other"),
    lifecycle: "in_place",
    kindKeys,
    routes: routeIds.map((routeId) => {
      const route = routeIdentity(input.routeById, routeId);
      return {
        routeId,
        label: route.label,
        slug: route.slug,
        role: attachedRole(attached, routeId) ?? routeRoleForKind(kindKeys[0] ?? "other"),
      };
    }),
    components,
    citations: citedSourceIds
      .map((sourceId) => citationFor(sourceId, input.citationBySourceId))
      .filter((citation): citation is PublicEpisodeCitation => citation !== null),
    caveat:
      input.override?.caveat ??
      attached.find((decision) => decision.caveat !== null)?.caveat ??
      null,
    finding: findingFor(studyEventKey, input.studiesByEventKey),
  };

  const records = dedupeAuditRecords([
    ...occurrence.provenance.event_record_ids.map((recordId) => ({
      recordId,
      disposition: "included" as const,
      note: "Observed by the approved occurrence.",
    })),
    ...members.map((member) => ({
      recordId: member.treatment_record_id,
      disposition: "included" as const,
      note: "Reviewed treatment member.",
    })),
    ...attached.flatMap(reconciliationAuditRecords),
  ]);
  return {
    episode,
    audit: {
      episodeId,
      decisionKind: "reviewed_occurrence",
      decisionIds: [
        occurrence.occurrence_review_decision_id,
        ...attached.map((decision) => decision.decisionId),
      ],
      occurrenceId: occurrence.occurrence_id,
      sourceEventIds: [],
      records,
      reviewerNotes: [
        ...(input.override === undefined ? [] : [input.override.reviewerNote]),
        ...attached.map((decision) => decision.reviewerNote),
      ],
      replacementState: attached.length === 0 ? null : (attached[0]?.replacementState ?? null),
    },
  };
}

function buildReconciledEpisode(input: {
  decision: ReviewedReconciliation;
  routeById: ReadonlyMap<string, RouteIdentity>;
  treatmentById: ReadonlyMap<
    string,
    StudioRouteEvidenceArtifactV2["routes"][number]["interventions"][number]
  >;
  citationBySourceId: ReadonlyMap<
    string,
    StudioRouteEvidenceArtifactV2["routes"][number]["citations"][number]
  >;
  studiesByEventKey: ReadonlyMap<string, StudyIndexArtifact["studies"][number]>;
}): { episode: PublicInterventionEpisode; audit: AuditRow } {
  const { decision } = input;
  const episodeId = decision.publicEpisodeId;
  const expectedEpisodeId = episodeIdFor(`reconciliation|${decision.decisionId}`);
  if (episodeId !== expectedEpisodeId) {
    throw new Error(
      `Manual reconciliation ${decision.decisionId} changed stable public identity: expected ${expectedEpisodeId}, received ${episodeId}.`,
    );
  }
  return {
    episode: {
      episodeId,
      title: decision.title,
      summary: decision.summary,
      date: publicDate(decision.date.value, decision.date.precision, decision.date.end),
      phase: decision.phase,
      lifecycle: decision.lifecycle,
      kindKeys: uniqueStrings(decision.kindKeys),
      routes: decision.routes.map((relation) => {
        const route = routeIdentity(input.routeById, relation.routeId);
        return {
          routeId: relation.routeId,
          label: route.label,
          slug: route.slug,
          role: relation.role,
        };
      }),
      components: dedupeComponents(
        decision.componentRecordIds.map((recordId) =>
          componentFor(episodeId, recordId, "", input.treatmentById),
        ),
      ),
      citations: decision.citedSourceIds
        .map((sourceId) => citationFor(sourceId, input.citationBySourceId))
        .filter((citation): citation is PublicEpisodeCitation => citation !== null),
      caveat: decision.caveat,
      finding: findingFor(decision.studyEventKey, input.studiesByEventKey),
    },
    audit: {
      episodeId,
      decisionKind: "reviewed_reconciliation",
      decisionIds: [decision.decisionId],
      occurrenceId: null,
      sourceEventIds: [],
      records: dedupeAuditRecords(reconciliationAuditRecords(decision)),
      reviewerNotes: [decision.reviewerNote],
      replacementState: decision.replacementState,
    },
  };
}

export function admitAceRegistry(input: {
  episodes: readonly PublicInterventionEpisode[];
  audits: readonly AuditRow[];
  events: readonly LocalInterventionEvent[];
  routeById: ReadonlyMap<string, RouteIdentity>;
}): {
  episodes: PublicInterventionEpisode[];
  audits: AuditRow[];
  registryEvents: LocalInterventionEvent[];
  attachedCount: number;
  mintedCount: number;
  coverageEnd: string | null;
  registryReleaseId: string;
} {
  const registryEvents = input.events
    .filter(
      (event) =>
        event.sourceId === ACE_SOURCE_ID &&
        event.eventStatus === "implemented" &&
        event.interventionType === "automated_bus_lane_enforcement",
    )
    .toSorted(
      (left, right) =>
        left.implementationDate.localeCompare(right.implementationDate) ||
        left.routeId.localeCompare(right.routeId) ||
        left.program.localeCompare(right.program),
    );
  const episodes: MutableEpisode[] = input.episodes.map((episode) => ({
    ...episode,
    components: [...episode.components],
    citations: [...episode.citations],
  }));
  const audits: MutableAudit[] = input.audits.map((audit) => ({
    ...audit,
    sourceEventIds: [...audit.sourceEventIds],
    records: [...audit.records],
  }));
  const auditByEpisodeId = new Map(audits.map((audit) => [audit.episodeId, audit]));
  let attachedCount = 0;
  let mintedCount = 0;

  for (const event of registryEvents) {
    const route = input.routeById.get(event.routeId);
    if (route === undefined) {
      throw new Error(
        `ACE registry event ${event.eventId} names unknown exact route ${event.routeId}.`,
      );
    }
    const day = event.implementationDate.slice(0, 10);
    const matches = episodes.filter(
      (episode) =>
        episode.kindKeys.includes("camera_enforcement") &&
        episode.date.precision === "day" &&
        episode.date.start === day &&
        episode.routes.some((candidate) => candidate.routeId === event.routeId),
    );
    if (matches.length > 1) {
      throw new Error(
        `ACE registry event ${event.eventId} ambiguously matches ${matches.length} public episodes.`,
      );
    }
    const componentLabel =
      event.program === "ABLE"
        ? "Automated bus lane enforcement (ABLE)"
        : "Automated camera enforcement (ACE)";
    const aceCitation = registryCitation();
    const matched = matches[0];
    if (matched !== undefined) {
      matched.components = dedupeComponents([
        ...matched.components,
        {
          componentId: componentIdFor(matched.episodeId, event.eventId),
          label: componentLabel,
          detail: null,
        },
      ]);
      if (!matched.citations.some((citation) => citation.citationId === aceCitation.citationId)) {
        matched.citations = [...matched.citations, aceCitation];
      }
      const audit = auditByEpisodeId.get(matched.episodeId);
      if (audit === undefined) throw new Error(`Missing audit for episode ${matched.episodeId}.`);
      audit.sourceEventIds = uniqueStrings([...audit.sourceEventIds, event.eventId]);
      audit.records = dedupeAuditRecords([
        ...audit.records,
        {
          recordId: event.eventId,
          disposition: "supporting",
          note: "Exact route and implementation day match in the ACE registry.",
        },
      ]);
      attachedCount += 1;
      continue;
    }

    const episodeId = episodeIdFor(`ace_registry|${event.eventId}`);
    const episode: MutableEpisode = {
      episodeId,
      title: `Camera enforcement began on the ${route.label}`,
      summary: "",
      date: publicDate(day, "day", null),
      phase: "switched_on",
      lifecycle: "in_place",
      kindKeys: ["camera_enforcement"],
      routes: [
        {
          routeId: route.routeId,
          label: route.label,
          slug: route.slug,
          role: "affected",
        },
      ],
      components: [
        {
          componentId: componentIdFor(episodeId, event.eventId),
          label: componentLabel,
          detail: null,
        },
      ],
      citations: [aceCitation],
      caveat: null,
      finding: null,
    };
    const audit: MutableAudit = {
      episodeId,
      decisionKind: "ace_registry",
      decisionIds: [event.eventId],
      occurrenceId: null,
      sourceEventIds: [event.eventId],
      records: [
        {
          recordId: event.eventId,
          disposition: "included",
          note: "Deterministic exact-route, exact-day ACE registry event.",
        },
      ],
      reviewerNotes: [],
      replacementState: null,
    };
    episodes.push(episode);
    audits.push(audit);
    auditByEpisodeId.set(episodeId, audit);
    mintedCount += 1;
  }
  const coverageEnd =
    registryEvents
      .map((event) => event.implementationMonth)
      .toSorted()
      .at(-1) ?? null;
  return {
    episodes,
    audits,
    registryEvents,
    attachedCount,
    mintedCount,
    coverageEnd,
    registryReleaseId: `ace-registry:${coverageEnd ?? "unknown"}:${registryEvents.length}`,
  };
}

function registryCitation(): PublicEpisodeCitation {
  return {
    citationId: `cite_${episodeIdFor(ACE_SOURCE_ID).slice(3, 11)}`,
    label: "MTA Automated Camera Enforcement routes",
    publisher: "Metropolitan Transportation Authority",
    published: null,
    url: ACE_SOURCE_URL,
  };
}

function buildNetworkSnapshot(
  registryEvents: readonly LocalInterventionEvent[],
): PublicNetworkBuildoutSnapshot {
  const firstYearByRoute = new Map<string, number>();
  for (const event of registryEvents) {
    const year = Number(event.implementationDate.slice(0, 4));
    const current = firstYearByRoute.get(event.routeId);
    if (Number.isFinite(year) && (current === undefined || year < current)) {
      firstYearByRoute.set(event.routeId, year);
    }
  }
  const years = Array.from(
    { length: LAST_BUILDOUT_YEAR - FIRST_BUILDOUT_YEAR + 1 },
    (_, index) => FIRST_BUILDOUT_YEAR + index,
  );
  const cameraSeries = {
    familyKey: "camera_enforcement" as const,
    label: "Camera enforcement",
    routesByYear: years.map(
      (year) => [...firstYearByRoute.values()].filter((firstYear) => firstYear <= year).length,
    ),
  };
  return {
    firstYear: FIRST_BUILDOUT_YEAR,
    lastYear: LAST_BUILDOUT_YEAR,
    lastCompleteYear: 2025,
    partialFinalYear: true,
    coverageEndMonth: "2026-05",
    routeCount: 389,
    // The measured buildout projection reached 293 routes. B44+ is newly
    // admitted by the ACE registry and was the only registry-only route outside
    // that set; the other registry additions were already represented.
    routesWithDocumentedWork: 294,
    series: [
      FIXED_BUILDOUT_SERIES[0],
      cameraSeries,
      FIXED_BUILDOUT_SERIES[1],
      FIXED_BUILDOUT_SERIES[2],
      FIXED_BUILDOUT_SERIES[3],
      FIXED_BUILDOUT_SERIES[4],
    ].map((series) => ({ ...series, routesByYear: [...series.routesByYear] })),
  };
}

function buildProposedPlans(corpus: StudioInterventionCorpus): {
  plans: PublicProposedPlan[];
  changeCount: number;
  planCount: number;
} {
  const groups = new Map<string, StudioInterventionCorpus["records"][number][]>();
  for (const record of corpus.records) {
    if (record.recordKind !== "proposed") continue;
    const group = groups.get(record.sourceId) ?? [];
    group.push(record);
    groups.set(record.sourceId, group);
  }
  const plans = [...groups.entries()]
    .map(([planId, records]): PublicProposedPlan => {
      const first = records[0];
      if (first === undefined) throw new Error(`Empty proposed-plan group ${planId}.`);
      const mixCounts = new Map<string, number>();
      for (const record of records) {
        for (const raw of [...record.primaryTreatments, ...record.customTreatments]) {
          const label = componentLabel(raw, "");
          mixCounts.set(label, (mixCounts.get(label) ?? 0) + 1);
        }
      }
      return {
        planId,
        label: first.sourceLabel,
        url: first.sourceUrl,
        changeCount: records.length,
        routeCount: new Set(records.flatMap((record) => record.routes)).size,
        mix: [...mixCounts.entries()]
          .map(([label, count]) => ({ label, count }))
          .toSorted(
            (left, right) => right.count - left.count || left.label.localeCompare(right.label),
          )
          .slice(0, 4),
      };
    })
    .toSorted(
      (left, right) =>
        right.changeCount - left.changeCount || left.label.localeCompare(right.label),
    );
  return {
    plans,
    changeCount: plans.reduce((total, plan) => total + plan.changeCount, 0),
    planCount: plans.length,
  };
}

function collectWithheld(input: {
  routeEvidence: StudioRouteEvidenceArtifactV2;
  audits: readonly AuditRow[];
  claimedByRoute: ReadonlySet<string>;
  claimedAnywhere: ReadonlySet<string>;
}): WithheldRow[] {
  const reviewedDisposition = new Map<string, AuditRecord>();
  for (const audit of input.audits) {
    for (const record of audit.records) {
      if (record.disposition === "excluded" || record.disposition === "unresolved") {
        reviewedDisposition.set(record.recordId, record);
      }
    }
  }
  const programmeScoped = new Set(PROGRAMME_SCOPED_RECORD_IDS);
  const rows: WithheldRow[] = [];
  for (const routeSlug of REVIEW_ROUTE_SLUGS) {
    const bundle = input.routeEvidence.routes.find(
      (candidate) => candidate.routeSlug === routeSlug,
    );
    if (bundle === undefined) continue;
    for (const record of bundle.timeline) {
      const reviewed = reviewedDisposition.get(record.recordId);
      if (reviewed !== undefined) {
        rows.push({
          recordId: record.recordId,
          routeId: bundle.routeId,
          routeSlug,
          date: record.dateNormalized ?? "",
          precision: record.datePrecision ?? "unknown",
          title: record.title ?? record.recordId,
          reason:
            reviewed.disposition === "excluded"
              ? "reviewed_and_excluded"
              : "unresolved_relationship",
          note: reviewed.note,
        });
        continue;
      }
      if (input.claimedByRoute.has(`${bundle.routeId}|${record.recordId}`)) continue;
      if (programmeScoped.has(record.recordId)) {
        rows.push({
          recordId: record.recordId,
          routeId: bundle.routeId,
          routeSlug,
          date: record.dateNormalized ?? "",
          precision: record.datePrecision ?? "unknown",
          title: record.title ?? record.recordId,
          reason: "programme_scoped",
          note: "Describes a citywide programme, not a change on this route.",
        });
        continue;
      }
      if (input.claimedAnywhere.has(record.recordId)) {
        rows.push({
          recordId: record.recordId,
          routeId: bundle.routeId,
          routeSlug,
          date: record.dateNormalized ?? "",
          precision: record.datePrecision ?? "unknown",
          title: record.title ?? record.recordId,
          reason: "other_route_change",
          note: "Defines a change on another exact route and was projected onto this bundle.",
        });
        continue;
      }
      const undated = record.dateNormalized === null || record.datePrecision === null;
      rows.push({
        recordId: record.recordId,
        routeId: bundle.routeId,
        routeSlug,
        date: record.dateNormalized ?? "",
        precision: record.datePrecision ?? "unknown",
        title: record.title ?? record.recordId,
        reason: undated ? "undated" : "no_reviewed_decision",
        note: undated
          ? "No onset date, so it cannot be placed in a chronology."
          : "No reviewed decision names this record.",
      });
    }
  }
  return rows.toSorted(
    (left, right) =>
      left.routeSlug.localeCompare(right.routeSlug) ||
      left.date.localeCompare(right.date) ||
      left.recordId.localeCompare(right.recordId),
  );
}

function claimedRecordsByRoute(
  episodes: readonly PublicInterventionEpisode[],
  audits: readonly AuditRow[],
): { byRoute: Set<string>; anywhere: Set<string> } {
  const episodeById = new Map(episodes.map((episode) => [episode.episodeId, episode]));
  const byRoute = new Set<string>();
  const anywhere = new Set<string>();
  for (const audit of audits) {
    const episode = episodeById.get(audit.episodeId);
    if (episode === undefined) continue;
    for (const record of audit.records) {
      anywhere.add(record.recordId);
      for (const route of episode.routes) byRoute.add(`${route.routeId}|${record.recordId}`);
    }
  }
  return { byRoute, anywhere };
}

function occurrenceMembers(
  occurrence: OperationalOccurrenceRowV2,
): OperationalOccurrenceTreatmentMemberV2[] {
  return occurrence.treatment.kind === "atomic"
    ? [occurrence.treatment.member]
    : [...occurrence.treatment.members];
}

function routeIdentity(
  routeById: ReadonlyMap<string, RouteIdentity>,
  routeId: string,
): RouteIdentity {
  const route = routeById.get(routeId);
  if (route === undefined) {
    throw new Error(`Approved episode names unknown exact route ${routeId}.`);
  }
  return route;
}

function familyKind(family: string): string {
  return FAMILY_TO_KIND[family] ?? "other";
}

function publicKindLabel(kindKey: string): string {
  return KIND_LABELS[kindKey] ?? "Other work";
}

function occurrencePhase(kindKey: string): ReviewedPhase {
  return kindKey === "camera_enforcement" ? "switched_on" : "changed";
}

function routeRoleForKind(kindKey: string): ReviewedRouteRole {
  return kindKey === "camera_enforcement" ? "affected" : "changed";
}

function attachedRole(
  attached: readonly ReviewedReconciliation[],
  routeId: string,
): ReviewedRouteRole | null {
  for (const decision of attached) {
    const relation = decision.routes.find((candidate) => candidate.routeId === routeId);
    if (relation !== undefined) return relation.role;
  }
  return null;
}

function routeListPhrase(labels: readonly string[], total: number): string {
  if (labels.length === 0) return "network";
  if (total <= 3) {
    const shown = labels.slice(0, 3);
    const last = shown.at(-1) ?? "";
    return shown.length === 1 ? last : `${shown.slice(0, -1).join(", ")} and ${last}`;
  }
  return `${labels.slice(0, 2).join(", ")} and ${total - 2} more routes`;
}

function composeTitle(kindKey: string, labels: readonly string[], total: number): string {
  const compose = TITLE_BY_KIND[kindKey] ?? OTHER_TITLE;
  const phrase = routeListPhrase(labels, total);
  return compose === undefined ? phrase : compose(phrase);
}

function componentIdFor(episodeId: string, recordId: string): string {
  return `${episodeId}-c${episodeIdFor(recordId).slice(3, 9)}`;
}

function componentFor(
  episodeId: string,
  recordId: string,
  fallbackFamily: string,
  treatmentById: ReadonlyMap<
    string,
    StudioRouteEvidenceArtifactV2["routes"][number]["interventions"][number]
  >,
): PublicEpisodeComponent {
  const record = treatmentById.get(recordId);
  const family = record?.treatmentFamily ?? fallbackFamily;
  const label = componentLabel(record?.title ?? record?.treatmentKind ?? recordId, family);
  return {
    componentId: componentIdFor(episodeId, recordId),
    label,
    detail: publicDetail(record?.description ?? null, label),
  };
}

export function componentLabel(rawTitle: string, family: string): string {
  const spaced = rawTitle.replaceAll("_", " ").replace(/\s+/gu, " ").trim();
  const fixed = COMPONENT_LABEL_FIXUPS[spaced.toLowerCase()];
  if (fixed !== undefined) return fixed;
  if (spaced.length === 0 || spaced.length > COMPONENT_LABEL_CAP) {
    return publicKindLabel(familyKind(family));
  }
  const sentence = spaced
    .split(" ")
    .map((word) => (isAcronym(word) ? word : word.toLowerCase()))
    .join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function isAcronym(word: string): boolean {
  return word === word.toUpperCase() && /[A-Z]{2,}/u.test(word);
}

function publicDetail(detail: string | null, label: string): string | null {
  if (detail === null || detail.trim().length === 0) return null;
  if (INTERNAL_VOCABULARY.test(detail)) return null;
  const stem = label.toLowerCase().replace(/s$/u, "");
  if (detail.length < 32 && detail.toLowerCase().includes(stem)) return null;
  return detail;
}

function dedupeComponents(components: readonly PublicEpisodeComponent[]): PublicEpisodeComponent[] {
  const byLabel = new Map<string, PublicEpisodeComponent>();
  for (const component of components) {
    const current = byLabel.get(component.label);
    if (current === undefined || (current.detail === null && component.detail !== null)) {
      byLabel.set(component.label, component);
    }
  }
  return [...byLabel.values()];
}

function reconciliationAuditRecords(decision: ReviewedReconciliation): AuditRecord[] {
  return [
    ...decision.includedRecordIds.map((recordId) => ({
      recordId,
      disposition: "included" as const,
      note: "Names the change in the reviewed decision.",
    })),
    ...decision.supportingRecordIds.map((recordId) => ({
      recordId,
      disposition: "supporting" as const,
      note: "Reviewed as the same change, restated by another source.",
    })),
    ...decision.componentRecordIds.map((recordId) => ({
      recordId,
      disposition: "included" as const,
      note: "Reviewed component of the change.",
    })),
    ...decision.routes.flatMap((relation) =>
      relation.recordIds.map((recordId) => ({
        recordId,
        disposition: "included" as const,
        note: `Establishes the ${relation.routeId} relationship.`,
      })),
    ),
    ...decision.excludedRecords.map((record) => ({
      recordId: record.recordId,
      disposition: "excluded" as const,
      note: record.note,
    })),
    ...decision.unresolvedRecords.map((record) => ({
      recordId: record.recordId,
      disposition: "unresolved" as const,
      note: record.note,
    })),
  ];
}

function dedupeAuditRecords(records: readonly AuditRecord[]): AuditRecord[] {
  const rank: Record<AuditRecord["disposition"], number> = {
    included: 0,
    supporting: 1,
    excluded: 2,
    unresolved: 3,
  };
  const byId = new Map<string, AuditRecord>();
  for (const record of records) {
    const current = byId.get(record.recordId);
    if (current === undefined || rank[record.disposition] < rank[current.disposition]) {
      byId.set(record.recordId, record);
    }
  }
  return [...byId.values()].toSorted(
    (left, right) =>
      rank[left.disposition] - rank[right.disposition] ||
      left.recordId.localeCompare(right.recordId),
  );
}

function citationFor(
  sourceId: string,
  citationBySourceId: ReadonlyMap<
    string,
    StudioRouteEvidenceArtifactV2["routes"][number]["citations"][number]
  >,
): PublicEpisodeCitation | null {
  const citation = citationBySourceId.get(sourceId);
  if (citation === undefined) return null;
  return {
    citationId: `cite_${episodeIdFor(sourceId).slice(3, 11)}`,
    label: citation.sourceTitle ?? sourceId.replaceAll("_", " "),
    publisher: citation.publisher ?? null,
    published: citation.publishedDate ?? null,
    url: citation.sourceUrl ?? null,
  };
}

function findingFor(
  eventKey: string | null | undefined,
  studiesByEventKey: ReadonlyMap<string, StudyIndexArtifact["studies"][number]>,
): PublicEpisodeFinding | null {
  if (eventKey === null || eventKey === undefined) return null;
  const study = studiesByEventKey.get(eventKey);
  if (study === undefined) return null;
  const headline =
    study.direction === "improved"
      ? "Speeds rose"
      : study.direction === "worsened"
        ? "Speeds fell"
        : "No clear change";
  return {
    headline,
    comparison:
      study.evaluationLevel === "segment_matched_did"
        ? "Compared with matched control segments."
        : "Before and after this change, without a control comparison.",
    caveat:
      study.evaluationLevel === "segment_matched_did"
        ? null
        : "A before-and-after reading cannot separate this change from anything else happening at the time.",
  };
}

function publicDate(
  value: string,
  precision: string,
  explicitEnd: string | null,
): PublicEpisodeDate {
  if (precision === "range" && explicitEnd !== null) {
    return {
      precision: "range",
      start: value,
      end: explicitEnd,
      display: rangeDisplay(value, explicitEnd),
      raw: `${value}/${explicitEnd}`,
    };
  }
  if (precision === "season") {
    const [year = "", season = ""] = value.split("-");
    const ranges: Readonly<Record<string, readonly [string, string, string]>> = {
      spring: ["03-01", "05-31", "Spring"],
      summer: ["06-01", "08-31", "Summer"],
      fall: ["09-01", "11-30", "Fall"],
      winter: ["12-01", "02-28", "Winter"],
    };
    const range = ranges[season];
    if (range !== undefined && /^\d{4}$/u.test(year)) {
      const endYear = season === "winter" ? String(Number(year) + 1) : year;
      return {
        precision: "season",
        start: `${year}-${range[0]}`,
        end: `${endYear}-${range[1]}`,
        display: `${range[2]} ${year}`,
        raw: value,
      };
    }
  }
  if (precision === "day" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return {
      precision: "day",
      start: value,
      end: value,
      display: dayDisplay(value),
      raw: value,
    };
  }
  if (precision === "month" && /^\d{4}-\d{2}$/u.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      precision: "month",
      start: `${value}-01`,
      end: `${value}-${String(lastDay).padStart(2, "0")}`,
      display: `${MONTHS[month - 1] ?? ""} ${year}`,
      raw: value,
    };
  }
  if (precision === "year" && /^\d{4}$/u.test(value)) {
    return {
      precision: "year",
      start: `${value}-01-01`,
      end: `${value}-12-31`,
      display: value,
      raw: value,
    };
  }
  return {
    precision: "unknown",
    start: "",
    end: "",
    display: "Date not documented",
    raw: value,
  };
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function dayDisplay(value: string): string {
  const year = value.slice(0, 4);
  const month = MONTHS[Number(value.slice(5, 7)) - 1] ?? "";
  const day = String(Number(value.slice(8, 10)));
  return `${month} ${day}, ${year}`;
}

function rangeDisplay(start: string, end: string): string {
  const startYear = start.slice(0, 4);
  const endYear = end.slice(0, 4);
  const startMonth = MONTHS[Number(start.slice(5, 7)) - 1] ?? "";
  const endMonth = MONTHS[Number(end.slice(5, 7)) - 1] ?? "";
  if (startYear === endYear) {
    return startMonth === endMonth
      ? `${startMonth} ${startYear}`
      : `${startMonth} to ${endMonth} ${startYear}`;
  }
  return `${startMonth} ${startYear} to ${endMonth} ${endYear}`;
}

function compareEpisodesNewestFirst(
  left: PublicInterventionEpisode,
  right: PublicInterventionEpisode,
): number {
  const leftKey = left.date.precision === "unknown" ? "" : left.date.start;
  const rightKey = right.date.precision === "unknown" ? "" : right.date.start;
  return rightKey.localeCompare(leftKey) || left.title.localeCompare(right.title);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
