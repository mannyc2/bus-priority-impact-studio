import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RouteTreatmentInterventionEventRow } from "@bp/analytics/interventions";
import { decodeStrict } from "@bp/domain/decode";
import type {
  MtaWikiOperationalOccurrenceImportArtifactV3,
  MtaWikiOperationalOccurrenceImportArtifactV4,
  MtaWikiOperationalOccurrenceImportArtifactV5,
  OperationalOccurrenceEvidenceBinding,
  OperationalOccurrenceEvidenceBindingV2,
  OperationalOccurrenceReviewDecision,
  OperationalOccurrenceReviewSnapshotV1Rc22Inspection,
  OperationalOccurrenceRow,
  OperationalOccurrenceRowV2,
} from "@bp/domain/documents/operational-occurrence";
import {
  StudyEventMergeArtifactV2Schema,
  StudyEventMergeArtifactV3Schema,
} from "@bp/domain/studio/study";
import command from "../src/commands/studio/import-mta-wiki-operational-occurrences.ts";
import {
  classifyOperationalOccurrenceReviewCompatibility,
  RELATIONSHIP_CONTRACT_POLICY_V1,
  recomputeOperationalOccurrenceSummary,
  recomputeOperationalOccurrenceSummaryV2,
  runMtaWikiOperationalOccurrenceImport,
} from "../src/lib/mta-wiki-operational-occurrences.ts";
import {
  type MtaWikiRouteIdentitySnapshot,
  reconstructedRouteAnchors,
} from "../src/lib/mta-wiki-route-identities.ts";
import { queensRedesignOverlapGate } from "../src/lib/study-engine/gates.ts";
import {
  buildStudyEventMergeArtifactV2,
  buildStudyEventMergeArtifactV3,
  occurrenceAnalysisRouteId,
  pinnedOccurrenceStudyInputV4,
} from "../src/lib/study-engine/study-events.ts";

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function binding(
  role: OperationalOccurrenceEvidenceBinding["role"],
  recordId: string,
): OperationalOccurrenceEvidenceBinding {
  return {
    role,
    record_id: recordId,
    source_id: "source:official",
    evidence_id: `source:official#${role}-${recordId}`,
  };
}

function tamperFirstBinding(
  bindings: readonly OperationalOccurrenceEvidenceBinding[],
): OperationalOccurrenceEvidenceBinding[] {
  const first = bindings[0];
  if (first === undefined) throw new Error("fixture needs an evidence binding");
  return [{ ...first, evidence_id: `${first.evidence_id}:tampered` }, ...bindings.slice(1)];
}

function duplicateFirstBinding(
  bindings: readonly OperationalOccurrenceEvidenceBinding[],
): OperationalOccurrenceEvidenceBinding[] {
  const first = bindings[0];
  if (first === undefined) throw new Error("fixture needs an evidence binding");
  return [...bindings, { ...first }];
}

type RowOptions = {
  id?: string;
  routes?: Array<{ route_record_id: string; gtfs_route_id: string }>;
  bundle?: boolean;
  supportedBundle?: boolean;
  memberFamilies?: string[];
  queensProgram?: boolean;
};

function registryEvent(
  overrides: Partial<RouteTreatmentInterventionEventRow> = {},
): RouteTreatmentInterventionEventRow {
  return {
    event_id: "registry-b1-lane",
    route_id: "B1",
    intervention_type: "bus_lane",
    source_id: "nyc_dot_bus_lanes",
    program: "NYC DOT bus lanes",
    implementation_date: "2025-06-29",
    implementation_month: "2025-06",
    event_status: "implemented",
    description: "B1 bus lane implementation",
    ...overrides,
  };
}

function occurrenceRow(options: RowOptions = {}): OperationalOccurrenceRow {
  const occurrenceId = options.id ?? "occurrence:atomic";
  const eventId = `event:${occurrenceId}`;
  const routes = options.routes ?? [{ route_record_id: "route:b1", gtfs_route_id: "B1" }];
  const routeRows = routes
    .map((route) => ({
      ...route,
      evidence_bindings: [
        binding("route_identity", route.route_record_id),
        binding("route_scope", `relation:${route.route_record_id}:scope`),
      ],
    }))
    .toSorted((left, right) => left.route_record_id.localeCompare(right.route_record_id));
  const memberFamilies = options.memberFamilies ?? ["bus_lane", "transit_signal_priority"];
  const members = memberFamilies
    .map((family, index) => {
      const treatmentRecordId = `treatment:${String(index + 1).padStart(2, "0")}:${family}`;
      return {
        treatment_record_id: treatmentRecordId,
        treatment_family: family,
        evidence_bindings: [
          binding("treatment_definition", treatmentRecordId),
          binding("treatment_scope", `relation:${treatmentRecordId}:scope`),
        ],
      };
    })
    .toSorted((left, right) => left.treatment_record_id.localeCompare(right.treatment_record_id));
  const atomicMember = members[0];
  if (atomicMember === undefined) throw new Error("fixture needs a treatment member");
  const bundleFamilyBinding = binding(
    "bundle_analysis_family",
    options.queensProgram ? "project_queens-bus-network-redesign" : `bundle:${occurrenceId}`,
  );
  const treatment = options.bundle
    ? {
        kind: "bundle" as const,
        bundle_family: options.supportedBundle === false ? null : "route_redesign",
        bundle_family_evidence_bindings:
          options.supportedBundle === false ? [] : [bundleFamilyBinding],
        members,
      }
    : { kind: "atomic" as const, member: atomicMember };
  const dateBinding = binding("event_date", eventId);
  const allBindings = [
    dateBinding,
    ...routeRows.flatMap((route) => route.evidence_bindings),
    ...(treatment.kind === "atomic"
      ? treatment.member.evidence_bindings
      : [
          ...treatment.bundle_family_evidence_bindings,
          ...treatment.members.flatMap((member) => member.evidence_bindings),
        ]),
  ].toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const relationRecordIds = [
    ...routeRows.map((route) => `relation:${route.route_record_id}:scope`),
    ...members.map((member) => `relation:${member.treatment_record_id}:scope`),
  ].toSorted();
  return {
    schema_version: 1,
    occurrence_id: occurrenceId,
    occurrence_aliases: [],
    occurrence_review_decision_id: `decision:${occurrenceId}`,
    founding_key: `event:${occurrenceId}`,
    resolution_cluster_id: null,
    observations: [
      {
        event_record_id: eventId,
        relation_record_ids: relationRecordIds,
        document_time_statuses: ["implemented"],
        document_time_dates: [
          {
            raw: "June 29, 2025",
            normalized: "2025-06-29",
            precision: "day",
            source_field: "event_date",
          },
        ],
        status_as_of_dates: [],
      },
    ],
    resolved_status: "realized",
    resolved_onset: {
      date: "2025-06-29",
      precision: "day",
      resolver_ids: [eventId],
      publication_dates: [],
      retrieval_dates: ["2026-06-07"],
      evidence_bindings: [dateBinding],
    },
    routes: routeRows,
    treatment,
    source_ids: ["source:official"],
    evidence_bindings: allBindings,
    exclusion_reasons:
      options.bundle && options.supportedBundle === false
        ? ["unsupported_bundle_analysis_family"]
        : [],
    review_state: "approved",
    study_projection_eligible: !(options.bundle && options.supportedBundle === false),
    provenance: {
      anchor_review_decision_ids: [],
      event_record_ids: [eventId],
      relation_record_ids: relationRecordIds,
      route_record_ids: routeRows.map((route) => route.route_record_id),
      treatment_record_ids:
        treatment.kind === "atomic"
          ? [treatment.member.treatment_record_id]
          : treatment.members.map((member) => member.treatment_record_id),
    },
  };
}

function reviewDecision(row: OperationalOccurrenceRow): OperationalOccurrenceReviewDecision {
  return {
    schema_version: 1,
    decision_id: row.occurrence_review_decision_id,
    review_state: "approved",
    occurrence_id: row.occurrence_id,
    founding_key: row.founding_key,
    anchor_review_decision_ids: [...row.provenance.anchor_review_decision_ids],
    resolved_onset: {
      date: row.resolved_onset.date,
      precision: row.resolved_onset.precision,
      evidence_bindings: [...row.resolved_onset.evidence_bindings],
    },
    routes: row.routes.map((route) => ({
      route_record_id: route.route_record_id,
      gtfs_route_id: route.gtfs_route_id,
      evidence_bindings: [...route.evidence_bindings],
    })),
    treatment:
      row.treatment.kind === "atomic"
        ? {
            kind: "atomic",
            member: {
              treatment_record_id: row.treatment.member.treatment_record_id,
              treatment_family: row.treatment.member.treatment_family,
              evidence_bindings: [...row.treatment.member.evidence_bindings],
            },
          }
        : {
            kind: "bundle",
            bundle_family: row.treatment.bundle_family,
            bundle_family_evidence_bindings: [...row.treatment.bundle_family_evidence_bindings],
            members: row.treatment.members.map((member) => ({
              treatment_record_id: member.treatment_record_id,
              treatment_family: member.treatment_family,
              evidence_bindings: [...member.evidence_bindings],
            })),
          },
    evidence_bindings: [...row.evidence_bindings],
    reviewers: ["fixture-reviewer"],
    accepted_at: "2026-07-12T00:00:00.000Z",
    rationale: "Exact fixture occurrence shape reviewed.",
  };
}

type ReleaseFixture = {
  root: string;
  releaseId: string;
  releaseDirectory: string;
  legacyAnchorPath: string;
  occurrencePath: string;
  summaryPath: string;
  reviewPath: string;
  manifestPath: string;
  manifestSha256: string;
};

type DualPublishPointer =
  | "operational_anchors"
  | "operational_anchor_summary"
  | "operational_anchor_review_decisions"
  | "operational_occurrences"
  | "operational_occurrence_summary"
  | "operational_occurrence_review_decisions";

const DUAL_PUBLISH_POINTERS: readonly DualPublishPointer[] = [
  "operational_anchors",
  "operational_anchor_summary",
  "operational_anchor_review_decisions",
  "operational_occurrences",
  "operational_occurrence_summary",
  "operational_occurrence_review_decisions",
];

type ManifestPointer = DualPublishPointer | "route_anchors" | "taxonomy" | "quality_report";

async function writeReleaseFixture(input: {
  rows: readonly OperationalOccurrenceRow[];
  manifestVersion?: number;
  occurrenceContractVersion?: number;
  occurrenceReviewContractVersion?: number;
  occurrencePointer?: string;
  omitOccurrencePointer?: boolean;
  extraManifestKey?: boolean;
  pointerOverrides?: Partial<Record<ManifestPointer, string | null>>;
  unsafeExtraFileKey?: string;
  summary?: unknown;
  decisions?: OperationalOccurrenceReviewDecision[];
}): Promise<ReleaseFixture> {
  const root = await mkdtemp(join(tmpdir(), "bp-wiki-operational-occurrence-"));
  const releaseId = "fixture-occurrence-release";
  const releaseDirectory = join(root, "data", "exports", "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const occurrencePointer = input.occurrencePointer ?? "operational_occurrences.jsonl";
  const summaryPointer = "operational_occurrences_summary.json";
  const reviewPointer = "operational_occurrence_review_decisions.json";
  const occurrenceText = `${input.rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const summaryText = `${JSON.stringify(
    input.summary ?? recomputeOperationalOccurrenceSummary(input.rows),
  )}\n`;
  const decisions =
    input.decisions ??
    input.rows.map(reviewDecision).toSorted((a, b) => a.decision_id.localeCompare(b.decision_id));
  const reviewText = `${JSON.stringify({
    snapshot_version: 1,
    decision_schema_version: 1,
    decision_count: decisions.length,
    decisions,
  })}\n`;
  const occurrencePath = join(releaseDirectory, occurrencePointer);
  const summaryPath = join(releaseDirectory, summaryPointer);
  const reviewPath = join(releaseDirectory, reviewPointer);
  if (!occurrencePointer.startsWith("..")) {
    await mkdir(dirname(occurrencePath), { recursive: true });
    await writeFile(occurrencePath, occurrenceText, "utf8");
  }
  await writeFile(summaryPath, summaryText, "utf8");
  await writeFile(reviewPath, reviewText, "utf8");
  const legacyFiles = {
    "operational_anchors.jsonl": "",
    "operational_anchors_summary.json": "{}\n",
    "operational_anchor_review_decisions.json": "{}\n",
  };
  for (const [pointer, text] of Object.entries(legacyFiles)) {
    await writeFile(join(releaseDirectory, pointer), text, "utf8");
  }
  const fileEntry = (text: string) => ({ bytes: Buffer.byteLength(text), sha256: sha256(text) });
  const files: Record<string, { bytes: number; sha256: string }> = {
    ...Object.fromEntries(
      Object.entries(legacyFiles).map(([pointer, text]) => [pointer, fileEntry(text)]),
    ),
    [occurrencePointer]: fileEntry(occurrenceText),
    [summaryPointer]: fileEntry(summaryText),
    [reviewPointer]: fileEntry(reviewText),
  };
  if (input.unsafeExtraFileKey !== undefined) {
    files[input.unsafeExtraFileKey] = fileEntry("unsafe fixture entry\n");
  }
  const pointers = {
    operational_anchors: "operational_anchors.jsonl",
    operational_anchor_summary: "operational_anchors_summary.json",
    operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
    ...(input.omitOccurrencePointer ? {} : { operational_occurrences: occurrencePointer }),
    operational_occurrence_summary: summaryPointer,
    operational_occurrence_review_decisions: reviewPointer,
    route_anchors: null,
    taxonomy: null,
    quality_report: null,
    ...input.pointerOverrides,
  };
  const manifest = {
    ...(input.extraManifestKey ? { excess: true } : {}),
    manifest_version: input.manifestVersion ?? 3,
    release_id: releaseId,
    generator_commit: "fixture-generator-commit",
    contract_versions: {
      operational_anchors: 1,
      operational_anchor_review_decisions: 1,
      operational_occurrences: input.occurrenceContractVersion ?? 1,
      operational_occurrence_review_decisions: input.occurrenceReviewContractVersion ?? 1,
    },
    record_counts: { event: input.rows.length },
    files,
    pointers,
  };
  const manifestText = `${JSON.stringify(manifest)}\n`;
  const manifestPath = join(releaseDirectory, "manifest.json");
  await writeFile(manifestPath, manifestText, "utf8");
  return {
    root,
    releaseId,
    releaseDirectory,
    legacyAnchorPath: join(releaseDirectory, "operational_anchors.jsonl"),
    occurrencePath,
    summaryPath,
    reviewPath,
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

async function importFixture(
  fixture: ReleaseFixture,
  output = "import.json",
): Promise<MtaWikiOperationalOccurrenceImportArtifactV3> {
  const artifact = await runMtaWikiOperationalOccurrenceImport({
    mtaWikiRoot: fixture.root,
    wikiRelease: fixture.releaseId,
    wikiManifestSha256: fixture.manifestSha256,
    output: join(fixture.root, output),
  });
  if (artifact.artifactKind !== "bp.studio.mta_wiki_operational_occurrences.v3") {
    throw new Error("legacy fixture unexpectedly produced a non-v3 import artifact");
  }
  return artifact;
}

const RELATIONSHIP_GATE_IDS = [
  "bus_lane_acquisition_linkage",
  "determinism_and_consumer_proof",
  "occurrence_treatment_physicality",
  "payload_reference_integrity",
  "referential_type_evidence_integrity",
  "relationship_completeness",
  "semantic_remediation",
] as const;
const RELATIONSHIP_GATE_SOURCES = {
  bus_lane_acquisition_linkage: [
    [
      "acquisition_summary",
      "data/quality/relationship-integrity/bus-lane-acquisition/summary.json",
    ],
    [
      "linkage_materialization_summary",
      "data/quality/relationship-integrity/bus-lane-acquisition/linkage-materialization/summary.json",
    ],
    [
      "linkage_reconciliation_summary",
      "data/quality/relationship-integrity/bus-lane-acquisition/linkage-reconciliation/summary.json",
    ],
  ],
  determinism_and_consumer_proof: [
    [
      "determinism_consumer_summary",
      "data/quality/relationship-integrity/determinism-consumer/summary.json",
    ],
  ],
  occurrence_treatment_physicality: [
    [
      "occurrence_treatment_physicality_summary",
      "data/quality/relationship-integrity/occurrence-treatment-physicality/summary.json",
    ],
    [
      "phase_review_summary",
      "data/quality/relationship-integrity/operational-occurrence-phases/summary.json",
    ],
  ],
  payload_reference_integrity: [
    [
      "payload_reference_summary",
      "data/quality/relationship-integrity/payload-references/summary.json",
    ],
  ],
  referential_type_evidence_integrity: [
    ["graph_audit_findings", "data/quality/relationship-integrity/graph-audit/findings.jsonl"],
    ["graph_audit_manifest", "data/quality/relationship-integrity/graph-audit/manifest.json"],
    ["graph_audit_summary", "data/quality/relationship-integrity/graph-audit/summary.json"],
    ["sql_integrity_summary", "data/quality/relationship-integrity/sql-integrity/summary.json"],
  ],
  relationship_completeness: [
    [
      "relationship_completeness_summary",
      "data/quality/relationship-integrity/completeness/summary.json",
    ],
  ],
  semantic_remediation: [
    [
      "semantic_remediation_summary",
      "data/quality/relationship-integrity/semantic-remediation/summary.json",
    ],
  ],
} as const;
const RELATIONSHIP_REFRESH_ROLES = new Set([
  "graph_audit_findings",
  "graph_audit_manifest",
  "graph_audit_summary",
  "linkage_materialization_summary",
  "sql_integrity_summary",
]);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function canonicalJsonl(values: readonly unknown[]): string {
  return values.length === 0 ? "" : `${values.map(canonicalJson).join("\n")}\n`;
}

function canonicalDigest(value: unknown): string {
  return sha256(canonicalJson(value));
}

function transitionFingerprint(role: string, text: string): string {
  if (role === "graph_audit_findings") {
    return canonicalDigest(
      text
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const { severity: _severity, ...stable } = JSON.parse(line) as Record<string, unknown>;
          return stable;
        }),
    );
  }
  const value = JSON.parse(text) as Record<string, unknown>;
  if (role === "graph_audit_manifest") {
    delete value["contract_sha256"];
    delete value["input_fingerprint"];
    delete value["mode"];
    delete value["reproduction_commands"];
    if (Array.isArray(value["artifacts"])) {
      value["artifacts"] = value["artifacts"].map((entry) => {
        const { sha256: _sha256, ...stable } = entry as Record<string, unknown>;
        return stable;
      });
    }
  } else if (role === "graph_audit_summary") {
    delete value["mode"];
    delete value["findings_by_severity"];
  } else if (role === "sql_integrity_summary") {
    delete value["canonical_db_sha256"];
    delete value["graph_findings_sha256"];
    delete value["graph_manifest_sha256"];
    delete value["graph_summary_sha256"];
    delete value["enforcement_mode"];
  } else if (role === "linkage_materialization_summary") {
    delete value["canonical_db_sha256"];
  } else {
    throw new Error(`unsupported fixture refresh role ${role}`);
  }
  return canonicalDigest(value);
}

function occurrenceRowV2(
  options: {
    exactPhysicalScope?: boolean;
    relatedPhases?: boolean;
    routes?: Array<{ route_record_id: string; gtfs_route_id: string }>;
  } = {},
): OperationalOccurrenceRowV2 {
  const legacy = occurrenceRow(options.routes === undefined ? {} : { routes: options.routes });
  const eventId = legacy.provenance.event_record_ids[0];
  if (eventId === undefined) throw new Error("fixture needs one phase event");
  const relatedEventId = `${eventId}:phase-2`;
  const phase = {
    role: "phase_relation" as const,
    record_id: "relation:phase-1-precedes-phase-2",
    source_id: "source:official",
    evidence_id: "source:official#phase-1-precedes-phase-2",
  };
  const physical = {
    role: "physical_scope" as const,
    record_id: "relation:physical-scope",
    source_id: "source:official",
    evidence_id: "source:official#physical-scope",
  };
  const v2Bindings = [
    ...(options.relatedPhases ? [phase] : []),
    ...(options.exactPhysicalScope ? [physical] : []),
  ];
  const observations = legacy.observations.map((observation) => ({
    ...observation,
    relation_record_ids: options.exactPhysicalScope
      ? sortedStrings([...observation.relation_record_ids, physical.record_id])
      : observation.relation_record_ids,
  }));
  if (options.relatedPhases) {
    observations.push({
      event_record_id: relatedEventId,
      relation_record_ids: [phase.record_id],
      document_time_statuses: ["implemented"],
      document_time_dates: [
        {
          raw: "July 1, 2025",
          normalized: "2025-07-01",
          precision: "day",
          source_field: "event_date",
        },
      ],
      status_as_of_dates: [],
    });
  }
  return {
    ...legacy,
    schema_version: 2,
    observations: observations.toSorted((left, right) =>
      left.event_record_id.localeCompare(right.event_record_id),
    ),
    evidence_bindings: sortedBindings([...legacy.evidence_bindings, ...v2Bindings]),
    phase_record_ids: options.relatedPhases ? sortedStrings([eventId, relatedEventId]) : [eventId],
    phase_relation_record_ids: options.relatedPhases ? [phase.record_id] : [],
    phase_relation_evidence_bindings: options.relatedPhases ? [phase] : [],
    phase_relation_disposition: options.relatedPhases ? "related_phases" : "single_phase",
    physical_scope_record_ids: options.exactPhysicalScope ? ["corridor:physical-scope"] : [],
    physical_scope_relation_record_ids: options.exactPhysicalScope ? [physical.record_id] : [],
    physical_scope_evidence_bindings: options.exactPhysicalScope ? [physical] : [],
    provenance: {
      ...legacy.provenance,
      event_record_ids: options.relatedPhases
        ? sortedStrings([eventId, relatedEventId])
        : legacy.provenance.event_record_ids,
      relation_record_ids: sortedStrings([
        ...legacy.provenance.relation_record_ids,
        ...(options.relatedPhases ? [phase.record_id] : []),
        ...(options.exactPhysicalScope ? [physical.record_id] : []),
      ]),
    },
  };
}

function sortedStrings(values: readonly string[]): string[] {
  return [...values].toSorted();
}

function sortedBindings(
  values: readonly OperationalOccurrenceEvidenceBindingV2[],
): OperationalOccurrenceEvidenceBindingV2[] {
  return [...values].toSorted((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right)),
  );
}

function reviewDecisionV2(
  row: OperationalOccurrenceRowV2,
  options: { includeV2LineageRoles?: boolean } = {},
): OperationalOccurrenceReviewSnapshotV1Rc22Inspection["decisions"][number] {
  const decision = reviewDecision(
    row as unknown as OperationalOccurrenceRow,
  ) as unknown as OperationalOccurrenceReviewSnapshotV1Rc22Inspection["decisions"][number];
  return {
    ...decision,
    evidence_bindings: options.includeV2LineageRoles
      ? [...decision.evidence_bindings]
      : decision.evidence_bindings.filter(
          (binding) => binding.role !== "phase_relation" && binding.role !== "physical_scope",
        ),
  };
}

type ReleaseFixtureV4 = ReleaseFixture & {
  relationshipBundlePath: string;
  relationshipContractPath: string;
  firstGatePath: string;
};

async function writeReleaseFixtureV4(
  input: {
    row?: OperationalOccurrenceRowV2;
    reviewDecision?: OperationalOccurrenceReviewSnapshotV1Rc22Inspection["decisions"][number];
    includeV2LineageRolesInReview?: boolean;
    occurrenceContractVersion?: number;
    extraContractKey?: boolean;
    extraBundleArtifactText?: string;
    transitionPreviousProofMismatch?: boolean;
    transitionMissingRole?: boolean;
    transitionDuplicateRole?: boolean;
    transitionInvariantDigestMismatch?: boolean;
    transitionFingerprintMismatch?: boolean;
    graphManifestRowCountMismatch?: boolean;
    weakenedContractPolicy?: boolean;
    invalidEndpointMatrix?: boolean;
    physicalOccurrencePinMismatch?: boolean;
    phaseOccurrencePinMismatch?: boolean;
    physicalAuditNotReady?: boolean;
    physicalAuditFingerprintMismatch?: boolean;
    phaseAuditViolation?: boolean;
    physicalSummaryPinMismatch?: boolean;
  } = {},
): Promise<ReleaseFixtureV4> {
  const root = await mkdtemp(join(tmpdir(), "bp-wiki-operational-occurrence-v4-"));
  const releaseId = "fixture-occurrence-release-v4";
  const releaseDirectory = join(root, "data", "exports", "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const row = input.row ?? occurrenceRowV2();
  const occurrencePointer = "operational_occurrences.jsonl";
  const summaryPointer = "operational_occurrences_summary.json";
  const reviewPointer = "operational_occurrence_review_decisions.json";
  const bundlePointer = "relationship_integrity_bundle.json";
  const occurrenceText = `${JSON.stringify(row)}\n`;
  const summaryText = `${JSON.stringify(recomputeOperationalOccurrenceSummaryV2([row]))}\n`;
  const reviewText = `${JSON.stringify({
    snapshot_version: 1,
    decision_schema_version: 1,
    decision_count: 1,
    decisions: [
      input.reviewDecision ??
        reviewDecisionV2(row, {
          ...(input.includeV2LineageRolesInReview === undefined
            ? {}
            : { includeV2LineageRoles: input.includeV2LineageRolesInReview }),
        }),
    ],
  })}\n`;

  const matrixIdsSha = "1".repeat(64);
  const tupleSetSha = "2".repeat(64);
  const transitionPath =
    "data/contracts/relationships/v1/enforcement-transition-receipts/fixture.json";
  const endpointPath = "data/contracts/relationships/v1/post-remediation-endpoint-matrix.json";
  const proofPath = "data/contracts/relationships/v1/enforcement-proof.json";
  const contractPath = "data/contracts/relationships/v1/contract.json";
  const graphPath = "data/quality/relationship-integrity/graph-audit/summary.json";
  const archiveRoot = "data/contracts/relationships/v1/enforcement-proofs/fixture";
  const previousProofPath = `${archiveRoot}/proof.json`;
  const canonicalRelationsText = `${JSON.stringify({ record_id: "relation:fixture" })}\n`;
  const eligibleRows = row.study_projection_eligible ? [row] : [];
  const treatmentMembers = eligibleRows.flatMap((entry) =>
    entry.treatment.kind === "atomic" ? [entry.treatment.member] : entry.treatment.members,
  );
  const uniqueTreatmentIds = [
    ...new Set(treatmentMembers.map((entry) => entry.treatment_record_id)),
  ];
  const treatmentComponentsText = uniqueTreatmentIds
    .map((recordId) => JSON.stringify({ record_id: recordId }))
    .join("\n")
    .concat(uniqueTreatmentIds.length === 0 ? "" : "\n");
  const corridorsText = `${JSON.stringify({ record_id: "corridor:fixture" })}\n`;
  const eventRecordCount = row.phase_record_ids.length;
  const relationRecordCount = 1;
  const corridorRecordCount = 1;
  const treatmentRecordCount = uniqueTreatmentIds.length;
  const canonicalRecordCount =
    eventRecordCount + relationRecordCount + corridorRecordCount + treatmentRecordCount;
  const previousProof = {
    schema_version: 1,
    proof_stage: "pre_promotion_warning",
    fixture: true,
  };
  const graph = {
    canonical_record_count: canonicalRecordCount,
    canonical_relation_count: 1,
    distinct_relation_kind_count: 1,
    contract_rule_count: 1,
    contract_covered_relation_count: 1,
    finding_count: 3,
    findings_by_code: { REL_FAMILY_TYPE_SUSPECT_REVIEWED: 3, REL_ORPHAN_RECORD: 0 },
    findings_by_severity: { error: 0, warning: 3 },
    primary_dispositions: { clean: 1 },
    orphan_records_by_kind: {},
    duplicate_triple_groups: 0,
    duplicate_triple_records: 0,
    exact_duplicate_groups: 0,
    exact_duplicate_records: 0,
    ambiguous_aliases: 0,
    semantic_supersessions: 0,
  };
  const endpoint = {
    schema_version: 1,
    matrix_id: "relationship-contract-v1-post-remediation-final",
    contract_id: "relationship-contract-v1",
    review_status: "reviewed_post_remediation",
    generated_from: {
      projected_relations_path:
        "data/quality/relationship-integrity/semantic-remediation/projected-relations.jsonl",
      projected_relations_sha256: "3".repeat(64),
      projected_relations_logical_sha256: "4".repeat(64),
      projected_tuples_path:
        "data/quality/relationship-integrity/semantic-remediation/projected-tuples.json",
      projected_tuples_sha256: "5".repeat(64),
      projected_tuples_logical_sha256: "6".repeat(64),
      semantic_remediation_summary_path:
        "data/quality/relationship-integrity/semantic-remediation/summary.json",
      semantic_remediation_summary_sha256: "7".repeat(64),
      campaign_id: "relationship-semantic-remediation-v1",
      skipped_correction_count: 0,
      unmapped_relation_count: 0,
    },
    obsolete_baseline_tuple_policy: "reject",
    relation_kind_rule_count: 1,
    allowed_family_shape_count: 1,
    covered_relation_count: 1,
    relation_ids_sha256: matrixIdsSha,
    tuple_set_sha256: tupleSetSha,
    rules: [
      {
        relation_kind: "serves",
        relation_families: ["service"],
        allowed_shapes: [{ subject_kind: "event", object_kind: "route" }],
        allowed_family_shapes: input.invalidEndpointMatrix
          ? []
          : [
              {
                relation_family: "service",
                subject_kind: "event",
                object_kind: "route",
                provenance: "reviewed_post_remediation",
                review_decision_ids: ["fixture-review"],
                relation_count: 1,
                relation_ids_sha256: "8".repeat(64),
              },
            ],
        review_basis: "reviewed_post_remediation",
      },
    ],
  };
  const graphFindingsText = [0, 1, 2]
    .map((index) =>
      JSON.stringify({ code: "REL_FAMILY_TYPE_SUSPECT_REVIEWED", index, severity: "warning" }),
    )
    .join("\n")
    .concat("\n");
  const graphOrphansText = "";
  const graphRelationAuditText = `${JSON.stringify({ relation_id: "relation:fixture" })}\n`;
  const graphReportText = "# Fixture graph audit\n";
  const graphSummaryText = `${JSON.stringify(graph)}\n`;
  const graphManifestBase = {
    schema_version: 1,
    contract_id: "relationship-contract-v1",
    contract_sha256: "9".repeat(64),
    endpoint_matrix_sha256: canonicalDigest(endpoint),
    canonical_relations_sha256: sha256(canonicalRelationsText),
  };
  const graphManifest = {
    ...graphManifestBase,
    input_fingerprint: canonicalDigest({
      contract_sha256: graphManifestBase.contract_sha256,
      endpoint_matrix_sha256: graphManifestBase.endpoint_matrix_sha256,
      canonical_relations_sha256: graphManifestBase.canonical_relations_sha256,
    }),
    mode: "enforce",
    artifacts: [
      {
        path: "findings.jsonl",
        sha256: sha256(graphFindingsText),
        rows: input.graphManifestRowCountMismatch ? 4 : 3,
      },
      { path: "orphan-records.jsonl", sha256: sha256(graphOrphansText), rows: 0 },
      { path: "relation-audit.jsonl", sha256: sha256(graphRelationAuditText), rows: 1 },
      { path: "report.md", sha256: sha256(graphReportText) },
      { path: "summary.json", sha256: sha256(graphSummaryText) },
    ],
    reproduction_commands: ["bun fixture graph-audit --mode enforce"],
  };
  const graphManifestText = `${JSON.stringify(graphManifest)}\n`;

  const auditPin = (path: string, text: string, rowCount?: number) => ({
    path,
    bytes: Buffer.byteLength(text),
    sha256: sha256(text),
    ...(rowCount === undefined ? {} : { row_count: rowCount }),
  });
  const physicalRoot = "data/quality/relationship-integrity/occurrence-treatment-physicality";
  const phaseRoot = "data/quality/relationship-integrity/operational-occurrence-phases";
  const physicalManifestPath = `${physicalRoot}/manifest.json`;
  const physicalSummaryPath = `${physicalRoot}/summary.json`;
  const phaseManifestPath = `${phaseRoot}/manifest.json`;
  const phaseSummaryPath = `${phaseRoot}/summary.json`;
  const physicalPolicyPath = "data/contracts/occurrence-treatment-physicality/v1/policy.json";
  const physicalLedgerPath =
    "data/contracts/occurrence-treatment-physicality/v1/review-ledger.jsonl";
  const physicalContractPath = "data/contracts/occurrence-treatment-physicality/v1/contract.json";
  const physicalCompletenessManifestPath =
    "data/quality/relationship-integrity/completeness/manifest.json";
  const physicalCompletenessRowsPath =
    "data/quality/relationship-integrity/completeness/occurrence-completeness.jsonl";
  const phaseContractPath = "data/contracts/operational-occurrence-phases/v1/contract.json";
  const phaseLedgerPath = "data/contracts/operational-occurrence-phases/v1/review-ledger.jsonl";
  const physicalPolicyText = `${JSON.stringify({ schema_version: 1, fixture: true })}\n`;
  const physicalLedgerText = `${JSON.stringify({ fixture: true })}\n`;
  const physicalContractText = `${JSON.stringify({ schema_version: 1, fixture: true })}\n`;
  const physicalCompletenessManifestText = `${JSON.stringify({ schema_version: 1, fixture: true })}\n`;
  const physicalCompletenessRowsText = eligibleRows
    .map((entry) => JSON.stringify({ occurrence_id: entry.occurrence_id }))
    .join("\n")
    .concat(eligibleRows.length === 0 ? "" : "\n");
  const phaseContractText = `${JSON.stringify({ schema_version: 1, fixture: true })}\n`;
  const phaseLedgerText = `${JSON.stringify({ occurrence_id: row.occurrence_id })}\n`;
  const physicalFindingsText = "";
  const physicalOccurrenceAuditText = eligibleRows
    .map((entry) => JSON.stringify({ occurrence_id: entry.occurrence_id }))
    .join("\n")
    .concat(eligibleRows.length === 0 ? "" : "\n");
  const physicalTreatmentAuditText = treatmentMembers
    .map((entry) => JSON.stringify({ treatment_record_id: entry.treatment_record_id }))
    .join("\n")
    .concat(treatmentMembers.length === 0 ? "" : "\n");
  const physicalReportText = "# Fixture physical audit\n";
  const exactPhysicalCount = eligibleRows.filter(
    (entry) => entry.physical_scope_record_ids.length > 0,
  ).length;
  const treatmentFamilyRows = new Map<
    string,
    { ids: Set<string>; occurrenceMembershipCount: number }
  >();
  for (const member of treatmentMembers) {
    const current = treatmentFamilyRows.get(member.treatment_family) ?? {
      ids: new Set<string>(),
      occurrenceMembershipCount: 0,
    };
    current.ids.add(member.treatment_record_id);
    current.occurrenceMembershipCount += 1;
    treatmentFamilyRows.set(member.treatment_family, current);
  }
  const physicalClassification =
    exactPhysicalCount > 0
      ? "physical_corridor_or_segment_intervention"
      : "nonphysical_service_operations_policy_control";
  const physicalSummary = {
    schema_version: 1,
    eligible_occurrence_count: eligibleRows.length,
    unique_treatment_count: uniqueTreatmentIds.length,
    treatment_membership_count: treatmentMembers.length,
    classification_counts: {
      physical_corridor_or_segment_intervention:
        exactPhysicalCount > 0 ? uniqueTreatmentIds.length : 0,
      nonphysical_service_operations_policy_control:
        exactPhysicalCount > 0 ? 0 : uniqueTreatmentIds.length,
      point_or_stop_physical_intervention: 0,
      review_required: 0,
    },
    scope_requirement_counts: {
      corridor_or_segment_required: exactPhysicalCount > 0 ? uniqueTreatmentIds.length : 0,
      not_applicable: exactPhysicalCount > 0 ? 0 : uniqueTreatmentIds.length,
      point_or_stop_required: 0,
      review_required: 0,
    },
    occurrence_disposition_counts: {
      physical_scope_satisfied: exactPhysicalCount,
      physical_scope_missing: 0,
      physical_scope_relation_missing: 0,
      physical_scope_evidence_missing: 0,
      physical_scope_relation_invalid: 0,
      physicality_review_required: 0,
      physical_scope_not_applicable: eligibleRows.length - exactPhysicalCount,
    },
    finding_counts: {},
    review_ledger_complete: true,
    physical_scope_complete: true,
    hard_mode_ready: input.physicalAuditNotReady ? false : true,
    release_id: "v1-fixture-audit",
    review_stage: "final_post_semantic_release",
    release_manifest_sha256: "b".repeat(64),
    review_ledger_sha256: sha256(physicalLedgerText),
    policy_sha256: sha256(physicalPolicyText),
    contract_sha256: sha256(physicalContractText),
    by_treatment_family: Object.fromEntries(
      [...treatmentFamilyRows.entries()]
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([family, value]) => [
          family,
          {
            unique_treatment_count: value.ids.size,
            occurrence_membership_count: value.occurrenceMembershipCount,
            classifications: { [physicalClassification]: value.ids.size },
          },
        ]),
    ),
    final_post_semantic_release_guard_ready: true,
  };
  const physicalSummaryText = `${JSON.stringify(physicalSummary)}\n`;
  const physicalManifest = {
    schema_version: 1,
    contract_id: "occurrence-treatment-physicality-v1",
    release_id: "v1-fixture-audit",
    review_stage: "final_post_semantic_release",
    input_pins: [
      {
        path: "data/exports/releases/v1-fixture-audit/manifest.json",
        bytes: 1,
        sha256: "b".repeat(64),
      },
      {
        ...auditPin(
          "data/exports/releases/v1-fixture-audit/operational_occurrences.jsonl",
          occurrenceText,
          1,
        ),
        ...(input.physicalOccurrencePinMismatch ? { sha256: "f".repeat(64) } : {}),
      },
      auditPin(
        "data/exports/releases/v1-fixture-audit/treatment_components.jsonl",
        treatmentComponentsText,
        treatmentRecordCount,
      ),
      auditPin(
        "data/exports/releases/v1-fixture-audit/relations.jsonl",
        canonicalRelationsText,
        relationRecordCount,
      ),
      auditPin(
        "data/exports/releases/v1-fixture-audit/corridors.jsonl",
        corridorsText,
        corridorRecordCount,
      ),
      auditPin(physicalCompletenessManifestPath, physicalCompletenessManifestText),
      auditPin(physicalCompletenessRowsPath, physicalCompletenessRowsText, eligibleRows.length),
      auditPin(physicalPolicyPath, physicalPolicyText),
      auditPin(physicalLedgerPath, physicalLedgerText, 1),
      auditPin(physicalContractPath, physicalContractText),
    ],
    files: {
      "findings.jsonl": auditPin(`${physicalRoot}/findings.jsonl`, physicalFindingsText, 0),
      "occurrence-audit.jsonl": auditPin(
        `${physicalRoot}/occurrence-audit.jsonl`,
        physicalOccurrenceAuditText,
        eligibleRows.length,
      ),
      "report.md": auditPin(`${physicalRoot}/report.md`, physicalReportText),
      "summary.json": {
        ...auditPin(physicalSummaryPath, physicalSummaryText),
        ...(input.physicalSummaryPinMismatch ? { sha256: "f".repeat(64) } : {}),
      },
      "treatment-audit.jsonl": auditPin(
        `${physicalRoot}/treatment-audit.jsonl`,
        physicalTreatmentAuditText,
        treatmentMembers.length,
      ),
    },
    audit_fingerprint: "",
  };
  physicalManifest.audit_fingerprint = canonicalDigest({
    schema_version: physicalManifest.schema_version,
    release_id: physicalManifest.release_id,
    review_stage: physicalManifest.review_stage,
    input_pins: physicalManifest.input_pins,
    files: physicalManifest.files,
  });
  if (input.physicalAuditFingerprintMismatch) {
    physicalManifest.audit_fingerprint = "0".repeat(64);
  }
  const physicalManifestText = `${JSON.stringify(physicalManifest)}\n`;

  const phaseRelationIds = [...new Set(row.phase_relation_record_ids)];
  const phaseCandidatesText = phaseRelationIds
    .map((recordId) => JSON.stringify({ relation_record_id: recordId }))
    .join("\n")
    .concat(phaseRelationIds.length === 0 ? "" : "\n");
  const phaseFindingsText = "";
  const phaseReportText = "# Fixture phase audit\n";
  const occurrenceCanonicalSha256 = canonicalDigest([row]);
  const phaseProjectionSha256 = canonicalDigest({
    phase_record_ids: row.phase_record_ids,
    phase_relation_record_ids: row.phase_relation_record_ids,
  });
  const singlePhaseCount = row.phase_relation_disposition === "single_phase" ? 1 : 0;
  const relatedPhaseCount = 1 - singlePhaseCount;
  const phaseSummary = {
    schema_version: 1,
    contract_id: "operational-occurrence-phase-review-v1",
    occurrence_count: 1,
    eligible_occurrence_count: eligibleRows.length,
    ineligible_occurrence_count: 1 - eligibleRows.length,
    phase_identity_membership_count: row.phase_record_ids.length,
    unique_phase_event_count: new Set(row.phase_record_ids).size,
    projected_phase_relation_count: phaseRelationIds.length,
    checked_event_event_candidate_count: phaseRelationIds.length,
    counts_by_primary_disposition: {
      single_observed_phase_no_related_phase_asserted: singlePhaseCount,
      evidence_bound_related_phases: relatedPhaseCount,
      review_required: 0,
    },
    counts_by_candidate_disposition: {
      projected_reviewed_phase_relation: phaseRelationIds.length,
      not_projected_external_event_not_selected: 0,
      not_projected_non_phase_semantics: 0,
      review_required_unprojected_same_occurrence_temporal_relation: 0,
    },
    finding_counts: {},
    phase_identity_complete: true,
    phase_relation_or_disposition_complete: true,
    exact_evidence_complete: true,
    hard_mode_ready: true,
    ledger_id: "operational-occurrence-phase-review-ledger-v1",
    release_id: "v1-fixture-audit",
    reviewed_occurrence_count: 1,
    single_observed_phase_count: singlePhaseCount,
    related_phase_count: relatedPhaseCount,
    unresolved_phase_count: 0,
    missing_evidence_count: 0,
    ambiguous_phase_count: 0,
    review_complete: true,
    violation_count: input.phaseAuditViolation ? 1 : 0,
    content_hashes: {
      review_ledger_sha256: sha256(phaseLedgerText),
      event_event_candidates_sha256: sha256(phaseCandidatesText),
      findings_sha256: sha256(phaseFindingsText),
      operational_occurrences_sha256: occurrenceCanonicalSha256,
      canonical_phase_projection_sha256: phaseProjectionSha256,
    },
  };
  const phaseSummaryText = `${JSON.stringify(phaseSummary)}\n`;
  const phaseManifest = {
    schema_version: 1,
    contract_id: "operational-occurrence-phase-review-v1",
    generated_at: "2026-07-17T00:00:00.000Z",
    generated_by: "fixture",
    route_anchor_release: {
      release_id: "v1-fixture-audit",
      manifest: {
        path: "data/exports/releases/v1-fixture-audit/manifest.json",
        bytes: 1,
        sha256: "b".repeat(64),
      },
      route_anchors: {
        path: "data/exports/releases/v1-fixture-audit/route_anchors.jsonl",
        bytes: 0,
        sha256: sha256(""),
        row_count: 0,
      },
      operational_occurrences: {
        ...auditPin(
          "data/exports/releases/v1-fixture-audit/operational_occurrences.jsonl",
          occurrenceText,
          1,
        ),
        ...(input.phaseOccurrencePinMismatch ? { sha256: "f".repeat(64) } : {}),
      },
    },
    input_aggregates: {},
    derived_inputs: {
      canonical_record_count: canonicalRecordCount,
      operational_occurrence_count: 1,
      operational_occurrences_sha256: occurrenceCanonicalSha256,
      relevant_canonical_record_count: 1,
      canonical_phase_projection_sha256: phaseProjectionSha256,
    },
    outputs: {
      [phaseContractPath]: auditPin(phaseContractPath, phaseContractText),
      [phaseLedgerPath]: auditPin(phaseLedgerPath, phaseLedgerText, 1),
      [`${phaseRoot}/event-event-candidates.jsonl`]: auditPin(
        `${phaseRoot}/event-event-candidates.jsonl`,
        phaseCandidatesText,
        phaseRelationIds.length,
      ),
      [`${phaseRoot}/findings.jsonl`]: auditPin(
        `${phaseRoot}/findings.jsonl`,
        phaseFindingsText,
        0,
      ),
      [`${phaseRoot}/report.md`]: auditPin(`${phaseRoot}/report.md`, phaseReportText),
      [phaseSummaryPath]: auditPin(phaseSummaryPath, phaseSummaryText),
    },
    reproduction_command: "bun fixture phase-audit --check",
  };
  const phaseManifestText = `${JSON.stringify(phaseManifest)}\n`;
  const auditArtifactTexts = [
    [physicalManifestPath, physicalManifestText],
    [physicalPolicyPath, physicalPolicyText],
    [physicalLedgerPath, physicalLedgerText],
    [physicalContractPath, physicalContractText],
    [physicalCompletenessManifestPath, physicalCompletenessManifestText],
    [physicalCompletenessRowsPath, physicalCompletenessRowsText],
    [`${physicalRoot}/findings.jsonl`, physicalFindingsText],
    [`${physicalRoot}/occurrence-audit.jsonl`, physicalOccurrenceAuditText],
    [`${physicalRoot}/report.md`, physicalReportText],
    [`${physicalRoot}/treatment-audit.jsonl`, physicalTreatmentAuditText],
    [phaseManifestPath, phaseManifestText],
    [phaseContractPath, phaseContractText],
    [phaseLedgerPath, phaseLedgerText],
    [`${phaseRoot}/event-event-candidates.jsonl`, phaseCandidatesText],
    [`${phaseRoot}/findings.jsonl`, phaseFindingsText],
    [`${phaseRoot}/report.md`, phaseReportText],
  ] as const;
  const activeSourceTexts = new Map<string, string>([
    ["data/quality/relationship-integrity/graph-audit/findings.jsonl", graphFindingsText],
    ["data/quality/relationship-integrity/graph-audit/manifest.json", graphManifestText],
    ["data/quality/relationship-integrity/graph-audit/orphan-records.jsonl", graphOrphansText],
    [
      "data/quality/relationship-integrity/graph-audit/relation-audit.jsonl",
      graphRelationAuditText,
    ],
    ["data/quality/relationship-integrity/graph-audit/report.md", graphReportText],
    [graphPath, graphSummaryText],
    [physicalSummaryPath, physicalSummaryText],
    [phaseSummaryPath, phaseSummaryText],
  ]);
  const gateSourcePins = new Map<string, { role: string; path: string }>();
  for (const sources of Object.values(RELATIONSHIP_GATE_SOURCES)) {
    for (const [role, path] of sources) {
      gateSourcePins.set(path, { role, path });
      if (!activeSourceTexts.has(path)) {
        activeSourceTexts.set(
          path,
          `${JSON.stringify({ schema_version: 1, role, fixture: true })}\n`,
        );
      }
    }
  }
  const activeSources = [...gateSourcePins.values()]
    .toSorted(
      (left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path),
    )
    .map((source) => {
      const text = activeSourceTexts.get(source.path);
      if (text === undefined) throw new Error(`fixture source text missing: ${source.path}`);
      return { ...source, text };
    });
  const archivedSources = activeSources.map((source) => ({
    ...source,
    sourcePath: `${archiveRoot}/sources/${source.role}${source.path.endsWith(".jsonl") ? ".jsonl" : ".json"}`,
  }));
  let prePromotionSources = activeSources.map((source, index) => {
    const archive = archivedSources[index];
    if (archive === undefined) throw new Error("fixture archive source missing");
    return {
      role: source.role,
      path: source.path,
      sha256: sha256(source.text),
      archive_path: archive.sourcePath,
      ...(RELATIONSHIP_REFRESH_ROLES.has(source.role)
        ? { transition_fingerprint: transitionFingerprint(source.role, source.text) }
        : {}),
    };
  });
  if (input.transitionFingerprintMismatch) {
    prePromotionSources = prePromotionSources.map((source) =>
      source.role === "graph_audit_summary"
        ? { ...source, transition_fingerprint: "f".repeat(64) }
        : source,
    );
  }
  const currentGateArtifacts = RELATIONSHIP_GATE_IDS.map((gateId) => {
    const sourcePath = `data/contracts/relationships/v1/enforcement-gates/${gateId}.json`;
    const sources = RELATIONSHIP_GATE_SOURCES[gateId].map(([role, path]) => {
      const text = activeSourceTexts.get(path);
      if (text === undefined) throw new Error(`fixture gate source missing: ${path}`);
      return { role, path, sha256: sha256(text) };
    });
    const value = {
      schema_version: 1,
      artifact_id: `relationship-contract-v1-enforcement-gate:${gateId}`,
      contract_id: "relationship-contract-v1",
      gate_id: gateId,
      reviewed_at: "2026-07-17T00:00:00.000Z",
      reviewed_by: "fixture",
      source_count: sources.length,
      source_artifacts: sources,
      derived_violation_count: 0,
    };
    const text = `${JSON.stringify(value)}\n`;
    return { role: `enforcement_gate:${gateId}`, sourcePath, value, text };
  });
  const previousGateArtifacts = currentGateArtifacts.map((gate) => ({
    ...gate,
    role: `artifact:${archiveRoot}/gates/${gate.value.gate_id}.json`,
    sourcePath: `${archiveRoot}/gates/${gate.value.gate_id}.json`,
  }));
  let invariantArtifacts = [
    {
      role: "canonical_relations",
      path: "data/canonical/relations.jsonl",
      sha256: "a".repeat(64),
    },
    {
      role: "determinism_consumer_summary",
      path: "data/quality/relationship-integrity/determinism-consumer/summary.json",
      sha256: sha256(
        activeSourceTexts.get(
          "data/quality/relationship-integrity/determinism-consumer/summary.json",
        ) ?? "",
      ),
    },
    { role: "final_endpoint_matrix", path: endpointPath, sha256: canonicalDigest(endpoint) },
    {
      role: "reviewed_release_manifest",
      path: "data/exports/releases/v1-rc21/manifest.json",
      sha256: "b".repeat(64),
    },
  ];
  if (input.transitionMissingRole) invariantArtifacts = invariantArtifacts.slice(0, -1);
  if (input.transitionDuplicateRole) {
    const firstInvariant = invariantArtifacts[0];
    if (firstInvariant === undefined) throw new Error("fixture invariant is missing");
    invariantArtifacts = [...invariantArtifacts, firstInvariant];
  }
  if (input.transitionInvariantDigestMismatch) {
    invariantArtifacts = invariantArtifacts.map((pin) =>
      pin.role === "determinism_consumer_summary" ? { ...pin, sha256: "f".repeat(64) } : pin,
    );
  }
  const refreshArtifacts = [
    { role: "canonical_db", path: "data/canonical.db", sha256: "c".repeat(64) },
    ...prePromotionSources.filter((source) => RELATIONSHIP_REFRESH_ROLES.has(source.role)),
  ];
  const transition = {
    schema_version: 1,
    receipt_id: "relationship-contract-v1-enforcement-transition",
    contract_id: "relationship-contract-v1",
    transition: { from_state: "warning_ready", to_state: "enforced_refresh_required" },
    promoted_at: "2026-07-17T00:00:00.000Z",
    promoted_by: "fixture",
    previous_proof: {
      path: previousProofPath,
      proof_stage: "pre_promotion_warning",
      sha256: input.transitionPreviousProofMismatch
        ? "f".repeat(64)
        : canonicalDigest(previousProof),
    },
    previous_gates: previousGateArtifacts.map((gate) => ({
      gate_id: gate.value.gate_id,
      path: gate.sourcePath,
      sha256: sha256(gate.text),
    })),
    pre_promotion_sources: prePromotionSources,
    refresh_artifacts: refreshArtifacts,
    invariant_artifacts: invariantArtifacts,
    final_matrix: {
      path: endpointPath,
      relation_count: 1,
      relation_ids_sha256: matrixIdsSha,
      sha256: canonicalDigest(endpoint),
      tuple_count: 1,
      tuple_set_sha256: tupleSetSha,
    },
  };
  const proof = {
    schema_version: 2,
    proof_id: "relationship-contract-v1-enforcement-proof",
    contract_id: "relationship-contract-v1",
    proof_stage: "post_promotion_enforced",
    validation_mode: "enforce",
    proof_status: "ready",
    reviewed_at: "2026-07-17T00:00:00.000Z",
    reviewed_by: "fixture",
    all_gates_ready: true,
    gate_count: RELATIONSHIP_GATE_IDS.length,
    total_violation_count: 0,
    final_matrix: {
      path: endpointPath,
      relation_count: 1,
      relation_ids_sha256: matrixIdsSha,
      sha256: canonicalDigest(endpoint),
      tuple_count: 1,
      tuple_set_sha256: tupleSetSha,
    },
    gates: currentGateArtifacts.map((gate) => ({
      gate_id: gate.value.gate_id,
      artifact_path: gate.sourcePath,
      artifact_sha256: sha256(gate.text),
      criteria: ["fixture"],
      status: "ready",
      violation_count: 0,
    })),
    previous_proof: {
      path: previousProofPath,
      proof_stage: "pre_promotion_warning",
      sha256: canonicalDigest(previousProof),
    },
    transition_receipt: {
      path: transitionPath,
      sha256: canonicalDigest(transition),
    },
  };
  const contract = {
    ...(input.extraContractKey ? { excess: true } : {}),
    schema_version: 1,
    contract_id: "relationship-contract-v1",
    contract_status: "enforced",
    enforcement_state: "enforced_ready",
    reviewed_at: "2026-07-17T00:00:00.000Z",
    reviewed_by: "fixture",
    ...RELATIONSHIP_CONTRACT_POLICY_V1,
    ...(input.weakenedContractPolicy
      ? {
          evidence_policy: {
            ...RELATIONSHIP_CONTRACT_POLICY_V1.evidence_policy,
            hash_required: false,
          },
        }
      : {}),
    endpoint_matrix: {
      matrix_kind: "post_remediation_reviewed",
      new_shape_policy: "error",
      obsolete_baseline_tuple_policy: "reject",
      path: endpointPath,
      relation_count: 1,
      relation_ids_sha256: matrixIdsSha,
      sha256: canonicalDigest(endpoint),
      tuple_count: 1,
      tuple_set_sha256: tupleSetSha,
      unlisted_relation_policy: "error",
    },
    enforcement_proof: {
      path: proofPath,
      required_gate_ids: [...RELATIONSHIP_GATE_IDS],
      sha256: canonicalDigest(proof),
      transition_receipt: {
        path: transitionPath,
        sha256: canonicalDigest(transition),
      },
    },
  };
  const relationshipArtifacts: Array<{
    role: string;
    sourcePath: string;
    text: string;
  }> = [
    {
      role: "relationship_contract",
      sourcePath: contractPath,
      text: `${JSON.stringify(contract)}\n`,
    },
    { role: "enforcement_proof", sourcePath: proofPath, text: `${JSON.stringify(proof)}\n` },
    {
      role: "enforcement_transition_receipt",
      sourcePath: transitionPath,
      text: `${JSON.stringify(transition)}\n`,
    },
    {
      role: "endpoint_type_matrix",
      sourcePath: endpointPath,
      text: `${JSON.stringify(endpoint)}\n`,
    },
    {
      role: `artifact:${previousProofPath}`,
      sourcePath: previousProofPath,
      text: `${JSON.stringify(previousProof)}\n`,
    },
    ...currentGateArtifacts.map((gate) => ({
      role: gate.role,
      sourcePath: gate.sourcePath,
      text: gate.text,
    })),
    ...previousGateArtifacts.map((gate) => ({
      role: gate.role,
      sourcePath: gate.sourcePath,
      text: gate.text,
    })),
    ...auditArtifactTexts.map(([sourcePath, text]) => ({
      role: `artifact:${sourcePath}`,
      sourcePath,
      text,
    })),
    ...activeSources.map((source) => ({
      role: source.role.startsWith("graph_audit_") ? source.role : `artifact:${source.path}`,
      sourcePath: source.path,
      text: source.text,
    })),
    ...[
      {
        sourcePath: "data/quality/relationship-integrity/graph-audit/orphan-records.jsonl",
        text: graphOrphansText,
      },
      {
        sourcePath: "data/quality/relationship-integrity/graph-audit/relation-audit.jsonl",
        text: graphRelationAuditText,
      },
      {
        sourcePath: "data/quality/relationship-integrity/graph-audit/report.md",
        text: graphReportText,
      },
    ].map((artifact) => ({ role: `artifact:${artifact.sourcePath}`, ...artifact })),
    ...archivedSources.map((source) => ({
      role: `artifact:${source.sourcePath}`,
      sourcePath: source.sourcePath,
      text: source.text,
    })),
  ];
  if (input.extraBundleArtifactText !== undefined) {
    relationshipArtifacts.push({
      role: "artifact:data/quality/fixture-extra.json",
      sourcePath: "data/quality/fixture-extra.json",
      text: input.extraBundleArtifactText,
    });
  }
  const sortedRelationshipArtifacts = relationshipArtifacts.toSorted((left, right) =>
    left.role.localeCompare(right.role),
  );
  for (const artifact of sortedRelationshipArtifacts) {
    const path = join(releaseDirectory, "relationship-integrity", artifact.sourcePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, artifact.text, "utf8");
  }
  const bundleArtifacts = sortedRelationshipArtifacts.map((artifact) => ({
    role: artifact.role,
    source_path: artifact.sourcePath,
    release_path: `relationship-integrity/${artifact.sourcePath}`,
    bytes: Buffer.byteLength(artifact.text),
    sha256: sha256(artifact.text),
  }));
  const descriptorValue = {
    schema_version: 1,
    bundle_id: "relationship-integrity-v1",
    contract_id: "relationship-contract-v1",
    validation_mode: "enforce",
    artifacts: bundleArtifacts.map(({ role, source_path, bytes, sha256: digest }) => ({
      role,
      source_path,
      bytes,
      sha256: digest,
    })),
  };
  const descriptorText = `${canonicalJson(descriptorValue)}\n`;
  const bundle = {
    schema_version: 1,
    bundle_id: "relationship-integrity-v1",
    contract_id: "relationship-contract-v1",
    validation_mode: "enforce",
    artifact_count: bundleArtifacts.length,
    descriptor: {
      source_path: "data/contracts/relationships/v1/release-bundle-sources.json",
      bytes: Buffer.byteLength(descriptorText),
      sha256: sha256(descriptorText),
    },
    artifacts: bundleArtifacts,
  };
  const bundleText = `${JSON.stringify(bundle)}\n`;

  const legacyFiles = {
    "operational_anchors.jsonl": "",
    "operational_anchors_summary.json": "{}\n",
    "operational_anchor_review_decisions.json": "{}\n",
    "treatment_components.jsonl": treatmentComponentsText,
    "relations.jsonl": canonicalRelationsText,
    "corridors.jsonl": corridorsText,
  };
  const releaseFiles: Record<string, string> = {
    ...legacyFiles,
    [occurrencePointer]: occurrenceText,
    [summaryPointer]: summaryText,
    [reviewPointer]: reviewText,
    [bundlePointer]: bundleText,
    ...Object.fromEntries(
      sortedRelationshipArtifacts.map((artifact) => [
        `relationship-integrity/${artifact.sourcePath}`,
        artifact.text,
      ]),
    ),
  };
  for (const [pointer, text] of Object.entries({
    ...legacyFiles,
    [occurrencePointer]: occurrenceText,
    [summaryPointer]: summaryText,
    [reviewPointer]: reviewText,
    [bundlePointer]: bundleText,
  })) {
    await writeFile(join(releaseDirectory, pointer), text, "utf8");
  }
  const manifest = {
    manifest_version: 4,
    release_id: releaseId,
    generator_commit: "4".repeat(40),
    contract_versions: {
      operational_anchors: 1,
      operational_anchor_review_decisions: 1,
      operational_occurrences: input.occurrenceContractVersion ?? 2,
      operational_occurrence_review_decisions: 1,
      relationship_integrity_bundle: 1,
    },
    record_counts: {
      event: eventRecordCount,
      treatment_component: treatmentRecordCount,
      relation: relationRecordCount,
      corridor: corridorRecordCount,
    },
    files: Object.fromEntries(
      Object.entries(releaseFiles).map(([pointer, text]) => [
        pointer,
        { bytes: Buffer.byteLength(text), sha256: sha256(text) },
      ]),
    ),
    pointers: {
      operational_anchors: "operational_anchors.jsonl",
      operational_anchor_summary: "operational_anchors_summary.json",
      operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
      operational_occurrences: occurrencePointer,
      operational_occurrence_summary: summaryPointer,
      operational_occurrence_review_decisions: reviewPointer,
      relationship_integrity_bundle: bundlePointer,
      route_anchors: null,
      taxonomy: null,
      quality_report: null,
    },
  };
  const manifestText = `${JSON.stringify(manifest)}\n`;
  const manifestPath = join(releaseDirectory, "manifest.json");
  await writeFile(manifestPath, manifestText, "utf8");
  const firstGate = sortedRelationshipArtifacts.find((artifact) =>
    artifact.role.startsWith("enforcement_gate:"),
  );
  if (firstGate === undefined) throw new Error("fixture needs a relationship gate");
  return {
    root,
    releaseId,
    releaseDirectory,
    legacyAnchorPath: join(releaseDirectory, "operational_anchors.jsonl"),
    occurrencePath: join(releaseDirectory, occurrencePointer),
    summaryPath: join(releaseDirectory, summaryPointer),
    reviewPath: join(releaseDirectory, reviewPointer),
    manifestPath,
    manifestSha256: sha256(manifestText),
    relationshipBundlePath: join(releaseDirectory, bundlePointer),
    relationshipContractPath: join(releaseDirectory, "relationship-integrity", contractPath),
    firstGatePath: join(releaseDirectory, "relationship-integrity", firstGate.sourcePath),
  };
}

async function withFixtureV4<T>(
  input: Parameters<typeof writeReleaseFixtureV4>[0],
  run: (fixture: ReleaseFixtureV4) => Promise<T>,
): Promise<T> {
  const fixture = await writeReleaseFixtureV4(input);
  try {
    return await run(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

async function importFixtureV4(
  fixture: ReleaseFixtureV4,
): Promise<MtaWikiOperationalOccurrenceImportArtifactV4> {
  const artifact = await runMtaWikiOperationalOccurrenceImport({
    mtaWikiRoot: fixture.root,
    wikiRelease: fixture.releaseId,
    wikiManifestSha256: fixture.manifestSha256,
    output: join(fixture.root, "import-v4.json"),
  });
  if (artifact.artifactKind !== "bp.studio.mta_wiki_operational_occurrences.v4") {
    throw new Error("v4 fixture unexpectedly produced a legacy import artifact");
  }
  return artifact;
}

type ReleaseFixtureV5 = ReleaseFixtureV4 & {
  routeIdentityPath: string;
  retirementSourcePath: string;
  retirementArchivePath: string;
  retirementSourcePointer: string;
  retirementArchivePointer: string;
};

type FixtureManifestJson = {
  manifest_version: number;
  contract_versions: Record<string, number>;
  files: Record<string, { bytes: number; sha256: string }>;
  pointers: {
    operational_occurrence_review_decisions: string;
    route_anchors: string | null;
    route_identity_snapshot?: string;
    taxonomy: string | null;
  } & Record<string, unknown>;
};

type FixtureReviewV2Json = {
  source_decision_count: number;
  retirements: Array<{
    binding: { source_route_id: string };
    target: { occurrence_id: string };
    future_disposition?: string;
  }>;
};

function skeletalRouteIdentityRetirementSnapshot() {
  const fixedSha = "0".repeat(64);
  const metadata = (path: string, rows = 0) => ({
    path,
    sha256: fixedSha,
    bytes: 0,
    rows,
  });
  const currentCatalog = {
    contract_version: 1,
    dataset_id: "h2wf-afav",
    artifact_sha256: fixedSha,
    effective_as_of_date: "2026-07-18",
    catalog_routes: metadata("catalog_routes.jsonl"),
    catalog_gtfs_disagreements: metadata("catalog_gtfs_disagreements.jsonl", 1),
    catalog_identity_count: 0,
    catalog_only_count: 0,
    gtfs_only_count: 1,
  };
  const components = [
    "mta-bus-company",
    "nyct-bronx",
    "nyct-brooklyn",
    "nyct-manhattan",
    "nyct-queens",
    "nyct-staten-island",
  ].map((componentFeedId) => ({
    component_feed_id: componentFeedId,
    dataset_id: componentFeedId === "mta-bus-company" ? "mta-bus-company" : "mta-nyct-bus",
    official_url: `https://rrgtfsfeeds.s3.amazonaws.com/${componentFeedId}.zip`,
    archive_sha256: fixedSha,
    feed_version: `fixture-${componentFeedId}`,
    publisher: "MTA New York City Transit",
    feed_start_date: "2026-06-28",
    feed_end_date: "2026-09-05",
    reliable_interval_start: "2026-06-28",
    reliable_interval_end: "2026-09-05",
    agency_timezone: "America/New_York",
    frequencies_present: false,
    conditional_location_files_present: false,
    files: {},
  }));
  const serviceIdentity = {
    dataset_id: "mta-bus-company",
    component_feed_ids: ["mta-bus-company"],
    source_route_id: "Q06",
    gtfs_route_id: "Q06",
    agency_id: "MTABC",
    raw_route_type: "3",
    route_family_id: "Q6",
    route_short_name: "Q6",
    route_long_name: "Jamaica - Long Island City",
    route_desc: "via Queens Blvd",
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
    designation_literals: ["route_type:Local"],
    normalized_service_modes: ["local"],
    display_label: "Q6",
    display_label_source: "gtfs",
    reliable_interval_start: "2026-06-28",
    reliable_interval_end: "2026-09-05",
    reliable_interval_derivation: "component_feed_bounds_intersection_v1",
    label_fallback: null,
    label_diff: null,
    snapshot_id: "mta-bus-2026-07-18-route-provenance-v1",
  };
  const binding = {
    route_record_id: "route_q6-ace",
    route_family_id: "Q6",
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
    evidence_ids: ["source:official#q6"],
    canonical_record_fingerprint: fixedSha,
    identity_basis: "reviewed_exact_mapping",
    expected_gtfs_identity_fingerprint: fixedSha,
    decision_kind: "current_ineligible",
    ineligibility_reasons: ["catalog_not_in_effect"],
    decision_id: "route-binding-v1:route_q6-ace",
    accepted_by: "fixture-owner",
    accepted_at: "2026-07-18T12:00:00.000Z",
    rationale: "Q06 is exact but not in the current route catalog.",
    reviewed_axes: ["identity_mapping"],
  };
  const gtfsSnapshot = {
    schema_version: 2,
    contract_id: "gtfs-route-reference-snapshot-v2",
    snapshot_id: "mta-bus-2026-07-18-route-provenance-v1",
    dataset_id: "mta-bus-static",
    captured_at: "2026-07-18T18:05:27Z",
    as_of_date: "2026-07-18",
    service_window_start: "2026-07-12",
    service_window_end: "2026-07-18",
    merge_policy: "shared-nyct-route-namespace-v1",
    id_remapping_policy: "component-feed-prefixed-foreign-keys-v1",
    current_catalog: currentCatalog,
    components,
    outputs: {},
    counts: {
      route_identity_count: 1,
      route_activity_count: 1,
      catalog_identity_count: 0,
      catalog_only_count: 0,
      gtfs_only_count: 1,
    },
  };
  return {
    schema_version: 1,
    contract_id: "route-identity-snapshot-v1",
    gtfs_snapshot_id: gtfsSnapshot.snapshot_id,
    gtfs_snapshot: gtfsSnapshot,
    gtfs_snapshot_sha256: sha256(`${canonicalJson(gtfsSnapshot)}\n`),
    reviewed_decision_sha256: sha256(`${canonicalJson(binding)}\n`),
    current_catalog: currentCatalog,
    service_identity_count: 1,
    service_identities_sha256: sha256(`${canonicalJson(serviceIdentity)}\n`),
    service_identities: [serviceIdentity],
    record_binding_count: 1,
    record_bindings_sha256: sha256(`${canonicalJson(binding)}\n`),
    record_bindings: [binding],
    expected_route_anchors_count: 0,
    expected_route_anchors_sha256: sha256(""),
  };
}

function routeIdentityRetirementSnapshot(
  input: { reviewedDecisionSha256?: string } = {},
): MtaWikiRouteIdentitySnapshot {
  const skeleton = skeletalRouteIdentityRetirementSnapshot();
  const snapshotId = skeleton.gtfs_snapshot.snapshot_id;
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
    artifact_sha256: sha256(`${catalogRoutesText}${catalogGtfsDisagreementsText}`),
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
    official_url: `https://rrgtfsfeeds.s3.amazonaws.com/${componentFeedId}.zip`,
    archive_sha256: sha256(componentFeedId),
    feed_version: `fixture-${componentFeedId}`,
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
  const components = [
    component("mta-bus-company", "mta-bus-company"),
    component("nyct-bronx", "mta-nyct-bus"),
    component("nyct-brooklyn", "mta-nyct-bus"),
    component("nyct-manhattan", "mta-nyct-bus"),
    component("nyct-queens", "mta-nyct-bus"),
    component("nyct-staten-island", "mta-nyct-bus"),
  ];
  const scheduledServiceDates = [
    "2026-07-12",
    "2026-07-13",
    "2026-07-14",
    "2026-07-15",
    "2026-07-16",
    "2026-07-17",
    "2026-07-18",
  ];
  const q06Identity: MtaWikiRouteIdentitySnapshot["service_identities"][number] = {
    dataset_id: "mta-bus-company",
    component_feed_ids: ["mta-bus-company"],
    source_route_id: "Q06",
    gtfs_route_id: "Q06",
    agency_id: "MTABC",
    raw_route_type: "3",
    route_family_id: "Q06",
    route_short_name: "Q6",
    route_long_name: "Jamaica - Long Island City",
    route_desc: "via Queens Blvd",
    declared_in_feed: true,
    catalog_in_effect: "no",
    catalog_effective_as_of_date: "2026-07-18",
    reliability_status: "reliable",
    scheduled_in_window: "yes",
    scheduled_service_dates: scheduledServiceDates,
    scheduled_trip_template_date_count: 7,
    frequencies_present: false,
    designation_literals: ["route_type:Local"],
    normalized_service_modes: ["local"],
    display_label: "Q6",
    display_label_source: "gtfs",
    reliable_interval_start: "2026-06-28",
    reliable_interval_end: "2026-09-05",
    reliable_interval_derivation: "component_feed_bounds_intersection_v1",
    label_fallback: null,
    label_diff: null,
    snapshot_id: snapshotId,
  };
  const b1Identity: MtaWikiRouteIdentitySnapshot["service_identities"][number] = {
    dataset_id: "mta-nyct-bus",
    component_feed_ids: ["nyct-brooklyn"],
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
    scheduled_service_dates: scheduledServiceDates,
    scheduled_trip_template_date_count: 7,
    frequencies_present: false,
    designation_literals: ["route_type:Local"],
    normalized_service_modes: ["local"],
    display_label: "B1",
    display_label_source: "current_bus_routes",
    reliable_interval_start: "2026-06-28",
    reliable_interval_end: "2026-09-05",
    reliable_interval_derivation: "component_feed_bounds_intersection_v1",
    label_fallback: null,
    label_diff: null,
    snapshot_id: snapshotId,
  };
  const serviceIdentities = [q06Identity, b1Identity];
  const activeBinding: MtaWikiRouteIdentitySnapshot["record_bindings"][number] = {
    route_record_id: "route:b1",
    route_family_id: "B1",
    dataset_id: "mta-nyct-bus",
    component_feed_ids: ["nyct-brooklyn"],
    source_route_id: "B1",
    gtfs_route_id: "B1",
    service_variant: "local",
    identity_scope: "exact_service",
    service_class: "regular_mta_bus",
    record_temporal_scope: "current_description",
    projectable: true,
    presentation_primary: true,
    derivation: "deterministic_exact_route_id_v1",
    evidence_ids: ["source:official#b1"],
    canonical_record_fingerprint: "1".repeat(64),
    identity_basis: "deterministic_exact",
    expected_gtfs_identity_fingerprint: sha256(canonicalJson(b1Identity)),
    decision_kind: "current_primary",
    ineligibility_reasons: [],
  };
  const retiredBinding: MtaWikiRouteIdentitySnapshot["record_bindings"][number] = {
    route_record_id: "route_q6-ace",
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
    evidence_ids: ["source:official#q6"],
    canonical_record_fingerprint: "2".repeat(64),
    identity_basis: "reviewed_exact_mapping",
    expected_gtfs_identity_fingerprint: sha256(canonicalJson(q06Identity)),
    decision_kind: "current_ineligible",
    ineligibility_reasons: ["catalog_not_in_effect"],
    decision_id: "route-binding-v1:route_q6-ace",
    accepted_by: "fixture-owner",
    accepted_at: "2026-07-18T12:00:00.000Z",
    rationale: "Q06 is exact but not in the current route catalog.",
    reviewed_axes: ["identity_mapping"],
  };
  const recordBindings = [activeBinding, retiredBinding];
  const inventoryText = canonicalJsonl(serviceIdentities);
  const routeActivityText = canonicalJsonl([
    { route_id: "B1", scheduled_in_window: "yes" },
    { route_id: "Q06", scheduled_in_window: "yes" },
  ]);
  const gtfsSnapshot = {
    schema_version: 2 as const,
    contract_id: "gtfs-route-reference-snapshot-v2" as const,
    snapshot_id: snapshotId,
    dataset_id: "mta-bus-static" as const,
    captured_at: "2026-07-18T18:05:27Z",
    as_of_date: "2026-07-18",
    service_window_start: "2026-07-12",
    service_window_end: "2026-07-18",
    merge_policy: "shared-nyct-route-namespace-v1" as const,
    id_remapping_policy: "component-feed-prefixed-foreign-keys-v1" as const,
    current_catalog: currentCatalog,
    components,
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
    gtfs_snapshot_id: snapshotId,
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

type ReleaseFixtureV5Options = {
  activeRow?: OperationalOccurrenceRowV2;
  reviewedDecisionSha256?: string;
  routeAnchorsText?: string;
  routeBindingSha256?: string;
};

async function writeReleaseFixtureV5(
  input: ReleaseFixtureV5Options = {},
): Promise<ReleaseFixtureV5> {
  const fixture = await writeReleaseFixtureV4(
    input.activeRow === undefined ? {} : { row: input.activeRow },
  );
  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8")) as FixtureManifestJson;
  const review = JSON.parse(await readFile(fixture.reviewPath, "utf8")) as {
    decisions: unknown[];
  };
  const retired = occurrenceRow({
    id: "occurrence:q6-route-redesign-2025-08-31",
    routes: [{ route_record_id: "route_q6-ace", gtfs_route_id: "Q06" }],
  });
  const acceptedAt = "2026-07-18T20:00:00.000Z";
  const retirementId = "route-retirement:route_q6-ace";
  const retirementSourcePointer = `review-retirements/source/${retirementId}.json`;
  const retirementArchivePointer = `review-retirements/operational-occurrence/${retired.occurrence_review_decision_id}.json`;
  const routeIdentityPointer = "route_identity_snapshot.json";
  const routeAnchorsPointer = "route_anchors.jsonl";
  const taxonomyPointer = "taxonomy.json";
  const routeIdentity = routeIdentityRetirementSnapshot(
    input.reviewedDecisionSha256 === undefined
      ? {}
      : { reviewedDecisionSha256: input.reviewedDecisionSha256 },
  );
  const routeIdentityText = `${canonicalJson(routeIdentity)}\n`;
  const routeAnchorsText =
    input.routeAnchorsText ?? canonicalJsonl(reconstructedRouteAnchors(routeIdentity));
  const archive = {
    schema_version: 1,
    decision_id: retired.occurrence_review_decision_id,
    review_state: "approved",
    accepted_at: "2026-07-12T00:00:00.000Z",
    reviewer: "fixture-reviewer",
    rationale: "Exact fixture occurrence shape reviewed.",
    occurrence_id: retired.occurrence_id,
    founding_key: retired.founding_key,
    observation_event_record_ids: retired.provenance.event_record_ids,
    observation_relation_record_ids: retired.provenance.relation_record_ids,
    resolved_status: "realized",
    resolved_onset: {
      date: retired.resolved_onset.date,
      precision: retired.resolved_onset.precision,
      evidence_bindings: retired.resolved_onset.evidence_bindings,
    },
    routes: retired.routes,
    treatment_scope_kind: retired.treatment.kind,
    treatment: retired.treatment,
  };
  const archiveText = `${canonicalJson(archive)}\n`;
  const retiredRouteBinding = routeIdentity.record_bindings.find(
    (binding) => binding.route_record_id === "route_q6-ace",
  );
  if (retiredRouteBinding === undefined) {
    throw new Error("v5 occurrence fixture requires the retired Q06 route binding");
  }
  const bindingProjection = {
    route_record_id: "route_q6-ace",
    route_binding_decision_id: "route-binding-v1:route_q6-ace",
    route_binding_sha256:
      input.routeBindingSha256 ?? sha256(`${canonicalJson(retiredRouteBinding)}\n`),
    dataset_id: "mta-bus-company",
    source_route_id: "Q06",
    gtfs_route_id: "Q06",
    projectable: false,
    ineligibility_reasons: ["catalog_not_in_effect"],
  };
  const originalArtifact = {
    artifact_path: `data/operational-occurrence-review/accepted/decisions/${retired.occurrence_review_decision_id}.json`,
    bytes: Buffer.byteLength(archiveText),
    sha256: sha256(archiveText),
  };
  const retirementSource = {
    schema_version: 1,
    contract_id: "operational-review-projection-retirement-v1",
    retirement_id: retirementId,
    state: "accepted",
    accepted_by: "fixture-owner",
    accepted_at: acceptedAt,
    rationale: "The exact Q06 binding is not in the current route catalog.",
    route_identity_snapshot_id: routeIdentity.gtfs_snapshot_id,
    route_identity_snapshot_sha256: sha256(routeIdentityText),
    binding: bindingProjection,
    anchor_review_decisions: [],
    occurrence_review_decisions: [
      {
        review_contract: "operational-occurrence-review-v1",
        decision_id: retired.occurrence_review_decision_id,
        occurrence_id: retired.occurrence_id,
        founding_key: retired.founding_key,
        pinned_gtfs_route_ids: ["Q06"],
        projection_state: "retired",
        reason_code: "route_binding_nonprojectable",
        original_artifact: originalArtifact,
      },
    ],
  };
  const retirementSourceText = `${canonicalJson(retirementSource)}\n`;
  const retirementProjection = {
    retirement_id: retirementId,
    retirement_source: {
      release_path: retirementSourcePointer,
      bytes: Buffer.byteLength(retirementSourceText),
      sha256: sha256(retirementSourceText),
    },
    accepted_by: retirementSource.accepted_by,
    accepted_at: retirementSource.accepted_at,
    rationale: retirementSource.rationale,
    route_identity_snapshot_id: routeIdentity.gtfs_snapshot_id,
    route_identity_snapshot_sha256: sha256(routeIdentityText),
    binding: bindingProjection,
    target: {
      ...retirementSource.occurrence_review_decisions[0],
      original_artifact: {
        release_path: retirementArchivePointer,
        bytes: originalArtifact.bytes,
        sha256: originalArtifact.sha256,
      },
    },
  };
  const reviewV2 = {
    snapshot_version: 2,
    decision_schema_version: 1,
    source_decision_count: 2,
    decision_count: 1,
    decisions: review.decisions,
    retirement_schema_version: 1,
    retirement_count: 1,
    retirements: [retirementProjection],
  };
  const releaseFiles: Record<string, string> = {
    [manifest.pointers.operational_occurrence_review_decisions]: `${canonicalJson(reviewV2)}\n`,
    [routeIdentityPointer]: routeIdentityText,
    [routeAnchorsPointer]: routeAnchorsText,
    [taxonomyPointer]: "{}\n",
    [retirementSourcePointer]: retirementSourceText,
    [retirementArchivePointer]: archiveText,
  };
  for (const [pointer, text] of Object.entries(releaseFiles)) {
    const path = join(fixture.releaseDirectory, pointer);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
    manifest.files[pointer] = {
      bytes: Buffer.byteLength(text),
      sha256: sha256(text),
    };
  }
  manifest.manifest_version = 5;
  manifest.contract_versions = {
    ...manifest.contract_versions,
    operational_anchor_review_decisions: 2,
    operational_occurrence_review_decisions: 2,
    route_anchors: 1,
    route_identity_snapshot: 1,
  };
  manifest.pointers = {
    ...manifest.pointers,
    route_anchors: routeAnchorsPointer,
    route_identity_snapshot: routeIdentityPointer,
    taxonomy: taxonomyPointer,
  };
  const manifestText = `${JSON.stringify(manifest)}\n`;
  await writeFile(fixture.manifestPath, manifestText, "utf8");
  return {
    ...fixture,
    manifestSha256: sha256(manifestText),
    routeIdentityPath: join(fixture.releaseDirectory, routeIdentityPointer),
    retirementSourcePath: join(fixture.releaseDirectory, retirementSourcePointer),
    retirementArchivePath: join(fixture.releaseDirectory, retirementArchivePointer),
    retirementSourcePointer,
    retirementArchivePointer,
  };
}

async function repinFixtureV5Json(
  fixture: ReleaseFixtureV5,
  pointer: string,
  value: unknown,
): Promise<void> {
  const text = `${canonicalJson(value)}\n`;
  const path = join(fixture.releaseDirectory, pointer);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8")) as FixtureManifestJson;
  manifest.files[pointer] = { bytes: Buffer.byteLength(text), sha256: sha256(text) };
  const manifestText = `${JSON.stringify(manifest)}\n`;
  await writeFile(fixture.manifestPath, manifestText, "utf8");
  fixture.manifestSha256 = sha256(manifestText);
}

async function writeFixtureV5QuarantineStatus(fixture: ReleaseFixtureV5): Promise<void> {
  const recordPointer = `data/exports/release-status/${fixture.releaseId}.json`;
  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8")) as FixtureManifestJson;
  const routeIdentityMetadata = manifest.files["route_identity_snapshot.json"];
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
    reason: "The candidate collapsed B44+ into the B44 route family.",
    manifest_sha256: fixture.manifestSha256,
    failing_artifact: {
      path: "route_identity_snapshot.json",
      bytes: routeIdentityMetadata.bytes,
      sha256: routeIdentityMetadata.sha256,
      declared_contract_version: 1,
      detected_by_contract: "route-identity-snapshot-v1",
      detected_by_contract_version: 1,
      verifier_error: "B44 and B44+ must remain exact distinct route identities.",
    },
    affected_identities: [
      {
        identity_type: "route",
        gtfs_route_id: "B44",
        route_record_id: "route:b44-local",
        route_family_id: "B44",
      },
      {
        identity_type: "route",
        gtfs_route_id: "B44+",
        route_record_id: "route:b44-select",
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

async function withFixtureV5<T>(
  run: (fixture: ReleaseFixtureV5) => Promise<T>,
  input: ReleaseFixtureV5Options = {},
): Promise<T> {
  const fixture = await writeReleaseFixtureV5(input);
  try {
    return await run(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

async function importFixtureV5(
  fixture: ReleaseFixtureV5,
  output = "import-v5.json",
): Promise<MtaWikiOperationalOccurrenceImportArtifactV5> {
  const artifact = await runMtaWikiOperationalOccurrenceImport({
    mtaWikiRoot: fixture.root,
    wikiRelease: fixture.releaseId,
    wikiManifestSha256: fixture.manifestSha256,
    output: join(fixture.root, output),
  });
  if (artifact.artifactKind !== "bp.studio.mta_wiki_operational_occurrences.v5") {
    throw new Error("v5 fixture unexpectedly produced a legacy import artifact");
  }
  return artifact;
}

describe("manifest-v3 MTA Wiki operational-occurrence import", () => {
  test("strictly imports an atomic occurrence and writes deterministic bytes", async () => {
    await withFixture({ rows: [occurrenceRow()] }, async (fixture) => {
      const first = await importFixture(fixture, "first.json");
      const second = await importFixture(fixture, "second.json");
      expect(first).toEqual(second);
      expect(await readFile(join(fixture.root, "first.json"), "utf8")).toBe(
        await readFile(join(fixture.root, "second.json"), "utf8"),
      );
      expect(first).toMatchObject({
        artifactKind: "bp.studio.mta_wiki_operational_occurrences.v3",
        schemaVersion: 3,
        summary: {
          sourceOccurrenceCount: 1,
          eligibleOccurrenceCount: 1,
          routeProjectionCount: 1,
          rejectedOccurrenceCount: 0,
        },
      });
      expect(first.occurrences[0]?.resolved_onset).toMatchObject({
        publication_dates: [],
        retrieval_dates: ["2026-06-07"],
      });
      const merged = buildStudyEventMergeArtifactV2({
        registryEvents: [],
        wiki: {
          releaseId: first.sourceRelease.releaseId,
          manifestSha256: first.sourceRelease.manifestSha256,
          artifactSha256: first.sourceRelease.occurrences.sha256,
          occurrences: first.occurrences,
        },
        withoutWikiAnchors: false,
        availableAnalysisRouteIds: new Set(["B1"]),
      });
      expect(merged.candidates).toEqual([
        expect.objectContaining({
          routeId: "B1",
          treatmentFamily: "bus_lane",
          treatmentScopeKind: "atomic",
          componentTreatmentFamilies: [],
          occurrenceId: "occurrence:atomic",
        }),
      ]);
    });
  });

  test("deduplicates an exact registry event into its occurrence while preserving v2 identity", () => {
    const row = occurrenceRow();
    const wikiOnly = buildStudyEventMergeArtifactV2({
      registryEvents: [],
      wiki: {
        releaseId: "release-v3",
        manifestSha256: "a".repeat(64),
        artifactSha256: "b".repeat(64),
        occurrences: [row],
      },
      withoutWikiAnchors: false,
      availableAnalysisRouteIds: new Set(["B1"]),
    });
    const merged = buildStudyEventMergeArtifactV2({
      registryEvents: [registryEvent()],
      wiki: {
        releaseId: "release-v3",
        manifestSha256: "a".repeat(64),
        artifactSha256: "b".repeat(64),
        occurrences: [row],
      },
      withoutWikiAnchors: false,
      availableAnalysisRouteIds: new Set(["B1"]),
    });

    expect(merged.candidates).toHaveLength(1);
    expect(merged.summary.exactDeduplicationCount).toBe(1);
    expect(merged.summary.conflictCount).toBe(0);
    expect(merged.candidates[0]).toMatchObject({
      candidateId: wikiOnly.candidates[0]?.candidateId,
      occurrenceId: row.occurrence_id,
      treatmentScopeKind: "atomic",
    });
    expect(merged.candidates[0]?.provenance.map((value) => value.sourceKind).toSorted()).toEqual([
      "mta_wiki",
      "registry",
    ]);
  });

  test("keeps non-identical cross-source days in one month as a review conflict", () => {
    const row = occurrenceRow();
    const shifted: OperationalOccurrenceRow = {
      ...row,
      resolved_onset: { ...row.resolved_onset, date: "2025-06-30" },
    };
    const merged = buildStudyEventMergeArtifactV2({
      registryEvents: [registryEvent()],
      wiki: {
        releaseId: "release-v3",
        manifestSha256: "a".repeat(64),
        artifactSha256: "b".repeat(64),
        occurrences: [shifted],
      },
      withoutWikiAnchors: false,
      availableAnalysisRouteIds: new Set(["B1"]),
    });

    expect(merged.candidates).toHaveLength(2);
    expect(merged.summary.exactDeduplicationCount).toBe(0);
    expect(merged.summary.conflictCount).toBe(1);
    expect(
      merged.candidates.every(
        (candidate) => candidate.conflictState === "same_month_review_required",
      ),
    ).toBe(true);
    expect(merged.conflicts[0]?.dates).toEqual(["2025-06-29", "2025-06-30"]);
  });

  test("fails closed when one registry event exactly matches multiple occurrence identities", () => {
    const first = occurrenceRow({ id: "occurrence:first" });
    const second = occurrenceRow({ id: "occurrence:second" });

    expect(() =>
      buildStudyEventMergeArtifactV2({
        registryEvents: [registryEvent()],
        wiki: {
          releaseId: "release-v3",
          manifestSha256: "a".repeat(64),
          artifactSha256: "b".repeat(64),
          occurrences: [first, second],
        },
        withoutWikiAnchors: false,
        availableAnalysisRouteIds: new Set(["B1"]),
      }),
    ).toThrow("Registry event matches multiple occurrence identities for exact event");
  });

  test("projects an explicit bundle once per route, never once per member", () => {
    const row = occurrenceRow({
      id: "occurrence:q7-redesign",
      bundle: true,
      supportedBundle: true,
      queensProgram: true,
      memberFamilies: ["service_pattern", "service_pattern", "stop_change"],
      // route_record_id order intentionally differs from GTFS-id order.
      routes: [
        { route_record_id: "route:a-q7", gtfs_route_id: "Q07" },
        { route_record_id: "route:z-b62", gtfs_route_id: "B62" },
      ],
    });
    const merged = buildStudyEventMergeArtifactV2({
      registryEvents: [],
      wiki: {
        releaseId: "release-v3",
        manifestSha256: "a".repeat(64),
        artifactSha256: "b".repeat(64),
        occurrences: [row],
      },
      withoutWikiAnchors: false,
      availableAnalysisRouteIds: new Set(["Q7", "B62"]),
    });
    expect(merged.candidates).toHaveLength(2);
    expect(() => decodeStrict(StudyEventMergeArtifactV2Schema)(merged)).not.toThrow();
    expect(merged.candidates.map((candidate) => candidate.routeId).toSorted()).toEqual([
      "B62",
      "Q7",
    ]);
    expect(
      merged.candidates.every(
        (candidate) =>
          candidate.treatmentScopeKind === "bundle" &&
          candidate.treatmentFamily === "route_redesign" &&
          candidate.confounderGroupId === "queens_bus_network_redesign_2025" &&
          candidate.occurrenceId === row.occurrence_id,
      ),
    ).toBe(true);
    expect(merged.candidates[0]?.componentTreatmentFamilies).toEqual([
      "service_pattern",
      "stop_change",
    ]);
    expect(
      merged.candidates
        .flatMap((candidate) => candidate.provenance)
        .find((value) => value.analysisRouteId === "Q7"),
    ).toMatchObject({ gtfsRouteId: "Q07", analysisRouteId: "Q7" });
  });

  test("rejects unsupported bundle umbrellas without atomizing their members", () => {
    const row = occurrenceRow({
      id: "occurrence:unsupported-bundle",
      bundle: true,
      supportedBundle: false,
      memberFamilies: ["bus_lane", "transit_signal_priority"],
    });
    const merged = buildStudyEventMergeArtifactV2({
      registryEvents: [],
      wiki: {
        releaseId: "release-v3",
        manifestSha256: "a".repeat(64),
        artifactSha256: "b".repeat(64),
        occurrences: [row],
      },
      withoutWikiAnchors: false,
      availableAnalysisRouteIds: new Set(["B1"]),
    });
    expect(merged.candidates).toHaveLength(0);
    expect(merged.rejections).toEqual([
      expect.objectContaining({
        reasons: ["producer_study_projection_ineligible", "unsupported_bundle_analysis_family"],
      }),
    ]);
  });

  test("uses only the bounded Queens route alias and gates route availability", () => {
    expect(occurrenceAnalysisRouteId("Q07")).toBe("Q7");
    expect(occurrenceAnalysisRouteId("Q010")).toBe("Q010");
    const row = occurrenceRow({
      id: "occurrence:q7",
      routes: [{ route_record_id: "route:q7", gtfs_route_id: "Q07" }],
    });
    const unavailable = buildStudyEventMergeArtifactV2({
      registryEvents: [],
      wiki: {
        releaseId: "release-v3",
        manifestSha256: "a".repeat(64),
        artifactSha256: "b".repeat(64),
        occurrences: [row],
      },
      withoutWikiAnchors: false,
      availableAnalysisRouteIds: new Set(["Q07"]),
    });
    expect(unavailable.candidates).toHaveLength(0);
    expect(unavailable.rejections[0]?.reasons).toContain("analysis_route_unavailable:Q07");
  });

  test("does not let a legacy v1 approval authorize a v2 candidate set", () => {
    const row = occurrenceRow();
    const input = {
      registryEvents: [],
      wiki: {
        releaseId: "release-v3",
        manifestSha256: "a".repeat(64),
        artifactSha256: "b".repeat(64),
        occurrences: [row],
      },
      withoutWikiAnchors: false,
      availableAnalysisRouteIds: new Set(["B1"]),
    };
    const awaiting = buildStudyEventMergeArtifactV2(input);
    const candidateId = awaiting.candidates[0]?.candidateId;
    if (candidateId === undefined) throw new Error("expected candidate");
    expect(() =>
      buildStudyEventMergeArtifactV2({
        ...input,
        approval: {
          artifactKind: "bp.studio.study_event_approvals.v1",
          schemaVersion: 1,
          candidateSetId: awaiting.candidateSetId,
          decisions: [
            {
              candidateId,
              decision: "approved",
              reviewer: "fixture-reviewer",
              rationale: "Legacy receipt must not cross the version boundary.",
            },
          ],
        } as never,
      }),
    ).toThrow("require a fresh v2 approval artifact");
  });

  test("keeps candidate identity stable under provenance ordering", () => {
    const row = occurrenceRow();
    if (row.treatment.kind !== "atomic") throw new Error("expected atomic fixture");
    const reordered: OperationalOccurrenceRow = {
      ...row,
      evidence_bindings: row.evidence_bindings.toReversed(),
      routes: row.routes.map((route) => ({
        ...route,
        evidence_bindings: route.evidence_bindings.toReversed(),
      })),
      treatment: {
        kind: "atomic",
        member: {
          ...row.treatment.member,
          evidence_bindings: row.treatment.member.evidence_bindings.toReversed(),
        },
      },
    };
    const build = (occurrence: OperationalOccurrenceRow) =>
      buildStudyEventMergeArtifactV2({
        registryEvents: [],
        wiki: {
          releaseId: "release-v3",
          manifestSha256: "a".repeat(64),
          artifactSha256: "b".repeat(64),
          occurrences: [occurrence],
        },
        withoutWikiAnchors: false,
        availableAnalysisRouteIds: new Set(["B1"]),
      });
    expect(build(row).candidates[0]?.candidateId).toBe(build(reordered).candidates[0]?.candidateId);
  });

  test("fails closed on manifest version, contracts, missing pointers, and excess keys", async () => {
    const cases = [
      { manifestVersion: 2 },
      { occurrenceContractVersion: 2 },
      { occurrenceReviewContractVersion: 2 },
      { omitOccurrencePointer: true },
      { extraManifestKey: true },
    ];
    for (const fixtureInput of cases) {
      await withFixture({ rows: [occurrenceRow()], ...fixtureInput }, async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({
          _tag: "MtaWikiOperationalOccurrenceImportError",
          code: "schema_mismatch",
        });
      });
    }

    for (const pointer of DUAL_PUBLISH_POINTERS) {
      await withFixture(
        { rows: [occurrenceRow()], pointerOverrides: { [pointer]: null } },
        async (fixture) => {
          await expect(importFixture(fixture)).rejects.toMatchObject({
            _tag: "MtaWikiOperationalOccurrenceImportError",
            code: "schema_mismatch",
          });
        },
      );
    }
  });

  test("requires all six dual-publish pointers to be addressed and distinct", async () => {
    for (const pointer of DUAL_PUBLISH_POINTERS) {
      await withFixture(
        {
          rows: [occurrenceRow()],
          pointerOverrides: { [pointer]: `missing/${pointer}.json` },
        },
        async (fixture) => {
          await expect(importFixture(fixture)).rejects.toMatchObject({
            code: "missing_manifest_file",
          });
        },
      );
    }
    await withFixture(
      {
        rows: [occurrenceRow()],
        pointerOverrides: { operational_occurrences: "operational_anchors.jsonl" },
      },
      async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({ code: "invalid_input" });
      },
    );
  });

  test("fails closed on the manifest hash and path traversal", async () => {
    await withFixture({ rows: [occurrenceRow()] }, async (fixture) => {
      await expect(
        runMtaWikiOperationalOccurrenceImport({
          mtaWikiRoot: fixture.root,
          wikiRelease: fixture.releaseId,
          wikiManifestSha256: "0".repeat(64),
          output: join(fixture.root, "output.json"),
        }),
      ).rejects.toMatchObject({ code: "hash_mismatch" });
    });
    const unsafePointers = [
      "../escaped.jsonl",
      "/tmp/absolute.jsonl",
      "nested\\escaped.jsonl",
      "nested/./file.jsonl",
      "nested//file.jsonl",
      "C:/escaped.jsonl",
    ];
    for (const pointer of unsafePointers) {
      await withFixture(
        {
          rows: [occurrenceRow()],
          pointerOverrides: { operational_occurrences: pointer },
        },
        async (fixture) => {
          await expect(importFixture(fixture)).rejects.toMatchObject({ code: "unsafe_path" });
        },
      );
    }
    await withFixture(
      {
        rows: [occurrenceRow()],
        pointerOverrides: { route_anchors: "../optional-pointer.jsonl" },
      },
      async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({ code: "unsafe_path" });
      },
    );
    await withFixture(
      { rows: [occurrenceRow()], unsafeExtraFileKey: "../unsafe-extra.json" },
      async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({ code: "unsafe_path" });
      },
    );
    await withFixture({ rows: [occurrenceRow()] }, async (fixture) => {
      const original = await readFile(fixture.occurrencePath);
      const target = join(fixture.releaseDirectory, "occurrence-target.jsonl");
      await writeFile(target, original);
      await unlink(fixture.occurrencePath);
      await symlink("occurrence-target.jsonl", fixture.occurrencePath);
      await expect(importFixture(fixture)).rejects.toMatchObject({ code: "unsafe_path" });
    });
    await withFixture(
      { rows: [occurrenceRow()], occurrencePointer: "nested/occurrences.jsonl" },
      async (fixture) => {
        const nested = join(fixture.releaseDirectory, "nested");
        const actual = join(fixture.releaseDirectory, "actual");
        await rename(nested, actual);
        await symlink("actual", nested);
        await expect(importFixture(fixture)).rejects.toMatchObject({ code: "unsafe_path" });
      },
    );
  });

  test("verifies manifest-addressed occurrence bytes before decoding", async () => {
    await withFixture({ rows: [occurrenceRow()] }, async (fixture) => {
      await writeFile(fixture.occurrencePath, "{}\n", "utf8");
      await expect(importFixture(fixture)).rejects.toMatchObject({
        _tag: "MtaWikiOperationalOccurrenceImportError",
        code: "byte_count_mismatch",
      });
    });
    await withFixture({ rows: [occurrenceRow()] }, async (fixture) => {
      await writeFile(fixture.legacyAnchorPath, "tampered\n", "utf8");
      await expect(importFixture(fixture)).rejects.toMatchObject({
        _tag: "MtaWikiOperationalOccurrenceImportError",
        code: "byte_count_mismatch",
      });
    });
  });

  test("fails closed on row excess keys, duplicate ids, stale review, and summary drift", async () => {
    const row = occurrenceRow();
    await withFixture(
      { rows: [{ ...row, extra: true } as unknown as OperationalOccurrenceRow] },
      async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({ code: "schema_mismatch" });
      },
    );
    await withFixture({ rows: [row, row] }, async (fixture) => {
      await expect(importFixture(fixture)).rejects.toMatchObject({
        code: "duplicate_occurrence_id",
      });
    });
    await withFixture(
      {
        rows: [row],
        decisions: [{ ...reviewDecision(row), founding_key: "stale" }],
      },
      async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({ code: "semantic_mismatch" });
      },
    );
    await withFixture(
      {
        rows: [row],
        decisions: [
          {
            ...reviewDecision(row),
            evidence_bindings: row.evidence_bindings.slice(1),
          },
        ],
      },
      async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
        });
      },
    );
    await withFixture(
      {
        rows: [row],
        summary: { ...recomputeOperationalOccurrenceSummary([row]), occurrence_count: 2 },
      },
      async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({ code: "summary_mismatch" });
      },
    );
  });

  test("rejects canonical duplicate bindings in rows and review snapshots", async () => {
    const q7 = occurrenceRow({
      id: "occurrence:q7-duplicate-evidence",
      bundle: true,
      queensProgram: true,
      routes: [{ route_record_id: "route:q7", gtfs_route_id: "Q07" }],
      memberFamilies: ["service_pattern", "service_pattern", "stop_change"],
    });
    if (q7.treatment.kind !== "bundle") throw new Error("expected Q7 bundle fixture");

    // writeReleaseFixture recomputes occurrence/review bytes and manifest hashes,
    // so this exercises semantic validation rather than a stale-hash shortcut.
    const duplicateOnsetRow: OperationalOccurrenceRow = {
      ...q7,
      resolved_onset: {
        ...q7.resolved_onset,
        evidence_bindings: duplicateFirstBinding(q7.resolved_onset.evidence_bindings),
      },
    };
    await withFixture(
      { rows: [duplicateOnsetRow], decisions: [reviewDecision(duplicateOnsetRow)] },
      async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
          operation: "validateOperationalOccurrence",
          detail: expect.stringContaining("unique"),
        });
      },
    );

    const decision = reviewDecision(q7);
    if (decision.treatment.kind !== "bundle") throw new Error("expected Q7 bundle review");
    const route = decision.routes[0];
    const member = decision.treatment.members[0];
    if (route === undefined || member === undefined)
      throw new Error("expected nested review scope");
    const duplicateReviewBindings: OperationalOccurrenceReviewDecision[] = [
      {
        ...decision,
        resolved_onset: {
          ...decision.resolved_onset,
          evidence_bindings: duplicateFirstBinding(decision.resolved_onset.evidence_bindings),
        },
      },
      {
        ...decision,
        routes: [{ ...route, evidence_bindings: duplicateFirstBinding(route.evidence_bindings) }],
      },
      {
        ...decision,
        treatment: {
          ...decision.treatment,
          members: [
            { ...member, evidence_bindings: duplicateFirstBinding(member.evidence_bindings) },
            ...decision.treatment.members.slice(1),
          ],
        },
      },
      {
        ...decision,
        treatment: {
          ...decision.treatment,
          bundle_family_evidence_bindings: duplicateFirstBinding(
            decision.treatment.bundle_family_evidence_bindings,
          ),
        },
      },
    ];
    for (const duplicateReview of duplicateReviewBindings) {
      await withFixture({ rows: [q7], decisions: [duplicateReview] }, async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
          operation: "validateOperationalOccurrenceReviewSnapshot",
          detail: expect.stringContaining("unique"),
        });
      });
    }
  });

  test("rejects nested review-evidence drift even when the flat ledger is unchanged", async () => {
    const atomic = occurrenceRow();
    const atomicDecision = reviewDecision(atomic);
    const firstRoute = atomicDecision.routes[0];
    if (firstRoute === undefined || atomicDecision.treatment.kind !== "atomic") {
      throw new Error("expected atomic review fixture");
    }
    const atomicDrift: OperationalOccurrenceReviewDecision[] = [
      {
        ...atomicDecision,
        resolved_onset: {
          ...atomicDecision.resolved_onset,
          evidence_bindings: tamperFirstBinding(atomicDecision.resolved_onset.evidence_bindings),
        },
      },
      {
        ...atomicDecision,
        routes: [
          {
            ...firstRoute,
            evidence_bindings: tamperFirstBinding(firstRoute.evidence_bindings),
          },
          ...atomicDecision.routes.slice(1),
        ],
      },
      {
        ...atomicDecision,
        treatment: {
          kind: "atomic",
          member: {
            ...atomicDecision.treatment.member,
            evidence_bindings: tamperFirstBinding(
              atomicDecision.treatment.member.evidence_bindings,
            ),
          },
        },
      },
    ];
    for (const decision of atomicDrift) {
      await withFixture({ rows: [atomic], decisions: [decision] }, async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
        });
      });
    }

    const bundle = occurrenceRow({ id: "occurrence:bundle-review", bundle: true });
    const bundleDecision = reviewDecision(bundle);
    if (bundleDecision.treatment.kind !== "bundle") {
      throw new Error("expected bundle review fixture");
    }
    const firstMember = bundleDecision.treatment.members[0];
    if (firstMember === undefined) throw new Error("expected bundle member review fixture");
    const bundleDrift: OperationalOccurrenceReviewDecision[] = [
      {
        ...bundleDecision,
        treatment: {
          ...bundleDecision.treatment,
          bundle_family_evidence_bindings: tamperFirstBinding(
            bundleDecision.treatment.bundle_family_evidence_bindings,
          ),
        },
      },
      {
        ...bundleDecision,
        treatment: {
          ...bundleDecision.treatment,
          members: [
            {
              ...firstMember,
              evidence_bindings: tamperFirstBinding(firstMember.evidence_bindings),
            },
            ...bundleDecision.treatment.members.slice(1),
          ],
        },
      },
    ];
    for (const decision of bundleDrift) {
      await withFixture({ rows: [bundle], decisions: [decision] }, async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
        });
      });
    }
  });

  test("mirrors producer bundle-family support and evidence-role semantics", async () => {
    const supported = occurrenceRow({
      id: "occurrence:supported-bundle",
      bundle: true,
      supportedBundle: true,
    });
    if (supported.treatment.kind !== "bundle") throw new Error("expected bundle fixture");
    const unknownFamily: OperationalOccurrenceRow = {
      ...supported,
      treatment: { ...supported.treatment, bundle_family: "unknown_bundle_family" },
    };
    await withFixture({ rows: [unknownFamily] }, async (fixture) => {
      await expect(importFixture(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
      });
    });

    const originalFamilyBinding = supported.treatment.bundle_family_evidence_bindings[0];
    if (originalFamilyBinding === undefined) throw new Error("expected bundle-family evidence");
    const wrongRoleBinding = { ...originalFamilyBinding, role: "event_date" as const };
    const wrongRole: OperationalOccurrenceRow = {
      ...supported,
      evidence_bindings: supported.evidence_bindings.map((entry) =>
        JSON.stringify(entry) === JSON.stringify(originalFamilyBinding) ? wrongRoleBinding : entry,
      ),
      treatment: {
        ...supported.treatment,
        bundle_family_evidence_bindings: [wrongRoleBinding],
      },
    };
    await withFixture({ rows: [wrongRole] }, async (fixture) => {
      await expect(importFixture(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
      });
    });
  });

  test("rejects producer-invalid empty identifiers and required arrays", async () => {
    const row = occurrenceRow();
    const observation = row.observations[0];
    if (observation === undefined) throw new Error("expected observation fixture");
    const mutations: OperationalOccurrenceRow[] = [
      { ...row, occurrence_id: " " },
      { ...row, observations: [] },
      {
        ...row,
        observations: [{ ...observation, relation_record_ids: [] }],
      },
      { ...row, resolved_onset: { ...row.resolved_onset, resolver_ids: [] } },
      { ...row, resolved_onset: { ...row.resolved_onset, evidence_bindings: [] } },
      { ...row, source_ids: [] },
      { ...row, evidence_bindings: [] },
      { ...row, provenance: { ...row.provenance, event_record_ids: [] } },
    ];
    for (const invalid of mutations) {
      await withFixture({ rows: [invalid] }, async (fixture) => {
        await expect(importFixture(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
        });
      });
    }
  });

  test("treats a reviewed redesign occurrence as treatment onset, not its own confounder", () => {
    expect(
      queensRedesignOverlapGate({
        routeId: "Q7",
        windowMonths: ["2025-06", "2025-07"],
        treatmentFamily: "route_redesign",
        treatmentConfounderGroupId: "queens_bus_network_redesign_2025",
      }),
    ).toMatchObject({ status: "not_applicable" });
    expect(
      queensRedesignOverlapGate({
        routeId: "Q7",
        windowMonths: ["2025-06", "2025-07"],
        treatmentFamily: "automated_bus_lane_enforcement",
        treatmentConfounderGroupId: "queens_bus_network_redesign_2025",
      }),
    ).toMatchObject({ status: "fail" });
    expect(
      queensRedesignOverlapGate({
        routeId: "Q7",
        windowMonths: ["2025-06", "2025-07"],
        treatmentFamily: "route_redesign",
        treatmentConfounderGroupId: null,
      }),
    ).toMatchObject({ status: "fail" });
    expect(
      queensRedesignOverlapGate({
        routeId: "Q7",
        windowMonths: ["2025-06", "2025-07"],
        treatmentFamily: "route_redesign",
        treatmentConfounderGroupId: "unrelated_queens_route_redesign",
      }),
    ).toMatchObject({ status: "fail" });
  });

  test("registers the occurrence importer as a two-part studio command", () => {
    expect(command.path).toEqual(["studio", "import-mta-wiki-operational-occurrences"]);
  });
});

describe("manifest-v4 occurrence-v2 and relationship-integrity import", () => {
  test("strictly verifies a compatible relationship bundle and preserves v2 lineage", async () => {
    await withFixtureV4({}, async (fixture) => {
      const first = await importFixtureV4(fixture);
      const second = await runMtaWikiOperationalOccurrenceImport({
        mtaWikiRoot: fixture.root,
        wikiRelease: fixture.releaseId,
        wikiManifestSha256: fixture.manifestSha256,
        output: join(fixture.root, "import-v4-second.json"),
      });
      if (second.artifactKind !== "bp.studio.mta_wiki_operational_occurrences.v4") {
        throw new Error("second v4 fixture run unexpectedly produced a legacy artifact");
      }
      expect(first).toEqual(second);
      expect(first.sourceRelease.producerReviewStatus).toEqual({
        compatibility: "compatible",
        promotionEligible: true,
      });
      expect(first.sourceRelease.relationshipIntegrity).toMatchObject({
        contract: { contractStatus: "enforced", enforcementState: "enforced_ready" },
        enforcementProof: { gateCount: 7, totalViolationCount: 0 },
        graphAudit: {
          canonicalRecordCount: 4,
          canonicalRelationCount: 1,
          reviewedNonEnforceableAdvisoryCount: 3,
        },
      });
      expect(first.sourceRelease.relationshipIntegrity.verifiedArtifactCount).toBe(
        first.sourceRelease.relationshipIntegrity.artifactCount,
      );
      expect(first.occurrences[0]).toMatchObject({
        schema_version: 2,
        phase_relation_disposition: "single_phase",
        physical_scope_record_ids: [],
      });
      const candidates = buildStudyEventMergeArtifactV3({
        registryEvents: [],
        wiki: pinnedOccurrenceStudyInputV4(first),
        availableAnalysisRouteIds: new Set(["B1"]),
      });
      expect(candidates).toMatchObject({
        approvalState: "awaiting_approval",
        summary: { candidateCount: 1, approvedCount: 0 },
      });
      expect(() => decodeStrict(StudyEventMergeArtifactV3Schema)(candidates)).not.toThrow();
    });
  });

  test("binds phase and physical audit proofs to the exact imported occurrence graph", async () => {
    await withFixtureV4({ physicalOccurrencePinMismatch: true }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("physical audit occurrence input"),
      });
    });
    await withFixtureV4({ phaseOccurrencePinMismatch: true }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("phase audit lineage"),
      });
    });
    await withFixtureV4({ physicalSummaryPinMismatch: true }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("physical audit output pin"),
      });
    });
    await withFixtureV4({ physicalAuditFingerprintMismatch: true }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("physical audit identity, fingerprint"),
      });
    });
  });

  test("rejects non-ready or nonzero phase and physical audit summaries", async () => {
    await withFixtureV4({ physicalAuditNotReady: true }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "schema_mismatch",
        operation: "decodeOccurrenceTreatmentPhysicalitySummary",
      });
    });
    await withFixtureV4({ phaseAuditViolation: true }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "schema_mismatch",
        operation: "decodeOperationalOccurrencePhaseAuditSummary",
      });
    });
  });

  test("fails closed on relationship artifact tamper and strict contract excess", async () => {
    await withFixtureV4({}, async (fixture) => {
      await writeFile(fixture.firstGatePath, "{}\n", "utf8");
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "byte_count_mismatch",
      });
    });
    await withFixtureV4({ extraContractKey: true }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "schema_mismatch",
        operation: "decodeRelationshipContract",
      });
    });
    await withFixtureV4({ extraBundleArtifactText: "{invalid-json\n" }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "invalid_json",
        operation: "validateRelationshipArtifactSyntax",
      });
    });
    await withFixtureV4({ transitionPreviousProofMismatch: true }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("transition lineage commitments"),
      });
    });
  });

  test("rejects weakened relationship-v1 roles, pins, fingerprints, policy, and matrix", async () => {
    for (const input of [{ transitionMissingRole: true }, { transitionDuplicateRole: true }]) {
      await withFixtureV4(input, async (fixture) => {
        await expect(importFixtureV4(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
          detail: expect.stringContaining("role contract"),
        });
      });
    }
    await withFixtureV4({ transitionInvariantDigestMismatch: true }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("invariant digest"),
      });
    });
    await withFixtureV4({ transitionFingerprintMismatch: true }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("fingerprint"),
      });
    });
    for (const input of [{ weakenedContractPolicy: true }, { invalidEndpointMatrix: true }]) {
      await withFixtureV4(input, async (fixture) => {
        await expect(importFixtureV4(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
          detail: expect.stringContaining("policy, final matrix"),
        });
      });
    }
  });

  test("rejects a graph manifest whose declared JSONL row count is inconsistent", async () => {
    await withFixtureV4({ graphManifestRowCountMismatch: true }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("row count"),
      });
    });
  });

  test("rejects unknown contract versions and invalid occurrence-v2 phase lineage", async () => {
    await withFixtureV4({ occurrenceContractVersion: 3 }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({ code: "schema_mismatch" });
    });
    const invalidPhase = { ...occurrenceRowV2(), phase_record_ids: [] };
    await withFixtureV4({ row: invalidPhase }, async (fixture) => {
      await expect(importFixtureV4(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("phase_record_ids"),
      });
    });
  });

  test("accepts review-v1 parity projections while retaining occurrence-v2 lineage", async () => {
    const exactPhysical = occurrenceRowV2({ exactPhysicalScope: true });
    await withFixtureV4({ row: exactPhysical }, async (fixture) => {
      const imported = await importFixtureV4(fixture);
      expect(imported.sourceRelease.producerReviewStatus).toEqual({
        compatibility: "compatible",
        promotionEligible: true,
      });
      expect(imported.summary).toMatchObject({
        exactPhysicalScopeOccurrenceCount: 1,
        singlePhaseOccurrenceCount: 1,
      });
      expect(imported.occurrences[0]).toMatchObject({
        physical_scope_record_ids: ["corridor:physical-scope"],
        physical_scope_relation_record_ids: ["relation:physical-scope"],
        physical_scope_evidence_bindings: [
          {
            role: "physical_scope",
            record_id: "relation:physical-scope",
          },
        ],
      });
    });

    const relatedPhases = occurrenceRowV2({ relatedPhases: true });
    await withFixtureV4({ row: relatedPhases }, async (fixture) => {
      const imported = await importFixtureV4(fixture);
      expect(imported.sourceRelease.producerReviewStatus).toEqual({
        compatibility: "compatible",
        promotionEligible: true,
      });
      expect(imported.summary).toMatchObject({
        relatedPhaseOccurrenceCount: 1,
        singlePhaseOccurrenceCount: 0,
      });
      expect(imported.occurrences[0]).toMatchObject({
        phase_relation_disposition: "related_phases",
        phase_relation_record_ids: ["relation:phase-1-precedes-phase-2"],
        phase_relation_evidence_bindings: [
          {
            role: "phase_relation",
            record_id: "relation:phase-1-precedes-phase-2",
          },
        ],
      });
    });
  });

  test("rejects unproved, nested, or stale review-v1 projection omissions", async () => {
    for (const role of ["phase_relation", "physical_scope"] as const) {
      const row = occurrenceRowV2();
      const rogueBinding: OperationalOccurrenceEvidenceBindingV2 = {
        role,
        record_id: `relation:rogue-${role}`,
        source_id: "source:official",
        evidence_id: `source:official#rogue-${role}`,
      };
      const rogueRow: OperationalOccurrenceRowV2 = {
        ...row,
        evidence_bindings: sortedBindings([...row.evidence_bindings, rogueBinding]),
      };
      await withFixtureV4({ row: rogueRow }, async (fixture) => {
        await expect(importFixtureV4(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
          detail: expect.stringContaining(`top-level ${role} evidence`),
        });
      });
    }

    const nestedRow = occurrenceRowV2({ exactPhysicalScope: true });
    const route = nestedRow.routes[0];
    const physicalBinding = nestedRow.physical_scope_evidence_bindings[0];
    if (route === undefined || physicalBinding === undefined) {
      throw new Error("nested v2 fixture needs one route and physical binding");
    }
    await withFixtureV4(
      {
        row: {
          ...nestedRow,
          routes: [
            {
              ...route,
              evidence_bindings: sortedBindings([...route.evidence_bindings, physicalBinding]),
            },
          ],
        },
      },
      async (fixture) => {
        await expect(importFixtureV4(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
          detail: expect.stringContaining("must stay in dedicated v2 lineage fields"),
        });
      },
    );

    const physicalRow = occurrenceRowV2({ exactPhysicalScope: true });
    const staleDecision = reviewDecisionV2(physicalRow);
    await withFixtureV4(
      {
        row: physicalRow,
        reviewDecision: {
          ...staleDecision,
          evidence_bindings: staleDecision.evidence_bindings.filter(
            (binding) => binding.role !== "event_date",
          ),
        },
      },
      async (fixture) => {
        await expect(importFixtureV4(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
          detail: expect.stringContaining("is stale"),
        });
      },
    );
  });

  test("quarantines review-v1 occurrence-v2 roles unless the exact rc22 defect matches", async () => {
    await withFixtureV4(
      {
        row: occurrenceRowV2({ exactPhysicalScope: true }),
        includeV2LineageRolesInReview: true,
      },
      async (fixture) => {
        await expect(importFixtureV4(fixture)).rejects.toMatchObject({
          code: "contract_incompatible",
        });
      },
    );
    const decision = reviewDecisionV2(occurrenceRowV2());
    const physicalBinding = {
      role: "physical_scope" as const,
      record_id: "relation_flatbush-phase1-treatment-on-bounded-corridor-livingston-state-20260715",
      source_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026",
      evidence_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026#p004_c0002",
    };
    const snapshot = {
      snapshot_version: 1 as const,
      decision_schema_version: 1 as const,
      decision_count: 1,
      decisions: [
        {
          ...decision,
          decision_id: "flatbush-phase1-center-running-bus-lanes-2025-09",
          occurrence_id: "occurrence:8c987704152b459014217d44",
          evidence_bindings: [...decision.evidence_bindings, physicalBinding],
        },
      ],
    };
    expect(
      classifyOperationalOccurrenceReviewCompatibility({
        manifestSha256: "249ef6be1d927e44d405c11bcff643d18b2133e5407be37dc7612f935a1b53e4",
        reviewSha256: "f18dda5c0c758d4193cb1dfdf69e296da79814ebcb39cdefb4e7dc9bec963bed",
        snapshot,
      }),
    ).toBe("known_rc22_review_v1_physical_scope_incompatibility");
    const snapshotDecision = snapshot.decisions[0];
    if (snapshotDecision === undefined) throw new Error("fixture needs one review decision");
    expect(
      classifyOperationalOccurrenceReviewCompatibility({
        manifestSha256: "249ef6be1d927e44d405c11bcff643d18b2133e5407be37dc7612f935a1b53e4",
        reviewSha256: "f18dda5c0c758d4193cb1dfdf69e296da79814ebcb39cdefb4e7dc9bec963bed",
        snapshot: {
          ...snapshot,
          decisions: [
            {
              ...snapshotDecision,
              evidence_bindings: [{ ...physicalBinding, evidence_id: "tampered" }],
            },
          ],
        },
      }),
    ).toBe("unsupported_review_v1_occurrence_v2_roles");
  });

  test("blocks approvals for the fingerprinted incompatible profile", async () => {
    await withFixtureV4({}, async (fixture) => {
      const compatible = await importFixtureV4(fixture);
      const quarantined: MtaWikiOperationalOccurrenceImportArtifactV4 = {
        ...compatible,
        sourceRelease: {
          ...compatible.sourceRelease,
          producerReviewStatus: {
            compatibility: "known_rc22_review_v1_physical_scope_incompatibility",
            promotionEligible: false,
          },
        },
      };
      expect(() =>
        buildStudyEventMergeArtifactV3({
          registryEvents: [],
          wiki: pinnedOccurrenceStudyInputV4(quarantined),
          availableAnalysisRouteIds: new Set(["B1"]),
        }),
      ).toThrow("cannot be reused for another pinned input");
      const exactRc22Wiki = {
        ...pinnedOccurrenceStudyInputV4(quarantined),
        releaseId: "v1-rc22",
        manifestSha256: "249ef6be1d927e44d405c11bcff643d18b2133e5407be37dc7612f935a1b53e4",
        artifactSha256: "d2fff454cc82c9a74f9f4ea9bb0b0334a12af385f53d0e7fbde126ea9e33f98f",
        relationshipBundleSha256:
          "2a4fa7fd0e3b2345b236c06a4e0fc7640db106c959ab65ef6110d30ed6a0641f",
        relationshipEnforcementProofCanonicalSha256:
          "2bcdc8859c23baecfb0a463e32a2485eab267d3de5ad6ac9cf3c69c14e270536",
      } as const;
      const input = {
        registryEvents: [],
        wiki: exactRc22Wiki,
        availableAnalysisRouteIds: new Set(["B1"]),
      };
      const blocked = buildStudyEventMergeArtifactV3(input);
      expect(blocked).toMatchObject({
        approvalState: "blocked_contract_incompatible",
        approvedEvents: [],
        approval: null,
      });
      expect(() => decodeStrict(StudyEventMergeArtifactV3Schema)(blocked)).not.toThrow();
      expect(() =>
        buildStudyEventMergeArtifactV3({
          ...input,
          wiki: { ...exactRc22Wiki, producerReviewCompatibility: "compatible" },
        }),
      ).toThrow("requires its exact quarantined");
      const candidateId = blocked.candidates[0]?.candidateId;
      if (candidateId === undefined) throw new Error("expected one blocked fixture candidate");
      expect(() =>
        buildStudyEventMergeArtifactV3({
          ...input,
          approval: {
            artifactKind: "bp.studio.study_event_approvals.v3",
            schemaVersion: 3,
            candidateSetId: blocked.candidateSetId,
            decisions: [
              {
                candidateId,
                decision: "approved",
                reviewer: "fixture-reviewer",
                rationale: "Must remain blocked.",
              },
            ],
          },
        }),
      ).toThrow("blocked by the pinned producer review-contract incompatibility");
      expect(() =>
        decodeStrict(StudyEventMergeArtifactV3Schema)({
          ...blocked,
          wikiInput: { ...blocked.wikiInput, producerReviewCompatibility: "compatible" },
        }),
      ).toThrow();
    });
  });
});

describe("manifest-v5 occurrence review-v2 retirement replay", () => {
  test("deterministically imports active decisions and preserves exact retirement closure", async () => {
    await withFixtureV5(async (fixture) => {
      const first = await importFixtureV5(fixture, "import-v5-first.json");
      const second = await importFixtureV5(fixture, "import-v5-second.json");
      expect(first).toEqual(second);
      expect(await readFile(join(fixture.root, "import-v5-first.json"), "utf8")).toBe(
        await readFile(join(fixture.root, "import-v5-second.json"), "utf8"),
      );
      expect(first.sourceRelease).toMatchObject({
        manifestVersion: 5,
        operationalOccurrenceContractVersion: 2,
        operationalOccurrenceReviewDecisionContractVersion: 2,
        routeIdentityContractVersion: 1,
        producerReviewStatus: { compatibility: "compatible", promotionEligible: true },
        reviewDecisionCount: 1,
        reviewSourceDecisionCount: 2,
        reviewRetirementCount: 1,
      });
      expect(first.occurrences.map((row) => row.occurrence_id)).toEqual(["occurrence:atomic"]);
      expect(first.sourceRelease.reviewRetirements).toMatchObject([
        {
          binding: {
            route_record_id: "route_q6-ace",
            dataset_id: "mta-bus-company",
            source_route_id: "Q06",
            gtfs_route_id: "Q06",
            projectable: false,
          },
          target: {
            occurrence_id: "occurrence:q6-route-redesign-2025-08-31",
            pinned_gtfs_route_ids: ["Q06"],
            projection_state: "retired",
          },
        },
      ]);
      const candidates = buildStudyEventMergeArtifactV3({
        registryEvents: [],
        wiki: pinnedOccurrenceStudyInputV4(first),
        availableAnalysisRouteIds: new Set(["B1", "Q06"]),
      });
      expect(candidates).toMatchObject({
        approvalState: "awaiting_approval",
        summary: { candidateCount: 1, approvedCount: 0 },
      });
      expect(candidates.candidates.map((candidate) => candidate.routeId)).toEqual(["B1"]);
    });
  });

  test("keeps occurrence and available-route identities exact outside the finite Queens crosswalk", async () => {
    await withFixtureV5(async (fixture) => {
      const imported = await importFixtureV5(fixture);
      const pinned = pinnedOccurrenceStudyInputV4(imported);
      const exactRow = occurrenceRowV2({
        routes: [
          { route_record_id: "route:b44-local", gtfs_route_id: "B44" },
          { route_record_id: "route:b44-select", gtfs_route_id: "B44+" },
        ],
      });
      const build = (
        row: OperationalOccurrenceRowV2,
        availableAnalysisRouteIds: ReadonlySet<string>,
      ) =>
        buildStudyEventMergeArtifactV3({
          registryEvents: [],
          wiki: { ...pinned, occurrences: [row] },
          availableAnalysisRouteIds,
        });

      const exact = build(exactRow, new Set(["B44", "B44+"]));
      expect(exact.candidates.map((candidate) => candidate.routeId).toSorted()).toEqual([
        "B44",
        "B44+",
      ]);
      expect(
        exact.candidates
          .flatMap((candidate) => candidate.provenance)
          .map((provenance) => provenance.gtfsRouteId)
          .toSorted(),
      ).toEqual(["B44", "B44+"]);

      const unavailableAliases = build(exactRow, new Set(["b44", "B44-SBS"]));
      expect(unavailableAliases.candidates).toEqual([]);
      expect(unavailableAliases.rejections[0]?.reasons).toEqual([
        "analysis_route_unavailable:B44",
        "analysis_route_unavailable:B44+",
      ]);

      const aliasLiteralRow = occurrenceRowV2({
        routes: [
          { route_record_id: "route:b44-lowercase", gtfs_route_id: "b44" },
          { route_record_id: "route:b44-sbs-literal", gtfs_route_id: "B44-SBS" },
        ],
      });
      const unrewrittenLiterals = build(aliasLiteralRow, new Set(["B44", "B44+"]));
      expect(unrewrittenLiterals.candidates).toEqual([]);
      expect(unrewrittenLiterals.rejections[0]?.reasons).toEqual([
        "analysis_route_unavailable:B44-SBS",
        "analysis_route_unavailable:b44",
      ]);

      expect(occurrenceAnalysisRouteId("Q07")).toBe("Q7");
      expect(occurrenceAnalysisRouteId("q07")).toBe("q07");
      expect(occurrenceAnalysisRouteId("B44-SBS")).toBe("B44-SBS");
    });
  });

  test("requires each active occurrence route to use its exact projectable binding", async () => {
    await withFixtureV5(
      async (fixture) => {
        await expect(importFixtureV5(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
          operation: "validateActiveOccurrenceRouteProjections",
        });
      },
      {
        activeRow: occurrenceRowV2({
          routes: [{ route_record_id: "route:b1", gtfs_route_id: "b1" }],
        }),
      },
    );

    await withFixtureV5(
      async (fixture) => {
        await expect(importFixtureV5(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
          operation: "validateActiveOccurrenceRouteProjections",
        });
      },
      {
        activeRow: occurrenceRowV2({
          routes: [{ route_record_id: "route_q6-ace", gtfs_route_id: "Q06" }],
        }),
      },
    );
  });

  test("preserves producer decision-ledger and binding SHA receipts", async () => {
    await withFixtureV5(
      async (fixture) => {
        await expect(importFixtureV5(fixture)).resolves.toBeDefined();
      },
      { reviewedDecisionSha256: "0".repeat(64) },
    );

    await withFixtureV5(
      async (fixture) => {
        await expect(importFixtureV5(fixture)).resolves.toBeDefined();
      },
      { routeBindingSha256: "0".repeat(64) },
    );
  });

  test("rejects route-anchor bytes that are not the complete snapshot projection", async () => {
    await withFixtureV5(
      async (fixture) => {
        await expect(importFixtureV5(fixture)).rejects.toMatchObject({
          code: "semantic_mismatch",
          operation: "validateRouteAnchorProjection",
        });
      },
      { routeAnchorsText: "" },
    );
  });

  test("rejects a generic rc23-style exact-route quarantine", async () => {
    await withFixtureV5(async (fixture) => {
      await writeFixtureV5QuarantineStatus(fixture);
      await expect(importFixtureV5(fixture)).rejects.toMatchObject({
        code: "contract_incompatible",
        operation: "verifyReleaseStatus",
      });
    });
  });

  test("rejects count drift and reintroduction of a retired occurrence identity", async () => {
    await withFixtureV5(async (fixture) => {
      const review = JSON.parse(await readFile(fixture.reviewPath, "utf8")) as FixtureReviewV2Json;
      review.source_decision_count = 3;
      await repinFixtureV5Json(fixture, "operational_occurrence_review_decisions.json", review);
      await expect(importFixtureV5(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("counts do not reconcile"),
      });
    });
    await withFixtureV5(async (fixture) => {
      const review = JSON.parse(await readFile(fixture.reviewPath, "utf8")) as FixtureReviewV2Json;
      const retirement = review.retirements[0];
      if (retirement === undefined) throw new Error("fixture needs one retirement");
      retirement.target.occurrence_id = "occurrence:atomic";
      await repinFixtureV5Json(fixture, "operational_occurrence_review_decisions.json", review);
      await expect(importFixtureV5(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("reintroduced"),
      });
    });
  });

  test("rejects route-binding drift, unknown retirement fields, and unrepresented archives", async () => {
    await withFixtureV5(async (fixture) => {
      const review = JSON.parse(await readFile(fixture.reviewPath, "utf8")) as FixtureReviewV2Json;
      const retirement = review.retirements[0];
      if (retirement === undefined) throw new Error("fixture needs one retirement");
      retirement.binding.source_route_id = "Q07";
      await repinFixtureV5Json(fixture, "operational_occurrence_review_decisions.json", review);
      await expect(importFixtureV5(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("accepted nonprojectable route binding"),
      });
    });
    await withFixtureV5(async (fixture) => {
      const review = JSON.parse(await readFile(fixture.reviewPath, "utf8")) as FixtureReviewV2Json;
      const retirement = review.retirements[0];
      if (retirement === undefined) throw new Error("fixture needs one retirement");
      retirement.future_disposition = "unsupported";
      await repinFixtureV5Json(fixture, "operational_occurrence_review_decisions.json", review);
      await expect(importFixtureV5(fixture)).rejects.toMatchObject({
        code: "schema_mismatch",
        operation: "decodeOperationalOccurrenceReviewSnapshotV5",
      });
    });
    await withFixtureV5(async (fixture) => {
      const archive = JSON.parse(await readFile(fixture.retirementArchivePath, "utf8"));
      await repinFixtureV5Json(
        fixture,
        "review-retirements/operational-occurrence/decision:unrepresented.json",
        archive,
      );
      await expect(importFixtureV5(fixture)).rejects.toMatchObject({
        code: "semantic_mismatch",
        detail: expect.stringContaining("represented exactly once"),
      });
    });
  });

  test("rejects immutable retirement receipt and archive byte tamper", async () => {
    await withFixtureV5(async (fixture) => {
      await writeFile(fixture.retirementSourcePath, "{}\n", "utf8");
      await expect(importFixtureV5(fixture)).rejects.toMatchObject({
        code: "byte_count_mismatch",
      });
    });
    await withFixtureV5(async (fixture) => {
      await writeFile(fixture.retirementArchivePath, "{}\n", "utf8");
      await expect(importFixtureV5(fixture)).rejects.toMatchObject({
        code: "byte_count_mismatch",
      });
    });
  });
});
