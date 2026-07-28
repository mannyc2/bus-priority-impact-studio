import { describe, expect, test } from "bun:test";
import { decodeStrict } from "../src/decode.ts";
import {
  PublicInterventionEpisodesArtifactSchema,
  PublicRouteInterventionHistoryArtifactSchema,
  publicInterventionEpisodesKey,
  publicRouteInterventionHistoryKey,
} from "../src/studio/public-intervention-episodes.ts";

const episode = {
  episodeId: "ep_aaaaaaaaaaaaaaaa",
  title: "Camera enforcement began on the B1",
  summary: "",
  date: {
    precision: "day",
    start: "2024-09-16",
    end: "2024-09-16",
    display: "September 16, 2024",
    raw: "2024-09-16",
  },
  phase: "switched_on",
  lifecycle: "in_place",
  kindKeys: ["camera_enforcement"],
  routes: [{ routeId: "B1", label: "B1", slug: "b1", role: "affected" }],
  components: [
    {
      componentId: "ep_aaaaaaaaaaaaaaaa-c000001",
      label: "Automated camera enforcement (ACE)",
      detail: null,
    },
  ],
  citations: [],
  caveat: null,
  finding: null,
} as const;

describe("public intervention episode schemas", () => {
  test("decode the network and route artifacts and keep their keys stable", () => {
    const source = {
      sourceId: "ace",
      releaseId: "ace-registry:2024-09:1",
      sha256: "a".repeat(64),
      coverageEnd: "2024-09",
    };
    const network = decodeStrict(PublicInterventionEpisodesArtifactSchema)({
      artifactKind: "bp.studio.public_intervention_episodes.v1",
      schemaVersion: 1,
      release: {
        releaseId: "public-interventions-v1:test",
        publishedAt: "2026-07-27T00:00:00.000Z",
        coverageEnd: "2026-05",
        sources: [source],
      },
      networkBuildout: {
        firstYear: 2024,
        lastYear: 2024,
        lastCompleteYear: 2024,
        partialFinalYear: false,
        coverageEndMonth: "2024-12",
        routeCount: 1,
        routesWithDocumentedWork: 1,
        series: [
          {
            familyKey: "camera_enforcement",
            label: "Camera enforcement",
            routesByYear: [1],
          },
        ],
      },
      proposedPlans: { plans: [], changeCount: 0, planCount: 0 },
      episodes: [episode],
    });
    const route = decodeStrict(PublicRouteInterventionHistoryArtifactSchema)({
      artifactKind: "bp.studio.route_intervention_history.v1",
      schemaVersion: 1,
      releaseId: network.release.releaseId,
      route: {
        routeId: "B1",
        slug: "b1",
        label: "B1",
        corridor: "Bay Ridge - Manhattan Beach",
      },
      episodes: network.episodes,
    });
    expect(route.episodes[0]?.episodeId).toBe(network.episodes[0]?.episodeId);
    expect(publicInterventionEpisodesKey()).toBe("studio/v2/interventions/public-episodes.json");
    expect(publicRouteInterventionHistoryKey("b1")).toBe(
      "studio/v2/routes/b1/intervention-history.json",
    );
  });
});
