import { describe, expect, test } from "bun:test";
import { decodeEitherStrict } from "@bp/domain/decode";
import {
  classifyOperationalDate,
  computeCausalAnchorEligibility,
  normalizeStatedStatus,
  OperationalDateAssertionSchema,
  operationalDateConfidence,
  parseOperationalDate,
} from "@bp/domain/documents/operational-date";
import { Result } from "effect";

describe("normalizeStatedStatus", () => {
  test("maps done-ish raw statuses", () => {
    for (const raw of ["completed", "Implemented", "occurred", "in service", "launched"]) {
      expect(normalizeStatedStatus(raw)).toBe("done");
    }
  });
  test("maps committed-future raw statuses", () => {
    for (const raw of ["scheduled", "planned", "upcoming", "announced"]) {
      expect(normalizeStatedStatus(raw)).toBe("committed_future");
    }
  });
  test("maps proposal/approval raw statuses (not operational)", () => {
    for (const raw of ["proposed", "conceptual", "approved", "under review"]) {
      expect(normalizeStatedStatus(raw)).toBe("proposed");
    }
  });
  test("ambiguous in-progress statuses fall through to unknown (conservative)", () => {
    expect(normalizeStatedStatus("ongoing")).toBe("unknown");
    expect(normalizeStatedStatus("in_progress")).toBe("unknown");
    expect(normalizeStatedStatus(null)).toBe("unknown");
    expect(normalizeStatedStatus("")).toBe("unknown");
  });
});

describe("classifyOperationalDate", () => {
  test("completed operational change with date -> source-stated operational date (trusted)", () => {
    // M15 SBS / 2010 / completed
    const r = classifyOperationalDate({
      statusRaw: "completed",
      dateText: "2010",
      datePrecision: "year",
      eventKind: "service_change",
    });
    expect(r.validationState).toBe("source_stated_operational_date");
    expect(r.dateBasis).toBe("source_stated_complete");
    expect(r.trustedOperationalDate).toBe(true);
  });

  test("planned/scheduled launch with date -> source-stated planned date (trusted per source)", () => {
    // 14th St busway / Oct 3 2019 / scheduled, and B46 SBS / 7-3-16 / planned
    for (const status of ["scheduled", "planned"]) {
      const r = classifyOperationalDate({
        statusRaw: status,
        dateText: "October 3, 2019",
        datePrecision: "day",
        eventKind: "physical_bus_priority_change",
      });
      expect(r.validationState).toBe("source_stated_planned_date");
      expect(r.dateBasis).toBe("source_stated_plan");
      expect(r.trustedOperationalDate).toBe(true);
    }
  });

  test("community engagement is non-operational regardless of completion status", () => {
    const r = classifyOperationalDate({
      statusRaw: "completed",
      dateText: "2014-10-22",
      datePrecision: "day",
      eventKind: "public_engagement",
    });
    expect(r.validationState).toBe("non_operational_milestone");
    expect(r.trustedOperationalDate).toBe(false);
  });

  test("evaluation report date is not a treatment anchor", () => {
    const r = classifyOperationalDate({
      statusRaw: "completed",
      dateText: "2024",
      datePrecision: "year",
      eventKind: "evaluation_report",
    });
    expect(r.validationState).toBe("non_operational_milestone");
    expect(r.trustedOperationalDate).toBe(false);
  });

  test("proposed operational change is a non-operational milestone (no commitment)", () => {
    const r = classifyOperationalDate({
      statusRaw: "proposed",
      dateText: "2025",
      datePrecision: "year",
      eventKind: "physical_bus_priority_change",
    });
    expect(r.validationState).toBe("non_operational_milestone");
    expect(r.trustedOperationalDate).toBe(false);
  });

  test("operational change with operational status but no date -> operational_without_date", () => {
    const r = classifyOperationalDate({
      statusRaw: "completed",
      dateText: "",
      datePrecision: "unknown",
      eventKind: "service_change",
    });
    expect(r.validationState).toBe("operational_without_date");
    expect(r.trustedOperationalDate).toBe(false);
  });

  test("source family veto: an operational-kind event whose source family is a meeting/outreach is non-operational", () => {
    // eventKind mislabels these as service_change, but familyRaw is faithful.
    for (const familyRaw of [
      "community_engagement",
      "public_outreach",
      "community_board_meeting",
      "project_phase",
      "corridor_selection",
    ]) {
      const r = classifyOperationalDate({
        statusRaw: "completed",
        dateText: "2015",
        datePrecision: "year",
        eventKind: "service_change",
        familyRaw,
      });
      expect(r.validationState).toBe("non_operational_milestone");
      expect(r.trustedOperationalDate).toBe(false);
    }
  });

  test("source family veto does NOT fire on genuine implementation/launch families", () => {
    for (const familyRaw of [
      "service_launch",
      "busway_implementation",
      "tsp_deployment",
      "capital_project",
      "service_change",
    ]) {
      const r = classifyOperationalDate({
        statusRaw: "completed",
        dateText: "2019",
        datePrecision: "year",
        eventKind: "service_change",
        familyRaw,
      });
      expect(r.validationState).toBe("source_stated_operational_date");
    }
  });

  test("falls back to normalized eventStatus only when raw status is absent", () => {
    const r = classifyOperationalDate({
      statusRaw: null,
      dateText: "October 3, 2019",
      datePrecision: "day",
      eventKind: "physical_bus_priority_change",
      eventStatus: "implemented",
    });
    expect(r.sourceStatedStatus).toBe("done");
    expect(r.validationState).toBe("source_stated_operational_date");
  });

  test("raw status wins over the eventStatus fallback", () => {
    const r = classifyOperationalDate({
      statusRaw: "proposed",
      dateText: "2025",
      datePrecision: "year",
      eventKind: "service_change",
      eventStatus: "implemented",
    });
    expect(r.sourceStatedStatus).toBe("proposed");
    expect(r.validationState).toBe("non_operational_milestone");
  });

  test("placeholder date text (no digit) is treated as missing -> operational_without_date", () => {
    for (const dateText of ["future", "unknown", "during start-up period", "TBD"]) {
      const r = classifyOperationalDate({
        statusRaw: "completed",
        dateText,
        datePrecision: "unknown",
        eventKind: "service_change",
        familyRaw: "service_launch",
      });
      expect(r.validationState).toBe("operational_without_date");
    }
  });

  test("real dates of any precision are kept (digit present)", () => {
    for (const dateText of ["2010", "Spring 2016", "7/3/16", "October 3, 2019"]) {
      const r = classifyOperationalDate({
        statusRaw: "completed",
        dateText,
        datePrecision: "unknown",
        eventKind: "service_change",
        familyRaw: "service_launch",
      });
      expect(r.validationState).toBe("source_stated_operational_date");
    }
  });

  test("operational change with ambiguous status -> needs_review", () => {
    const r = classifyOperationalDate({
      statusRaw: "ongoing",
      dateText: "2020",
      datePrecision: "year",
      eventKind: "physical_bus_priority_change",
    });
    expect(r.validationState).toBe("needs_review");
    expect(r.trustedOperationalDate).toBe(false);
  });
});

test("OperationalDateAssertionSchema accepts a fully-formed assertion row", () => {
  const row = {
    surfaceId: "evt-1",
    sourceId: "src-1",
    sourceTitle: "NYC DOT 14th Street Busway Brochure",
    sourceGroup: "nyc_dot",
    displayLabel: "14th Street Busway",
    eventName: "14th Street Transit & Truck Priority Pilot Project start",
    treatmentText: "transit_and_truck_priority_corridor",
    locationText: "14th Street, Manhattan",
    operationalDate: "October 3, 2019",
    datePrecision: "day",
    statusRaw: "scheduled",
    familyRaw: "pilot_project_launch",
    subtypeRaw: "busway_implementation",
    eventKind: "physical_bus_priority_change",
    interventionFamily: "busway_or_transitway",
    sourceStatedStatus: "committed_future",
    dateBasis: "source_stated_plan",
    validationState: "source_stated_planned_date",
    trustedOperationalDate: true,
    classificationReasons: [
      "source states a planned/scheduled operational date (trusted per source)",
    ],
    evidenceRefs: [
      {
        blockId: "B0001",
        pageNumber: 1,
        lineStart: 2,
        lineEnd: 2,
        roleRaw: "start_date",
      },
    ],
    effectiveDateStart: "2019-10-03",
    effectiveDateEnd: "2019-10-03",
    implementationMonth: "2019-10",
    normalizedPrecision: "day",
    isRealizedOnset: false,
    routeIds: ["M14A+", "M14D+"],
    routeIdentityValidationState: "confirmed_in_current_gtfs",
    routeResolutionTier: "direct_event_text",
    interventionId: "intv_abc123",
    evidenceSourceIds: ["src-1"],
    sourceCount: 1,
    confidence: 0.8,
    causalAnchorEligible: false,
  };
  expect(Result.isSuccess(decodeEitherStrict(OperationalDateAssertionSchema)(row))).toBe(true);
});

describe("parseOperationalDate", () => {
  test("US-slash dates -> day precision (fixes the upstream year/unknown bug)", () => {
    expect(parseOperationalDate("7/3/16")).toMatchObject({
      effectiveDateStart: "2016-07-03",
      precision: "day",
      implementationMonth: "2016-07",
    });
    expect(parseOperationalDate("07/26/2024")).toMatchObject({
      effectiveDateStart: "2024-07-26",
      precision: "day",
    });
    expect(parseOperationalDate("10/01/18")).toMatchObject({
      effectiveDateStart: "2018-10-01",
      precision: "day",
    });
  });
  test("month-name and ISO forms", () => {
    expect(parseOperationalDate("October 3, 2019")).toMatchObject({
      effectiveDateStart: "2019-10-03",
      precision: "day",
    });
    expect(parseOperationalDate("June 2013")).toMatchObject({
      implementationMonth: "2013-06",
      precision: "month",
    });
    expect(parseOperationalDate("2010-05-17")).toMatchObject({
      effectiveDateStart: "2010-05-17",
      precision: "day",
    });
  });
  test("year, range, and season precision", () => {
    expect(parseOperationalDate("2010")).toMatchObject({
      precision: "year",
      implementationMonth: null,
    });
    expect(parseOperationalDate("by 2022")).toMatchObject({
      precision: "year",
    });
    expect(parseOperationalDate("2015-2016")).toMatchObject({
      precision: "range",
      effectiveDateStart: "2015-01-01",
      effectiveDateEnd: "2016-12-31",
    });
    expect(parseOperationalDate("Spring/Summer 2017")).toMatchObject({
      precision: "season",
    });
  });
  test("non-dates -> unknown (rejected as anchors)", () => {
    for (const text of [
      "concurrent with Bx41 SBS launch",
      "Over the next 6 months",
      "Map Date",
      "future",
      "during start-up period",
      "TBD",
      "",
    ]) {
      expect(parseOperationalDate(text).precision).toBe("unknown");
    }
  });
});

describe("anchor adapter helpers", () => {
  test("causalAnchorEligible requires realized + month-or-finer + a route", () => {
    expect(
      computeCausalAnchorEligibility({
        trustedOperationalDate: true,
        isRealizedOnset: true,
        normalizedPrecision: "month",
        routeCount: 2,
      }),
    ).toBe(true);
    expect(
      computeCausalAnchorEligibility({
        trustedOperationalDate: true,
        isRealizedOnset: true,
        normalizedPrecision: "year",
        routeCount: 2,
      }),
    ).toBe(false);
    expect(
      computeCausalAnchorEligibility({
        trustedOperationalDate: true,
        isRealizedOnset: false,
        normalizedPrecision: "day",
        routeCount: 2,
      }),
    ).toBe(false);
    expect(
      computeCausalAnchorEligibility({
        trustedOperationalDate: true,
        isRealizedOnset: true,
        normalizedPrecision: "day",
        routeCount: 0,
      }),
    ).toBe(false);
  });
  test("confidence is bounded and rewards realized + day-precision + direct route text", () => {
    const hi = operationalDateConfidence({
      dateBasis: "source_stated_complete",
      normalizedPrecision: "day",
      routeResolutionTier: "direct_event_text",
    });
    const lo = operationalDateConfidence({
      dateBasis: "not_operational",
      normalizedPrecision: "unknown",
      routeResolutionTier: null,
    });
    expect(hi).toBeGreaterThan(lo);
    expect(hi).toBeLessThanOrEqual(1);
    expect(lo).toBeGreaterThanOrEqual(0);
  });
});

describe("classifier fixes from audit", () => {
  test("negated status (not_implemented / denied) is not treated as operational", () => {
    expect(normalizeStatedStatus("not_implemented")).toBe("proposed");
    expect(normalizeStatedStatus("denied")).toBe("proposed");
    expect(normalizeStatedStatus("cancelled")).toBe("proposed");
  });
  test("disjunctive X_or_Y status -> unknown (review)", () => {
    expect(normalizeStatedStatus("proposed_or_implemented")).toBe("unknown");
    expect(normalizeStatedStatus("completed_or_planned")).toBe("unknown");
  });
  test("recall rescue: operational family overrides a non-operational eventKind", () => {
    const r = classifyOperationalDate({
      statusRaw: "completed",
      dateText: "August 2015",
      datePrecision: "month",
      eventKind: "planning_or_design_milestone",
      familyRaw: "infrastructure_implementation",
      subtypeRaw: "bus_lane",
    });
    expect(r.validationState).toBe("source_stated_operational_date");
  });
  test("subway-mode event is vetoed out of bus operational dates", () => {
    const r = classifyOperationalDate({
      statusRaw: "completed",
      dateText: "2024",
      datePrecision: "year",
      eventKind: "service_change",
      familyRaw: "service_disruption",
      eventName: "G Train shutdown Summer 2024",
    });
    expect(r.validationState).toBe("non_operational_milestone");
  });
});
