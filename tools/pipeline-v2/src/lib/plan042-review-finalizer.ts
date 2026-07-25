import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import {
  type Plan042AcceptanceManifest,
  Plan042AcceptanceManifestSchema,
  type Plan042IndependentReviewReceipt,
  Plan042IndependentReviewReceiptSchema,
  type Plan042ReviewHandoffArtifact,
  Plan042ReviewHandoffArtifactSchema,
} from "@bp/domain/studio/member-grain-outcomes";
import type { Schema } from "effect";
import { sha256Bytes, stableJson, validatePlan042ReviewHandoff } from "./plan042-member-grain.ts";
import { decodeSchemaStrict } from "./schema-decode.ts";

function decodeJson<T>(schema: Schema.Constraint, bytes: Uint8Array, label: string): T {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (cause) {
    throw new Error(`${label}: invalid JSON: ${String(cause)}`);
  }
  return decodeSchemaStrict(schema, value) as T;
}

async function load<T>(
  schema: Schema.Constraint,
  path: string,
): Promise<{ readonly value: T; readonly bytes: Uint8Array }> {
  const bytes = new Uint8Array(await readFile(path));
  return { value: decodeJson<T>(schema, bytes, path), bytes };
}

function repositoryPath(repositoryRoot: string, path: string): string {
  if (!isAbsolute(path)) throw new Error(`${path}: expected absolute input path`);
  const value = relative(repositoryRoot, path);
  if (value.length === 0 || value === ".." || value.startsWith("../") || value.startsWith("/")) {
    throw new Error(`${path}: review artifact must be inside the repository`);
  }
  return value;
}

export async function finalizePlan042ReviewHandoff(input: {
  readonly repositoryRoot: string;
  readonly pendingHandoffPath: string;
  readonly acceptanceManifestPath: string;
  readonly reviewReceiptDir: string;
}): Promise<Plan042ReviewHandoffArtifact> {
  const [pendingFile, acceptanceFile] = await Promise.all([
    load<Plan042ReviewHandoffArtifact>(
      Plan042ReviewHandoffArtifactSchema,
      input.pendingHandoffPath,
    ),
    load<Plan042AcceptanceManifest>(Plan042AcceptanceManifestSchema, input.acceptanceManifestPath),
  ]);
  const pending = pendingFile.value;
  const acceptance = acceptanceFile.value;
  if (
    pending.status !== "pending_independent_review" ||
    pending.review_cut_id !== acceptance.review_cut_id ||
    pending.candidate_set_id !== acceptance.candidate_set_id ||
    pending.package_results.length !== acceptance.package_results.length
  ) {
    throw new Error("Pending handoff and acceptance manifest identities differ");
  }
  for (const [index, packageResult] of pending.package_results.entries()) {
    const accepted = acceptance.package_results[index];
    if (
      accepted === undefined ||
      stableJson({
        package_id: packageResult.package_id,
        candidate_or_member_count: packageResult.candidate_or_member_count,
        item_ids: packageResult.item_ids,
        item_ids_sha256: packageResult.item_ids_sha256,
        risk_class: packageResult.risk_class,
      }) !==
        stableJson({
          package_id: accepted.package_id,
          candidate_or_member_count: accepted.candidate_or_member_count,
          item_ids: accepted.item_ids,
          item_ids_sha256: accepted.item_ids_sha256,
          risk_class: accepted.risk_class,
        })
    ) {
      throw new Error(`${packageResult.package_id}: acceptance package drifted`);
    }
  }
  const manifestPath = repositoryPath(input.repositoryRoot, input.acceptanceManifestPath);
  const manifestSha256 = sha256Bytes(acceptanceFile.bytes);
  const receiptFiles = (await readdir(input.reviewReceiptDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(input.reviewReceiptDir, entry.name))
    .toSorted();
  if (receiptFiles.length === 0) throw new Error("No independent review receipts found");
  const receipts = await Promise.all(
    receiptFiles.map(async (path) => {
      const file = await load<Plan042IndependentReviewReceipt>(
        Plan042IndependentReviewReceiptSchema,
        path,
      );
      const receipt = file.value;
      if (
        receipt.reviewed_acceptance_manifest.path !== manifestPath ||
        receipt.reviewed_acceptance_manifest.sha256 !== manifestSha256 ||
        receipt.reviewed_review_cut_id !== acceptance.review_cut_id
      ) {
        throw new Error(`${path}: independent review target drifted`);
      }
      const sortedPackageIds = [...receipt.package_ids].toSorted();
      if (
        new Set(sortedPackageIds).size !== sortedPackageIds.length ||
        stableJson(sortedPackageIds) !== stableJson(receipt.package_ids)
      ) {
        throw new Error(`${path}: reviewed package ids must be sorted and unique`);
      }
      return {
        receipt,
        path: repositoryPath(input.repositoryRoot, path),
        sha256: sha256Bytes(file.bytes),
      };
    }),
  );
  const knownPackageIds = new Set(pending.package_results.map((result) => result.package_id));
  if (
    receipts.some(({ receipt }) =>
      receipt.package_ids.some((packageId) => !knownPackageIds.has(packageId)),
    )
  ) {
    throw new Error("Independent review receipt names an unknown package");
  }
  const finalized = decodeSchemaStrict(Plan042ReviewHandoffArtifactSchema, {
    ...pending,
    status: "reviewed_authority_false",
    package_results: pending.package_results.map((packageResult) => {
      const packageReceipts = receipts.filter(({ receipt }) =>
        receipt.package_ids.includes(packageResult.package_id),
      );
      return {
        ...packageResult,
        reviewer_result:
          packageResult.risk_class === "risky"
            ? "dual_independent_review_passed"
            : "independent_review_passed",
        review_receipts: packageReceipts.map(({ receipt, path, sha256 }) => ({
          reviewer_id: receipt.reviewer_id,
          artifact_path: path,
          artifact_sha256: sha256,
          reviewed_acceptance_manifest_sha256: manifestSha256,
          reviewed_review_cut_id: acceptance.review_cut_id,
          verdict: receipt.verdict,
        })),
      };
    }),
  });
  validatePlan042ReviewHandoff(finalized, manifestSha256);
  return finalized;
}
