import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLocalD1Inputs } from "../../../src/commands/export/d1-inputs.ts";
import { openLocalPipelineDb } from "../../../src/lib/local-db.ts";

const tmp = mkdtempSync(join(tmpdir(), "d1-inputs-compatibility-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

async function readInputs(
  testName: string,
  month: string,
  options: Parameters<typeof readLocalD1Inputs>[2],
) {
  const local = await openLocalPipelineDb(join(tmp, `${testName}.sqlite`));
  try {
    return await readLocalD1Inputs(local.db, month, {
      artifactRoot: join(tmp, `${testName}-artifacts`),
      sqlite: local.sqlite,
      ...options,
    });
  } finally {
    local.sqlite.close();
  }
}

async function writeDetectorManifest(path: string, releaseMonth: string): Promise<void> {
  await Bun.write(
    path,
    JSON.stringify({
      artifactKind: "detector_readiness_serving_manifest",
      schemaVersion: 1,
      releaseMonth,
      routes: [
        {
          routeId: "B46",
          counts: {
            public_finding_candidate: 1,
            route_context: 0,
            review_queue: 0,
            suppressed: 0,
          },
        },
      ],
    }),
  );
}

async function writeTimelineProjection(path: string, releaseMonth: string): Promise<void> {
  const hash = "a".repeat(64);
  await Bun.write(
    path,
    JSON.stringify({
      releaseMonth,
      routeTimelineIndexRows: [
        {
          routeId: "B46",
          month: releaseMonth,
          supportLevel: "timeline_ready",
          qualityFlags: [],
          defaultEventCount: 1,
          secondaryEventCount: 0,
          reviewOnlyEventCount: 0,
          eventCount: 1,
          sourceBackedEventCount: 1,
          dateAssertionBackedEventCount: 1,
          unresolvedDateEventCount: 0,
          lowConfidenceEventCount: 0,
          unaccountedCandidateCount: 0,
          validationErrorCount: 0,
          validationWarningCount: 0,
          totalTokens: 123,
          defaultEvents: [],
          bundleArtifactKey: "studio/v2/routes/b46/timeline.json",
          bundleArtifactSha256: hash,
          bundleArtifactByteLength: 456,
          sourceBundlePath: "/tmp/b46-timeline.json",
          generatedAt: "2026-06-06T20:10:00.000Z",
        },
      ],
      routeArtifactRows: [
        {
          routeId: "B46",
          month: releaseMonth,
          artifactName: "route_timeline_bundle",
          artifactKey: "studio/v2/routes/b46/timeline.json",
          contentType: "application/json",
          byteLength: 456,
          sha256: hash,
        },
      ],
    }),
  );
}

describe("frozen detector-readiness compatibility", () => {
  test("accepts an equal manifest month", async () => {
    const manifestPath = join(tmp, "detector-equal.json");
    await writeDetectorManifest(manifestPath, "2026-03");

    const inputs = await readInputs("detector-equal", "2026-03", {
      detectorReadinessManifestPath: manifestPath,
    });

    expect(inputs.detectorReadinessManifestAvailable).toBe(true);
    expect(inputs.routeArtifacts).toContainEqual(
      expect.objectContaining({
        routeId: "B46",
        month: "2026-03",
        artifactName: "detector_readiness_manifest",
      }),
    );
  });

  test("accepts an older manifest and preserves its artifact month", async () => {
    const manifestPath = join(tmp, "detector-older.json");
    await writeDetectorManifest(manifestPath, "2026-02");

    const inputs = await readInputs("detector-older", "2026-03", {
      detectorReadinessManifestPath: manifestPath,
    });

    expect(inputs.routeArtifacts).toContainEqual(
      expect.objectContaining({
        routeId: "B46",
        month: "2026-02",
        artifactName: "detector_readiness_manifest",
      }),
    );
  });

  test("rejects a manifest later than the export month", async () => {
    const manifestPath = join(tmp, "detector-newer.json");
    await writeDetectorManifest(manifestPath, "2026-04");

    await expect(
      readInputs("detector-newer", "2026-03", {
        detectorReadinessManifestPath: manifestPath,
      }),
    ).rejects.toThrow("is later than export month");
  });
});

describe("frozen route-timeline compatibility", () => {
  test("accepts a projection for the exact export month", async () => {
    const projectionPath = join(tmp, "timeline-matching.json");
    await writeTimelineProjection(projectionPath, "2026-03");

    const inputs = await readInputs("timeline-matching", "2026-03", {
      routeTimelineProjectionPath: projectionPath,
    });

    expect(inputs.routeTimelineIndex).toHaveLength(1);
    expect(inputs.routeArtifacts).toContainEqual(
      expect.objectContaining({
        routeId: "B46",
        month: "2026-03",
        artifactName: "route_timeline_bundle",
      }),
    );
  });

  test("rejects a projection for a different export month", async () => {
    const projectionPath = join(tmp, "timeline-wrong-partition.json");
    await writeTimelineProjection(projectionPath, "2026-02");

    await expect(
      readInputs("timeline-wrong-partition", "2026-03", {
        routeTimelineProjectionPath: projectionPath,
      }),
    ).rejects.toThrow("does not match export month");
  });
});
