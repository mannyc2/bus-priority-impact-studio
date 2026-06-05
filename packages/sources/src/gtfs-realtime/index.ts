import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import { schemaVersion } from "../core/index.js";
import {
  createDefaultGtfsRealtimeDecoder,
  decodeGtfsRealtimeFeedMessage,
  type GtfsRealtimeDecoder,
} from "./decoder.js";

export type { GtfsRealtimeDecoder } from "./decoder.js";
export { createDefaultGtfsRealtimeDecoder } from "./decoder.js";

export const GtfsRtFeedTypeSchema = z.enum(["vehicle_positions", "trip_updates", "alerts"]);
export type GtfsRtFeedType = z.output<typeof GtfsRtFeedTypeSchema>;

export const NormalizedGtfsRtVehiclePositionSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    entityId: z.string().min(1),
    entityDeleted: z.boolean(),
    gtfsRealtimeVersion: z.string().nullable(),
    feedTimestamp: z.number().int().nullable(),
    sourceRouteId: z.string().nullable(),
    routeId: z.string().nullable(),
    tripId: z.string().nullable(),
    startDate: z.string().nullable(),
    startTime: z.string().nullable(),
    directionId: z.number().int().nullable(),
    scheduleRelationship: z.string().nullable(),
    vehicleId: z.string().nullable(),
    vehicleLabel: z.string().nullable(),
    vehicleLicensePlate: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    bearing: z.number().nullable(),
    odometer: z.number().nullable(),
    speed: z.number().nullable(),
    currentStopSequence: z.number().int().nullable(),
    stopId: z.string().nullable(),
    currentStatus: z.string().nullable(),
    timestamp: z.number().int().nullable(),
    congestionLevel: z.string().nullable(),
    occupancyStatus: z.string().nullable(),
    occupancyPercentage: z.number().nullable(),
  })
  .strict();

export const NormalizedGtfsRtTripUpdateSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    entityId: z.string().min(1),
    entityDeleted: z.boolean(),
    gtfsRealtimeVersion: z.string().nullable(),
    feedTimestamp: z.number().int().nullable(),
    sourceRouteId: z.string().nullable(),
    routeId: z.string().nullable(),
    tripId: z.string().nullable(),
    startDate: z.string().nullable(),
    startTime: z.string().nullable(),
    directionId: z.number().int().nullable(),
    scheduleRelationship: z.string().nullable(),
    vehicleId: z.string().nullable(),
    vehicleLabel: z.string().nullable(),
    vehicleLicensePlate: z.string().nullable(),
    timestamp: z.number().int().nullable(),
    delay: z.number().int().nullable(),
  })
  .strict();

export const NormalizedGtfsRtStopTimeUpdateSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    entityId: z.string().min(1),
    updateRank: z.number().int().positive(),
    stopSequence: z.number().int().nullable(),
    stopId: z.string().nullable(),
    arrivalDelay: z.number().int().nullable(),
    arrivalTime: z.number().int().nullable(),
    arrivalUncertainty: z.number().int().nullable(),
    departureDelay: z.number().int().nullable(),
    departureTime: z.number().int().nullable(),
    departureUncertainty: z.number().int().nullable(),
    scheduleRelationship: z.string().nullable(),
    assignedStopId: z.string().nullable(),
  })
  .strict();

export const NormalizedGtfsRtAlertSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    entityId: z.string().min(1),
    entityDeleted: z.boolean(),
    gtfsRealtimeVersion: z.string().nullable(),
    feedTimestamp: z.number().int().nullable(),
    cause: z.string().nullable(),
    effect: z.string().nullable(),
    activePeriodJson: z.string().nullable(),
    informedEntityJson: z.string().nullable(),
    urlJson: z.string().nullable(),
    headerTextJson: z.string().nullable(),
    descriptionTextJson: z.string().nullable(),
  })
  .strict();

export const NormalizedGtfsRtFeedSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    gtfsRealtimeVersion: z.string().nullable(),
    feedTimestamp: z.number().int().nullable(),
    entityCount: z.number().int().nonnegative(),
    vehiclePositions: z.array(NormalizedGtfsRtVehiclePositionSchema),
    tripUpdates: z.array(NormalizedGtfsRtTripUpdateSchema),
    stopTimeUpdates: z.array(NormalizedGtfsRtStopTimeUpdateSchema),
    alerts: z.array(NormalizedGtfsRtAlertSchema),
  })
  .strict();

export type NormalizedGtfsRtVehiclePosition = z.output<
  typeof NormalizedGtfsRtVehiclePositionSchema
>;
export type NormalizedGtfsRtTripUpdate = z.output<typeof NormalizedGtfsRtTripUpdateSchema>;
export type NormalizedGtfsRtStopTimeUpdate = z.output<typeof NormalizedGtfsRtStopTimeUpdateSchema>;
export type NormalizedGtfsRtAlert = z.output<typeof NormalizedGtfsRtAlertSchema>;
export type NormalizedGtfsRtFeed = z.output<typeof NormalizedGtfsRtFeedSchema>;

type PlainFeedMessage = {
  header?: {
    gtfsRealtimeVersion?: unknown;
    timestamp?: unknown;
  };
  entity?: PlainFeedEntity[];
};

type PlainFeedEntity = {
  id?: unknown;
  isDeleted?: unknown;
  tripUpdate?: PlainTripUpdate;
  vehicle?: PlainVehiclePosition;
  alert?: PlainAlert;
};

type PlainTripDescriptor = {
  tripId?: unknown;
  routeId?: unknown;
  directionId?: unknown;
  startDate?: unknown;
  startTime?: unknown;
  scheduleRelationship?: unknown;
};

type PlainVehicleDescriptor = {
  id?: unknown;
  label?: unknown;
  licensePlate?: unknown;
};

type PlainPosition = {
  latitude?: unknown;
  longitude?: unknown;
  bearing?: unknown;
  odometer?: unknown;
  speed?: unknown;
};

type PlainStopTimeEvent = {
  delay?: unknown;
  time?: unknown;
  uncertainty?: unknown;
};

type PlainStopTimeUpdate = {
  stopSequence?: unknown;
  stopId?: unknown;
  arrival?: PlainStopTimeEvent;
  departure?: PlainStopTimeEvent;
  scheduleRelationship?: unknown;
  stopTimeProperties?: { assignedStopId?: unknown };
};

type PlainTripUpdate = {
  trip?: PlainTripDescriptor;
  vehicle?: PlainVehicleDescriptor;
  stopTimeUpdate?: PlainStopTimeUpdate[];
  timestamp?: unknown;
  delay?: unknown;
};

type PlainVehiclePosition = {
  trip?: PlainTripDescriptor;
  vehicle?: PlainVehicleDescriptor;
  position?: PlainPosition;
  currentStopSequence?: unknown;
  stopId?: unknown;
  currentStatus?: unknown;
  timestamp?: unknown;
  congestionLevel?: unknown;
  occupancyStatus?: unknown;
  occupancyPercentage?: unknown;
};

type PlainAlert = {
  activePeriod?: unknown;
  informedEntity?: unknown;
  cause?: unknown;
  effect?: unknown;
  url?: unknown;
  headerText?: unknown;
  descriptionText?: unknown;
};

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerOrNull(value: unknown): number | null {
  const valueAsNumber = numberOrNull(value);
  return valueAsNumber === null ? null : Math.trunc(valueAsNumber);
}

function booleanOrFalse(value: unknown): boolean {
  return value === true;
}

function jsonOrNull(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

export function normalizeGtfsRealtimeRouteId(value: unknown): string | null {
  const sourceRouteId = textOrNull(value);
  if (sourceRouteId === null) {
    return null;
  }

  const routeId = sourceRouteId.includes("_")
    ? sourceRouteId.split("_").at(-1)
    : sourceRouteId.trim();
  if (routeId === undefined || routeId.length === 0) {
    return null;
  }

  return z.decode(RouteIdCodec, routeId);
}

function commonTripFields(trip: PlainTripDescriptor | undefined) {
  const sourceRouteId = textOrNull(trip?.routeId);

  return {
    sourceRouteId,
    routeId: normalizeGtfsRealtimeRouteId(sourceRouteId),
    tripId: textOrNull(trip?.tripId),
    startDate: textOrNull(trip?.startDate),
    startTime: textOrNull(trip?.startTime),
    directionId: integerOrNull(trip?.directionId),
    scheduleRelationship: textOrNull(trip?.scheduleRelationship),
  };
}

function commonVehicleFields(vehicle: PlainVehicleDescriptor | undefined) {
  return {
    vehicleId: textOrNull(vehicle?.id),
    vehicleLabel: textOrNull(vehicle?.label),
    vehicleLicensePlate: textOrNull(vehicle?.licensePlate),
  };
}

export type ParseGtfsRealtimeFeedOptions = {
  decoder?: GtfsRealtimeDecoder;
  sourceId?: string;
  feedType?: GtfsRtFeedType | "mixed";
};

function decodeFeedObject(
  bytes: Uint8Array,
  decoder: GtfsRealtimeDecoder = createDefaultGtfsRealtimeDecoder(),
): PlainFeedMessage {
  return decodeGtfsRealtimeFeedMessage(bytes, decoder) as PlainFeedMessage;
}

export function parseGtfsRealtimeFeed(
  bytes: Uint8Array,
  options: ParseGtfsRealtimeFeedOptions = {},
): NormalizedGtfsRtFeed {
  const feed = decodeFeedObject(bytes, options.decoder);
  const gtfsRealtimeVersion = textOrNull(feed.header?.gtfsRealtimeVersion);
  const feedTimestamp = integerOrNull(feed.header?.timestamp);
  const entities = feed.entity ?? [];
  const vehiclePositions: NormalizedGtfsRtVehiclePosition[] = [];
  const tripUpdates: NormalizedGtfsRtTripUpdate[] = [];
  const stopTimeUpdates: NormalizedGtfsRtStopTimeUpdate[] = [];
  const alerts: NormalizedGtfsRtAlert[] = [];

  for (const [entityIndex, entity] of entities.entries()) {
    const entityId = textOrNull(entity.id) ?? `entity-${entityIndex + 1}`;
    const entityDeleted = booleanOrFalse(entity.isDeleted);

    if (entity.vehicle !== undefined) {
      const vehicle = entity.vehicle;
      vehiclePositions.push(
        NormalizedGtfsRtVehiclePositionSchema.parse({
          schemaVersion,
          entityId,
          entityDeleted,
          gtfsRealtimeVersion,
          feedTimestamp,
          ...commonTripFields(vehicle.trip),
          ...commonVehicleFields(vehicle.vehicle),
          latitude: numberOrNull(vehicle.position?.latitude),
          longitude: numberOrNull(vehicle.position?.longitude),
          bearing: numberOrNull(vehicle.position?.bearing),
          odometer: numberOrNull(vehicle.position?.odometer),
          speed: numberOrNull(vehicle.position?.speed),
          currentStopSequence: integerOrNull(vehicle.currentStopSequence),
          stopId: textOrNull(vehicle.stopId),
          currentStatus: textOrNull(vehicle.currentStatus),
          timestamp: integerOrNull(vehicle.timestamp),
          congestionLevel: textOrNull(vehicle.congestionLevel),
          occupancyStatus: textOrNull(vehicle.occupancyStatus),
          occupancyPercentage: numberOrNull(vehicle.occupancyPercentage),
        }),
      );
    }

    if (entity.tripUpdate !== undefined) {
      const tripUpdate = entity.tripUpdate;
      tripUpdates.push(
        NormalizedGtfsRtTripUpdateSchema.parse({
          schemaVersion,
          entityId,
          entityDeleted,
          gtfsRealtimeVersion,
          feedTimestamp,
          ...commonTripFields(tripUpdate.trip),
          ...commonVehicleFields(tripUpdate.vehicle),
          timestamp: integerOrNull(tripUpdate.timestamp),
          delay: integerOrNull(tripUpdate.delay),
        }),
      );

      for (const [updateIndex, update] of (tripUpdate.stopTimeUpdate ?? []).entries()) {
        stopTimeUpdates.push(
          NormalizedGtfsRtStopTimeUpdateSchema.parse({
            schemaVersion,
            entityId,
            updateRank: updateIndex + 1,
            stopSequence: integerOrNull(update.stopSequence),
            stopId: textOrNull(update.stopId),
            arrivalDelay: integerOrNull(update.arrival?.delay),
            arrivalTime: integerOrNull(update.arrival?.time),
            arrivalUncertainty: integerOrNull(update.arrival?.uncertainty),
            departureDelay: integerOrNull(update.departure?.delay),
            departureTime: integerOrNull(update.departure?.time),
            departureUncertainty: integerOrNull(update.departure?.uncertainty),
            scheduleRelationship: textOrNull(update.scheduleRelationship),
            assignedStopId: textOrNull(update.stopTimeProperties?.assignedStopId),
          }),
        );
      }
    }

    if (entity.alert !== undefined) {
      const alert = entity.alert;
      alerts.push(
        NormalizedGtfsRtAlertSchema.parse({
          schemaVersion,
          entityId,
          entityDeleted,
          gtfsRealtimeVersion,
          feedTimestamp,
          cause: textOrNull(alert.cause),
          effect: textOrNull(alert.effect),
          activePeriodJson: jsonOrNull(alert.activePeriod),
          informedEntityJson: jsonOrNull(alert.informedEntity),
          urlJson: jsonOrNull(alert.url),
          headerTextJson: jsonOrNull(alert.headerText),
          descriptionTextJson: jsonOrNull(alert.descriptionText),
        }),
      );
    }
  }

  return NormalizedGtfsRtFeedSchema.parse({
    schemaVersion,
    gtfsRealtimeVersion,
    feedTimestamp,
    entityCount: entities.length,
    vehiclePositions,
    tripUpdates,
    stopTimeUpdates,
    alerts,
  });
}
