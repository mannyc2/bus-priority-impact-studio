import { describe, expect, test } from "bun:test";
import { normalizeGtfsRealtimeRouteId, parseGtfsRealtimeFeed } from "@bp/sources/gtfs-realtime";

const syntheticGtfsRealtimeBytes = new Uint8Array([
  10, 7, 10, 3, 50, 46, 48, 24, 123, 18, 18, 10, 4, 116, 114, 105, 112, 26, 10, 10, 8, 10, 6, 116,
  114, 105, 112, 45, 49, 18, 21, 10, 7, 118, 101, 104, 105, 99, 108, 101, 34, 10, 10, 8, 10, 6, 116,
  114, 105, 112, 45, 49, 18, 9, 10, 5, 97, 108, 101, 114, 116, 42, 0,
]);

describe("GTFS-RT parsing", () => {
  test("normalizes vehicle positions for route joins", () => {
    const parsed = parseGtfsRealtimeFeed(new Uint8Array([1, 2, 3]), {
      decoder: {
        decodeFeedMessage() {
          return {
            header: {
              gtfsRealtimeVersion: "2.0",
              timestamp: 1_779_000_000,
            },
            entity: [
              {
                id: "vehicle-1",
                vehicle: {
                  trip: {
                    tripId: "trip-1",
                    routeId: "MTA NYCT_M1",
                    directionId: 0,
                    startDate: "20260516",
                    startTime: "08:00:00",
                    scheduleRelationship: "SCHEDULED",
                  },
                  vehicle: {
                    id: "bus-1",
                    label: "Bus 1",
                  },
                  position: {
                    latitude: 40.741,
                    longitude: -73.989,
                    bearing: 180,
                    speed: 5.5,
                  },
                  currentStopSequence: 12,
                  stopId: "401234",
                  currentStatus: "IN_TRANSIT_TO",
                  timestamp: 1_779_000_010,
                  occupancyStatus: "MANY_SEATS_AVAILABLE",
                },
              },
            ],
          };
        },
      },
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        gtfsRealtimeVersion: "2.0",
        feedTimestamp: 1_779_000_000,
        entityCount: 1,
      }),
    );
    expect(parsed.vehiclePositions[0]).toEqual(
      expect.objectContaining({
        entityId: "vehicle-1",
        sourceRouteId: "MTA NYCT_M1",
        routeId: "M1",
        tripId: "trip-1",
        directionId: 0,
        vehicleId: "bus-1",
        currentStatus: "IN_TRANSIT_TO",
        occupancyStatus: "MANY_SEATS_AVAILABLE",
        timestamp: 1_779_000_010,
      }),
    );
  });

  test("normalizes trip updates, stop-time updates, and alerts", () => {
    const parsed = parseGtfsRealtimeFeed(new Uint8Array([1, 2, 3]), {
      decoder: {
        decodeFeedMessage() {
          return {
            header: {
              gtfsRealtimeVersion: "2.0",
              timestamp: 1_779_000_000,
            },
            entity: [
              {
                id: "trip-update-1",
                tripUpdate: {
                  trip: {
                    tripId: "trip-2",
                    routeId: "MTA NYCT_M14A+",
                    directionId: 1,
                  },
                  vehicle: {
                    id: "bus-2",
                  },
                  timestamp: 1_779_000_020,
                  delay: 90,
                  stopTimeUpdate: [
                    {
                      stopSequence: 8,
                      stopId: "409999",
                      arrival: {
                        delay: 60,
                        time: 1_779_000_200,
                      },
                      departure: {
                        delay: 75,
                        time: 1_779_000_220,
                      },
                      scheduleRelationship: "SCHEDULED",
                    },
                  ],
                },
              },
              {
                id: "alert-1",
                alert: {
                  cause: "CONSTRUCTION",
                  effect: "DETOUR",
                  informedEntity: [{ routeId: "MTA NYCT_M14A+" }],
                  headerText: {
                    translation: [{ text: "Detour", language: "en" }],
                  },
                },
              },
            ],
          };
        },
      },
    });

    expect(parsed.tripUpdates[0]).toEqual(
      expect.objectContaining({
        entityId: "trip-update-1",
        sourceRouteId: "MTA NYCT_M14A+",
        routeId: "M14A+",
        directionId: 1,
        vehicleId: "bus-2",
        delay: 90,
      }),
    );
    expect(parsed.stopTimeUpdates[0]).toEqual(
      expect.objectContaining({
        entityId: "trip-update-1",
        updateRank: 1,
        stopSequence: 8,
        stopId: "409999",
        arrivalDelay: 60,
        departureDelay: 75,
        scheduleRelationship: "SCHEDULED",
      }),
    );
    expect(parsed.alerts[0]).toEqual(
      expect.objectContaining({
        entityId: "alert-1",
        cause: "CONSTRUCTION",
        effect: "DETOUR",
      }),
    );
    expect(parsed.alerts[0]?.informedEntityJson).toContain("MTA NYCT_M14A+");
  });

  test("normalizes common MTA route id prefixes", () => {
    expect(normalizeGtfsRealtimeRouteId("MTA NYCT_BX12+")).toBe("BX12+");
    expect(normalizeGtfsRealtimeRouteId("M1")).toBe("M1");
    expect(normalizeGtfsRealtimeRouteId(null)).toBeNull();
  });

  test("accepts an injected decoder so vendor bindings stay private", () => {
    const parsed = parseGtfsRealtimeFeed(new Uint8Array([1, 2, 3]), {
      decoder: {
        decodeFeedMessage() {
          return {
            header: {
              gtfsRealtimeVersion: "2.0",
              timestamp: 1_779_000_000,
            },
            entity: [
              {
                id: "vehicle-1",
                vehicle: {
                  trip: {
                    routeId: "MTA NYCT_M1",
                  },
                },
              },
            ],
          };
        },
      },
    });

    expect(parsed.vehiclePositions[0]).toEqual(
      expect.objectContaining({
        entityId: "vehicle-1",
        sourceRouteId: "MTA NYCT_M1",
        routeId: "M1",
      }),
    );
  });

  test("uses the default nyc-transit-kit decoder", () => {
    const parsed = parseGtfsRealtimeFeed(syntheticGtfsRealtimeBytes, {
      feedType: "vehicle_positions",
    });

    expect(parsed.gtfsRealtimeVersion).toBe("2.0");
    expect(parsed.entityCount).toBe(3);
    expect(parsed.vehiclePositions).toHaveLength(1);
    expect(parsed.tripUpdates).toHaveLength(1);
    expect(parsed.alerts).toHaveLength(1);
  });
});
