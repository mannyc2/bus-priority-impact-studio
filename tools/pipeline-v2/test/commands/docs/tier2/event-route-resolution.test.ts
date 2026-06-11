import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  classifyTier2Event,
  normalizeStreetName,
  runTier2DocumentEventRouteResolution,
} from "../../../../src/commands/docs/tier2/_event-route-resolution.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-tier2-event-route-resolution");

function eventRow(input: {
  surfaceId: string;
  sourceId: string;
  canonicalFamily: string;
  rawFamily: string;
  displayLabel: string;
  locationText?: string;
  treatmentText?: string;
  affectedEntitiesRaw?: string[];
}) {
  return {
    schemaVersion: 1,
    surfaceId: input.surfaceId,
    surfaceKind: "event",
    sourceId: input.sourceId,
    sourceTitle: "Fixture Source",
    sourceGroup: "fixture",
    pageNumbers: [1],
    evidenceRefs: [{ sourceId: input.sourceId, pageNumber: 1, blockId: "B0001", lineStart: 1, lineEnd: 1 }],
    displayLabel: input.displayLabel,
    canonicalFamily: input.canonicalFamily,
    rawFamily: input.rawFamily,
    eventName: input.displayLabel,
    eventFamily: input.rawFamily,
    eventStatus: "implemented",
    dateText: "October 3, 2019",
    affectedEntitiesRaw: input.affectedEntitiesRaw ?? [],
    ...(input.locationText ? { locationText: input.locationText } : {}),
    ...(input.treatmentText ? { treatmentText: input.treatmentText } : {}),
  };
}

async function writeJsonl(path: string, rows: readonly unknown[]) {
  await Bun.write(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

async function seedDb(path: string) {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE local_route_catalog (
      route_id TEXT PRIMARY KEY,
      route_short_name TEXT NOT NULL,
      route_long_name TEXT,
      shape_count INTEGER NOT NULL DEFAULT 0,
      stop_count INTEGER NOT NULL DEFAULT 0,
      timepoint_stop_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE local_route_stop (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      stop_id TEXT NOT NULL,
      route_short_name TEXT NOT NULL,
      stop_name TEXT NOT NULL,
      in_effect INTEGER NOT NULL,
      direction_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      timepoint INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      PRIMARY KEY (route_id, month, stop_id, direction_id)
    );
  `);
  const route = db.prepare(
    `INSERT INTO local_route_catalog
      (route_id, route_short_name, route_long_name, shape_count, stop_count, timepoint_stop_count)
     VALUES (?, ?, ?, 1, 1, 1)`,
  );
  route.run("M14A+", "M14A-SBS", "M14A Select Bus Service");
  route.run("M14D+", "M14D-SBS", "M14D Select Bus Service");
  route.run("M34+", "M34-SBS", "M34 Select Bus Service");

  const stop = db.prepare(
    `INSERT INTO local_route_stop
      (route_id, month, stop_id, route_short_name, stop_name, in_effect, direction_id, direction, timepoint, latitude, longitude)
     VALUES (?, '2026-03', ?, ?, ?, 1, '0', 'eastbound', 1, 40.0, -73.0)`,
  );
  stop.run("M14A+", "m14a-1", "M14A-SBS", "E 14 ST/1 AV");
  stop.run("M14D+", "m14d-1", "M14D-SBS", "E 14 ST/AV A");
  stop.run("M34+", "m34-1", "M34-SBS", "W 34 ST/7 AV");
  db.close();
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 document event route resolution", () => {
  test("classifies process-only events before treatment-looking text", () => {
    const classification = classifyTier2Event(
      eventRow({
        surfaceId: "evt-process",
        sourceId: "source-a",
        canonicalFamily: "public_engagement",
        rawFamily: "public_meeting",
        displayLabel: "Public meeting for a proposed bus lane",
        treatmentText: "bus lane",
      }),
    );
    expect(classification.timelineEligibility).toBe("process_only");
    expect(classification.eventKind).toBe("public_engagement");
  });

  test("normalizes ordinal street names for current-snapshot corridor matching", () => {
    expect(normalizeStreetName("14th Street between 9th Avenue and 3rd Avenue")).toContain(
      "14 STREET",
    );
  });

  test("resolves direct route text, source single-route context, and corridor gazetteer routes", async () => {
    const dbPath = join(workingRoot, "pipeline.sqlite");
    await seedDb(dbPath);
    const eventsPath = join(workingRoot, "events.jsonl");
    const entitiesPath = join(workingRoot, "entities.jsonl");
    const outputPath = join(workingRoot, "event-route-resolution.json");

    await writeJsonl(eventsPath, [
      eventRow({
        surfaceId: "evt-direct",
        sourceId: "source-direct",
        canonicalFamily: "implementation_milestone",
        rawFamily: "pilot_project_launch",
        displayLabel: "14th Street busway launch",
        locationText: "14th Street",
        treatmentText: "transit and truck priority corridor",
        affectedEntitiesRaw: ["M14 A/D Select Bus Service"],
      }),
      eventRow({
        surfaceId: "evt-corridor",
        sourceId: "source-corridor",
        canonicalFamily: "implementation_milestone",
        rawFamily: "busway_implementation",
        displayLabel: "14th Street Transit Priority Project start",
        locationText: "14th Street between 9th Avenue and 3rd Avenue",
        treatmentText: "busway",
      }),
      eventRow({
        surfaceId: "evt-source-context",
        sourceId: "source-single-route",
        canonicalFamily: "planned_intervention",
        rawFamily: "bus_lane",
        displayLabel: "34th Street bus lane implementation",
        locationText: "34th Street",
        treatmentText: "bus lane",
      }),
      eventRow({
        surfaceId: "evt-process",
        sourceId: "source-direct",
        canonicalFamily: "public_engagement",
        rawFamily: "public_meeting",
        displayLabel: "Public meeting for M14 Select Bus Service",
        treatmentText: "bus lane",
        affectedEntitiesRaw: ["M14A"],
      }),
    ]);

    await writeJsonl(entitiesPath, [
      {
        surfaceKind: "entity",
        sourceId: "source-single-route",
        displayLabel: "M34 Select Bus Service",
        entityMode: "bus_route",
        canonicalFamily: "bus_route",
      },
    ]);

    const result = await runTier2DocumentEventRouteResolution({
      surfacesDir: workingRoot,
      eventsPath,
      entitiesPath,
      outputPath,
      dbPath,
      generatedAt: "2026-06-03T00:00:00.000Z",
    });

    expect(result.artifact.summary.inputEventCount).toBe(4);
    expect(result.artifact.summary.promotableToRouteReviewQueueCount).toBe(3);

    const direct = result.artifact.rows.find((row) => row.surfaceId === "evt-direct");
    expect(direct?.routeResolutionTier).toBe("direct_event_text");
    expect(direct?.routeIds).toEqual(["M14A+", "M14D+"]);

    const corridor = result.artifact.rows.find((row) => row.surfaceId === "evt-corridor");
    expect(corridor?.routeResolutionTier).toBe("corridor_gazetteer");
    expect(corridor?.routeIds).toEqual(["M14A+", "M14D+"]);
    // Implemented physical bus-priority change with a stated date: the source's
    // operational date is trusted (historical GTFS is only an optional exposure check).
    expect(corridor?.dateValidationState).toBe("source_stated_operational_date");

    const sourceContext = result.artifact.rows.find((row) => row.surfaceId === "evt-source-context");
    expect(sourceContext?.routeResolutionTier).toBe("source_single_route_context");
    expect(sourceContext?.routeIds).toEqual(["M34+"]);

    const process = result.artifact.rows.find((row) => row.surfaceId === "evt-process");
    expect(process?.timelineEligibility).toBe("process_only");
    expect(process?.promotableToRouteReviewQueue).toBe(false);
  });
});
