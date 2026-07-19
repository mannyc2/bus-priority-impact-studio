import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createLocalPipelineDb } from "@bp/db/local";
import command from "../src/commands/studio/import-mta-wiki-operational-anchors.ts";
import {
  loadAvailableAnalysisRouteIds,
  runStudyEventMerge,
} from "../src/commands/study/merge-events.ts";
import { runMtaWikiOperationalAnchorImport } from "../src/lib/mta-wiki-operational-anchors.ts";
import {
  type MtaWikiRouteIdentitySnapshot,
  reconstructedRouteAnchors,
} from "../src/lib/mta-wiki-route-identities.ts";
import { buildStudyEventMergeArtifact } from "../src/lib/study-engine/study-events.ts";

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function canonicalJsonl(values: readonly unknown[]): string {
  return values.length === 0 ? "" : `${values.map(canonicalJson).join("\n")}\n`;
}

function fileMetadata(bytes: string): { bytes: number; sha256: string } {
  return { bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) };
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function anchorRow(
  input: {
    id?: string;
    anchorId?: string;
    changeId?: string;
    eventRecordId?: string;
    date?: string | null;
    datePrecision?: "day" | "month" | "season" | "year" | "unknown";
    studyEligible?: boolean;
    exclusionReasons?: string[];
    sourceId?: string;
    eventFamily?: string;
    lifecyclePhase?: string | null;
    temporalRole?: "planned_operational" | "realized_operational" | "status_as_of";
    routeRecordIds?: string[];
    gtfsRouteIds?: string[];
    treatmentRecordIds?: string[];
    treatmentFamilies?: string[];
    routeScopeResolution?:
      | "ambiguous"
      | "direct"
      | "missing"
      | "reviewed_inherited"
      | "unreviewed_inherited";
    treatmentScopeResolution?:
      | "ambiguous"
      | "direct"
      | "missing"
      | "reviewed_inherited"
      | "unreviewed_inherited";
    conflictStates?: Array<
      "date_conflict" | "route_identity_conflict" | "status_conflict" | "temporal_order_conflict"
    >;
  } = {},
) {
  const anchorId =
    input.anchorId ??
    (input.id === undefined ? "operational:event_launch" : `operational:${input.id}`);
  const eventRecordId = input.eventRecordId ?? anchorId.replace("operational:", "");
  const date = input.date === undefined ? "2024-06-15" : input.date;
  const datePrecision = input.datePrecision ?? (date === null ? "unknown" : "day");
  const routeRecordIds = input.routeRecordIds ?? ["route:b1"];
  const gtfsRouteIds = input.gtfsRouteIds ?? ["B1"];
  const treatmentRecordIds = input.treatmentRecordIds ?? ["treatment:bus-lane"];
  const treatmentFamilies = input.treatmentFamilies ?? ["bus_lane"];
  const routeScopeResolution = input.routeScopeResolution ?? "direct";
  const treatmentScopeResolution = input.treatmentScopeResolution ?? "direct";
  const scopeResolution =
    routeScopeResolution === "missing" || treatmentScopeResolution === "missing"
      ? "missing"
      : routeScopeResolution === "ambiguous" || treatmentScopeResolution === "ambiguous"
        ? "ambiguous"
        : routeScopeResolution === "unreviewed_inherited" ||
            treatmentScopeResolution === "unreviewed_inherited"
          ? "unreviewed_inherited"
          : routeScopeResolution === "reviewed_inherited" ||
              treatmentScopeResolution === "reviewed_inherited"
            ? "reviewed_inherited"
            : "direct";
  return {
    schema_version: 1,
    anchor_id: anchorId,
    operational_change_id:
      input.changeId ?? (input.id === undefined ? "change:bus-lane-launch" : `change:${input.id}`),
    event_record_id: eventRecordId,
    timeline_relation_record_ids: [`timeline:${eventRecordId}`],
    project_record_ids: ["project:test"],
    subject_record_ids: ["treatment:bus-lane"],
    subject_record_kinds: ["treatment_component"],
    route_record_ids: routeRecordIds,
    unmatched_route_record_ids: [],
    gtfs_route_ids: gtfsRouteIds,
    treatment_record_ids: treatmentRecordIds,
    treatment_families: treatmentFamilies,
    route_scope_direct: routeScopeResolution === "direct",
    treatment_scope_direct: treatmentScopeResolution === "direct",
    temporal_role: input.temporalRole ?? "realized_operational",
    raw_date: date,
    normalized_date: date,
    date_precision: datePrecision,
    candidate_operational_date_raw: date,
    candidate_operational_date_normalized: date,
    candidate_operational_date_precision: datePrecision,
    candidate_operational_date_source_field: date === null ? null : "event_date",
    candidate_operational_date_candidates:
      date === null
        ? []
        : [
            {
              source_field: "event_date",
              raw: date,
              normalized: date,
              precision: datePrecision,
              origin: "payload_field",
            },
          ],
    candidate_operational_dates_normalized: date === null ? [] : [date],
    status_as_of_dates: ["2024-07"],
    event_family: input.eventFamily ?? "launch",
    lifecycle_phase: input.lifecyclePhase === undefined ? "launched" : input.lifecyclePhase,
    assertion_statuses: ["delivered"],
    truth_status: "source_stated",
    truth_statuses: ["source_stated"],
    review_state: "unreviewed",
    source_id: input.sourceId ?? "source:test",
    source_ids: [input.sourceId ?? "source:test"],
    source_authority: "official_public_agency",
    source_publishers: ["NYC DOT"],
    route_scope_resolution: routeScopeResolution,
    treatment_scope_resolution: treatmentScopeResolution,
    scope_resolution: scopeResolution,
    conflict_states: input.conflictStates ?? [],
    evidence_coverage: {
      event: true,
      timeline: true,
      route_scope: true,
      treatment_scope: true,
    },
    evidence_refs: [
      {
        record_id: eventRecordId,
        source_id: input.sourceId ?? "source:test",
        evidence_id: "evidence:event",
        block_id: "block:event",
        page_number: 1,
        text_sha256: "a".repeat(64),
        role: "event",
      },
      {
        record_id: `timeline:${eventRecordId}`,
        source_id: input.sourceId ?? "source:test",
        evidence_id: "evidence:timeline",
        block_id: "block:timeline",
        page_number: 1,
        text_sha256: "b".repeat(64),
        role: "timeline_relation",
      },
      {
        record_id: "relation:route-treatment",
        source_id: input.sourceId ?? "source:test",
        evidence_id: "evidence:route",
        block_id: "block:route",
        page_number: 1,
        text_sha256: "c".repeat(64),
        role: "route_scope",
      },
      {
        record_id: "relation:route-treatment",
        source_id: input.sourceId ?? "source:test",
        evidence_id: "evidence:treatment",
        block_id: "block:treatment",
        page_number: 1,
        text_sha256: "d".repeat(64),
        role: "treatment_scope",
      },
    ],
    exclusion_reasons: input.exclusionReasons ?? [],
    study_eligible: input.studyEligible ?? true,
  };
}

type FixtureRow = ReturnType<typeof anchorRow>;

function reviewDecision(row: FixtureRow) {
  const sourceId = row.source_id;
  const routeRecordId = row.route_record_ids[0];
  const treatmentRecordId = row.treatment_record_ids[0];
  const treatmentFamily = row.treatment_families[0];
  const timelineRelationRecordId = row.timeline_relation_record_ids[0];
  if (
    routeRecordId === undefined ||
    treatmentRecordId === undefined ||
    treatmentFamily === undefined ||
    timelineRelationRecordId === undefined ||
    row.candidate_operational_date_normalized === null
  ) {
    throw new Error("reviewDecision fixture requires one route, treatment, timeline, and date");
  }
  const binding = (role: string, recordId: string) => ({
    role,
    record_id: recordId,
    source_id: sourceId,
    evidence_id: `evidence:${role}`,
  });
  return {
    schema_version: 1,
    decision_id: `decision:${row.anchor_id}`,
    review_state: "accepted",
    accepted_at: "2026-07-11T00:00:00.000Z",
    reviewer: "fixture-reviewer",
    rationale: "Fixture exact-evidence review decision.",
    source_id: sourceId,
    event_record_id: row.event_record_id,
    timeline_relation_record_id: timelineRelationRecordId,
    route_record_id: routeRecordId,
    route_scope_relation_record_id: "relation:route-scope",
    treatment_record_id: treatmentRecordId,
    treatment_scope_relation_record_id: "relation:treatment-scope",
    treatment_family: treatmentFamily,
    expected_operational_date: row.candidate_operational_date_normalized,
    expected_date_precision: row.candidate_operational_date_precision,
    evidence_bindings: [
      binding("event_date", row.event_record_id),
      binding("route_identity", routeRecordId),
      binding("route_scope", "relation:route-scope"),
      binding("route_treatment_event_bridge", "relation:bridge"),
      binding("timeline_relation", timelineRelationRecordId),
      binding("treatment_definition", treatmentRecordId),
      binding("treatment_scope", "relation:treatment-scope"),
    ],
  };
}

function producerSummary(rows: readonly FixtureRow[]) {
  const dated = rows.filter((row) => row.candidate_operational_date_normalized !== null);
  const realized = dated.filter((row) => row.temporal_role === "realized_operational");
  const precise = realized.filter(
    (row) =>
      row.candidate_operational_date_precision === "day" ||
      row.candidate_operational_date_precision === "month",
  );
  const routeResolved = precise.filter(
    (row) =>
      row.gtfs_route_ids.length === 1 &&
      (row.route_scope_resolution === "direct" ||
        row.route_scope_resolution === "reviewed_inherited"),
  );
  const treatmentResolved = routeResolved.filter(
    (row) =>
      row.treatment_record_ids.length === 1 &&
      (row.treatment_scope_resolution === "direct" ||
        row.treatment_scope_resolution === "reviewed_inherited"),
  );
  const evidenceComplete = treatmentResolved.filter((row) =>
    Object.values(row.evidence_coverage).every(Boolean),
  );
  const conflictFree = evidenceComplete.filter((row) => row.conflict_states.length === 0);
  return {
    schema_version: 1,
    row_count: rows.length,
    study_eligible_count: rows.filter((row) => row.study_eligible).length,
    counts_by_temporal_role: countBy(rows.map((row) => row.temporal_role)),
    counts_by_scope_resolution: countBy(rows.map((row) => row.scope_resolution)),
    counts_by_exclusion_reason: countBy(rows.flatMap((row) => row.exclusion_reasons)),
    funnel: {
      canonical_events: rows.length,
      timeline_linked_operational_events: rows.length,
      candidate_operational_date_present: dated.length,
      realized_operational: realized.length,
      realized_day_or_month: precise.length,
      resolved_route_scope: routeResolved.length,
      resolved_treatment_scope: treatmentResolved.length,
      evidence_complete: evidenceComplete.length,
      conflict_free: conflictFree.length,
      study_eligible: rows.filter((row) => row.study_eligible).length,
    },
  };
}

function expandedProducerSummary(
  rows: readonly FixtureRow[],
  input: {
    canonicalEventCount?: number;
    operationalFamilyEventCount?: number;
  } = {},
) {
  const broadRows = rows.filter((row) => row.anchor_id.startsWith("operational:"));
  const reviewedRows = rows.filter((row) => row.anchor_id.startsWith("operational-reviewed:"));
  const dated = broadRows.filter((row) => row.candidate_operational_date_normalized !== null);
  const realized = dated.filter((row) => row.temporal_role === "realized_operational");
  const precise = realized.filter(
    (row) =>
      row.candidate_operational_date_precision === "day" ||
      row.candidate_operational_date_precision === "month",
  );
  const routeResolved = precise.filter(
    (row) =>
      row.gtfs_route_ids.length === 1 &&
      (row.route_scope_resolution === "direct" ||
        row.route_scope_resolution === "reviewed_inherited"),
  );
  const treatmentResolved = routeResolved.filter(
    (row) =>
      row.treatment_record_ids.length === 1 &&
      (row.treatment_scope_resolution === "direct" ||
        row.treatment_scope_resolution === "reviewed_inherited"),
  );
  const evidenceComplete = treatmentResolved.filter((row) =>
    Object.values(row.evidence_coverage).every(Boolean),
  );
  const conflictFree = evidenceComplete.filter((row) => row.conflict_states.length === 0);
  const distinctOperationalEventCount = new Set(broadRows.map((row) => row.event_record_id)).size;
  const operationalFamilyEventCount =
    input.operationalFamilyEventCount ?? distinctOperationalEventCount;
  const broadFunnel = {
    operational_family_events_total: operationalFamilyEventCount,
    timeline_linked_distinct_events: distinctOperationalEventCount,
    unlinked_operational_events: operationalFamilyEventCount - distinctOperationalEventCount,
    candidate_operational_date_present: dated.length,
    realized_operational: realized.length,
    realized_day_or_month: precise.length,
    resolved_route_scope: routeResolved.length,
    resolved_treatment_scope: treatmentResolved.length,
    evidence_complete: evidenceComplete.length,
    conflict_free: conflictFree.length,
    study_eligible: broadRows.filter((row) => row.study_eligible).length,
  };
  return {
    schema_version: 1,
    row_count: rows.length,
    broad_row_count: broadRows.length,
    reviewed_row_count: reviewedRows.length,
    distinct_operational_event_count: distinctOperationalEventCount,
    study_eligible_count: rows.filter((row) => row.study_eligible).length,
    study_eligible_reviewed_count: reviewedRows.filter((row) => row.study_eligible).length,
    counts_by_temporal_role: countBy(rows.map((row) => row.temporal_role)),
    counts_by_scope_resolution: countBy(rows.map((row) => row.scope_resolution)),
    counts_by_exclusion_reason: countBy(rows.flatMap((row) => row.exclusion_reasons)),
    entry_gate: {
      relations_examined: broadRows.length,
      non_event_timeline_objects: 0,
      non_operational_event_objects: 0,
    },
    broad_funnel: broadFunnel,
    funnel: {
      canonical_events: input.canonicalEventCount ?? rows.length,
      ...broadFunnel,
      timeline_linked_operational_events: broadRows.length,
    },
  };
}

type ReleaseFixture = {
  root: string;
  releaseId: string;
  releaseDirectory: string;
  anchorPath: string;
  summaryPath: string;
  reviewDecisionPath: string;
  manifestPath: string;
  manifestSha256: string;
};

async function writeReleaseFixture(input: {
  rows: readonly FixtureRow[];
  anchorText?: string;
  anchorPointer?: string;
  manifestVersion?: number;
  operationalAnchorContractVersion?: number;
  operationalAnchorReviewContractVersion?: number;
  manifestEventCount?: number;
  summary?: unknown;
  reviewDecisions?: unknown[];
}): Promise<ReleaseFixture> {
  const root = await mkdtemp(join(tmpdir(), "bp-wiki-operational-anchor-"));
  const releaseId = "fixture-release";
  const releaseDirectory = join(root, "data", "exports", "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const anchorPointer = input.anchorPointer ?? "operational_anchors.jsonl";
  const summaryPointer = "operational_anchors_summary.json";
  const reviewDecisionPointer = "operational_anchor_review_decisions.json";
  const anchorText =
    input.anchorText ?? `${input.rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const summaryText = `${JSON.stringify(input.summary ?? producerSummary(input.rows))}\n`;
  const reviewDecisionText = `${JSON.stringify({
    snapshot_version: 1,
    decision_schema_version: 1,
    decision_count: input.reviewDecisions?.length ?? 0,
    decisions: input.reviewDecisions ?? [],
  })}\n`;
  const anchorPath = join(releaseDirectory, anchorPointer);
  const summaryPath = join(releaseDirectory, summaryPointer);
  const reviewDecisionPath = join(releaseDirectory, reviewDecisionPointer);
  if (!anchorPointer.startsWith("..")) {
    await mkdir(dirname(anchorPath), { recursive: true });
    await writeFile(anchorPath, anchorText, "utf8");
  }
  await writeFile(summaryPath, summaryText, "utf8");
  await writeFile(reviewDecisionPath, reviewDecisionText, "utf8");

  const manifest = {
    manifest_version: input.manifestVersion ?? 2,
    release_id: releaseId,
    generator_commit: "fixture-generator-commit",
    contract_versions: {
      operational_anchors: input.operationalAnchorContractVersion ?? 1,
      operational_anchor_review_decisions: input.operationalAnchorReviewContractVersion ?? 1,
    },
    record_counts: { event: input.manifestEventCount ?? input.rows.length },
    files: {
      [anchorPointer]: {
        bytes: Buffer.byteLength(anchorText),
        sha256: sha256(anchorText),
      },
      [summaryPointer]: {
        bytes: Buffer.byteLength(summaryText),
        sha256: sha256(summaryText),
      },
      [reviewDecisionPointer]: {
        bytes: Buffer.byteLength(reviewDecisionText),
        sha256: sha256(reviewDecisionText),
      },
    },
    pointers: {
      operational_anchors: anchorPointer,
      operational_anchor_summary: summaryPointer,
      operational_anchor_review_decisions: reviewDecisionPointer,
      route_anchors: null,
      taxonomy: null,
      quality_report: null,
    },
  };
  const manifestText = `${JSON.stringify(manifest)}\n`;
  const manifestPath = join(releaseDirectory, "manifest.json");
  await writeFile(manifestPath, manifestText, "utf8");
  return {
    root,
    releaseId,
    releaseDirectory,
    anchorPath,
    summaryPath,
    reviewDecisionPath,
    manifestPath,
    manifestSha256: sha256(manifestText),
  };
}

async function withFixture<T>(
  input: Parameters<typeof writeReleaseFixture>[0],
  run: (fixture: ReleaseFixture) => Promise<T>,
): Promise<T> {
  const fixture = await writeReleaseFixture(input);
  try {
    return await run(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

type ManifestV5Fixture = ReleaseFixture & {
  manifest: {
    files: Record<string, { bytes: number; sha256: string }>;
    [key: string]: unknown;
  };
};

const v5SnapshotId = "mta-bus-2026-07-18-route-provenance-v1";
const v5RetiredDecisionId = "anchor-review:q06-retired";
const v5RetirementId = "route-retirement:q06";
const v5RouteRecordId = "route_q6-ace";
const v5RouteBindingDecisionId = "route-binding-v1:route_q6-ace";
const v5ActiveRouteRecordId = "route:b1";

function v5RouteIdentitySnapshot(input: { reviewedDecisionSha256?: string } = {}) {
  const artifact = (path: string, text: string, rows: number) => ({
    path,
    sha256: sha256(text),
    bytes: Buffer.byteLength(text),
    rows,
  });
  const catalogRoutesText = `${canonicalJson({ route_id: "B1" })}\n`;
  const catalogGtfsDisagreementsText = `${canonicalJson({
    disposition: "gtfs_only",
    route_id: "Q06",
  })}\n`;
  const currentCatalog = {
    contract_version: 1 as const,
    dataset_id: "h2wf-afav" as const,
    artifact_sha256: "1".repeat(64),
    effective_as_of_date: "2026-07-18",
    catalog_routes: artifact("catalog_routes.jsonl", catalogRoutesText, 1),
    catalog_gtfs_disagreements: artifact(
      "catalog_gtfs_disagreements.jsonl",
      catalogGtfsDisagreementsText,
      1,
    ),
    catalog_identity_count: 1,
    catalog_only_count: 0,
    gtfs_only_count: 1,
  };
  const q06Identity: MtaWikiRouteIdentitySnapshot["service_identities"][number] = {
    dataset_id: "mta-bus-company",
    component_feed_ids: ["mta-bus-company"],
    source_route_id: "Q06",
    gtfs_route_id: "Q06",
    agency_id: "MTABC",
    raw_route_type: "3",
    route_family_id: "Q06",
    route_short_name: "Q6",
    route_long_name: "Jamaica - Sutphin Blvd",
    route_desc: null,
    declared_in_feed: true,
    catalog_in_effect: "no",
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
    scheduled_trip_template_date_count: 7,
    frequencies_present: false,
    designation_literals: ["route_type:Local", "trip_type:1"],
    normalized_service_modes: ["local"],
    display_label: "Q6",
    display_label_source: "gtfs",
    reliable_interval_start: "2026-06-28",
    reliable_interval_end: "2026-09-05",
    reliable_interval_derivation: "component_feed_bounds_intersection_v1",
    label_fallback: null,
    label_diff: null,
    snapshot_id: v5SnapshotId,
  };
  const b1Identity: MtaWikiRouteIdentitySnapshot["service_identities"][number] = {
    dataset_id: "mta-nyct-bus",
    component_feed_ids: ["mta-nyct-bus-brooklyn"],
    source_route_id: "B1",
    gtfs_route_id: "B1",
    agency_id: "MTA NYCT",
    raw_route_type: "3",
    route_family_id: "B1",
    route_short_name: "B1",
    route_long_name: "Bay Ridge - Manhattan Beach",
    route_desc: null,
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
    scheduled_trip_template_date_count: 7,
    frequencies_present: false,
    designation_literals: ["route_type:Local", "trip_type:1"],
    normalized_service_modes: ["local"],
    display_label: "B1",
    display_label_source: "current_bus_routes",
    reliable_interval_start: "2026-06-28",
    reliable_interval_end: "2026-09-05",
    reliable_interval_derivation: "component_feed_bounds_intersection_v1",
    label_fallback: null,
    label_diff: null,
    snapshot_id: v5SnapshotId,
  };
  const serviceIdentities = [q06Identity, b1Identity];
  const activeBinding: MtaWikiRouteIdentitySnapshot["record_bindings"][number] = {
    route_record_id: v5ActiveRouteRecordId,
    route_family_id: "B1",
    dataset_id: "mta-nyct-bus",
    component_feed_ids: ["mta-nyct-bus-brooklyn"],
    source_route_id: "B1",
    gtfs_route_id: "B1",
    service_variant: "local",
    identity_scope: "exact_service",
    service_class: "regular_mta_bus",
    record_temporal_scope: "current_description",
    projectable: true,
    presentation_primary: true,
    derivation: "deterministic_exact_route_id_v1",
    evidence_ids: ["source:b1#route"],
    canonical_record_fingerprint: "1".repeat(64),
    identity_basis: "deterministic_exact",
    expected_gtfs_identity_fingerprint: sha256(canonicalJson(b1Identity)),
    decision_kind: "current_primary",
    ineligibility_reasons: [],
  };
  const retiredBinding: MtaWikiRouteIdentitySnapshot["record_bindings"][number] = {
    route_record_id: v5RouteRecordId,
    route_family_id: "Q06",
    dataset_id: "mta-bus-company",
    component_feed_ids: ["mta-bus-company"],
    source_route_id: "Q06",
    gtfs_route_id: "Q06",
    service_variant: "local",
    identity_scope: "exact_service",
    service_class: "regular_mta_bus",
    record_temporal_scope: "current_description",
    projectable: false,
    presentation_primary: false,
    derivation: "reviewed_exact_route_mapping_v1",
    evidence_ids: ["source:q06#route"],
    canonical_record_fingerprint: "2".repeat(64),
    identity_basis: "reviewed_exact_mapping",
    expected_gtfs_identity_fingerprint: sha256(canonicalJson(q06Identity)),
    decision_kind: "current_ineligible",
    ineligibility_reasons: ["catalog_not_in_effect"],
    decision_id: v5RouteBindingDecisionId,
    accepted_by: "fixture-owner",
    accepted_at: "2026-07-18T20:00:00Z",
    rationale: "Q06 is exact but absent from the effective Current Bus Routes catalog.",
    reviewed_axes: ["identity_mapping"],
  };
  const recordBindings = [activeBinding, retiredBinding];
  const inventoryText = canonicalJsonl(serviceIdentities);
  const routeActivityText = canonicalJsonl([
    { route_id: "B1", scheduled_in_window: "yes" },
    { route_id: "Q06", scheduled_in_window: "yes" },
  ]);
  const requiredGtfsFiles = [
    "agency.txt",
    "calendar.txt",
    "calendar_dates.txt",
    "feed_info.txt",
    "routes.txt",
    "stop_times.txt",
    "stops.txt",
    "trips.txt",
  ];
  const component = (componentFeedId: string, datasetId: "mta-bus-company" | "mta-nyct-bus") => ({
    component_feed_id: componentFeedId,
    dataset_id: datasetId,
    official_url: `https://example.invalid/${componentFeedId}.zip`,
    archive_sha256: sha256(componentFeedId),
    feed_version: "2026-07-18",
    publisher: datasetId === "mta-bus-company" ? "MTA Bus Company" : "MTA New York City Transit",
    feed_start_date: "2026-06-28",
    feed_end_date: "2026-09-05",
    reliable_interval_start: "2026-06-28",
    reliable_interval_end: "2026-09-05",
    agency_timezone: "America/New_York" as const,
    frequencies_present: false,
    conditional_location_files_present: false,
    files: Object.fromEntries(
      requiredGtfsFiles.map((fileName) => [fileName, artifact(fileName, "", 0)]),
    ),
  });
  const gtfsSnapshot = {
    schema_version: 2 as const,
    contract_id: "gtfs-route-reference-snapshot-v2" as const,
    snapshot_id: v5SnapshotId,
    dataset_id: "mta-bus-static" as const,
    captured_at: "2026-07-18T18:05:27Z",
    as_of_date: "2026-07-18",
    service_window_start: "2026-07-12",
    service_window_end: "2026-07-18",
    merge_policy: "shared-nyct-route-namespace-v1" as const,
    id_remapping_policy: "component-feed-prefixed-foreign-keys-v1" as const,
    current_catalog: currentCatalog,
    components: [
      component("mta-bus-company", "mta-bus-company"),
      component("mta-nyct-bus-bronx", "mta-nyct-bus"),
      component("mta-nyct-bus-brooklyn", "mta-nyct-bus"),
      component("mta-nyct-bus-manhattan", "mta-nyct-bus"),
      component("mta-nyct-bus-queens", "mta-nyct-bus"),
      component("mta-nyct-bus-staten-island", "mta-nyct-bus"),
    ],
    outputs: {
      "agency.txt": artifact("agency.txt", "", 0),
      "catalog_gtfs_disagreements.jsonl": currentCatalog.catalog_gtfs_disagreements,
      "catalog_routes.jsonl": currentCatalog.catalog_routes,
      "feed_info.txt": artifact("feed_info.txt", "", 0),
      "receipt.json": artifact("receipt.json", "", 0),
      "route_activity.jsonl": artifact(
        "route_activity.jsonl",
        routeActivityText,
        serviceIdentities.length,
      ),
      "route_inventory.jsonl": artifact(
        "route_inventory.jsonl",
        inventoryText,
        serviceIdentities.length,
      ),
      "routes.txt": artifact("routes.txt", "", 0),
    },
    counts: {
      route_identity_count: serviceIdentities.length,
      route_activity_count: serviceIdentities.length,
      catalog_identity_count: 1,
      catalog_only_count: 0,
      gtfs_only_count: 1,
    },
  };
  const draft: MtaWikiRouteIdentitySnapshot = {
    schema_version: 1,
    contract_id: "route-identity-snapshot-v1",
    gtfs_snapshot_id: v5SnapshotId,
    gtfs_snapshot: gtfsSnapshot,
    gtfs_snapshot_sha256: sha256(`${canonicalJson(gtfsSnapshot)}\n`),
    reviewed_decision_sha256:
      input.reviewedDecisionSha256 ?? sha256(canonicalJsonl([retiredBinding])),
    current_catalog: currentCatalog,
    service_identity_count: serviceIdentities.length,
    service_identities_sha256: sha256(inventoryText),
    service_identities: serviceIdentities,
    record_binding_count: recordBindings.length,
    record_bindings_sha256: sha256(canonicalJsonl(recordBindings)),
    record_bindings: recordBindings,
    expected_route_anchors_count: 0,
    expected_route_anchors_sha256: sha256(""),
  };
  const anchors = reconstructedRouteAnchors(draft);
  return {
    ...draft,
    expected_route_anchors_count: anchors.length,
    expected_route_anchors_sha256: sha256(canonicalJsonl(anchors)),
  };
}

function v5ArchivedDecision() {
  const row = anchorRow({
    anchorId: `operational-reviewed:${v5RetiredDecisionId}`,
    eventRecordId: "event:q06-retired",
    routeRecordIds: [v5RouteRecordId],
    gtfsRouteIds: ["Q06"],
    routeScopeResolution: "reviewed_inherited",
    treatmentScopeResolution: "reviewed_inherited",
  });
  return { ...reviewDecision(row), decision_id: v5RetiredDecisionId };
}

type ManifestV5FixtureOptions = {
  activeDecisionAcceptedAt?: string;
  activeDecisionReviewer?: string;
  activeGtfsRouteIds?: string[];
  activeRouteRecordIds?: string[];
  reviewedDecisionSha256?: string;
  routeBindingSha256?: string;
};

async function writeV5ReleaseFixture(
  input: ManifestV5FixtureOptions = {},
): Promise<ManifestV5Fixture> {
  const root = await mkdtemp(join(tmpdir(), "bp-wiki-operational-anchor-v5-"));
  const releaseId = "fixture-release-v5";
  const releaseDirectory = join(root, "data", "exports", "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const rows = [
    anchorRow({
      gtfsRouteIds: input.activeGtfsRouteIds ?? ["B1"],
      routeRecordIds: input.activeRouteRecordIds ?? [v5ActiveRouteRecordId],
      routeScopeResolution: "reviewed_inherited",
      treatmentScopeResolution: "reviewed_inherited",
    }),
  ];
  const anchorPointer = "operational_anchors.jsonl";
  const summaryPointer = "operational_anchors_summary.json";
  const reviewDecisionPointer = "operational_anchor_review_decisions.json";
  const routeIdentityPointer = "route_identity_snapshot.json";
  const retirementSourcePointer = `review-retirements/source/${v5RetirementId}.json`;
  const retiredDecisionPointer = `review-retirements/operational-anchor/${v5RetiredDecisionId}.json`;
  const anchorText = canonicalJsonl(rows);
  const summaryText = `${canonicalJson(producerSummary(rows))}\n`;
  const routeIdentitySnapshot = v5RouteIdentitySnapshot(
    input.reviewedDecisionSha256 === undefined
      ? {}
      : { reviewedDecisionSha256: input.reviewedDecisionSha256 },
  );
  const routeIdentityText = `${canonicalJson(routeIdentitySnapshot)}\n`;
  const routeAnchorsText = canonicalJsonl(reconstructedRouteAnchors(routeIdentitySnapshot));
  const archivedDecision = v5ArchivedDecision();
  const archivedDecisionText = `${canonicalJson(archivedDecision)}\n`;
  const activeDecision = {
    ...reviewDecision(rows[0] as FixtureRow),
    accepted_at: input.activeDecisionAcceptedAt ?? "2026-07-18T20:15:00Z",
    reviewer: input.activeDecisionReviewer ?? "fixture-anchor-reviewer",
  };
  const sourceOriginalArtifact = {
    artifact_path: `data/operational-anchor-review/accepted/decisions/${v5RetiredDecisionId}.json`,
    ...fileMetadata(archivedDecisionText),
  };
  const retiredRouteBinding = routeIdentitySnapshot.record_bindings.find(
    (candidate) => candidate.route_record_id === v5RouteRecordId,
  );
  if (retiredRouteBinding === undefined) {
    throw new Error("v5 route fixture requires the retired Q06 route binding");
  }
  const binding = {
    route_record_id: v5RouteRecordId,
    route_binding_decision_id: v5RouteBindingDecisionId,
    route_binding_sha256:
      input.routeBindingSha256 ?? sha256(`${canonicalJson(retiredRouteBinding)}\n`),
    dataset_id: "mta-bus-company",
    source_route_id: "Q06",
    gtfs_route_id: "Q06",
    projectable: false,
    ineligibility_reasons: ["catalog_not_in_effect"],
  };
  const retirementSource = {
    schema_version: 1,
    contract_id: "operational-review-projection-retirement-v1",
    retirement_id: v5RetirementId,
    state: "accepted",
    accepted_by: "fixture-owner",
    accepted_at: "2026-07-18T20:30:00Z",
    rationale: "The exact Q06 binding is not in the effective Current Bus Routes catalog.",
    route_identity_snapshot_id: v5SnapshotId,
    route_identity_snapshot_sha256: sha256(routeIdentityText),
    binding,
    anchor_review_decisions: [
      {
        review_contract: "operational-anchor-review-v1",
        decision_id: v5RetiredDecisionId,
        projection_state: "retired",
        reason_code: "route_binding_nonprojectable",
        original_artifact: sourceOriginalArtifact,
      },
    ],
    occurrence_review_decisions: [],
  };
  const retirementSourceText = `${canonicalJson(retirementSource)}\n`;
  const reviewSnapshot = {
    snapshot_version: 2,
    decision_schema_version: 1,
    source_decision_count: 2,
    decision_count: 1,
    decisions: [activeDecision],
    retirement_schema_version: 1,
    retirement_count: 1,
    retirements: [
      {
        retirement_id: v5RetirementId,
        retirement_source: {
          release_path: retirementSourcePointer,
          ...fileMetadata(retirementSourceText),
        },
        accepted_by: retirementSource.accepted_by,
        accepted_at: retirementSource.accepted_at,
        rationale: retirementSource.rationale,
        route_identity_snapshot_id: retirementSource.route_identity_snapshot_id,
        route_identity_snapshot_sha256: retirementSource.route_identity_snapshot_sha256,
        binding,
        target: {
          review_contract: "operational-anchor-review-v1",
          decision_id: v5RetiredDecisionId,
          projection_state: "retired",
          reason_code: "route_binding_nonprojectable",
          original_artifact: {
            release_path: retiredDecisionPointer,
            ...fileMetadata(archivedDecisionText),
          },
        },
      },
    ],
  };
  const reviewDecisionText = `${canonicalJson(reviewSnapshot)}\n`;
  const files: Record<string, string> = {
    [anchorPointer]: anchorText,
    [summaryPointer]: summaryText,
    [reviewDecisionPointer]: reviewDecisionText,
    [routeIdentityPointer]: routeIdentityText,
    [retirementSourcePointer]: retirementSourceText,
    [retiredDecisionPointer]: archivedDecisionText,
    "operational_occurrence_review_decisions.json": "{}\n",
    "operational_occurrences_summary.json": "{}\n",
    "operational_occurrences.jsonl": "",
    "relationship_integrity_bundle.json": "{}\n",
    "route_anchors.jsonl": routeAnchorsText,
    "taxonomy.json": "{}\n",
  };
  for (const [pointer, text] of Object.entries(files)) {
    const path = join(releaseDirectory, pointer);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
  }
  const manifest = {
    manifest_version: 5,
    release_id: releaseId,
    generator_commit: "5".repeat(40),
    contract_versions: {
      operational_anchor_review_decisions: 2,
      operational_anchors: 1,
      operational_occurrence_review_decisions: 2,
      operational_occurrences: 2,
      relationship_integrity_bundle: 1,
      route_anchors: 1,
      route_identity_snapshot: 1,
    },
    record_counts: { event: rows.length },
    files: Object.fromEntries(
      Object.entries(files).map(([pointer, text]) => [pointer, fileMetadata(text)]),
    ),
    pointers: {
      operational_anchor_review_decisions: reviewDecisionPointer,
      operational_anchor_summary: summaryPointer,
      operational_anchors: anchorPointer,
      operational_occurrence_review_decisions: "operational_occurrence_review_decisions.json",
      operational_occurrence_summary: "operational_occurrences_summary.json",
      operational_occurrences: "operational_occurrences.jsonl",
      quality_report: null,
      relationship_integrity_bundle: "relationship_integrity_bundle.json",
      route_anchors: "route_anchors.jsonl",
      route_identity_snapshot: routeIdentityPointer,
      taxonomy: "taxonomy.json",
    },
  };
  const manifestText = `${canonicalJson(manifest)}\n`;
  const manifestPath = join(releaseDirectory, "manifest.json");
  await writeFile(manifestPath, manifestText, "utf8");
  return {
    root,
    releaseId,
    releaseDirectory,
    anchorPath: join(releaseDirectory, anchorPointer),
    summaryPath: join(releaseDirectory, summaryPointer),
    reviewDecisionPath: join(releaseDirectory, reviewDecisionPointer),
    manifestPath,
    manifestSha256: sha256(manifestText),
    manifest,
  };
}

async function rewriteV5Json(
  fixture: ManifestV5Fixture,
  pointer: string,
  mutate: (value: MutableV5ReviewSnapshot) => void,
): Promise<void> {
  const path = join(fixture.releaseDirectory, pointer);
  const value = JSON.parse(await readFile(path, "utf8")) as MutableV5ReviewSnapshot;
  mutate(value);
  const text = `${canonicalJson(value)}\n`;
  await writeFile(path, text, "utf8");
  fixture.manifest.files[pointer] = fileMetadata(text);
  const manifestText = `${canonicalJson(fixture.manifest)}\n`;
  await writeFile(fixture.manifestPath, manifestText, "utf8");
  fixture.manifestSha256 = sha256(manifestText);
}

async function writeV5QuarantineStatus(fixture: ManifestV5Fixture): Promise<void> {
  const recordPointer = `data/exports/release-status/${fixture.releaseId}.json`;
  const routeIdentityMetadata = fixture.manifest.files["route_identity_snapshot.json"];
  if (routeIdentityMetadata === undefined) {
    throw new Error("v5 quarantine fixture requires route identity metadata");
  }
  const record = {
    schema_version: 2,
    release_id: fixture.releaseId,
    release_path: `data/exports/releases/${fixture.releaseId}`,
    status: "quarantined",
    discovered_at: "2026-07-18",
    reason_code: "exact_route_identity_collapse",
    reason: "The candidate collapsed an exact route service into its route family.",
    manifest_sha256: fixture.manifestSha256,
    failing_artifact: {
      path: "route_identity_snapshot.json",
      bytes: routeIdentityMetadata.bytes,
      sha256: routeIdentityMetadata.sha256,
      declared_contract_version: 1,
      detected_by_contract: "route-identity-snapshot-v1",
      detected_by_contract_version: 1,
      verifier_error: "B44+ must remain distinct from B44.",
    },
    affected_identities: [
      {
        identity_type: "route",
        gtfs_route_id: "B44+",
        route_record_id: "route:b44-plus",
        route_family_id: "B44",
      },
    ],
    replacement_release_id: null,
  };
  const index = {
    schema_version: 2,
    records: [
      {
        release_id: fixture.releaseId,
        path: recordPointer,
        status: "quarantined",
        record_schema_version: 2,
      },
    ],
  };
  const recordPath = join(fixture.root, recordPointer);
  await mkdir(dirname(recordPath), { recursive: true });
  await writeFile(recordPath, `${canonicalJson(record)}\n`, "utf8");
  await writeFile(
    join(fixture.root, "data", "exports", "release-status", "index.json"),
    `${canonicalJson(index)}\n`,
    "utf8",
  );
}

type MutableV5ReviewSnapshot = Record<string, unknown> & {
  source_decision_count?: unknown;
  retirements?: unknown;
};
type MutableV5Retirement = Record<string, unknown> & {
  binding?: unknown;
  target?: unknown;
};
type MutableV5Binding = Record<string, unknown> & {
  source_route_id?: unknown;
  gtfs_route_id?: unknown;
};
type MutableV5RetirementTarget = Record<string, unknown> & {
  original_artifact?: unknown;
};
type MutableV5ReleaseArtifact = Record<string, unknown> & {
  release_path?: unknown;
};

async function withV5Fixture<T>(
  run: (fixture: ManifestV5Fixture) => Promise<T>,
  input: ManifestV5FixtureOptions = {},
): Promise<T> {
  const fixture = await writeV5ReleaseFixture(input);
  try {
    return await run(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

describe("manifest-pinned MTA Wiki operational-anchor import", () => {
  test("replays manifest-v5 review-v2 anchors with exact retirement closure", async () => {
    await withV5Fixture(async (fixture) => {
      const outputA = join(fixture.root, "output-v5-a.json");
      const outputB = join(fixture.root, "output-v5-b.json");
      const input = {
        mtaWikiRoot: fixture.root,
        wikiRelease: fixture.releaseId,
        wikiManifestSha256: fixture.manifestSha256,
      };
      const first = await runMtaWikiOperationalAnchorImport({ ...input, output: outputA });
      const second = await runMtaWikiOperationalAnchorImport({ ...input, output: outputB });

      expect(first).toEqual(second);
      expect(await readFile(outputA, "utf8")).toBe(await readFile(outputB, "utf8"));
      expect(first).toMatchObject({
        artifactKind: "bp.studio.mta_wiki_operational_date_assertions.v3",
        schemaVersion: 3,
        sourceRelease: {
          manifestVersion: 5,
          operationalAnchorReviewDecisionContractVersion: 2,
          routeIdentitySnapshotContractVersion: 1,
          routeIdentitySnapshotId: v5SnapshotId,
          sourceReviewDecisionCount: 2,
          reviewDecisionCount: 1,
          retirementCount: 1,
          retiredDecisionIds: [v5RetiredDecisionId],
        },
        summary: { sourceRowCount: 1, assertionCount: 1 },
      });
      expect(first.assertions.map((assertion) => assertion.wikiAnchorId)).toEqual([
        "operational:event_launch",
      ]);
      if (first.schemaVersion !== 3) throw new Error("expected v3 anchor import artifact");
      expect(first.sourceRelease.retirementSources).toHaveLength(1);
      expect(first.sourceRelease.retiredReviewDecisions).toHaveLength(1);
    });
  });

  test("requires every active manifest-v5 route to resolve through its exact projectable binding", async () => {
    await withV5Fixture(
      async (fixture) => {
        await expect(
          runMtaWikiOperationalAnchorImport({
            mtaWikiRoot: fixture.root,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            output: join(fixture.root, "case-collapsed-route.json"),
          }),
        ).rejects.toMatchObject({
          code: "semantic_mismatch",
          operation: "validateActiveAnchorRouteProjections",
        });
      },
      { activeGtfsRouteIds: ["b1"] },
    );

    await withV5Fixture(
      async (fixture) => {
        await expect(
          runMtaWikiOperationalAnchorImport({
            mtaWikiRoot: fixture.root,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            output: join(fixture.root, "nonprojectable-route.json"),
          }),
        ).rejects.toMatchObject({
          code: "semantic_mismatch",
          operation: "validateActiveAnchorRouteProjections",
        });
      },
      { activeGtfsRouteIds: ["Q06"], activeRouteRecordIds: [v5RouteRecordId] },
    );
  });

  test("treats binding and reviewed-decision SHA values as integrity receipts", async () => {
    await withV5Fixture(
      async (fixture) => {
        await expect(
          runMtaWikiOperationalAnchorImport({
            mtaWikiRoot: fixture.root,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            output: join(fixture.root, "stale-binding-receipt.json"),
          }),
        ).resolves.toBeDefined();
      },
      { routeBindingSha256: "0".repeat(64) },
    );

    await withV5Fixture(
      async (fixture) => {
        await expect(
          runMtaWikiOperationalAnchorImport({
            mtaWikiRoot: fixture.root,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            output: join(fixture.root, "stale-reviewed-decision-receipt.json"),
          }),
        ).resolves.toBeDefined();
      },
      { reviewedDecisionSha256: "0".repeat(64) },
    );
  });

  test("requires attributed reviewers and exact UTC acceptance instants", async () => {
    await withV5Fixture(
      async (fixture) => {
        await expect(
          runMtaWikiOperationalAnchorImport({
            mtaWikiRoot: fixture.root,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            output: join(fixture.root, "blank-reviewer.json"),
          }),
        ).rejects.toMatchObject({
          code: "schema_mismatch",
          operation: "decodeOperationalAnchorReviewSnapshotV2",
        });
      },
      { activeDecisionReviewer: "" },
    );

    await withV5Fixture(
      async (fixture) => {
        await expect(
          runMtaWikiOperationalAnchorImport({
            mtaWikiRoot: fixture.root,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            output: join(fixture.root, "non-utc-acceptance.json"),
          }),
        ).rejects.toMatchObject({
          code: "semantic_mismatch",
          operation: "validateOperationalAnchorReviewSnapshot",
        });
      },
      { activeDecisionAcceptedAt: "2026-07-18T16:15:00-04:00" },
    );
  });

  test("rejects a manifest-pinned release named by the generic quarantine index", async () => {
    await withV5Fixture(async (fixture) => {
      await writeV5QuarantineStatus(fixture);
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "quarantined-release.json"),
        }),
      ).rejects.toMatchObject({
        code: "contract_incompatible",
        operation: "verifyReleaseStatus",
      });
    });
  });

  test("rejects review-v2 denominator drift and active-retired identity reuse", async () => {
    await withV5Fixture(async (fixture) => {
      await rewriteV5Json(fixture, "operational_anchor_review_decisions.json", (snapshot) => {
        snapshot.source_decision_count = 3;
      });
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "denominator-drift.json"),
        }),
      ).rejects.toMatchObject({ code: "semantic_mismatch" });
    });

    await withV5Fixture(async (fixture) => {
      const rows = [
        anchorRow({
          anchorId: `operational-reviewed:${v5RetiredDecisionId}`,
          eventRecordId: "event:retired-reintroduced",
        }),
      ];
      const anchorText = canonicalJsonl(rows);
      const summaryText = `${canonicalJson(producerSummary(rows))}\n`;
      await writeFile(fixture.anchorPath, anchorText, "utf8");
      await writeFile(fixture.summaryPath, summaryText, "utf8");
      fixture.manifest.files["operational_anchors.jsonl"] = fileMetadata(anchorText);
      fixture.manifest.files["operational_anchors_summary.json"] = fileMetadata(summaryText);
      const manifestText = `${canonicalJson(fixture.manifest)}\n`;
      await writeFile(fixture.manifestPath, manifestText, "utf8");
      fixture.manifestSha256 = sha256(manifestText);
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "retired-reintroduced.json"),
        }),
      ).rejects.toMatchObject({ code: "semantic_mismatch" });
    });
  });

  test("rejects retirement projection, route binding, and archived-byte drift", async () => {
    await withV5Fixture(async (fixture) => {
      await rewriteV5Json(fixture, "operational_anchor_review_decisions.json", (snapshot) => {
        const retirements = snapshot.retirements;
        if (!Array.isArray(retirements) || retirements.length !== 1) {
          throw new Error("expected one fixture retirement");
        }
        const retirement = retirements[0] as MutableV5Retirement;
        const binding = retirement.binding as MutableV5Binding;
        binding.source_route_id = "Q07";
        binding.gtfs_route_id = "Q07";
      });
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "projection-drift.json"),
        }),
      ).rejects.toMatchObject({ code: "semantic_mismatch" });
    });

    await withV5Fixture(async (fixture) => {
      const archivedPath = join(
        fixture.releaseDirectory,
        `review-retirements/operational-anchor/${v5RetiredDecisionId}.json`,
      );
      await writeFile(archivedPath, "{}\n", "utf8");
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "archive-tamper.json"),
        }),
      ).rejects.toMatchObject({ code: "byte_count_mismatch" });
    });
  });

  test("rejects unsafe or orphaned anchor retirement archive paths", async () => {
    await withV5Fixture(async (fixture) => {
      await rewriteV5Json(fixture, "operational_anchor_review_decisions.json", (snapshot) => {
        const retirements = snapshot.retirements;
        if (!Array.isArray(retirements) || retirements.length !== 1) {
          throw new Error("expected one fixture retirement");
        }
        const retirement = retirements[0] as MutableV5Retirement;
        const target = retirement.target as MutableV5RetirementTarget;
        const artifact = target.original_artifact as MutableV5ReleaseArtifact;
        artifact.release_path = "../retired-anchor.json";
      });
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "unsafe-retirement.json"),
        }),
      ).rejects.toMatchObject({ code: "semantic_mismatch" });
    });

    await withV5Fixture(async (fixture) => {
      const orphanPath = "review-retirements/operational-anchor/orphan.json";
      const orphanText = "{}\n";
      const absoluteOrphanPath = join(fixture.releaseDirectory, orphanPath);
      await mkdir(dirname(absoluteOrphanPath), { recursive: true });
      await writeFile(absoluteOrphanPath, orphanText, "utf8");
      fixture.manifest.files[orphanPath] = fileMetadata(orphanText);
      const manifestText = `${canonicalJson(fixture.manifest)}\n`;
      await writeFile(fixture.manifestPath, manifestText, "utf8");
      fixture.manifestSha256 = sha256(manifestText);
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "orphan-retirement.json"),
        }),
      ).rejects.toMatchObject({ code: "semantic_mismatch" });
    });
  });

  test("maps a pinned eligible row and writes deterministic no-clock output", async () => {
    await withFixture({ rows: [anchorRow()] }, async (fixture) => {
      const outputA = join(fixture.root, "output-a.json");
      const outputB = join(fixture.root, "output-b.json");
      const input = {
        mtaWikiRoot: fixture.root,
        wikiRelease: fixture.releaseId,
        wikiManifestSha256: fixture.manifestSha256,
      };
      const first = await runMtaWikiOperationalAnchorImport({ ...input, output: outputA });
      const second = await runMtaWikiOperationalAnchorImport({ ...input, output: outputB });

      expect(first).toEqual(second);
      expect(await readFile(outputA, "utf8")).toBe(await readFile(outputB, "utf8"));
      expect(await readFile(outputA, "utf8")).not.toContain("generatedAt");
      expect(first.sourceRelease).toMatchObject({
        manifestVersion: 2,
        releaseId: fixture.releaseId,
        manifestSha256: fixture.manifestSha256,
        operationalAnchorContractVersion: 1,
        operationalAnchorReviewDecisionContractVersion: 1,
        reviewDecisionCount: 0,
      });
      expect(first.summary).toMatchObject({
        sourceRowCount: 1,
        assertionCount: 1,
        eligibleAssertionCount: 1,
        rejectedAssertionCount: 0,
      });
      expect(first.assertions[0]).toMatchObject({
        producer: "mta-wiki",
        operationalChangeId: "change:bus-lane-launch",
        dateRole: "realized_operational",
        routeIds: ["B1"],
        treatmentFamilies: ["bus_lane"],
        causalAnchorEligible: true,
        wikiReleaseId: fixture.releaseId,
        wikiManifestSha256: fixture.manifestSha256,
      });
    });
  });

  test("verifies the manifest-addressed accepted-review snapshot against reviewed rows", async () => {
    const row = anchorRow({
      routeScopeResolution: "reviewed_inherited",
      treatmentScopeResolution: "reviewed_inherited",
    });
    await withFixture({ rows: [row], reviewDecisions: [reviewDecision(row)] }, async (fixture) => {
      const artifact = await runMtaWikiOperationalAnchorImport({
        mtaWikiRoot: fixture.root,
        wikiRelease: fixture.releaseId,
        wikiManifestSha256: fixture.manifestSha256,
        output: join(fixture.root, "output.json"),
      });

      expect(artifact.sourceRelease.reviewDecisionCount).toBe(1);
      expect(artifact.sourceRelease.reviewDecisions).toMatchObject({
        pointer: "operational_anchor_review_decisions.json",
        sha256: sha256(await readFile(fixture.reviewDecisionPath)),
      });
      expect(artifact.assertions[0]?.causalAnchorEligible).toBe(true);
    });
  });

  test("rejects a reviewed-inherited row not bound by the pinned accepted-review snapshot", async () => {
    const row = anchorRow({
      routeScopeResolution: "reviewed_inherited",
      treatmentScopeResolution: "reviewed_inherited",
    });
    await withFixture({ rows: [row] }, async (fixture) => {
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "output.json"),
        }),
      ).rejects.toMatchObject({
        _tag: "MtaWikiOperationalAnchorImportError",
        code: "semantic_mismatch",
      });
    });
  });

  test("is byte-identical for the same pinned release in different checkout roots", async () => {
    const rows = [anchorRow()];
    await withFixture({ rows }, async (firstFixture) => {
      await withFixture({ rows }, async (secondFixture) => {
        const firstOutput = join(firstFixture.root, "output.json");
        const secondOutput = join(secondFixture.root, "output.json");
        await runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: firstFixture.root,
          wikiRelease: firstFixture.releaseId,
          wikiManifestSha256: firstFixture.manifestSha256,
          output: firstOutput,
        });
        await runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: secondFixture.root,
          wikiRelease: secondFixture.releaseId,
          wikiManifestSha256: secondFixture.manifestSha256,
          output: secondOutput,
        });
        expect(await readFile(firstOutput, "utf8")).toBe(await readFile(secondOutput, "utf8"));
      });
    });
  });

  test("never upgrades a producer-ineligible assertion and retains its rejection", async () => {
    await withFixture(
      {
        rows: [
          anchorRow({
            studyEligible: false,
            exclusionReasons: ["missing_treatment_family"],
          }),
        ],
      },
      async (fixture) => {
        const artifact = await runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "output.json"),
        });

        expect(artifact.assertions[0]?.producerStudyEligible).toBe(false);
        expect(artifact.assertions[0]?.causalAnchorEligible).toBe(false);
        expect(artifact.rejections).toHaveLength(1);
        expect(artifact.rejections[0]?.reasonCodes).toContain("producer_ineligible");
        expect(artifact.rejections[0]?.reasonCodes).toContain("producer:missing_treatment_family");
      },
    );
  });

  test("independently rejects a producer-eligible row with an ambiguous lifecycle phase", async () => {
    await withFixture(
      {
        rows: [anchorRow({ lifecyclePhase: "other" })],
      },
      async (fixture) => {
        const artifact = await runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "output.json"),
        });

        expect(artifact.assertions[0]?.producerStudyEligible).toBe(true);
        expect(artifact.assertions[0]?.causalAnchorEligible).toBe(false);
        expect(artifact.rejections[0]?.reasonCodes).toContain("ambiguous_lifecycle_phase");
      },
    );
  });

  test("admits only direct realized day/month anchors through import and candidate construction", async () => {
    const rows = [
      anchorRow({ id: "eligible-day", date: "2024-05-20", datePrecision: "day" }),
      anchorRow({
        id: "eligible-month",
        date: "2024-06",
        datePrecision: "month",
        eventFamily: "implementation",
        lifecyclePhase: "installed",
      }),
      anchorRow({ id: "publication", eventFamily: "publication" }),
      anchorRow({ id: "status-as-of", temporalRole: "status_as_of" }),
      anchorRow({ id: "planned-day", temporalRole: "planned_operational" }),
      anchorRow({ id: "year", date: "2024", datePrecision: "year" }),
      anchorRow({ id: "season", date: "2024-summer", datePrecision: "season" }),
      anchorRow({
        id: "missing-route",
        routeRecordIds: [],
        gtfsRouteIds: [],
        routeScopeResolution: "missing",
      }),
      anchorRow({
        id: "missing-treatment",
        treatmentRecordIds: [],
        treatmentFamilies: [],
        treatmentScopeResolution: "missing",
      }),
      anchorRow({ id: "conflict", conflictStates: ["status_conflict"] }),
      anchorRow({ id: "ambiguous-phase", lifecyclePhase: "other" }),
    ];

    await withFixture({ rows }, async (fixture) => {
      const imported = await runMtaWikiOperationalAnchorImport({
        mtaWikiRoot: fixture.root,
        wikiRelease: fixture.releaseId,
        wikiManifestSha256: fixture.manifestSha256,
        output: join(fixture.root, "import.json"),
      });
      const merged = buildStudyEventMergeArtifact({
        registryEvents: [],
        wiki: {
          releaseId: imported.sourceRelease.releaseId,
          manifestSha256: imported.sourceRelease.manifestSha256,
          artifactSha256: imported.sourceRelease.anchors.sha256,
          assertions: imported.assertions,
        },
        withoutWikiAnchors: false,
      });

      expect(imported.summary).toMatchObject({
        sourceRowCount: 11,
        assertionCount: 11,
        eligibleAssertionCount: 2,
        rejectedAssertionCount: 9,
      });
      expect(
        merged.candidates
          .map((candidate) => ({
            date: candidate.implementationDate,
            precision: candidate.datePrecision,
          }))
          .toSorted((left, right) => left.date.localeCompare(right.date)),
      ).toEqual([
        { date: "2024-05-20", precision: "day" },
        { date: "2024-06", precision: "month" },
      ]);
      expect(merged.rejections).toHaveLength(9);

      const importerReasonById = new Map(
        imported.rejections.map((rejection) => [
          rejection.operationalChangeId,
          rejection.reasonCodes,
        ]),
      );
      const expectedImporterReasons = new Map([
        ["change:publication", "unsupported_operational_event_family"],
        ["change:status-as-of", "non_realized_operational_date"],
        ["change:planned-day", "non_realized_operational_date"],
        ["change:year", "imprecise_operational_date"],
        ["change:season", "imprecise_operational_date"],
        ["change:missing-route", "route_count_not_one"],
        ["change:missing-treatment", "treatment_count_not_one"],
        ["change:conflict", "conflict_present"],
        ["change:ambiguous-phase", "ambiguous_lifecycle_phase"],
      ]);
      for (const [changeId, reason] of expectedImporterReasons) {
        expect(importerReasonById.get(changeId)).toContain(reason);
      }

      for (const rejection of merged.rejections) {
        expect(rejection.reasons).toEqual(
          expect.arrayContaining(["importer_causal_ineligible", "local_causal_eligibility_failed"]),
        );
      }
    });
  });

  test("deduplicates only exact rows within one change and quarantines cross-date groups", async () => {
    const rows = [
      anchorRow({
        anchorId: "operational:event-a",
        eventRecordId: "event-a",
        changeId: "change:duplicate",
      }),
      anchorRow({
        anchorId: "operational:event-b",
        eventRecordId: "event-b",
        changeId: "change:duplicate",
      }),
      anchorRow({
        anchorId: "operational:event-c",
        eventRecordId: "event-c",
        changeId: "change:separate",
      }),
      anchorRow({
        anchorId: "operational:event-d",
        eventRecordId: "event-d",
        changeId: "change:conflict",
        date: "2024-06-15",
      }),
      anchorRow({
        anchorId: "operational:event-e",
        eventRecordId: "event-e",
        changeId: "change:conflict",
        date: "2024-07-01",
      }),
    ];
    await withFixture({ rows }, async (fixture) => {
      const artifact = await runMtaWikiOperationalAnchorImport({
        mtaWikiRoot: fixture.root,
        wikiRelease: fixture.releaseId,
        wikiManifestSha256: fixture.manifestSha256,
        output: join(fixture.root, "output.json"),
      });

      expect(artifact.summary).toMatchObject({
        sourceRowCount: 5,
        assertionCount: 4,
        exactDuplicateGroupCount: 1,
        exactDuplicateRowCount: 1,
        crossDateConflictGroupCount: 1,
        eligibleAssertionCount: 2,
        rejectedAssertionCount: 2,
      });
      const duplicate = artifact.assertions.find(
        (assertion) => assertion.operationalChangeId === "change:duplicate",
      );
      expect(duplicate?.wikiAnchorIds).toEqual(["operational:event-a", "operational:event-b"]);
      expect(
        artifact.assertions.filter(
          (assertion) => assertion.operationalChangeId === "change:separate",
        ),
      ).toHaveLength(1);
      const conflicts = artifact.assertions.filter(
        (assertion) => assertion.operationalChangeId === "change:conflict",
      );
      expect(conflicts).toHaveLength(2);
      expect(conflicts.every((assertion) => !assertion.causalAnchorEligible)).toBe(true);
      expect(
        conflicts.every((assertion) => assertion.conflictStates.includes("date_conflict")),
      ).toBe(true);
      expect(artifact.conflicts[0]?.candidateOperationalDates).toEqual([
        "2024-06-15",
        "2024-07-01",
      ]);
    });
  });

  test("requires the caller's exact manifest hash", async () => {
    await withFixture({ rows: [anchorRow()] }, async (fixture) => {
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: "0".repeat(64),
          output: join(fixture.root, "output.json"),
        }),
      ).rejects.toMatchObject({
        _tag: "MtaWikiOperationalAnchorImportError",
        code: "hash_mismatch",
        operation: "verifyManifest",
      });
    });
  });

  test("rejects an unsupported manifest version even when its exact hash is pinned", async () => {
    await withFixture({ rows: [anchorRow()], manifestVersion: 3 }, async (fixture) => {
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "output.json"),
        }),
      ).rejects.toMatchObject({
        _tag: "MtaWikiOperationalAnchorImportError",
        code: "schema_mismatch",
        operation: "decodeManifest",
      });
    });
  });

  test("rejects an unsupported operational-anchor contract version", async () => {
    await withFixture(
      { rows: [anchorRow()], operationalAnchorContractVersion: 2 },
      async (fixture) => {
        await expect(
          runMtaWikiOperationalAnchorImport({
            mtaWikiRoot: fixture.root,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            output: join(fixture.root, "output.json"),
          }),
        ).rejects.toMatchObject({
          _tag: "MtaWikiOperationalAnchorImportError",
          code: "schema_mismatch",
          operation: "decodeManifest",
        });
      },
    );
  });

  test("rejects an unsupported accepted-review snapshot contract version", async () => {
    await withFixture(
      { rows: [anchorRow()], operationalAnchorReviewContractVersion: 2 },
      async (fixture) => {
        await expect(
          runMtaWikiOperationalAnchorImport({
            mtaWikiRoot: fixture.root,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            output: join(fixture.root, "output.json"),
          }),
        ).rejects.toMatchObject({
          _tag: "MtaWikiOperationalAnchorImportError",
          code: "schema_mismatch",
          operation: "decodeManifest",
        });
      },
    );
  });

  test("rejects a manifest pointer that escapes its pinned release", async () => {
    await withFixture(
      { rows: [anchorRow()], anchorPointer: "../outside-operational-anchors.jsonl" },
      async (fixture) => {
        await expect(
          runMtaWikiOperationalAnchorImport({
            mtaWikiRoot: fixture.root,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            output: join(fixture.root, "output.json"),
          }),
        ).rejects.toMatchObject({
          _tag: "MtaWikiOperationalAnchorImportError",
          code: "unsafe_path",
          operation: "verifyOperationalAnchors",
        });
      },
    );
  });

  test("rejects a release-directory symlink that escapes the releases root", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-wiki-release-link-"));
    const outside = await mkdtemp(join(tmpdir(), "bp-wiki-release-outside-"));
    try {
      const releasesRoot = join(root, "data", "exports", "releases");
      await mkdir(releasesRoot, { recursive: true });
      await symlink(outside, join(releasesRoot, "fixture-release"), "dir");
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: root,
          wikiRelease: "fixture-release",
          wikiManifestSha256: "0".repeat(64),
          output: join(root, "output.json"),
        }),
      ).rejects.toMatchObject({
        _tag: "MtaWikiOperationalAnchorImportError",
        code: "unsafe_path",
        operation: "resolveReleaseDirectory",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("refuses to overwrite any file in the pinned producer release", async () => {
    await withFixture({ rows: [anchorRow()] }, async (fixture) => {
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: fixture.anchorPath,
        }),
      ).rejects.toMatchObject({
        _tag: "MtaWikiOperationalAnchorImportError",
        code: "unsafe_path",
        operation: "resolveReleaseDirectory",
      });
    });
  });

  test("rejects an output path whose symlinked parent resolves into the producer release", async () => {
    await withFixture({ rows: [anchorRow()] }, async (fixture) => {
      const outputLink = join(fixture.root, "output-link");
      await symlink(fixture.releaseDirectory, outputLink, "dir");
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(outputLink, "import.json"),
        }),
      ).rejects.toMatchObject({
        _tag: "MtaWikiOperationalAnchorImportError",
        code: "unsafe_path",
        operation: "resolveReleaseDirectory",
      });
    });
  });

  test("detects exact-byte anchor tampering after the manifest was cut", async () => {
    await withFixture({ rows: [anchorRow()] }, async (fixture) => {
      const original = await readFile(fixture.anchorPath, "utf8");
      await writeFile(fixture.anchorPath, original.replaceAll("2024-06-15", "2024-06-16"));
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "output.json"),
        }),
      ).rejects.toMatchObject({
        _tag: "MtaWikiOperationalAnchorImportError",
        code: "hash_mismatch",
        operation: "verifyOperationalAnchors",
      });
    });
  });

  test("reports malformed JSONL with its exact one-based line number", async () => {
    const row = anchorRow();
    await withFixture(
      { rows: [row], anchorText: `${JSON.stringify(row)}\n{\n` },
      async (fixture) => {
        await expect(
          runMtaWikiOperationalAnchorImport({
            mtaWikiRoot: fixture.root,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            output: join(fixture.root, "output.json"),
          }),
        ).rejects.toMatchObject({
          _tag: "MtaWikiOperationalAnchorImportError",
          code: "invalid_json",
          operation: "decodeOperationalAnchors",
          line: 2,
        });
      },
    );
  });

  test("reports strict row schema mismatches with their exact line number", async () => {
    const row = anchorRow();
    await withFixture(
      { rows: [row], anchorText: `${JSON.stringify(row)}\n{"schema_version":1}\n` },
      async (fixture) => {
        await expect(
          runMtaWikiOperationalAnchorImport({
            mtaWikiRoot: fixture.root,
            wikiRelease: fixture.releaseId,
            wikiManifestSha256: fixture.manifestSha256,
            output: join(fixture.root, "output.json"),
          }),
        ).rejects.toMatchObject({
          _tag: "MtaWikiOperationalAnchorImportError",
          code: "schema_mismatch",
          operation: "decodeOperationalAnchors",
          line: 2,
        });
      },
    );
  });

  test("hard-fails when the producer summary does not reconcile with decoded rows", async () => {
    const rows = [anchorRow()];
    const summary = { ...producerSummary(rows), row_count: 99 };
    await withFixture({ rows, summary }, async (fixture) => {
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "output.json"),
        }),
      ).rejects.toMatchObject({
        _tag: "MtaWikiOperationalAnchorImportError",
        code: "summary_mismatch",
      });
    });
  });

  test("strictly accepts the expanded broad/reviewed producer funnel", async () => {
    const rows = [
      anchorRow({ id: "broad", eventRecordId: "event:broad" }),
      anchorRow({
        anchorId: "operational-reviewed:event:reviewed",
        changeId: "change:reviewed",
        eventRecordId: "event:reviewed",
      }),
    ];
    const summary = expandedProducerSummary(rows, { operationalFamilyEventCount: 3 });
    await withFixture({ rows, summary }, async (fixture) => {
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "expanded-summary.json"),
        }),
      ).resolves.toBeDefined();
    });
  });

  test("rejects expanded producer row-partition and broad-funnel drift", async () => {
    const rows = [
      anchorRow({ id: "broad", eventRecordId: "event:broad" }),
      anchorRow({
        anchorId: "operational-reviewed:event:reviewed",
        changeId: "change:reviewed",
        eventRecordId: "event:reviewed",
      }),
    ];
    const partitionDrift = {
      ...expandedProducerSummary(rows),
      reviewed_row_count: 0,
    };
    await withFixture({ rows, summary: partitionDrift }, async (fixture) => {
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "partition-drift.json"),
        }),
      ).rejects.toMatchObject({
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
      });
    });

    const funnelDrift = expandedProducerSummary(rows);
    funnelDrift.broad_funnel.unlinked_operational_events += 1;
    await withFixture({ rows, summary: funnelDrift }, async (fixture) => {
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "funnel-drift.json"),
        }),
      ).rejects.toMatchObject({
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
      });
    });
  });

  test("rejects candidate precision that disagrees with its normalized date literal", async () => {
    const row = anchorRow();
    row.candidate_operational_date_precision = "month";
    await withFixture({ rows: [row] }, async (fixture) => {
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "output.json"),
        }),
      ).rejects.toMatchObject({
        _tag: "MtaWikiOperationalAnchorImportError",
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        line: 1,
      });
    });
  });

  test("requires manifest event counts to agree with the producer funnel", async () => {
    const rows = [anchorRow()];
    await withFixture({ rows, manifestEventCount: 2 }, async (fixture) => {
      await expect(
        runMtaWikiOperationalAnchorImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: fixture.manifestSha256,
          output: join(fixture.root, "output.json"),
        }),
      ).rejects.toMatchObject({
        _tag: "MtaWikiOperationalAnchorImportError",
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
      });
    });
  });

  test("study command requires pinned Wiki input unless the operator explicitly opts out", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-study-merge-input-boundary-"));
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_intervention_event (
          event_id TEXT NOT NULL,
          route_id TEXT NOT NULL,
          intervention_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          program TEXT NOT NULL,
          implementation_date TEXT NOT NULL,
          implementation_month TEXT NOT NULL,
          event_status TEXT NOT NULL,
          description TEXT NOT NULL
        );
      `);
      const local = {
        db: createLocalPipelineDb(sqlite),
        sqlite,
        path: ":memory:",
        spatialite: null,
      };

      await expect(
        runStudyEventMerge({
          local,
          withoutWikiAnchors: false,
          outputPath: join(root, "missing-wiki.json"),
        }),
      ).rejects.toThrow(
        "--wiki-import is required unless --without-wiki-anchors is explicitly supplied",
      );

      const optedOut = await runStudyEventMerge({
        local,
        withoutWikiAnchors: true,
        outputPath: join(root, "explicit-opt-out.json"),
      });
      expect(optedOut.wikiInput).toMatchObject({ mode: "explicit_opt_out" });
      expect(optedOut.summary.candidateCount).toBe(0);
      expect(await readFile(optedOut.outputPath, "utf8")).toContain('"explicit_opt_out"');
    } finally {
      sqlite.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps analysis route availability exact and case-sensitive", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_route_segment_speed (route_id TEXT NOT NULL);
        INSERT INTO local_route_segment_speed (route_id) VALUES ('B44'), ('B44+'), ('b44');
      `);
      const routeIds = loadAvailableAnalysisRouteIds({
        db: createLocalPipelineDb(sqlite),
        sqlite,
        path: ":memory:",
        spatialite: null,
      });
      expect([...routeIds]).toEqual(["B44", "B44+", "b44"]);
    } finally {
      sqlite.close();
    }
  });

  test("registers the strict importer as a two-part studio command", () => {
    expect(command.path).toEqual(["studio", "import-mta-wiki-operational-anchors"]);
  });
});
