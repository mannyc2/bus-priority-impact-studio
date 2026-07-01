import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type {
  EventRouteResolutionArtifact,
  EventRouteResolutionRow,
} from "../../../../src/commands/docs/tier2/_event-route-resolution.ts";
import {
  buildTier2RouteReviewQueue,
  runTier2RouteReviewQueue,
} from "../../../../src/commands/docs/tier2/_route-review-queue.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-tier2-route-review-queue");

function row(input: {
  surfaceId: string;
  routeIds: string[];
  routeResolutionTier: EventRouteResolutionRow["routeResolutionTier"];
  interventionFamily?: EventRouteResolutionRow["interventionFamily"];
  dateText?: string | null;
  eventStatus?: string | null;
  dateValidationState?: EventRouteResolutionRow["dateValidationState"];
  promotable?: boolean;
}): EventRouteResolutionRow {
  return {
    surfaceId: input.surfaceId,
    sourceId: `source-${input.surfaceId}`,
    sourceTitle: "Fixture Source",
    sourceGroup: "fixture",
    displayLabel: `Fixture ${input.surfaceId}`,
    canonicalFamily: "implementation_milestone",
    rawFamily: "service_launch",
    eventName: `Fixture ${input.surfaceId}`,
    eventFamily: "service_launch",
    eventSubtype: "bus_priority",
    eventStatus: input.eventStatus ?? "implemented",
    dateText: input.dateText ?? "October 2019",
    locationText: "14th Street",
    treatmentText: "busway",
    affectedEntitiesRaw: input.routeIds,
    timelineEligibility: "intervention_timeline_candidate",
    eventKind: "physical_bus_priority_change",
    interventionFamily: input.interventionFamily ?? "busway_or_transitway",
    classificationReasons: ["fixture"],
    routeResolutionTier: input.routeResolutionTier,
    routeResolutionState: "resolved",
    routeIds: input.routeIds,
    routeCount: input.routeIds.length,
    routeResolutionEvidence: [
      {
        kind: input.routeResolutionTier === "direct_event_text" ? "route_text" : "corridor_street",
        matchedText: "fixture",
        matchedRoutes: input.routeIds,
        routeFanout: input.routeIds.length,
      },
    ],
    routeIdentityValidationState: "confirmed_in_current_gtfs",
    dateValidationState: input.dateValidationState ?? "source_stated_operational_date",
    promotableToRouteReviewQueue: input.promotable ?? true,
    promotionCaveats: [
      "document_claim_only_event: source text was not validated against a historical service record",
      "date_basis_source_stated_operational: trusting the official source operational date; historical GTFS is only an optional route/service exposure check",
    ],
    evidenceRefs: [
      {
        sourceId: `source-${input.surfaceId}`,
        pageNumber: 1,
        blockId: "B0001",
        lineStart: 1,
        lineEnd: 2,
      },
    ],
  };
}

function artifact(rows: EventRouteResolutionRow[]): EventRouteResolutionArtifact {
  return {
    artifactKind: "bp.tier2_document_event_route_resolution.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    sourceSurfacesPath: "events.jsonl",
    entitiesSurfacesPath: "entities.jsonl",
    localDbPath: "pipeline.sqlite",
    routeStopMonth: "2026-03",
    summary: {
      inputEventCount: rows.length,
      interventionCandidateCount: rows.filter(
        (r) => r.timelineEligibility === "intervention_timeline_candidate",
      ).length,
      routeResolvedEventCount: rows.filter((r) => r.routeResolutionState === "resolved").length,
      routeResolvedInterventionCandidateCount: rows.filter((r) => r.promotableToRouteReviewQueue)
        .length,
      promotableToRouteReviewQueueCount: rows.filter((r) => r.promotableToRouteReviewQueue).length,
      ambiguousInterventionCandidateCount: 0,
      unresolvedInterventionCandidateCount: 0,
      sourceRouteContextCount: 0,
      streetGazetteerKeyCount: 0,
      streetGazetteerRouteStopRows: 0,
      currentGtfsRouteCount: 3,
      countsByTimelineEligibility: {},
      countsByEventKind: {},
      countsByInterventionFamily: {},
      countsByRouteResolutionTier: {},
      countsByDateValidationState: {},
    },
    samples: {
      promotable: [],
      ambiguous: [],
      unresolvedCandidates: [],
      processOnly: [],
    },
    rows,
  };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 route review queue", () => {
  test("fans route-resolved event rows into per-route review queues", () => {
    const queue = buildTier2RouteReviewQueue(
      artifact([
        row({
          surfaceId: "direct",
          routeIds: ["M14A+", "M14D+"],
          routeResolutionTier: "direct_event_text",
        }),
        row({
          surfaceId: "corridor",
          routeIds: ["M34+"],
          routeResolutionTier: "corridor_gazetteer",
          interventionFamily: "bus_lane",
          dateValidationState: "source_stated_planned_date",
        }),
        row({
          surfaceId: "not-promotable",
          routeIds: ["M15+"],
          routeResolutionTier: "direct_event_text",
          promotable: false,
        }),
      ]),
      { routeResolutionPath: "route-resolution.json", generatedAt: "2026-06-03T00:00:00.000Z" },
    );

    expect(queue.artifactKind).toBe("bp.tier2_route_review_queue.v1");
    expect(queue.summary.routeCount).toBe(3);
    expect(queue.summary.sourceEventCount).toBe(2);
    expect(queue.summary.queueItemCount).toBe(3);
    // All 3 queue items are source-stated operational/planned dates -> trusted,
    // so the default decision is to approve, not to demand historical-GTFS dating.
    expect(queue.summary.countsByReviewerDecisionDefault).toEqual({
      approve_for_route_timeline_candidate: 3,
    });

    const m14a = queue.routes.find((route) => route.routeId === "M14A+");
    expect(m14a?.itemCount).toBe(1);
    expect(m14a?.items[0]?.routeResolutionTier).toBe("direct_event_text");
    expect(m14a?.items[0]?.reviewPriorityBand).toBe("high");
    // Operational date is trusted: the historical-GTFS option is dropped.
    expect(m14a?.items[0]?.reviewerDecisionOptions).not.toContain(
      "needs_historical_gtfs_date_validation",
    );

    const m34 = queue.routes.find((route) => route.routeId === "M34+");
    // Planned/scheduled date: GTFS exposure cross-check stays available.
    expect(m34?.items[0]?.reviewerDecisionOptions).toContain(
      "needs_historical_gtfs_date_validation",
    );
    expect(
      m34?.items[0]?.reviewTasks.some((task) => task.includes("weaker route-resolution")),
    ).toBe(true);
    expect(queue.routes.some((route) => route.routeId === "M15+")).toBe(false);
  });

  test("writes the queue artifact to disk", async () => {
    const routeResolutionPath = join(workingRoot, "route-resolution.json");
    const outputPath = join(workingRoot, "queue.json");
    await writeJson(
      routeResolutionPath,
      artifact([
        row({ surfaceId: "direct", routeIds: ["M14A+"], routeResolutionTier: "direct_event_text" }),
      ]),
    );

    const result = await runTier2RouteReviewQueue({
      routeResolutionPath,
      outputPath,
      generatedAt: "2026-06-03T00:00:00.000Z",
    });

    expect(result.outputPath).toBe(outputPath);
    expect(result.artifact.summary.queueItemCount).toBe(1);
    expect(await Bun.file(outputPath).exists()).toBe(true);
  });
});
