import { describe, expect, test } from "bun:test";
import type { OperationalDateAssertion } from "@bp/domain";
import {
  buildDocumentAnchorEventsForRouteEvaluation,
  documentOperationalDateSourceId,
} from "../../../src/commands/route/intervention-evaluation.ts";

function assertion(input: {
  surfaceId: string;
  interventionId: string;
  routeIds: string[];
  implementationMonth: string | null;
  effectiveDateStart: string | null;
  confidence?: number;
  sourceCount?: number;
  causalAnchorEligible?: boolean;
  interventionFamily?: string;
  routeResolutionTier?: string;
}): OperationalDateAssertion {
  return {
    surfaceId: input.surfaceId,
    sourceId: `source-${input.surfaceId}`,
    sourceTitle: "Fixture Source",
    sourceGroup: "fixture",
    displayLabel: "Fixture busway launch",
    eventName: "Fixture busway launch",
    treatmentText: "busway",
    locationText: "14th Street",
    operationalDate: input.effectiveDateStart,
    datePrecision: "day",
    statusRaw: "completed",
    familyRaw: "busway_implementation",
    subtypeRaw: "busway_implementation",
    eventKind: "physical_bus_priority_change",
    interventionFamily: input.interventionFamily ?? "busway_or_transitway",
    sourceStatedStatus: "done",
    dateBasis: "source_stated_complete",
    validationState: "source_stated_operational_date",
    trustedOperationalDate: true,
    classificationReasons: ["fixture"],
    evidenceRefs: [],
    effectiveDateStart: input.effectiveDateStart,
    effectiveDateEnd: input.effectiveDateStart,
    implementationMonth: input.implementationMonth,
    normalizedPrecision: "day",
    isRealizedOnset: true,
    routeIds: input.routeIds,
    routeIdentityValidationState: "confirmed_in_current_gtfs",
    routeResolutionTier: input.routeResolutionTier ?? "direct_event_text",
    interventionId: input.interventionId,
    evidenceSourceIds: [`source-${input.surfaceId}`],
    sourceCount: input.sourceCount ?? 1,
    confidence: input.confidence ?? 0.8,
    causalAnchorEligible: input.causalAnchorEligible ?? true,
  };
}

describe("route intervention evaluation document anchors", () => {
  test("projects eligible document anchors into per-route treatment events", () => {
    const events = buildDocumentAnchorEventsForRouteEvaluation({
      analysisMonth: "2026-03",
      publicRouteIds: new Set(["M14A+", "M14D+"]),
      assertions: [
        assertion({
          surfaceId: "lower-confidence",
          interventionId: "intv_busway",
          routeIds: ["M14A+", "M14D+", "M15+"],
          implementationMonth: "2019-10",
          effectiveDateStart: "2019-10-03",
          confidence: 0.7,
        }),
        assertion({
          surfaceId: "higher-confidence",
          interventionId: "intv_busway",
          routeIds: ["M14A+"],
          implementationMonth: "2019-10",
          effectiveDateStart: "2019-10-03",
          confidence: 0.95,
          sourceCount: 3,
        }),
        assertion({
          surfaceId: "not-causal",
          interventionId: "intv_review",
          routeIds: ["M14A+"],
          implementationMonth: "2020-01",
          effectiveDateStart: "2020-01-01",
          causalAnchorEligible: false,
        }),
        assertion({
          surfaceId: "ambiguous-route-link",
          interventionId: "intv_ambiguous",
          routeIds: ["M14D+"],
          implementationMonth: "2019-10",
          effectiveDateStart: "2019-10-03",
          routeResolutionTier: "ambiguous_corridor_gazetteer",
        }),
      ],
    });

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.routeId)).toEqual(["M14A+", "M14D+"]);
    expect(events.map((event) => event.eventId)).toEqual([
      "doc-anchor:M14A+:intv_busway",
      "doc-anchor:M14D+:intv_busway",
    ]);
    expect(events[0]).toMatchObject({
      sourceId: documentOperationalDateSourceId,
      interventionType: "busway",
      implementationDate: "2019-10-03",
      implementationMonth: "2019-10",
      eventStatus: "implemented",
    });
    expect(events[0]?.description).toContain("confidence 0.95");
    expect(events[1]?.description).toContain("confidence 0.7");
  });

  test("keeps future-relative anchors unevaluated for older analysis months", () => {
    const events = buildDocumentAnchorEventsForRouteEvaluation({
      analysisMonth: "2018-01",
      publicRouteIds: new Set(["M14A+"]),
      assertions: [
        assertion({
          surfaceId: "future",
          interventionId: "intv_future",
          routeIds: ["M14A+"],
          implementationMonth: "2019-10",
          effectiveDateStart: "2019-10-03",
        }),
      ],
    });

    expect(events[0]?.eventStatus).toBe("future");
  });
});
