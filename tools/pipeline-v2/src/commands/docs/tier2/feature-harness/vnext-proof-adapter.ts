import { createHash } from "node:crypto";
import { join } from "node:path";
import { defaultArtifactRootPath, fromCliPath } from "../../../../lib/paths.ts";
import {
  FEATURE_FAMILY_SECTIONS,
  type FeatureFamilySection,
  type FieldSupportSubmission,
  TIER2_FEATURE_EXTRACTION_ARTIFACT_KIND,
  type Tier2FeatureExtractionToolResponse,
} from "./contract.ts";
import {
  buildTier2FeatureProofLedgerFromCandidates,
  writeTier2FeatureProofLedgerArtifacts,
} from "./proof-ledger.ts";
import type { Tier2FeatureExtractionVNextArtifact } from "./runner.ts";
import type {
  FeatureFamily,
  FeaturePromotionEligibility,
  FeatureProofCandidate,
  FeatureValidationError,
  FeatureValidationErrorCode,
  FieldEvidence,
  JsonRecord,
  MetricFeatureCompleteness,
  MetricFeatureCompletenessSlot,
  ProofState,
  Tier2FeatureProofLedgerArtifact,
  Tier2FeatureProofLedgerInputMode,
  ValidationRetryOwner,
} from "./types.ts";
import {
  type Tier2FeatureValidatedCandidate,
  validateTier2FeatureExtractionSubmission,
} from "./validator.ts";

export type VNextProofAdapterResult = {
  sourceArtifactPath: string | null;
  inputMode: Tier2FeatureProofLedgerInputMode;
  finalStatus: Tier2FeatureExtractionVNextArtifact["summary"]["finalStatus"];
  skippedBecauseFinalStatus: boolean;
  acceptedCandidateCount: number;
  proofCandidates: FeatureProofCandidate[];
};

export type BuildTier2FeatureProofLedgerFromVNextArgs = {
  vnextArtifactPaths: string[];
  canonicalMergePath?: string;
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
  inputMode?: Tier2FeatureProofLedgerInputMode;
};

export const DEFAULT_VNEXT_PROOF_LEDGER_INPUT_MODE: Tier2FeatureProofLedgerInputMode =
  "strict_final_accepted";

const NON_SOURCE_CANDIDATE_FIELDS = new Set([
  "candidateLocalId",
  "localObservationId",
  "displayLabel",
  "evidenceByField",
  "fieldSupport",
  "routeLookupHandle",
  "requestedUses",
  "relatedLocalObservationIds",
  "belongsToLocalObservationId",
  "dateLocalObservationId",
  "routeLocalObservationId",
  "treatmentLocalObservationId",
  "statusLocalObservationId",
  "fromLocalObservationId",
  "toLocalObservationId",
  "relationKindRaw",
  "dateRole",
  "valueNumeric",
  "rawText",
]);
const VALUE_FIELD_PATHS = ["valueRaw", "valueNumeric"];
const AUTHORITY_FIELD_PATHS = ["sourceClaimAuthority"];
const PUBLICATION_GATE_FIELD_PATHS = ["publicationWordingGate"];

type SupportHandle = {
  handleId: string;
  sourceId: string | null;
  pageNumber?: number | undefined;
  blockId?: string | undefined;
  quoteText?: string | undefined;
  text?: string | undefined;
  queryRaw?: string | undefined;
  checkedSourceFamilyRaw?: string | undefined;
};

type ProvenanceSupportRow = FieldSupportSubmission & {
  supportSource: "fieldSupport" | "evidenceByField";
  evidenceKey: string | null;
};

const SURFACE_KIND_BY_SECTION: Record<FeatureFamilySection, string> = {
  routeScopeCandidates: "entity_mention",
  dateStatusCandidates: "date_status_observation",
  interventionTreatmentCandidates: "treatment_component",
  timelineEventCandidates: "timeline_event",
  metricClaimCandidates: "metric_observation",
  treatmentCandidates: "treatment_component",
  eventIdentityCandidates: "event_candidate",
  tableObservations: "table_observation",
  claimCandidates: "claim",
  sourceStatementCandidates: "source_note",
  sourceStatementClaims: "source_note",
  sourceGapCandidates: "source_gap_seed",
  costValueCandidates: "cost_value",
  serviceDeliveryClaims: "service_delivery_claim",
  ridershipDemandClaims: "ridership_demand_claim",
  geographicContextClaims: "geographic_context_claim",
  relationCandidates: "observation_relation",
};

const KEY_ID_BY_SECTION_FIELD: Record<FeatureFamilySection, Record<string, string>> = {
  routeScopeCandidates: {
    routeTextRaw: "routeScope",
    routeLookupHandle: "routeLookupHandle",
    geographyRaw: "routeGeography",
    corridorTextRaw: "routeCorridorText",
    locationTextRaw: "routeLocationText",
    directionRaw: "routeDirection",
    terminalRaw: "routeTerminal",
    branchRaw: "routeBranch",
    serviceVariantRaw: "routeServiceVariant",
    areaTextRaw: "routeAreaText",
  },
  dateStatusCandidates: {
    rawDateText: "dateText",
    rawStatusText: "dateStatus",
    sourceLanguageStateRaw: "dateSourceLanguageState",
  },
  interventionTreatmentCandidates: {
    projectNameRaw: "interventionProjectName",
    treatmentTextRaw: "treatmentText",
    sourceScopeRaw: "treatmentSourceScope",
    routeTextRaw: "treatmentRouteScope",
    corridorTextRaw: "treatmentCorridorScope",
    locationTextRaw: "treatmentLocationScope",
    statusRaw: "treatmentStatus",
    treatmentPostureRaw: "treatmentPosture",
  },
  timelineEventCandidates: {
    eventTitleRaw: "timelineEventTitle",
    eventKindRaw: "timelineEventKind",
    eventSubtypeRaw: "timelineEventSubtype",
    timelineRelevanceRaw: "timelineRelevance",
    processEvaluationContextFlagRaw: "timelineContextFlag",
  },
  metricClaimCandidates: {
    metricLabelRaw: "metricFamily",
    valueRaw: "metricValue",
    valueNumeric: "metricValue",
    unitRaw: "metricUnit",
    subjectRaw: "metricSubjectFamily",
    periodRaw: "metricPeriod",
    baselinePeriodRaw: "metricBaselinePeriod",
    comparisonPeriodRaw: "metricComparisonPeriod",
    geographyRaw: "metricGeography",
    comparatorRaw: "metricComparator",
    directionRaw: "metricDirection",
    sourceClaimAuthority: "metricAuthority",
    publicationWordingGate: "metricPublicationGate",
    caveatRaw: "metricCaveat",
    denominatorRaw: "metricDenominator",
    truthStatus: "metricTruthStatus",
  },
  treatmentCandidates: {
    treatmentTextRaw: "treatmentText",
    treatmentFamilyRaw: "eventTreatmentFamily",
    routeTextRaw: "treatmentRouteScope",
    statusRaw: "treatmentStatus",
  },
  eventIdentityCandidates: {
    eventFamilyRaw: "eventFamily",
    eventSubtypeRaw: "eventSubtype",
    dateRaw: "eventDate",
    routeTextRaw: "eventRouteScope",
    treatmentTextRaw: "eventTreatmentText",
  },
  tableObservations: {
    tableTitleRaw: "tableKind",
    rowLabelRaw: "tableRowLabel",
    columnLabelRaw: "tableColumnLabel",
    valueRaw: "tableValue",
    unitRaw: "tableUnit",
  },
  claimCandidates: {
    claimTextRaw: "claimText",
    claimKindRaw: "claimKind",
    researchUseTagsRaw: "claimResearchUseTag",
    sourceClaimAuthority: "claimAuthority",
    publicationWordingGate: "claimPublicationGate",
  },
  sourceStatementCandidates: {
    statementTextRaw: "contextText",
    statementKindRaw: "contextKind",
    sourceClaimAuthority: "contextAuthority",
    publicationWordingGate: "contextPublicationGate",
  },
  sourceStatementClaims: {
    statementTextRaw: "contextText",
    statementKindRaw: "contextKind",
    sourceClaimAuthority: "contextAuthority",
    publicationWordingGate: "contextPublicationGate",
  },
  sourceGapCandidates: {
    gapTextRaw: "questionText",
    checkedSourceFamilyRaw: "checkedSourceFamily",
    searchTranscriptHandle: "sourceSearchTranscript",
    missingEvidenceWouldSupportRaw: "sourceGapBlockedClaim",
    publicSafeAbsenceWordingRaw: "sourceGapPublicWording",
    questionKindRaw: "questionKind",
  },
  costValueCandidates: {
    amountRaw: "costAmount",
    currencyRaw: "costCurrency",
    unitRaw: "costUnit",
    costTypeRaw: "costType",
    projectScopeRaw: "costProjectScope",
    routeTextRaw: "costRouteScope",
    corridorTextRaw: "costCorridorScope",
    timeHorizonRaw: "costTimeHorizon",
    fundingSourceRaw: "costFundingSource",
    procurementReferenceRaw: "costProcurementReference",
    benefitDenominatorRaw: "costBenefitDenominator",
    uncertaintyCaveatRaw: "costUncertaintyCaveat",
  },
  serviceDeliveryClaims: {
    serviceDeliveryClaimTextRaw: "serviceDeliveryClaimText",
    metricDefinitionRaw: "serviceDeliveryMetricDefinition",
    routeTextRaw: "serviceDeliveryRouteScope",
    geographyRaw: "serviceDeliveryGeography",
    periodRaw: "serviceDeliveryPeriod",
    cancellationWordingRaw: "serviceDeliveryCancellationWording",
    noOperatorWordingRaw: "serviceDeliveryNoOperatorWording",
    noVehicleWordingRaw: "serviceDeliveryNoVehicleWording",
    serviceDeliveredWordingRaw: "serviceDeliveredWording",
    cjtpComponentRaw: "serviceDeliveryCjtpComponent",
    attributionCauseRaw: "serviceDeliveryAttributionCause",
    caveatRaw: "serviceDeliveryCaveat",
  },
  ridershipDemandClaims: {
    ridershipDemandClaimTextRaw: "ridershipDemandClaimText",
    routeTextRaw: "ridershipDemandRouteScope",
    geographyRaw: "ridershipDemandGeography",
    periodRaw: "ridershipDemandPeriod",
    comparisonPeriodRaw: "ridershipDemandComparisonPeriod",
    valueRaw: "ridershipDemandValue",
    unitRaw: "ridershipDemandUnit",
    trendLanguageRaw: "ridershipDemandTrendLanguage",
    sourceCaveatRaw: "ridershipDemandSourceCaveat",
    denominatorDefinitionRaw: "ridershipDemandDenominatorDefinition",
  },
  geographicContextClaims: {
    areaTextRaw: "geographicAreaText",
    areaKindRaw: "geographicAreaKind",
    equityContextTextRaw: "geographicEquityContext",
    affectedPopulationRaw: "geographicAffectedPopulation",
    routeTextRaw: "geographicRouteScope",
    corridorTextRaw: "geographicCorridorScope",
    allocationCaveatRaw: "geographicAllocationCaveat",
    publicationWordingGate: "geographicPublicationGate",
  },
  relationCandidates: {
    relationTextRaw: "observationRelationText",
  },
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableHash(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizePrimitive(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
    return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeRawValue(value: unknown): string | null {
  const primitive = normalizePrimitive(value);
  if (primitive !== null) return primitive;
  if (Array.isArray(value)) {
    const normalized = value.flatMap((item) => normalizePrimitive(item) ?? []);
    return normalized.length === 0 ? null : uniqueSorted(normalized).join(" | ");
  }
  if (!isRecord(value)) return null;
  const serialized = JSON.stringify(value);
  return serialized === undefined || serialized.length === 0 ? null : serialized;
}

function previewText(value: unknown): string | null {
  const text = normalizePrimitive(value);
  if (text === null) return null;
  return text.length <= 240 ? text : `${text.slice(0, 237)}...`;
}

function hasSubmittedValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some((item) => hasSubmittedValue(item));
  return isRecord(value) && Object.values(value).some((item) => hasSubmittedValue(item));
}

function candidateValueAt(candidate: JsonRecord, fieldPath: string): unknown {
  let cursor: unknown = candidate;
  for (const part of fieldPath.split(".")) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function isNonSourceCandidateField(fieldPath: string): boolean {
  return NON_SOURCE_CANDIDATE_FIELDS.has(fieldPath) || fieldPath.startsWith("evidenceByField.");
}

function fieldSupportRows(candidate: JsonRecord): ProvenanceSupportRow[] {
  return Array.isArray(candidate["fieldSupport"])
    ? candidate["fieldSupport"].flatMap((row): ProvenanceSupportRow[] => {
        return isRecord(row) &&
          typeof row["fieldPath"] === "string" &&
          typeof row["evidenceHandle"] === "string"
          ? [
              {
                ...(row as FieldSupportSubmission),
                supportSource: "fieldSupport",
                evidenceKey: null,
              },
            ]
          : [];
      })
    : [];
}

function evidenceText(handle: {
  quoteText?: string | undefined;
  text?: string | undefined;
  queryRaw?: string | undefined;
  checkedSourceFamilyRaw?: string | undefined;
}): string {
  return [handle.quoteText, handle.text, handle.queryRaw, handle.checkedSourceFamilyRaw]
    .filter((part): part is string => typeof part === "string")
    .join("\n");
}

function normalizedProofText(text: string): string {
  return text
    .replace(/[`*_#>|[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceTextContains(sourceText: string, quoteText: string): boolean {
  if (sourceText.includes(quoteText)) return true;
  const normalizedSource = normalizedProofText(sourceText);
  const normalizedQuote = normalizedProofText(quoteText);
  return normalizedQuote.length > 0 && normalizedSource.includes(normalizedQuote);
}

function supportHandleIndex(
  artifact: Tier2FeatureExtractionVNextArtifact,
): Map<string, SupportHandle> {
  const index = new Map<string, SupportHandle>();
  for (const handle of artifact.request.evidenceHandles) {
    index.set(handle.evidenceHandle, {
      handleId: handle.evidenceHandle,
      sourceId: handle.sourceId,
      ...(handle.pageNumber === undefined ? {} : { pageNumber: handle.pageNumber }),
      ...(handle.blockId === undefined ? {} : { blockId: handle.blockId }),
      ...(handle.quoteText === undefined ? {} : { quoteText: handle.quoteText }),
      ...(handle.text === undefined ? {} : { text: handle.text }),
    });
  }
  for (const handle of artifact.request.sourceSearchTranscriptHandles) {
    index.set(handle.searchTranscriptHandle, {
      handleId: handle.searchTranscriptHandle,
      sourceId: artifact.request.source.sourceId,
      ...(handle.quoteText === undefined ? {} : { quoteText: handle.quoteText }),
      ...(handle.text === undefined ? {} : { text: handle.text }),
      ...(handle.queryRaw === undefined ? {} : { queryRaw: handle.queryRaw }),
      ...(handle.checkedSourceFamilyRaw === undefined
        ? {}
        : { checkedSourceFamilyRaw: handle.checkedSourceFamilyRaw }),
    });
  }
  return index;
}

function resolveEvidenceFieldPath(candidate: JsonRecord, evidenceKey: string): string | null {
  const lastSegment = evidenceKey.split(".").pop() ?? evidenceKey;
  if (evidenceKey.startsWith("evidenceByField.")) {
    return candidateValueAt(candidate, lastSegment) !== undefined ? lastSegment : null;
  }
  if (
    candidateValueAt(candidate, evidenceKey) !== undefined &&
    !isNonSourceCandidateField(evidenceKey)
  ) {
    return evidenceKey;
  }
  return candidateValueAt(candidate, lastSegment) !== undefined ? lastSegment : null;
}

function evidenceByFieldRows(
  candidate: JsonRecord,
  artifact: Tier2FeatureExtractionVNextArtifact,
): ProvenanceSupportRow[] {
  const value = candidate["evidenceByField"];
  if (!isRecord(value)) return [];
  const handles = supportHandleIndex(artifact);
  const rows: ProvenanceSupportRow[] = [];
  for (const [evidenceKey, handleRefs] of Object.entries(value)) {
    if (!Array.isArray(handleRefs)) continue;
    const fieldPath = resolveEvidenceFieldPath(candidate, evidenceKey);
    if (fieldPath === null) continue;
    if (isNonSourceCandidateField(fieldPath)) continue;
    for (const handleRef of handleRefs) {
      if (typeof handleRef !== "string" || handleRef.trim().length === 0) continue;
      const handleText = evidenceText(handles.get(handleRef) ?? {});
      rows.push({
        fieldPath,
        evidenceHandle: handleRef,
        quoteText: handleText.length === 0 ? handleRef : handleText,
        supportCompleteness: "exact",
        supportRole: "evidenceByField",
        supportSource: "evidenceByField",
        evidenceKey,
      });
    }
  }
  return rows;
}

function allSupportRows(
  candidate: JsonRecord,
  artifact: Tier2FeatureExtractionVNextArtifact,
): ProvenanceSupportRow[] {
  return [...fieldSupportRows(candidate), ...evidenceByFieldRows(candidate, artifact)];
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

function canonicalResolverMissingError(): FeatureValidationError {
  return validationError({
    code: "canonical_resolver_missing",
    retryOwner: "vocab_runner",
    message:
      "The accepted vNext raw field has source-local proof but no canonical vocabulary leaf yet.",
    llmRetryInstruction:
      "Return the same source-observed value and support if retried; the deterministic vocabulary resolver must fill canonicalLeafId before promotion.",
    deterministicRunnerFields: [
      "canonicalLeafId",
      "canonicalLeafLabel",
      "coarseFamily",
      "modifiers",
      "targetPayloadPath",
    ],
  });
}

function supportEvidence(input: {
  artifact: Tier2FeatureExtractionVNextArtifact;
  candidateId: string;
  fieldPath: string;
  rows: ProvenanceSupportRow[];
}): { evidence: FieldEvidence; validationErrors: FeatureValidationError[] } {
  const handleIndex = supportHandleIndex(input.artifact);
  const supportIds: string[] = [];
  const evidencePointerIds: string[] = [];
  const completeness: string[] = [];
  const verifierStates: string[] = [];
  const validationErrors: FeatureValidationError[] = [];

  for (const [supportIndex, row] of input.rows.entries()) {
    const handle = handleIndex.get(row.evidenceHandle);
    const sourceText = handle === undefined ? "" : evidenceText(handle);
    const sourceLocal = handle !== undefined && sourceTextContains(sourceText, row.quoteText);
    const supportCompleteness = row.supportCompleteness ?? "exact";
    completeness.push(supportCompleteness);
    supportIds.push(
      `vnext-support:${stableHash([
        input.artifact.runId,
        input.candidateId,
        input.fieldPath,
        row.evidenceHandle,
        row.quoteText,
        supportIndex,
      ])}`,
    );
    if (sourceLocal) {
      evidencePointerIds.push(
        `vnext-pointer:${stableHash([
          input.artifact.runId,
          row.evidenceHandle,
          handle.sourceId,
          handle.pageNumber ?? null,
          handle.blockId ?? null,
          row.quoteText,
        ])}`,
      );
    }
    if (sourceLocal && supportCompleteness === "exact") {
      verifierStates.push("verified");
    } else {
      verifierStates.push("unverified");
      validationErrors.push(
        validationError({
          code: sourceLocal ? "source_verifier_not_verified" : "evidence_quote_not_source_local",
          retryOwner: "llm",
          message: sourceLocal
            ? `${input.candidateId}.${input.fieldPath} has non-exact source support completeness.`
            : `${input.candidateId}.${input.fieldPath} source support is not contained in its evidence or transcript handle.`,
          llmRetryInstruction:
            "Retry with evidenceByField pointing at a source-local handle, or omit the field if the source does not prove it.",
          deterministicRunnerFields: ["evidence", "proofState", "promotionEligibility"],
        }),
      );
    }
  }

  if (input.rows.length === 0) {
    validationErrors.push(
      validationError({
        code: "field_support_missing",
        retryOwner: "llm",
        message: `${input.candidateId}.${input.fieldPath} has no vNext evidenceByField handle.`,
        llmRetryInstruction:
          "Retry with evidenceByField for this exact fieldPath, using only handles supplied by the runner.",
        deterministicRunnerFields: ["evidence", "proofState", "promotionEligibility"],
      }),
    );
  }

  return {
    evidence: {
      fieldSupportFound: input.rows.length > 0,
      supportIds: uniqueSorted(supportIds),
      evidencePointerIds: uniqueSorted(evidencePointerIds),
      verifierStates: uniqueSorted(verifierStates),
      supportCompleteness: uniqueSorted(completeness),
    },
    validationErrors,
  };
}

function supportProofState(evidence: FieldEvidence): ProofState {
  if (!evidence.fieldSupportFound || evidence.evidencePointerIds.length === 0)
    return "support_missing";
  if (!evidence.verifierStates.includes("verified")) return "ambiguous";
  if (evidence.supportCompleteness.length > 0 && !evidence.supportCompleteness.includes("exact"))
    return "ambiguous";
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
    "timeline_event",
    "source_statement",
    "source_gap",
    "cost_value",
    "service_delivery_claim",
    "ridership_demand_claim",
    "geographic_context_claim",
    "relation",
  ]);
  const causalFamilies = new Set<FeatureFamily>([
    "route_scope",
    "operational_date_status",
    "treatment",
    "metric_claim",
    "timeline_event",
    "causal_eligibility",
  ]);
  const briefFamilies = new Set<FeatureFamily>([
    "route_scope",
    "operational_date_status",
    "treatment",
    "metric_claim",
    "table_cell",
    "claim",
    "event_identity",
    "timeline_event",
    "source_statement",
    "source_gap",
    "cost_value",
    "service_delivery_claim",
    "ridership_demand_claim",
    "geographic_context_claim",
    "relation",
  ]);
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
  if (
    errors.some(
      (error) =>
        error.code === "evidence_quote_not_source_local" ||
        error.code === "source_verifier_not_verified",
    )
  ) {
    return "ambiguous";
  }
  if (errors.some((error) => error.code === "canonical_resolver_missing"))
    return "resolver_missing";
  return "verified";
}

function metricSlot(input: {
  candidate: JsonRecord;
  supportByPath: Map<string, ProvenanceSupportRow[]>;
  artifact: Tier2FeatureExtractionVNextArtifact;
  candidateId: string;
  valuePaths: string[];
}): MetricFeatureCompletenessSlot {
  for (const path of input.valuePaths) {
    const value = normalizeRawValue(candidateValueAt(input.candidate, path));
    if (value === null) continue;
    const evidence = supportEvidence({
      artifact: input.artifact,
      candidateId: input.candidateId,
      fieldPath: path,
      rows: input.supportByPath.get(path) ?? [],
    }).evidence;
    return {
      path,
      value,
      evidence,
      proofState: supportProofState(evidence),
    };
  }
  return {
    path: null,
    value: null,
    evidence: {
      fieldSupportFound: false,
      supportIds: [],
      evidencePointerIds: [],
      verifierStates: [],
      supportCompleteness: [],
    },
    proofState: "support_missing",
  };
}

function metricCompleteness(input: {
  candidate: JsonRecord;
  supportByPath: Map<string, ProvenanceSupportRow[]>;
  artifact: Tier2FeatureExtractionVNextArtifact;
  candidateId: string;
}): MetricFeatureCompleteness {
  return {
    value: metricSlot({ ...input, valuePaths: VALUE_FIELD_PATHS }),
    authority: metricSlot({ ...input, valuePaths: AUTHORITY_FIELD_PATHS }),
    publicationGate: metricSlot({ ...input, valuePaths: PUBLICATION_GATE_FIELD_PATHS }),
  };
}

function metricValidationErrors(metric: MetricFeatureCompleteness): FeatureValidationError[] {
  const errors: FeatureValidationError[] = [];
  if (metric.value.value === null) {
    errors.push(
      validationError({
        code: "metric_value_missing",
        retryOwner: "llm",
        message: "Metric claims require valueRaw or valueNumeric before promotion.",
        llmRetryInstruction:
          "Retry with valueRaw/valueNumeric copied from the source, or omit the candidate if the source has no metric value.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
  } else if (metric.value.proofState !== "verified") {
    errors.push(
      validationError({
        code: "metric_value_support_missing",
        retryOwner: "llm",
        message: "Metric value exists but lacks exact source-local proof.",
        llmRetryInstruction: "Retry with evidenceByField for the metric value field.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
  }
  if (metric.authority.value === null) {
    errors.push(
      validationError({
        code: "metric_authority_missing",
        retryOwner: "llm",
        message: "Metric claims require sourceClaimAuthority before promotion.",
        llmRetryInstruction:
          "Retry with sourceClaimAuthority copied from source wording or omit the metric claim.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
  } else if (metric.authority.proofState !== "verified") {
    errors.push(
      validationError({
        code: "metric_authority_support_missing",
        retryOwner: "llm",
        message: "Metric authority exists but lacks exact source-local proof.",
        llmRetryInstruction: "Retry with evidenceByField for sourceClaimAuthority.",
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
          "Retry with publicationWordingGate copied from source wording or omit the metric claim.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
  } else if (metric.publicationGate.proofState !== "verified") {
    errors.push(
      validationError({
        code: "metric_publication_gate_support_missing",
        retryOwner: "llm",
        message: "Metric publication gate exists but lacks exact source-local proof.",
        llmRetryInstruction: "Retry with evidenceByField for publicationWordingGate.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
  }
  return errors;
}

function acceptedValidatedCandidates(
  artifact: Tier2FeatureExtractionVNextArtifact,
): Tier2FeatureValidatedCandidate[] {
  if (artifact.submission === null) return [];
  const validation =
    artifact.validation ??
    validateTier2FeatureExtractionSubmission({
      request: artifact.request,
      submission: artifact.submission,
    });
  return validation.validatedCandidates.filter((candidate) => candidate.accepted);
}

function candidateFor(
  submission: Tier2FeatureExtractionToolResponse,
  validatedCandidate: Tier2FeatureValidatedCandidate,
): JsonRecord | null {
  const sectionCandidates = submission[validatedCandidate.section] as unknown[];
  const candidate = sectionCandidates[validatedCandidate.candidateIndex];
  return isRecord(candidate) ? candidate : null;
}

function supportByPathFor(
  candidate: JsonRecord,
  artifact: Tier2FeatureExtractionVNextArtifact,
): Map<string, ProvenanceSupportRow[]> {
  const supportByPath = new Map<string, ProvenanceSupportRow[]>();
  for (const support of allSupportRows(candidate, artifact)) {
    if (isNonSourceCandidateField(support.fieldPath)) continue;
    const rows = supportByPath.get(support.fieldPath) ?? [];
    rows.push(support);
    supportByPath.set(support.fieldPath, rows);
  }
  return supportByPath;
}

function supportedSourceFieldPaths(
  candidate: JsonRecord,
  supportByPath: Map<string, ProvenanceSupportRow[]>,
): string[] {
  return [...supportByPath.keys()]
    .filter((fieldPath) => {
      if (isNonSourceCandidateField(fieldPath)) return false;
      return hasSubmittedValue(candidateValueAt(candidate, fieldPath));
    })
    .sort((left, right) => left.localeCompare(right));
}

function proofCandidateForField(input: {
  artifact: Tier2FeatureExtractionVNextArtifact;
  artifactPath: string | null;
  validatedCandidate: Tier2FeatureValidatedCandidate;
  candidate: JsonRecord;
  fieldPath: string;
  supportByPath: Map<string, ProvenanceSupportRow[]>;
  fieldIndex: number;
}): FeatureProofCandidate | null {
  const rawValue = normalizeRawValue(candidateValueAt(input.candidate, input.fieldPath));
  if (rawValue === null) return null;
  const sectionFieldKeyIds = KEY_ID_BY_SECTION_FIELD[input.validatedCandidate.section];
  const keyId =
    sectionFieldKeyIds[input.fieldPath] ??
    `${input.validatedCandidate.featureFamily}:${input.fieldPath}`;
  const evidenceResult = supportEvidence({
    artifact: input.artifact,
    candidateId: input.validatedCandidate.candidateId,
    fieldPath: input.fieldPath,
    rows: input.supportByPath.get(input.fieldPath) ?? [],
  });
  const metric =
    input.validatedCandidate.featureFamily === "metric_claim"
      ? metricCompleteness({
          candidate: input.candidate,
          supportByPath: input.supportByPath,
          artifact: input.artifact,
          candidateId: input.validatedCandidate.candidateId,
        })
      : null;
  const validationErrors = [
    canonicalResolverMissingError(),
    ...evidenceResult.validationErrors,
    ...(metric === null ? [] : metricValidationErrors(metric)),
  ];
  const proofState = proofStateFor(validationErrors);
  const promotionEligibility = promotionEligibilityFor({
    featureFamily: input.validatedCandidate.featureFamily,
    proofState,
    validationErrors,
  });
  const source = input.artifact.request.source;
  const displayLabel =
    normalizePrimitive(input.candidate["displayLabel"]) ??
    normalizePrimitive(input.candidate["rawText"]);
  const candidateHash = stableHash([
    input.artifact.runId,
    input.validatedCandidate.candidateId,
    input.fieldPath,
    rawValue,
    input.fieldIndex,
  ]);
  return {
    candidateId: `${input.validatedCandidate.candidateId}:feature:${candidateHash}`,
    role: "unresolved_field",
    featureFamily: input.validatedCandidate.featureFamily,
    proofState,
    keyId,
    sourceFieldPath: `vnext.${input.validatedCandidate.section}.${input.fieldPath}`,
    targetPayloadPath: `canonicalPayload.vnext.${input.validatedCandidate.featureFamily}.${input.fieldPath}`,
    rawValue,
    canonicalLeafId: null,
    canonicalLeafLabel: null,
    coarseFamily: `vnext:${input.validatedCandidate.featureFamily}`,
    modifiers: {},
    decision: "missing_projection",
    source: {
      artifactPath:
        input.artifactPath ??
        input.artifact.outputPath ??
        input.artifact.inputPath ??
        "vnext-feature-extraction",
      auditPath: null,
      windowId: `${source.sourceId}:${source.pageNumbers.join(",")}`,
      runId: input.artifact.runId,
      shardId: null,
      sourceId: source.sourceId,
      pageNumbers: source.pageNumbers,
      surfaceId: input.validatedCandidate.candidateId,
      surfaceKind: SURFACE_KIND_BY_SECTION[input.validatedCandidate.section],
      displayLabel,
      rawTextPreview: previewText(input.candidate["rawText"]),
    },
    evidence: evidenceResult.evidence,
    metricCompleteness: metric,
    validationErrors,
    promotionEligibility,
  };
}

export function vNextArtifactToProofCandidates(input: {
  artifact: Tier2FeatureExtractionVNextArtifact;
  artifactPath?: string | null;
  inputMode?: Tier2FeatureProofLedgerInputMode;
}): VNextProofAdapterResult {
  if (input.artifact.artifactKind !== TIER2_FEATURE_EXTRACTION_ARTIFACT_KIND) {
    throw new Error(`Not a Tier 2 vNext extraction artifact: ${input.artifact.artifactKind}`);
  }
  const inputMode = input.inputMode ?? DEFAULT_VNEXT_PROOF_LEDGER_INPUT_MODE;
  const finalStatus = input.artifact.summary.finalStatus;
  if (inputMode === "strict_final_accepted" && finalStatus !== "accepted") {
    return {
      sourceArtifactPath: input.artifactPath ?? input.artifact.outputPath,
      inputMode,
      finalStatus,
      skippedBecauseFinalStatus: true,
      acceptedCandidateCount: 0,
      proofCandidates: [],
    };
  }
  if (input.artifact.submission === null) {
    return {
      sourceArtifactPath: input.artifactPath ?? input.artifact.outputPath,
      inputMode,
      finalStatus,
      skippedBecauseFinalStatus: false,
      acceptedCandidateCount: 0,
      proofCandidates: [],
    };
  }
  const proofCandidates: FeatureProofCandidate[] = [];
  const accepted = acceptedValidatedCandidates(input.artifact);
  for (const validatedCandidate of accepted) {
    if (!FEATURE_FAMILY_SECTIONS.some((section) => section.section === validatedCandidate.section))
      continue;
    const candidate = candidateFor(input.artifact.submission, validatedCandidate);
    if (candidate === null) continue;
    const supportByPath = supportByPathFor(candidate, input.artifact);
    const fieldPaths = supportedSourceFieldPaths(candidate, supportByPath);
    for (const [fieldIndex, fieldPath] of fieldPaths.entries()) {
      const proofCandidate = proofCandidateForField({
        artifact: input.artifact,
        artifactPath: input.artifactPath ?? null,
        validatedCandidate,
        candidate,
        fieldPath,
        supportByPath,
        fieldIndex,
      });
      if (proofCandidate !== null) proofCandidates.push(proofCandidate);
    }
  }
  return {
    sourceArtifactPath: input.artifactPath ?? input.artifact.outputPath,
    inputMode,
    finalStatus,
    skippedBecauseFinalStatus: false,
    acceptedCandidateCount: accepted.length,
    proofCandidates,
  };
}

async function readVNextArtifact(path: string): Promise<Tier2FeatureExtractionVNextArtifact> {
  const resolvedPath = fromCliPath(path);
  const raw = await Bun.file(resolvedPath).json();
  if (!isRecord(raw))
    throw new Error(`Tier 2 vNext extraction artifact is not an object: ${resolvedPath}`);
  return raw as Tier2FeatureExtractionVNextArtifact;
}

export async function buildTier2FeatureProofLedgerFromVNext(
  args: BuildTier2FeatureProofLedgerFromVNextArgs,
): Promise<Tier2FeatureProofLedgerArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const inputMode = args.inputMode ?? DEFAULT_VNEXT_PROOF_LEDGER_INPUT_MODE;
  const sourceFeatureExtractionPaths = args.vnextArtifactPaths.map((path) => fromCliPath(path));
  const adapted = await Promise.all(
    sourceFeatureExtractionPaths.map(async (artifactPath) =>
      vNextArtifactToProofCandidates({
        artifact: await readVNextArtifact(artifactPath),
        artifactPath,
        inputMode,
      }),
    ),
  );
  const candidates = adapted.flatMap((result) => result.proofCandidates);
  const acceptedCandidateCount = adapted.reduce(
    (sum, result) => sum + result.acceptedCandidateCount,
    0,
  );
  return buildTier2FeatureProofLedgerFromCandidates({
    generatedAt,
    sourceCanonicalMergePath:
      args.canonicalMergePath === undefined ? null : fromCliPath(args.canonicalMergePath),
    sourceVocabApplicationPath: `vnext-feature-extraction:${sourceFeatureExtractionPaths.join(",")}`,
    sourceFeatureExtractionPaths,
    sourceFeatureExtractionInputMode: inputMode,
    normalizedSurfaceCount: acceptedCandidateCount,
    candidates,
  });
}

export async function runTier2FeatureProofLedgerFromVNext(
  args: BuildTier2FeatureProofLedgerFromVNextArgs,
): Promise<{
  artifact: Tier2FeatureProofLedgerArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const artifact = await buildTier2FeatureProofLedgerFromVNext(args);
  const outputPath = fromCliPath(
    args.outputPath ??
      join(
        defaultArtifactRootPath(),
        "docs",
        "tier2-feature-vnext-proof-ledger",
        "feature-proof-ledger.json",
      ),
  );
  const written = await writeTier2FeatureProofLedgerArtifacts({
    artifact,
    outputPath,
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
  });
  return { artifact, ...written };
}
