import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  replaceRouteBriefRows,
  replaceRouteCatalog,
  replaceRouteObservedReliabilityRows,
} from "@bp/db/local";
import { auditStudioCoverage } from "../src/jobs/audit/studio-coverage.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-07";
const workingDir = fromRepoRoot(join("data/working/test-audit-studio-coverage"));
const dbPath = join(workingDir, "pipeline.sqlite");
const artifactRoot = join(workingDir, "artifacts");
const auditOutput = join(workingDir, "studio-coverage.json");

async function removeFixture(): Promise<void> {
  await rm(workingDir, { force: true, recursive: true });
}

async function writeProjection(
  routes: { slug: string; routeId: string }[],
  briefs: { id: string; routeId: string }[],
  findings: Array<{ id: string; routeId?: string; review?: Record<string, unknown> }> = [],
): Promise<void> {
  const studioRoot = join(artifactRoot, "studio", "v1");
  await mkdir(join(studioRoot, "routes"), { recursive: true });
  await mkdir(join(studioRoot, "briefs"), { recursive: true });
  await mkdir(join(studioRoot, "findings"), { recursive: true });
  await writeFile(join(studioRoot, "routes.json"), JSON.stringify({ routes }));
  await writeFile(
    join(studioRoot, "briefs.json"),
    JSON.stringify({
      briefs: briefs.map((brief) => ({
        brief: { id: brief.id },
        route: { routeId: brief.routeId },
      })),
    }),
  );
  await writeFile(
    join(studioRoot, "findings.json"),
    JSON.stringify({
      findings: findings.map((finding) => ({
        finding: {
          id: finding.id,
          ...(finding.review === undefined ? {} : { review: finding.review }),
        },
        route: { routeId: finding.routeId ?? routes[0]?.routeId ?? "M15+" },
      })),
    }),
  );
  for (const route of routes) {
    await mkdir(join(studioRoot, "routes", route.slug), { recursive: true });
  }
  for (const brief of briefs) {
    const briefDir = join(studioRoot, "briefs", brief.id);
    await mkdir(briefDir, { recursive: true });
    await writeFile(join(briefDir, "evidence.json"), "{}");
    await writeFile(join(briefDir, "history.json"), "{}");
  }
}

async function writeFixture(): Promise<void> {
  await removeFixture();
  await mkdir(workingDir, { recursive: true });
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteCatalog(local.db, [
      {
        routeId: "M15+",
        routeShortName: "M15",
        routeLongName: "M15 SBS",
        routeTypes: ["SBS"],
        directions: [],
        shapeCount: 1,
        stopCount: 10,
        timepointStopCount: 5,
        latitudeMin: null,
        latitudeMax: null,
        longitudeMin: null,
        longitudeMax: null,
      },
      {
        routeId: "BX12+",
        routeShortName: "BX12",
        routeLongName: "BX12 SBS",
        routeTypes: ["SBS"],
        directions: [],
        shapeCount: 1,
        stopCount: 10,
        timepointStopCount: 5,
        latitudeMin: null,
        latitudeMax: null,
        longitudeMin: null,
        longitudeMax: null,
      },
      {
        routeId: "B41",
        routeShortName: "B41",
        routeLongName: "B41",
        routeTypes: ["Local"],
        directions: [],
        shapeCount: 1,
        stopCount: 10,
        timepointStopCount: 5,
        latitudeMin: null,
        latitudeMax: null,
        longitudeMin: null,
        longitudeMax: null,
      },
    ]);
    await replaceRouteBriefRows(local.db, {
      summary: {
        routeId: "M15+",
        month: isoMonth,
        routeScore: 50,
        publicVisible: true,
        publicVisibilityReason: "public",
        averageSpeedMph: 7,
        hotspotCount: 3,
        totalRidership: 100,
        totalTransfers: 10,
        aceActive: true,
        aceViolationCount: 5,
        busLaneMatchedLaneCount: 4,
        scheduleMatchRate: 0.99,
      },
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceRouteBriefRows(local.db, {
      summary: {
        routeId: "BX12+",
        month: isoMonth,
        routeScore: 40,
        publicVisible: true,
        publicVisibilityReason: "public",
        averageSpeedMph: 6,
        hotspotCount: 4,
        totalRidership: 80,
        totalTransfers: 8,
        aceActive: false,
        aceViolationCount: 0,
        busLaneMatchedLaneCount: 2,
        scheduleMatchRate: 0.97,
      },
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceRouteObservedReliabilityRows(local.db, isoMonth, "fixture-run", {
      summaries: [
        {
          routeId: "M15+",
          month: isoMonth,
          runId: "fixture-run",
          reliabilityStatus: "observed",
          minSampleThreshold: 30,
          sampleCount: 100,
          stopCount: 5,
          directionCount: 2,
          averageObservedHeadwayMinutes: 6,
          medianObservedHeadwayMinutes: 5,
          p90ObservedHeadwayMinutes: 12,
          maxObservedHeadwayMinutes: 18,
          scheduledMedianHeadwayMinutes: 5,
          bunchingThresholdMinutes: 2,
          longGapThresholdMinutes: 15,
          observedBunchingShare: 0.1,
          observedLongGapShare: 0.05,
          expectedWaitMinutes: 4,
          scheduledExpectedWaitMinutes: 3,
          excessWaitMinutes: 1,
          waitReliabilityRatio: 1.3,
        },
      ],
      sourceStatuses: [],
    });
  } finally {
    local.sqlite.close();
  }
}

describe("auditStudioCoverage", () => {
  afterEach(removeFixture);

  test("warns when public-visible routes are missing from a curated projection", async () => {
    await writeFixture();
    // Only m15+ is in the projection; bx12+ is public-visible and missing.
    // B41 is catalog-only in this fixture, so it should not count as a public Studio gap.
    await writeProjection(
      [{ slug: "m15-sbs", routeId: "M15+" }],
      [{ id: "m15-madison-corridor", routeId: "M15+" }],
    );

    const result = await auditStudioCoverage({
      year: Number(isoMonth.split("-")[0]),
      month: Number(isoMonth.split("-")[1]),
      dbPath,
      artifactRoot,
      output: auditOutput,
    });

    expect(result.d1.routeCatalogCount).toBe(3);
    expect(result.d1.routeBriefSummaryCount).toBe(2);
    expect(result.d1.publicRouteBriefSummaryCount).toBe(2);
    expect(result.d1.observedReliability).toEqual([
      expect.objectContaining({
        month: isoMonth,
        runIds: ["fixture-run"],
        observedRouteCount: 1,
        sampleCount: 100,
      }),
    ]);
    expect(result.projection.routesListCount).toBe(1);
    expect(result.projection.routeDetailCount).toBe(1);
    expect(result.projection.briefsListCount).toBe(1);
    expect(result.projection.briefEvidenceDetailCount).toBe(1);
    expect(result.projection.briefHistoryDetailCount).toBe(1);
    expect(result.projection.findingsMissingReviewCount).toBe(0);
    expect(result.gaps.routesMissingFromProjection).toEqual(["BX12+"]);
    expect(result.gaps.briefsMissingFromProjection).toEqual(["BX12+"]);
    expect(result.status).toBe("warn");
  });

  test("passes when projection covers every public-visible route", async () => {
    await writeFixture();
    await writeProjection(
      [
        { slug: "m15-sbs", routeId: "M15+" },
        { slug: "bx12-sbs", routeId: "BX12+" },
        { slug: "b41", routeId: "B41" },
      ],
      [
        { id: "m15-madison-corridor", routeId: "M15+" },
        { id: "brief-bx12-sbs", routeId: "BX12+" },
      ],
    );

    const result = await auditStudioCoverage({
      year: Number(isoMonth.split("-")[0]),
      month: Number(isoMonth.split("-")[1]),
      dbPath,
      artifactRoot,
      output: auditOutput,
    });

    expect(result.d1.publicRouteBriefSummaryCount).toBe(2);
    expect(result.status).toBe("pass");
    expect(result.gaps.routesMissingFromProjection).toEqual([]);
    expect(result.gaps.briefsMissingFromProjection).toEqual([]);
    expect(result.gaps.studioRouteCoverageShare).toBe(1);
    expect(result.gaps.studioBriefCoverageShare).toBe(1);
    expect(result.projection.reviewedFindingCount).toBe(0);
    expect(result.projection.reviewCandidateFindingCount).toBe(0);
    expect(result.gaps.findingsMissingReview).toEqual([]);
  });

  test("warns when Studio findings lack safe review provenance", async () => {
    await writeFixture();
    await writeProjection(
      [
        { slug: "m15-sbs", routeId: "M15+" },
        { slug: "bx12-sbs", routeId: "BX12+" },
      ],
      [
        { id: "m15-madison-corridor", routeId: "M15+" },
        { id: "brief-bx12-sbs", routeId: "BX12+" },
      ],
      [
        { id: "legacy-finding", routeId: "M15+" },
        {
          id: "detector-approved-too-early",
          routeId: "M15+",
          review: {
            publicationState: "review_candidate",
            reviewState: "approved",
            source: "detector_review_queue",
            candidateId: "candidate-1",
            detectorId: "observed_reliability",
            claimSafeLabel: "issue_needs_review",
          },
        },
        {
          id: "reviewed-without-approval",
          routeId: "BX12+",
          review: {
            publicationState: "reviewed",
            reviewState: "needs_review",
            source: "manual_review",
            candidateId: null,
            detectorId: null,
            claimSafeLabel: "issue_clean",
          },
        },
        {
          id: "detector-missing-ref",
          routeId: "BX12+",
          review: {
            publicationState: "review_candidate",
            reviewState: "needs_review",
            source: "detector_review_queue",
            candidateId: null,
            detectorId: "source_gap",
            claimSafeLabel: "insufficient_evidence",
          },
        },
      ],
    );

    const result = await auditStudioCoverage({
      year: Number(isoMonth.split("-")[0]),
      month: Number(isoMonth.split("-")[1]),
      dbPath,
      artifactRoot,
      output: auditOutput,
    });

    expect(result.status).toBe("warn");
    expect(result.projection.findingsListCount).toBe(4);
    expect(result.projection.reviewedFindingCount).toBe(1);
    expect(result.projection.reviewCandidateFindingCount).toBe(2);
    expect(result.projection.detectorFindingCount).toBe(2);
    expect(result.projection.findingsMissingReviewCount).toBe(1);
    expect(result.gaps.findingsMissingReview).toEqual(["legacy-finding"]);
    expect(result.gaps.reviewCandidatesMarkedApproved).toEqual(["detector-approved-too-early"]);
    expect(result.gaps.reviewedFindingsWithoutApproval).toEqual(["reviewed-without-approval"]);
    expect(result.gaps.detectorFindingsMissingRefs).toEqual(["detector-missing-ref"]);
  });
});
