import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { runRouteTimeline } from "../../../../src/commands/docs/tier2/_route-timeline.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-tier2-route-timeline");

function eventRow(input: Record<string, unknown>): string {
  return JSON.stringify({
    schemaVersion: 1,
    surfaceKind: "event",
    pageNumbers: [1],
    evidenceRefs: [],
    ...input,
  });
}

async function seedSurfaces(): Promise<string> {
  const dir = join(workingRoot, "surfaces");
  await mkdir(dir, { recursive: true });

  const events = [
    // A + B: same busway / 2019-10 / implemented / M14 family from two sources -> one milestone, two citations.
    eventRow({
      surfaceId: "ev-a",
      sourceId: "source_a",
      sourceTitle: "DOT 14th Street Busway Brochure",
      canonicalFamily: "implementation_milestone",
      eventName: "14th Street Busway opens",
      displayLabel: "14th Street Busway opens",
      treatmentText: "transit_and_truck_priority_corridor",
      eventStatus: "implemented",
      dateText: "October 2019",
      affectedEntitiesRaw: ["M14 A/D Select Bus Service", "M14D"],
      evidenceRefs: [{ pageNumber: 1, blockId: "B0001", snippet: "The 14th Street Busway opened in October 2019." }],
    }),
    eventRow({
      surfaceId: "ev-b",
      sourceId: "source_b",
      sourceTitle: "MTA SBS Progress Report",
      canonicalFamily: "implementation_milestone",
      eventName: "Busway launch",
      displayLabel: "Busway launch",
      eventStatus: "implemented",
      dateText: "October 2019",
      affectedEntitiesRaw: ["M14 A/D", "M14D"],
      evidenceRefs: [{ pageNumber: 7, blockId: "B0003", snippet: "Busway launched on 14th Street." }],
    }),
    // C: M14 but undated -> excluded as undated.
    eventRow({
      surfaceId: "ev-c",
      sourceId: "source_a",
      sourceTitle: "DOT 14th Street Busway Brochure",
      canonicalFamily: "planned_intervention",
      eventName: "Future M14 bus lane extension",
      displayLabel: "Future M14 bus lane extension",
      eventStatus: "proposed",
      dateText: "unknown",
      affectedEntitiesRaw: ["M14"],
    }),
    // D: M14 but a non-intervention context event -> excluded as context.
    eventRow({
      surfaceId: "ev-d",
      sourceId: "source_c",
      sourceTitle: "Community Board 6 presentation",
      canonicalFamily: "other_event",
      eventName: "Community Board 6 briefing",
      displayLabel: "Community Board 6 briefing",
      eventStatus: "planned",
      dateText: "March 2019",
      affectedEntitiesRaw: ["M14"],
    }),
    // E: off-route (M15) -> not counted for M14.
    eventRow({
      surfaceId: "ev-e",
      sourceId: "source_d",
      sourceTitle: "M15 SBS Report",
      canonicalFamily: "implementation_milestone",
      eventName: "M15 Select Bus Service launch",
      displayLabel: "M15 Select Bus Service launch",
      eventStatus: "implemented",
      dateText: "October 2010",
      affectedEntitiesRaw: ["M15"],
    }),
  ];
  await Bun.write(join(dir, "events.jsonl"), `${events.join("\n")}\n`);

  const metrics = [
    JSON.stringify({
      schemaVersion: 1,
      surfaceKind: "metric_claim",
      surfaceId: "me-a",
      sourceId: "source_b",
      sourceTitle: "MTA SBS Progress Report",
      pageNumbers: [9],
      evidenceRefs: [],
      canonicalFamily: "bus_speed",
      displayLabel: "M14 bus speed increased 12%",
      metricLabel: "M14 bus speed increase",
      metricAuthority: "official_agency_metric",
      valueText: "12%",
      valueNumeric: 12,
      unit: "percent",
      subjectText: "M14 SBS average bus speed",
      needsDeterministicMetric: true,
    }),
    JSON.stringify({
      schemaVersion: 1,
      surfaceKind: "metric_claim",
      surfaceId: "me-b",
      sourceId: "source_d",
      sourceTitle: "M15 SBS Report",
      pageNumbers: [3],
      evidenceRefs: [],
      canonicalFamily: "ridership",
      displayLabel: "M15 ridership",
      metricLabel: "M15 weekday ridership",
      metricAuthority: "official_agency_metric",
      valueText: "55,000",
      needsDeterministicMetric: true,
    }),
  ];
  await Bun.write(join(dir, "metric-claims.jsonl"), `${metrics.join("\n")}\n`);
  return dir;
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("docs tier2 route-timeline", () => {
  test("collapses route event rows into deduped, cited milestones", async () => {
    const surfacesDir = await seedSurfaces();
    const { report } = await runRouteTimeline({
      surfacesDir,
      route: "M14",
      outputDir: join(workingRoot, "out"),
      generatedAt: "2026-06-03T00:00:00.000Z",
    });

    expect(report.scanned.eventRows).toBe(5);
    expect(report.routeEventRows).toBe(4); // A, B, C, D (E is M15)
    expect(report.excluded.undatedEventRows).toBe(1); // C
    expect(report.excluded.contextEventRows).toBe(1); // D

    expect(report.timeline.milestoneCount).toBe(1);
    const milestone = report.timeline.milestones[0];
    if (milestone === undefined) throw new Error("expected one milestone");
    expect(milestone.interventionType).toBe("busway");
    expect(milestone.eventStatus).toBe("implemented");
    expect(milestone.month).toBe("2019-10");
    expect(milestone.date).toBe("2019-10-01");
    expect(milestone.datePrecision).toBe("month");
    expect(milestone.routeIds).toEqual(["M14", "M14D"]);
    expect(milestone.memberCount).toBe(2);
    expect(milestone.sourceCount).toBe(2);
    expect(milestone.citations.map((c) => c.sourceId).toSorted()).toEqual(["source_a", "source_b"]);
    expect(milestone.citations.some((c) => c.snippet?.includes("Busway"))).toBe(true);

    // Corroboration is best-effort textual match scoped to the route family.
    expect(report.corroboratingMetrics.matchedRows).toBe(1);
    expect(report.corroboratingMetrics.byFamily["bus_speed"]).toBe(1);
    expect(report.corroboratingMetrics.examples).toHaveLength(1);

    expect(await Bun.file(join(workingRoot, "out", "route-intervention-timeline-M14.md")).exists()).toBe(true);
  });
});
