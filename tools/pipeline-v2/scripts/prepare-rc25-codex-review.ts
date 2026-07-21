import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  classifyRouteSpeedSpineArtifact,
  routeSpeedSpineRouteSlug,
} from "@bp/analytics/feature-history";
import { admitStudyTreatmentScope } from "../src/lib/study-engine/scope.ts";

// biome-ignore lint/suspicious/noExplicitAny: frozen review artifacts are decoded dynamically.
type Json = any;

const EXPECTED_CANDIDATE_SET_ID = "candidate-set-v3:575ee30a44f2e141e97f6a77";
const EXPECTED_CANDIDATE_SHA256 =
  "b66c0cd70afdf99a0fa2779d9b0574ba328bcc5f49c7d0177eaa029b0bb2c195";

const args = new Map<string, string>();
for (let index = 2; index < Bun.argv.length; index += 2) {
  const flag = Bun.argv[index];
  const value = Bun.argv[index + 1];
  if (!flag?.startsWith("--") || value === undefined) {
    throw new Error(`Expected --flag value, received ${flag ?? "end of arguments"}`);
  }
  args.set(flag.slice(2), value);
}
const required = (name: string): string => {
  const value = args.get(name);
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
};
const readJson = (path: string): Json => JSON.parse(readFileSync(path, "utf8"));
const sha256Bytes = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const sha256 = (path: string): string => sha256Bytes(readFileSync(path));
const canonicalSha256 = (value: unknown): string =>
  sha256Bytes(Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));
const identity = (candidate: Json): string =>
  [
    candidate.routeId,
    candidate.treatmentFamily,
    candidate.implementationDate,
    candidate.datePrecision,
  ].join("|");
const monthIndex = (month: string): number => {
  const [year = 0, value = 0] = month.split("-").map(Number);
  return year * 12 + value - 1;
};
const isoMonth = (value: number): string =>
  `${String(Math.floor(value / 12)).padStart(4, "0")}-${String((value % 12) + 1).padStart(2, "0")}`;
const outcomeWindow = (implementationMonth: string, analysisMonth: string) => {
  const implementation = monthIndex(implementationMonth);
  const floor = monthIndex("2023-04");
  const analysis = monthIndex(analysisMonth);
  const preMonths: string[] = [];
  const postMonths: string[] = [];
  for (let value = Math.max(floor, implementation - 6); value <= implementation - 1; value += 1) {
    if (value <= analysis) preMonths.push(isoMonth(value));
  }
  for (
    let value = Math.max(floor, implementation + 1);
    value <= Math.min(analysis, implementation + 6);
    value += 1
  ) {
    postMonths.push(isoMonth(value));
  }
  return {
    analysisMonth,
    preMonths,
    postMonths,
    preMonthCount: preMonths.length,
    postMonthCount: postMonths.length,
    calendarMinimumFourPerSide: preMonths.length >= 4 && postMonths.length >= 4,
  };
};

const candidatePath = required("candidate");
const scopeBindingsPath = required("scope-bindings");
const historicalReviewPath = required("historical-review");
const spineRoot = required("spine-root");
const outputRoot = required("output-root");
const analysisMonth = required("analysis-month");

const candidateSet = readJson(candidatePath);
const scopeBindingsArtifact = readJson(scopeBindingsPath);
const historicalReview = readJson(historicalReviewPath);
if (
  candidateSet.artifactKind !== "bp.studio.study_events.v3" ||
  candidateSet.candidateSetId !== EXPECTED_CANDIDATE_SET_ID ||
  candidateSet.approvalState !== "awaiting_approval" ||
  candidateSet.approval !== null
) {
  throw new Error("Review input must be the frozen, unapproved rc25 v3 candidate set");
}
if (sha256(candidatePath) !== EXPECTED_CANDIDATE_SHA256) {
  throw new Error("Frozen rc25 candidate artifact hash mismatch");
}
if (
  scopeBindingsArtifact.candidateSetId !== candidateSet.candidateSetId ||
  scopeBindingsArtifact.analysisMonth !== analysisMonth
) {
  throw new Error("Scope-binding candidate set or analysis month mismatch");
}
if (historicalReview.authorization !== "non_authorizing_recommendation_only") {
  throw new Error("Historical rc19 context must remain explicitly non-authorizing");
}

const bindingByCandidateId = new Map<string, Json>();
for (const binding of scopeBindingsArtifact.bindings as Json[]) {
  if (bindingByCandidateId.has(binding.candidateId)) {
    throw new Error(`Duplicate physical-scope binding: ${binding.candidateId}`);
  }
  bindingByCandidateId.set(binding.candidateId, binding);
}
const historicalByCandidateId = new Map<string, Json>();
for (const recommendation of historicalReview.recommendations as Json[]) {
  if (historicalByCandidateId.has(recommendation.candidateId)) {
    throw new Error(`Duplicate historical recommendation: ${recommendation.candidateId}`);
  }
  historicalByCandidateId.set(recommendation.candidateId, recommendation);
}

const candidates = [...candidateSet.candidates].toSorted((left: Json, right: Json) =>
  left.candidateId.localeCompare(right.candidateId),
);
if (
  candidates.length !== 486 ||
  new Set(candidates.map((row: Json) => row.candidateId)).size !== 486
) {
  throw new Error("Frozen rc25 review must contain exactly 486 unique candidates");
}

const uniqueRouteIds = [...new Set(candidates.map((candidate: Json) => candidate.routeId))].sort();
const spineByRouteId = new Map<string, Json>();
for (const routeId of uniqueRouteIds) {
  const routeSlug = routeSpeedSpineRouteSlug(routeId);
  const path = join(spineRoot, routeSlug, "speed-spine.json");
  if (!existsSync(path)) {
    spineByRouteId.set(routeId, {
      routeId,
      routeSlug,
      artifactPath: `data/artifacts/studio/v2/routes/${routeSlug}/speed-spine.json`,
      artifactSha256: null,
      readiness: "missing",
      reasons: ["speed_spine_artifact_missing"],
      monthCount: 0,
      coverage: null,
    });
    continue;
  }
  const artifact = readJson(path);
  if (artifact.routeId !== routeId) {
    throw new Error(`Route spine identity mismatch for ${routeId}: ${artifact.routeId}`);
  }
  const audit = classifyRouteSpeedSpineArtifact(artifact);
  spineByRouteId.set(routeId, {
    routeId,
    routeSlug,
    artifactPath: `data/artifacts/studio/v2/routes/${routeSlug}/speed-spine.json`,
    artifactSha256: sha256(path),
    readiness: audit.readiness,
    reasons: audit.reasons,
    monthCount: artifact.summary.monthCount,
    coverage: audit.coverage,
  });
}
const spineSnapshot = {
  artifactKind: "bp.studio.codex_review_spine_snapshot.v1",
  analysisMonth,
  routeCount: uniqueRouteIds.length,
  routes: uniqueRouteIds.map((routeId) => spineByRouteId.get(routeId)),
};

const enriched = candidates.map((candidate: Json) => {
  const historical = historicalByCandidateId.get(candidate.candidateId);
  if (historical === undefined || historical.identity !== identity(candidate)) {
    throw new Error(`Missing unchanged-identity historical context: ${candidate.candidateId}`);
  }
  const binding = bindingByCandidateId.get(candidate.candidateId);
  const scopeAdmission = admitStudyTreatmentScope(candidate, binding);
  const candidateMonth = monthIndex(candidate.implementationMonth);
  const nearbySameRouteCandidates = candidates
    .filter(
      (other: Json) =>
        other.candidateId !== candidate.candidateId &&
        other.routeId === candidate.routeId &&
        Math.abs(monthIndex(other.implementationMonth) - candidateMonth) <= 9,
    )
    .map((other: Json) => ({
      candidateId: other.candidateId,
      identity: identity(other),
      treatmentFamily: other.treatmentFamily,
      implementationDate: other.implementationDate,
      implementationMonth: other.implementationMonth,
      monthDistance: monthIndex(other.implementationMonth) - candidateMonth,
      occurrenceId: other.occurrenceId ?? null,
      provenanceKinds: [...new Set(other.provenance.map((row: Json) => row.sourceKind))].sort(),
    }));
  return {
    candidateId: candidate.candidateId,
    identity: identity(candidate),
    candidate,
    currentAdmission: {
      scope: scopeAdmission,
      spine: spineByRouteId.get(candidate.routeId),
      outcomeWindow: outcomeWindow(candidate.implementationMonth, analysisMonth),
      nearbySameRouteCandidates,
    },
    historicalContext: {
      notice: "Superseded rc19 recommendation; context only, never authority for rc25.",
      candidateSetId: historicalReview.candidateSetId,
      recommendation: historical.recommendation,
      rationale: historical.rationale,
      gates: historical.gates,
    },
    review: {
      decision: null,
      rationale: null,
      gates: {
        evidenceScope: null,
        date: null,
        spine: null,
        outcome: null,
        conflict: null,
        confounder: null,
      },
    },
  };
});

const busLane = enriched.filter((row: Json) => row.candidate.treatmentFamily === "bus_lane");
const nonBusLane = enriched.filter((row: Json) => row.candidate.treatmentFamily !== "bus_lane");
const batches = [
  {
    batchId: "non-bus-lane-161",
    file: "10-non-bus-lane-161.input.json",
    candidates: nonBusLane,
  },
  {
    batchId: "bus-lane-000-161",
    file: "20-bus-lane-000-161.input.json",
    candidates: busLane.slice(0, 162),
  },
  {
    batchId: "bus-lane-162-324",
    file: "30-bus-lane-162-324.input.json",
    candidates: busLane.slice(162),
  },
];
const assignedIds = batches.flatMap((batch) =>
  batch.candidates.map((candidate: Json) => candidate.candidateId),
);
if (assignedIds.length !== 486 || new Set(assignedIds).size !== 486) {
  throw new Error("Review shards must cover all 486 candidates exactly once");
}

mkdirSync(outputRoot, { recursive: true });
const spineSnapshotPath = join(outputRoot, "spine-snapshot.json");
writeFileSync(spineSnapshotPath, `${JSON.stringify(spineSnapshot, null, 2)}\n`);
const candidateSetSha256 = sha256(candidatePath);
const spineSnapshotSha256 = sha256(spineSnapshotPath);
const manifestBatches = batches.map((batch) => {
  const outputPath = join(outputRoot, batch.file);
  const artifact = {
    artifactKind: "bp.studio.codex_review_batch_input.v2",
    candidateSetId: candidateSet.candidateSetId,
    candidateSetSha256,
    scopeBindingsSha256: sha256(scopeBindingsPath),
    spineSnapshotSha256,
    historicalReviewSha256: sha256(historicalReviewPath),
    batchId: batch.batchId,
    decisionCount: batch.candidates.length,
    candidates: batch.candidates,
  };
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  return {
    batchId: batch.batchId,
    file: basename(outputPath),
    candidateCount: batch.candidates.length,
    sha256: sha256(outputPath),
  };
});
const manifest = {
  artifactKind: "bp.studio.codex_review_manifest.v2",
  authorization: "owner_delegated_candidate_review",
  candidateSetId: candidateSet.candidateSetId,
  candidateSetSha256,
  analysisMonth,
  totalCandidateCount: candidates.length,
  immutableInputs: {
    scopeBindingsSha256: sha256(scopeBindingsPath),
    historicalReviewSha256: sha256(historicalReviewPath),
    spineSnapshotSha256,
    spineSnapshotCanonicalSha256: canonicalSha256(spineSnapshot),
  },
  batches: manifestBatches,
};
writeFileSync(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
