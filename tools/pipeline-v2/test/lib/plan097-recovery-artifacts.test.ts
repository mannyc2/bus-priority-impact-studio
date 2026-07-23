import { describe, expect, test } from "bun:test";
import { strictDecodePlan097PublishableArtifact } from "../../src/lib/plan097-recovery-artifacts.ts";

describe("Plan 097 publishable artifact boundaries", () => {
  const knownKeys = [
    "studio/v2/routes/bx38/dossier.json",
    "studio/v2/routes/route-capability-manifest.json",
    "studio/v2/routes/bx38/speed-history.json",
    "studio/v2/routes/bx38/hourly-profile.json",
    "studio/v2/routes/bx38/speed-spine.json",
    "studio/v2/wiki/routes/bx38.json",
    "map/2026-07/manifest.json",
  ];

  test("fails every malformed publishable body instead of accepting JSON presence", () => {
    for (const key of knownKeys) {
      expect(() => strictDecodePlan097PublishableArtifact(key, {})).toThrow();
    }
  });

  test("does not pretend unrelated JSON has a publishable contract", () => {
    expect(
      strictDecodePlan097PublishableArtifact("studio/v2/docs/sources.json", { schemaVersion: 1 }),
    ).toBeNull();
  });

  test("accepts the current dossier contract and rejects an excess field", () => {
    const metric = {
      current: null,
      movement6mPct: null,
      peerPercentile: null,
      sparkline: [],
      dataAsOf: null,
    };
    const dossier = {
      artifactKind: "studio_route_dossier_summary",
      schemaVersion: 2,
      generatedAt: "2026-07-22T12:00:00.000Z",
      routeId: "BX38",
      routeSlug: "bx38",
      releaseId: "pub_20260722T120000000Z",
      publishedAt: "2026-07-22T12:00:00.000Z",
      coverage: { start: "2023-04", end: "2026-06" },
      dataAsOf: null,
      speed: metric,
      ridership: metric,
      worstSegment: null,
      treatmentPosture: {
        aceActive: false,
        aceSince: null,
        busLaneMatchedLaneCount: 0,
        latestEvents: [],
        dataAsOf: null,
      },
    };
    expect(
      strictDecodePlan097PublishableArtifact("studio/v2/routes/bx38/dossier.json", dossier),
    ).toBe("studio_route_dossier_summary.v2");
    expect(() =>
      strictDecodePlan097PublishableArtifact("studio/v2/routes/bx38/dossier.json", {
        ...dossier,
        unreviewed: true,
      }),
    ).toThrow();
  });
});
