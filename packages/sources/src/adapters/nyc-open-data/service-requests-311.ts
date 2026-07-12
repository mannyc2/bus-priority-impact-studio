import { decodePreserve } from "@bp/domain/decode";
import { Effect, Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

export const ServiceRequestEraSchema = Schema.Literals(["current", "historical"]);
export type ServiceRequestEra = typeof ServiceRequestEraSchema.Type;

export const CurbFriction311CategorySchema = Schema.Literals([
  "double_parking",
  "blocked_lane",
  "blocked_driveway",
  "blocked_hydrant",
  "blocked_bus_stop",
]);
export type CurbFriction311Category = typeof CurbFriction311CategorySchema.Type;

export type CurbFriction311Classification = {
  category: CurbFriction311Category;
  rule: string;
};

// Deterministic complaint-type allowlist for curb-friction 311 ingest.
export const CURB_FRICTION_311_COMPLAINT_TYPES = [
  "Blocked Driveway",
  "Illegal Parking",
  "Bus Stop Condition",
] as const;

// Older broad bus-relevant complaint list, retained for explicit exploratory overrides.
export const BUS_RELEVANT_311_COMPLAINTS = [
  "Blocked Driveway",
  "Illegal Parking",
  "Traffic Signal Condition",
  "Street Condition",
  "Bus Stop Condition",
  "Posted Parking Sign Violation",
  "Drag Racing",
  "Derelict Vehicle",
  "Traffic",
] as const;

function normalizedText(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function hasAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

export function classify311CurbFriction(input: {
  complaintType: string | null;
  descriptor: string | null;
}): CurbFriction311Classification | null {
  const complaintType = normalizedText(input.complaintType);
  const descriptor = normalizedText(input.descriptor);

  if (complaintType === "blocked driveway") {
    return {
      category: "blocked_driveway",
      rule: "complaint_type:blocked_driveway",
    };
  }

  if (complaintType === "illegal parking") {
    if (descriptor.includes("double park")) {
      return {
        category: "double_parking",
        rule: "illegal_parking_descriptor:double_parked",
      };
    }
    if (descriptor.includes("hydrant")) {
      return {
        category: "blocked_hydrant",
        rule: "illegal_parking_descriptor:hydrant",
      };
    }
    if (descriptor.includes("bus stop")) {
      return {
        category: "blocked_bus_stop",
        rule: "illegal_parking_descriptor:bus_stop",
      };
    }
    if (hasAny(descriptor, ["blocked lane", "blocking traffic", "blocked bike lane", "bus lane"])) {
      return {
        category: "blocked_lane",
        rule: "illegal_parking_descriptor:blocked_lane",
      };
    }
  }

  if (
    complaintType === "bus stop condition" &&
    hasAny(descriptor, ["blocked", "obstruct", "illegal parking", "no standing"])
  ) {
    return {
      category: "blocked_bus_stop",
      rule: "bus_stop_condition_descriptor:blocked_or_obstructed",
    };
  }

  return null;
}

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NullableString = Schema.NullOr(Schema.String);
const OptionalNullableString = NullableString.pipe(
  Schema.withDecodingDefaultTypeKey(Effect.succeed(null)),
);
const CoercedString = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transform((value) => String(value)),
    encode: SchemaGetter.passthrough(),
  }),
);
const NullableNumber = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.NullOr(Schema.Number), {
    decode: SchemaGetter.transform((value) =>
      value === null || value === undefined ? null : Number(value),
    ),
    encode: SchemaGetter.passthrough(),
  }),
);

export const Normalized311ServiceRequestSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  uniqueKey: NonEmptyString,
  era: ServiceRequestEraSchema,
  createdDate: NonEmptyString,
  closedDate: NullableString,
  agency: NullableString,
  agencyName: NullableString,
  complaintType: NullableString,
  descriptor: NullableString,
  locationType: NullableString,
  incidentZip: NullableString,
  incidentAddress: NullableString,
  streetName: NullableString,
  crossStreet1: NullableString,
  crossStreet2: NullableString,
  city: NullableString,
  status: NullableString,
  resolutionDescription: NullableString,
  communityBoard: NullableString,
  latitude: Schema.NullOr(Schema.Number),
  longitude: Schema.NullOr(Schema.Number),
  curbFrictionCategory: Schema.NullOr(CurbFriction311CategorySchema),
  curbFrictionRule: NullableString,
});

export type Normalized311ServiceRequest = typeof Normalized311ServiceRequestSchema.Type;

const Raw311RowSchema = Schema.Struct({
  unique_key: CoercedString,
  created_date: NonEmptyString,
  closed_date: Schema.optionalKey(NullableString),
  agency: Schema.optionalKey(NullableString),
  agency_name: Schema.optionalKey(NullableString),
  complaint_type: OptionalNullableString,
  descriptor: OptionalNullableString,
  location_type: Schema.optionalKey(NullableString),
  incident_zip: Schema.optionalKey(NullableString),
  incident_address: Schema.optionalKey(NullableString),
  street_name: Schema.optionalKey(NullableString),
  cross_street_1: Schema.optionalKey(NullableString),
  cross_street_2: Schema.optionalKey(NullableString),
  city: Schema.optionalKey(NullableString),
  status: Schema.optionalKey(NullableString),
  resolution_description: Schema.optionalKey(NullableString),
  community_board: Schema.optionalKey(NullableString),
  latitude: Schema.optionalKey(NullableNumber),
  longitude: Schema.optionalKey(NullableNumber),
});

export function normalize311ServiceRequestRows(
  rows: SocrataRow[],
  era: ServiceRequestEra,
): Normalized311ServiceRequest[] {
  return rows
    .map((row) => {
      const p = decodePreserve(Raw311RowSchema)(row);
      const curbFriction = classify311CurbFriction({
        complaintType: p.complaint_type,
        descriptor: p.descriptor,
      });
      return {
        schemaVersion,
        uniqueKey: p.unique_key,
        era,
        createdDate: p.created_date,
        closedDate: p.closed_date ?? null,
        agency: p.agency ?? null,
        agencyName: p.agency_name ?? null,
        complaintType: p.complaint_type ?? null,
        descriptor: p.descriptor ?? null,
        locationType: p.location_type ?? null,
        incidentZip: p.incident_zip ?? null,
        incidentAddress: p.incident_address ?? null,
        streetName: p.street_name ?? null,
        crossStreet1: p.cross_street_1 ?? null,
        crossStreet2: p.cross_street_2 ?? null,
        city: p.city ?? null,
        status: p.status ?? null,
        resolutionDescription: p.resolution_description ?? null,
        communityBoard: p.community_board ?? null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        curbFrictionCategory: curbFriction?.category ?? null,
        curbFrictionRule: curbFriction?.rule ?? null,
      } satisfies Normalized311ServiceRequest;
    })
    .sort((a, b) => a.uniqueKey.localeCompare(b.uniqueKey));
}
