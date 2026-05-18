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
  briefSlugs: string[],
): Promise<void> {
  const studioRoot = join(artifactRoot, "studio", "v1");
  await mkdir(join(studioRoot, "routes"), { recursive: true });
  await mkdir(join(studioRoot, "briefs"), { recursive: true });
  await mkdir(join(studioRoot, "findings"), { recursive: true });
  await writeFile(join(studioRoot, "routes.json"), JSON.stringify({ routes }));
  await writeFile(
    join(studioRoot, "briefs.json"),
    JSON.stringify({ briefs: briefSlugs.map((slug) => ({ id: slug })) }),
  );
  await writeFile(join(studioRoot, "findings.json"), JSON.stringify({ findings: [] }));
  for (const route of routes) {
    await mkdir(join(studioRoot, "routes", route.slug), { recursive: true });
  }
  for (const slug of briefSlugs) {
    await mkdir(join(studioRoot, "briefs", slug), { recursive: true });
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

  test("flags routes missing from a curated projection", async () => {
    await writeFixture();
    // Only m15+ is in the projection; bx12+ and b41 from D1 are missing.
    await writeProjection([{ slug: "m15-sbs", routeId: "M15+" }], ["m15-madison-corridor"]);

    const result = await auditStudioCoverage({
      year: Number(isoMonth.split("-")[0]),
      month: Number(isoMonth.split("-")[1]),
      dbPath,
      artifactRoot,
      output: auditOutput,
    });

    expect(result.d1.routeCatalogCount).toBe(3);
    expect(result.d1.routeBriefSummaryCount).toBe(2);
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
    expect(result.gaps.routesMissingFromProjection).toEqual(["B41", "BX12+"]);
    expect(result.status).toBe("fail");
  });

  test("passes when projection covers every D1 route", async () => {
    await writeFixture();
    await writeProjection(
      [
        { slug: "m15-sbs", routeId: "M15+" },
        { slug: "bx12-sbs", routeId: "BX12+" },
        { slug: "b41", routeId: "B41" },
      ],
      [],
    );

    const result = await auditStudioCoverage({
      year: Number(isoMonth.split("-")[0]),
      month: Number(isoMonth.split("-")[1]),
      dbPath,
      artifactRoot,
      output: auditOutput,
    });

    expect(result.status).toBe("pass");
    expect(result.gaps.routesMissingFromProjection).toEqual([]);
    expect(result.gaps.studioRouteCoverageShare).toBe(1);
  });
});
