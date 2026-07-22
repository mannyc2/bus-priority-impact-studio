import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MtaWikiOperationalOccurrenceImportArtifactV5 } from "@bp/domain/documents/operational-occurrence";
import {
  runMtaWikiMemberExtentImport,
  validateMtaWikiMemberExtentImportArtifact,
} from "../../src/lib/mta-wiki-member-extents.ts";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const occurrenceRow = {
  occurrence_id: "occurrence:test",
  occurrence_review_decision_id: "decision:test",
  routes: [{ route_record_id: "route:test", gtfs_route_id: "Q1" }],
  treatment: {
    kind: "atomic" as const,
    member: { treatment_record_id: "treatment:test", treatment_family: "bus_lane" },
  },
  study_projection_eligible: true,
};

function occurrenceImport(): MtaWikiOperationalOccurrenceImportArtifactV5 {
  return {
    sourceRelease: {
      releaseId: "v1-rc-fixture",
      generatorCommit: "1".repeat(40),
      manifestPath: "data/exports/releases/v1-rc-fixture/manifest.json",
      manifestSha256: "a".repeat(64),
      occurrences: { bytes: 123, sha256: "b".repeat(64) },
    },
    occurrences: [occurrenceRow],
  } as unknown as MtaWikiOperationalOccurrenceImportArtifactV5;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bp-member-extents-test-"));
  const directory = join(root, "data/contracts/operational-occurrence-member-extent/v1");
  await mkdir(directory, { recursive: true });
  const row = {
    schema_version: 1,
    contract_id: "operational-occurrence-member-extent-v1",
    extent_id: "member-extent:test",
    occurrence_id: "occurrence:test",
    occurrence_review_decision_id: "decision:test",
    route_record_id: "route:test",
    gtfs_route_id: "Q1",
    treatment_record_id: "treatment:test",
    treatment_family: "bus_lane",
    extent: "unresolved",
    components: [],
    evidence_bindings: [],
    missing_roles: ["reviewed_extent_decision"],
    decision_id: null,
    rationale: "No reviewed exact member extent exists.",
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  const projection = `${JSON.stringify(row)}\n`;
  const summary = `${JSON.stringify({
    schema_version: 1,
    contract_id: "operational-occurrence-member-extent-v1",
    release_id: "v1-rc-fixture",
    occurrence_count: 1,
    member_extent_row_count: 1,
    eligible_member_extent_row_count: 1,
    reviewed_decision_count: 0,
    extent_counts: { route_wide: 0, bounded_segment: 0, stop_set: 0, mixed: 0, unresolved: 1 },
    evidence_complete_row_count: 0,
    unresolved_row_count: 1,
    doctrine: {
      empty_scope_is_unresolved: true,
      route_membership_is_not_route_wide_evidence: true,
      physicality_not_applicable_is_not_route_wide_evidence: true,
      authorizes_study: false,
      authorizes_cross_product: false,
    },
  })}\n`;
  const contract = "{}\n";
  const ledger = "";
  const files = [
    {
      path: "data/contracts/operational-occurrence-member-extent/v1/contract.json",
      text: contract,
    },
    {
      path: "data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl",
      text: projection,
      row_count: 1,
    },
    {
      path: "data/contracts/operational-occurrence-member-extent/v1/review-ledger.jsonl",
      text: ledger,
      row_count: 0,
    },
    { path: "data/contracts/operational-occurrence-member-extent/v1/summary.json", text: summary },
  ];
  for (const file of files) await writeFile(join(root, file.path), file.text);
  const manifest = `${JSON.stringify({
    schema_version: 1,
    contract_id: "operational-occurrence-member-extent-v1",
    input_pins: [
      {
        path: "data/exports/releases/v1-rc-fixture/operational_occurrences.jsonl",
        bytes: 123,
        sha256: "b".repeat(64),
        row_count: 1,
      },
    ],
    files: files.map((file) => ({
      path: file.path,
      bytes: new TextEncoder().encode(file.text).byteLength,
      sha256: sha256(file.text),
      ...(file.row_count === undefined ? {} : { row_count: file.row_count }),
    })),
  })}\n`;
  const manifestPath = "data/contracts/operational-occurrence-member-extent/v1/manifest.json";
  await writeFile(join(root, manifestPath), manifest);
  const projectionFile = files[1];
  if (projectionFile === undefined) throw new Error("fixture projection is missing");
  return {
    root,
    manifestPath,
    manifestSha256: sha256(manifest),
    projectionPath: projectionFile.path,
  };
}

describe("MTA Wiki member-extent import", () => {
  test("pins every producer file and emits deterministic exact-grain bytes", async () => {
    const source = await fixture();
    const firstOutput = join(source.root, "first.json");
    const secondOutput = join(source.root, "second.json");
    const first = await runMtaWikiMemberExtentImport({
      occurrenceImport: occurrenceImport(),
      mtaWikiRoot: source.root,
      memberExtentManifestPath: source.manifestPath,
      memberExtentManifestSha256: source.manifestSha256,
      output: firstOutput,
    });
    const second = await runMtaWikiMemberExtentImport({
      occurrenceImport: occurrenceImport(),
      mtaWikiRoot: source.root,
      memberExtentManifestPath: source.manifestPath,
      memberExtentManifestSha256: source.manifestSha256,
      output: secondOutput,
    });
    expect(first.sourceRelease.memberExtent.identityGrain).toBe("occurrence_route_member");
    expect(first.memberExtents[0]?.treatment_record_id).toBe("treatment:test");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(await readFile(firstOutput, "utf8")).toBe(await readFile(secondOutput, "utf8"));
    expect(() =>
      validateMtaWikiMemberExtentImportArtifact(first, occurrenceImport()),
    ).not.toThrow();
  });

  test("rejects a file changed after the immutable manifest was pinned", async () => {
    const source = await fixture();
    await writeFile(join(source.root, source.projectionPath), "{}\n");
    await expect(
      runMtaWikiMemberExtentImport({
        occurrenceImport: occurrenceImport(),
        mtaWikiRoot: source.root,
        memberExtentManifestPath: source.manifestPath,
        memberExtentManifestSha256: source.manifestSha256,
      }),
    ).rejects.toThrow("byte-count mismatch");
  });

  test("rejects an occurrence release or denominator mismatch", async () => {
    const source = await fixture();
    const stale = occurrenceImport();
    (stale.sourceRelease.occurrences as { sha256: string }).sha256 = "c".repeat(64);
    await expect(
      runMtaWikiMemberExtentImport({
        occurrenceImport: stale,
        mtaWikiRoot: source.root,
        memberExtentManifestPath: source.manifestPath,
        memberExtentManifestSha256: source.manifestSha256,
      }),
    ).rejects.toThrow("does not pin the exact imported occurrence payload");
  });
});
