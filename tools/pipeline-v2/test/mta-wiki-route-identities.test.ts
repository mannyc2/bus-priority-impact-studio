import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  auditCurrentBusRoutesParity,
  loadMtaWikiRouteIdentities,
  type MtaWikiRouteAnchorV1,
  type MtaWikiRouteIdentitySnapshot,
} from "../src/lib/mta-wiki-route-identities.ts";

type ServiceIdentity = MtaWikiRouteIdentitySnapshot["service_identities"][number];
type RouteBinding = MtaWikiRouteIdentitySnapshot["record_bindings"][number];
type ArtifactMetadata = {
  path: string;
  sha256: string;
  bytes: number;
  rows: number;
};
type FileMetadata = { bytes: number; sha256: string };
type CanonicalRouteRecord = {
  record_id: string;
  record_kind: "route";
  payload: {
    route_id: string;
    internal_route_id: string;
    route_id_authority: string;
    service_variant: string;
    route_record_scope: string;
  };
  evidence_refs: Array<{ evidence_id: string }>;
};
type FixtureManifest = {
  manifest_version: number;
  release_id: string;
  generator_commit: string;
  contract_versions: {
    operational_anchor_review_decisions: 1;
    operational_anchors: 1;
    operational_occurrence_review_decisions: 1;
    operational_occurrences: 2;
    relationship_integrity_bundle: 1;
    route_anchors: 1;
    route_identity_snapshot: 1;
  };
  files: Record<string, FileMetadata>;
  pointers: {
    operational_anchor_review_decisions: string;
    operational_anchor_summary: string;
    operational_anchors: string;
    operational_occurrence_review_decisions: string;
    operational_occurrence_summary: string;
    operational_occurrences: string;
    quality_report: null;
    relationship_integrity_bundle: string;
    route_anchors: "route_anchors.jsonl";
    route_identity_snapshot: "route_identity_snapshot.json";
    taxonomy: string;
  };
  record_counts: Record<string, number>;
};
type Fixture = {
  root: string;
  release: string;
  releaseId: string;
  manifest: FixtureManifest;
  manifestSha: string;
  snapshot: MtaWikiRouteIdentitySnapshot;
  anchors: MtaWikiRouteAnchorV1[];
  routeRecords: CanonicalRouteRecord[];
};

const fixedSha = "0".repeat(64);
const snapshotId = "mta-bus-2026-07-18-route-provenance-v1";
const nyctComponentIds = [
  "nyct-bronx",
  "nyct-brooklyn",
  "nyct-manhattan",
  "nyct-queens",
  "nyct-staten-island",
] as const;
const allComponentIds = ["mta-bus-company", ...nyctComponentIds] as const;
const canonicalFileNames = [
  "claims.jsonl",
  "corridors.jsonl",
  "entities.jsonl",
  "events.jsonl",
  "metric_claims.jsonl",
  "projects.jsonl",
  "relations.jsonl",
  "routes.jsonl",
  "source_gaps.jsonl",
  "sources.jsonl",
  "tables.jsonl",
  "treatment_components.jsonl",
] as const;
const manifestPointerFiles = {
  "operational_anchor_review_decisions.json": "{}\n",
  "operational_anchors_summary.json": "{}\n",
  "operational_anchors.jsonl": "",
  "operational_occurrence_review_decisions.json": "{}\n",
  "operational_occurrences_summary.json": "{}\n",
  "operational_occurrences.jsonl": "",
  "relationship_integrity_bundle.json": "{}\n",
  "taxonomy.json": "{}\n",
} as const;
const manifestV6PointerFiles = {
  "study-frontier-closure/data/contracts/bus-lane-identity-verdicts-v1/manifest.json": "{}\n",
  "quality-provenance/frontier-exceptions.json": "{}\n",
  "member-extent/data/contracts/operational-occurrence-member-extent/v1/manifest.json": "{}\n",
  "study-frontier-closure/data/contracts/operational-occurrence-member-grain/v1/manifest.json":
    "{}\n",
  "quality-provenance/manifest.json": "{}\n",
  "study-frontier-closure/data/quality/study-readiness/v2/manifest.json": "{}\n",
} as const;
const requiredGtfsFiles = [
  "agency.txt",
  "calendar.txt",
  "calendar_dates.txt",
  "feed_info.txt",
  "routes.txt",
  "stop_times.txt",
  "stops.txt",
  "trips.txt",
] as const;
const outputNames = [
  "agency.txt",
  "catalog_gtfs_disagreements.jsonl",
  "catalog_routes.jsonl",
  "feed_info.txt",
  "receipt.json",
  "route_activity.jsonl",
  "route_inventory.jsonl",
  "routes.txt",
] as const;

function sha(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Fixture contains an unsupported JSON value");
    return encoded;
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  return (
    "{" +
    Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => JSON.stringify(key) + ":" + canonicalJson(entry))
      .join(",") +
    "}"
  );
}

function canonicalJsonl(rows: readonly unknown[]): string {
  return rows.length === 0 ? "" : rows.map(canonicalJson).join("\n") + "\n";
}

function artifactMetadata(path: string, rows: number, bytes?: string): ArtifactMetadata {
  const content =
    bytes ??
    (rows === 0
      ? ""
      : Array.from({ length: rows }, (_, index) =>
          canonicalJson({ fixture: path, row: index + 1 }),
        ).join("\n") + "\n");
  return {
    path,
    sha256: sha(content),
    bytes: Buffer.byteLength(content),
    rows,
  };
}

function fileMetadata(bytes: string): FileMetadata {
  return { bytes: Buffer.byteLength(bytes), sha256: sha(bytes) };
}

function gtfsComponent(
  componentFeedId: (typeof allComponentIds)[number],
): MtaWikiRouteIdentitySnapshot["gtfs_snapshot"]["components"][number] {
  const statenOrBus =
    componentFeedId === "mta-bus-company" || componentFeedId === "nyct-staten-island";
  const files = Object.fromEntries(
    requiredGtfsFiles.map((name) => [
      name,
      artifactMetadata(name, 1, canonicalJson({ componentFeedId, name }) + "\n"),
    ]),
  );
  return {
    component_feed_id: componentFeedId,
    dataset_id: componentFeedId === "mta-bus-company" ? "mta-bus-company" : "mta-nyct-bus",
    official_url: "https://rrgtfsfeeds.s3.amazonaws.com/" + componentFeedId + ".zip",
    archive_sha256: sha("archive:" + componentFeedId),
    feed_version: "fixture-" + componentFeedId,
    publisher: "MTA New York City Transit",
    feed_start_date: statenOrBus ? "2026-06-28" : "2026-06-27",
    feed_end_date: "2026-09-05",
    reliable_interval_start: statenOrBus ? "2026-06-28" : "2026-06-27",
    reliable_interval_end: "2026-09-05",
    agency_timezone: "America/New_York",
    frequencies_present: false,
    conditional_location_files_present: false,
    files,
  };
}

function identity(routeId: "B44" | "B44+"): ServiceIdentity {
  const sbs = routeId === "B44+";
  return {
    dataset_id: "mta-nyct-bus",
    component_feed_ids: [...nyctComponentIds],
    source_route_id: routeId,
    gtfs_route_id: routeId,
    agency_id: "MTA NYCT",
    raw_route_type: "3",
    route_family_id: "B44",
    route_short_name: sbs ? "B44-SBS" : "B44",
    route_long_name: "Sheepshead Bay - Williamsburg",
    route_desc: sbs ? "Select Bus Service via Nostrand Av" : "via Nostrand Av",
    declared_in_feed: true,
    catalog_in_effect: "yes",
    catalog_effective_as_of_date: "2026-07-18",
    reliability_status: "reliable",
    scheduled_in_window: "yes",
    scheduled_service_dates: [
      "2026-07-12",
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
    ],
    scheduled_trip_template_date_count: sbs ? 1648 : 1688,
    frequencies_present: false,
    designation_literals: sbs
      ? ["route_type:SBS", "trip_type:14"]
      : ["route_type:Local", "trip_type:1"],
    normalized_service_modes: sbs ? ["sbs"] : ["local"],
    display_label: sbs ? "B44-SBS" : "B44",
    display_label_source: "current_bus_routes",
    reliable_interval_start: "2026-06-28",
    reliable_interval_end: "2026-09-05",
    reliable_interval_derivation: "component_feed_bounds_intersection_v1",
    label_fallback: null,
    label_diff: null,
    snapshot_id: snapshotId,
  };
}

function canonicalRouteRecord(
  recordId: string,
  routeId: string,
  internalRouteId: string,
  variant: string,
  evidenceId: string,
): CanonicalRouteRecord {
  return {
    record_id: recordId,
    record_kind: "route",
    payload: {
      route_id: routeId,
      internal_route_id: internalRouteId,
      route_id_authority: "gtfs_exact",
      service_variant: variant,
      route_record_scope: "true_route",
    },
    evidence_refs: [{ evidence_id: evidenceId }],
  };
}

function routeRecordFingerprint(record: CanonicalRouteRecord): string {
  return sha(
    canonicalJson({
      record_id: record.record_id,
      route_id: record.payload.route_id,
      internal_route_id: record.payload.internal_route_id,
      route_id_authority: record.payload.route_id_authority,
      service_variant: record.payload.service_variant,
      route_record_scope: record.payload.route_record_scope,
      evidence_ids: record.evidence_refs.map((ref) => ref.evidence_id).toSorted(),
    }),
  );
}

function identityFingerprint(value: ServiceIdentity): string {
  return sha(canonicalJson(value));
}

function fixtureRouteRecords(): CanonicalRouteRecord[] {
  return [
    canonicalRouteRecord("route_b44-historical", "B44", "B44", "limited_stop", "source#historical"),
    canonicalRouteRecord("route_b44-local", "B44", "B44", "local", "source#local"),
    canonicalRouteRecord("route_b44-sbs", "B44", "B44+", "sbs", "source#sbs"),
  ];
}

function bindingBase(
  record: CanonicalRouteRecord,
  routeIdentity: ServiceIdentity,
  input: {
    serviceVariant: "limited_stop" | "local" | "sbs";
    temporal: "current_description" | "historical_description";
    projectable: boolean;
    presentationPrimary: boolean;
    decisionKind: "current_primary" | "historical_description";
    ineligibilityReasons: RouteBinding["ineligibility_reasons"];
  },
): RouteBinding {
  return {
    route_record_id: record.record_id,
    route_family_id: routeIdentity.route_family_id,
    dataset_id: routeIdentity.dataset_id,
    component_feed_ids: [...routeIdentity.component_feed_ids],
    source_route_id: routeIdentity.source_route_id,
    gtfs_route_id: routeIdentity.gtfs_route_id,
    service_variant: input.serviceVariant,
    identity_scope: "exact_service",
    service_class: "regular_mta_bus",
    record_temporal_scope: input.temporal,
    projectable: input.projectable,
    presentation_primary: input.presentationPrimary,
    derivation: "authoritative_internal_route_id_exact_v1",
    evidence_ids: record.evidence_refs.map((ref) => ref.evidence_id).toSorted(),
    canonical_record_fingerprint: routeRecordFingerprint(record),
    identity_basis: "deterministic_exact",
    expected_gtfs_identity_fingerprint: identityFingerprint(routeIdentity),
    decision_kind: input.decisionKind,
    ineligibility_reasons: [...input.ineligibilityReasons],
  };
}

function fixtureBindings(
  identities: readonly ServiceIdentity[],
  records: readonly CanonicalRouteRecord[],
): RouteBinding[] {
  const b44 = identities.find((row) => row.source_route_id === "B44");
  const b44Plus = identities.find((row) => row.source_route_id === "B44+");
  const historical = records.find((row) => row.record_id === "route_b44-historical");
  const local = records.find((row) => row.record_id === "route_b44-local");
  const sbs = records.find((row) => row.record_id === "route_b44-sbs");
  if (
    b44 === undefined ||
    b44Plus === undefined ||
    historical === undefined ||
    local === undefined ||
    sbs === undefined
  ) {
    throw new Error("Incomplete route identity fixture");
  }
  const historicalBinding = bindingBase(historical, b44, {
    serviceVariant: "limited_stop",
    temporal: "historical_description",
    projectable: false,
    presentationPrimary: false,
    decisionKind: "historical_description",
    ineligibilityReasons: ["record_not_current"],
  });
  const localBinding = bindingBase(local, b44, {
    serviceVariant: "local",
    temporal: "current_description",
    projectable: true,
    presentationPrimary: true,
    decisionKind: "current_primary",
    ineligibilityReasons: [],
  });
  const reviewedSbs = {
    ...bindingBase(sbs, b44Plus, {
      serviceVariant: "sbs",
      temporal: "current_description",
      projectable: true,
      presentationPrimary: true,
      decisionKind: "current_primary",
      ineligibilityReasons: [],
    }),
    identity_basis: "reviewed_exact_mapping",
    derivation: "reviewed_exact_route_mapping_v1",
    decision_id: "route-binding-v1:route_b44-sbs",
    accepted_by: "fixture-owner",
    accepted_at: "2026-07-18T12:00:00.000Z",
    rationale: "The source-backed internal route ID names exact B44+ service.",
    reviewed_axes: ["identity_mapping"],
  } as RouteBinding;
  return [historicalBinding, localBinding, reviewedSbs];
}

function currentCatalogDescriptor(
  identities: readonly ServiceIdentity[],
  artifactSha256: string,
): MtaWikiRouteIdentitySnapshot["current_catalog"] {
  const catalogIdentityCount = identities.filter((row) => row.catalog_in_effect === "yes").length;
  const gtfsOnlyCount = identities.filter((row) => row.catalog_in_effect === "no").length;
  return {
    contract_version: 1,
    dataset_id: "h2wf-afav",
    artifact_sha256: artifactSha256,
    effective_as_of_date: "2026-07-18",
    catalog_routes: artifactMetadata("catalog_routes.jsonl", catalogIdentityCount),
    catalog_gtfs_disagreements: artifactMetadata("catalog_gtfs_disagreements.jsonl", gtfsOnlyCount),
    catalog_identity_count: catalogIdentityCount,
    catalog_only_count: 0,
    gtfs_only_count: gtfsOnlyCount,
  };
}

function makeGtfsDescriptor(
  identities: readonly ServiceIdentity[],
  artifactSha256: string,
): MtaWikiRouteIdentitySnapshot["gtfs_snapshot"] {
  const currentCatalog = currentCatalogDescriptor(identities, artifactSha256);
  const routeInventoryBytes = canonicalJsonl(identities);
  const outputs = Object.fromEntries(
    outputNames.map((name) => [
      name,
      name === "route_inventory.jsonl"
        ? artifactMetadata(name, identities.length, routeInventoryBytes)
        : name === "catalog_routes.jsonl"
          ? currentCatalog.catalog_routes
          : name === "catalog_gtfs_disagreements.jsonl"
            ? currentCatalog.catalog_gtfs_disagreements
            : artifactMetadata(name, name === "receipt.json" ? 1 : identities.length),
    ]),
  );
  return {
    schema_version: 2,
    contract_id: "gtfs-route-reference-snapshot-v2",
    snapshot_id: snapshotId,
    dataset_id: "mta-bus-static",
    captured_at: "2026-07-18T18:05:27Z",
    as_of_date: "2026-07-18",
    service_window_start: "2026-07-12",
    service_window_end: "2026-07-18",
    merge_policy: "shared-nyct-route-namespace-v1",
    id_remapping_policy: "component-feed-prefixed-foreign-keys-v1",
    current_catalog: currentCatalog,
    components: allComponentIds.map(gtfsComponent),
    outputs,
    counts: {
      route_identity_count: identities.length,
      route_activity_count: identities.length,
      catalog_identity_count: currentCatalog.catalog_identity_count,
      catalog_only_count: currentCatalog.catalog_only_count,
      gtfs_only_count: currentCatalog.gtfs_only_count,
    },
  };
}

function officialAliases(routeIdentity: ServiceIdentity): string[] {
  return [
    ...new Set([
      routeIdentity.display_label,
      routeIdentity.route_short_name,
      routeIdentity.source_route_id,
    ]),
  ]
    .filter((value): value is string => value !== null)
    .toSorted();
}

function projectAnchors(snapshot: MtaWikiRouteIdentitySnapshot): MtaWikiRouteAnchorV1[] {
  const rows: MtaWikiRouteAnchorV1[] = snapshot.service_identities.map((routeIdentity) => {
    const eligible = snapshot.record_bindings.filter(
      (binding) =>
        binding.projectable &&
        binding.dataset_id === routeIdentity.dataset_id &&
        binding.source_route_id === routeIdentity.source_route_id,
    );
    const primary = eligible.find((binding) => binding.presentation_primary);
    return {
      gtfs_route_id: routeIdentity.gtfs_route_id,
      canonical_route_record_id: primary?.route_record_id ?? null,
      variant_record_ids: eligible
        .filter((binding) => binding !== primary)
        .map((binding) => binding.route_record_id)
        .toSorted(),
      aliases: officialAliases(routeIdentity),
      disposition: primary === undefined ? "no_wiki_coverage" : "exact_service",
      anchor_reason: primary === undefined ? null : "route_identity_snapshot_v1",
    } satisfies MtaWikiRouteAnchorV1;
  });
  for (const binding of snapshot.record_bindings.filter((row) => !row.projectable)) {
    const routeIdentity = snapshot.service_identities.find(
      (row) =>
        row.dataset_id === binding.dataset_id && row.source_route_id === binding.source_route_id,
    );
    rows.push({
      gtfs_route_id: null,
      canonical_route_record_id: binding.route_record_id,
      variant_record_ids: [],
      aliases: routeIdentity === undefined ? [] : officialAliases(routeIdentity),
      disposition:
        binding.record_temporal_scope === "historical_description"
          ? "historical_service_identity"
          : "current_ineligible_exact_service",
      anchor_reason:
        "route_identity_snapshot_v1:" +
        binding.identity_scope +
        ":" +
        binding.service_class +
        ":" +
        binding.record_temporal_scope,
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

function syncSnapshotHashes(snapshot: MtaWikiRouteIdentitySnapshot): void {
  const identityBytes = canonicalJsonl(snapshot.service_identities);
  const inventory = snapshot.gtfs_snapshot.outputs["route_inventory.jsonl"];
  if (inventory === undefined) throw new Error("Missing route inventory fixture metadata");
  Object.assign(
    inventory,
    artifactMetadata("route_inventory.jsonl", snapshot.service_identities.length, identityBytes),
  );
  Object.assign(snapshot.gtfs_snapshot.counts, {
    route_identity_count: snapshot.service_identities.length,
    route_activity_count: snapshot.service_identities.length,
  });
  Object.assign(snapshot, {
    service_identity_count: snapshot.service_identities.length,
    service_identities_sha256: sha(identityBytes),
    record_binding_count: snapshot.record_bindings.length,
    record_bindings_sha256: sha(canonicalJsonl(snapshot.record_bindings)),
    reviewed_decision_sha256: sha(
      canonicalJsonl(snapshot.record_bindings.filter((binding) => "decision_id" in binding)),
    ),
  });
  Object.assign(snapshot, {
    gtfs_snapshot_sha256: sha(canonicalJson(snapshot.gtfs_snapshot) + "\n"),
  });
}

function makeSnapshot(
  identities: ServiceIdentity[],
  bindings: RouteBinding[],
  artifactSha256 = fixedSha,
): MtaWikiRouteIdentitySnapshot {
  const gtfsSnapshot = makeGtfsDescriptor(identities, artifactSha256);
  const snapshot = {
    schema_version: 1,
    contract_id: "route-identity-snapshot-v1",
    gtfs_snapshot_id: snapshotId,
    gtfs_snapshot: gtfsSnapshot,
    gtfs_snapshot_sha256: fixedSha,
    reviewed_decision_sha256: sha(
      canonicalJsonl(bindings.filter((binding) => "decision_id" in binding)),
    ),
    current_catalog: gtfsSnapshot.current_catalog,
    service_identity_count: identities.length,
    service_identities_sha256: fixedSha,
    service_identities: identities,
    record_binding_count: bindings.length,
    record_bindings_sha256: fixedSha,
    record_bindings: bindings,
    expected_route_anchors_count: 0,
    expected_route_anchors_sha256: sha(""),
  } as MtaWikiRouteIdentitySnapshot;
  syncSnapshotHashes(snapshot);
  const anchors = projectAnchors(snapshot);
  Object.assign(snapshot, {
    expected_route_anchors_count: anchors.length,
    expected_route_anchors_sha256: sha(canonicalJsonl(anchors)),
  });
  return snapshot;
}

function canonicalFiles(routeRecords: readonly CanonicalRouteRecord[]): Record<string, string> {
  return {
    "claims.jsonl": "",
    "corridors.jsonl": "",
    "entities.jsonl": "",
    "events.jsonl": "",
    "metric_claims.jsonl": "",
    "projects.jsonl": "",
    "relations.jsonl": "",
    "routes.jsonl": canonicalJsonl(routeRecords),
    "source_gaps.jsonl": "",
    "sources.jsonl": "",
    "tables.jsonl": "",
    "treatment_components.jsonl": "",
  };
}

function buildManifest(
  releaseId: string,
  snapshotBytes: string,
  anchorBytes: string,
  files: Readonly<Record<string, string>>,
  routeCount: number,
): FixtureManifest {
  const fileEntries: Record<string, FileMetadata> = {
    "route_anchors.jsonl": fileMetadata(anchorBytes),
    "route_identity_snapshot.json": fileMetadata(snapshotBytes),
  };
  for (const [name, bytes] of Object.entries(manifestPointerFiles)) {
    fileEntries[name] = fileMetadata(bytes);
  }
  for (const [name, bytes] of Object.entries(files)) fileEntries[name] = fileMetadata(bytes);
  return {
    manifest_version: 5,
    release_id: releaseId,
    generator_commit: fixedSha,
    contract_versions: {
      operational_anchor_review_decisions: 1,
      operational_anchors: 1,
      operational_occurrence_review_decisions: 1,
      operational_occurrences: 2,
      relationship_integrity_bundle: 1,
      route_anchors: 1,
      route_identity_snapshot: 1,
    },
    files: fileEntries,
    pointers: {
      operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
      operational_anchor_summary: "operational_anchors_summary.json",
      operational_anchors: "operational_anchors.jsonl",
      operational_occurrence_review_decisions: "operational_occurrence_review_decisions.json",
      operational_occurrence_summary: "operational_occurrences_summary.json",
      operational_occurrences: "operational_occurrences.jsonl",
      quality_report: null,
      relationship_integrity_bundle: "relationship_integrity_bundle.json",
      route_anchors: "route_anchors.jsonl",
      route_identity_snapshot: "route_identity_snapshot.json",
      taxonomy: "taxonomy.json",
    },
    record_counts: {
      claim: 0,
      corridor: 0,
      entity: 0,
      event: 0,
      metric_claim: 0,
      project: 0,
      relation: 0,
      route: routeCount,
      source: 0,
      source_gap: 0,
      table: 0,
      treatment_component: 0,
    },
  };
}

async function writeManifest(value: Fixture): Promise<string> {
  const bytes = canonicalJson(value.manifest) + "\n";
  await writeFile(join(value.release, "manifest.json"), bytes);
  return sha(bytes);
}

async function upgradeFixtureToManifestV6(value: Fixture): Promise<string> {
  value.manifest.manifest_version = 6;
  Object.assign(value.manifest.contract_versions, {
    bus_lane_identity_verdicts: 1,
    operational_occurrence_member_extents: 1,
    operational_occurrence_member_grain: 1,
  });
  Object.assign(value.manifest.pointers, {
    bus_lane_identity_verdicts:
      "study-frontier-closure/data/contracts/bus-lane-identity-verdicts-v1/manifest.json",
    frontier_exceptions: "quality-provenance/frontier-exceptions.json",
    operational_occurrence_member_extents:
      "member-extent/data/contracts/operational-occurrence-member-extent/v1/manifest.json",
    operational_occurrence_member_grain:
      "study-frontier-closure/data/contracts/operational-occurrence-member-grain/v1/manifest.json",
    quality_provenance: "quality-provenance/manifest.json",
    study_readiness_v2:
      "study-frontier-closure/data/quality/study-readiness/v2/manifest.json",
  });
  for (const [path, bytes] of Object.entries(manifestV6PointerFiles)) {
    const absolutePath = join(value.release, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);
    value.manifest.files[path] = fileMetadata(bytes);
  }
  value.manifestSha = await writeManifest(value);
  return value.manifestSha;
}

async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "mta-wiki-route-identities-"));
  const releaseId = "v1-rc24";
  const release = join(root, "data", "exports", "releases", releaseId);
  await mkdir(release, { recursive: true });
  const identities = [identity("B44"), identity("B44+")];
  const routeRecords = fixtureRouteRecords();
  const bindings = fixtureBindings(identities, routeRecords);
  const snapshot = makeSnapshot(identities, bindings);
  const anchors = projectAnchors(snapshot);
  const snapshotBytes = canonicalJson(snapshot) + "\n";
  const anchorBytes = canonicalJsonl(anchors);
  const files = canonicalFiles(routeRecords);
  for (const [name, bytes] of Object.entries({ ...manifestPointerFiles, ...files })) {
    await writeFile(join(release, name), bytes);
  }
  await writeFile(join(release, "route_anchors.jsonl"), anchorBytes);
  await writeFile(join(release, "route_identity_snapshot.json"), snapshotBytes);
  const manifest = buildManifest(releaseId, snapshotBytes, anchorBytes, files, routeRecords.length);
  const value: Fixture = {
    root,
    release,
    releaseId,
    manifest,
    manifestSha: "",
    snapshot,
    anchors,
    routeRecords,
  };
  value.manifestSha = await writeManifest(value);
  return value;
}

async function rewriteSnapshot(
  value: Fixture,
  mutate: (snapshot: MtaWikiRouteIdentitySnapshot) => void,
): Promise<string> {
  const path = join(value.release, "route_identity_snapshot.json");
  const snapshot = JSON.parse(await Bun.file(path).text()) as MtaWikiRouteIdentitySnapshot;
  mutate(snapshot);
  syncSnapshotHashes(snapshot);
  const bytes = canonicalJson(snapshot) + "\n";
  await writeFile(path, bytes);
  value.manifest.files["route_identity_snapshot.json"] = fileMetadata(bytes);
  value.snapshot = snapshot;
  value.manifestSha = await writeManifest(value);
  return value.manifestSha;
}

async function rewriteSnapshotWithoutCommitmentRepair(
  value: Fixture,
  mutate: (snapshot: MtaWikiRouteIdentitySnapshot) => void,
): Promise<string> {
  const path = join(value.release, "route_identity_snapshot.json");
  const snapshot = JSON.parse(await Bun.file(path).text()) as MtaWikiRouteIdentitySnapshot;
  mutate(snapshot);
  const bytes = canonicalJson(snapshot) + "\n";
  await writeFile(path, bytes);
  value.manifest.files["route_identity_snapshot.json"] = fileMetadata(bytes);
  value.snapshot = snapshot;
  value.manifestSha = await writeManifest(value);
  return value.manifestSha;
}

async function rewriteSnapshotAndProjectedAnchors(
  value: Fixture,
  mutate: (snapshot: MtaWikiRouteIdentitySnapshot) => void,
): Promise<string> {
  const snapshot = structuredClone(value.snapshot);
  mutate(snapshot);
  syncSnapshotHashes(snapshot);
  const anchors = projectAnchors(snapshot);
  const anchorBytes = canonicalJsonl(anchors);
  Object.assign(snapshot, {
    expected_route_anchors_count: anchors.length,
    expected_route_anchors_sha256: sha(anchorBytes),
  });
  const snapshotBytes = canonicalJson(snapshot) + "\n";
  await writeFile(join(value.release, "route_identity_snapshot.json"), snapshotBytes);
  await writeFile(join(value.release, "route_anchors.jsonl"), anchorBytes);
  value.manifest.files["route_identity_snapshot.json"] = fileMetadata(snapshotBytes);
  value.manifest.files["route_anchors.jsonl"] = fileMetadata(anchorBytes);
  value.snapshot = snapshot;
  value.anchors = anchors;
  value.manifestSha = await writeManifest(value);
  return value.manifestSha;
}

async function rewriteAnchors(
  value: Fixture,
  mutate: (anchors: MtaWikiRouteAnchorV1[]) => void,
): Promise<string> {
  const anchors = structuredClone(value.anchors);
  mutate(anchors);
  const anchorBytes = canonicalJsonl(anchors);
  await writeFile(join(value.release, "route_anchors.jsonl"), anchorBytes);
  value.manifest.files["route_anchors.jsonl"] = fileMetadata(anchorBytes);
  const snapshot = structuredClone(value.snapshot);
  Object.assign(snapshot, {
    expected_route_anchors_count: anchors.length,
    expected_route_anchors_sha256: sha(anchorBytes),
  });
  syncSnapshotHashes(snapshot);
  const snapshotBytes = canonicalJson(snapshot) + "\n";
  await writeFile(join(value.release, "route_identity_snapshot.json"), snapshotBytes);
  value.manifest.files["route_identity_snapshot.json"] = fileMetadata(snapshotBytes);
  value.snapshot = snapshot;
  value.anchors = anchors;
  value.manifestSha = await writeManifest(value);
  return value.manifestSha;
}

async function rewriteCanonicalRoutes(
  value: Fixture,
  mutate: (records: CanonicalRouteRecord[]) => void,
): Promise<string> {
  const records = structuredClone(value.routeRecords);
  mutate(records);
  const bytes = canonicalJsonl(records);
  await writeFile(join(value.release, "routes.jsonl"), bytes);
  value.manifest.files["routes.jsonl"] = fileMetadata(bytes);
  value.routeRecords = records;
  value.manifestSha = await writeManifest(value);
  return value.manifestSha;
}

async function rewriteCanonicalFile(
  value: Fixture,
  fileName: string,
  bytes: string,
  count?: { kind: string; value: number },
): Promise<string> {
  await writeFile(join(value.release, fileName), bytes);
  value.manifest.files[fileName] = fileMetadata(bytes);
  if (count !== undefined) value.manifest.record_counts[count.kind] = count.value;
  value.manifestSha = await writeManifest(value);
  return value.manifestSha;
}

function snapshotForAudit(
  identityRow: ServiceIdentity,
  currentBusRoutesSha256: string,
): MtaWikiRouteIdentitySnapshot {
  return makeSnapshot([identityRow], [], currentBusRoutesSha256);
}

function loadFixture(value: Fixture, manifestSha = value.manifestSha) {
  return loadMtaWikiRouteIdentities({
    mtaWikiRoot: value.root,
    wikiRelease: value.releaseId,
    wikiManifestSha256: manifestSha,
  });
}

describe("MTA Wiki route identities", () => {
  test("accepts manifest v6 with its additional signed contract pointers", async () => {
    const value = await fixture();
    try {
      await upgradeFixtureToManifestV6(value);
      const loaded = await loadFixture(value);

      expect(loaded.manifestSha256).toBe(value.manifestSha);
      expect(loaded.snapshot.service_identities.map((row) => row.source_route_id)).toEqual([
        "B44",
        "B44+",
      ]);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  test("loads the frozen shared NYCT namespace with exact B44/B44+ identities and complete dispositions", async () => {
    const value = await fixture();
    try {
      const loaded = await loadMtaWikiRouteIdentities({
        mtaWikiRoot: value.root,
        wikiRelease: value.releaseId,
        wikiManifestSha256: value.manifestSha,
      });

      expect(loaded.snapshot.gtfs_snapshot).toMatchObject({
        schema_version: 2,
        contract_id: "gtfs-route-reference-snapshot-v2",
        dataset_id: "mta-bus-static",
        merge_policy: "shared-nyct-route-namespace-v1",
        service_window_start: "2026-07-12",
        service_window_end: "2026-07-18",
      });
      expect(loaded.snapshot.gtfs_snapshot.components.map((row) => row.component_feed_id)).toEqual([
        ...allComponentIds,
      ]);
      expect(Object.keys(loaded.snapshot.gtfs_snapshot.outputs).toSorted()).toEqual(
        [...outputNames].toSorted(),
      );
      expect(loaded.snapshot.current_catalog).toMatchObject({
        dataset_id: "h2wf-afav",
        effective_as_of_date: "2026-07-18",
        catalog_identity_count: 2,
        catalog_only_count: 0,
        gtfs_only_count: 0,
      });
      expect(loaded.snapshot.service_identities.map((row) => row.source_route_id)).toEqual([
        "B44",
        "B44+",
      ]);
      expect(loaded.snapshot.service_identities.map((row) => row.dataset_id)).toEqual([
        "mta-nyct-bus",
        "mta-nyct-bus",
      ]);
      expect(loaded.snapshot.service_identities.map((row) => row.display_label)).toEqual([
        "B44",
        "B44-SBS",
      ]);
      expect(loaded.snapshot.service_identities.map((row) => row.designation_literals)).toEqual([
        ["route_type:Local", "trip_type:1"],
        ["route_type:SBS", "trip_type:14"],
      ]);
      expect(loaded.snapshot.service_identities.map((row) => row.normalized_service_modes)).toEqual(
        [["local"], ["sbs"]],
      );
      expect(loaded.snapshot.service_identities[0]).toMatchObject({
        reliable_interval_start: "2026-06-28",
        reliable_interval_end: "2026-09-05",
        reliable_interval_derivation: "component_feed_bounds_intersection_v1",
        label_fallback: null,
        label_diff: null,
      });
      expect(loaded.anchors.map((row) => row.canonical_route_record_id)).toEqual([
        "route_b44-local",
        "route_b44-sbs",
        "route_b44-historical",
      ]);
      expect(loaded.anchors[2]).toEqual({
        gtfs_route_id: null,
        canonical_route_record_id: "route_b44-historical",
        variant_record_ids: [],
        aliases: ["B44"],
        disposition: "historical_service_identity",
        anchor_reason:
          "route_identity_snapshot_v1:exact_service:regular_mta_bus:historical_description",
      });
      expect(Object.keys(loaded.canonicalFiles).toSorted()).toEqual([...canonicalFileNames]);
      expect(loaded.recordCounts["route"]).toBe(3);
      expect(loaded.addressedManifestFileCount).toBe(Object.keys(value.manifest.files).length);
      expect(loaded.completeReleaseFileCount).toBe(Object.keys(value.manifest.files).length + 1);

      const deterministic = loaded.snapshot.record_bindings.find(
        (row) => row.route_record_id === "route_b44-local",
      );
      const reviewed = loaded.snapshot.record_bindings.find(
        (row) => row.route_record_id === "route_b44-sbs",
      );
      const localRouteRecord = value.routeRecords[1];
      if (localRouteRecord === undefined) {
        throw new Error("Missing local route record fixture");
      }
      expect(deterministic).toMatchObject({
        identity_basis: "deterministic_exact",
        expected_gtfs_identity_fingerprint: identityFingerprint(identity("B44")),
        canonical_record_fingerprint: routeRecordFingerprint(localRouteRecord),
      });
      expect(deterministic !== undefined && "accepted_by" in deterministic).toBe(false);
      expect(reviewed).toMatchObject({
        identity_basis: "reviewed_exact_mapping",
        decision_id: "route-binding-v1:route_b44-sbs",
        reviewed_axes: ["identity_mapping"],
        expected_gtfs_identity_fingerprint: identityFingerprint(identity("B44+")),
      });
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  test("requires exact manifest and canonical file hashes", async () => {
    const wrongManifest = await fixture();
    try {
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: wrongManifest.root,
          wikiRelease: wrongManifest.releaseId,
          wikiManifestSha256: fixedSha,
        }),
      ).rejects.toThrow("manifest SHA-256 mismatch");
    } finally {
      await rm(wrongManifest.root, { recursive: true, force: true });
    }

    const tamperedCanonical = await fixture();
    try {
      await writeFile(join(tamperedCanonical.release, "routes.jsonl"), "tampered\n");
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: tamperedCanonical.root,
          wikiRelease: tamperedCanonical.releaseId,
          wikiManifestSha256: tamperedCanonical.manifestSha,
        }),
      ).rejects.toThrow(/routes\.jsonl: (byte count|SHA-256) mismatch/);
    } finally {
      await rm(tamperedCanonical.root, { recursive: true, force: true });
    }
  });

  test("fails closed on re-signed non-route canonical byte, kind, and count tampering", async () => {
    const wrongKind = await fixture();
    try {
      const bytes = canonicalJsonl([{ record_id: "event_x", record_kind: "project" }]);
      const manifestSha = await rewriteCanonicalFile(wrongKind, "events.jsonl", bytes, {
        kind: "event",
        value: 1,
      });
      await expect(loadFixture(wrongKind, manifestSha)).rejects.toThrow(
        "events.jsonl:1.record_kind: expected event",
      );
    } finally {
      await rm(wrongKind.root, { recursive: true, force: true });
    }

    const wrongCount = await fixture();
    try {
      const bytes = canonicalJsonl([{ record_id: "claim_x", record_kind: "claim" }]);
      const manifestSha = await rewriteCanonicalFile(wrongCount, "claims.jsonl", bytes);
      await expect(loadFixture(wrongCount, manifestSha)).rejects.toThrow(
        "claims.jsonl: row-count mismatch; expected 0, got 1",
      );
    } finally {
      await rm(wrongCount.root, { recursive: true, force: true });
    }

    const noncanonicalBytes = await fixture();
    try {
      const bytes = '{"record_kind":"entity", "record_id":"entity_x"}\n';
      const manifestSha = await rewriteCanonicalFile(noncanonicalBytes, "entities.jsonl", bytes, {
        kind: "entity",
        value: 1,
      });
      await expect(loadFixture(noncanonicalBytes, manifestSha)).rejects.toThrow(
        "entities.jsonl:1: expected canonical stable JSON",
      );
    } finally {
      await rm(noncanonicalBytes.root, { recursive: true, force: true });
    }

    const crlfBytes = await fixture();
    try {
      const bytes = '{"record_id":"corridor_x","record_kind":"corridor"}\r\n';
      const manifestSha = await rewriteCanonicalFile(crlfBytes, "corridors.jsonl", bytes, {
        kind: "corridor",
        value: 1,
      });
      await expect(loadFixture(crlfBytes, manifestSha)).rejects.toThrow(
        "corridors.jsonl: expected canonical LF-terminated JSONL bytes",
      );
    } finally {
      await rm(crlfBytes.root, { recursive: true, force: true });
    }
  });

  test("requires the exact canonical record-count kind set", async () => {
    const missingKind = await fixture();
    try {
      delete missingKind.manifest.record_counts["table"];
      const manifestSha = await writeManifest(missingKind);
      await expect(loadFixture(missingKind, manifestSha)).rejects.toThrow(
        "record_counts canonical kind set mismatch",
      );
    } finally {
      await rm(missingKind.root, { recursive: true, force: true });
    }

    const futureKind = await fixture();
    try {
      futureKind.manifest.record_counts["future_kind"] = 0;
      const manifestSha = await writeManifest(futureKind);
      await expect(loadFixture(futureKind, manifestSha)).rejects.toThrow(
        "record_counts canonical kind set mismatch",
      );
    } finally {
      await rm(futureKind.root, { recursive: true, force: true });
    }
  });

  test("closes every manifest-v5 pointer and file metadata entry", async () => {
    const missingMetadata = await fixture();
    try {
      delete missingMetadata.manifest.files["operational_occurrences.jsonl"];
      const manifestSha = await writeManifest(missingMetadata);
      await expect(loadFixture(missingMetadata, manifestSha)).rejects.toThrow(
        "manifest pointer operational_occurrences lacks file metadata",
      );
    } finally {
      await rm(missingMetadata.root, { recursive: true, force: true });
    }

    const missingFile = await fixture();
    try {
      await rm(join(missingFile.release, "operational_anchor_review_decisions.json"));
      await expect(loadFixture(missingFile)).rejects.toThrow(
        /manifest file cannot be verified: operational_anchor_review_decisions\.json/,
      );
    } finally {
      await rm(missingFile.root, { recursive: true, force: true });
    }

    const tamperedPointer = await fixture();
    try {
      await writeFile(join(tamperedPointer.release, "taxonomy.json"), '{"forged":true}\n');
      await expect(loadFixture(tamperedPointer)).rejects.toThrow(
        /taxonomy\.json: (byte count|SHA-256) mismatch/,
      );
    } finally {
      await rm(tamperedPointer.root, { recursive: true, force: true });
    }

    const duplicatePointer = await fixture();
    try {
      duplicatePointer.manifest.pointers.taxonomy =
        duplicatePointer.manifest.pointers.relationship_integrity_bundle;
      const manifestSha = await writeManifest(duplicatePointer);
      await expect(loadFixture(duplicatePointer, manifestSha)).rejects.toThrow(
        /pointers relationship_integrity_bundle and taxonomy address the same file/,
      );
    } finally {
      await rm(duplicatePointer.root, { recursive: true, force: true });
    }

    const unsafePointer = await fixture();
    try {
      unsafePointer.manifest.pointers.taxonomy = "../taxonomy.json";
      unsafePointer.manifest.files["../taxonomy.json"] = fileMetadata("{}\n");
      const manifestSha = await writeManifest(unsafePointer);
      await expect(loadFixture(unsafePointer, manifestSha)).rejects.toThrow(
        "unsafe MTA Wiki release pointer",
      );
    } finally {
      await rm(unsafePointer.root, { recursive: true, force: true });
    }

    const unconsumedDeclaredFile = await fixture();
    try {
      const original = '{"proof":"original"}\n';
      const fileName = "unconsumed-proof.json";
      await writeFile(join(unconsumedDeclaredFile.release, fileName), original);
      unconsumedDeclaredFile.manifest.files[fileName] = fileMetadata(original);
      const manifestSha = await writeManifest(unconsumedDeclaredFile);
      await writeFile(join(unconsumedDeclaredFile.release, fileName), '{"proof":"forged"}\n');
      await expect(loadFixture(unconsumedDeclaredFile, manifestSha)).rejects.toThrow(
        /unconsumed-proof\.json: (byte count|SHA-256) mismatch/,
      );
    } finally {
      await rm(unconsumedDeclaredFile.root, { recursive: true, force: true });
    }

    const unaddressedFile = await fixture();
    try {
      await writeFile(join(unaddressedFile.release, "unaddressed.json"), "{}\n");
      await expect(loadFixture(unaddressedFile)).rejects.toThrow(
        /release file set is incomplete:.*unexpected=\[unaddressed\.json\]/,
      );
    } finally {
      await rm(unaddressedFile.root, { recursive: true, force: true });
    }
  });

  test("keeps legitimate reviewed axes on deterministic identities but rejects reviewer attribution of the mapping", async () => {
    const temporalReview = await fixture();
    try {
      const manifestSha = await rewriteSnapshotAndProjectedAnchors(temporalReview, (snapshot) => {
        const local = snapshot.record_bindings.find(
          (binding) => binding.route_record_id === "route_b44-local",
        );
        if (local === undefined) throw new Error("Missing deterministic local binding fixture");
        Object.assign(local, {
          decision_id: "route-binding-v1:route_b44-local-temporal-review",
          accepted_by: "fixture-owner",
          accepted_at: "2026-07-18T12:00:00.000Z",
          rationale: "The reviewer confirmed only the current temporal scope.",
          reviewed_axes: ["record_temporal_scope"],
        });
      });
      const loaded = await loadFixture(temporalReview, manifestSha);
      expect(
        loaded.snapshot.record_bindings.find(
          (binding) => binding.route_record_id === "route_b44-local",
        ),
      ).toMatchObject({
        identity_basis: "deterministic_exact",
        reviewed_axes: ["record_temporal_scope"],
      });
    } finally {
      await rm(temporalReview.root, { recursive: true, force: true });
    }

    const forgedMappingReview = await fixture();
    try {
      const manifestSha = await rewriteSnapshotAndProjectedAnchors(
        forgedMappingReview,
        (snapshot) => {
          const local = snapshot.record_bindings.find(
            (binding) => binding.route_record_id === "route_b44-local",
          );
          if (local === undefined) throw new Error("Missing deterministic local binding fixture");
          Object.assign(local, {
            decision_id: "route-binding-v1:route_b44-local-forged-mapping-review",
            accepted_by: "fixture-owner",
            accepted_at: "2026-07-18T12:00:00.000Z",
            rationale: "This must not claim a reviewer created a deterministic mapping.",
            reviewed_axes: ["identity_mapping"],
          });
        },
      );
      await expect(loadFixture(forgedMappingReview, manifestSha)).rejects.toThrow(
        "deterministic exact identity mapping cannot be reviewer-attributed",
      );
    } finally {
      await rm(forgedMappingReview.root, { recursive: true, force: true });
    }
  });

  test("fails closed on excess identity fields", async () => {
    const value = await fixture();
    try {
      const manifestSha = await rewriteSnapshot(value, (snapshot) => {
        const first = snapshot.service_identities[0];
        if (first === undefined) throw new Error("Missing identity fixture");
        (first as unknown as Record<string, unknown>)["future_field"] = true;
      });
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: value.root,
          wikiRelease: value.releaseId,
          wikiManifestSha256: manifestSha,
        }),
      ).rejects.toThrow(/future_field|is unexpected/);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  test("fails closed on future release and embedded GTFS contract versions", async () => {
    const futureRelease = await fixture();
    try {
      futureRelease.manifest.manifest_version = 7;
      const manifestSha = await writeManifest(futureRelease);
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: futureRelease.root,
          wikiRelease: futureRelease.releaseId,
          wikiManifestSha256: manifestSha,
        }),
      ).rejects.toThrow(/manifest_version|Expected 5|Expected 6/);
    } finally {
      await rm(futureRelease.root, { recursive: true, force: true });
    }

    const futureGtfs = await fixture();
    try {
      const manifestSha = await rewriteSnapshot(futureGtfs, (snapshot) => {
        (snapshot.gtfs_snapshot as unknown as Record<string, unknown>)["schema_version"] = 3;
      });
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: futureGtfs.root,
          wikiRelease: futureGtfs.releaseId,
          wikiManifestSha256: manifestSha,
        }),
      ).rejects.toThrow(/schema_version|Expected 2/);
    } finally {
      await rm(futureGtfs.root, { recursive: true, force: true });
    }
  });

  test("preserves catalog Q6 and GTFS Q06 as typed nonmatching identities", async () => {
    const root = await mkdtemp(join(tmpdir(), "current-bus-routes-parity-"));
    try {
      const currentPath = join(root, "current-bus-routes.json");
      const currentBytes =
        canonicalJson([
          {
            route_id: "Q6",
            route_short_name: "Q6",
            in_effect: "true",
            valid_from: "2026-01-01",
            valid_to: "2026-12-31",
            route_type: "Local",
            trip_type: "1",
          },
        ]) + "\n";
      await writeFile(currentPath, currentBytes);
      const q06 = {
        ...identity("B44"),
        source_route_id: "Q06",
        gtfs_route_id: "Q06",
        route_family_id: "Q06",
        route_short_name: "Q06",
        route_long_name: "Jamaica - College Point",
        route_desc: null,
        catalog_in_effect: "no",
        designation_literals: ["route_type:Local", "trip_type:1"],
        normalized_service_modes: ["local"],
        display_label: "Q06",
        display_label_source: "gtfs",
        label_fallback: null,
        label_diff: null,
      } as ServiceIdentity;
      const snapshot = snapshotForAudit(q06, sha(currentBytes));
      const audited = await auditCurrentBusRoutesParity({
        currentBusRoutesPath: currentPath,
        expectedSha256: sha(currentBytes),
        effectiveAsOfDate: "2026-07-18",
        snapshot,
      });

      expect(audited.parity).toMatchObject({
        descriptorReconciled: false,
        catalogInEffectSetsEqual: false,
        catalogOnlyRouteIds: ["Q6"],
        gtfsOnlyRouteIds: ["Q06"],
        currentCatalogRouteCount: 1,
        gtfsRouteCount: 1,
        catalogInEffectIdentityCount: 0,
      });
      expect(audited.designationsByRouteId.get("Q6")).toEqual({
        routeTypes: ["Local"],
        tripTypes: ["1"],
        routeShortName: "Q6",
      });
      expect(audited.designationsByRouteId.has("Q06")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("requires both in_effect and inclusive interval coverage for catalog membership", async () => {
    const root = await mkdtemp(join(tmpdir(), "current-bus-routes-interval-"));
    try {
      const currentPath = join(root, "current-bus-routes.json");
      const currentBytes =
        canonicalJson([
          {
            route_id: "B44",
            route_short_name: "B44",
            in_effect: "true",
            valid_from: "2026-01-01T00:00:00.000",
            valid_to: "2026-07-17T23:59:59.999",
            route_type: "Local",
            trip_type: "1",
          },
        ]) + "\n";
      await writeFile(currentPath, currentBytes);
      const snapshot = snapshotForAudit(
        { ...identity("B44"), catalog_in_effect: "no" },
        sha(currentBytes),
      );

      const audited = await auditCurrentBusRoutesParity({
        currentBusRoutesPath: currentPath,
        expectedSha256: sha(currentBytes),
        effectiveAsOfDate: "2026-07-18",
        snapshot,
      });

      expect(audited.parity).toMatchObject({
        descriptorReconciled: true,
        catalogInEffectSetsEqual: true,
        currentCatalogRouteCount: 0,
        catalogInEffectIdentityCount: 0,
        gtfsOnlyRouteIds: ["B44"],
      });
      expect(audited.designationsByRouteId.has("B44")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails closed on unknown future Current Bus Routes designations even off-scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "current-bus-routes-future-mode-"));
    try {
      const currentPath = join(root, "current-bus-routes.json");
      const currentBytes =
        canonicalJson([
          {
            route_id: "B44",
            route_short_name: "B44",
            in_effect: "false",
            valid_from: "2026-01-01",
            valid_to: "2026-12-31",
            route_type: "Future Service",
            trip_type: "15",
          },
        ]) + "\n";
      await writeFile(currentPath, currentBytes);

      await expect(
        auditCurrentBusRoutesParity({
          currentBusRoutesPath: currentPath,
          expectedSha256: sha(currentBytes),
          effectiveAsOfDate: "2026-07-18",
          snapshot: snapshotForAudit(
            { ...identity("B44"), catalog_in_effect: "no" },
            sha(currentBytes),
          ),
        }),
      ).rejects.toThrow(/route_type: unsupported literal Future Service/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("requires one presentation primary for each multiply-bound exact service", async () => {
    const missing = await fixture();
    try {
      const manifestSha = await rewriteSnapshot(missing, (snapshot) => {
        const local = snapshot.record_bindings.find(
          (row) => row.route_record_id === "route_b44-local",
        );
        if (local === undefined) throw new Error("Missing binding fixture");
        Object.assign(local, { presentation_primary: false });
      });
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: missing.root,
          wikiRelease: missing.releaseId,
          wikiManifestSha256: manifestSha,
        }),
      ).rejects.toThrow(/decision_kind fields do not reconcile|presentation_primary/);
    } finally {
      await rm(missing.root, { recursive: true, force: true });
    }

    const multiple = await fixture();
    try {
      const manifestSha = await rewriteSnapshot(multiple, (snapshot) => {
        const b44 = snapshot.service_identities.find((row) => row.source_route_id === "B44");
        const reviewed = snapshot.record_bindings.find(
          (row) => row.route_record_id === "route_b44-sbs",
        );
        if (b44 === undefined || reviewed === undefined) {
          throw new Error("Missing binding fixtures");
        }
        Object.assign(reviewed, {
          dataset_id: b44.dataset_id,
          component_feed_ids: [...b44.component_feed_ids],
          source_route_id: b44.source_route_id,
          gtfs_route_id: b44.gtfs_route_id,
          service_variant: "local",
          expected_gtfs_identity_fingerprint: identityFingerprint(b44),
        });
      });
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: multiple.root,
          wikiRelease: multiple.releaseId,
          wikiManifestSha256: manifestSha,
        }),
      ).rejects.toThrow(/exactly one presentation_primary.*found 2/);
    } finally {
      await rm(multiple.root, { recursive: true, force: true });
    }
  });

  test("requires the complete null-GTFS disposition projection", async () => {
    const value = await fixture();
    try {
      const manifestSha = await rewriteAnchors(value, (anchors) => {
        const index = anchors.findIndex((row) => row.gtfs_route_id === null);
        if (index < 0) throw new Error("Missing null disposition fixture");
        anchors.splice(index, 1);
      });
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: value.root,
          wikiRelease: value.releaseId,
          wikiManifestSha256: manifestSha,
        }),
      ).rejects.toThrow(
        "route_anchors.jsonl is not the canonical complete route identity projection",
      );
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  test("requires projectable to equal the full operational eligibility predicate", async () => {
    const value = await fixture();
    try {
      const manifestSha = await rewriteSnapshot(value, (snapshot) => {
        const b44 = snapshot.service_identities.find((row) => row.source_route_id === "B44");
        if (b44 === undefined) throw new Error("Missing B44 identity");
        Object.assign(b44, {
          scheduled_in_window: "no",
          scheduled_service_dates: [],
          scheduled_trip_template_date_count: 0,
        });
        const fingerprint = identityFingerprint(b44);
        for (const binding of snapshot.record_bindings.filter(
          (row) => row.source_route_id === "B44",
        )) {
          Object.assign(binding, { expected_gtfs_identity_fingerprint: fingerprint });
          if (binding.route_record_id === "route_b44-historical") {
            Object.assign(binding, {
              ineligibility_reasons: ["not_scheduled_in_window", "record_not_current"],
            });
          } else {
            Object.assign(binding, {
              ineligibility_reasons: ["not_scheduled_in_window"],
            });
          }
        }
      });
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: value.root,
          wikiRelease: value.releaseId,
          wikiManifestSha256: manifestSha,
        }),
      ).rejects.toThrow("projectable must equal complete operational eligibility");
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  test("rejects reliable-interval and canonical-record fingerprint drift", async () => {
    const badInterval = await fixture();
    try {
      const manifestSha = await rewriteSnapshot(badInterval, (snapshot) => {
        const b44 = snapshot.service_identities.find((row) => row.source_route_id === "B44");
        if (b44 === undefined) throw new Error("Missing B44 identity");
        Object.assign(b44, { reliable_interval_start: "2026-06-27" });
      });
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: badInterval.root,
          wikiRelease: badInterval.releaseId,
          wikiManifestSha256: manifestSha,
        }),
      ).rejects.toThrow("reliable interval is not the component intersection");
    } finally {
      await rm(badInterval.root, { recursive: true, force: true });
    }

    const staleCanonical = await fixture();
    try {
      const manifestSha = await rewriteCanonicalRoutes(staleCanonical, (records) => {
        const local = records.find((row) => row.record_id === "route_b44-local");
        if (local === undefined) throw new Error("Missing canonical route fixture");
        local.payload.internal_route_id = "B44-DRIFT";
      });
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: staleCanonical.root,
          wikiRelease: staleCanonical.releaseId,
          wikiManifestSha256: manifestSha,
        }),
      ).rejects.toThrow("canonical record fingerprint is stale");
    } finally {
      await rm(staleCanonical.root, { recursive: true, force: true });
    }
  });

  test("preserves the producer decision-ledger receipt and verifies canonical evidence independently", async () => {
    const alternateDecisionReceipt = await fixture();
    try {
      const manifestSha = await rewriteSnapshotWithoutCommitmentRepair(
        alternateDecisionReceipt,
        (snapshot) => {
          Object.assign(snapshot, { reviewed_decision_sha256: fixedSha });
        },
      );
      const loaded = await loadMtaWikiRouteIdentities({
        mtaWikiRoot: alternateDecisionReceipt.root,
        wikiRelease: alternateDecisionReceipt.releaseId,
        wikiManifestSha256: manifestSha,
      });
      expect(loaded.snapshot.reviewed_decision_sha256).toBe(fixedSha);
    } finally {
      await rm(alternateDecisionReceipt.root, { recursive: true, force: true });
    }

    const staleEvidence = await fixture();
    try {
      const manifestSha = await rewriteSnapshot(staleEvidence, (snapshot) => {
        const local = snapshot.record_bindings.find(
          (binding) => binding.route_record_id === "route_b44-local",
        );
        if (local === undefined) throw new Error("Missing local route binding fixture");
        Object.assign(local, { evidence_ids: ["source#stale"] });
      });
      await expect(
        loadMtaWikiRouteIdentities({
          mtaWikiRoot: staleEvidence.root,
          wikiRelease: staleEvidence.releaseId,
          wikiManifestSha256: manifestSha,
        }),
      ).rejects.toThrow("canonical evidence ids are stale");
    } finally {
      await rm(staleEvidence.root, { recursive: true, force: true });
    }
  });

  test("represents partial reliable intervals as indeterminate and nonprojectable", async () => {
    const value = await fixture();
    try {
      const manifestSha = await rewriteSnapshotAndProjectedAnchors(value, (snapshot) => {
        for (const component of snapshot.gtfs_snapshot.components) {
          if (component.dataset_id === "mta-nyct-bus") {
            Object.assign(component, { reliable_interval_start: "2026-07-15" });
          }
        }
        for (const identity of snapshot.service_identities) {
          Object.assign(identity, {
            reliable_interval_start: "2026-07-15",
            reliability_status: "indeterminate",
            scheduled_in_window: "indeterminate",
            scheduled_service_dates: [],
            scheduled_trip_template_date_count: 0,
          });
        }
        for (const binding of snapshot.record_bindings) {
          const identity = snapshot.service_identities.find(
            (candidate) =>
              candidate.dataset_id === binding.dataset_id &&
              candidate.source_route_id === binding.source_route_id,
          );
          if (identity === undefined) throw new Error("Missing bound route identity fixture");
          Object.assign(binding, {
            projectable: false,
            presentation_primary: false,
            expected_gtfs_identity_fingerprint: identityFingerprint(identity),
            ineligibility_reasons:
              binding.record_temporal_scope === "historical_description"
                ? ["not_scheduled_in_window", "record_not_current", "reliability_not_proven"]
                : ["not_scheduled_in_window", "reliability_not_proven"],
            decision_kind:
              binding.record_temporal_scope === "historical_description"
                ? "historical_description"
                : "current_ineligible",
          });
        }
      });
      const loaded = await loadMtaWikiRouteIdentities({
        mtaWikiRoot: value.root,
        wikiRelease: value.releaseId,
        wikiManifestSha256: manifestSha,
      });
      expect(loaded.snapshot.service_identities.map((row) => row.reliability_status)).toEqual([
        "indeterminate",
        "indeterminate",
      ]);
      expect(loaded.snapshot.service_identities.map((row) => row.scheduled_in_window)).toEqual([
        "indeterminate",
        "indeterminate",
      ]);
      expect(loaded.snapshot.record_bindings.some((binding) => binding.projectable)).toBe(false);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });
});
