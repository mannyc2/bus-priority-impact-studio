import { decodeStrict } from "@bp/domain/decode";
import { RouteIdCodec } from "@bp/domain/primitives";
import { Schema } from "effect";
import { schemaVersion } from "../core/index.js";
import {
  createDefaultGtfsRealtimeDecoder,
  decodeGtfsRealtimeFeedMessage,
  type GtfsRealtimeDecoder,
} from "./decoder.js";

export type { GtfsRealtimeDecoder } from "./decoder.js";
export { createDefaultGtfsRealtimeDecoder } from "./decoder.js";

export const GtfsRtFeedTypeSchema = Schema.Literals([
  "vehicle_positions",
  "trip_updates",
  "alerts",
]);
export type GtfsRtFeedType = typeof GtfsRtFeedTypeSchema.Type;

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const Integer = Schema.Number.check(Schema.isInt());
const NullableString = Schema.NullOr(Schema.String);
const NullableInteger = Schema.NullOr(Integer);
const NullableNumber = Schema.NullOr(Schema.Number);

export const NormalizedGtfsRtVehiclePositionSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  entityId: NonEmptyString,
  entityDeleted: Schema.Boolean,
  gtfsRealtimeVersion: NullableString,
  feedTimestamp: NullableInteger,
  sourceRouteId: NullableString,
  routeId: NullableString,
  tripId: NullableString,
  startDate: NullableString,
  startTime: NullableString,
  directionId: NullableInteger,
  scheduleRelationship: NullableString,
  vehicleId: NullableString,
  vehicleLabel: NullableString,
  vehicleLicensePlate: NullableString,
  latitude: NullableNumber,
  longitude: NullableNumber,
  bearing: NullableNumber,
  odometer: NullableNumber,
  speed: NullableNumber,
  currentStopSequence: NullableInteger,
  stopId: NullableString,
  currentStatus: NullableString,
  timestamp: NullableInteger,
  congestionLevel: NullableString,
  occupancyStatus: NullableString,
  occupancyPercentage: NullableNumber,
});

export const NormalizedGtfsRtTripUpdateSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  entityId: NonEmptyString,
  entityDeleted: Schema.Boolean,
  gtfsRealtimeVersion: NullableString,
  feedTimestamp: NullableInteger,
  sourceRouteId: NullableString,
  routeId: NullableString,
  tripId: NullableString,
  startDate: NullableString,
  startTime: NullableString,
  directionId: NullableInteger,
  scheduleRelationship: NullableString,
  vehicleId: NullableString,
  vehicleLabel: NullableString,
  vehicleLicensePlate: NullableString,
  timestamp: NullableInteger,
  delay: NullableInteger,
});

export const NormalizedGtfsRtStopTimeUpdateSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  entityId: NonEmptyString,
  updateRank: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  stopSequence: NullableInteger,
  stopId: NullableString,
  arrivalDelay: NullableInteger,
  arrivalTime: NullableInteger,
  arrivalUncertainty: NullableInteger,
  departureDelay: NullableInteger,
  departureTime: NullableInteger,
  departureUncertainty: NullableInteger,
  scheduleRelationship: NullableString,
  assignedStopId: NullableString,
});

export const NormalizedGtfsRtAlertSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  entityId: NonEmptyString,
  entityDeleted: Schema.Boolean,
  gtfsRealtimeVersion: NullableString,
  feedTimestamp: NullableInteger,
  cause: NullableString,
  effect: NullableString,
  activePeriodJson: NullableString,
  informedEntityJson: NullableString,
  urlJson: NullableString,
  headerTextJson: NullableString,
  descriptionTextJson: NullableString,
});

export const NormalizedGtfsRtFeedSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  gtfsRealtimeVersion: NullableString,
  feedTimestamp: NullableInteger,
  entityCount: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  vehiclePositions: Schema.Array(NormalizedGtfsRtVehiclePositionSchema),
  tripUpdates: Schema.Array(NormalizedGtfsRtTripUpdateSchema),
  stopTimeUpdates: Schema.Array(NormalizedGtfsRtStopTimeUpdateSchema),
  alerts: Schema.Array(NormalizedGtfsRtAlertSchema),
});

export type NormalizedGtfsRtVehiclePosition = typeof NormalizedGtfsRtVehiclePositionSchema.Type;
export type NormalizedGtfsRtTripUpdate = typeof NormalizedGtfsRtTripUpdateSchema.Type;
export type NormalizedGtfsRtStopTimeUpdate = typeof NormalizedGtfsRtStopTimeUpdateSchema.Type;
export type NormalizedGtfsRtAlert = typeof NormalizedGtfsRtAlertSchema.Type;
export type NormalizedGtfsRtFeed = typeof NormalizedGtfsRtFeedSchema.Type;

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

  return decodeStrict(RouteIdCodec)(routeId);
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
  feedType?: GtfsRtFeedType | "mixed",
): PlainFeedMessage {
  return decodeGtfsRealtimeFeedMessage(bytes, decoder, feedType) as PlainFeedMessage;
}

export function parseGtfsRealtimeFeed(
  bytes: Uint8Array,
  options: ParseGtfsRealtimeFeedOptions = {},
): NormalizedGtfsRtFeed {
  const feed = decodeFeedObject(bytes, options.decoder, options.feedType);
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

    if (entity.vehicle !== undefined && entity.vehicle !== null) {
      const vehicle = entity.vehicle;
      vehiclePositions.push(
        decodeStrict(NormalizedGtfsRtVehiclePositionSchema)({
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

    if (entity.tripUpdate !== undefined && entity.tripUpdate !== null) {
      const tripUpdate = entity.tripUpdate;
      tripUpdates.push(
        decodeStrict(NormalizedGtfsRtTripUpdateSchema)({
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
          decodeStrict(NormalizedGtfsRtStopTimeUpdateSchema)({
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

    if (entity.alert !== undefined && entity.alert !== null) {
      const alert = entity.alert;
      alerts.push(
        decodeStrict(NormalizedGtfsRtAlertSchema)({
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

  return decodeStrict(NormalizedGtfsRtFeedSchema)({
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
