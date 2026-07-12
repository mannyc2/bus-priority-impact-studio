import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createLocalPipelineDb } from "@bp/db/local";
import command from "../src/commands/studio/import-mta-wiki-operational-anchors.ts";
import { runStudyEventMerge } from "../src/commands/study/merge-events.ts";
import { runMtaWikiOperationalAnchorImport } from "../src/lib/mta-wiki-operational-anchors.ts";
import { buildStudyEventMergeArtifact } from "../src/lib/study-engine/study-events.ts";

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
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

describe("manifest-pinned MTA Wiki operational-anchor import", () => {
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

  test("registers the strict importer as a two-part studio command", () => {
    expect(command.path).toEqual(["studio", "import-mta-wiki-operational-anchors"]);
  });
});
