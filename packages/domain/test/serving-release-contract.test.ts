import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import { ReleaseStatusResponseSchema } from "@bp/domain/routes";
import { RouteDossierSummarySchema } from "../src/studio";
import { StudioSnapshotResponseSchema } from "../src/studio/snapshots.js";

const releaseIdentity = {
  releaseId: "pub_20260719T123456789Z",
  publishedAt: "2026-07-19T12:34:56.789Z",
  coverage: { start: "2023-04", end: "2026-03" },
};

const quality = {
  releaseLayer: "published_release" as const,
  completenessStatus: "complete" as const,
  confidence: "high" as const,
  caveats: [],
};

describe("serving release contracts", () => {
  test("requires matching top-level and nested status release identities", () => {
    const response = {
      schemaVersion: 1,
      generatedAt: releaseIdentity.publishedAt,
      ...releaseIdentity,
      currentSignalMonth: null,
      release: {
        ...releaseIdentity,
        status: "pass" as const,
        routeCount: 1,
        artifactCount: 2,
        issueCount: 0,
      },
      observedRealtimeEvidence: {
        runId: null,
        source: "none" as const,
        observedRouteCount: 0,
        insufficientRouteCount: 0,
        sampleCount: 0,
        routeCoverageShare: 0,
      },
      currentObservedSignal: null,
      quality,
    };

    expect(decodeStrict(ReleaseStatusResponseSchema)(response).release.releaseId).toBe(
      releaseIdentity.releaseId,
    );
    expect(() =>
      decodeStrict(ReleaseStatusResponseSchema)({
        ...response,
        release: { ...response.release, publishedAt: "2026-07-20T00:00:00.000Z" },
      }),
    ).toThrow(/Nested release identity/);
  });

  test("keeps nullable snapshot identity atomic", () => {
    const snapshot = {
      schemaVersion: 1,
      generatedAt: releaseIdentity.publishedAt,
      projectionPrefix: "studio/v2",
      releaseKey: "studio/v2/release.json",
      release: null,
      lastBuiltSpeedMonth: null,
      counts: { routes: 0, methods: 0, docsSections: 0, docsEndpoints: 0 },
      projections: [],
      quality,
    };

    expect(decodeStrict(StudioSnapshotResponseSchema)(snapshot).release).toBeNull();
    expect(() =>
      decodeStrict(StudioSnapshotResponseSchema)({
        ...snapshot,
        release: { releaseId: releaseIdentity.releaseId, coverage: releaseIdentity.coverage },
      }),
    ).toThrow();
  });

  test("versions dossier summaries with publication identity and coverage", () => {
    const emptyMetric = {
      current: null,
      movement6mPct: null,
      peerPercentile: null,
      sparkline: [],
      dataAsOf: null,
    };
    const dossier = decodeStrict(RouteDossierSummarySchema)({
      artifactKind: "studio_route_dossier_summary",
      schemaVersion: 2,
      generatedAt: releaseIdentity.publishedAt,
      routeId: "M15+",
      routeSlug: "m15-sbs",
      ...releaseIdentity,
      dataAsOf: null,
      speed: emptyMetric,
      ridership: emptyMetric,
      worstSegment: null,
      treatmentPosture: {
        aceActive: false,
        aceSince: null,
        busLaneMatchedLaneCount: 0,
        latestEvents: [],
        dataAsOf: null,
      },
    });

    expect(dossier.schemaVersion).toBe(2);
    expect(String(dossier.coverage.end)).toBe("2026-03");
  });
});
