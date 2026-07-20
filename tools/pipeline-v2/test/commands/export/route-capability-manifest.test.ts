import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import { RouteCapabilityManifestSchema } from "@bp/domain/studio";
import { ReleaseIdentitySchema, releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import {
  buildAndWriteRouteCapabilityManifest,
  readDetectorReadinessRouteSummaries,
  toRouteCapabilityInputRows,
} from "../../../src/commands/export/route-capability-manifest.ts";

const tmp = mkdtempSync(join(tmpdir(), "route-capability-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// Minimal slice of the readLocalD1Inputs return shape that the adapter consumes.
const d1Inputs = {
  routeCatalog: [{ routeId: "M15+" }, { routeId: "B99" }],
  routeReadiness: [{ routeId: "M15+", scheduleTimepointCount: 42 }],
  routeBriefSummaries: [
    {
      routeId: "M15+",
      month: "2026-03",
      publicVisible: true,
      aceActive: true,
      busLaneMatchedLaneCount: 5,
    },
  ],
  routeMonthTrends: [
    { routeId: "M15+", month: "2026-02", hasSpeedTrend: true, hasRidershipTrend: true },
    { routeId: "M15+", month: "2026-03", hasSpeedTrend: true, hasRidershipTrend: false },
  ],
  routeArtifacts: [{ routeId: "M15+" }],
  routeSpeedHistoryCoverage: [
    { routeId: "M15+", historyEndMonth: "2026-03", monthCount: 24, missingCellCount: 16 },
  ],
  routeMonthSourceStatuses: [
    { routeId: "M15+", sourceScope: "equity_context", sourceId: "ridership", status: "blocked" },
    { routeId: "M15+", sourceScope: "reliability", sourceId: "bunching", status: "available" },
  ],
  // biome-ignore lint/suspicious/noExplicitAny: minimal structural fixture for the adapter Pick.
} as any;

describe("toRouteCapabilityInputRows", () => {
  const rows = toRouteCapabilityInputRows(d1Inputs, new Map());
  const byRoute = new Map(rows.map((row) => [row.routeId, row]));

  test("maps the rich route from the local-DB rows", () => {
    const row = byRoute.get("M15+");
    expect(row?.hasSummary).toBe(true);
    expect(row?.publicVisible).toBe(true);
    expect(row?.conditionDataAsOf).toBe("2026-03");
    expect(row?.hasArtifact).toBe(true);
    expect(row?.scheduleTimepointCount).toBe(42);
    expect(row?.history).toEqual({
      endMonth: "2026-03",
      pointCount: 2,
      speedMonthCount: 2,
      ridershipMonthCount: 1,
    });
    expect(row?.speedHistory).toEqual({
      endMonth: "2026-03",
      monthCount: 24,
      missingCellCount: 16,
    });
    expect(row?.treatment).toEqual({ aceActive: true, busLaneMatchedLaneCount: 5 });
    expect(row?.sourceStatus).toEqual({ reliability: "available", ridership: "blocked" });
  });

  test("defaults the sparse catalog-only route", () => {
    const row = byRoute.get("B99");
    expect(row?.hasSummary).toBe(false);
    expect(row?.hasArtifact).toBe(false);
    expect(row?.speedHistory).toBeNull();
    expect(row?.detector.present).toBe(false);
    expect(row?.sourceStatus).toEqual({ reliability: "absent", ridership: "absent" });
  });
});

describe("readDetectorReadinessRouteSummaries", () => {
  test("accepts an equal detector month without adding a compatibility caveat", async () => {
    const manifestPath = join(tmp, "readiness.json");
    await Bun.write(
      manifestPath,
      JSON.stringify({
        artifactKind: "detector_readiness_serving_manifest",
        schemaVersion: 1,
        releaseMonth: "2026-03",
        routes: [
          {
            routeId: "M15+",
            counts: {
              public_finding_candidate: 3,
              route_context: 2,
              review_queue: 1,
              suppressed: 0,
            },
            byDetector: {
              headway_reliability_ewt: { public_finding_candidate: 1, route_context: 1 },
              treatment_scope_gap: { public_finding_candidate: 2, route_context: 1 },
            },
            sourceMonths: [{ month: "2026-02" }, { month: "2026-03" }, { month: "2026-03" }],
            caveats: ["geometry approximate"],
          },
        ],
      }),
    );

    const summaries = await readDetectorReadinessRouteSummaries({ manifestPath, month: "2026-03" });
    const summary = summaries.get("M15+");
    expect(summary?.findingCandidateCount).toBe(3);
    expect(summary?.reliabilityFindingCount).toBe(1);
    expect(summary?.reliabilityContextCount).toBe(1);
    expect(summary?.months).toEqual(["2026-02", "2026-03"]);
    expect(summary?.caveats).toEqual(["geometry approximate"]);
  });

  test("accepts an older detector month with a compatibility caveat", async () => {
    const manifestPath = join(tmp, "readiness-older-month.json");
    await Bun.write(
      manifestPath,
      JSON.stringify({
        releaseMonth: "2026-02",
        routes: [
          {
            routeId: "M15+",
            counts: {
              public_finding_candidate: 0,
              route_context: 0,
              review_queue: 0,
              suppressed: 0,
            },
            caveats: ["geometry approximate"],
          },
        ],
      }),
    );

    const summaries = await readDetectorReadinessRouteSummaries({
      manifestPath,
      month: "2026-03",
    });
    expect(summaries.get("M15+")?.caveats).toEqual([
      "geometry approximate",
      "Detector readiness data is from 2026-02; release coverage ends 2026-03.",
    ]);
  });

  test("returns an empty map when no manifest path is given", async () => {
    expect((await readDetectorReadinessRouteSummaries({ month: "2026-03" })).size).toBe(0);
  });

  test("rejects a detector month later than the export month", async () => {
    const manifestPath = join(tmp, "readiness-newer-month.json");
    await Bun.write(
      manifestPath,
      JSON.stringify({
        artifactKind: "detector_readiness_serving_manifest",
        schemaVersion: 1,
        releaseMonth: "2026-04",
        routes: [],
      }),
    );
    await expect(
      readDetectorReadinessRouteSummaries({ manifestPath, month: "2026-03" }),
    ).rejects.toThrow("is later than export month");
  });
});

describe("buildAndWriteRouteCapabilityManifest", () => {
  test("writes a schema-valid manifest artifact", async () => {
    const artifactRoot = join(tmp, "artifacts");
    const publishedAt = "2026-06-10T00:00:00.000Z";
    const releaseIdentity = decodeStrict(ReleaseIdentitySchema)({
      releaseId: releaseIdFromPublishedAt(publishedAt),
      publishedAt,
      coverage: { start: "2026-02", end: "2026-03" },
    });
    const result = await buildAndWriteRouteCapabilityManifest({
      d1Inputs,
      readinessSummaries: new Map(),
      artifactRoot,
      ...releaseIdentity,
      generatedAt: publishedAt,
    });
    expect(result.routeCount).toBe(2);
    expect(result.outputPath).toContain("studio/v2/routes/route-capability-manifest.json");

    const written = JSON.parse(await Bun.file(result.outputPath).text());
    expect(() => decodeStrict(RouteCapabilityManifestSchema)(written)).not.toThrow();
    expect(written.schemaVersion).toBe(2);
    expect(written.releaseId).toBe(releaseIdFromPublishedAt(publishedAt));
    expect(written.coverage).toEqual({ start: "2026-02", end: "2026-03" });
    const m15 = written.routes.find((route: { routeId: string }) => route.routeId === "M15+");
    expect(m15.surfaces.speedHistory.state).toBe("partial");
    expect(m15.surfaces.ridership.state).toBe("blocked"); // equity_context source blocked
  });
});
