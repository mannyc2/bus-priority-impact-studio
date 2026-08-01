import { describe, expect, test } from "bun:test";
import { decodeStrict } from "../src/decode.ts";
import {
  PublicInterventionEpisodesArtifactSchema,
  PublicRouteInterventionHistoryArtifactSchema,
  publicInterventionEpisodesCandidateKey,
  publicInterventionEpisodesKey,
  publicRouteInterventionHistoryCandidateKey,
  publicRouteInterventionHistoryKey,
} from "../src/studio/public-intervention-episodes.ts";

const candidate = {
  candidateId: "a".repeat(64),
  builderVersion: "resolved-transit-candidate-v2",
  producer: {
    releaseId: "resolved-pack-v1-production",
    tagTarget: "b".repeat(40),
    generatorCommit: "c".repeat(40),
    buildId: "d".repeat(64),
    asOfDate: "2026-07-27",
    releaseManifestSha256: "e".repeat(64),
    publicManifestSha256: "f".repeat(64),
  },
  trackerEnrichment: {
    aceRegistrySha256: "3".repeat(64),
    aceEventCount: 1,
    studyIndexSha256: "4".repeat(64),
    editorialCorpusSha256: "5".repeat(64),
  },
} as const;

const producerEpisode = {
  authority: "producer",
  episodeId: "occurrence:aaaaaaaaaaaaaaaaaaaaaaaa",
  aliases: [],
  title: "Reviewed B44 change",
  summary: "",
  date: {
    precision: "month",
    value: "2024-09",
    display: "September 2024",
    intervalStart: "2024-09-01",
    intervalEnd: "2024-09-30",
  },
  routes: [{ routeKey: "b44-sbs", routeId: "B44+", label: "B44 SBS", slug: "b44-sbs" }],
  treatmentFamilies: [{ treatmentFamilyKey: "service-pattern", label: "Service pattern" }],
  components: [
    {
      authority: "producer",
      componentId: "b44-sbs-service-pattern-component",
      routeKey: "b44-sbs",
      gtfsRouteId: "B44+",
      treatmentFamilyKey: "service-pattern",
      treatmentFamilyLabel: "Service pattern",
      applicability: "applies",
      action: "unknown",
      actionLabel: "Action not established",
      extent: {
        kind: "unknown",
        label: "Exact extent not established",
        description: null,
      },
      details: "Reviewed service-pattern change",
      caveats: ["The reviewed source does not establish action or extent."],
    },
  ],
  placements: [
    {
      placementKey: "b44-sbs-service-pattern-placement",
      foundingComponentId: "b44-sbs-service-pattern-component",
      routeKey: "b44-sbs",
      treatmentFamilyKey: "service-pattern",
      scope: { kind: "unknown" },
      stateAsOf: "last_confirmed_active",
      asOfDate: "2026-07-27",
      confirmedCurrent: null,
    },
  ],
  citations: [
    {
      citationId: "reviewed-source",
      label: "Reviewed source",
      publisher: "MTA",
      published: "2024-09",
      url: "https://example.com/source",
      urlStatus: "source_provided",
    },
  ],
  caveat: null,
  finding: null,
} as const;

const trackerEpisode = {
  authority: "tracker_enrichment",
  episodeId: "ep_0162fc3e1ab1f2fa",
  title: "Automated camera enforcement on BX12+",
  summary: "Tracker-owned MTA camera-enforcement registry event.",
  date: {
    precision: "day",
    value: "2022-11-18",
    display: "November 18, 2022",
    intervalStart: "2022-11-18",
    intervalEnd: "2022-11-18",
  },
  routes: [{ routeKey: "bx12-sbs", routeId: "BX12+", label: "BX12+", slug: "bx12-sbs" }],
  treatmentFamilies: [
    {
      treatmentFamilyKey: "automated-bus-lane-enforcement",
      label: "Automated bus lane enforcement",
    },
  ],
  components: [
    {
      authority: "tracker_enrichment",
      componentId: "ace:BX12+:ABLE:2022-11-18",
      label: "Automated bus lane enforcement (ABLE)",
      detail: null,
    },
  ],
  citations: [
    {
      citationId: "mta-ace-routes",
      label: "MTA Automated Camera Enforcement routes",
      publisher: "Metropolitan Transportation Authority",
      published: null,
      url: "https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement",
      urlStatus: "source_provided",
    },
  ],
  caveat: null,
  finding: null,
  lineage: {
    sourceId: "mta_ace_routes",
    originIds: ["ace:BX12+:ABLE:2022-11-18"],
    sourceEventIds: ["ace:BX12+:ABLE:2022-11-18"],
  },
} as const;

function artifactValue() {
  return {
    artifactKind: "bp.studio.public_intervention_episodes.v2",
    schemaVersion: 2,
    candidate,
    networkBuildout: {
      authority: "tracker_presentation",
      firstYear: 2024,
      lastYear: 2024,
      lastCompleteYear: 2024,
      partialFinalYear: false,
      coverageEndMonth: "2024-12",
      routeCount: 2,
      routesWithDocumentedWork: 2,
      series: [{ familyKey: "camera_enforcement", label: "Camera enforcement", routesByYear: [1] }],
      inputSha256: "6".repeat(64),
    },
    proposedPlans: {
      authority: "tracker_editorial",
      inputSha256: "7".repeat(64),
      plans: [],
      changeCount: 0,
      planCount: 0,
    },
    episodes: [producerEpisode, trackerEpisode],
  } as const;
}

describe("public intervention episode v2 schemas", () => {
  test("decode the authority-tagged global and route artifacts", () => {
    const network = decodeStrict(PublicInterventionEpisodesArtifactSchema)(artifactValue());
    const route = decodeStrict(PublicRouteInterventionHistoryArtifactSchema)({
      artifactKind: "bp.studio.route_intervention_history.v2",
      schemaVersion: 2,
      candidateId: candidate.candidateId,
      producerAsOfDate: candidate.producer.asOfDate,
      route: {
        routeKey: "b44-sbs",
        routeId: "B44+",
        slug: "b44-sbs",
        label: "B44 SBS",
        corridor: null,
      },
      episodes: [network.episodes[0]],
    });
    expect(route.episodes[0]).toEqual(network.episodes[0]);
    expect(network.episodes[0]?.authority).toBe("producer");
    expect(network.episodes[1]?.authority).toBe("tracker_enrichment");
  });

  test("keeps unknown semantics and last-confirmed state non-current", () => {
    const artifact = decodeStrict(PublicInterventionEpisodesArtifactSchema)(artifactValue());
    const episode = artifact.episodes[0];
    if (episode?.authority !== "producer") throw new Error("missing producer episode");
    expect(episode.components[0]?.action).toBe("unknown");
    expect(episode.components[0]?.extent.kind).toBe("unknown");
    expect(episode.placements[0]?.stateAsOf).toBe("last_confirmed_active");
    expect(episode.placements[0]?.confirmedCurrent).toBeNull();
  });

  test("does not let a Tracker enrichment carry producer-owned fields", () => {
    const value = structuredClone(artifactValue());
    const enrichment = value.episodes[1];
    if (enrichment === undefined) throw new Error("fixture needs a Tracker enrichment");
    Object.assign(enrichment, { placements: [] });
    expect(() => decodeStrict(PublicInterventionEpisodesArtifactSchema)(value)).toThrow();
  });

  test("keeps operator conformance fields out of the public candidate envelope", () => {
    const serialized = JSON.stringify(
      decodeStrict(PublicInterventionEpisodesArtifactSchema)(artifactValue()),
    );
    expect(serialized).not.toContain("acceptedLedger");
    expect(serialized).not.toContain("acceptedReceipt");
    expect(serialized).not.toContain("publishedAt");
    expect(serialized).not.toContain("activatedAt");
    expect(serialized).not.toContain("/fixture/");
  });

  test("separates future logical keys from candidate-scoped physical keys", () => {
    expect(publicInterventionEpisodesKey()).toBe("studio/v2/interventions/public-episodes-v2.json");
    expect(publicRouteInterventionHistoryKey("b44-sbs")).toBe(
      "studio/v2/routes/b44-sbs/intervention-history-v2.json",
    );
    expect(publicInterventionEpisodesCandidateKey(candidate.candidateId)).toContain(
      `/candidates/${candidate.candidateId}/`,
    );
    expect(publicRouteInterventionHistoryCandidateKey(candidate.candidateId, "b44-sbs")).toContain(
      `/candidates/${candidate.candidateId}/routes/b44-sbs/`,
    );
  });
});
