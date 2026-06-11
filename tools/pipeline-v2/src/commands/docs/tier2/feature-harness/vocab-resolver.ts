import { createHash } from "node:crypto";
import { join } from "node:path";
import { defaultArtifactRootPath, fromCliPath } from "../../../../lib/paths.ts";
import {
  buildTier2FeatureProofLedgerFromCandidates,
  writeTier2FeatureProofLedgerArtifacts,
} from "./proof-ledger.ts";
import type {
  FeatureFamily,
  FeatureProofCandidate,
  FeaturePromotionEligibility,
  FeatureValidationError,
  JsonRecord,
  ProofState,
  Tier2FeatureProofLedgerArtifact,
} from "./types.ts";

type VocabMapping = {
  keyId: string;
  rawValue: string;
  targetPayloadPath: string;
  canonicalLeafId: string;
  canonicalLeafLabel: string | null;
  coarseFamily: string | null;
  modifiers: Record<string, string[]>;
};

type ResolverIndexEntry =
  | {
      state: "resolved";
      mapping: VocabMapping;
    }
  | {
      state: "ambiguous";
      mappings: VocabMapping[];
    };

type ResolverStats = {
  inputCandidateCount: number;
  resolvedCandidateCount: number;
  identityResolvedCandidateCount: number;
  unresolvedCandidateCount: number;
  nonVocabCandidateCount: number;
  ambiguousCandidateCount: number;
};

export type VocabResolvedFeatureProofLedgerResult = {
  artifact: Tier2FeatureProofLedgerArtifact;
  stats: ResolverStats;
};

export type BuildTier2FeatureProofLedgerWithVocabResolverArgs = {
  proofLedgerPath: string;
  vocabApplicationPath: string;
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
};

const VOCAB_KEY_ID_BY_PROOF_KEY_ID: Record<string, string> = {
  claimKind: "claimKind",
  claimResearchUseTag: "claimResearchUseTag",
  contextKind: "contextKind",
  eventFamily: "eventFamily",
  eventSubtype: "eventSubtype",
  eventTreatmentFamily: "eventTreatmentFamily",
  metricFamily: "metricFamily",
  metricSubjectFamily: "metricSubjectFamily",
  metricUnit: "metricUnit",
  questionKind: "questionKind",
  tableKind: "tableKind",
};

const IDENTITY_RESOLVED_PROOF_KEY_IDS = new Set([
  "contextAuthority",
  "contextPublicationGate",
  "contextText",
  "costAmount",
  "costBenefitDenominator",
  "costCorridorScope",
  "costCurrency",
  "costFundingSource",
  "costProjectScope",
  "costRouteScope",
  "costTimeHorizon",
  "costUncertaintyCaveat",
  "costUnit",
  "dateSourceLanguageState",
  "dateStatus",
  "dateText",
  "geographicAffectedPopulation",
  "geographicAllocationCaveat",
  "geographicAreaKind",
  "geographicAreaText",
  "geographicCorridorScope",
  "geographicEquityContext",
  "geographicPublicationGate",
  "geographicRouteScope",
  "interventionProjectName",
  "metricAuthority",
  "metricBaselinePeriod",
  "metricCaveat",
  "metricComparator",
  "metricComparisonPeriod",
  "metricDenominator",
  "metricDirection",
  "metricGeography",
  "metricPeriod",
  "metricPublicationGate",
  "metricValue",
  "observationRelationText",
  "ridershipDemandClaimText",
  "ridershipDemandComparisonPeriod",
  "ridershipDemandDenominatorDefinition",
  "ridershipDemandGeography",
  "ridershipDemandPeriod",
  "ridershipDemandRouteScope",
  "ridershipDemandSourceCaveat",
  "ridershipDemandTrendLanguage",
  "ridershipDemandUnit",
  "ridershipDemandValue",
  "routeAreaText",
  "routeCorridorText",
  "routeDirection",
  "routeGeography",
  "routeLocationText",
  "routeScope",
  "routeServiceVariant",
  "routeTerminal",
  "serviceDeliveredWording",
  "serviceDeliveryCjtpComponent",
  "serviceDeliveryClaimText",
  "serviceDeliveryGeography",
  "serviceDeliveryMetricDefinition",
  "serviceDeliveryPeriod",
  "serviceDeliveryRouteScope",
  "tableColumnLabel",
  "tableRowLabel",
  "tableUnit",
  "tableValue",
  "timelineContextFlag",
  "timelineEventTitle",
  "timelineRelevance",
  "treatmentCorridorScope",
  "treatmentLocationScope",
  "treatmentPosture",
  "treatmentRouteScope",
  "treatmentSourceScope",
  "treatmentStatus",
  "treatmentText",
]);

const CANONICAL_SCOPE_INJECTION_GATES: Array<{
  label: string;
  canonicalPattern: RegExp;
  rawPattern: RegExp;
}> = [
  {
    label: "non-NYC",
    canonicalPattern: /\bnon[-_ ]?nyc\b/i,
    rawPattern: /\bnon[-_ ]?nyc\b|\boutside\s+(new\s+york|nyc)\b/i,
  },
  {
    label: "taxi",
    canonicalPattern: /\btaxi\b/i,
    rawPattern: /\btaxi\b/i,
  },
  {
    label: "all-vehicle",
    canonicalPattern: /\ball[-_ ]?(vehicles?|traffic)\b/i,
    rawPattern: /\ball[-_ ]?(vehicles?|traffic)\b|\bgeneral\s+traffic\b/i,
  },
  {
    label: "parking",
    canonicalPattern: /\bparking\b/i,
    rawPattern: /\bparking\b|\bcurb\b/i,
  },
];

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];
}

function normalizeRawValueKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

function stableHash(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function normalizedKeyId(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]+/g, "_");
}

function resolverKey(keyId: string, rawValue: string): string {
  return `${keyId}\u0000${normalizeRawValueKey(rawValue)}`;
}

function normalizeModifiers(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const values = [...new Set(stringArray(item))].sort((left, right) => left.localeCompare(right));
      return values.length === 0 ? [] : [[key, values]];
    }),
  );
}

function mappingFromRaw(value: unknown): VocabMapping | null {
  if (!isRecord(value)) return null;
  const keyId = stringValue(value["keyId"]);
  const rawValue = stringValue(value["rawValue"]);
  const targetPayloadPath = stringValue(value["targetPayloadPath"]);
  const canonicalLeafId = stringValue(value["canonicalLeafId"]);
  if (keyId === null || rawValue === null || targetPayloadPath === null || canonicalLeafId === null) return null;
  return {
    keyId,
    rawValue,
    targetPayloadPath,
    canonicalLeafId,
    canonicalLeafLabel: stringValue(value["canonicalLeafLabel"]),
    coarseFamily: stringValue(value["coarseFamily"]),
    modifiers: normalizeModifiers(value["modifiers"]),
  };
}

function sameMapping(left: VocabMapping, right: VocabMapping): boolean {
  return (
    left.keyId === right.keyId &&
    left.canonicalLeafId === right.canonicalLeafId &&
    left.targetPayloadPath === right.targetPayloadPath
  );
}

function mergeMapping(existing: ResolverIndexEntry | undefined, mapping: VocabMapping): ResolverIndexEntry {
  if (existing === undefined) return { state: "resolved", mapping };
  const mappings = existing.state === "resolved" ? [existing.mapping] : existing.mappings;
  if (mappings.some((candidate) => sameMapping(candidate, mapping))) {
    return existing;
  }
  return {
    state: "ambiguous",
    mappings: [...mappings, mapping].sort(
      (left, right) =>
        left.canonicalLeafId.localeCompare(right.canonicalLeafId) ||
        left.targetPayloadPath.localeCompare(right.targetPayloadPath),
    ),
  };
}

function fieldMappingsFromVocabApplication(raw: unknown, path: string): VocabMapping[] {
  if (!isRecord(raw)) throw new Error(`Vocab surface application is not an object: ${path}`);
  const surfaces = Array.isArray(raw["normalizedAcceptedSurfaces"]) ? raw["normalizedAcceptedSurfaces"] : [];
  const mappings: VocabMapping[] = [];
  for (const item of surfaces) {
    if (!isRecord(item) || !isRecord(item["surface"])) continue;
    const normalization = isRecord(item["surface"]["normalization"]) ? item["surface"]["normalization"] : {};
    const rawMappings = Array.isArray(normalization["fieldMappings"]) ? normalization["fieldMappings"] : [];
    for (const rawMapping of rawMappings) {
      const mapping = mappingFromRaw(rawMapping);
      if (mapping !== null) mappings.push(mapping);
    }
  }
  if (mappings.length === 0) {
    throw new Error(`Vocab surface application has no normalization.fieldMappings rows: ${path}`);
  }
  return mappings;
}

function buildResolverIndex(mappings: VocabMapping[]): Map<string, ResolverIndexEntry> {
  const index = new Map<string, ResolverIndexEntry>();
  for (const mapping of mappings) {
    const key = resolverKey(mapping.keyId, mapping.rawValue);
    index.set(key, mergeMapping(index.get(key), mapping));
  }
  return index;
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

function proofStateFor(errors: FeatureValidationError[]): ProofState {
  if (
    errors.some((error) =>
      [
        "evidence_pointer_missing",
        "field_support_missing",
        "metric_authority_missing",
        "metric_authority_support_missing",
        "metric_publication_gate_missing",
        "metric_publication_gate_support_missing",
        "metric_value_missing",
        "metric_value_support_missing",
      ].includes(error.code),
    )
  ) {
    return "support_missing";
  }
  if (errors.some((error) => error.code === "evidence_quote_not_source_local" || error.code === "source_verifier_not_verified")) {
    return "ambiguous";
  }
  if (
    errors.some((error) => error.code === "canonical_resolver_missing" || error.code === "canonical_resolver_unsafe_mapping")
  ) {
    return "resolver_missing";
  }
  if (errors.some((error) => error.code === "preserve_raw_quarantined")) return "quarantined";
  return "verified";
}

function canonicalResolverError(input: {
  rawValue: string;
  keyId: string;
  reason: "missing" | "ambiguous";
}): FeatureValidationError {
  return {
    code: "canonical_resolver_missing",
    severity: "blocking",
    retryOwner: "vocab_runner",
    message:
      input.reason === "ambiguous"
        ? `Vocab resolver found multiple canonical leaves for ${input.keyId}: ${input.rawValue}.`
        : `Vocab resolver found no canonical leaf for ${input.keyId}: ${input.rawValue}.`,
    llmRetryInstruction:
      input.reason === "ambiguous"
        ? "Do not retry extraction. The vocab runner must split or quarantine this alias before promotion."
        : "Return the same source-observed value and support if retried; the vocab runner must add a mapped alias or leave it blocked.",
    deterministicRunnerFields: ["canonicalLeafId", "canonicalLeafLabel", "coarseFamily", "modifiers", "targetPayloadPath"],
  };
}

function canonicalSafetyError(input: {
  candidate: FeatureProofCandidate;
  mapping: VocabMapping;
}): FeatureValidationError | null {
  const canonicalText = [input.mapping.canonicalLeafId, input.mapping.canonicalLeafLabel ?? ""].join(" ");
  for (const gate of CANONICAL_SCOPE_INJECTION_GATES) {
    if (!gate.canonicalPattern.test(canonicalText)) continue;
    if (gate.rawPattern.test(input.candidate.rawValue)) continue;
    return {
      code: "canonical_resolver_unsafe_mapping",
      severity: "blocking",
      retryOwner: "vocab_runner",
      message: `Vocab resolver mapping injects ${gate.label} scope not stated by raw value: ${input.candidate.rawValue}.`,
      llmRetryInstruction:
        "Do not retry extraction. The vocab runner must map this alias to a source-compatible leaf or quarantine it before promotion.",
      deterministicRunnerFields: ["canonicalLeafId", "canonicalLeafLabel", "coarseFamily", "modifiers", "targetPayloadPath"],
    };
  }
  return null;
}

function resolvedCandidate(input: {
  candidate: FeatureProofCandidate;
  mapping: VocabMapping;
}): FeatureProofCandidate {
  const validationErrors = input.candidate.validationErrors.filter(
    (error) => error.code !== "canonical_resolver_missing" && error.code !== "canonical_resolver_unsafe_mapping",
  );
  const safetyError = canonicalSafetyError(input);
  if (safetyError !== null) validationErrors.unshift(safetyError);
  const proofState = proofStateFor(validationErrors);
  return {
    ...input.candidate,
    role: "canonical_field",
    proofState,
    targetPayloadPath: input.mapping.targetPayloadPath,
    canonicalLeafId: input.mapping.canonicalLeafId,
    canonicalLeafLabel: input.mapping.canonicalLeafLabel,
    coarseFamily: input.mapping.coarseFamily,
    modifiers: input.mapping.modifiers,
    decision: "mapped",
    validationErrors,
    promotionEligibility: promotionEligibilityFor({
      featureFamily: input.candidate.featureFamily,
      proofState,
      validationErrors,
    }),
  };
}

function identityResolvedCandidate(candidate: FeatureProofCandidate): FeatureProofCandidate {
  const validationErrors = candidate.validationErrors.filter(
    (error) => error.code !== "canonical_resolver_missing" && error.code !== "canonical_resolver_unsafe_mapping",
  );
  const proofState = proofStateFor(validationErrors);
  return {
    ...candidate,
    role: "canonical_field",
    proofState,
    targetPayloadPath: `sourcePayload.${candidate.sourceFieldPath}`,
    canonicalLeafId: `source_local:${normalizedKeyId(candidate.keyId)}:${stableHash([
      candidate.keyId,
      candidate.rawValue,
    ])}`,
    canonicalLeafLabel: candidate.rawValue,
    coarseFamily: `source_local:${candidate.featureFamily}`,
    modifiers: {},
    decision: "mapped",
    validationErrors,
    promotionEligibility: promotionEligibilityFor({
      featureFamily: candidate.featureFamily,
      proofState,
      validationErrors,
    }),
  };
}

function unresolvedCandidate(input: {
  candidate: FeatureProofCandidate;
  reason: "missing" | "ambiguous";
}): FeatureProofCandidate {
  const existing = input.candidate.validationErrors.filter(
    (error) => error.code !== "canonical_resolver_missing" && error.code !== "canonical_resolver_unsafe_mapping",
  );
  const validationErrors = [
    canonicalResolverError({
      rawValue: input.candidate.rawValue,
      keyId: input.candidate.keyId,
      reason: input.reason,
    }),
    ...existing,
  ];
  const proofState = proofStateFor(validationErrors);
  return {
    ...input.candidate,
    proofState,
    validationErrors,
    promotionEligibility: promotionEligibilityFor({
      featureFamily: input.candidate.featureFamily,
      proofState,
      validationErrors,
    }),
  };
}

export function resolveFeatureProofLedgerWithVocab(input: {
  ledger: Tier2FeatureProofLedgerArtifact;
  vocabApplication: unknown;
  sourceProofLedgerPath: string;
  sourceVocabApplicationPath: string;
  generatedAt?: string;
}): VocabResolvedFeatureProofLedgerResult {
  const mappings = fieldMappingsFromVocabApplication(input.vocabApplication, input.sourceVocabApplicationPath);
  const index = buildResolverIndex(mappings);
  const stats: ResolverStats = {
    inputCandidateCount: input.ledger.candidates.length,
    resolvedCandidateCount: 0,
    identityResolvedCandidateCount: 0,
    unresolvedCandidateCount: 0,
    nonVocabCandidateCount: 0,
    ambiguousCandidateCount: 0,
  };
  const candidates = input.ledger.candidates.map((candidate) => {
    const vocabKeyId = VOCAB_KEY_ID_BY_PROOF_KEY_ID[candidate.keyId];
    if (vocabKeyId === undefined) {
      if (IDENTITY_RESOLVED_PROOF_KEY_IDS.has(candidate.keyId) || candidate.keyId.includes(":rawLabel") || candidate.keyId.includes(":sourceStatedContext")) {
        stats.resolvedCandidateCount += 1;
        stats.identityResolvedCandidateCount += 1;
        return identityResolvedCandidate(candidate);
      }
      stats.nonVocabCandidateCount += 1;
      return candidate;
    }
    const entry = index.get(resolverKey(vocabKeyId, candidate.rawValue));
    if (entry === undefined) {
      stats.unresolvedCandidateCount += 1;
      return unresolvedCandidate({ candidate, reason: "missing" });
    }
    if (entry.state === "ambiguous") {
      stats.ambiguousCandidateCount += 1;
      return unresolvedCandidate({
        candidate,
        reason: "ambiguous",
      });
    }
    stats.resolvedCandidateCount += 1;
    return resolvedCandidate({ candidate, mapping: entry.mapping });
  });

  const artifact = buildTier2FeatureProofLedgerFromCandidates({
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceCanonicalMergePath: stringValue((input.vocabApplication as JsonRecord)["sourceCanonicalMergePath"]),
    sourceVocabApplicationPath: input.sourceVocabApplicationPath,
    ...(input.ledger.sourceFeatureExtractionPaths === undefined
      ? {}
      : { sourceFeatureExtractionPaths: input.ledger.sourceFeatureExtractionPaths }),
    ...(input.ledger.sourceFeatureExtractionInputMode === undefined
      ? {}
      : { sourceFeatureExtractionInputMode: input.ledger.sourceFeatureExtractionInputMode }),
    sourceProofLedgerPath: input.sourceProofLedgerPath,
    normalizedSurfaceCount: input.ledger.summary.normalizedSurfaceCount,
    candidates,
  });
  return { artifact, stats };
}

export async function buildTier2FeatureProofLedgerWithVocabResolver(
  args: BuildTier2FeatureProofLedgerWithVocabResolverArgs,
): Promise<VocabResolvedFeatureProofLedgerResult> {
  const proofLedgerPath = fromCliPath(args.proofLedgerPath);
  const vocabApplicationPath = fromCliPath(args.vocabApplicationPath);
  const ledger = (await Bun.file(proofLedgerPath).json()) as Tier2FeatureProofLedgerArtifact;
  const vocabApplication = await Bun.file(vocabApplicationPath).json();
  return resolveFeatureProofLedgerWithVocab({
    ledger,
    vocabApplication,
    sourceProofLedgerPath: proofLedgerPath,
    sourceVocabApplicationPath: vocabApplicationPath,
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
}

export async function runTier2FeatureProofLedgerVocabResolver(args: BuildTier2FeatureProofLedgerWithVocabResolverArgs): Promise<{
  artifact: Tier2FeatureProofLedgerArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
  stats: ResolverStats;
}> {
  const result = await buildTier2FeatureProofLedgerWithVocabResolver(args);
  const outputPath = fromCliPath(
    args.outputPath ??
      join(defaultArtifactRootPath(), "docs", "tier2-feature-vocab-resolver", "feature-proof-ledger.json"),
  );
  const written = await writeTier2FeatureProofLedgerArtifacts({
    artifact: result.artifact,
    outputPath,
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
  });
  return { artifact: result.artifact, ...written, stats: result.stats };
}
