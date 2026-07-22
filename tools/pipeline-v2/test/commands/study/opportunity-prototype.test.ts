import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalPipelineDb } from "@bp/db/local";
import type { StudioInterventionCorpus } from "@bp/domain/studio";
import {
  corpusTreatmentPresence,
  runOpportunityPrototype,
} from "../../../src/commands/study/opportunity-prototype.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("study opportunity-prototype command", () => {
  test("uses corpus positives only as treatment exclusions and rejects a count mismatch", () => {
    const corpus: StudioInterventionCorpus = {
      schemaVersion: 1,
      generatedAt: "2026-05-27T00:00:00.000Z",
      sourceCorpus: {
        path: "reviewed-corpus.json",
        version: 3,
        generatedAt: "2026-05-27T00:00:00.000Z",
        recordCount: 1,
        sha256: "a".repeat(64),
      },
      records: [
        {
          recordId: "document-intervention-b1-ace",
          routes: ["b1"],
          primaryTreatments: ["ace"],
          customTreatments: [],
          title: "B1 documented ACE",
          effectiveDate: null,
          datePrecision: null,
          recordKind: "proposed",
          statusLatest: "proposed",
          corridorStreets: [],
          evaluableInWindow: false,
          sourceId: "fixture-source",
          sourceLabel: "Fixture source",
          sourceUrl: null,
          caveatCount: 0,
          matchedRegistryEventIds: [],
        },
      ],
    };

    expect(corpusTreatmentPresence(corpus)).toEqual(new Set(["B1|automated_bus_lane_enforcement"]));
    expect(() =>
      corpusTreatmentPresence({
        ...corpus,
        sourceCorpus: { ...corpus.sourceCorpus, recordCount: 2 },
      }),
    ).toThrow("record-count mismatch");
  });

  test("fails closed when the supplied index is not the complete nine-study cut", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-opportunity-command-"));
    roots.push(root);
    const indexPath = join(root, "index.json");
    const reviewInputsPath = join(root, "review-inputs.json");
    const manifestPath = join(root, "manifest.json");
    await writeFile(
      indexPath,
      `${JSON.stringify({
        artifactKind: "bp.studio.segment_study_index.v1",
        schemaVersion: 1,
        analysisMonth: "2026-05",
        reviewCutId: "study-review-cut-v1:111111111111111111111111",
        studies: [],
      })}\n`,
    );
    await writeFile(
      reviewInputsPath,
      `${JSON.stringify({
        artifactKind: "bp.studio.study_review_inputs.v1",
        schemaVersion: 1,
        analysisMonth: "2026-05",
        outcomeSnapshot: {
          sourceId: "bus_segment_speeds_2025",
          sourceTable: "local_route_segment_speed",
          projectionVersion: "study-outcome-projection-v1",
          coverageStartMonth: "2023-04",
          coverageEndMonth: "2026-05",
          rowCount: 1,
          routeCount: 1,
          busTripCount: 1,
          months: [{ month: "2026-05", rowCount: 1, routeCount: 1, busTripCount: 1 }],
          logicalSha256: "a".repeat(64),
          availability: {
            latestCompleteMonth: "2026-05",
            artifact: { sha256: "b".repeat(64), byteCount: 1 },
          },
        },
        speedSpineSnapshot: {
          startMonth: "2023-04",
          endMonth: "2026-05",
          toleranceMeters: 110,
          routeCount: 1,
          logicalSha256: "c".repeat(64),
          manifest: { sha256: "d".repeat(64), byteCount: 1 },
          routes: [
            {
              routeId: "B1",
              readiness: "series_ready",
              artifactKey: "studio/v2/routes/b1/speed-spine.json",
              artifact: { sha256: "e".repeat(64), byteCount: 1 },
            },
          ],
        },
        physicalScopeSnapshot: {
          bindings: { sha256: "f".repeat(64), byteCount: 1 },
          candidateSetId: "candidate-set-v3:111111111111111111111111",
          analysisMonth: "2026-05",
          localBusLaneSha256: "1".repeat(64),
          localBusLaneCoordinateSha256: "2".repeat(64),
        },
        engineVersion: "segment-matched-did-v2",
        reviewPolicyVersion: "plan074-admission-v1",
      })}\n`,
    );
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        artifactKind: "studio_route_speed_spine_manifest",
        schemaVersion: 1,
        generatedAt: "2026-05-31T00:00:00.000Z",
        source: {
          table: "local_route_segment_speed",
          dbPath: ":memory:",
          startMonth: "2023-04",
          endMonth: "2026-05",
          toleranceMeters: 110,
          artifactRoot: root,
          manifestPath,
          routeUniverse: "local_route_segment_speed_distinct_routes",
        },
        summary: {
          candidateRouteCount: 1,
          routeCount: 1,
          currentCatalogRouteCount: 1,
          speedRouteNotInCurrentCatalogCount: 0,
          currentCatalogRouteMissingSpeedCount: 0,
          artifactWrittenRouteCount: 1,
          seriesReadyRouteCount: 1,
          seriesReadyWithGapsRouteCount: 0,
          needsPatternReviewRouteCount: 0,
          failedRouteCount: 0,
        },
        routes: [
          {
            routeId: "B1",
            routeSlug: "b1",
            inCurrentCatalog: true,
            readiness: "series_ready",
            reasons: [],
            artifactPath: join(root, "speed-spine.json"),
            artifactWritten: true,
            monthCount: 1,
            sourceRowCount: 1,
            busTripCount: 1,
            nodeCount: 2,
            spineSegmentCount: 1,
            rawSegmentKeyCount: 1,
            rawStopPairCount: 1,
            coverage: {
              minCoverageShare: 1,
              meanCoverageShare: 1,
              fullCoverageMonthCount: 1,
              partialCoverageMonthCount: 0,
              partialCoverageMonthShare: 0,
              rawKeyDriftMonthCount: 0,
              rawKeyDriftMonthShare: 0,
            },
            validationStatus: "pass",
            issueCount: 0,
          },
        ],
      })}\n`,
    );
    const sqlite = new Database(":memory:");
    try {
      await expect(
        runOpportunityPrototype({
          local: {
            sqlite,
            db: createLocalPipelineDb(sqlite),
            path: ":memory:",
            spatialite: null,
          },
          analysisMonth: "2026-05",
          studyIndexPath: indexPath,
          reviewInputsPath,
          spineManifestPath: manifestPath,
          treatmentSummaryPath: join(root, "unused-treatment-summary.json"),
          interventionCorpusPath: join(root, "unused-intervention-corpus.json"),
          outputRoot: join(root, "output"),
        }),
      ).rejects.toThrow("requires exactly 9 studies");
    } finally {
      sqlite.close();
    }
  });
});
