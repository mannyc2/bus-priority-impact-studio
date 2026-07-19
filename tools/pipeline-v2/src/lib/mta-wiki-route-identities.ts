import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import {
  STUDIO_CURRENT_BUS_ROUTE_TYPES,
  STUDIO_CURRENT_BUS_TRIP_TYPES,
  STUDIO_ROUTE_SERVICE_MODES,
  type StudioCurrentBusRouteType,
  type StudioCurrentBusTripType,
  StudioRouteServiceModeSchema,
  studioRouteServiceModesForOfficialTypes,
} from "@bp/domain/studio";
import { Schema } from "effect";
import { sha256Bytes } from "./mta-wiki-release.ts";
import { decodeSchemaStrict } from "./schema-decode.ts";

const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));
const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const NonNegativeIntegerSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const IsoDateSchema = NonEmptyStringSchema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u));
const FileMetadataSchema = Schema.Struct({
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});
const ArtifactMetadataSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  sha256: Sha256Schema,
  bytes: NonNegativeIntegerSchema,
  rows: NonNegativeIntegerSchema,
});
const CurrentCatalogDescriptorSchema = Schema.Struct({
  contract_version: Schema.Literal(1),
  dataset_id: Schema.Literal("h2wf-afav"),
  artifact_sha256: Sha256Schema,
  effective_as_of_date: IsoDateSchema,
  catalog_routes: ArtifactMetadataSchema,
  catalog_gtfs_disagreements: ArtifactMetadataSchema,
  catalog_identity_count: NonNegativeIntegerSchema,
  catalog_only_count: NonNegativeIntegerSchema,
  gtfs_only_count: NonNegativeIntegerSchema,
});
const GtfsComponentSchema = Schema.Struct({
  component_feed_id: NonEmptyStringSchema,
  dataset_id: Schema.Literals(["mta-nyct-bus", "mta-bus-company"]),
  official_url: NonEmptyStringSchema,
  archive_sha256: Sha256Schema,
  feed_version: NonEmptyStringSchema,
  publisher: NonEmptyStringSchema,
  feed_start_date: IsoDateSchema,
  feed_end_date: IsoDateSchema,
  reliable_interval_start: IsoDateSchema,
  reliable_interval_end: IsoDateSchema,
  agency_timezone: Schema.Literal("America/New_York"),
  frequencies_present: Schema.Boolean,
  conditional_location_files_present: Schema.Boolean,
  files: Schema.Record(Schema.String, ArtifactMetadataSchema),
});
const GtfsSnapshotManifestV2Schema = Schema.Struct({
  schema_version: Schema.Literal(2),
  contract_id: Schema.Literal("gtfs-route-reference-snapshot-v2"),
  snapshot_id: NonEmptyStringSchema,
  dataset_id: Schema.Literal("mta-bus-static"),
  captured_at: NonEmptyStringSchema,
  as_of_date: IsoDateSchema,
  service_window_start: IsoDateSchema,
  service_window_end: IsoDateSchema,
  merge_policy: Schema.Literal("shared-nyct-route-namespace-v1"),
  id_remapping_policy: Schema.Literal("component-feed-prefixed-foreign-keys-v1"),
  current_catalog: CurrentCatalogDescriptorSchema,
  components: Schema.Array(GtfsComponentSchema),
  outputs: Schema.Record(Schema.String, ArtifactMetadataSchema),
  counts: Schema.Struct({
    route_identity_count: NonNegativeIntegerSchema,
    route_activity_count: NonNegativeIntegerSchema,
    catalog_identity_count: NonNegativeIntegerSchema,
    catalog_only_count: NonNegativeIntegerSchema,
    gtfs_only_count: NonNegativeIntegerSchema,
  }),
});

const ManifestV5Schema = Schema.Struct({
  manifest_version: Schema.Literal(5),
  release_id: NonEmptyStringSchema,
  generator_commit: NonEmptyStringSchema,
  contract_versions: Schema.Struct({
    operational_anchor_review_decisions: Schema.Literals([1, 2]),
    operational_anchors: Schema.Literal(1),
    operational_occurrence_review_decisions: Schema.Literals([1, 2]),
    operational_occurrences: Schema.Literal(2),
    relationship_integrity_bundle: Schema.Literal(1),
    route_anchors: Schema.Literal(1),
    route_identity_snapshot: Schema.Literal(1),
  }),
  files: Schema.Record(Schema.String, FileMetadataSchema),
  pointers: Schema.Struct({
    operational_anchor_review_decisions: NonEmptyStringSchema,
    operational_anchor_summary: NonEmptyStringSchema,
    operational_anchors: NonEmptyStringSchema,
    operational_occurrence_review_decisions: NonEmptyStringSchema,
    operational_occurrence_summary: NonEmptyStringSchema,
    operational_occurrences: NonEmptyStringSchema,
    quality_report: Schema.NullOr(NonEmptyStringSchema),
    relationship_integrity_bundle: NonEmptyStringSchema,
    route_anchors: Schema.Literal("route_anchors.jsonl"),
    route_identity_snapshot: Schema.Literal("route_identity_snapshot.json"),
    taxonomy: NonEmptyStringSchema,
  }),
  record_counts: Schema.Record(
    Schema.String,
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  ),
});

export const MTA_WIKI_SERVICE_MODES = STUDIO_ROUTE_SERVICE_MODES;
const ServiceModeSchema = StudioRouteServiceModeSchema;
const ActivitySchema = Schema.Literals(["yes", "no", "indeterminate"]);

export const MtaWikiServiceIdentitySchema = Schema.Struct({
  dataset_id: Schema.Literals(["mta-nyct-bus", "mta-bus-company"]),
  component_feed_ids: Schema.Array(NonEmptyStringSchema),
  source_route_id: NonEmptyStringSchema,
  gtfs_route_id: NonEmptyStringSchema,
  agency_id: Schema.NullOr(NonEmptyStringSchema),
  raw_route_type: NonEmptyStringSchema,
  route_family_id: NonEmptyStringSchema,
  route_short_name: Schema.NullOr(NonEmptyStringSchema),
  route_long_name: Schema.NullOr(NonEmptyStringSchema),
  route_desc: Schema.NullOr(NonEmptyStringSchema),
  declared_in_feed: Schema.Literal(true),
  catalog_in_effect: ActivitySchema,
  catalog_effective_as_of_date: IsoDateSchema,
  reliability_status: Schema.Literals(["reliable", "indeterminate"]),
  scheduled_in_window: ActivitySchema,
  scheduled_service_dates: Schema.Array(NonEmptyStringSchema),
  scheduled_trip_template_date_count: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
  frequencies_present: Schema.Boolean,
  designation_literals: Schema.Array(NonEmptyStringSchema),
  normalized_service_modes: Schema.Array(ServiceModeSchema),
  display_label: NonEmptyStringSchema,
  display_label_source: Schema.Literals(["current_bus_routes", "gtfs", "source_route_id"]),
  reliable_interval_start: IsoDateSchema,
  reliable_interval_end: IsoDateSchema,
  reliable_interval_derivation: Schema.Literal("component_feed_bounds_intersection_v1"),
  label_fallback: Schema.NullOr(Schema.Literal("source_route_id")),
  label_diff: Schema.NullOr(
    Schema.Struct({
      current_bus_routes_route_short_name: NonEmptyStringSchema,
      gtfs_route_short_name: NonEmptyStringSchema,
    }),
  ),
  snapshot_id: NonEmptyStringSchema,
});

const RouteRecordBindingFields = {
  route_record_id: NonEmptyStringSchema,
  route_family_id: Schema.NullOr(NonEmptyStringSchema),
  dataset_id: Schema.NullOr(Schema.Literals(["mta-nyct-bus", "mta-bus-company"])),
  component_feed_ids: Schema.Array(NonEmptyStringSchema),
  source_route_id: Schema.NullOr(NonEmptyStringSchema),
  gtfs_route_id: Schema.NullOr(NonEmptyStringSchema),
  service_variant: Schema.NullOr(ServiceModeSchema),
  identity_scope: Schema.Literals([
    "exact_service",
    "route_family_context",
    "aggregate_context",
    "unresolved",
  ]),
  service_class: Schema.Literals([
    "regular_mta_bus",
    "proposal",
    "temporary",
    "external",
    "non_bus",
    "undetermined",
    "not_applicable",
  ]),
  record_temporal_scope: Schema.Literals([
    "current_description",
    "historical_description",
    "future_description",
    "undetermined",
    "not_applicable",
  ]),
  projectable: Schema.Boolean,
  presentation_primary: Schema.Boolean,
  derivation: NonEmptyStringSchema,
  evidence_ids: Schema.Array(NonEmptyStringSchema),
  canonical_record_fingerprint: Sha256Schema,
  identity_basis: Schema.Literals([
    "deterministic_exact",
    "reviewed_exact_mapping",
    "reviewed_nonidentity_disposition",
  ]),
  expected_gtfs_identity_fingerprint: Schema.NullOr(Sha256Schema),
  decision_kind: Schema.Literals([
    "current_primary",
    "current_ineligible",
    "historical_description",
    "future_description",
    "aggregate_context",
    "route_family_context",
    "external_service",
    "non_bus_service",
    "temporary_service",
  ]),
  ineligibility_reasons: Schema.Array(
    Schema.Literals([
      "identity_not_exact",
      "service_class_not_regular_mta_bus",
      "record_not_current",
      "raw_route_type_not_3",
      "catalog_not_in_effect",
      "reliability_not_proven",
      "not_scheduled_in_window",
    ]),
  ),
} as const;
const DeterministicMtaWikiRouteRecordBindingSchema = Schema.Struct({
  ...RouteRecordBindingFields,
});
const ReviewedMtaWikiRouteRecordBindingSchema = Schema.Struct({
  ...RouteRecordBindingFields,
  decision_id: NonEmptyStringSchema,
  accepted_by: NonEmptyStringSchema,
  accepted_at: NonEmptyStringSchema,
  rationale: NonEmptyStringSchema,
  reviewed_axes: Schema.Array(
    Schema.Literals([
      "identity_mapping",
      "identity_scope",
      "service_class",
      "record_temporal_scope",
      "presentation_primary",
    ]),
  ),
});
export const MtaWikiRouteRecordBindingSchema = Schema.Union([
  DeterministicMtaWikiRouteRecordBindingSchema,
  ReviewedMtaWikiRouteRecordBindingSchema,
]);

export const MtaWikiRouteIdentitySnapshotSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("route-identity-snapshot-v1"),
  gtfs_snapshot_id: NonEmptyStringSchema,
  gtfs_snapshot: GtfsSnapshotManifestV2Schema,
  gtfs_snapshot_sha256: Sha256Schema,
  reviewed_decision_sha256: Sha256Schema,
  current_catalog: CurrentCatalogDescriptorSchema,
  service_identity_count: NonNegativeIntegerSchema,
  service_identities_sha256: Sha256Schema,
  service_identities: Schema.Array(MtaWikiServiceIdentitySchema),
  record_binding_count: NonNegativeIntegerSchema,
  record_bindings_sha256: Sha256Schema,
  record_bindings: Schema.Array(MtaWikiRouteRecordBindingSchema),
  expected_route_anchors_count: NonNegativeIntegerSchema,
  expected_route_anchors_sha256: Sha256Schema,
});

export const MtaWikiRouteAnchorV1Schema = Schema.Struct({
  gtfs_route_id: Schema.NullOr(NonEmptyStringSchema),
  canonical_route_record_id: Schema.NullOr(NonEmptyStringSchema),
  variant_record_ids: Schema.Array(NonEmptyStringSchema),
  aliases: Schema.Array(NonEmptyStringSchema),
  disposition: NonEmptyStringSchema,
  anchor_reason: Schema.NullOr(NonEmptyStringSchema),
});

export type MtaWikiServiceIdentity = typeof MtaWikiServiceIdentitySchema.Type;
export type MtaWikiRouteRecordBinding = typeof MtaWikiRouteRecordBindingSchema.Type;
export type MtaWikiRouteIdentitySnapshot = typeof MtaWikiRouteIdentitySnapshotSchema.Type;
export type MtaWikiRouteAnchorV1 = typeof MtaWikiRouteAnchorV1Schema.Type;

export const MTA_WIKI_RELEASE_CANONICAL_FILES = {
  claims: "claims.jsonl",
  corridors: "corridors.jsonl",
  entities: "entities.jsonl",
  events: "events.jsonl",
  metricClaims: "metric_claims.jsonl",
  projects: "projects.jsonl",
  relations: "relations.jsonl",
  routes: "routes.jsonl",
  sources: "sources.jsonl",
  sourceGaps: "source_gaps.jsonl",
  tables: "tables.jsonl",
  treatmentComponents: "treatment_components.jsonl",
} as const;
export type MtaWikiReleaseCanonicalFileName =
  (typeof MTA_WIKI_RELEASE_CANONICAL_FILES)[keyof typeof MTA_WIKI_RELEASE_CANONICAL_FILES];

const MTA_WIKI_RELEASE_CANONICAL_KIND_BY_FILE = {
  "claims.jsonl": "claim",
  "corridors.jsonl": "corridor",
  "entities.jsonl": "entity",
  "events.jsonl": "event",
  "metric_claims.jsonl": "metric_claim",
  "projects.jsonl": "project",
  "relations.jsonl": "relation",
  "routes.jsonl": "route",
  "source_gaps.jsonl": "source_gap",
  "sources.jsonl": "source",
  "tables.jsonl": "table",
  "treatment_components.jsonl": "treatment_component",
} as const satisfies Record<MtaWikiReleaseCanonicalFileName, string>;

export type LoadedMtaWikiRouteIdentities = {
  releaseDirectory: string;
  manifestSha256: string;
  addressedManifestFileCount: number;
  completeReleaseFileCount: number;
  routeIdentitySha256: string;
  routeAnchorSha256: string;
  canonicalFiles: Record<MtaWikiReleaseCanonicalFileName, Uint8Array>;
  recordCounts: Readonly<Record<string, number>>;
  snapshot: MtaWikiRouteIdentitySnapshot;
  anchors: MtaWikiRouteAnchorV1[];
};

function sortedUnique(values: readonly string[], label: string): void {
  const expected = [...new Set(values)].toSorted();
  if (
    expected.length !== values.length ||
    expected.some((value, index) => value !== values[index])
  ) {
    throw new Error(`${label} must be sorted and unique`);
  }
}

function parseJsonlStrict<S extends Schema.Constraint>(
  schema: S,
  text: string,
  label: string,
): S["Type"][] {
  return text.split(/\r?\n/u).flatMap((line, index) => {
    if (line.length === 0) return [];
    try {
      return [decodeSchemaStrict(schema, JSON.parse(line))];
    } catch (cause) {
      throw new Error(`${label}:${index + 1}: ${String(cause)}`);
    }
  });
}

function isInside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot.length > 0 && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`);
}

async function safeReleaseFile(
  releaseDirectory: string,
  canonicalReleaseDirectory: string,
  pointer: string,
): Promise<Uint8Array> {
  if (
    pointer.startsWith("/") ||
    pointer.includes("\\") ||
    pointer.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`unsafe MTA Wiki release pointer: ${pointer}`);
  }
  const target = resolve(releaseDirectory, pointer);
  if (!isInside(releaseDirectory, target)) {
    throw new Error(`MTA Wiki release pointer escapes release directory: ${pointer}`);
  }
  let current = releaseDirectory;
  const components = relative(releaseDirectory, target).split(sep);
  for (const [index, component] of components.entries()) {
    current = resolve(current, component);
    const stat = await lstat(current);
    const leaf = index === components.length - 1;
    if (stat.isSymbolicLink() || (leaf ? !stat.isFile() : !stat.isDirectory())) {
      throw new Error(
        `MTA Wiki release pointer must traverse regular directories and end at a regular non-symlink file: ${pointer}`,
      );
    }
  }
  const canonicalPath = await realpath(target);
  if (!isInside(canonicalReleaseDirectory, canonicalPath)) {
    throw new Error(`MTA Wiki release pointer escapes release directory: ${pointer}`);
  }
  return readFile(canonicalPath);
}

async function regularReleaseFiles(
  releaseDirectory: string,
  relativeDirectory = "",
): Promise<string[]> {
  const directory = resolve(releaseDirectory, relativeDirectory);
  const entries = (await readdir(directory, { withFileTypes: true })).toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath =
      relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`MTA Wiki release contains a symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await regularReleaseFiles(releaseDirectory, relativePath)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`MTA Wiki release contains a non-regular entry: ${relativePath}`);
    }
    files.push(relativePath);
  }
  return files;
}

async function verifyCompleteReleaseFileSet(
  releaseDirectory: string,
  manifestFiles: Readonly<Record<string, unknown>>,
): Promise<number> {
  if (manifestFiles["manifest.json"] !== undefined) {
    throw new Error("MTA Wiki manifest must not address itself");
  }
  const expected = ["manifest.json", ...Object.keys(manifestFiles)].toSorted();
  const actual = (await regularReleaseFiles(releaseDirectory)).toSorted();
  if (!sameCanonical(actual, expected)) {
    const expectedSet = new Set(expected);
    const actualSet = new Set(actual);
    const missing = expected.filter((path) => !actualSet.has(path));
    const unexpected = actual.filter((path) => !expectedSet.has(path));
    throw new Error(
      `MTA Wiki release file set is incomplete: missing=[${missing.join(",")}] unexpected=[${unexpected.join(",")}]`,
    );
  }
  return actual.length;
}

function verifyMetadata(
  bytes: Uint8Array,
  metadata: { bytes: number; sha256: string },
  pointer: string,
): void {
  if (bytes.length !== metadata.bytes) throw new Error(`${pointer}: byte count mismatch`);
  const digest = sha256Bytes(bytes);
  if (digest !== metadata.sha256) throw new Error(`${pointer}: SHA-256 mismatch`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function canonicalLineSha256(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(`${canonicalJson(value)}\n`));
}

function canonicalJsonlSha256(values: readonly unknown[]): string {
  const text = values.length === 0 ? "" : `${values.map(canonicalJson).join("\n")}\n`;
  return sha256Bytes(new TextEncoder().encode(text));
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function projectableGtfsRouteIdForRecord(
  snapshot: MtaWikiRouteIdentitySnapshot,
  routeRecordId: string,
): string {
  const matches = snapshot.record_bindings.filter(
    (binding) => binding.route_record_id === routeRecordId,
  );
  if (matches.length !== 1) {
    throw new Error(
      `route record ${routeRecordId}: expected exactly one route identity binding, found ${matches.length}`,
    );
  }
  const binding = matches[0];
  if (
    binding === undefined ||
    !binding.projectable ||
    binding.identity_scope !== "exact_service" ||
    binding.service_class !== "regular_mta_bus" ||
    binding.record_temporal_scope !== "current_description" ||
    binding.dataset_id === null ||
    binding.source_route_id === null ||
    binding.gtfs_route_id === null ||
    binding.source_route_id !== binding.gtfs_route_id
  ) {
    throw new Error(`route record ${routeRecordId}: binding is not an eligible exact projection`);
  }
  const identities = snapshot.service_identities.filter(
    (identity) =>
      identity.dataset_id === binding.dataset_id &&
      identity.source_route_id === binding.source_route_id,
  );
  if (identities.length !== 1) {
    throw new Error(
      `route record ${routeRecordId}: expected exactly one bound service identity, found ${identities.length}`,
    );
  }
  const identity = identities[0];
  if (
    identity === undefined ||
    identity.gtfs_route_id !== binding.gtfs_route_id ||
    !sameCanonical(identity.component_feed_ids, binding.component_feed_ids) ||
    identity.raw_route_type !== "3" ||
    identity.catalog_in_effect !== "yes" ||
    identity.reliability_status !== "reliable" ||
    identity.scheduled_in_window !== "yes"
  ) {
    throw new Error(
      `route record ${routeRecordId}: bound service identity is not operationally eligible`,
    );
  }
  return binding.gtfs_route_id;
}

function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid ISO date ${value}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validateArtifactMetadataMap(
  values: Readonly<Record<string, { path: string; sha256: string; bytes: number; rows: number }>>,
  expectedNames: readonly string[],
  label: string,
): void {
  const actualNames = Object.keys(values).toSorted();
  const expected = [...expectedNames].toSorted();
  if (!sameCanonical(actualNames, expected)) {
    throw new Error(`${label}: exact file set mismatch`);
  }
  for (const name of actualNames) {
    const metadata = values[name];
    if (metadata === undefined || metadata.path !== name) {
      throw new Error(`${label}.${name}: path must equal its file key`);
    }
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").some((part) => part === "" || part === "." || part === "..")
    ) {
      throw new Error(`${label}.${name}: unsafe relative path`);
    }
  }
}

function validateGtfsSnapshotDescriptor(snapshot: MtaWikiRouteIdentitySnapshot): void {
  const descriptor = snapshot.gtfs_snapshot;
  if (descriptor.snapshot_id !== snapshot.gtfs_snapshot_id) {
    throw new Error("gtfs_snapshot_id: embedded descriptor mismatch");
  }
  if (descriptor.as_of_date !== descriptor.service_window_end) {
    throw new Error("gtfs_snapshot: service window must end on as_of_date");
  }
  if (descriptor.service_window_start !== shiftIsoDate(descriptor.as_of_date, -6)) {
    throw new Error("gtfs_snapshot: service window must contain seven consecutive dates");
  }
  if (!Number.isFinite(Date.parse(descriptor.captured_at))) {
    throw new Error("gtfs_snapshot.captured_at: invalid timestamp");
  }
  if (descriptor.components.length !== 6) {
    throw new Error("gtfs_snapshot: expected exactly six component feeds");
  }
  sortedUnique(
    descriptor.components.map((component) => component.component_feed_id),
    "gtfs_snapshot.components",
  );
  const requiredFiles = [
    "agency.txt",
    "calendar.txt",
    "calendar_dates.txt",
    "feed_info.txt",
    "routes.txt",
    "stop_times.txt",
    "stops.txt",
    "trips.txt",
  ];
  const optionalFiles = ["frequencies.txt", "location_groups.txt", "locations.geojson"];
  for (const component of descriptor.components) {
    const fileNames = Object.keys(component.files);
    for (const required of requiredFiles) {
      if (!fileNames.includes(required)) {
        throw new Error(`${component.component_feed_id}: missing ${required}`);
      }
    }
    const unknown = fileNames.filter(
      (name) => !requiredFiles.includes(name) && !optionalFiles.includes(name),
    );
    if (unknown.length > 0) {
      throw new Error(`${component.component_feed_id}: unknown GTFS files [${unknown.toSorted()}]`);
    }
    validateArtifactMetadataMap(
      component.files,
      fileNames,
      `gtfs_snapshot.components.${component.component_feed_id}.files`,
    );
    if (component.frequencies_present !== fileNames.includes("frequencies.txt")) {
      throw new Error(`${component.component_feed_id}: frequencies declaration mismatch`);
    }
    const conditionalPresent = fileNames.some(
      (name) => name === "location_groups.txt" || name === "locations.geojson",
    );
    if (component.conditional_location_files_present !== conditionalPresent) {
      throw new Error(`${component.component_feed_id}: conditional location declaration mismatch`);
    }
    if (
      component.feed_start_date > component.feed_end_date ||
      component.reliable_interval_start > component.reliable_interval_end ||
      component.reliable_interval_start < component.feed_start_date ||
      component.reliable_interval_end > component.feed_end_date
    ) {
      throw new Error(`${component.component_feed_id}: invalid reliable service interval`);
    }
  }
  const outputNames = [
    "agency.txt",
    "catalog_gtfs_disagreements.jsonl",
    "catalog_routes.jsonl",
    "feed_info.txt",
    "receipt.json",
    "route_activity.jsonl",
    "route_inventory.jsonl",
    "routes.txt",
  ];
  validateArtifactMetadataMap(descriptor.outputs, outputNames, "gtfs_snapshot.outputs");
  if (
    !sameCanonical(
      descriptor.current_catalog.catalog_routes,
      descriptor.outputs["catalog_routes.jsonl"],
    ) ||
    !sameCanonical(
      descriptor.current_catalog.catalog_gtfs_disagreements,
      descriptor.outputs["catalog_gtfs_disagreements.jsonl"],
    )
  ) {
    throw new Error("gtfs_snapshot.current_catalog: artifact pointers differ from outputs");
  }
  if (
    descriptor.current_catalog.effective_as_of_date !== descriptor.as_of_date ||
    descriptor.current_catalog.catalog_identity_count !==
      descriptor.counts.catalog_identity_count ||
    descriptor.current_catalog.catalog_only_count !== descriptor.counts.catalog_only_count ||
    descriptor.current_catalog.gtfs_only_count !== descriptor.counts.gtfs_only_count
  ) {
    throw new Error("gtfs_snapshot.current_catalog: date/count mismatch");
  }
  if (!sameCanonical(snapshot.current_catalog, descriptor.current_catalog)) {
    throw new Error("current_catalog must exactly equal gtfs_snapshot.current_catalog");
  }
  if (canonicalLineSha256(descriptor) !== snapshot.gtfs_snapshot_sha256) {
    throw new Error("gtfs_snapshot_sha256: canonical embedded descriptor digest mismatch");
  }
}

function officialAliases(identity: MtaWikiServiceIdentity | undefined): string[] {
  if (identity === undefined) return [];
  return [...new Set([identity.display_label, identity.route_short_name, identity.source_route_id])]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .toSorted();
}

function nonProjectableDisposition(binding: MtaWikiRouteRecordBinding): string {
  if (binding.identity_scope === "aggregate_context") return "aggregate_label";
  if (binding.identity_scope === "route_family_context") return "corridor_service_label";
  if (binding.service_class === "external") return "external_bus_service";
  if (binding.service_class === "non_bus") return "non_bus_service";
  if (binding.service_class === "temporary") return "temporary_service";
  if (
    binding.service_class === "proposal" ||
    binding.record_temporal_scope === "future_description"
  ) {
    return "proposal";
  }
  if (binding.record_temporal_scope === "historical_description") {
    return "historical_service_identity";
  }
  if (binding.identity_scope === "exact_service") return "current_ineligible_exact_service";
  throw new Error(
    `route binding ${binding.route_record_id}: no compatibility disposition for nonprojectable binding`,
  );
}

/** Validate the route snapshot's internal count, byte, and digest commitments. */
export function assertMtaWikiRouteIdentitySnapshotSelfIntegrity(
  snapshot: MtaWikiRouteIdentitySnapshot,
): void {
  const inventoryOutput = snapshot.gtfs_snapshot.outputs["route_inventory.jsonl"];
  if (inventoryOutput === undefined) {
    throw new Error("gtfs_snapshot.outputs: missing route_inventory.jsonl");
  }
  if (
    snapshot.service_identities.length !== snapshot.service_identity_count ||
    snapshot.service_identity_count !== snapshot.gtfs_snapshot.counts.route_identity_count ||
    snapshot.service_identity_count !== inventoryOutput.rows
  ) {
    throw new Error("service_identities: count does not reconcile with embedded GTFS metadata");
  }
  const serviceIdentityBytes = new TextEncoder().encode(
    snapshot.service_identities.length === 0
      ? ""
      : `${snapshot.service_identities.map(canonicalJson).join("\n")}\n`,
  );
  if (
    serviceIdentityBytes.length !== inventoryOutput.bytes ||
    canonicalJsonlSha256(snapshot.service_identities) !== snapshot.service_identities_sha256 ||
    snapshot.service_identities_sha256 !== inventoryOutput.sha256
  ) {
    throw new Error("service_identities: bytes/hash do not reconcile with embedded GTFS metadata");
  }
  if (
    snapshot.record_bindings.length !== snapshot.record_binding_count ||
    canonicalJsonlSha256(snapshot.record_bindings) !== snapshot.record_bindings_sha256
  ) {
    throw new Error("record_bindings: count/hash mismatch");
  }
  // reviewed_decision_sha256 commits the producer's accepted decision ledger,
  // not the merged binding projection. The immutable manifest binds this
  // receipt; a consumer must not reinterpret the digest as an approval or
  // derive it from the attributed binding rows.
  if (
    snapshot.current_catalog.catalog_routes.rows !==
      snapshot.current_catalog.catalog_identity_count ||
    snapshot.current_catalog.catalog_gtfs_disagreements.rows !==
      snapshot.current_catalog.catalog_only_count + snapshot.current_catalog.gtfs_only_count
  ) {
    throw new Error("current_catalog: artifact counts do not reconcile");
  }
  const catalogYesCount = snapshot.service_identities.filter(
    (identity) => identity.catalog_in_effect === "yes",
  ).length;
  const catalogNoCount = snapshot.service_identities.filter(
    (identity) => identity.catalog_in_effect === "no",
  ).length;
  if (
    catalogYesCount + snapshot.current_catalog.catalog_only_count !==
      snapshot.current_catalog.catalog_identity_count ||
    catalogNoCount !== snapshot.current_catalog.gtfs_only_count
  ) {
    throw new Error(
      "current_catalog: deliberate catalog/GTFS disagreement counts do not reconcile",
    );
  }
  if (
    snapshot.service_identity_count !== 0 &&
    snapshot.gtfs_snapshot.counts.route_activity_count !== snapshot.service_identity_count
  ) {
    throw new Error("gtfs_snapshot: route activity/identity counts differ");
  }
}

export function reconstructedRouteAnchors(
  snapshot: MtaWikiRouteIdentitySnapshot,
): MtaWikiRouteAnchorV1[] {
  const identityByKey = new Map(
    snapshot.service_identities.map((identity) => [
      `${identity.dataset_id}\0${identity.source_route_id}`,
      identity,
    ]),
  );
  const rows: MtaWikiRouteAnchorV1[] = snapshot.service_identities.map((identity) => {
    const eligible = snapshot.record_bindings.filter(
      (binding) =>
        binding.projectable &&
        binding.dataset_id === identity.dataset_id &&
        binding.source_route_id === identity.source_route_id,
    );
    const primary = eligible.find((binding) => binding.presentation_primary);
    return {
      gtfs_route_id: identity.gtfs_route_id,
      canonical_route_record_id: primary?.route_record_id ?? null,
      variant_record_ids: eligible
        .filter((binding) => binding !== primary)
        .map((binding) => binding.route_record_id)
        .toSorted(),
      aliases: officialAliases(identity),
      disposition: primary === undefined ? "no_wiki_coverage" : "exact_service",
      anchor_reason: primary === undefined ? null : "route_identity_snapshot_v1",
    };
  });
  for (const binding of snapshot.record_bindings.filter((row) => !row.projectable)) {
    const identity =
      binding.dataset_id === null || binding.source_route_id === null
        ? undefined
        : identityByKey.get(`${binding.dataset_id}\0${binding.source_route_id}`);
    rows.push({
      gtfs_route_id: null,
      canonical_route_record_id: binding.route_record_id,
      variant_record_ids: [],
      aliases: officialAliases(identity),
      disposition: nonProjectableDisposition(binding),
      anchor_reason: `route_identity_snapshot_v1:${binding.identity_scope}:${binding.service_class}:${binding.record_temporal_scope}`,
    });
  }
  return rows.toSorted((left, right) => {
    if (left.gtfs_route_id !== null && right.gtfs_route_id !== null) {
      return left.gtfs_route_id.localeCompare(right.gtfs_route_id);
    }
    if (left.gtfs_route_id !== null) return -1;
    if (right.gtfs_route_id !== null) return 1;
    return String(left.canonical_route_record_id).localeCompare(
      String(right.canonical_route_record_id),
    );
  });
}

function canonicalJsonlObjects(bytes: Uint8Array, label: string): Array<Record<string, unknown>> {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.length === 0) return [];
  if (!text.endsWith("\n") || text.includes("\r") || text.includes("\n\n")) {
    throw new Error(`${label}: expected canonical LF-terminated JSONL bytes`);
  }
  return text
    .slice(0, -1)
    .split("\n")
    .map((line, index) => {
      const value = JSON.parse(line) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${label}:${index + 1}: expected object`);
      }
      if (canonicalJson(value) !== line) {
        throw new Error(`${label}:${index + 1}: expected canonical stable JSON`);
      }
      return value as Record<string, unknown>;
    });
}

function validateCanonicalReleaseRecords(
  canonicalFiles: Record<MtaWikiReleaseCanonicalFileName, Uint8Array>,
  recordCounts: Readonly<Record<string, number>>,
): void {
  const expectedKinds = Object.values(MTA_WIKI_RELEASE_CANONICAL_KIND_BY_FILE).toSorted();
  const actualKinds = Object.keys(recordCounts).toSorted();
  if (!sameCanonical(actualKinds, expectedKinds)) {
    throw new Error("MTA Wiki manifest record_counts canonical kind set mismatch");
  }
  for (const [fileName, expectedKind] of Object.entries(
    MTA_WIKI_RELEASE_CANONICAL_KIND_BY_FILE,
  ) as Array<[MtaWikiReleaseCanonicalFileName, string]>) {
    const rows = canonicalJsonlObjects(canonicalFiles[fileName], fileName);
    for (const [index, row] of rows.entries()) {
      if (row["record_kind"] !== expectedKind) {
        throw new Error(`${fileName}:${index + 1}.record_kind: expected ${expectedKind}`);
      }
    }
    const expectedCount = recordCounts[expectedKind];
    if (expectedCount === undefined || rows.length !== expectedCount) {
      throw new Error(
        `${fileName}: row-count mismatch; expected ${String(expectedCount)}, got ${rows.length}`,
      );
    }
  }
}

function optionalTrimmedText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function routeRecordEvidenceIds(record: Record<string, unknown>): string[] {
  const refs = Array.isArray(record["evidence_refs"]) ? record["evidence_refs"] : [];
  return [
    ...new Set(
      refs.flatMap((ref) => {
        if (typeof ref !== "object" || ref === null || Array.isArray(ref)) return [];
        const evidenceId = (ref as Record<string, unknown>)["evidence_id"];
        return typeof evidenceId === "string" && evidenceId.length > 0 ? [evidenceId] : [];
      }),
    ),
  ].toSorted();
}

function routeRecordFingerprint(record: Record<string, unknown>): string {
  const payload =
    typeof record["payload"] === "object" &&
    record["payload"] !== null &&
    !Array.isArray(record["payload"])
      ? (record["payload"] as Record<string, unknown>)
      : {};
  const evidenceIds = routeRecordEvidenceIds(record);
  return sha256Bytes(
    new TextEncoder().encode(
      canonicalJson({
        record_id: optionalTrimmedText(record["record_id"]),
        route_id: optionalTrimmedText(payload["route_id"]),
        internal_route_id: optionalTrimmedText(payload["internal_route_id"]),
        route_id_authority: optionalTrimmedText(payload["route_id_authority"]),
        service_variant: optionalTrimmedText(payload["service_variant"]),
        route_record_scope: optionalTrimmedText(payload["route_record_scope"]),
        evidence_ids: evidenceIds,
      }),
    ),
  );
}

function bindingRecordIdsFromCanonicalRoutes(
  bytes: Uint8Array,
): Map<string, { evidenceIds: string[]; fingerprint: string }> {
  const routes = canonicalJsonlObjects(bytes, "routes.jsonl");
  const result = new Map<string, { evidenceIds: string[]; fingerprint: string }>();
  for (const route of routes) {
    const recordId = optionalTrimmedText(route["record_id"]);
    if (recordId === null || route["record_kind"] !== "route") {
      throw new Error("routes.jsonl: every row must be a canonical route record");
    }
    if (result.has(recordId)) throw new Error(`routes.jsonl: duplicate record_id ${recordId}`);
    result.set(recordId, {
      evidenceIds: routeRecordEvidenceIds(route),
      fingerprint: routeRecordFingerprint(route),
    });
  }
  return result;
}

export async function loadMtaWikiRouteIdentities(input: {
  mtaWikiRoot: string;
  wikiRelease: string;
  wikiManifestSha256: string;
}): Promise<LoadedMtaWikiRouteIdentities> {
  if (!/^[0-9a-f]{64}$/u.test(input.wikiManifestSha256)) {
    throw new Error("wikiManifestSha256 must be a lowercase SHA-256 digest");
  }
  const releasesRoot = resolve(input.mtaWikiRoot, "data", "exports", "releases");
  const releaseDirectory = resolve(releasesRoot, input.wikiRelease);
  const relativeRelease = relative(releasesRoot, releaseDirectory);
  if (
    relativeRelease === "" ||
    relativeRelease === ".." ||
    relativeRelease.startsWith(`..${sep}`)
  ) {
    throw new Error("wikiRelease escapes the MTA Wiki release root");
  }
  const releaseStat = await lstat(releaseDirectory);
  if (!releaseStat.isDirectory() || releaseStat.isSymbolicLink()) {
    throw new Error("wikiRelease must name a regular non-symlink release directory");
  }
  const canonicalReleasesRoot = await realpath(releasesRoot);
  const canonicalReleaseDirectory = await realpath(releaseDirectory);
  if (!isInside(canonicalReleasesRoot, canonicalReleaseDirectory)) {
    throw new Error("wikiRelease resolves outside the MTA Wiki release root");
  }
  const manifestBytes = await safeReleaseFile(
    releaseDirectory,
    canonicalReleaseDirectory,
    "manifest.json",
  );
  const manifestSha256 = sha256Bytes(manifestBytes);
  if (manifestSha256 !== input.wikiManifestSha256)
    throw new Error("MTA Wiki manifest SHA-256 mismatch");
  const manifest = decodeSchemaStrict(
    ManifestV5Schema,
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)),
  );
  if (manifest.release_id !== input.wikiRelease)
    throw new Error("MTA Wiki manifest release_id mismatch");
  const addressedManifestFileCount = Object.keys(manifest.files).length;

  const addressedPointers = Object.entries(manifest.pointers).flatMap(([name, pointer]) =>
    pointer === null ? [] : [[name, pointer] as const],
  );
  const pointerOwners = new Map<string, string>();
  for (const [name, pointer] of addressedPointers) {
    const existingOwner = pointerOwners.get(pointer);
    if (existingOwner !== undefined) {
      throw new Error(
        `MTA Wiki manifest pointers ${existingOwner} and ${name} address the same file: ${pointer}`,
      );
    }
    pointerOwners.set(pointer, name);
    if (manifest.files[pointer] === undefined) {
      throw new Error(`MTA Wiki manifest pointer ${name} lacks file metadata: ${pointer}`);
    }
  }

  const identityPointer = manifest.pointers.route_identity_snapshot;
  const anchorPointer = manifest.pointers.route_anchors;
  const canonicalFileNames = Object.values(MTA_WIKI_RELEASE_CANONICAL_FILES);
  const retainedFileNames = new Set<string>([
    identityPointer,
    anchorPointer,
    ...canonicalFileNames,
  ]);
  const verifiedFiles = new Map<string, Uint8Array>();
  for (const [fileName, metadata] of Object.entries(manifest.files).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    try {
      const bytes = await safeReleaseFile(releaseDirectory, canonicalReleaseDirectory, fileName);
      verifyMetadata(bytes, metadata, fileName);
      if (retainedFileNames.has(fileName)) verifiedFiles.set(fileName, bytes);
    } catch (error) {
      throw new Error(
        `MTA Wiki manifest file cannot be verified: ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const completeReleaseFileCount = await verifyCompleteReleaseFileSet(
    releaseDirectory,
    manifest.files,
  );

  const identityMetadata = manifest.files[identityPointer];
  const anchorMetadata = manifest.files[anchorPointer];
  if (identityMetadata === undefined || anchorMetadata === undefined) {
    throw new Error("MTA Wiki manifest is missing route contract file metadata");
  }
  const canonicalMetadata = canonicalFileNames.map((fileName) => {
    const metadata = manifest.files[fileName];
    if (metadata === undefined) {
      throw new Error(`MTA Wiki manifest is missing consumed canonical file metadata: ${fileName}`);
    }
    return [fileName, metadata] as const;
  });
  const identityBytes = verifiedFiles.get(identityPointer);
  const anchorBytes = verifiedFiles.get(anchorPointer);
  if (identityBytes === undefined || anchorBytes === undefined) {
    throw new Error("MTA Wiki manifest route contract files were not verified");
  }
  const verifiedCanonicalEntries = canonicalMetadata.map(([fileName]) => {
    const bytes = verifiedFiles.get(fileName);
    if (bytes === undefined) throw new Error(`Missing verified canonical bytes for ${fileName}`);
    return [fileName, bytes] as const;
  });
  const canonicalFiles = Object.fromEntries(verifiedCanonicalEntries) as Record<
    MtaWikiReleaseCanonicalFileName,
    Uint8Array
  >;
  validateCanonicalReleaseRecords(canonicalFiles, manifest.record_counts);
  const snapshot = decodeSchemaStrict(
    MtaWikiRouteIdentitySnapshotSchema,
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(identityBytes)),
  );
  const anchors = parseJsonlStrict(
    MtaWikiRouteAnchorV1Schema,
    new TextDecoder("utf-8", { fatal: true }).decode(anchorBytes),
    anchorPointer,
  );
  if (
    anchors.length !== snapshot.expected_route_anchors_count ||
    anchorMetadata.sha256 !== snapshot.expected_route_anchors_sha256
  ) {
    throw new Error(
      "route_anchors.jsonl does not match the route identity snapshot projection pin",
    );
  }

  validateGtfsSnapshotDescriptor(snapshot);
  assertMtaWikiRouteIdentitySnapshotSelfIntegrity(snapshot);
  const canonicalRouteRecords = bindingRecordIdsFromCanonicalRoutes(canonicalFiles["routes.jsonl"]);
  if (canonicalRouteRecords.size !== snapshot.record_binding_count) {
    throw new Error("record_bindings: canonical route denominator mismatch");
  }
  const identities = new Map<string, MtaWikiServiceIdentity>();
  const exportedRouteIds = new Set<string>();
  const componentById = new Map(
    snapshot.gtfs_snapshot.components.map((component) => [component.component_feed_id, component]),
  );
  for (const identity of snapshot.service_identities) {
    if (identity.source_route_id !== identity.gtfs_route_id)
      throw new Error(
        `route identity ${identity.source_route_id}: source_route_id must equal gtfs_route_id`,
      );
    if (
      identity.route_family_id !==
      (identity.source_route_id.endsWith("+")
        ? identity.source_route_id.slice(0, -1)
        : identity.source_route_id)
    ) {
      throw new Error(`route identity ${identity.source_route_id}: invalid route_family_id`);
    }
    if (identity.component_feed_ids.length === 0) {
      throw new Error(`route identity ${identity.source_route_id}: component_feed_ids is empty`);
    }
    sortedUnique(identity.component_feed_ids, `${identity.source_route_id}.component_feed_ids`);
    sortedUnique(
      identity.scheduled_service_dates,
      `${identity.source_route_id}.scheduled_service_dates`,
    );
    sortedUnique(identity.designation_literals, `${identity.source_route_id}.designation_literals`);
    sortedUnique(
      identity.normalized_service_modes,
      `${identity.source_route_id}.normalized_service_modes`,
    );
    const key = `${identity.dataset_id}\0${identity.source_route_id}`;
    if (
      identity.snapshot_id !== snapshot.gtfs_snapshot_id ||
      identity.catalog_effective_as_of_date !== snapshot.current_catalog.effective_as_of_date ||
      identity.catalog_in_effect === "indeterminate"
    ) {
      throw new Error(`route identity ${identity.source_route_id}: snapshot/catalog mismatch`);
    }
    const components = identity.component_feed_ids.map((componentId) => {
      const component = componentById.get(componentId);
      if (component === undefined || component.dataset_id !== identity.dataset_id) {
        throw new Error(
          `route identity ${identity.source_route_id}: invalid component feed ${componentId}`,
        );
      }
      return component;
    });
    const expectedReliableStart = components
      .map((component) => component.reliable_interval_start)
      .toSorted()
      .at(-1);
    const expectedReliableEnd = components
      .map((component) => component.reliable_interval_end)
      .toSorted()
      .at(0);
    if (
      identity.reliable_interval_start !== expectedReliableStart ||
      identity.reliable_interval_end !== expectedReliableEnd
    ) {
      throw new Error(
        `route identity ${identity.source_route_id}: reliable interval is not the component intersection`,
      );
    }
    const expectedReliability =
      expectedReliableStart !== undefined &&
      expectedReliableEnd !== undefined &&
      expectedReliableStart <= snapshot.gtfs_snapshot.service_window_start &&
      expectedReliableEnd >= snapshot.gtfs_snapshot.service_window_end
        ? "reliable"
        : "indeterminate";
    if (identity.reliability_status !== expectedReliability) {
      throw new Error(
        `route identity ${identity.source_route_id}: reliability status differs from route-level interval coverage`,
      );
    }
    if (
      identity.scheduled_service_dates.some(
        (date) =>
          date < snapshot.gtfs_snapshot.service_window_start ||
          date > snapshot.gtfs_snapshot.service_window_end,
      )
    ) {
      throw new Error(
        `route identity ${identity.source_route_id}: scheduled date outside seven-date window`,
      );
    }
    if (
      (identity.reliability_status === "reliable" &&
        identity.scheduled_in_window === "indeterminate") ||
      (identity.reliability_status === "indeterminate" &&
        identity.scheduled_in_window !== "indeterminate")
    ) {
      throw new Error(`route identity ${identity.source_route_id}: reliability/activity mismatch`);
    }
    if (
      identity.scheduled_in_window === "yes"
        ? identity.scheduled_service_dates.length === 0 ||
          identity.scheduled_trip_template_date_count === 0
        : identity.scheduled_service_dates.length !== 0 ||
          identity.scheduled_trip_template_date_count !== 0
    ) {
      throw new Error(
        `route identity ${identity.source_route_id}: scheduled activity evidence mismatch`,
      );
    }
    const routeTypes: StudioCurrentBusRouteType[] = [];
    const tripTypes: StudioCurrentBusTripType[] = [];
    for (const literal of identity.designation_literals) {
      if (literal.startsWith("route_type:")) {
        routeTypes.push(
          currentBusRouteType(
            literal.slice("route_type:".length),
            `${identity.source_route_id}.designation_literals`,
          ),
        );
      } else if (literal.startsWith("trip_type:")) {
        tripTypes.push(
          currentBusTripType(
            literal.slice("trip_type:".length),
            `${identity.source_route_id}.designation_literals`,
          ),
        );
      } else {
        throw new Error(
          `route identity ${identity.source_route_id}: unsupported designation literal ${literal}`,
        );
      }
    }
    const expectedModes =
      routeTypes.length === 0 && tripTypes.length === 0
        ? []
        : studioRouteServiceModesForOfficialTypes(routeTypes, tripTypes);
    if (!sameCanonical(expectedModes, identity.normalized_service_modes)) {
      throw new Error(`route identity ${identity.source_route_id}: designation/mode mismatch`);
    }
    const labelDiff = identity.label_diff;
    if (identity.display_label_source === "source_route_id") {
      if (
        identity.route_short_name !== null ||
        identity.display_label !== identity.source_route_id ||
        identity.label_fallback !== "source_route_id" ||
        labelDiff !== null
      ) {
        throw new Error(`route identity ${identity.source_route_id}: fallback label mismatch`);
      }
    } else if (identity.display_label_source === "gtfs") {
      if (
        identity.route_short_name === null ||
        identity.display_label !== identity.route_short_name ||
        identity.label_fallback !== null ||
        labelDiff !== null
      ) {
        throw new Error(`route identity ${identity.source_route_id}: GTFS label mismatch`);
      }
    } else if (
      identity.label_fallback !== null ||
      (labelDiff === null &&
        identity.route_short_name !== null &&
        identity.display_label !== identity.route_short_name) ||
      (labelDiff !== null &&
        (labelDiff.current_bus_routes_route_short_name !== identity.display_label ||
          labelDiff.gtfs_route_short_name !== identity.route_short_name ||
          labelDiff.current_bus_routes_route_short_name === labelDiff.gtfs_route_short_name))
    ) {
      throw new Error(`route identity ${identity.source_route_id}: Current label mismatch`);
    }
    if (identities.has(key)) throw new Error(`duplicate route identity ${key}`);
    if (exportedRouteIds.has(identity.gtfs_route_id)) {
      throw new Error(`non-injective exported route identity ${identity.gtfs_route_id}`);
    }
    identities.set(key, identity);
    exportedRouteIds.add(identity.gtfs_route_id);
  }
  sortedUnique([...identities.keys()], "route identities");
  const bindings = new Set<string>();
  const reviewedDecisionIds = new Set<string>();
  for (const binding of snapshot.record_bindings) {
    if (bindings.has(binding.route_record_id))
      throw new Error(`duplicate route binding ${binding.route_record_id}`);
    bindings.add(binding.route_record_id);
    sortedUnique(binding.component_feed_ids, `${binding.route_record_id}.component_feed_ids`);
    sortedUnique(binding.evidence_ids, `${binding.route_record_id}.evidence_ids`);
    sortedUnique(binding.ineligibility_reasons, `${binding.route_record_id}.ineligibility_reasons`);
    const canonicalRoute = canonicalRouteRecords.get(binding.route_record_id);
    if (canonicalRoute === undefined) {
      throw new Error(
        `route binding ${binding.route_record_id}: canonical route record is missing`,
      );
    }
    if (canonicalRoute.fingerprint !== binding.canonical_record_fingerprint) {
      throw new Error(
        `route binding ${binding.route_record_id}: canonical record fingerprint is stale`,
      );
    }
    if (canonicalJson(canonicalRoute.evidenceIds) !== canonicalJson(binding.evidence_ids)) {
      throw new Error(`route binding ${binding.route_record_id}: canonical evidence ids are stale`);
    }
    if ("decision_id" in binding) {
      if (binding.reviewed_axes.length === 0 || !Number.isFinite(Date.parse(binding.accepted_at))) {
        throw new Error(`route binding ${binding.route_record_id}: invalid reviewed attribution`);
      }
      sortedUnique(binding.reviewed_axes, `${binding.route_record_id}.reviewed_axes`);
      if (reviewedDecisionIds.has(binding.decision_id)) {
        throw new Error(`duplicate reviewed route decision ${binding.decision_id}`);
      }
      reviewedDecisionIds.add(binding.decision_id);
      if (
        binding.identity_basis === "reviewed_exact_mapping" &&
        !binding.reviewed_axes.includes("identity_mapping")
      ) {
        throw new Error(
          `route binding ${binding.route_record_id}: reviewed exact mapping lacks identity_mapping attribution`,
        );
      }
      if (
        binding.identity_basis === "reviewed_nonidentity_disposition" &&
        !binding.reviewed_axes.includes("identity_scope")
      ) {
        throw new Error(
          `route binding ${binding.route_record_id}: reviewed disposition lacks identity_scope attribution`,
        );
      }
      if (
        binding.identity_basis === "deterministic_exact" &&
        binding.reviewed_axes.includes("identity_mapping")
      ) {
        throw new Error(
          `route binding ${binding.route_record_id}: deterministic exact identity mapping cannot be reviewer-attributed`,
        );
      }
    } else if (binding.identity_basis !== "deterministic_exact") {
      throw new Error(
        `route binding ${binding.route_record_id}: non-deterministic binding lacks reviewer attribution`,
      );
    }
    if (
      binding.service_class === "undetermined" ||
      binding.record_temporal_scope === "undetermined"
    ) {
      throw new Error(`route binding ${binding.route_record_id}: unreviewed scope blocks release`);
    }
    if (
      (binding.source_route_id === null) !== (binding.gtfs_route_id === null) ||
      binding.source_route_id !== binding.gtfs_route_id
    ) {
      throw new Error(
        `route binding ${binding.route_record_id}: source/exported identity mismatch`,
      );
    }
    const exactFields = [binding.dataset_id, binding.source_route_id, binding.gtfs_route_id];
    const hasExactIdentity = exactFields.every((value) => value !== null);
    if (exactFields.some((value) => value !== null) !== hasExactIdentity) {
      throw new Error(
        `route binding ${binding.route_record_id}: exact identity fields must be all-null or complete`,
      );
    }
    if ((binding.identity_scope === "exact_service") !== hasExactIdentity) {
      throw new Error(
        `route binding ${binding.route_record_id}: identity_scope disagrees with exact identity tuple`,
      );
    }
    if (hasExactIdentity === (binding.component_feed_ids.length === 0)) {
      throw new Error(
        `route binding ${binding.route_record_id}: component feeds disagree with exact identity tuple`,
      );
    }
    let identity: MtaWikiServiceIdentity | undefined;
    if (binding.source_route_id === null) {
      if (binding.dataset_id !== null || binding.component_feed_ids.length > 0) {
        throw new Error(
          `route binding ${binding.route_record_id}: unbound identity provenance must be empty`,
        );
      }
    } else {
      if (binding.dataset_id === null) {
        throw new Error(`route binding ${binding.route_record_id}: dataset_id is required`);
      }
      identity = identities.get(`${binding.dataset_id}\0${binding.source_route_id}`);
      if (identity === undefined) {
        throw new Error(`route binding ${binding.route_record_id}: exact identity is missing`);
      }
      const exactIdentity = identity;
      if (binding.route_family_id !== exactIdentity.route_family_id) {
        throw new Error(
          `route binding ${binding.route_record_id}: route family disagrees with exact identity`,
        );
      }
      if (
        binding.component_feed_ids.length !== exactIdentity.component_feed_ids.length ||
        binding.component_feed_ids.some(
          (component, index) => component !== exactIdentity.component_feed_ids[index],
        )
      ) {
        throw new Error(
          `route binding ${binding.route_record_id}: component feed provenance mismatch`,
        );
      }
    }
    const expectedIdentityFingerprint =
      identity === undefined
        ? null
        : sha256Bytes(new TextEncoder().encode(canonicalJson(identity)));
    if (binding.expected_gtfs_identity_fingerprint !== expectedIdentityFingerprint) {
      throw new Error(
        `route binding ${binding.route_record_id}: GTFS identity fingerprint is stale`,
      );
    }
    const exactIdentityBasis =
      binding.identity_basis === "deterministic_exact" ||
      binding.identity_basis === "reviewed_exact_mapping";
    if (exactIdentityBasis !== (identity !== undefined)) {
      throw new Error(
        `route binding ${binding.route_record_id}: identity basis disagrees with exact target`,
      );
    }
    const completeOperationalEligibility =
      identity !== undefined &&
      binding.identity_scope === "exact_service" &&
      binding.service_class === "regular_mta_bus" &&
      binding.record_temporal_scope === "current_description" &&
      identity.raw_route_type === "3" &&
      identity.catalog_in_effect === "yes" &&
      identity.reliability_status === "reliable" &&
      identity.scheduled_in_window === "yes";
    const expectedIneligibilityReasons: MtaWikiRouteRecordBinding["ineligibility_reasons"][number][] =
      [];
    if (binding.identity_scope !== "exact_service" || identity === undefined) {
      expectedIneligibilityReasons.push("identity_not_exact");
    }
    if (binding.service_class !== "regular_mta_bus") {
      expectedIneligibilityReasons.push("service_class_not_regular_mta_bus");
    }
    if (binding.record_temporal_scope !== "current_description") {
      expectedIneligibilityReasons.push("record_not_current");
    }
    if (identity !== undefined) {
      if (identity.raw_route_type !== "3") {
        expectedIneligibilityReasons.push("raw_route_type_not_3");
      }
      if (identity.catalog_in_effect !== "yes") {
        expectedIneligibilityReasons.push("catalog_not_in_effect");
      }
      if (identity.reliability_status !== "reliable") {
        expectedIneligibilityReasons.push("reliability_not_proven");
      }
      if (identity.scheduled_in_window !== "yes") {
        expectedIneligibilityReasons.push("not_scheduled_in_window");
      }
    }
    expectedIneligibilityReasons.sort();
    if (!sameCanonical(expectedIneligibilityReasons, binding.ineligibility_reasons)) {
      throw new Error(
        `route binding ${binding.route_record_id}: ineligibility reasons do not match exact predicate`,
      );
    }
    if (binding.projectable !== completeOperationalEligibility) {
      throw new Error(
        `route binding ${binding.route_record_id}: projectable must equal complete operational eligibility`,
      );
    }
    const nonProjectable = !binding.projectable && !binding.presentation_primary;
    let decisionFieldsReconcile = false;
    switch (binding.decision_kind) {
      case "current_primary":
        decisionFieldsReconcile =
          binding.projectable &&
          binding.presentation_primary &&
          binding.identity_scope === "exact_service" &&
          binding.service_class === "regular_mta_bus" &&
          binding.record_temporal_scope === "current_description";
        break;
      case "current_ineligible":
        decisionFieldsReconcile =
          nonProjectable &&
          binding.identity_scope === "exact_service" &&
          binding.service_class === "regular_mta_bus" &&
          binding.record_temporal_scope === "current_description";
        break;
      case "historical_description":
        decisionFieldsReconcile =
          nonProjectable &&
          binding.service_class === "regular_mta_bus" &&
          binding.record_temporal_scope === "historical_description" &&
          (binding.identity_scope === "exact_service" || binding.identity_scope === "unresolved");
        break;
      case "future_description":
        decisionFieldsReconcile =
          nonProjectable &&
          binding.service_class === "proposal" &&
          binding.record_temporal_scope === "future_description" &&
          (binding.identity_scope === "exact_service" || binding.identity_scope === "unresolved");
        break;
      case "aggregate_context":
        decisionFieldsReconcile =
          nonProjectable &&
          binding.identity_scope === "aggregate_context" &&
          binding.service_class === "not_applicable" &&
          binding.record_temporal_scope === "not_applicable";
        break;
      case "route_family_context":
        decisionFieldsReconcile =
          nonProjectable &&
          binding.identity_scope === "route_family_context" &&
          binding.service_class === "not_applicable" &&
          binding.record_temporal_scope === "not_applicable";
        break;
      case "external_service":
        decisionFieldsReconcile =
          nonProjectable &&
          binding.identity_scope === "unresolved" &&
          binding.service_class === "external" &&
          binding.record_temporal_scope === "current_description";
        break;
      case "non_bus_service":
        decisionFieldsReconcile =
          nonProjectable &&
          binding.identity_scope === "unresolved" &&
          binding.service_class === "non_bus" &&
          binding.record_temporal_scope === "not_applicable";
        break;
      case "temporary_service":
        decisionFieldsReconcile =
          nonProjectable &&
          binding.service_class === "temporary" &&
          (binding.identity_scope === "exact_service" || binding.identity_scope === "unresolved") &&
          (binding.record_temporal_scope === "current_description" ||
            binding.record_temporal_scope === "historical_description");
        break;
    }
    if (!decisionFieldsReconcile) {
      throw new Error(
        `route binding ${binding.route_record_id}: decision_kind fields do not reconcile`,
      );
    }
    if (binding.presentation_primary && !binding.projectable) {
      throw new Error(
        `route binding ${binding.route_record_id}: presentation_primary requires projectable eligibility`,
      );
    }
  }
  for (const identity of snapshot.service_identities) {
    const eligible = snapshot.record_bindings.filter(
      (binding) =>
        binding.projectable &&
        binding.dataset_id === identity.dataset_id &&
        binding.source_route_id === identity.source_route_id,
    );
    const primary = eligible.filter((binding) => binding.presentation_primary);
    if (eligible.length > 0 && primary.length !== 1) {
      throw new Error(
        `route identity ${identity.source_route_id}: expected exactly one presentation_primary binding for ${eligible.length} projectable binding(s), found ${primary.length}`,
      );
    }
  }
  sortedUnique([...bindings], "record_bindings.route_record_id");
  sortedUnique([...reviewedDecisionIds], "record_bindings.decision_id");
  const expectedAnchors = reconstructedRouteAnchors(snapshot);
  if (!sameCanonical(expectedAnchors, anchors)) {
    throw new Error("route_anchors.jsonl is not the canonical complete route identity projection");
  }
  if (
    expectedAnchors.length !== snapshot.expected_route_anchors_count ||
    canonicalJsonlSha256(expectedAnchors) !== snapshot.expected_route_anchors_sha256 ||
    anchorMetadata.sha256 !== snapshot.expected_route_anchors_sha256
  ) {
    throw new Error(
      "route_anchors.jsonl does not match the route identity snapshot projection pin",
    );
  }
  return {
    releaseDirectory,
    manifestSha256,
    addressedManifestFileCount,
    completeReleaseFileCount,
    routeIdentitySha256: identityMetadata.sha256,
    routeAnchorSha256: anchorMetadata.sha256,
    canonicalFiles,
    recordCounts: manifest.record_counts,
    snapshot,
    anchors,
  };
}

export type CurrentBusRoutesRouteDesignations = {
  routeShortName: string;
  routeTypes: StudioCurrentBusRouteType[];
  tripTypes: StudioCurrentBusTripType[];
};

export type CurrentBusRoutesParityAudit = {
  currentBusRoutesSha256: string;
  effectiveAsOfDate: string;
  currentCatalogRouteCount: number;
  gtfsRouteCount: number;
  catalogInEffectIdentityCount: number;
  descriptorReconciled: boolean;
  catalogInEffectSetsEqual: boolean;
  catalogOnlyRouteIds: string[];
  gtfsOnlyRouteIds: string[];
  rawRouteTypeCounts: Record<string, number>;
  scheduledInWindowCounts: Record<string, number>;
  reliabilityStatusCounts: Record<string, number>;
  nonBusOrUnknownExtendedRouteTypeCount: number;
  externalOnlyRouteRecordCount: number;
};

function unknownObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}: expected object`);
  }
  return value as Record<string, unknown>;
}

function requiredLiteralString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${label}: expected an exact non-empty source literal`);
  }
  return value;
}

function currentBusDate(value: unknown, label: string): string {
  const literal = requiredLiteralString(value, label);
  const match = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z?)?$/u.exec(literal);
  const date = match?.[1];
  if (date === undefined || !Number.isFinite(Date.parse(literal))) {
    throw new Error(`${label}: expected an ISO calendar date or timestamp`);
  }
  const normalizedDate = new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10);
  if (normalizedDate !== date) {
    throw new Error(`${label}: invalid calendar date ${literal}`);
  }
  return date;
}

function currentBusRouteType(value: unknown, label: string): StudioCurrentBusRouteType {
  const literal = requiredLiteralString(value, label);
  if (!(STUDIO_CURRENT_BUS_ROUTE_TYPES as readonly string[]).includes(literal)) {
    throw new Error(`${label}: unsupported literal ${literal}`);
  }
  return literal as StudioCurrentBusRouteType;
}

function currentBusTripType(value: unknown, label: string): StudioCurrentBusTripType {
  if (!(STUDIO_CURRENT_BUS_TRIP_TYPES as readonly unknown[]).includes(value)) {
    throw new Error(`${label}: unsupported literal ${String(value)}`);
  }
  return value as StudioCurrentBusTripType;
}

function sortTripTypes(values: Iterable<StudioCurrentBusTripType>): StudioCurrentBusTripType[] {
  return [...values].toSorted((left, right) => {
    const numeric = Number(left) - Number(right);
    if (numeric !== 0) return numeric;
    if (typeof left === typeof right) return 0;
    return typeof left === "number" ? -1 : 1;
  });
}

function sortedCounts(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

export async function auditCurrentBusRoutesParity(input: {
  currentBusRoutesPath: string;
  expectedSha256: string;
  effectiveAsOfDate: string;
  snapshot: MtaWikiRouteIdentitySnapshot;
}): Promise<{
  parity: CurrentBusRoutesParityAudit;
  designationsByRouteId: ReadonlyMap<string, CurrentBusRoutesRouteDesignations>;
}> {
  if (!/^[0-9a-f]{64}$/u.test(input.expectedSha256)) {
    throw new Error("currentBusRoutesSha256 must be a lowercase SHA-256 digest");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.effectiveAsOfDate)) {
    throw new Error("currentBusRoutesEffectiveAsOfDate must be YYYY-MM-DD");
  }
  if (
    input.expectedSha256 !== input.snapshot.current_catalog.artifact_sha256 ||
    input.effectiveAsOfDate !== input.snapshot.current_catalog.effective_as_of_date
  ) {
    throw new Error(
      "Current Bus Routes pin/date must exactly equal the immutable route identity snapshot",
    );
  }

  const bytes = await readFile(input.currentBusRoutesPath);
  const actualSha256 = sha256Bytes(bytes);
  if (actualSha256 !== input.expectedSha256) {
    throw new Error("Current Bus Routes SHA-256 mismatch");
  }
  const decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  if (!Array.isArray(decoded)) throw new Error("Current Bus Routes: expected a JSON array");

  const catalogRouteIds = new Set<string>();
  const routeTypes = new Map<string, Set<StudioCurrentBusRouteType>>();
  const tripTypes = new Map<string, Set<StudioCurrentBusTripType>>();
  const routeShortNames = new Map<string, string>();
  for (const [index, raw] of decoded.entries()) {
    const row = unknownObject(raw, `Current Bus Routes[${index}]`);
    const routeId = requiredLiteralString(row["route_id"], `Current Bus Routes[${index}].route_id`);
    const routeShortName = requiredLiteralString(
      row["route_short_name"],
      `Current Bus Routes[${index}].route_short_name`,
    );
    const inEffect = requiredLiteralString(
      row["in_effect"],
      `Current Bus Routes[${index}].in_effect`,
    );
    if (inEffect !== "true" && inEffect !== "false") {
      throw new Error(`Current Bus Routes[${index}].in_effect: unsupported literal ${inEffect}`);
    }
    const validFrom = currentBusDate(row["valid_from"], `Current Bus Routes[${index}].valid_from`);
    const validTo = currentBusDate(row["valid_to"], `Current Bus Routes[${index}].valid_to`);
    if (validFrom > validTo) {
      throw new Error(`Current Bus Routes[${index}]: valid_from is after valid_to`);
    }
    const routeType = currentBusRouteType(
      row["route_type"],
      `Current Bus Routes[${index}].route_type`,
    );
    const tripType = currentBusTripType(row["trip_type"], `Current Bus Routes[${index}].trip_type`);
    if (
      inEffect !== "true" ||
      validFrom > input.effectiveAsOfDate ||
      validTo < input.effectiveAsOfDate
    ) {
      continue;
    }
    catalogRouteIds.add(routeId);
    const routeTypeSet = routeTypes.get(routeId) ?? new Set<StudioCurrentBusRouteType>();
    const priorRouteShortName = routeShortNames.get(routeId);
    if (priorRouteShortName !== undefined && priorRouteShortName !== routeShortName) {
      throw new Error(
        `Current Bus Routes route ${routeId}: conflicting effective route_short_name literals`,
      );
    }
    routeShortNames.set(routeId, routeShortName);
    routeTypeSet.add(routeType);
    routeTypes.set(routeId, routeTypeSet);
    const tripTypeSet = tripTypes.get(routeId) ?? new Set<StudioCurrentBusTripType>();
    tripTypeSet.add(tripType);
    tripTypes.set(routeId, tripTypeSet);
  }

  const allGtfsRouteIds = new Set(
    input.snapshot.service_identities.map((row) => row.source_route_id),
  );
  const catalogInEffectRouteIds = new Set(
    input.snapshot.service_identities
      .filter((row) => row.catalog_in_effect === "yes")
      .map((row) => row.source_route_id),
  );
  for (const identity of input.snapshot.service_identities) {
    if (identity.catalog_effective_as_of_date !== input.effectiveAsOfDate) {
      throw new Error(
        `route identity ${identity.source_route_id}: catalog effective date mismatch`,
      );
    }
  }

  const catalogOnlyRouteIds = [...catalogRouteIds]
    .filter((routeId) => !allGtfsRouteIds.has(routeId))
    .toSorted();
  const gtfsOnlyRouteIds = [...allGtfsRouteIds]
    .filter((routeId) => !catalogRouteIds.has(routeId))
    .toSorted();
  const currentCatalogIds = [...catalogRouteIds].toSorted();
  const inEffectIdentityIds = [...catalogInEffectRouteIds].toSorted();
  const descriptorReconciled =
    currentCatalogIds.length === input.snapshot.current_catalog.catalog_identity_count &&
    catalogOnlyRouteIds.length === input.snapshot.current_catalog.catalog_only_count &&
    gtfsOnlyRouteIds.length === input.snapshot.current_catalog.gtfs_only_count;
  const catalogInEffectSetsEqual = sameCanonical(currentCatalogIds, inEffectIdentityIds);

  const designationsByRouteId = new Map<string, CurrentBusRoutesRouteDesignations>();
  const currentModesByRouteId = new Map<
    string,
    MtaWikiServiceIdentity["normalized_service_modes"]
  >();
  for (const routeId of currentCatalogIds) {
    const routeTypeLiterals = [...(routeTypes.get(routeId) ?? [])].toSorted();
    const tripTypeLiterals = sortTripTypes(tripTypes.get(routeId) ?? []);
    const routeShortName = routeShortNames.get(routeId);
    if (routeShortName === undefined) {
      throw new Error(`Current Bus Routes: missing route_short_name for ${routeId}`);
    }
    designationsByRouteId.set(routeId, {
      routeTypes: routeTypeLiterals,
      tripTypes: tripTypeLiterals,
      routeShortName,
    });
    currentModesByRouteId.set(
      routeId,
      studioRouteServiceModesForOfficialTypes(routeTypeLiterals, tripTypeLiterals),
    );
  }

  const identityByRouteId = new Map(
    input.snapshot.service_identities.map((identity) => [identity.gtfs_route_id, identity]),
  );
  for (const identity of input.snapshot.service_identities) {
    if (identity.catalog_in_effect !== "yes") continue;
    const designations = designationsByRouteId.get(identity.gtfs_route_id);
    if (designations === undefined) continue;
    const currentModes = currentModesByRouteId.get(identity.gtfs_route_id);
    if (
      currentModes === undefined ||
      !sameCanonical(currentModes, identity.normalized_service_modes)
    ) {
      throw new Error(
        `route identity ${identity.gtfs_route_id}: Current Bus Routes modes disagree with the immutable snapshot`,
      );
    }
    const currentDesignationLiterals = [
      ...new Set([
        ...designations.routeTypes.map((value) => `route_type:${value}`),
        ...designations.tripTypes.map((value) => `trip_type:${String(value)}`),
      ]),
    ].toSorted();
    if (!sameCanonical(currentDesignationLiterals, identity.designation_literals)) {
      throw new Error(
        `route identity ${identity.gtfs_route_id}: Current Bus Routes designation literals disagree with the immutable snapshot`,
      );
    }
    const expectedLabelDiff =
      identity.route_short_name !== null &&
      identity.route_short_name !== designations.routeShortName
        ? {
            current_bus_routes_route_short_name: designations.routeShortName,
            gtfs_route_short_name: identity.route_short_name,
          }
        : null;
    if (
      identity.display_label_source !== "current_bus_routes" ||
      identity.display_label !== designations.routeShortName ||
      identity.label_fallback !== null ||
      !sameCanonical(identity.label_diff, expectedLabelDiff)
    ) {
      throw new Error(
        `route identity ${identity.gtfs_route_id}: Current Bus Routes display-label precedence disagrees with the immutable snapshot`,
      );
    }
  }
  for (const binding of input.snapshot.record_bindings) {
    if (!binding.projectable || binding.gtfs_route_id === null) continue;
    const identity = identityByRouteId.get(binding.gtfs_route_id);
    if (
      identity === undefined ||
      identity.catalog_in_effect !== "yes" ||
      !catalogRouteIds.has(binding.gtfs_route_id)
    ) {
      throw new Error(
        `route binding ${binding.route_record_id}: catalog disagreement blocks projectability`,
      );
    }
  }

  return {
    parity: {
      currentBusRoutesSha256: actualSha256,
      effectiveAsOfDate: input.effectiveAsOfDate,
      currentCatalogRouteCount: catalogRouteIds.size,
      gtfsRouteCount: allGtfsRouteIds.size,
      catalogInEffectIdentityCount: catalogInEffectRouteIds.size,
      descriptorReconciled,
      catalogInEffectSetsEqual,
      catalogOnlyRouteIds,
      gtfsOnlyRouteIds,
      rawRouteTypeCounts: sortedCounts(
        input.snapshot.service_identities.map((row) => row.raw_route_type),
      ),
      scheduledInWindowCounts: sortedCounts(
        input.snapshot.service_identities.map((row) => row.scheduled_in_window),
      ),
      reliabilityStatusCounts: sortedCounts(
        input.snapshot.service_identities.map((row) => row.reliability_status),
      ),
      nonBusOrUnknownExtendedRouteTypeCount: input.snapshot.service_identities.filter(
        (row) => row.raw_route_type !== "3",
      ).length,
      externalOnlyRouteRecordCount: input.snapshot.record_bindings.filter(
        (row) => row.service_class === "external",
      ).length,
    },
    designationsByRouteId,
  };
}
