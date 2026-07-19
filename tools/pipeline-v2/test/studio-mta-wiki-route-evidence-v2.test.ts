import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import {
  StudioRouteEvidenceArtifactV2Schema,
  StudioRouteEvidenceBundleV2Schema,
  StudioRouteEvidenceIndexV2Schema,
} from "@bp/domain/studio/route-evidence";
import { runStudioImportMtaWikiRouteEvidence } from "../src/commands/studio/import-mta-wiki-route-evidence.ts";

const baseRoutesPath = join(import.meta.dir, "fixtures", "mta-wiki-route-evidence", "routes.json");
const fixedSha = "0".repeat(64);
const snapshotId = "mta-bus-2026-07-18-route-provenance-v1";
const componentFeedIds = [
  "mta-bus-company",
  "nyct-bronx",
  "nyct-brooklyn",
  "nyct-manhattan",
  "nyct-queens",
  "nyct-staten-island",
] as const;
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
const gtfsOutputNames = [
  "agency.txt",
  "catalog_gtfs_disagreements.jsonl",
  "catalog_routes.jsonl",
  "feed_info.txt",
  "receipt.json",
  "route_activity.jsonl",
  "route_inventory.jsonl",
  "routes.txt",
] as const;
const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function sortedShaTree(
  root: string,
): Promise<Array<{ bytes: number; path: string; sha256: string }>> {
  const rows: Array<{ bytes: number; path: string; sha256: string }> = [];
  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = (await readdir(directory, { withFileTypes: true })).toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const bytes = await readFile(absolutePath);
        rows.push({ bytes: bytes.byteLength, path: relativePath, sha256: sha(bytes) });
      }
    }
  }
  await walk(root, "");
  return rows;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Fixture contains an unsupported JSON value");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function asJsonl(rows: readonly unknown[]): string {
  return rows.length === 0 ? "" : `${rows.map(canonicalJson).join("\n")}\n`;
}

function fileMetadata(bytes: string) {
  return { bytes: Buffer.byteLength(bytes), sha256: sha(bytes) };
}

function artifactMetadata(path: string, rows: number, bytes?: string) {
  const content =
    bytes ??
    (rows === 0
      ? ""
      : `${Array.from({ length: rows }, (_, index) =>
          canonicalJson({ fixture: path, row: index + 1 }),
        ).join("\n")}\n`);
  return {
    path,
    sha256: sha(content),
    bytes: Buffer.byteLength(content),
    rows,
  };
}

function gtfsComponent(componentFeedId: (typeof componentFeedIds)[number]) {
  const start =
    componentFeedId === "mta-bus-company" || componentFeedId === "nyct-staten-island"
      ? "2026-06-28"
      : "2026-06-27";
  return {
    component_feed_id: componentFeedId,
    dataset_id: componentFeedId === "mta-bus-company" ? "mta-bus-company" : "mta-nyct-bus",
    official_url: `https://rrgtfsfeeds.s3.amazonaws.com/${componentFeedId}.zip`,
    archive_sha256: sha(`archive:${componentFeedId}`),
    feed_version: `fixture-${componentFeedId}`,
    publisher: "MTA New York City Transit",
    feed_start_date: start,
    feed_end_date: "2026-09-05",
    reliable_interval_start: start,
    reliable_interval_end: "2026-09-05",
    agency_timezone: "America/New_York",
    frequencies_present: false,
    conditional_location_files_present: false,
    files: Object.fromEntries(
      requiredGtfsFiles.map((name) => [
        name,
        artifactMetadata(name, 1, `${canonicalJson({ componentFeedId, name })}\n`),
      ]),
    ),
  };
}

function evidence(blockId: string) {
  return [
    {
      source_id: "b44_route_report",
      evidence_id: `b44_route_report#${blockId}`,
      source_path: "raw/sources/b44_route_report/blocks.jsonl",
      page_number: 1,
      block_id: blockId,
      text_sha256: `sha256:${blockId}`,
    },
  ];
}

function identity(input: {
  routeId: string;
  label: string;
  modes: readonly ("limited_stop" | "local" | "sbs")[];
  designations: readonly string[];
}) {
  return {
    dataset_id: "mta-nyct-bus",
    component_feed_ids: ["nyct-brooklyn"],
    source_route_id: input.routeId,
    gtfs_route_id: input.routeId,
    agency_id: "MTA NYCT",
    raw_route_type: "3",
    route_family_id: "B44",
    route_short_name: input.label,
    route_long_name: "Sheepshead Bay - Williamsburg",
    route_desc: (input.routeId === "B44+"
      ? "Select Bus Service via Nostrand Av"
      : "via Nostrand Av") as string | null,
    declared_in_feed: true,
    catalog_in_effect: "yes" as "yes" | "no",
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
    scheduled_trip_template_date_count: input.routeId === "B44+" ? 1648 : 1688,
    frequencies_present: false,
    designation_literals: [...input.designations],
    normalized_service_modes: [...input.modes],
    display_label: input.label,
    display_label_source: "current_bus_routes" as "current_bus_routes" | "gtfs",
    reliable_interval_start: "2026-06-27",
    reliable_interval_end: "2026-09-05",
    reliable_interval_derivation: "component_feed_bounds_intersection_v1",
    label_fallback: null,
    label_diff: null,
    snapshot_id: snapshotId,
  };
}

type CanonicalRouteRecord = {
  record_id: string;
  record_kind: "route";
  display_name: string;
  payload: {
    route_id: string;
    route_label: string;
    internal_route_id: string;
    route_id_authority: "gtfs_exact";
    service_variant: "limited_stop" | "local" | "sbs";
    route_record_scope: "true_route";
  };
  evidence_refs: ReturnType<typeof evidence>;
};

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

function binding(
  input: {
    recordId: string;
    routeId: "B44" | "B44+";
    variant: "limited_stop" | "local" | "sbs";
    temporal: "current_description" | "historical_description";
    projectable: boolean;
  },
  record: CanonicalRouteRecord,
  routeIdentity: ReturnType<typeof identity>,
) {
  return {
    route_record_id: input.recordId,
    route_family_id: "B44",
    dataset_id: "mta-nyct-bus",
    component_feed_ids: ["nyct-brooklyn"],
    source_route_id: input.routeId,
    gtfs_route_id: input.routeId,
    service_variant: input.variant,
    identity_scope: "exact_service",
    service_class: "regular_mta_bus",
    record_temporal_scope: input.temporal,
    projectable: input.projectable,
    presentation_primary: input.projectable,
    derivation: "authoritative_internal_route_id_exact_v1",
    evidence_ids: record.evidence_refs.map((ref) => ref.evidence_id).toSorted(),
    canonical_record_fingerprint: routeRecordFingerprint(record),
    identity_basis: "deterministic_exact",
    expected_gtfs_identity_fingerprint: sha(canonicalJson(routeIdentity)),
    decision_kind:
      input.temporal === "historical_description" ? "historical_description" : "current_primary",
    ineligibility_reasons:
      input.temporal === "historical_description" ? ["record_not_current"] : [],
  };
}

async function createNamedReleaseFixture(
  input: {
    catalogOnlyQ6?: boolean;
    descriptorCatalogOnlyCount?: number;
    gtfsOnlyQ06?: boolean;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "route-evidence-v2-"));
  const mtaWikiRoot = join(root, "mta-wiki");
  const releaseId = "v1-rc24";
  const releaseRoot = join(mtaWikiRoot, "data", "exports", "releases", releaseId);
  await mkdir(releaseRoot, { recursive: true });

  const currentRows: Array<Record<string, string>> = [
    {
      route_id: "B44",
      route_short_name: "B44",
      in_effect: "true",
      valid_from: "2026-01-01",
      valid_to: "2026-12-31",
      route_type: "Local",
      trip_type: "1",
    },
    {
      route_id: "B44+",
      route_short_name: "B44-SBS",
      in_effect: "true",
      valid_from: "2026-01-01",
      valid_to: "2026-12-31",
      route_type: "Limited",
      trip_type: "12",
    },
    {
      route_id: "B44+",
      route_short_name: "B44-SBS",
      in_effect: "true",
      valid_from: "2026-01-01",
      valid_to: "2026-12-31",
      route_type: "SBS",
      trip_type: "14",
    },
  ];
  if (input.catalogOnlyQ6 === true) {
    currentRows.push({
      route_id: "Q6",
      route_short_name: "Q6",
      in_effect: "true",
      valid_from: "2026-01-01",
      valid_to: "2026-12-31",
      route_type: "Local",
      trip_type: "1",
    });
  }
  const currentBytes = `${canonicalJson(currentRows)}\n`;
  const currentPath = join(root, "current-bus-routes.json");
  await writeFile(currentPath, currentBytes);

  const routeRecords: CanonicalRouteRecord[] = [
    {
      record_id: "route_b44-local",
      record_kind: "route",
      display_name: "B44 local",
      payload: {
        route_id: "B44",
        route_label: "B44",
        internal_route_id: "B44",
        route_id_authority: "gtfs_exact",
        service_variant: "local",
        route_record_scope: "true_route",
      },
      evidence_refs: evidence("route-local"),
    },
    {
      record_id: "route_b44-limited-historical",
      record_kind: "route",
      display_name: "B44 Limited historical",
      payload: {
        route_id: "B44",
        route_label: "B44 Limited",
        internal_route_id: "B44",
        route_id_authority: "gtfs_exact",
        service_variant: "limited_stop",
        route_record_scope: "true_route",
      },
      evidence_refs: evidence("route-limited-historical"),
    },
    {
      record_id: "route_b44-sbs",
      record_kind: "route",
      display_name: "B44 SBS",
      payload: {
        route_id: "B44",
        route_label: "B44 SBS",
        internal_route_id: "B44+",
        route_id_authority: "gtfs_exact",
        service_variant: "sbs",
        route_record_scope: "true_route",
      },
      evidence_refs: evidence("route-sbs"),
    },
  ];
  const serviceIdentities = [
    identity({
      routeId: "B44",
      label: "B44",
      designations: ["route_type:Local", "trip_type:1"],
      modes: ["local"],
    }),
    identity({
      routeId: "B44+",
      label: "B44-SBS",
      designations: ["route_type:Limited", "route_type:SBS", "trip_type:12", "trip_type:14"],
      modes: ["limited_stop", "sbs"],
    }),
  ];
  if (input.gtfsOnlyQ06 === true) {
    serviceIdentities.push({
      ...identity({
        routeId: "B44",
        label: "B44",
        designations: ["route_type:Local", "trip_type:1"],
        modes: ["local"],
      }),
      source_route_id: "Q06",
      gtfs_route_id: "Q06",
      route_family_id: "Q06",
      route_short_name: "Q06",
      route_long_name: "Jamaica - College Point",
      route_desc: null,
      catalog_in_effect: "no",
      display_label: "Q06",
      display_label_source: "gtfs",
    });
  }

  const descriptorCatalogOnlyCount =
    input.descriptorCatalogOnlyCount ?? (input.catalogOnlyQ6 === true ? 1 : 0);
  const descriptorGtfsOnlyCount = input.gtfsOnlyQ06 === true ? 1 : 0;
  const catalogIdentityCount =
    serviceIdentities.filter((identity) => identity.catalog_in_effect === "yes").length +
    descriptorCatalogOnlyCount;
  const currentCatalog = {
    contract_version: 1,
    dataset_id: "h2wf-afav",
    artifact_sha256: sha(currentBytes),
    effective_as_of_date: "2026-07-18",
    catalog_routes: artifactMetadata("catalog_routes.jsonl", catalogIdentityCount),
    catalog_gtfs_disagreements: artifactMetadata(
      "catalog_gtfs_disagreements.jsonl",
      descriptorCatalogOnlyCount + descriptorGtfsOnlyCount,
    ),
    catalog_identity_count: catalogIdentityCount,
    catalog_only_count: descriptorCatalogOnlyCount,
    gtfs_only_count: descriptorGtfsOnlyCount,
  };
  const routeInventoryBytes = asJsonl(serviceIdentities);
  const outputs = Object.fromEntries(
    gtfsOutputNames.map((name) => [
      name,
      name === "route_inventory.jsonl"
        ? artifactMetadata(name, serviceIdentities.length, routeInventoryBytes)
        : name === "catalog_routes.jsonl"
          ? currentCatalog.catalog_routes
          : name === "catalog_gtfs_disagreements.jsonl"
            ? currentCatalog.catalog_gtfs_disagreements
            : artifactMetadata(name, name === "receipt.json" ? 1 : serviceIdentities.length),
    ]),
  );
  const gtfsSnapshot = {
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
    components: componentFeedIds.map(gtfsComponent),
    outputs,
    counts: {
      route_identity_count: serviceIdentities.length,
      route_activity_count: serviceIdentities.length,
      catalog_identity_count: catalogIdentityCount,
      catalog_only_count: descriptorCatalogOnlyCount,
      gtfs_only_count: descriptorGtfsOnlyCount,
    },
  };
  const [localRecord, historicalRecord, sbsRecord] = routeRecords;
  const [localIdentity, sbsIdentity] = serviceIdentities;
  if (
    localRecord === undefined ||
    historicalRecord === undefined ||
    sbsRecord === undefined ||
    localIdentity === undefined ||
    sbsIdentity === undefined
  ) {
    throw new Error("Incomplete exact route identity fixture");
  }
  const recordBindings = [
    binding(
      {
        recordId: "route_b44-local",
        routeId: "B44",
        variant: "local",
        temporal: "current_description",
        projectable: true,
      },
      localRecord,
      localIdentity,
    ),
    binding(
      {
        recordId: "route_b44-limited-historical",
        routeId: "B44",
        variant: "limited_stop",
        temporal: "historical_description",
        projectable: false,
      },
      historicalRecord,
      localIdentity,
    ),
    binding(
      {
        recordId: "route_b44-sbs",
        routeId: "B44+",
        variant: "sbs",
        temporal: "current_description",
        projectable: true,
      },
      sbsRecord,
      sbsIdentity,
    ),
  ].toSorted((left, right) => left.route_record_id.localeCompare(right.route_record_id));

  const anchors: Array<{
    gtfs_route_id: string | null;
    canonical_route_record_id: string | null;
    variant_record_ids: string[];
    aliases: string[];
    disposition: string;
    anchor_reason: string | null;
  }> = [
    {
      gtfs_route_id: "B44",
      canonical_route_record_id: "route_b44-local",
      variant_record_ids: [],
      aliases: ["B44"],
      disposition: "exact_service",
      anchor_reason: "route_identity_snapshot_v1",
    },
    {
      gtfs_route_id: "B44+",
      canonical_route_record_id: "route_b44-sbs",
      variant_record_ids: [],
      aliases: ["B44+", "B44-SBS"],
      disposition: "exact_service",
      anchor_reason: "route_identity_snapshot_v1",
    },
    {
      gtfs_route_id: null,
      canonical_route_record_id: "route_b44-limited-historical",
      variant_record_ids: [],
      aliases: ["B44"],
      disposition: "historical_service_identity",
      anchor_reason:
        "route_identity_snapshot_v1:exact_service:regular_mta_bus:historical_description",
    },
  ];
  if (input.gtfsOnlyQ06 === true) {
    anchors.push({
      gtfs_route_id: "Q06",
      canonical_route_record_id: null,
      variant_record_ids: [],
      aliases: ["Q06"],
      disposition: "no_wiki_coverage",
      anchor_reason: null,
    });
    anchors.sort((left, right) => {
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
  const anchorBytes = asJsonl(anchors);
  const snapshot = {
    schema_version: 1,
    contract_id: "route-identity-snapshot-v1",
    gtfs_snapshot_id: snapshotId,
    gtfs_snapshot: gtfsSnapshot,
    gtfs_snapshot_sha256: sha(`${canonicalJson(gtfsSnapshot)}\n`),
    reviewed_decision_sha256: sha(""),
    current_catalog: currentCatalog,
    service_identity_count: serviceIdentities.length,
    service_identities_sha256: sha(routeInventoryBytes),
    service_identities: serviceIdentities,
    record_binding_count: recordBindings.length,
    record_bindings_sha256: sha(asJsonl(recordBindings)),
    record_bindings: recordBindings,
    expected_route_anchors_count: anchors.length,
    expected_route_anchors_sha256: sha(anchorBytes),
  };
  const snapshotBytes = `${canonicalJson(snapshot)}\n`;

  const canonical = {
    "routes.jsonl": asJsonl(
      routeRecords.toSorted((left, right) => left.record_id.localeCompare(right.record_id)),
    ),
    "projects.jsonl": asJsonl([
      {
        record_id: "project_b44_local",
        record_kind: "project",
        payload: { project_name: "B44 local project", routes_served: ["B44"] },
        evidence_refs: evidence("project-local"),
      },
      {
        record_id: "project_b44_limited_historical",
        record_kind: "project",
        payload: {
          project_name: "B44 historical limited project",
          routes_served: ["B44 Limited"],
        },
        evidence_refs: evidence("project-limited-historical"),
      },
      {
        record_id: "project_b44_sbs",
        record_kind: "project",
        payload: { project_name: "B44 SBS project", routes_served: ["B44+"] },
        evidence_refs: evidence("project-sbs"),
      },
    ]),
    "relations.jsonl": asJsonl([
      {
        record_id: "relation_b44_local",
        record_kind: "relation",
        payload: {
          relation_kind: "serves_route",
          relation_family: "route_scope",
          subject_id: "project_b44_local",
          object_id: "route_b44-local",
        },
        evidence_refs: evidence("relation-local"),
      },
      {
        record_id: "relation_b44_limited_historical",
        record_kind: "relation",
        payload: {
          relation_kind: "serves_route",
          relation_family: "route_scope",
          subject_id: "project_b44_limited_historical",
          object_id: "route_b44-limited-historical",
        },
        evidence_refs: evidence("relation-limited-historical"),
      },
      {
        record_id: "relation_b44_sbs",
        record_kind: "relation",
        payload: {
          relation_kind: "serves_route",
          relation_family: "route_scope",
          subject_id: "project_b44_sbs",
          object_id: "route_b44-sbs",
        },
        evidence_refs: evidence("relation-sbs"),
      },
    ]),
    "sources.jsonl": asJsonl([
      {
        record_id: "source_b44-route-report",
        record_kind: "source",
        display_name: "B44 route report",
        payload: { title: "B44 route report", publisher: "MTA" },
      },
    ]),
    "events.jsonl": "",
    "metric_claims.jsonl": "",
    "treatment_components.jsonl": "",
    "source_gaps.jsonl": "",
  };
  const manifestPointerFiles = {
    "operational_anchor_review_decisions.json": "{}\n",
    "operational_anchors_summary.json": "{}\n",
    "operational_anchors.jsonl": "",
    "operational_occurrence_review_decisions.json": "{}\n",
    "operational_occurrences_summary.json": "{}\n",
    "operational_occurrences.jsonl": "",
    "relationship_integrity_bundle.json": "{}\n",
    "taxonomy.json": "{}\n",
  };
  for (const [name, bytes] of Object.entries({ ...manifestPointerFiles, ...canonical })) {
    await writeFile(join(releaseRoot, name), bytes);
  }
  await writeFile(join(releaseRoot, "route_anchors.jsonl"), anchorBytes);
  await writeFile(join(releaseRoot, "route_identity_snapshot.json"), snapshotBytes);

  const manifest = {
    manifest_version: 5,
    release_id: releaseId,
    generator_commit: fixedSha,
    contract_versions: {
      operational_anchor_review_decisions: 2,
      operational_anchors: 1,
      operational_occurrence_review_decisions: 2,
      operational_occurrences: 2,
      relationship_integrity_bundle: 1,
      route_anchors: 1,
      route_identity_snapshot: 1,
    },
    files: {
      ...Object.fromEntries(
        Object.entries({ ...manifestPointerFiles, ...canonical }).map(([name, bytes]) => [
          name,
          fileMetadata(bytes),
        ]),
      ),
      "route_anchors.jsonl": fileMetadata(anchorBytes),
      "route_identity_snapshot.json": fileMetadata(snapshotBytes),
    },
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
      event: 0,
      metric_claim: 0,
      project: 3,
      relation: 3,
      route: 3,
      source: 1,
      source_gap: 0,
      treatment_component: 0,
    },
  };
  const manifestBytes = `${canonicalJson(manifest)}\n`;
  await writeFile(join(releaseRoot, "manifest.json"), manifestBytes);

  const base = (await Bun.file(baseRoutesPath).json()) as {
    routes: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  const template = base.routes[0];
  if (template === undefined) throw new Error("Missing base Studio route fixture");
  const routeRows = [
    { ...template, slug: "b44", routeId: "B44", label: "B44", sbs: false },
    { ...template, slug: "b44-sbs", routeId: "B44+", label: "B44", sbs: true },
  ];
  const routesBytes = `${JSON.stringify({ ...base, routes: routeRows }, null, 2)}\n`;
  const routesPath = join(root, "routes.json");
  await writeFile(routesPath, routesBytes);

  return {
    root,
    mtaWikiRoot,
    releaseId,
    manifestSha256: sha(manifestBytes),
    currentPath,
    currentSha256: sha(currentBytes),
    routesPath,
    routesSha256: sha(routesBytes),
  };
}

describe("studio named MTA Wiki route-evidence v2 import", () => {
  test("keeps exact B44/B44+ identity, contextual history, official labels, and deterministic bytes", async () => {
    const fixture = await createNamedReleaseFixture();
    try {
      const options = {
        mtaWikiRoot: fixture.mtaWikiRoot,
        routesPath: fixture.routesPath,
        routesSha256: fixture.routesSha256,
        wikiRelease: fixture.releaseId,
        wikiManifestSha256: fixture.manifestSha256,
        currentBusRoutesPath: fixture.currentPath,
        currentBusRoutesSha256: fixture.currentSha256,
        currentBusRoutesEffectiveAsOfDate: "2026-07-18",
        generatedAt: "2026-07-18T00:00:00.000Z",
        minMatchedRoutes: 2,
      } as const;
      const outputA = join(fixture.root, "run-a", "route-evidence.json");
      const outputB = join(fixture.root, "run-b", "route-evidence.json");
      const first = decodeStrict(StudioRouteEvidenceArtifactV2Schema)(
        await runStudioImportMtaWikiRouteEvidence({ ...options, output: outputA }),
      );
      const second = decodeStrict(StudioRouteEvidenceArtifactV2Schema)(
        await runStudioImportMtaWikiRouteEvidence({ ...options, output: outputB }),
      );

      expect(first).toEqual(second);
      expect(first.source).toMatchObject({
        wikiRelease: fixture.releaseId,
        manifestSha256: fixture.manifestSha256,
        trackerRouteInputSha256: fixture.routesSha256,
        catalogParity: {
          currentBusRoutesSha256: fixture.currentSha256,
          descriptorReconciled: true,
          catalogInEffectSetsEqual: true,
          catalogOnlyRouteIds: [],
          gtfsOnlyRouteIds: [],
        },
      });
      expect(first.routes.map((route) => route.routeId)).toEqual(["B44", "B44+"]);
      expect(first.routes.map((route) => route.routeSlug)).toEqual(["b44", "b44-sbs"]);

      const local = decodeStrict(StudioRouteEvidenceBundleV2Schema)(first.routes[0]);
      const sbs = decodeStrict(StudioRouteEvidenceBundleV2Schema)(first.routes[1]);
      expect(local.wikiRouteIds).toEqual(["B44"]);
      expect(sbs.wikiRouteIds).toEqual(["B44+"]);
      expect(local.routeIdentity).toMatchObject({
        routeId: "B44",
        routeFamilyId: "B44",
        displayLabel: "B44",
        serviceModes: ["local"],
        routeTypes: ["Local"],
        tripTypes: ["1"],
      });
      expect(sbs.routeIdentity).toMatchObject({
        routeId: "B44+",
        routeFamilyId: "B44",
        displayLabel: "B44-SBS",
        serviceModes: ["limited_stop", "sbs"],
        routeTypes: ["Limited", "SBS"],
        tripTypes: ["12", "14"],
      });
      expect(local.projects.map((project) => project.recordId)).toEqual(["project_b44_local"]);
      expect(sbs.projects.map((project) => project.recordId)).toEqual(["project_b44_sbs"]);
      expect(local.projects.map((project) => project.recordId)).not.toContain(
        "project_b44_limited_historical",
      );
      expect(local.operationalBindings.map((row) => row.routeRecordId)).toEqual([
        "route_b44-local",
      ]);
      expect(sbs.operationalBindings.map((row) => row.routeRecordId)).toEqual(["route_b44-sbs"]);
      expect(local.contextualBindings).toEqual([
        expect.objectContaining({
          routeRecordId: "route_b44-limited-historical",
          gtfsRouteId: "B44",
          recordTemporalScope: "historical_description",
          projectable: false,
          presentationPrimary: false,
        }),
      ]);

      const index = decodeStrict(StudioRouteEvidenceIndexV2Schema)(
        await Bun.file(join(fixture.root, "run-a", "index.json")).json(),
      );
      expect(index.source).toEqual(first.source);
      expect(index.routes.map((route) => route.routeIdentity.displayLabel)).toEqual([
        "B44",
        "B44-SBS",
      ]);

      const [treeA, treeB] = await Promise.all([
        sortedShaTree(join(fixture.root, "run-a")),
        sortedShaTree(join(fixture.root, "run-b")),
      ]);
      expect(treeA).toEqual(treeB);
      expect(treeA.map((row) => row.path)).toEqual([
        "index.json",
        "route-evidence.json",
        "routes/b44-sbs.json",
        "routes/b44.json",
      ]);
      expect(JSON.stringify(first)).not.toContain(fixture.root);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test("requires the exact named-release manifest and never falls back to fuzzy aliases", async () => {
    const fixture = await createNamedReleaseFixture();
    try {
      const output = join(fixture.root, "bad", "route-evidence.json");
      await expect(
        runStudioImportMtaWikiRouteEvidence({
          mtaWikiRoot: fixture.mtaWikiRoot,
          routesPath: fixture.routesPath,
          output,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          currentBusRoutesPath: fixture.currentPath,
          currentBusRoutesSha256: fixture.currentSha256,
          currentBusRoutesEffectiveAsOfDate: "2026-07-18",
          generatedAt: "2026-07-18T00:00:00.000Z",
        }),
      ).rejects.toThrow("routesSha256");
      await expect(
        runStudioImportMtaWikiRouteEvidence({
          mtaWikiRoot: fixture.mtaWikiRoot,
          routesPath: fixture.routesPath,
          routesSha256: fixedSha,
          output,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          currentBusRoutesPath: fixture.currentPath,
          currentBusRoutesSha256: fixture.currentSha256,
          currentBusRoutesEffectiveAsOfDate: "2026-07-18",
          generatedAt: "2026-07-18T00:00:00.000Z",
        }),
      ).rejects.toThrow("Tracker routes SHA-256 mismatch");
      await expect(
        runStudioImportMtaWikiRouteEvidence({
          mtaWikiRoot: fixture.mtaWikiRoot,
          routesPath: fixture.routesPath,
          routesSha256: fixture.routesSha256,
          output,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixedSha,
          currentBusRoutesPath: fixture.currentPath,
          currentBusRoutesSha256: fixture.currentSha256,
          currentBusRoutesEffectiveAsOfDate: "2026-07-18",
          generatedAt: "2026-07-18T00:00:00.000Z",
        }),
      ).rejects.toThrow("manifest SHA-256 mismatch");
      expect(await Bun.file(output).exists()).toBe(false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test("does not require a Tracker route for a typed GTFS-only identity outside the effective catalog", async () => {
    const fixture = await createNamedReleaseFixture({ gtfsOnlyQ06: true });
    try {
      const artifact = decodeStrict(StudioRouteEvidenceArtifactV2Schema)(
        await runStudioImportMtaWikiRouteEvidence({
          mtaWikiRoot: fixture.mtaWikiRoot,
          routesPath: fixture.routesPath,
          routesSha256: fixture.routesSha256,
          output: join(fixture.root, "gtfs-only", "route-evidence.json"),
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          currentBusRoutesPath: fixture.currentPath,
          currentBusRoutesSha256: fixture.currentSha256,
          currentBusRoutesEffectiveAsOfDate: "2026-07-18",
          generatedAt: "2026-07-18T00:00:00.000Z",
        }),
      );
      expect(artifact.source.catalogParity).toMatchObject({
        descriptorReconciled: true,
        catalogInEffectSetsEqual: true,
        catalogOnlyRouteIds: [],
        gtfsOnlyRouteIds: ["Q06"],
      });
      expect(artifact.routes.map((route) => route.routeId)).toEqual(["B44", "B44+"]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test("requires deterministic named inputs, protects immutable output paths, and rejects quarantine status", async () => {
    const fixture = await createNamedReleaseFixture();
    const base = {
      mtaWikiRoot: fixture.mtaWikiRoot,
      routesPath: fixture.routesPath,
      routesSha256: fixture.routesSha256,
      wikiRelease: fixture.releaseId,
      wikiManifestSha256: fixture.manifestSha256,
      currentBusRoutesPath: fixture.currentPath,
      currentBusRoutesSha256: fixture.currentSha256,
      currentBusRoutesEffectiveAsOfDate: "2026-07-18",
    } as const;
    try {
      await expect(
        runStudioImportMtaWikiRouteEvidence({
          ...base,
          output: join(fixture.root, "missing-time", "route-evidence.json"),
        }),
      ).rejects.toThrow("generatedAt is required");

      const releaseRoot = join(
        fixture.mtaWikiRoot,
        "data",
        "exports",
        "releases",
        fixture.releaseId,
      );
      await expect(
        runStudioImportMtaWikiRouteEvidence({
          ...base,
          generatedAt: "2026-07-18T00:00:00.000Z",
          output: join(releaseRoot, "forbidden.json"),
        }),
      ).rejects.toMatchObject({
        code: "unsafe_path",
        detail: "output must not overwrite files in the pinned MTA Wiki release",
      });
      await expect(
        runStudioImportMtaWikiRouteEvidence({
          ...base,
          generatedAt: "2026-07-18T00:00:00.000Z",
          output: join(fixture.root, "outside", "route-evidence.json"),
          servingOutputDir: join(releaseRoot, "forbidden-serving"),
        }),
      ).rejects.toMatchObject({
        code: "unsafe_path",
        detail: "output must not overwrite files in the pinned MTA Wiki release",
      });

      const statusRoot = join(fixture.mtaWikiRoot, "data", "exports", "release-status");
      await mkdir(statusRoot, { recursive: true });
      const statusPath = `data/exports/release-status/${fixture.releaseId}.json`;
      await writeFile(
        join(statusRoot, `${fixture.releaseId}.json`),
        `${canonicalJson({
          schema_version: 2,
          release_id: fixture.releaseId,
          release_path: `data/exports/releases/${fixture.releaseId}`,
          status: "quarantined",
          discovered_at: "2026-07-18",
          reason_code: "fixture_exact_route_defect",
          reason: "Fixture release intentionally carries an exact-route defect.",
          manifest_sha256: fixture.manifestSha256,
          failing_artifact: {
            path: "route_anchors.jsonl",
            bytes: 1,
            sha256: fixedSha,
            declared_contract_version: 1,
            detected_by_contract: "route-identity-snapshot-v1",
            detected_by_contract_version: 1,
            verifier_error: "fixture mismatch",
          },
          affected_identities: [
            {
              identity_type: "route",
              gtfs_route_id: "B44",
              route_record_id: "route_b44-local",
              route_family_id: "B44",
            },
          ],
          replacement_release_id: null,
        })}\n`,
      );
      await writeFile(
        join(statusRoot, "index.json"),
        `${canonicalJson({
          schema_version: 2,
          records: [
            {
              release_id: fixture.releaseId,
              path: statusPath,
              status: "quarantined",
              record_schema_version: 2,
            },
          ],
        })}\n`,
      );
      await expect(
        runStudioImportMtaWikiRouteEvidence({
          ...base,
          generatedAt: "2026-07-18T00:00:00.000Z",
          output: join(fixture.root, "quarantined", "route-evidence.json"),
        }),
      ).rejects.toThrow(
        `MTA Wiki release ${fixture.releaseId} is quarantined (fixture_exact_route_defect)`,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test("keeps a declared catalog-only identity explicit and outside the Tracker operational universe", async () => {
    const fixture = await createNamedReleaseFixture({ catalogOnlyQ6: true });
    try {
      const output = join(fixture.root, "typed-disagreement", "route-evidence.json");
      const artifact = decodeStrict(StudioRouteEvidenceArtifactV2Schema)(
        await runStudioImportMtaWikiRouteEvidence({
          mtaWikiRoot: fixture.mtaWikiRoot,
          routesPath: fixture.routesPath,
          routesSha256: fixture.routesSha256,
          output,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          currentBusRoutesPath: fixture.currentPath,
          currentBusRoutesSha256: fixture.currentSha256,
          currentBusRoutesEffectiveAsOfDate: "2026-07-18",
          generatedAt: "2026-07-18T00:00:00.000Z",
        }),
      );
      expect(artifact.source.catalogParity).toMatchObject({
        descriptorReconciled: true,
        catalogInEffectSetsEqual: false,
        catalogOnlyRouteIds: ["Q6"],
        gtfsOnlyRouteIds: [],
      });
      expect(artifact.routes.map((route) => route.routeId)).toEqual(["B44", "B44+"]);
      expect(await Bun.file(output).exists()).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test("stops when a catalog disagreement is not declared by the pinned descriptor", async () => {
    const fixture = await createNamedReleaseFixture({
      catalogOnlyQ6: true,
      descriptorCatalogOnlyCount: 0,
    });
    try {
      const output = join(fixture.root, "descriptor-drift", "route-evidence.json");
      await expect(
        runStudioImportMtaWikiRouteEvidence({
          mtaWikiRoot: fixture.mtaWikiRoot,
          routesPath: fixture.routesPath,
          routesSha256: fixture.routesSha256,
          output,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          currentBusRoutesPath: fixture.currentPath,
          currentBusRoutesSha256: fixture.currentSha256,
          currentBusRoutesEffectiveAsOfDate: "2026-07-18",
          generatedAt: "2026-07-18T00:00:00.000Z",
        }),
      ).rejects.toThrow(/descriptor mismatch.*catalog-only \[Q6\]/);
      expect(await Bun.file(output).exists()).toBe(false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test("rejects noncanonical and unsafe slugs before writing any evidence artifacts", async () => {
    for (const scenario of [
      {
        name: "collision",
        mutate(routes: Array<Record<string, unknown>>) {
          const first = routes[0];
          const second = routes[1];
          if (first === undefined || second === undefined) throw new Error("Missing route fixture");
          Reflect.set(second, "slug", Reflect.get(first, "slug"));
        },
        error: /must use canonical slug b44-sbs/,
      },
      {
        name: "traversal",
        mutate(routes: Array<Record<string, unknown>>) {
          const first = routes[0];
          if (first === undefined) throw new Error("Missing route fixture");
          Reflect.set(first, "slug", "../escape");
        },
        error: /must use canonical slug b44/,
      },
    ]) {
      const fixture = await createNamedReleaseFixture();
      try {
        const routesArtifact = (await Bun.file(fixture.routesPath).json()) as {
          routes: Array<Record<string, unknown>>;
        };
        scenario.mutate(routesArtifact.routes);
        const mutatedRoutesBytes = `${JSON.stringify(routesArtifact, null, 2)}\n`;
        await writeFile(fixture.routesPath, mutatedRoutesBytes);
        const output = join(fixture.root, scenario.name, "route-evidence.json");
        await expect(
          runStudioImportMtaWikiRouteEvidence({
            mtaWikiRoot: fixture.mtaWikiRoot,
            routesPath: fixture.routesPath,
            routesSha256: sha(mutatedRoutesBytes),
            output,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            currentBusRoutesPath: fixture.currentPath,
            currentBusRoutesSha256: fixture.currentSha256,
            currentBusRoutesEffectiveAsOfDate: "2026-07-18",
            generatedAt: "2026-07-18T00:00:00.000Z",
          }),
        ).rejects.toThrow(scenario.error);
        expect(await Bun.file(output).exists()).toBe(false);
        expect(await Bun.file(join(fixture.root, scenario.name, "index.json")).exists()).toBe(
          false,
        );
        expect(await Bun.file(join(fixture.root, scenario.name, "escape.json")).exists()).toBe(
          false,
        );
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  });
});
