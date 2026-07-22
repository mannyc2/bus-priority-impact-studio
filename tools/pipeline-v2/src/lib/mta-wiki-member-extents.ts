import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  type MtaWikiOperationalOccurrenceImportArtifactV4,
  type MtaWikiOperationalOccurrenceImportArtifactV5,
  type MtaWikiOperationalOccurrenceMemberExtentImportArtifactV1,
  MtaWikiOperationalOccurrenceMemberExtentImportArtifactV1Schema,
  OperationalOccurrenceMemberExtentManifestV1Schema,
  OperationalOccurrenceMemberExtentReviewDecisionV1Schema,
  OperationalOccurrenceMemberExtentRowV1Schema,
  OperationalOccurrenceMemberExtentSummaryV1Schema,
} from "@bp/domain/documents/operational-occurrence";
import { writeJson } from "./json.ts";
import { isSafeMtaWikiReleaseRelativePath, sha256Bytes } from "./mta-wiki-release.ts";
import { decodeSchemaStrict } from "./schema-decode.ts";
import { validateOperationalOccurrenceMemberExtents } from "./study-engine/member-extents.ts";

export type ImportMtaWikiMemberExtentsInput = {
  readonly occurrenceImport:
    | MtaWikiOperationalOccurrenceImportArtifactV4
    | MtaWikiOperationalOccurrenceImportArtifactV5;
  readonly mtaWikiRoot: string;
  readonly memberExtentManifestPath: string;
  readonly memberExtentManifestSha256: string;
  readonly output?: string | undefined;
};

function pathInside(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path);
  return (
    pathFromRoot.length > 0 &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

async function readPinnedFile(input: {
  readonly root: string;
  readonly relativePath: string;
  readonly bytes: number;
  readonly sha256: string;
}): Promise<Uint8Array> {
  if (!isSafeMtaWikiReleaseRelativePath(input.relativePath)) {
    throw new Error(`Unsafe MTA Wiki member-extent path: ${input.relativePath}`);
  }
  const canonicalRoot = await realpath(input.root);
  const target = resolve(canonicalRoot, input.relativePath);
  const canonicalTarget = await realpath(target);
  if (!pathInside(canonicalRoot, canonicalTarget)) {
    throw new Error(`MTA Wiki member-extent path escapes its repository: ${input.relativePath}`);
  }
  const bytes = await readFile(canonicalTarget);
  if (bytes.byteLength !== input.bytes) {
    throw new Error(
      `Member-extent byte-count mismatch for ${input.relativePath}: expected ${input.bytes}, received ${bytes.byteLength}`,
    );
  }
  const actualSha256 = sha256Bytes(bytes);
  if (actualSha256 !== input.sha256) {
    throw new Error(
      `Member-extent SHA-256 mismatch for ${input.relativePath}: expected ${input.sha256}, received ${actualSha256}`,
    );
  }
  return bytes;
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`Member-extent file is not valid UTF-8 at ${path}: ${String(cause)}`);
  }
}

function parseStrictJson<T>(input: {
  readonly bytes: Uint8Array;
  readonly path: string;
  readonly decode: (value: unknown) => T;
}): T {
  const text = decodeUtf8(input.bytes, input.path);
  try {
    return input.decode(JSON.parse(text) as unknown);
  } catch (cause) {
    throw new Error(`Invalid member-extent JSON at ${input.path}: ${String(cause)}`);
  }
}

function parseStrictJsonl(input: {
  readonly bytes: Uint8Array;
  readonly path: string;
  readonly expectedRowCount: number;
  readonly decode: (value: unknown) => unknown;
}) {
  const text = decodeUtf8(input.bytes, input.path);
  if (input.expectedRowCount === 0 && text.length === 0) return [];
  if (text.includes("\r") || !text.endsWith("\n")) {
    throw new Error(`${input.path} must use canonical LF-delimited JSON with a trailing newline`);
  }
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== input.expectedRowCount || lines.some((line) => line.length === 0)) {
    throw new Error(
      `Member-extent JSONL row-count mismatch at ${input.path}: expected ${input.expectedRowCount}, received ${lines.length}`,
    );
  }
  return lines.map((line, index) => {
    try {
      return input.decode(JSON.parse(line));
    } catch (cause) {
      throw new Error(`Invalid member-extent row ${index + 1} at ${input.path}: ${String(cause)}`);
    }
  });
}

function reviewKey(input: {
  readonly occurrence_id: string;
  readonly route_record_id: string;
  readonly treatment_record_id: string;
}): string {
  return `${input.occurrence_id}\u0000${input.route_record_id}\u0000${input.treatment_record_id}`;
}

function uniqueManifestFile(
  files: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly row_count?: number | undefined;
  }[],
  suffix: string,
) {
  const matches = files.filter((file) => file.path.endsWith(suffix));
  if (matches.length !== 1) {
    throw new Error(`Member-extent manifest must contain exactly one ${suffix} receipt`);
  }
  const match = matches[0];
  if (match === undefined) throw new Error("unreachable member-extent manifest lookup");
  return match;
}

function countsByExtent(
  rows: readonly {
    readonly extent: "route_wide" | "bounded_segment" | "stop_set" | "mixed" | "unresolved";
  }[],
) {
  const counts = { route_wide: 0, bounded_segment: 0, stop_set: 0, mixed: 0, unresolved: 0 };
  for (const row of rows) counts[row.extent] += 1;
  return counts;
}

export function validateMtaWikiMemberExtentImportArtifact(
  artifact: MtaWikiOperationalOccurrenceMemberExtentImportArtifactV1,
  occurrences:
    | MtaWikiOperationalOccurrenceImportArtifactV4
    | MtaWikiOperationalOccurrenceImportArtifactV5,
): MtaWikiOperationalOccurrenceMemberExtentImportArtifactV1 {
  const addressedCompanion =
    "memberExtentCompanion" in occurrences.sourceRelease
      ? occurrences.sourceRelease.memberExtentCompanion
      : undefined;
  if (
    addressedCompanion === undefined ||
    artifact.sourceRelease.releaseId !== occurrences.sourceRelease.releaseId ||
    artifact.sourceRelease.generatorCommit !== occurrences.sourceRelease.generatorCommit ||
    artifact.sourceRelease.manifestPath !== occurrences.sourceRelease.manifestPath ||
    artifact.sourceRelease.manifestSha256 !== occurrences.sourceRelease.manifestSha256 ||
    artifact.sourceRelease.occurrencesSha256 !== occurrences.sourceRelease.occurrences.sha256 ||
    artifact.sourceRelease.memberExtent.sourceOccurrenceReleaseId !==
      artifact.producerSummary.release_id ||
    artifact.sourceRelease.memberExtent.manifest.path !== addressedCompanion.manifest.path ||
    artifact.sourceRelease.memberExtent.manifest.bytes !== addressedCompanion.manifest.bytes ||
    artifact.sourceRelease.memberExtent.manifest.sha256 !== addressedCompanion.manifest.sha256
  ) {
    throw new Error(
      "Member-extent artifact does not bind the exact operational-occurrence release",
    );
  }
  const projection = artifact.sourceRelease.memberExtent.projection;
  const contract = artifact.sourceRelease.memberExtent.contract;
  const reviewLedger = artifact.sourceRelease.memberExtent.reviewLedger;
  const summary = artifact.sourceRelease.memberExtent.summary;
  if (
    projection.row_count !== artifact.memberExtents.length ||
    artifact.summary.memberExtentRowCount !== artifact.memberExtents.length ||
    artifact.producerSummary.member_extent_row_count !== artifact.memberExtents.length ||
    artifact.summary.occurrenceCount !== occurrences.occurrences.length ||
    artifact.producerSummary.occurrence_count !== occurrences.occurrences.length
  ) {
    throw new Error("Member-extent artifact counts do not match the pinned occurrence denominator");
  }
  if (
    reviewLedger.row_count !== artifact.producerReviewLedger.length ||
    artifact.producerSummary.reviewed_decision_count !== artifact.producerReviewLedger.length
  ) {
    throw new Error("Member-extent review ledger count does not match its exact receipt");
  }
  if (
    artifact.producerSummary.eligible_member_extent_row_count !==
      artifact.summary.eligibleMemberExtentRowCount ||
    JSON.stringify(artifact.producerSummary.extent_counts) !==
      JSON.stringify(artifact.summary.countsByExtent) ||
    JSON.stringify(countsByExtent(artifact.memberExtents)) !==
      JSON.stringify(artifact.summary.countsByExtent)
  ) {
    throw new Error("Member-extent artifact summary does not match its exact rows");
  }
  if (
    !artifact.producerManifest.files.some(
      (file) => file.path === contract.path && file.sha256 === contract.sha256,
    ) ||
    !artifact.producerManifest.files.some(
      (file) => file.path === projection.path && file.sha256 === projection.sha256,
    ) ||
    !artifact.producerManifest.files.some(
      (file) => file.path === summary.path && file.sha256 === summary.sha256,
    ) ||
    !artifact.producerManifest.files.some(
      (file) => file.path === reviewLedger.path && file.sha256 === reviewLedger.sha256,
    )
  ) {
    throw new Error("Member-extent artifact receipts are absent from the pinned manifest");
  }
  const memberByKey = new Map(artifact.memberExtents.map((row) => [reviewKey(row), row]));
  let priorReviewKey = "";
  const reviewDecisionIds = new Set<string>();
  for (const decision of artifact.producerReviewLedger) {
    const key = reviewKey(decision);
    if (key <= priorReviewKey || reviewDecisionIds.has(decision.decision_id)) {
      throw new Error("Member-extent review ledger must be sorted and uniquely identified");
    }
    priorReviewKey = key;
    reviewDecisionIds.add(decision.decision_id);
    const member = memberByKey.get(key);
    if (
      member === undefined ||
      member.decision_id !== decision.decision_id ||
      member.extent !== decision.resolution ||
      member.rationale !== decision.rationale ||
      JSON.stringify(member.components) !== JSON.stringify(decision.components) ||
      JSON.stringify(member.evidence_bindings) !== JSON.stringify(decision.evidence_bindings) ||
      JSON.stringify(member.missing_roles) !== JSON.stringify(decision.missing_roles)
    ) {
      throw new Error(`Member-extent review ledger does not match projection row ${key}`);
    }
  }
  validateOperationalOccurrenceMemberExtents({
    occurrences: occurrences.occurrences,
    rows: artifact.memberExtents,
    lineage: {
      identityGrain: "occurrence_route_member",
      sourceOccurrenceReleaseId: artifact.sourceRelease.memberExtent.sourceOccurrenceReleaseId,
      manifestSha256: artifact.sourceRelease.memberExtent.manifest.sha256,
      projectionSha256: projection.sha256,
      rowCount: artifact.summary.memberExtentRowCount,
      eligibleRowCount: artifact.summary.eligibleMemberExtentRowCount,
    },
  });
  return artifact;
}

/** Import a separately pinned producer companion. Forecast overlays are never read here. */
export async function runMtaWikiMemberExtentImport(
  input: ImportMtaWikiMemberExtentsInput,
): Promise<MtaWikiOperationalOccurrenceMemberExtentImportArtifactV1> {
  const addressedCompanion =
    "memberExtentCompanion" in input.occurrenceImport.sourceRelease
      ? input.occurrenceImport.sourceRelease.memberExtentCompanion
      : undefined;
  if (addressedCompanion === undefined || addressedCompanion.contractVersion !== 1) {
    throw new Error(
      "Pinned occurrence release does not address operational-occurrence-member-extent-v1",
    );
  }
  if (
    input.memberExtentManifestPath !== addressedCompanion.manifest.path ||
    input.memberExtentManifestSha256 !== addressedCompanion.manifest.sha256
  ) {
    throw new Error("Member-extent input does not match the release-addressed companion manifest");
  }
  if (!isSafeMtaWikiReleaseRelativePath(input.memberExtentManifestPath)) {
    throw new Error(`Unsafe member-extent manifest path: ${input.memberExtentManifestPath}`);
  }
  const canonicalRoot = await realpath(input.mtaWikiRoot);
  const manifestTarget = resolve(canonicalRoot, input.memberExtentManifestPath);
  const canonicalManifest = await realpath(manifestTarget);
  if (!pathInside(canonicalRoot, canonicalManifest)) {
    throw new Error(
      `MTA Wiki member-extent manifest escapes its repository: ${input.memberExtentManifestPath}`,
    );
  }
  const manifestBytes = await readFile(canonicalManifest);
  if (manifestBytes.byteLength !== addressedCompanion.manifest.bytes) {
    throw new Error(
      `Member-extent manifest byte-count mismatch: expected ${addressedCompanion.manifest.bytes}, received ${manifestBytes.byteLength}`,
    );
  }
  const manifestSha256 = sha256Bytes(manifestBytes);
  if (manifestSha256 !== input.memberExtentManifestSha256) {
    throw new Error(
      `Member-extent manifest SHA-256 mismatch: expected ${input.memberExtentManifestSha256}, received ${manifestSha256}`,
    );
  }
  const producerManifest = parseStrictJson({
    bytes: manifestBytes,
    path: input.memberExtentManifestPath,
    decode: (value) => decodeSchemaStrict(OperationalOccurrenceMemberExtentManifestV1Schema, value),
  });
  const verifiedFiles = new Map<string, Uint8Array>();
  for (const receipt of producerManifest.files) {
    const addressedPath = `data/exports/releases/${input.occurrenceImport.sourceRelease.releaseId}/member-extent/${receipt.path}`;
    verifiedFiles.set(
      receipt.path,
      await readPinnedFile({
        root: input.mtaWikiRoot,
        relativePath: addressedPath,
        bytes: receipt.bytes,
        sha256: receipt.sha256,
      }),
    );
  }
  const projectionReceipt = uniqueManifestFile(
    producerManifest.files,
    "/operational_occurrence_member_extents.jsonl",
  );
  const contractReceipt = uniqueManifestFile(producerManifest.files, "/contract.json");
  if (projectionReceipt.row_count === undefined) {
    throw new Error("Member-extent projection receipt must include row_count");
  }
  const reviewLedgerReceipt = uniqueManifestFile(producerManifest.files, "/review-ledger.jsonl");
  if (reviewLedgerReceipt.row_count === undefined) {
    throw new Error("Member-extent review-ledger receipt must include row_count");
  }
  const summaryReceipt = uniqueManifestFile(producerManifest.files, "/summary.json");
  const projectionBytes = verifiedFiles.get(projectionReceipt.path);
  const summaryBytes = verifiedFiles.get(summaryReceipt.path);
  const reviewLedgerBytes = verifiedFiles.get(reviewLedgerReceipt.path);
  if (
    projectionBytes === undefined ||
    summaryBytes === undefined ||
    reviewLedgerBytes === undefined
  ) {
    throw new Error("Member-extent manifest verification omitted required files");
  }
  const memberExtents = parseStrictJsonl({
    bytes: projectionBytes,
    path: projectionReceipt.path,
    expectedRowCount: projectionReceipt.row_count,
    decode: (value) => decodeSchemaStrict(OperationalOccurrenceMemberExtentRowV1Schema, value),
  }) as MtaWikiOperationalOccurrenceMemberExtentImportArtifactV1["memberExtents"];
  const producerReviewLedger = parseStrictJsonl({
    bytes: reviewLedgerBytes,
    path: reviewLedgerReceipt.path,
    expectedRowCount: reviewLedgerReceipt.row_count,
    decode: (value) =>
      decodeSchemaStrict(OperationalOccurrenceMemberExtentReviewDecisionV1Schema, value),
  }) as MtaWikiOperationalOccurrenceMemberExtentImportArtifactV1["producerReviewLedger"];
  const producerSummary = parseStrictJson({
    bytes: summaryBytes,
    path: summaryReceipt.path,
    decode: (value) => decodeSchemaStrict(OperationalOccurrenceMemberExtentSummaryV1Schema, value),
  });
  const occurrencePinMatches = producerManifest.input_pins.filter(
    (pin) =>
      pin.sha256 === input.occurrenceImport.sourceRelease.occurrences.sha256 &&
      pin.bytes === input.occurrenceImport.sourceRelease.occurrences.bytes &&
      pin.row_count === input.occurrenceImport.occurrences.length,
  );
  if (occurrencePinMatches.length !== 1) {
    throw new Error("Member-extent manifest does not pin the exact imported occurrence payload");
  }
  const counts = countsByExtent(memberExtents);
  const artifact = decodeSchemaStrict(
    MtaWikiOperationalOccurrenceMemberExtentImportArtifactV1Schema,
    {
      artifactKind: "bp.studio.mta_wiki_member_extents.v1",
      schemaVersion: 1,
      sourceRelease: {
        releaseId: input.occurrenceImport.sourceRelease.releaseId,
        generatorCommit: input.occurrenceImport.sourceRelease.generatorCommit,
        manifestPath: input.occurrenceImport.sourceRelease.manifestPath,
        manifestSha256: input.occurrenceImport.sourceRelease.manifestSha256,
        occurrencesSha256: input.occurrenceImport.sourceRelease.occurrences.sha256,
        memberExtent: {
          contractId: "operational-occurrence-member-extent-v1",
          identityGrain: "occurrence_route_member",
          sourceOccurrenceReleaseId: producerSummary.release_id,
          manifest: {
            path: input.memberExtentManifestPath,
            bytes: manifestBytes.byteLength,
            sha256: manifestSha256,
          },
          contract: contractReceipt,
          projection: projectionReceipt,
          reviewLedger: reviewLedgerReceipt,
          summary: summaryReceipt,
        },
      },
      producerManifest,
      producerSummary,
      producerReviewLedger,
      summary: {
        occurrenceCount: input.occurrenceImport.occurrences.length,
        memberExtentRowCount: memberExtents.length,
        eligibleMemberExtentRowCount: producerSummary.eligible_member_extent_row_count,
        countsByExtent: counts,
      },
      memberExtents,
    },
  );
  const validated = validateMtaWikiMemberExtentImportArtifact(artifact, input.occurrenceImport);
  if (input.output !== undefined) await writeJson(input.output, validated);
  return validated;
}
