import type { z } from "zod";
import {
  FEATURE_FAMILY_SECTIONS,
  type FeatureFamilySection,
  type FieldSupportSubmission,
  type Tier2FeatureExtractionRequest,
  Tier2FeatureExtractionRequestSchema,
  type Tier2FeatureExtractionToolResponse,
  Tier2FeatureExtractionToolResponseSchema,
} from "./contract.ts";
import type {
  FeatureFamily,
  FeatureValidationError,
  FeatureValidationErrorCode,
  JsonRecord,
  ValidationRetryOwner,
} from "./types.ts";

export type Tier2FeatureValidatedCandidate = {
  candidateId: string;
  section: FeatureFamilySection;
  featureFamily: FeatureFamily;
  candidateIndex: number;
  candidateLocalId: string | null;
  accepted: boolean;
  validationErrors: FeatureValidationError[];
};

export type Tier2FeatureExtractionValidation = {
  toolShapeValid: boolean;
  acceptedCandidateCount: number;
  rejectedCandidateCount: number;
  validationErrorCount: number;
  validationErrors: FeatureValidationError[];
  validatedCandidates: Tier2FeatureValidatedCandidate[];
  parsedSubmission: Tier2FeatureExtractionToolResponse | null;
};

type CandidateContext = {
  section: FeatureFamilySection;
  featureFamily: FeatureFamily;
  candidateIndex: number;
  candidate: JsonRecord;
};

const CATEGORY_KEY_PATTERN = /(kind|type|family|category|taxonomy|classification)$/i;

const REQUIRED_SUPPORT_FIELDS: Record<FeatureFamilySection, string[]> = {
  routeScopeCandidates: ["routeTextRaw"],
  dateStatusCandidates: ["rawDateText"],
  interventionTreatmentCandidates: ["treatmentTextRaw"],
  timelineEventCandidates: ["eventTitleRaw"],
  metricClaimCandidates: ["metricLabelRaw", "subjectRaw", "unitRaw"],
  treatmentCandidates: ["treatmentTextRaw"],
  eventIdentityCandidates: ["eventFamilyRaw"],
  tableObservations: ["tableTitleRaw"],
  claimCandidates: ["claimTextRaw"],
  sourceStatementCandidates: ["statementTextRaw"],
  sourceStatementClaims: ["statementTextRaw"],
  sourceGapCandidates: [
    "gapTextRaw",
    "checkedSourceFamilyRaw",
    "searchTranscriptHandle",
    "missingEvidenceWouldSupportRaw",
    "publicSafeAbsenceWordingRaw",
  ],
  costValueCandidates: ["amountRaw"],
  serviceDeliveryClaims: ["serviceDeliveryClaimTextRaw"],
  ridershipDemandClaims: ["ridershipDemandClaimTextRaw"],
  geographicContextClaims: ["areaTextRaw"],
  relationCandidates: ["relationTextRaw"],
};

const VALUE_SUPPORT_PATHS = ["valueRaw", "valueNumeric"];
const COST_CONTEXT_FIELDS = [
  "rawText",
  "amountRaw",
  "currencyRaw",
  "unitRaw",
  "costTypeRaw",
  "projectScopeRaw",
  "fundingSourceRaw",
  "procurementReferenceRaw",
  "benefitDenominatorRaw",
  "uncertaintyCaveatRaw",
];
const SERVICE_DELIVERY_CONTEXT_FIELDS = [
  "rawText",
  "serviceDeliveryClaimTextRaw",
  "metricDefinitionRaw",
  "cancellationWordingRaw",
  "noOperatorWordingRaw",
  "noVehicleWordingRaw",
  "serviceDeliveredWordingRaw",
  "cjtpComponentRaw",
  "attributionCauseRaw",
];
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
]);

type SupportHandle = {
  handleId: string;
  handleKind: "source_evidence" | "source_search_transcript";
  quoteText?: string | undefined;
  text?: string | undefined;
  queryRaw?: string | undefined;
  checkedSourceFamilyRaw?: string | undefined;
};

type ProvenanceSupportRow = FieldSupportSubmission & {
  supportSource: "fieldSupport" | "evidenceByField";
  evidenceKey: string | null;
};

type SubmissionObservationIndex = {
  localObservationIds: Set<string>;
};

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

function pathPrefix(ctx: CandidateContext): string {
  return `${ctx.section}.${ctx.candidateIndex}`;
}

function candidateId(ctx: CandidateContext): string {
  const local =
    typeof ctx.candidate["candidateLocalId"] === "string"
      ? ctx.candidate["candidateLocalId"]
      : null;
  return `${ctx.featureFamily}:${ctx.candidateIndex}:${local ?? "candidate"}`;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function supportHandleIndex(request: Tier2FeatureExtractionRequest): Map<string, SupportHandle> {
  const index = new Map<string, SupportHandle>();
  for (const handle of request.evidenceHandles) {
    index.set(handle.evidenceHandle, {
      handleId: handle.evidenceHandle,
      handleKind: "source_evidence",
      ...(handle.quoteText === undefined ? {} : { quoteText: handle.quoteText }),
      ...(handle.text === undefined ? {} : { text: handle.text }),
    });
  }
  for (const handle of request.sourceSearchTranscriptHandles) {
    index.set(handle.searchTranscriptHandle, {
      handleId: handle.searchTranscriptHandle,
      handleKind: "source_search_transcript",
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

function candidateValueAt(candidate: JsonRecord, fieldPath: string): unknown {
  let cursor: unknown = candidate;
  for (const part of fieldPath.split(".")) {
    if (cursor === null || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    cursor = (cursor as JsonRecord)[part];
  }
  return cursor;
}

function isNonSourceCandidateField(fieldPath: string): boolean {
  return NON_SOURCE_CANDIDATE_FIELDS.has(fieldPath) || fieldPath.startsWith("evidenceByField.");
}

function resolveEvidenceFieldPath(candidate: JsonRecord, evidenceKey: string): string | null {
  const lastSegment = evidenceKey.split(".").pop() ?? evidenceKey;
  if (evidenceKey.startsWith("evidenceByField.")) {
    return fieldExists(candidate, lastSegment) ? lastSegment : null;
  }
  if (fieldExists(candidate, evidenceKey) && !isNonSourceCandidateField(evidenceKey))
    return evidenceKey;
  return fieldExists(candidate, lastSegment) ? lastSegment : null;
}

function legacySupportRows(candidate: JsonRecord): ProvenanceSupportRow[] {
  return Array.isArray(candidate["fieldSupport"])
    ? candidate["fieldSupport"].flatMap((item): ProvenanceSupportRow[] => {
        return item !== null &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof (item as { fieldPath?: unknown }).fieldPath === "string" &&
          typeof (item as { evidenceHandle?: unknown }).evidenceHandle === "string"
          ? [
              {
                ...(item as FieldSupportSubmission),
                supportSource: "fieldSupport",
                evidenceKey: null,
              },
            ]
          : [];
      })
    : [];
}

function evidenceByFieldRows(
  candidate: JsonRecord,
  request: Tier2FeatureExtractionRequest,
): ProvenanceSupportRow[] {
  const value = candidate["evidenceByField"];
  if (!isRecord(value)) return [];
  const handles = supportHandleIndex(request);
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

function supportRows(
  candidate: JsonRecord,
  request: Tier2FeatureExtractionRequest,
): ProvenanceSupportRow[] {
  return [...legacySupportRows(candidate), ...evidenceByFieldRows(candidate, request)];
}

function supportFor(
  candidate: JsonRecord,
  request: Tier2FeatureExtractionRequest,
  fieldPath: string,
): ProvenanceSupportRow[] {
  return supportRows(candidate, request).filter((support) => support.fieldPath === fieldPath);
}

function fieldExists(candidate: JsonRecord, fieldPath: string): boolean {
  return candidateValueAt(candidate, fieldPath) !== undefined;
}

function hasSubmittedValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some((item) => hasSubmittedValue(item));
  return false;
}

function candidateText(candidate: JsonRecord, fields: string[]): string {
  return fields
    .flatMap((fieldPath) => {
      const value = candidateValueAt(candidate, fieldPath);
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return [String(value)];
      }
      return [];
    })
    .join("\n");
}

function metricValueExists(candidate: JsonRecord): boolean {
  return VALUE_SUPPORT_PATHS.some((fieldPath) =>
    hasSubmittedValue(candidateValueAt(candidate, fieldPath)),
  );
}

function addSupportErrors(input: {
  request: Tier2FeatureExtractionRequest;
  ctx: CandidateContext;
  fieldPath: string;
  errors: FeatureValidationError[];
}) {
  const rows = supportFor(input.ctx.candidate, input.request, input.fieldPath);
  if (rows.length === 0) {
    input.errors.push(
      validationError({
        code: "field_support_missing",
        retryOwner: "llm",
        message: `${pathPrefix(input.ctx)}.${input.fieldPath} has no source-local evidenceByField handle.`,
        llmRetryInstruction: `Retry with evidenceByField for ${pathPrefix(input.ctx)}.${input.fieldPath}, using only evidence or transcript handles supplied by the runner.`,
        deterministicRunnerFields: ["proofState", "promotionEligibility"],
      }),
    );
  }
}

function validateSubmittedOptionalFields(input: {
  request: Tier2FeatureExtractionRequest;
  ctx: CandidateContext;
  errors: FeatureValidationError[];
}) {
  const requiredFields = new Set(REQUIRED_SUPPORT_FIELDS[input.ctx.section]);
  for (const [fieldPath, value] of Object.entries(input.ctx.candidate)) {
    if (isNonSourceCandidateField(fieldPath) || requiredFields.has(fieldPath)) continue;
    if (!hasSubmittedValue(value)) continue;
    const alreadySupportedMetricValue =
      input.ctx.section === "metricClaimCandidates" &&
      VALUE_SUPPORT_PATHS.includes(fieldPath) &&
      VALUE_SUPPORT_PATHS.some(
        (valuePath) => supportFor(input.ctx.candidate, input.request, valuePath).length > 0,
      );
    if (alreadySupportedMetricValue) continue;
    addSupportErrors({ request: input.request, ctx: input.ctx, fieldPath, errors: input.errors });
  }
}

function supportRowPath(input: { row: ProvenanceSupportRow; supportIndex: number }): string {
  return input.row.supportSource === "evidenceByField"
    ? `evidenceByField.${input.row.evidenceKey ?? input.row.fieldPath}`
    : `fieldSupport.${input.supportIndex}`;
}

function validateSupportRowsResolve(input: {
  request: Tier2FeatureExtractionRequest;
  ctx: CandidateContext;
  errors: FeatureValidationError[];
}) {
  const handles = supportHandleIndex(input.request);
  for (const [supportIndex, row] of supportRows(input.ctx.candidate, input.request).entries()) {
    if (isNonSourceCandidateField(row.fieldPath)) continue;
    const rowPath = supportRowPath({ row, supportIndex });
    if (!fieldExists(input.ctx.candidate, row.fieldPath)) {
      input.errors.push(
        validationError({
          code: "evidence_field_path_invalid",
          retryOwner: "llm",
          message: `${pathPrefix(input.ctx)}.${rowPath} does not resolve to a field on the candidate.`,
          llmRetryInstruction:
            "Retry with evidenceByField keys that end in an actual candidate field, for example metricClaim.valueRaw or rawText. Remove proof for omitted fields.",
          deterministicRunnerFields: ["validationErrors"],
        }),
      );
    }
    const handle = handles.get(row.evidenceHandle);
    if (handle === undefined) {
      input.errors.push(
        validationError({
          code: "evidence_handle_unknown",
          retryOwner: "llm",
          message: `${pathPrefix(input.ctx)}.${rowPath} references a handle that was not supplied by the runner.`,
          llmRetryInstruction:
            "Retry using only ids from request.evidenceHandles or request.sourceSearchTranscriptHandles.",
          deterministicRunnerFields: ["validationErrors"],
        }),
      );
      continue;
    }
    const sourceText = evidenceText(handle);
    if (sourceText.trim().length === 0) {
      input.errors.push(
        validationError({
          code: "evidence_pointer_missing",
          retryOwner: "runner",
          message: `${pathPrefix(input.ctx)}.${rowPath} references a handle with no source text attached.`,
          llmRetryInstruction:
            "Return the same source-observed value if retried; the runner must attach source or transcript text to this handle.",
          deterministicRunnerFields: ["evidenceHandles", "sourceSearchTranscriptHandles"],
        }),
      );
      continue;
    }
    if (!sourceTextContains(sourceText, row.quoteText)) {
      input.errors.push(
        validationError({
          code: "evidence_quote_not_source_local",
          retryOwner: "llm",
          message: `${pathPrefix(input.ctx)}.${rowPath} quote text is not contained in the referenced handle.`,
          llmRetryInstruction:
            "Retry with evidenceByField handle refs instead of paraphrased quote text, or use legacy fieldSupport.quoteText copied from the handle.",
          deterministicRunnerFields: ["validationErrors"],
        }),
      );
    }
  }
}

function validateSourceGapTranscript(input: {
  request: Tier2FeatureExtractionRequest;
  ctx: CandidateContext;
  errors: FeatureValidationError[];
}) {
  if (input.ctx.section !== "sourceGapCandidates") return;
  const transcriptIds = new Set(
    input.request.sourceSearchTranscriptHandles.map((handle) => handle.searchTranscriptHandle),
  );
  if (transcriptIds.size === 0) {
    input.errors.push(
      validationError({
        code: "source_gap_transcript_missing",
        retryOwner: "runner",
        message: `${pathPrefix(input.ctx)} is a source-gap candidate, but the request has no source-search transcript handles.`,
        llmRetryInstruction:
          "Do not submit sourceGapCandidates unless the runner supplies sourceSearchTranscriptHandles for the checked source search.",
        deterministicRunnerFields: ["sourceSearchTranscriptHandles", "queue role gates"],
      }),
    );
    return;
  }
  const handle = input.ctx.candidate["searchTranscriptHandle"];
  if (typeof handle !== "string" || transcriptIds.has(handle)) return;
  input.errors.push(
    validationError({
      code: "evidence_handle_unknown",
      retryOwner: "llm",
      message: `${pathPrefix(input.ctx)}.searchTranscriptHandle is not in request.sourceSearchTranscriptHandles.`,
      llmRetryInstruction:
        "Retry using exactly one sourceSearchTranscriptHandles.searchTranscriptHandle supplied by the runner.",
      deterministicRunnerFields: ["validationErrors"],
    }),
  );
}

function monetaryValueCount(text: string): number {
  const matches = text.match(
    /(?:\$ ?\d[\d,]*(?:\.\d+)? ?(?:m|mm|million|b|bn|billion|k|thousand)?|\b\d[\d,]*(?:\.\d+)? ?(?:million|billion|thousand) (?:dollars?|usd)\b|\b\d[\d,]*(?:\.\d+)? ?(?:m|mm|b|bn) ?(?:dollars?|usd)\b)/gi,
  );
  return matches?.length ?? 0;
}

function validateCostValueCandidate(input: {
  ctx: CandidateContext;
  errors: FeatureValidationError[];
}) {
  if (input.ctx.section !== "costValueCandidates") return;
  const context = candidateText(input.ctx.candidate, COST_CONTEXT_FIELDS);
  const amountRaw = String(input.ctx.candidate["amountRaw"] ?? "");
  const hasMoneyContext =
    /(?:\$|usd|dollars?|costs?|budget|funding|funded|grant|contract|procurement|capital|operating|expense|price|appropriat(?:e|ed|ion)|allocation)/i.test(
      context,
    );
  if (!hasMoneyContext) {
    input.errors.push(
      validationError({
        code: "cost_not_monetary",
        retryOwner: "llm",
        message: `${pathPrefix(input.ctx)} is a cost candidate but the submitted amount/context is not monetary.`,
        llmRetryInstruction:
          "Retry as costValueCandidates only when the source states a monetary cost, budget, funding, grant, contract, procurement, or dollar amount. Otherwise omit the candidate or use another family.",
        deterministicRunnerFields: ["validationErrors", "promotionEligibility"],
      }),
    );
  }
  if (monetaryValueCount(amountRaw) > 1) {
    input.errors.push(
      validationError({
        code: "cost_multiple_amounts",
        retryOwner: "llm",
        message: `${pathPrefix(input.ctx)}.amountRaw contains multiple monetary values.`,
        llmRetryInstruction:
          "Retry with one costValueCandidate per monetary amount, preserving the exact source wording and scope for each value.",
        deterministicRunnerFields: ["validationErrors", "promotionEligibility"],
      }),
    );
  }
}

function validateServiceDeliveryCandidate(input: {
  ctx: CandidateContext;
  errors: FeatureValidationError[];
}) {
  if (input.ctx.section !== "serviceDeliveryClaims") return;
  const context = candidateText(input.ctx.candidate, SERVICE_DELIVERY_CONTEXT_FIELDS);
  const isServiceDelivery =
    /(?:cancel(?:led|ed|lation|lations)?|service delivered|scheduled service|scheduled trips?|operated trips?|actual service|promised service|missed trips?|dropped trips?|unserved trips?|trip(?:s)? (?:not|never) (?:run|ran|operated)|no operator|operator (?:shortage|unavailable|availability)|no vehicle|vehicle (?:shortage|unavailable|availability)|customer journey time|cjtp|wait assessment|service shortfall|headway adherence|run the service)/i.test(
      context,
    );
  if (isServiceDelivery) return;
  input.errors.push(
    validationError({
      code: "service_delivery_scope_unsupported",
      retryOwner: "llm",
      message: `${pathPrefix(input.ctx)} is not an actual scheduled-vs-operated, cancellation, service-delivered, or CJTP service-delivery claim.`,
      llmRetryInstruction:
        "Retry serviceDeliveryClaims only for cancellation, scheduled-vs-operated, service-delivered, no-operator/no-vehicle, CJTP component, wait-assessment, or service-shortfall wording. Use sourceStatementClaims or treatment/timeline families for launches, outreach, warnings, or project status.",
      deterministicRunnerFields: ["validationErrors", "promotionEligibility"],
    }),
  );
}

function buildObservationIndex(
  submission: Tier2FeatureExtractionToolResponse,
): SubmissionObservationIndex {
  const localObservationIds = new Set<string>();
  for (const { section } of FEATURE_FAMILY_SECTIONS) {
    const candidates = submission[section] as JsonRecord[];
    for (const candidate of candidates) {
      for (const fieldPath of ["localObservationId", "candidateLocalId"]) {
        const value = candidate[fieldPath];
        if (typeof value === "string" && value.trim().length > 0) {
          localObservationIds.add(value);
        }
      }
    }
  }
  return { localObservationIds };
}

function validateRelationTargets(input: {
  observationIndex: SubmissionObservationIndex;
  ctx: CandidateContext;
  errors: FeatureValidationError[];
}) {
  if (input.ctx.section !== "relationCandidates") return;
  for (const fieldPath of ["fromLocalObservationId", "toLocalObservationId"]) {
    const value = input.ctx.candidate[fieldPath];
    if (typeof value !== "string" || input.observationIndex.localObservationIds.has(value))
      continue;
    input.errors.push(
      validationError({
        code: "relation_target_unknown",
        retryOwner: "llm",
        message: `${pathPrefix(input.ctx)}.${fieldPath} references "${value}", which was not submitted as a candidateLocalId or localObservationId in this tool response.`,
        llmRetryInstruction:
          "Retry relationCandidates only between observations submitted in this same tool response, using their candidateLocalId or localObservationId exactly.",
        deterministicRunnerFields: ["validationErrors", "promotionEligibility"],
      }),
    );
  }
}

function validateRequiredFields(input: {
  request: Tier2FeatureExtractionRequest;
  ctx: CandidateContext;
  errors: FeatureValidationError[];
}) {
  for (const fieldPath of REQUIRED_SUPPORT_FIELDS[input.ctx.section]) {
    if (!fieldExists(input.ctx.candidate, fieldPath)) {
      const code: FeatureValidationErrorCode =
        input.ctx.section === "metricClaimCandidates" && fieldPath === "subjectRaw"
          ? "metric_subject_missing"
          : input.ctx.section === "metricClaimCandidates" && fieldPath === "unitRaw"
            ? "metric_unit_missing"
            : input.ctx.section === "metricClaimCandidates" && fieldPath === "sourceClaimAuthority"
              ? "metric_authority_missing"
              : input.ctx.section === "metricClaimCandidates" &&
                  fieldPath === "publicationWordingGate"
                ? "metric_publication_gate_missing"
                : "tool_shape_invalid";
      input.errors.push(
        validationError({
          code,
          retryOwner: "llm",
          message: `${pathPrefix(input.ctx)}.${fieldPath} is required for ${input.ctx.featureFamily}.`,
          llmRetryInstruction: `Retry with ${fieldPath} filled from source text, or omit the candidate if the source does not support it.`,
          deterministicRunnerFields: ["validationErrors", "promotionEligibility"],
        }),
      );
      continue;
    }
    addSupportErrors({ request: input.request, ctx: input.ctx, fieldPath, errors: input.errors });
  }
  if (input.ctx.section !== "metricClaimCandidates") return;
  if (!metricValueExists(input.ctx.candidate)) {
    input.errors.push(
      validationError({
        code: "metric_value_missing",
        retryOwner: "llm",
        message: `${pathPrefix(input.ctx)} is a metric claim but has no valueRaw or valueNumeric.`,
        llmRetryInstruction:
          "Retry with valueRaw or valueNumeric copied from the source; downgrade or omit the candidate if the source has no metric value.",
        deterministicRunnerFields: ["metricCompleteness", "promotionEligibility"],
      }),
    );
    return;
  }
  const valueField = VALUE_SUPPORT_PATHS.find((fieldPath) =>
    fieldExists(input.ctx.candidate, fieldPath),
  );
  if (valueField !== undefined) {
    addSupportErrors({
      request: input.request,
      ctx: input.ctx,
      fieldPath: valueField,
      errors: input.errors,
    });
  }
}

function zodErrors(error: z.ZodError): FeatureValidationError[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".") || "<root>";
    const unrecognized = issue.code === "unrecognized_keys" ? issue.keys : [];
    const hasCategoryKey = unrecognized.some((key) => CATEGORY_KEY_PATTERN.test(key));
    if (issue.code === "too_big") {
      return validationError({
        code: "extraction_limit_exceeded",
        retryOwner: "llm",
        message: `Tool response exceeded an extraction limit at ${path}: ${issue.message}`,
        llmRetryInstruction:
          "Retry with fewer candidates and shorter notes. Use the request extractionLimits as caps, not quotas; omit low-value, duplicate, legend-only, or weakly supported candidates.",
        deterministicRunnerFields: ["validationErrors", "promotionEligibility"],
      });
    }
    return validationError({
      code: hasCategoryKey ? "unknown_category_key" : "tool_shape_invalid",
      retryOwner: "llm",
      message: `Tool response shape error at ${path}: ${issue.message}`,
      llmRetryInstruction:
        "Retry using only the strict vNext feature-family schema. Do not invent category, kind, family, or type keys outside the allowed fields.",
      deterministicRunnerFields: ["schemaVersion", "validationErrors"],
    });
  });
}

function stripEmptyOptionalStrings(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripEmptyOptionalStrings(item));
  if (value === null || typeof value !== "object") return value;
  const output: JsonRecord = {};
  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (key === "fieldSupport") continue;
    if (item === "") continue;
    output[key] = stripEmptyOptionalStrings(item);
  }
  return output;
}

function validateExtractionLimits(input: {
  request: Tier2FeatureExtractionRequest;
  submission: Tier2FeatureExtractionToolResponse;
  errors: FeatureValidationError[];
}) {
  let totalCandidates = 0;
  for (const { section } of FEATURE_FAMILY_SECTIONS) {
    const candidates = input.submission[section];
    totalCandidates += candidates.length;
    const limit = input.request.extractionLimits[section];
    if (candidates.length <= limit) continue;
    input.errors.push(
      validationError({
        code: "extraction_limit_exceeded",
        retryOwner: "llm",
        message: `${section} submitted ${candidates.length} candidates; limit is ${limit}.`,
        llmRetryInstruction:
          "Retry with fewer candidates in this family. Keep only the highest-value source-supported candidates and omit legend-only, duplicate, or weakly supported observations.",
        deterministicRunnerFields: ["validationErrors", "promotionEligibility"],
      }),
    );
  }
  const totalLimit = input.request.extractionLimits.totalCandidates;
  if (totalCandidates <= totalLimit) return;
  input.errors.push(
    validationError({
      code: "extraction_limit_exceeded",
      retryOwner: "llm",
      message: `Tool response submitted ${totalCandidates} total candidates; limit is ${totalLimit}.`,
      llmRetryInstruction:
        "Retry with fewer total candidates. Prioritize direct bus-priority treatments, route scope, source-stated metric claims, source statements, and source gaps.",
      deterministicRunnerFields: ["validationErrors", "promotionEligibility"],
    }),
  );
}

export function validateTier2FeatureExtractionSubmission(input: {
  request: unknown;
  submission: unknown;
}): Tier2FeatureExtractionValidation {
  const parsedRequest = Tier2FeatureExtractionRequestSchema.safeParse(input.request);
  if (!parsedRequest.success) {
    const errors = zodErrors(parsedRequest.error);
    return {
      toolShapeValid: false,
      acceptedCandidateCount: 0,
      rejectedCandidateCount: 0,
      validationErrorCount: errors.length,
      validationErrors: errors,
      validatedCandidates: [],
      parsedSubmission: null,
    };
  }
  const parsedSubmission = Tier2FeatureExtractionToolResponseSchema.safeParse(
    stripEmptyOptionalStrings(input.submission),
  );
  if (!parsedSubmission.success) {
    const errors = zodErrors(parsedSubmission.error);
    return {
      toolShapeValid: false,
      acceptedCandidateCount: 0,
      rejectedCandidateCount: 0,
      validationErrorCount: errors.length,
      validationErrors: errors,
      validatedCandidates: [],
      parsedSubmission: null,
    };
  }

  const validatedCandidates: Tier2FeatureValidatedCandidate[] = [];
  const allErrors: FeatureValidationError[] = [];
  validateExtractionLimits({
    request: parsedRequest.data,
    submission: parsedSubmission.data,
    errors: allErrors,
  });
  const observationIndex = buildObservationIndex(parsedSubmission.data);
  for (const { section, featureFamily } of FEATURE_FAMILY_SECTIONS) {
    const candidates = parsedSubmission.data[section] as JsonRecord[];
    for (const [candidateIndex, candidate] of candidates.entries()) {
      const ctx: CandidateContext = { section, featureFamily, candidateIndex, candidate };
      const errors: FeatureValidationError[] = [];
      validateSupportRowsResolve({ request: parsedRequest.data, ctx, errors });
      validateSourceGapTranscript({ request: parsedRequest.data, ctx, errors });
      validateRequiredFields({ request: parsedRequest.data, ctx, errors });
      validateSubmittedOptionalFields({ request: parsedRequest.data, ctx, errors });
      validateCostValueCandidate({ ctx, errors });
      validateServiceDeliveryCandidate({ ctx, errors });
      validateRelationTargets({ observationIndex, ctx, errors });
      validatedCandidates.push({
        candidateId: candidateId(ctx),
        section,
        featureFamily,
        candidateIndex,
        candidateLocalId:
          typeof candidate["candidateLocalId"] === "string" ? candidate["candidateLocalId"] : null,
        accepted: errors.length === 0,
        validationErrors: errors,
      });
      allErrors.push(...errors);
    }
  }

  return {
    toolShapeValid: true,
    acceptedCandidateCount: validatedCandidates.filter((candidate) => candidate.accepted).length,
    rejectedCandidateCount: validatedCandidates.filter((candidate) => !candidate.accepted).length,
    validationErrorCount: allErrors.length,
    validationErrors: allErrors,
    validatedCandidates,
    parsedSubmission: parsedSubmission.data,
  };
}

export function retryFeedbackForFeatureValidation(validation: Tier2FeatureExtractionValidation) {
  return validation.validatedCandidates
    .filter((candidate) => candidate.validationErrors.length > 0)
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      section: candidate.section,
      featureFamily: candidate.featureFamily,
      candidateIndex: candidate.candidateIndex,
      errors: candidate.validationErrors.map((error) => ({
        code: error.code,
        message: error.message,
        llmRetryInstruction: error.llmRetryInstruction,
      })),
    }));
}
