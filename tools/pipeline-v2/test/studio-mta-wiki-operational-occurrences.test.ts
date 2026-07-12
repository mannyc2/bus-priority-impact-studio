import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import type {
  OperationalOccurrenceEvidenceBinding,
  OperationalOccurrenceReviewDecision,
  OperationalOccurrenceRow,
} from "@bp/domain/documents/operational-occurrence";
import { StudyEventMergeArtifactV2Schema } from "@bp/domain/studio/study";
import command from "../src/commands/studio/import-mta-wiki-operational-occurrences.ts";
import {
  recomputeOperationalOccurrenceSummary,
  runMtaWikiOperationalOccurrenceImport,
} from "../src/lib/mta-wiki-operational-occurrences.ts";
import { queensRedesignOverlapGate } from "../src/lib/study-engine/gates.ts";
import {
  buildStudyEventMergeArtifactV2,
  occurrenceAnalysisRouteId,
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

function importFixture(fixture: ReleaseFixture, output = "import.json") {
  return runMtaWikiOperationalOccurrenceImport({
    mtaWikiRoot: fixture.root,
    wikiRelease: fixture.releaseId,
    wikiManifestSha256: fixture.manifestSha256,
    output: join(fixture.root, output),
  });
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
