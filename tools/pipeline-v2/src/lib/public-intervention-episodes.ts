import { createHash } from "node:crypto";
import type { LocalInterventionEvent } from "@bp/db/local";
import type { StudioInterventionCorpus } from "@bp/domain/studio";
import {
  type PublicEpisodeResolutionAuditArtifact,
  PublicEpisodeResolutionAuditArtifactSchema,
} from "@bp/domain/studio/public-intervention-episode-audit";
import {
  type PublicEpisodeCitation,
  type PublicEpisodeDate,
  type PublicEpisodeFinding,
  type PublicEpisodeRoute,
  type PublicInterventionEpisode,
  type PublicInterventionEpisodesArtifact,
  PublicInterventionEpisodesArtifactSchema,
  type PublicNetworkBuildoutSnapshot,
  type PublicProducerInterventionEpisode,
  type PublicProposedPlan,
  type PublicRouteInterventionHistoryArtifact,
  PublicRouteInterventionHistoryArtifactSchema,
  type PublicTrackerEnrichmentEpisode,
} from "@bp/domain/studio/public-intervention-episodes";
import type {
  ResolvedTransitPublicComponent,
  ResolvedTransitPublicOnset,
  TrackerConformanceAcceptedDiffRow,
} from "@bp/domain/studio/resolved-transit-public-pack";
import type { StudyIndexArtifact } from "@bp/domain/studio/study";
import type { ResolvedTransitPublicPackImport } from "./resolved-transit-public-pack.ts";
import { RESOLVED_TRANSIT_RELEASE_PIN } from "./resolved-transit-release-pin.ts";
import { decodeSchemaStrict } from "./schema-decode.ts";

export const PUBLIC_INTERVENTION_BUILDER_VERSION = "resolved-transit-candidate-v2" as const;

export type PublicEpisodeBuildInput = {
  imported: ResolvedTransitPublicPackImport;
  corpus: StudioInterventionCorpus;
  studies: StudyIndexArtifact;
  registryEvents: readonly LocalInterventionEvent[];
  sourceHashes: {
    corpusArtifact: string;
    studyIndexArtifact: string;
    aceRegistry: string;
  };
};

export type PublicEpisodeBuildOutput = {
  candidateId: string;
  normalizedPackSha256: string;
  publicArtifact: PublicInterventionEpisodesArtifact;
  routeArtifacts: readonly PublicRouteInterventionHistoryArtifact[];
  auditArtifact: PublicEpisodeResolutionAuditArtifact;
};

type RouteIdentity = {
  routeKey: string;
  routeId: string;
  slug: string;
  label: string;
  corridor: string | null;
};

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

export function buildPublicInterventionEpisodes(
  input: PublicEpisodeBuildInput,
): PublicEpisodeBuildOutput {
  const { pack, conformance, verified } = input.imported;
  const normalizedPackSha256 = sha256Canonical(pack);
  const candidateId = sha256Canonical({
    builderVersion: PUBLIC_INTERVENTION_BUILDER_VERSION,
    producerReleaseId: RESOLVED_TRANSIT_RELEASE_PIN.releaseId,
    producerReleaseManifestSha256: verified.releaseManifestSha256,
    producerPublicManifestSha256: verified.publicManifestSha256,
    normalizedPackSha256,
    acceptedDiffLedgerSha256: verified.acceptedDiffLedgerSha256,
    acceptedLedgerReceiptSha256: verified.acceptedLedgerReceiptSha256,
    aceRegistrySha256: input.sourceHashes.aceRegistry,
    studyIndexSha256: input.sourceHashes.studyIndexArtifact,
    corpusSha256: input.sourceHashes.corpusArtifact,
  });

  const routeByKey = new Map<string, RouteIdentity>(
    pack.routes.map((route) => [
      route.route_key,
      {
        routeKey: route.route_key,
        routeId: route.gtfs_route_id,
        slug: route.route_key,
        label: route.display_name,
        corridor: null,
      },
    ]),
  );
  const familyByKey = new Map(
    pack.treatment_families.map((family) => [family.treatment_family_key, family]),
  );
  const sourceByKey = new Map(pack.sources.map((source) => [source.source_key, source]));
  const componentsByEpisode = groupBy(pack.components, (row) => row.intervention_id);
  const placementsByComponent = groupBy(
    pack.placements.filter((placement) => placement.founding_intervention_component_key !== null),
    (placement) => placement.founding_intervention_component_key ?? "",
  );
  const currentByPlacement = new Map(
    pack.current_footprint.map((current) => [current.placement_key, current]),
  );
  const studiesByEventKey = new Map(input.studies.studies.map((study) => [study.eventKey, study]));
  const conformanceByProducerId = new Map<string, TrackerConformanceAcceptedDiffRow[]>();
  for (const row of conformance.acceptedDiff) {
    for (const producerId of row.producer_intervention_ids) {
      const rows = conformanceByProducerId.get(producerId) ?? [];
      rows.push(row);
      conformanceByProducerId.set(producerId, rows);
    }
  }

  const producerEpisodes = pack.episodes.map((episode): PublicProducerInterventionEpisode => {
    const components = componentsByEpisode.get(episode.intervention_id) ?? [];
    if (components.length === 0) {
      throw new Error(`${episode.intervention_id}: producer episode has no components`);
    }
    const citations = citationsFor(
      uniqueStrings([
        ...episode.source_refs.map((ref) => ref.source_key),
        ...components.flatMap((component) => component.source_refs.map((ref) => ref.source_key)),
      ]),
      sourceByKey,
    );
    const conformanceRows = conformanceByProducerId.get(episode.intervention_id) ?? [];
    const finding = findingFor(
      uniqueStrings(conformanceRows.flatMap((row) => row.origin_ids)),
      studiesByEventKey,
    );
    return {
      authority: "producer",
      episodeId: episode.intervention_id,
      aliases: [...episode.aliases],
      title: episode.display_name,
      summary: "",
      date: publicDate(episode.onset),
      routes: episode.route_keys.map((key) => publicRoute(routeIdentity(routeByKey, key))),
      treatmentFamilies: episode.treatment_family_keys.map((key) => {
        const family = familyByKey.get(key);
        if (family === undefined)
          throw new Error(`${episode.intervention_id}: unknown family ${key}`);
        return { treatmentFamilyKey: key, label: family.display_name };
      }),
      components: components.map((component) => producerComponent(component)),
      placements: components.flatMap((component) =>
        (placementsByComponent.get(component.intervention_component_key) ?? []).map((placement) => {
          const current = currentByPlacement.get(placement.placement_key);
          return {
            placementKey: placement.placement_key,
            foundingComponentId: placement.founding_intervention_component_key,
            routeKey: placement.route_key,
            treatmentFamilyKey: placement.treatment_family_key,
            scope: { kind: placement.scope.kind },
            stateAsOf: placement.state_as_of,
            asOfDate: placement.as_of_date,
            confirmedCurrent:
              current === undefined
                ? null
                : { state: "confirmed_active" as const, asOfDate: current.as_of_date },
          };
        }),
      ),
      citations,
      caveat: null,
      finding,
    };
  });

  const enrichmentRows = conformance.acceptedDiff.filter(
    (row) => row.consumer_disposition === "enrichment_only",
  );
  const acceptedAceOriginIds = new Set(
    conformance.acceptedDiff.flatMap((row) =>
      row.origin_ids.filter((originId) => originId.startsWith("ace:")),
    ),
  );
  const registryById = new Map(
    input.registryEvents
      .filter((event) => event.sourceId === ACE_SOURCE_ID)
      .map((event) => [event.eventId, event]),
  );
  assertExactSet(registryById.keys(), acceptedAceOriginIds, "accepted ACE event coverage");

  const trackerEpisodes = enrichmentRows.map((row): PublicTrackerEnrichmentEpisode => {
    if (row.tracker_episode_id === null || row.tracker_date === null) {
      throw new Error("Tracker enrichment is missing its accepted identity/date");
    }
    const events = row.origin_ids.map((originId) => {
      const event = registryById.get(originId);
      if (event === undefined)
        throw new Error(`${row.tracker_episode_id}: missing ACE event ${originId}`);
      return event;
    });
    if (events.length === 0)
      throw new Error(`${row.tracker_episode_id}: enrichment has no ACE event`);
    if (events.some((event) => event.implementationDate.slice(0, 10) !== row.tracker_date?.value)) {
      throw new Error(`${row.tracker_episode_id}: ACE date differs from accepted ledger`);
    }
    const routes = row.tracker_route_keys.map((routeKey, index) => {
      const routeId = row.tracker_route_ids[index];
      if (routeId === undefined) {
        throw new Error(`${row.tracker_episode_id}: route id/key cardinality mismatch`);
      }
      const existing = routeByKey.get(routeKey);
      if (existing !== undefined && existing.routeId !== routeId) {
        throw new Error(
          `${row.tracker_episode_id}: Tracker route identity conflicts with producer`,
        );
      }
      const identity =
        existing ??
        ({
          routeKey,
          routeId,
          slug: routeKey,
          label: routeId,
          corridor: null,
        } satisfies RouteIdentity);
      routeByKey.set(routeKey, identity);
      return publicRoute(identity);
    });
    const routePhrase = routes.map((route) => route.label).join(" and ");
    return {
      authority: "tracker_enrichment",
      episodeId: row.tracker_episode_id,
      title: `Automated camera enforcement on ${routePhrase}`,
      summary: "Tracker-owned MTA camera-enforcement registry event.",
      date: publicTrackerDate(row.tracker_date),
      routes,
      treatmentFamilies: [
        {
          treatmentFamilyKey: "automated-bus-lane-enforcement",
          label: "Automated bus lane enforcement",
        },
      ],
      components: events.map((event) => ({
        authority: "tracker_enrichment" as const,
        componentId: event.eventId,
        label:
          event.program === "ABLE"
            ? "Automated bus lane enforcement (ABLE)"
            : "Automated camera enforcement (ACE)",
        detail: event.description.length > 0 ? event.description : null,
      })),
      citations: [registryCitation()],
      caveat: null,
      finding: findingFor(row.origin_ids, studiesByEventKey),
      lineage: {
        sourceId: ACE_SOURCE_ID,
        originIds: [...row.origin_ids],
        sourceEventIds: events.map((event) => event.eventId).toSorted(),
      },
    };
  });

  const episodes: PublicInterventionEpisode[] = [...producerEpisodes, ...trackerEpisodes].toSorted(
    compareEpisodesNewestFirst,
  );
  const candidate = {
    candidateId,
    builderVersion: PUBLIC_INTERVENTION_BUILDER_VERSION,
    producer: {
      releaseId: RESOLVED_TRANSIT_RELEASE_PIN.releaseId,
      tagTarget: RESOLVED_TRANSIT_RELEASE_PIN.tagTarget,
      generatorCommit: RESOLVED_TRANSIT_RELEASE_PIN.generatorCommit,
      buildId: RESOLVED_TRANSIT_RELEASE_PIN.buildId,
      asOfDate: RESOLVED_TRANSIT_RELEASE_PIN.asOfDate,
      releaseManifestSha256: verified.releaseManifestSha256,
      publicManifestSha256: verified.publicManifestSha256,
    },
    trackerEnrichment: {
      aceRegistrySha256: input.sourceHashes.aceRegistry,
      aceEventCount: registryById.size,
      studyIndexSha256: input.sourceHashes.studyIndexArtifact,
      editorialCorpusSha256: input.sourceHashes.corpusArtifact,
    },
  } as const;
  const proposedPlans = buildProposedPlans(input.corpus);
  const publicArtifact = decodeSchemaStrict(PublicInterventionEpisodesArtifactSchema, {
    artifactKind: "bp.studio.public_intervention_episodes.v2",
    schemaVersion: 2,
    candidate,
    networkBuildout: buildNetworkSnapshot(input.registryEvents, input.sourceHashes.aceRegistry),
    proposedPlans: {
      authority: "tracker_editorial",
      inputSha256: input.sourceHashes.corpusArtifact,
      ...proposedPlans,
    },
    episodes,
  });

  const routeArtifacts = [...routeByKey.values()]
    .map((route): PublicRouteInterventionHistoryArtifact | null => {
      const routeEpisodes = episodes.filter((episode) =>
        episode.routes.some((candidateRoute) => candidateRoute.routeKey === route.routeKey),
      );
      if (routeEpisodes.length === 0) return null;
      return decodeSchemaStrict(PublicRouteInterventionHistoryArtifactSchema, {
        artifactKind: "bp.studio.route_intervention_history.v2",
        schemaVersion: 2,
        candidateId,
        producerAsOfDate: RESOLVED_TRANSIT_RELEASE_PIN.asOfDate,
        route,
        episodes: routeEpisodes,
      });
    })
    .filter((artifact): artifact is PublicRouteInterventionHistoryArtifact => artifact !== null)
    .toSorted((left, right) => left.route.routeKey.localeCompare(right.route.routeKey));

  const membershipCount = routeArtifacts.reduce(
    (count, artifact) => count + artifact.episodes.length,
    0,
  );
  if (
    episodes.length !== conformance.targetComposition.episodeCount ||
    routeArtifacts.length !== conformance.targetComposition.routeArtifactCount ||
    membershipCount !== conformance.targetComposition.episodeRouteMembershipCount
  ) {
    throw new Error("candidate composition differs from the accepted conformance target");
  }
  assertGlobalRouteIdentity(episodes, routeArtifacts);

  const exclusions = conformance.acceptedDiff.filter(
    (row) => row.consumer_disposition === "drop_legacy_episode",
  );
  const auditArtifact = decodeSchemaStrict(PublicEpisodeResolutionAuditArtifactSchema, {
    artifactKind: "bp.quality.intervention_episode_resolution.v2",
    schemaVersion: 2,
    candidateId,
    producer: {
      releaseId: RESOLVED_TRANSIT_RELEASE_PIN.releaseId,
      asOfDate: RESOLVED_TRANSIT_RELEASE_PIN.asOfDate,
      releaseManifestSha256: verified.releaseManifestSha256,
      publicManifestSha256: verified.publicManifestSha256,
    },
    conformance: {
      acceptedLedgerSha256: verified.acceptedDiffLedgerSha256,
      acceptedReceiptSha256: verified.acceptedLedgerReceiptSha256,
      trackerBaselineEpisodeCount: conformance.trackerBaseline.length,
      useProducerIdentityCount: conformance.dispositionCounts.useProducerIdentity,
      trackerEnrichmentOnlyCount: conformance.dispositionCounts.trackerEnrichmentOnly,
      dropLegacyEpisodeCount: conformance.dispositionCounts.dropLegacyEpisode,
      addProducerEpisodeCount: conformance.dispositionCounts.addProducerEpisode,
      unexplainedDispositionCount: 0,
    },
    candidate: {
      episodeCount: episodes.length,
      producerEpisodeCount: producerEpisodes.length,
      trackerEnrichmentEpisodeCount: trackerEpisodes.length,
      routeArtifactCount: routeArtifacts.length,
      episodeRouteMembershipCount: membershipCount,
    },
    enrichments: trackerEpisodes.map((episode) => ({
      episodeId: episode.episodeId,
      originIds: [...episode.lineage.originIds],
      sourceEventIds: [...episode.lineage.sourceEventIds],
      routeKeys: episode.routes.map((route) => route.routeKey),
    })),
    exclusions: exclusions.map((row) => {
      if (row.tracker_episode_id === null) throw new Error("exclusion lacks Tracker episode id");
      return {
        trackerEpisodeId: row.tracker_episode_id,
        originIds: [...row.origin_ids],
        reasonCode: row.reason_code,
      };
    }),
  });

  return { candidateId, normalizedPackSha256, publicArtifact, routeArtifacts, auditArtifact };
}

function producerComponent(component: ResolvedTransitPublicComponent) {
  return {
    authority: "producer" as const,
    componentId: component.intervention_component_key,
    routeKey: component.route_key,
    gtfsRouteId: component.gtfs_route_id,
    treatmentFamilyKey: component.treatment_family_key,
    treatmentFamilyLabel: component.treatment_family_label,
    applicability: component.applicability,
    action: component.action,
    actionLabel: component.action_label,
    extent: {
      kind: component.extent.kind,
      label: component.extent.label,
      description: component.extent.description,
    },
    details: component.details,
    caveats: [...component.caveats],
  };
}

function citationsFor(
  sourceKeys: readonly string[],
  sourceByKey: ReadonlyMap<string, ResolvedTransitPublicPackImport["pack"]["sources"][number]>,
): PublicEpisodeCitation[] {
  return sourceKeys.map((sourceKey) => {
    const source = sourceByKey.get(sourceKey);
    if (source === undefined) throw new Error(`Missing public source ${sourceKey}`);
    return {
      citationId: source.source_key,
      label: source.title,
      publisher: source.publisher,
      published: source.date,
      url: source.url,
      urlStatus: source.url_status,
    };
  });
}

function registryCitation(): PublicEpisodeCitation {
  return {
    citationId: "mta-ace-routes",
    label: "MTA Automated Camera Enforcement routes",
    publisher: "Metropolitan Transportation Authority",
    published: null,
    url: ACE_SOURCE_URL,
    urlStatus: "source_provided",
  };
}

function findingFor(
  originIds: readonly string[],
  studiesByEventKey: ReadonlyMap<string, StudyIndexArtifact["studies"][number]>,
): PublicEpisodeFinding | null {
  const match = originIds
    .map((originId) => studiesByEventKey.get(originId))
    .find((study) => study !== undefined);
  if (match === undefined) return null;
  const headline =
    match.direction === "improved"
      ? "Speeds rose"
      : match.direction === "worsened"
        ? "Speeds fell"
        : "No clear change";
  return {
    authority: "tracker_study",
    headline,
    comparison:
      match.evaluationLevel === "segment_matched_did"
        ? "Compared with matched control segments."
        : "Before and after this change, without a control comparison.",
    caveat:
      match.evaluationLevel === "segment_matched_did"
        ? null
        : "A before-and-after reading cannot separate this change from other changes at the time.",
    sourceEventKey: match.eventKey,
  };
}

function publicRoute(route: RouteIdentity): PublicEpisodeRoute {
  return {
    routeKey: route.routeKey,
    routeId: route.routeId,
    label: route.label,
    slug: route.slug,
  };
}

function routeIdentity(
  routeByKey: ReadonlyMap<string, RouteIdentity>,
  routeKey: string,
): RouteIdentity {
  const route = routeByKey.get(routeKey);
  if (route === undefined) throw new Error(`Unknown exact public route key ${routeKey}`);
  return route;
}

function publicDate(onset: ResolvedTransitPublicOnset): PublicEpisodeDate {
  return publicDateValue(onset.date, onset.precision);
}

function publicTrackerDate(input: {
  value: string;
  precision: "day" | "month" | "range" | "season";
}): PublicEpisodeDate {
  return publicDateValue(input.value, input.precision);
}

function publicDateValue(
  value: string,
  precision: PublicEpisodeDate["precision"],
): PublicEpisodeDate {
  if (precision === "day") {
    return {
      precision,
      value,
      display: dayDisplay(value),
      intervalStart: value,
      intervalEnd: value,
    };
  }
  if (precision === "upper_bound_day") {
    return {
      precision,
      value,
      display: `By ${dayDisplay(value)}`,
      intervalStart: null,
      intervalEnd: value,
    };
  }
  if (precision === "month") {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      precision,
      value,
      display: `${MONTHS[month - 1] ?? ""} ${year}`,
      intervalStart: `${value}-01`,
      intervalEnd: `${value}-${String(lastDay).padStart(2, "0")}`,
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
    if (range !== undefined) {
      const endYear = season === "winter" ? String(Number(year) + 1) : year;
      return {
        precision,
        value,
        display: `${range[2]} ${year}`,
        intervalStart: `${year}-${range[0]}`,
        intervalEnd: `${endYear}-${range[1]}`,
      };
    }
  }
  if (precision === "year") {
    return {
      precision,
      value,
      display: value,
      intervalStart: `${value}-01-01`,
      intervalEnd: `${value}-12-31`,
    };
  }
  return {
    precision,
    value,
    display: `Date range beginning ${value}`,
    intervalStart: null,
    intervalEnd: null,
  };
}

function buildNetworkSnapshot(
  registryEvents: readonly LocalInterventionEvent[],
  inputSha256: string,
): PublicNetworkBuildoutSnapshot {
  const firstYearByRoute = new Map<string, number>();
  for (const event of registryEvents.filter((row) => row.sourceId === ACE_SOURCE_ID)) {
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
    authority: "tracker_presentation",
    firstYear: FIRST_BUILDOUT_YEAR,
    lastYear: LAST_BUILDOUT_YEAR,
    lastCompleteYear: 2025,
    partialFinalYear: true,
    coverageEndMonth: "2026-05",
    routeCount: 389,
    routesWithDocumentedWork: 294,
    series: [
      FIXED_BUILDOUT_SERIES[0],
      cameraSeries,
      FIXED_BUILDOUT_SERIES[1],
      FIXED_BUILDOUT_SERIES[2],
      FIXED_BUILDOUT_SERIES[3],
      FIXED_BUILDOUT_SERIES[4],
    ].map((series) => ({ ...series, routesByYear: [...series.routesByYear] })),
    inputSha256,
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
      if (first === undefined) throw new Error(`Empty proposed-plan group ${planId}`);
      const mixCounts = new Map<string, number>();
      for (const record of records) {
        for (const raw of [...record.primaryTreatments, ...record.customTreatments]) {
          const label = editorialTreatmentLabel(raw);
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

function editorialTreatmentLabel(value: string): string {
  const text = value.replaceAll("_", " ").replace(/\s+/gu, " ").trim();
  if (text.length === 0) return "Other proposed change";
  return `${text.charAt(0).toUpperCase()}${text.slice(1).toLowerCase()}`;
}

function compareEpisodesNewestFirst(
  left: PublicInterventionEpisode,
  right: PublicInterventionEpisode,
): number {
  const leftKey = left.date.intervalStart ?? left.date.intervalEnd ?? "";
  const rightKey = right.date.intervalStart ?? right.date.intervalEnd ?? "";
  return rightKey.localeCompare(leftKey) || left.title.localeCompare(right.title);
}

function assertGlobalRouteIdentity(
  episodes: readonly PublicInterventionEpisode[],
  routeArtifacts: readonly PublicRouteInterventionHistoryArtifact[],
): void {
  const globalById = new Map(episodes.map((episode) => [episode.episodeId, episode]));
  for (const routeArtifact of routeArtifacts) {
    for (const episode of routeArtifact.episodes) {
      const global = globalById.get(episode.episodeId);
      if (global === undefined || canonicalJson(global) !== canonicalJson(episode)) {
        throw new Error(`${routeArtifact.route.routeKey}: global/route episode projection drift`);
      }
    }
  }
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    const group = groups.get(value) ?? [];
    group.push(row);
    groups.set(value, group);
  }
  return groups;
}

function assertExactSet(actual: Iterable<string>, expected: Iterable<string>, label: string): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label}: exact set mismatch`);
  }
}

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted();
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
