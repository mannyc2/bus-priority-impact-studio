import { describe, expect, test } from "bun:test";
import {
  buildAceViolationAggregateEvents,
  contextEventId,
  normalizeContextEventTime,
  parseContextEventPayloadJson,
} from "../src/local-db/context-events";

describe("context event local-db transforms", () => {
  test("uses stable source and row identifiers for event ids", () => {
    expect(contextEventId("nyc_311", "123")).toBe("539d87d59051d4d27a72380eead18987309b723e");
  });

  test("normalizes compact parking violation times", () => {
    expect(normalizeContextEventTime("0930A")).toBe("09:30:00");
    expect(normalizeContextEventTime("1230A")).toBe("00:30:00");
    expect(normalizeContextEventTime("0315P")).toBe("15:15:00");
    expect(normalizeContextEventTime("not-a-time")).toBe("00:00:00");
  });

  test("groups ACE violation rows by month and route", () => {
    const events = buildAceViolationAggregateEvents({
      ingestedAt: "2026-06-01T00:00:00.000Z",
      rows: [
        {
          month: "2026-05",
          route_id: "M15",
          violation_type: "bus_lane",
          violation_status: "issued",
          violation_count: 10,
        },
        {
          month: "2026-05",
          route_id: "M15",
          violation_type: "bus_stop",
          violation_status: "issued",
          violation_count: 4,
        },
        {
          month: "2026-05",
          route_id: "Bx12",
          violation_type: "bus_lane",
          violation_status: "issued",
          violation_count: 2,
        },
      ],
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      sourceId: "nyc_mta_ace_violations",
      sourceRowId: "2026-05-M15",
      eventKind: "ace_violation_aggregate",
      routeId: "M15",
      occurredAt: "2026-05-01T00:00:00",
      ingestedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(JSON.parse(events[0]?.payloadJson ?? "{}")).toEqual({
      month: "2026-05",
      totalViolations: 14,
      breakdown: [
        { type: "bus_lane", status: "issued", count: 10 },
        { type: "bus_stop", status: "issued", count: 4 },
      ],
    });
    expect(events[1]?.sourceRowId).toBe("2026-05-Bx12");
  });

  test("parses context event payloads with the event-kind contract", () => {
    const parsed = parseContextEventPayloadJson({
      eventKind: "parking_violation",
      payloadJson: JSON.stringify({
        violationCode: 14,
        violationDescription: "No Standing",
        violationCounty: "K",
        houseNumber: null,
        streetName: "FULTON ST",
        intersectingStreet: null,
        streetCode1: "123",
        streetCode2: null,
        streetCode3: null,
      }),
    });

    expect(parsed).toMatchObject({
      violationCode: 14,
      streetName: "FULTON ST",
    });
  });

  test("rejects malformed context event payloads before they become evidence", () => {
    expect(() =>
      parseContextEventPayloadJson({
        eventKind: "traffic_speed",
        payloadJson: JSON.stringify({
          linkId: "123",
          linkName: null,
          borough: null,
          speed: "fast",
          travelTime: null,
          statusCode: "0",
        }),
      }),
    ).toThrow();
  });
});
