import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { writeJson } from "../../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../../lib/paths.ts";
import {
  FEATURE_PROOF_LEDGER_ARTIFACT_KIND,
  FEATURE_PROOF_LEDGER_SUMMARY_KIND,
  type BuildTier2FeatureProofLedgerArgs,
  type FeatureCandidateRole,
  type FeatureFamily,
  type FeatureProofCandidate,
  type FeaturePromotionEligibility,
  type FeatureValidationError,
  type FeatureValidationErrorCode,
  type FeatureValidationRetryBatch,
  type FieldEvidence,
  type JsonRecord,
  type MetricFeatureCompleteness,
  type MetricFeatureCompletenessSlot,
  type ProofState,
  type Tier2FeatureProofLedgerInputMode,
  type Tier2FeatureProofLedgerArtifact,
  type ValidationRetryOwner,
} from "./types.ts";

type NormalizedAcceptedSurface = {
  artifactPath: string;
  auditPath: string | null;
  windowId: string | null;
  runId: string | null;
  shardId: string | null;
  sourceId: string | null;
  pageNumbers: number[];
  draftIndex: number | null;
  surface: JsonRecord;
  fieldSupport: unknown[];
  evidencePointers: unknown[];
  acceptedCanonicalFields: unknown[];
  warnings: string[];
};

type VocabSurfaceApplicationArtifact = {
  artifactKind: string;
  schemaVersion: number;
  generatedAt: string;
  sourceCanonicalMergePath?: string;
  normalizedAcceptedSurfaces: NormalizedAcceptedSurface[];
};

type NormalizedFieldMapping = {
  keyId: string;
  sourceFieldPath: string;
  targetPayloadPath: string;
  rawValue: string;
  decision: "mapped";
  canonicalLeafId: string;
  canonicalLeafLabel: string | null;
  coarseFamily: string;
  modifiers: Record<string, string[]>;
  evidence: FieldEvidence;
};

type NormalizedUnresolvedField = {
  keyId: string;
  sourceFieldPath: string;
  targetPayloadPath: string;
  rawValue: string;
  decision: "preserve_raw" | "unresolved" | "missing_projection";
  canonicalLeafId?: null;
  canonicalLeafLabel?: null;
  coarseFamily: string | null;
  modifiers: Record<string, string[]> | null;
  evidence: FieldEvidence;
};

type RawFeatureField = NormalizedFieldMapping | NormalizedUnresolvedField;

const FEATURE_FAMILY_BY_KEY_ID: Record<string, FeatureFamily> = {
  claimKind: "claim",
  claimResearchUseTag: "claim",
  contextKind: "source_statement",
  entityKind: "route_scope",
  entityRole: "route_scope",
  eventFamily: "event_identity",
  eventSubtype: "event_identity",
  eventTreatmentFamily: "treatment",
  metricFamily: "metric_claim",
  metricSubjectFamily: "metric_claim",
  metricUnit: "metric_claim",
  questionKind: "source_gap",
  tableKind: "table_cell",
};

const FEATURE_FAMILY_BY_SURFACE_KIND: Record<string, FeatureFamily> = {
  brief_claim_seed: "claim",
  causal_claim: "causal_eligibility",
  claim: "claim",
  context_signal: "source_statement",
  entity_mention: "route_scope",
  event_candidate: "event_identity",
  finding_reasoning_seed: "claim",
  metric_observation: "metric_claim",
  relation: "source_statement",
  review_question: "source_gap",
  service_change_candidate: "event_identity",
  source_gap_seed: "source_gap",
  source_note: "source_statement",
  table_observation: "table_cell",
  treatment_component: "treatment",
};

const METRIC_VALUE_PATHS = [
  "rawPayload.valueRaw",
  "rawPayload.metricValueRaw",
  "rawPayload.metricValue",
  "rawPayload.metricValueNumeric",
  "rawPayload.valueNumeric",
  "rawPayload.metricRaw",
];

const METRIC_AUTHORITY_PATHS = [
  "rawPayload.sourceClaimAuthority",
  "rawPayload.authorityRaw",
  "rawPayload.authority",
];

const METRIC_PUBLICATION_GATE_PATHS = ["rawPayload.publicationWordingGate"];

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "number" && Number.isFinite(item) ? [item] : []))
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];
}

function normalizePrimitive(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized;
}

function getPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const part of path.split(".")) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function firstPrimitiveAtPaths(root: unknown, paths: string[]): { path: string; value: string } | null {
  for (const path of paths) {
    const value = getPath(root, path);
    if (Array.isArray(value)) {
      const first = value.map((item) => normalizePrimitive(item)).find((item) => item !== null);
      if (first !== undefined) return { path, value: first };
      continue;
    }
    const normalized = normalizePrimitive(value);
    if (normalized !== null) return { path, value: normalized };
  }
  return null;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function stableHash(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function previewText(value: unknown): string | null {
  const text = normalizePrimitive(value);
  if (text === null) return null;
  return text.length <= 240 ? text : `${text.slice(0, 237)}...`;
}

function emptyEvidence(): FieldEvidence {
  return {
    fieldSupportFound: false,
    supportIds: [],
    evidencePointerIds: [],
    verifierStates: [],
    supportCompleteness: [],
  };
}

function evidenceFromRows(rows: JsonRecord[]): FieldEvidence {
  return {
    fieldSupportFound: rows.length > 0,
    supportIds: uniqueSorted(rows.flatMap((row) => stringValue(row["supportId"]) ?? [])),
    evidencePointerIds: uniqueSorted(
      rows.flatMap((row) =>
        Array.isArray(row["evidencePointers"])
          ? row["evidencePointers"].flatMap((item) => (typeof item === "string" ? [item] : []))
          : [],
      ),
    ),
    verifierStates: uniqueSorted(rows.flatMap((row) => stringValue(row["verifierState"]) ?? [])),
    supportCompleteness: uniqueSorted(rows.flatMap((row) => stringValue(row["supportCompleteness"]) ?? [])),
  };
}

function evidenceForAnyField(fieldSupport: unknown[], fieldPaths: string[]): FieldEvidence {
  const pathSet = new Set(fieldPaths);
  const rows = fieldSupport.filter(
    (item): item is JsonRecord => isRecord(item) && typeof item["fieldPath"] === "string" && pathSet.has(item["fieldPath"]),
  );
  return evidenceFromRows(rows);
}

function normalizeEvidence(value: unknown): FieldEvidence {
  if (!isRecord(value)) return emptyEvidence();
  return {
    fieldSupportFound: value["fieldSupportFound"] === true,
    supportIds: uniqueSorted(stringArray(value["supportIds"])),
    evidencePointerIds: uniqueSorted(stringArray(value["evidencePointerIds"])),
    verifierStates: uniqueSorted(stringArray(value["verifierStates"])),
    supportCompleteness: uniqueSorted(stringArray(value["supportCompleteness"])),
  };
}

function hasVerifiedSourceLocalProof(evidence: FieldEvidence): boolean {
  const verifierOk = evidence.verifierStates.includes("verified");
  const completenessOk = evidence.supportCompleteness.length === 0 || evidence.supportCompleteness.includes("exact");
  return evidence.fieldSupportFound && evidence.evidencePointerIds.length > 0 && verifierOk && completenessOk;
}

function supportProofState(evidence: FieldEvidence): ProofState {
  if (!evidence.fieldSupportFound || evidence.evidencePointerIds.length === 0) return "support_missing";
  if (!evidence.verifierStates.includes("verified")) return "ambiguous";
  if (evidence.supportCompleteness.length > 0 && !evidence.supportCompleteness.includes("exact")) return "ambiguous";
  return "verified";
}

function normalizeFieldMappings(surface: JsonRecord): NormalizedFieldMapping[] {
  const normalization = isRecord(surface["normalization"]) ? surface["normalization"] : {};
  const rawMappings = Array.isArray(normalization["fieldMappings"]) ? normalization["fieldMappings"] : [];
  return rawMappings.flatMap((item): NormalizedFieldMapping[] => {
    if (!isRecord(item)) return [];
    const keyId = stringValue(item["keyId"]);
    const sourceFieldPath = stringValue(item["sourceFieldPath"]);
    const targetPayloadPath = stringValue(item["targetPayloadPath"]);
    const rawValue = normalizePrimitive(item["rawValue"]);
    const canonicalLeafId = stringValue(item["canonicalLeafId"]);
    if (keyId === null || sourceFieldPath === null || targetPayloadPath === null || rawValue === null || canonicalLeafId === null) {
      return [];
    }
    const modifiers = isRecord(item["modifiers"]) ? normalizeModifiers(item["modifiers"]) : {};
    return [
      {
        keyId,
        sourceFieldPath,
        targetPayloadPath,
        rawValue,
        decision: "mapped",
        canonicalLeafId,
        canonicalLeafLabel: stringValue(item["canonicalLeafLabel"]),
        coarseFamily: stringValue(item["coarseFamily"]) ?? "unknown",
        modifiers,
        evidence: normalizeEvidence(item["evidence"]),
      },
    ];
  });
}

function normalizeUnresolvedFields(surface: JsonRecord): NormalizedUnresolvedField[] {
  const normalization = isRecord(surface["normalization"]) ? surface["normalization"] : {};
  const rawFields = Array.isArray(normalization["unresolvedFields"]) ? normalization["unresolvedFields"] : [];
  return rawFields.flatMap((item): NormalizedUnresolvedField[] => {
    if (!isRecord(item)) return [];
    const keyId = stringValue(item["keyId"]);
    const sourceFieldPath = stringValue(item["sourceFieldPath"]);
    const targetPayloadPath = stringValue(item["targetPayloadPath"]);
    const rawValue = normalizePrimitive(item["rawValue"]);
    const decision = stringValue(item["decision"]);
    if (
      keyId === null ||
      sourceFieldPath === null ||
      targetPayloadPath === null ||
      rawValue === null ||
      (decision !== "preserve_raw" && decision !== "unresolved" && decision !== "missing_projection")
    ) {
      return [];
    }
    const modifiers = isRecord(item["modifiers"]) ? normalizeModifiers(item["modifiers"]) : null;
    return [
      {
        keyId,
        sourceFieldPath,
        targetPayloadPath,
        rawValue,
        decision,
        coarseFamily: stringValue(item["coarseFamily"]),
        modifiers,
        evidence: normalizeEvidence(item["evidence"]),
      },
    ];
  });
}

function normalizeModifiers(value: JsonRecord): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const values = stringArray(item);
      return values.length === 0 ? [] : [[key, uniqueSorted(values)]];
    }),
  );
}

function featureFamilyFor(keyId: string, surfaceKind: string): FeatureFamily {
  return FEATURE_FAMILY_BY_KEY_ID[keyId] ?? FEATURE_FAMILY_BY_SURFACE_KIND[surfaceKind] ?? "taxonomy";
}

function validationError(input: {
  code: FeatureValidationErrorCode;
  retryOwner: ValidationRetryOwner;
  message: string;
  llmRetryInstruction: string;
  deterministicRunnerFields?: string[];
}): FeatureValidationError {
  return {
    code: input.code,
    severity: "blocking",
    retryOwner: input.retryOwner,
    message: input.message,
    llmRetryInstruction: input.llmRetryInstruction,
    deterministicRunnerFields: input.deterministicRunnerFields ?? [],
  };
}

function baseValidationErrors(field: RawFeatureField, role: FeatureCandidateRole): FeatureValidationError[] {
  const errors: FeatureValidationError[] = [];
  if (role === "unresolved_field") {
    if (field.decision === "preserve_raw") {
      errors.push(
        validationError({
          code: "preserve_raw_quarantined",
          retryOwner: "vocab_runner",
          message: "This raw value is intentionally preserved and cannot be consumed as a canonical feature.",
          llmRetryInstruction:
            "Only retry extraction if the source contains a more specific canonical label; otherwise leave this field quarantined.",
          deterministicRunnerFields: ["decision", "targetPayloadPath", "canonicalLeafId"],
        }),
      );
    } else {
      errors.push(
        validationError({
          code: "canonical_resolver_missing",
          retryOwner: "vocab_runner",
          message: "This raw value has no resolved canonical vocabulary leaf.",
          llmRetryInstruction:
            "Return the source-observed raw value and evidence again; the runner must resolve or quarantine the vocabulary leaf before promotion.",
          deterministicRunnerFields: ["canonicalLeafId", "canonicalLeafLabel", "coarseFamily", "modifiers"],
        }),
      );
    }
  }

  if (role === "canonical_field" && field.decision === "mapped" && field.canonicalLeafId.length === 0) {
    errors.push(
      validationError({
        code: "canonical_resolver_missing",
        retryOwner: "vocab_runner",
        message: "The field was marked mapped but has no canonical leaf id.",
        llmRetryInstruction:
          "Return the source-observed raw value and evidence; the canonical id must be filled by the deterministic resolver.",
        deterministicRunnerFields: ["canonicalLeafId", "canonicalLeafLabel"],
      }),
    );
  }

  if (!field.evidence.fieldSupportFound) {
    errors.push(
      validationError({
        code: "field_support_missing",
        retryOwner: "llm",
        message: "The source field has no fieldSupport row.",
        llmRetryInstruction:
          "Retry with fieldSupport for this exact sourceFieldPath, including a source-local evidence pointer that proves the raw value.",
        deterministicRunnerFields: ["proofState", "promotionEligibility"],
      }),
    );
  } else if (field.evidence.evidencePointerIds.length === 0) {
    errors.push(
      validationError({
        code: "evidence_pointer_missing",
        retryOwner: "llm",
        message: "The source field has support but no evidence pointer id.",
        llmRetryInstruction:
          "Retry with a fieldSupport row whose evidencePointers reference the exact page/block proving this field.",
        deterministicRunnerFields: ["proofState", "promotionEligibility"],
      }),
    );
  } else if (!field.evidence.verifierStates.includes("verified")) {
    errors.push(
      validationError({
        code: "source_verifier_not_verified",
        retryOwner: "llm",
        message: "The source field support exists but was not verified.",
        llmRetryInstruction:
          "Retry with a fieldSupport row whose verifierState is verified, or omit/downgrade the field if the source does not prove it.",
        deterministicRunnerFields: ["proofState", "promotionEligibility"],
      }),
    );
  }

  return errors;
}

function metricCompletenessSlot(input: {
  surface: JsonRecord;
  fieldSupport: unknown[];
  valuePaths: string[];
}): MetricFeatureCompletenessSlot {
  const found = firstPrimitiveAtPaths(input.surface, input.valuePaths);
  if (found === null) {
    return { path: null, value: null, evidence: emptyEvidence(), proofState: "resolver_missing" };
  }
  const evidence = evidenceForAnyField(input.fieldSupport, [found.path]);
  return {
    path: found.path,
    value: found.value,
    evidence,
    proofState: supportProofState(evidence),
  };
}

function metricCompletenessFor(surface: JsonRecord, fieldSupport: unknown[]): MetricFeatureCompleteness {
  return {
    value: metricCompletenessSlot({ surface, fieldSupport, valuePaths: METRIC_VALUE_PATHS }),
    authority: metricCompletenessSlot({ surface, fieldSupport, valuePaths: METRIC_AUTHORITY_PATHS }),
    publicationGate: metricCompletenessSlot({ surface, fieldSupport, valuePaths: METRIC_PUBLICATION_GATE_PATHS }),
  };
}

function metricValidationErrors(metric: MetricFeatureCompleteness): FeatureValidationError[] {
  const errors: FeatureValidationError[] = [];
  if (metric.value.value === null) {
    errors.push(
      validationError({
        code: "metric_value_missing",
        retryOwner: "llm",
        message: "Metric claims require a value-level raw field before promotion.",
        llmRetryInstruction:
          "Retry with valueRaw/valueNumeric or metricValueRaw/metricValueNumeric from the source; downgrade the surface if no metric value exists.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
  } else if (!hasVerifiedSourceLocalProof(metric.value.evidence)) {
    errors.push(
      validationError({
        code: "metric_value_support_missing",
        retryOwner: "llm",
        message: "The metric value exists but lacks verified source-local support.",
        llmRetryInstruction:
          "Retry with fieldSupport for the metric value field and an evidence pointer to the exact source value.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
  }

  if (metric.authority.value === null) {
    errors.push(
      validationError({
        code: "metric_authority_missing",
        retryOwner: "llm",
        message: "Metric claims require sourceClaimAuthority or equivalent authorityRaw before promotion.",
        llmRetryInstruction:
          "Retry with sourceClaimAuthority/authorityRaw indicating whether the value is source-stated, derived, projected, or uncertain.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
  } else if (!hasVerifiedSourceLocalProof(metric.authority.evidence)) {
    errors.push(
      validationError({
        code: "metric_authority_support_missing",
        retryOwner: "llm",
        message: "The metric authority field exists but lacks verified source-local support.",
        llmRetryInstruction:
          "Retry with fieldSupport for sourceClaimAuthority/authorityRaw and evidence pointing to the wording that establishes the authority.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
  }

  if (metric.publicationGate.value === null) {
    errors.push(
      validationError({
        code: "metric_publication_gate_missing",
        retryOwner: "llm",
        message: "Metric claims require publicationWordingGate before promotion.",
        llmRetryInstruction:
          "Retry with publicationWordingGate so the runner can decide whether the value is safe for public/detector use.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
  } else if (!hasVerifiedSourceLocalProof(metric.publicationGate.evidence)) {
    errors.push(
      validationError({
        code: "metric_publication_gate_support_missing",
        retryOwner: "llm",
        message: "The metric publication gate exists but lacks verified source-local support.",
        llmRetryInstruction:
          "Retry with fieldSupport for publicationWordingGate and evidence pointing to the wording that makes the metric safe or unsafe to publish.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
  }

  return errors;
}

function proofStateFor(errors: FeatureValidationError[], role: FeatureCandidateRole, field: RawFeatureField): ProofState {
  if (role === "unresolved_field" && field.decision === "preserve_raw") return "quarantined";
  if (errors.some((error) => error.code === "canonical_resolver_missing" || error.code === "metric_value_missing")) {
    return "resolver_missing";
  }
  if (
    errors.some((error) =>
      [
        "evidence_pointer_missing",
        "field_support_missing",
        "metric_authority_missing",
        "metric_authority_support_missing",
        "metric_publication_gate_missing",
        "metric_publication_gate_support_missing",
        "metric_value_support_missing",
      ].includes(error.code),
    )
  ) {
    return "support_missing";
  }
  if (errors.some((error) => error.code === "source_verifier_not_verified")) return "ambiguous";
  return "verified";
}

function promotionEligibilityFor(input: {
  featureFamily: FeatureFamily;
  proofState: ProofState;
  validationErrors: FeatureValidationError[];
}): FeaturePromotionEligibility {
  const blockedReasons = input.validationErrors.map((error) => error.code);
  const publishable = input.proofState === "verified" && blockedReasons.length === 0;
  const detectorFamilies = new Set<FeatureFamily>([
    "route_scope",
    "operational_date_status",
    "treatment",
    "metric_claim",
    "table_cell",
    "event_identity",
  ]);
  const causalFamilies = new Set<FeatureFamily>(["route_scope", "operational_date_status", "treatment", "metric_claim", "causal_eligibility"]);
  const briefFamilies = new Set<FeatureFamily>(["route_scope", "treatment", "metric_claim", "claim", "event_identity", "source_statement"]);
  return {
    publicFeature: publishable,
    detectorFeature: publishable && detectorFamilies.has(input.featureFamily),
    causalFeature: publishable && causalFamilies.has(input.featureFamily),
    briefFeature: publishable && briefFamilies.has(input.featureFamily),
    blockedReasons,
  };
}

function candidateFromField(input: {
  normalizedSurface: NormalizedAcceptedSurface;
  surfaceIndex: number;
  fieldIndex: number;
  field: RawFeatureField;
  role: FeatureCandidateRole;
}): FeatureProofCandidate {
  const surface = input.normalizedSurface.surface;
  const surfaceKind = stringValue(surface["surfaceKind"]) ?? "unknown";
  const featureFamily = featureFamilyFor(input.field.keyId, surfaceKind);
  const metricCompleteness =
    featureFamily === "metric_claim" ? metricCompletenessFor(surface, input.normalizedSurface.fieldSupport) : null;
  const validationErrors = [
    ...baseValidationErrors(input.field, input.role),
    ...(metricCompleteness === null ? [] : metricValidationErrors(metricCompleteness)),
  ];
  const proofState = proofStateFor(validationErrors, input.role, input.field);
  const promotionEligibility = promotionEligibilityFor({ featureFamily, proofState, validationErrors });
  const surfaceId = stringValue(surface["surfaceId"]);
  const candidateHash = stableHash([
    input.normalizedSurface.artifactPath,
    surfaceId,
    input.field.keyId,
    input.field.sourceFieldPath,
    input.field.rawValue,
    input.fieldIndex,
  ]);

  return {
    candidateId: `${surfaceId ?? `surface-${input.surfaceIndex}`}:feature:${candidateHash}`,
    role: input.role,
    featureFamily,
    proofState,
    keyId: input.field.keyId,
    sourceFieldPath: input.field.sourceFieldPath,
    targetPayloadPath: input.field.targetPayloadPath,
    rawValue: input.field.rawValue,
    canonicalLeafId: input.field.decision === "mapped" ? input.field.canonicalLeafId : null,
    canonicalLeafLabel: input.field.decision === "mapped" ? input.field.canonicalLeafLabel : null,
    coarseFamily: input.field.coarseFamily,
    modifiers: input.field.modifiers ?? {},
    decision: input.field.decision,
    source: {
      artifactPath: input.normalizedSurface.artifactPath,
      auditPath: input.normalizedSurface.auditPath,
      windowId: input.normalizedSurface.windowId,
      runId: input.normalizedSurface.runId,
      shardId: input.normalizedSurface.shardId,
      sourceId: input.normalizedSurface.sourceId,
      pageNumbers: input.normalizedSurface.pageNumbers,
      surfaceId,
      surfaceKind,
      displayLabel: stringValue(surface["displayLabel"]),
      rawTextPreview: previewText(surface["rawText"]),
    },
    evidence: input.field.evidence,
    metricCompleteness,
    validationErrors,
    promotionEligibility,
  };
}

function normalizeAcceptedSurface(value: unknown): NormalizedAcceptedSurface | null {
  if (!isRecord(value) || !isRecord(value["surface"])) return null;
  return {
    artifactPath: stringValue(value["artifactPath"]) ?? "",
    auditPath: stringValue(value["auditPath"]),
    windowId: stringValue(value["windowId"]),
    runId: stringValue(value["runId"]),
    shardId: stringValue(value["shardId"]),
    sourceId: stringValue(value["sourceId"]),
    pageNumbers: numberArray(value["pageNumbers"]),
    draftIndex: typeof value["draftIndex"] === "number" ? value["draftIndex"] : null,
    surface: value["surface"],
    fieldSupport: Array.isArray(value["fieldSupport"]) ? value["fieldSupport"] : [],
    evidencePointers: Array.isArray(value["evidencePointers"]) ? value["evidencePointers"] : [],
    acceptedCanonicalFields: Array.isArray(value["acceptedCanonicalFields"]) ? value["acceptedCanonicalFields"] : [],
    warnings: stringArray(value["warnings"]),
  };
}

async function readVocabApplication(path: string): Promise<VocabSurfaceApplicationArtifact> {
  const raw = await Bun.file(path).json();
  if (!isRecord(raw)) throw new Error(`Vocab surface application is not an object: ${path}`);
  const surfaces = Array.isArray(raw["normalizedAcceptedSurfaces"])
    ? raw["normalizedAcceptedSurfaces"].flatMap((item) => {
        const normalized = normalizeAcceptedSurface(item);
        return normalized === null ? [] : [normalized];
      })
    : [];
  if (surfaces.length === 0) {
    throw new Error(`Vocab surface application has no normalizedAcceptedSurfaces: ${path}`);
  }
  const sourceCanonicalMergePath = stringValue(raw["sourceCanonicalMergePath"]);
  return {
    artifactKind: stringValue(raw["artifactKind"]) ?? "unknown",
    schemaVersion: typeof raw["schemaVersion"] === "number" ? raw["schemaVersion"] : 0,
    generatedAt: stringValue(raw["generatedAt"]) ?? "",
    ...(sourceCanonicalMergePath === null ? {} : { sourceCanonicalMergePath }),
    normalizedAcceptedSurfaces: surfaces,
  };
}

function summarizeCandidates(candidates: FeatureProofCandidate[], normalizedSurfaceCount: number) {
  const byFeatureFamily: Record<string, number> = {};
  const byProofState: Record<string, number> = {};
  const byKeyId: Record<string, number> = {};
  const bySurfaceKind: Record<string, number> = {};
  const validationErrorsByCode: Record<string, number> = {};
  const blockedByFeatureFamily: Record<string, number> = {};
  const publishableByFeatureFamily: Record<string, number> = {};
  const sourcesWithBlockingErrors = new Set<string>();

  for (const candidate of candidates) {
    increment(byFeatureFamily, candidate.featureFamily);
    increment(byProofState, candidate.proofState);
    increment(byKeyId, candidate.keyId);
    increment(bySurfaceKind, candidate.source.surfaceKind);
    if (candidate.validationErrors.length > 0) increment(blockedByFeatureFamily, candidate.featureFamily);
    if (candidate.promotionEligibility.publicFeature) increment(publishableByFeatureFamily, candidate.featureFamily);
    for (const error of candidate.validationErrors) {
      increment(validationErrorsByCode, error.code);
      if (error.severity === "blocking") sourcesWithBlockingErrors.add(candidate.source.sourceId ?? candidate.source.artifactPath);
    }
  }

  const publishableFieldCount = candidates.filter((candidate) => candidate.promotionEligibility.publicFeature).length;
  return {
    normalizedSurfaceCount,
    fieldCandidateCount: candidates.length,
    canonicalFieldCandidateCount: candidates.filter((candidate) => candidate.role === "canonical_field").length,
    unresolvedFieldCandidateCount: candidates.filter((candidate) => candidate.role === "unresolved_field").length,
    verifiedFieldCount: candidates.filter((candidate) => candidate.proofState === "verified").length,
    blockedFieldCount: candidates.filter((candidate) => candidate.validationErrors.length > 0).length,
    publishableFieldCount,
    publishableFieldWithoutProofCount: candidates.filter(
      (candidate) => candidate.promotionEligibility.publicFeature && candidate.proofState !== "verified",
    ).length,
    validationErrorCount: candidates.reduce((sum, candidate) => sum + candidate.validationErrors.length, 0),
    byFeatureFamily: finalizeRecord(byFeatureFamily),
    byProofState: finalizeRecord(byProofState),
    byKeyId: finalizeRecord(byKeyId),
    bySurfaceKind: finalizeRecord(bySurfaceKind),
    validationErrorsByCode: finalizeRecord(validationErrorsByCode),
    blockedByFeatureFamily: finalizeRecord(blockedByFeatureFamily),
    publishableByFeatureFamily: finalizeRecord(publishableByFeatureFamily),
    sourcesWithBlockingErrors: sourcesWithBlockingErrors.size,
  };
}

function retryBatchesFor(candidates: FeatureProofCandidate[]): FeatureValidationRetryBatch[] {
  const batches = new Map<string, FeatureValidationRetryBatch>();
  for (const candidate of candidates) {
    for (const error of candidate.validationErrors) {
      const key = `${error.code}\u0000${candidate.featureFamily}\u0000${error.retryOwner}`;
      const current =
        batches.get(key) ??
        ({
          code: error.code,
          featureFamily: candidate.featureFamily,
          retryOwner: error.retryOwner,
          count: 0,
          exampleCandidateIds: [],
          llmRetryInstruction: error.llmRetryInstruction,
        } satisfies FeatureValidationRetryBatch);
      current.count += 1;
      if (current.exampleCandidateIds.length < 5) current.exampleCandidateIds.push(candidate.candidateId);
      batches.set(key, current);
    }
  }
  return [...batches.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.code.localeCompare(right.code) ||
      left.featureFamily.localeCompare(right.featureFamily),
  );
}

function finalizeRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

export function renderTier2FeatureProofLedgerMarkdown(artifact: Tier2FeatureProofLedgerArtifact): string {
  const lines: string[] = [];
  lines.push("# Tier 2 Feature Proof Ledger");
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Normalized surfaces: ${artifact.summary.normalizedSurfaceCount}`);
  lines.push(`- Field candidates: ${artifact.summary.fieldCandidateCount}`);
  lines.push(`- Verified fields: ${artifact.summary.verifiedFieldCount}`);
  lines.push(`- Blocked fields: ${artifact.summary.blockedFieldCount}`);
  lines.push(`- Publishable fields: ${artifact.summary.publishableFieldCount}`);
  lines.push(`- Publishable fields without proof: ${artifact.summary.publishableFieldWithoutProofCount}`);
  lines.push(`- Validation errors: ${artifact.summary.validationErrorCount}`);
  lines.push("");
  lines.push("## Validation Errors");
  lines.push("");
  lines.push("| Code | Count |");
  lines.push("|---|---:|");
  for (const [code, count] of Object.entries(artifact.summary.validationErrorsByCode)) {
    lines.push(`| ${code} | ${count} |`);
  }
  lines.push("");
  lines.push("## Retry Batches");
  lines.push("");
  lines.push("| Code | Feature family | Owner | Count |");
  lines.push("|---|---|---|---:|");
  for (const batch of artifact.validationRetryBatches.slice(0, 50)) {
    lines.push(`| ${batch.code} | ${batch.featureFamily} | ${batch.retryOwner} | ${batch.count} |`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- `rawPayload` is never mutated by this harness.");
  lines.push("- Candidate identity, feature family, proof state, and promotion eligibility are deterministic runner-owned fields.");
  lines.push("- Validation errors are structured so extraction/retry agents can receive machine-readable feedback.");
  return `${lines.join("\n")}\n`;
}

export type BuildTier2FeatureProofLedgerFromCandidatesArgs = {
  generatedAt: string;
  sourceCanonicalMergePath: string | null;
  sourceVocabApplicationPath: string;
  normalizedSurfaceCount: number;
  candidates: FeatureProofCandidate[];
  sourceFeatureExtractionPaths?: string[];
  sourceFeatureExtractionInputMode?: Tier2FeatureProofLedgerInputMode;
  sourceProofLedgerPath?: string;
};

export function buildTier2FeatureProofLedgerFromCandidates(
  args: BuildTier2FeatureProofLedgerFromCandidatesArgs,
): Tier2FeatureProofLedgerArtifact {
  const summary = summarizeCandidates(args.candidates, args.normalizedSurfaceCount);
  return {
    artifactKind: FEATURE_PROOF_LEDGER_ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: args.generatedAt,
    sourceCanonicalMergePath: args.sourceCanonicalMergePath,
    sourceVocabApplicationPath: args.sourceVocabApplicationPath,
    ...(args.sourceFeatureExtractionPaths === undefined
      ? {}
      : { sourceFeatureExtractionPaths: args.sourceFeatureExtractionPaths }),
    ...(args.sourceFeatureExtractionInputMode === undefined
      ? {}
      : { sourceFeatureExtractionInputMode: args.sourceFeatureExtractionInputMode }),
    ...(args.sourceProofLedgerPath === undefined ? {} : { sourceProofLedgerPath: args.sourceProofLedgerPath }),
    safetyPolicy: {
      llmRuntimeUse: "none",
      runnerOwnsVocabulary: true,
      runnerOwnsPromotionState: true,
      publishableRequiresSourceLocalProof: true,
      rawPayloadMutationAllowed: false,
    },
    validationPolicy: {
      publishableFieldWithoutProofAllowed: false,
      unresolvedCanonicalFieldAllowedInPublicFeatures: false,
      metricPublicationRequiresValueLevelProof: true,
      validationErrorsReturnedToLlmForRetry: true,
    },
    fieldOwnership: {
      llmMustSubmit: [
        "feature-family raw fields",
        "source-local fieldSupport rows",
        "evidence pointer ids for each supported field",
        "metric value, authority, and publication gate fields for metric claims",
      ],
      deterministicRunnerFields: [
        "candidateId",
        "featureFamily",
        "proofState",
        "promotionEligibility",
        "validationErrors",
        "metricCompleteness",
      ],
      vocabRunnerFields: ["canonicalLeafId", "canonicalLeafLabel", "coarseFamily", "modifiers", "targetPayloadPath"],
    },
    summary,
    validationRetryBatches: retryBatchesFor(args.candidates),
    candidates: args.candidates,
  };
}

export async function buildTier2FeatureProofLedger(
  args: BuildTier2FeatureProofLedgerArgs,
): Promise<Tier2FeatureProofLedgerArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const sourceVocabApplicationPath = fromCliPath(args.vocabApplicationPath);
  const vocabApplication = await readVocabApplication(sourceVocabApplicationPath);
  const normalizedAcceptedSurfaces =
    args.maxSurfaces === undefined
      ? vocabApplication.normalizedAcceptedSurfaces
      : vocabApplication.normalizedAcceptedSurfaces.slice(0, args.maxSurfaces);

  const candidates: FeatureProofCandidate[] = [];
  for (const [surfaceIndex, normalizedSurface] of normalizedAcceptedSurfaces.entries()) {
    const mapped = normalizeFieldMappings(normalizedSurface.surface);
    const unresolved = normalizeUnresolvedFields(normalizedSurface.surface);
    let fieldIndex = 0;
    for (const field of mapped) {
      candidates.push(
        candidateFromField({
          normalizedSurface,
          surfaceIndex,
          fieldIndex,
          field,
          role: "canonical_field",
        }),
      );
      fieldIndex += 1;
    }
    for (const field of unresolved) {
      candidates.push(
        candidateFromField({
          normalizedSurface,
          surfaceIndex,
          fieldIndex,
          field,
          role: "unresolved_field",
        }),
      );
      fieldIndex += 1;
    }
  }

  const sourceCanonicalMergePath =
    args.canonicalMergePath === undefined
      ? vocabApplication.sourceCanonicalMergePath ?? null
      : fromCliPath(args.canonicalMergePath);

  return buildTier2FeatureProofLedgerFromCandidates({
    generatedAt,
    sourceCanonicalMergePath,
    sourceVocabApplicationPath,
    normalizedSurfaceCount: normalizedAcceptedSurfaces.length,
    candidates,
  });
}

export async function writeTier2FeatureProofLedgerArtifacts(args: {
  artifact: Tier2FeatureProofLedgerArtifact;
  outputPath: string;
  markdownPath?: string;
  summaryPath?: string;
}): Promise<{
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const outputPath = fromCliPath(args.outputPath);
  const markdownPath =
    args.markdownPath === undefined ? outputPath.replace(/\.json$/, ".md") : fromCliPath(args.markdownPath);
  const summaryPath =
    args.summaryPath === undefined ? outputPath.replace(/\.json$/, "-summary.json") : fromCliPath(args.summaryPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, args.artifact);
  await Bun.write(markdownPath, renderTier2FeatureProofLedgerMarkdown(args.artifact));
  await writeJson(summaryPath, {
    artifactKind: FEATURE_PROOF_LEDGER_SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt: args.artifact.generatedAt,
    sourceArtifactPath: outputPath,
    summary: args.artifact.summary,
    validationRetryBatches: args.artifact.validationRetryBatches,
  });
  return { outputPath, markdownPath, summaryPath };
}

export async function runTier2FeatureProofLedger(args: BuildTier2FeatureProofLedgerArgs): Promise<{
  artifact: Tier2FeatureProofLedgerArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const artifact = await buildTier2FeatureProofLedger(args);
  const outputPath = fromCliPath(
    args.outputPath ??
      join(defaultArtifactRootPath(), "docs", "tier2-feature-proof-ledger", "feature-proof-ledger.json"),
  );
  const written = await writeTier2FeatureProofLedgerArtifacts({
    artifact,
    outputPath,
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
  });
  return { artifact, ...written };
}
