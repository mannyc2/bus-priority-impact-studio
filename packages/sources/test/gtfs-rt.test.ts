import { describe, expect, test } from "bun:test";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { normalizeGtfsRtRouteId, parseGtfsRtFeed } from "../src/mta/index.js";

const { transit_realtime: rt } = GtfsRealtimeBindings;

function encodeFeed(message: Parameters<typeof rt.FeedMessage.create>[0]): Uint8Array {
  return rt.FeedMessage.encode(rt.FeedMessage.create(message)).finish();
}

describe("GTFS-RT parsing", () => {
  test("normalizes vehicle positions for route joins", () => {
    const bytes = encodeFeed({
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
              scheduleRelationship: rt.TripDescriptor.ScheduleRelationship.SCHEDULED,
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
            currentStatus: rt.VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO,
            timestamp: 1_779_000_010,
            occupancyStatus: rt.VehiclePosition.OccupancyStatus.MANY_SEATS_AVAILABLE,
          },
        },
      ],
    });

    const parsed = parseGtfsRtFeed(bytes);

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
    const bytes = encodeFeed({
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
                scheduleRelationship: rt.TripUpdate.StopTimeUpdate.ScheduleRelationship.SCHEDULED,
              },
            ],
          },
        },
        {
          id: "alert-1",
          alert: {
            cause: rt.Alert.Cause.CONSTRUCTION,
            effect: rt.Alert.Effect.DETOUR,
            informedEntity: [{ routeId: "MTA NYCT_M14A+" }],
            headerText: {
              translation: [{ text: "Detour", language: "en" }],
            },
          },
        },
      ],
    });

    const parsed = parseGtfsRtFeed(bytes);

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
    expect(normalizeGtfsRtRouteId("MTA NYCT_BX12+")).toBe("BX12+");
    expect(normalizeGtfsRtRouteId("M1")).toBe("M1");
    expect(normalizeGtfsRtRouteId(null)).toBeNull();
  });
});
