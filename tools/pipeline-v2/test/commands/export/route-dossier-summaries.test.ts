import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { routeSpeedHistoryArtifactPath } from "@bp/applied-research/artifacts";
import { RouteDossierSummarySchema, routeDossierSummaryKey } from "@bp/domain/studio";
import {
  buildAndWriteRouteDossierSummaries,
  toRouteDossierInputRows,
  worstSegmentMonthsFromSpeedHistory,
} from "../../../src/commands/export/route-dossier-summaries.ts";

const tmp = mkdtempSync(join(tmpdir(), "route-dossier-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// Minimal slice of the readLocalD1Inputs return shape that the adapter consumes.
const d1Inputs = {
  routeCatalog: [{ routeId: "M15+" }, { routeId: "B99" }],
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
    { routeId: "M15+", month: "2026-02", averageSpeedMph: 7.2, ridership: 41000 },
    { routeId: "M15+", month: "2026-03", averageSpeedMph: 7.0, ridership: 42000 },
  ],
  interventionEvents: [
    {
      routeId: "M15+",
      eventId: "evt-1",
      interventionType: "ace_enforcement",
      implementationDate: "2024-06-01",
      implementationMonth: "2024-06",
      description: "ACE enforcement began",
    },
    {
      routeId: "M15+",
      eventId: "evt-2",
      interventionType: "bus_lane",
      implementationDate: "2023-09-15",
      implementationMonth: "2023-09",
      description: "Offset bus lane installed",
    },
  ],
  routeSpeedHistoryCoverage: [{ routeId: "M15+", routeSlug: "m15-sbs" }],
  // biome-ignore lint/suspicious/noExplicitAny: minimal structural fixture for the adapter Pick.
} as any;

const speedHistoryArtifact = {
  dimensions: {
    segments: [
      { segmentId: "seg-1", direction: "NB", label: "14th–23rd" },
      { segmentId: "seg-2", direction: "NB", label: "23rd–34th" },
    ],
  },
  cells: [
    { segmentId: "seg-1", month: "2026-02", averageSpeedMph: 4.0 },
    { segmentId: "seg-1", month: "2026-02", averageSpeedMph: 3.8 },
    { segmentId: "seg-2", month: "2026-02", averageSpeedMph: 6.0 },
    { segmentId: "seg-1", month: "2026-03", averageSpeedMph: 3.7 },
    { segmentId: "seg-2", month: "2026-03", averageSpeedMph: 5.9 },
    { segmentId: "seg-2", month: "2026-01", averageSpeedMph: null },
  ],
};

describe("worstSegmentMonthsFromSpeedHistory", () => {
  test("picks the slowest segment per month from daypart means and skips empty months", () => {
    const months = worstSegmentMonthsFromSpeedHistory(speedHistoryArtifact);
    expect(months).toEqual([
      {
        month: "2026-02",
        segmentId: "seg-1",
        direction: "NB",
        label: "14th–23rd",
        averageSpeedMph: 3.9,
      },
      {
        month: "2026-03",
        segmentId: "seg-1",
        direction: "NB",
        label: "14th–23rd",
        averageSpeedMph: 3.7,
      },
    ]);
  });
});

describe("toRouteDossierInputRows + buildAndWriteRouteDossierSummaries", () => {
  test("joins trends, events, treatment, and speed-history artifacts; writes schema-valid dossiers", async () => {
    const historyPath = routeSpeedHistoryArtifactPath({ artifactRoot: tmp, routeSlug: "m15-sbs" });
    await mkdir(dirname(historyPath), { recursive: true });
    await Bun.write(historyPath, JSON.stringify(speedHistoryArtifact));

    const rows = await toRouteDossierInputRows(d1Inputs, { artifactRoot: tmp });
    const m15 = rows.find((row) => row.routeId === "M15+");
    expect(m15?.routeSlug).toBe("m15-sbs");
    expect(m15?.trend).toHaveLength(2);
    expect(m15?.worstSegmentByMonth).toHaveLength(2);
    expect(m15?.treatment.aceActive).toBe(true);
    expect(m15?.treatment.aceSince).toBe("2024-06-01");
    expect(m15?.treatment.events).toHaveLength(2);

    // Catalog route with no coverage row falls back to the derived slug, empty data.
    const b99 = rows.find((row) => row.routeId === "B99");
    expect(b99?.routeSlug).toBe("b99");
    expect(b99?.trend).toEqual([]);
    expect(b99?.worstSegmentByMonth).toEqual([]);

    const { routeCount } = await buildAndWriteRouteDossierSummaries({
      d1Inputs,
      artifactRoot: tmp,
      releaseMonth: "2026-03",
      generatedAt: "2026-06-10T00:00:00.000Z",
    });
    expect(routeCount).toBe(2);

    const written = JSON.parse(
      await Bun.file(join(tmp, routeDossierSummaryKey("m15-sbs"))).text(),
    );
    const dossier = RouteDossierSummarySchema.parse(written);
    expect(dossier.routeId).toBe("M15+");
    expect(dossier.speed.current).toBe(7);
    expect(dossier.worstSegment?.segmentId).toBe("seg-1");
    expect(dossier.worstSegment?.persistenceMonths).toBe(2);
    expect(dossier.treatmentPosture.latestEvents[0]?.date).toBe("2024-06-01");
    expect(dossier.dataAsOf).toBe("2026-03");
  });
});
