import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import {
  adaptMtaWikiTreatmentSemanticContractV1,
  assertMtaWikiTreatmentSemanticsReconciledV1,
  assertReviewedOpenTreatmentVocabularyExact,
  DOCUMENT_TREATMENT_DISPOSITIONS,
  LEGACY_ROUTE_TREATMENT_DISPOSITIONS,
  type MtaWikiTreatmentSemanticArtifactV1,
  type MtaWikiTreatmentSemanticDispositionV1,
  type MtaWikiTreatmentVocabularyScopeV1,
  type NormalizedRouteTreatmentFact,
  type NormalizedRouteTreatmentOccurrenceFact,
  normalizedRouteTreatmentFactsFromPublishableInterventions,
  normalizedRouteTreatmentOccurrenceFact,
  normalizeRouteTreatmentStatus,
  REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1,
  type ReviewedOpenTreatmentDispositionV1,
  type RouteTreatmentInterventionEventRow,
  reviewedOpenTreatmentDisposition,
  stableTreatmentId,
  type TreatmentCrosswalkDisposition,
} from "@bp/analytics/interventions";
import {
  MtaWikiOperationalOccurrenceImportArtifactV5Schema,
  type OperationalOccurrenceEvidenceBindingV2,
  type OperationalOccurrenceRowV2,
} from "@bp/domain/documents/operational-occurrence";
import {
  assertInjectiveStudioRouteIdentityUniverse,
  interventionFacetIndexKey,
  routeIdToStudioSlug,
  routeInterventionInventoryBundleKey,
  routeInterventionInventoryIndexKey,
  routeInterventionInventoryReconciliationKey,
  type StudioInterventionCorpus,
  StudioInterventionCorpusSchema,
  type StudioInterventionFacetIndex,
  type StudioInterventionFacetIndexRow,
  StudioInterventionFacetIndexSchema,
  type StudioInterventionLifecycleState,
  type StudioInterventionTreatmentFamily,
  type StudioInterventionTreatmentKind,
  type StudioReleasePayload,
  StudioReleasePayloadSchema,
  type StudioRouteEvidenceBundleV2,
  StudioRouteEvidenceBundleV2Schema,
  type StudioRouteEvidenceIndexV2,
  StudioRouteEvidenceIndexV2Schema,
  type StudioRouteIdentityPresentation,
  type StudioRouteInterventionCurrentState,
  type StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionInventoryBundleSchema,
  type StudioRouteInterventionInventoryIndex,
  type StudioRouteInterventionInventoryIndexRoute,
  StudioRouteInterventionInventoryIndexSchema,
  type StudioRouteInterventionInventoryReconciliation,
  StudioRouteInterventionInventoryReconciliationSchema,
  type StudioRouteInterventionOccurrence,
  StudioRouteInterventionOccurrenceSchema,
  type StudioRouteInterventionProjectionFailure,
  type StudioRouteInterventionProjectRef,
  type StudioRouteInterventionSourceGap,
  type StudioRouteInterventionSourceState,
  type StudioRouteInterventionTreatment,
  studioRouteEvidenceBundleKey,
} from "@bp/domain/studio";
import { Schema } from "effect";
import { decodeSchemaStrict } from "./schema-decode.ts";

export const ROUTE_INTERVENTION_INVENTORY_BYTE_BUDGETS = {
  routeBundle: 128 * 1024,
  routeIndex: 320 * 1024,
  facetIndex: 2 * 1024 * 1024,
} as const;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));

const MtaWikiTreatmentSemanticArtifactV1Schema = Schema.Struct({
  schema_version: Schema.Literal(1),
  dispositions: Schema.Array(
    Schema.Union([
      Schema.Struct({
        disposition: Schema.Literal("atomic"),
        raw_treatment_kind: NonEmptyStringSchema,
        record_ids: Schema.Array(NonEmptyStringSchema),
        canonical_kind: NonEmptyStringSchema,
        family: NonEmptyStringSchema,
      }),
      Schema.Struct({
        disposition: Schema.Literal("bundle"),
        raw_treatment_kind: NonEmptyStringSchema,
        record_ids: Schema.Array(NonEmptyStringSchema),
        bundle_family: Schema.NullOr(NonEmptyStringSchema),
        members: Schema.Array(
          Schema.Struct({
            raw_treatment_kind: NonEmptyStringSchema,
            canonical_kind: NonEmptyStringSchema,
            family: NonEmptyStringSchema,
          }),
        ),
      }),
      Schema.Struct({
        disposition: Schema.Literal("unresolved"),
        raw_treatment_kind: NonEmptyStringSchema,
        record_ids: Schema.Array(NonEmptyStringSchema),
        review_reason: NonEmptyStringSchema,
      }),
    ]),
  ),
});

const MtaWikiScopeEvidenceBindingSchema = Schema.Struct({
  evidence_id: NonEmptyStringSchema,
  record_id: NonEmptyStringSchema,
  role: NonEmptyStringSchema,
  source_id: NonEmptyStringSchema,
});

const MtaWikiRouteTreatmentScopeV1Schema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("route-treatment-scope-v1"),
  scope_id: NonEmptyStringSchema,
  route_record_id: NonEmptyStringSchema,
  route_identity: Schema.Struct({
    dataset_id: Schema.Literals(["mta-nyct-bus", "mta-bus-company"]),
    gtfs_route_id: NonEmptyStringSchema,
    source_route_id: NonEmptyStringSchema,
  }),
  treatment_record_id: NonEmptyStringSchema,
  raw_treatment_kind: NonEmptyStringSchema,
  normalized_treatment_family: NonEmptyStringSchema,
  authorization: Schema.Struct({
    kinds: Schema.Array(Schema.Literals(["direct_relation", "operational_occurrence"])),
    occurrence_ids: Schema.Array(NonEmptyStringSchema),
    relation_record_ids: Schema.Array(NonEmptyStringSchema),
  }),
  source_ids: Schema.Array(NonEmptyStringSchema),
  evidence_bindings: Schema.Array(MtaWikiScopeEvidenceBindingSchema),
});

const MtaWikiRouteTreatmentScopeReconciliationV1Schema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("route-treatment-scope-v1"),
  treatment_record_id: NonEmptyStringSchema,
  raw_treatment_kind: NonEmptyStringSchema,
  reconciliation_state: Schema.Literal("documented_unresolved"),
  reason_code: NonEmptyStringSchema,
  route_record_ids: Schema.Array(NonEmptyStringSchema),
  relation_record_ids: Schema.Array(NonEmptyStringSchema),
  project_context_relation_ids: Schema.Array(NonEmptyStringSchema),
  source_ids: Schema.Array(NonEmptyStringSchema),
  evidence_ids: Schema.Array(NonEmptyStringSchema),
});
const MtaWikiTreatmentVocabularyScopeV1Schema = Schema.Struct({
  rawValue: NonEmptyStringSchema,
  recordId: NonEmptyStringSchema,
});

type MtaWikiRouteTreatmentScopeV1 = typeof MtaWikiRouteTreatmentScopeV1Schema.Type;
type MtaWikiRouteTreatmentScopeReconciliationV1 =
  typeof MtaWikiRouteTreatmentScopeReconciliationV1Schema.Type;

export type RouteEvidenceBundleBytesInput = {
  readonly artifactKey: string;
  readonly bytes: Uint8Array | string;
};

export type RouteInterventionInventoryLocalRegistryInput = {
  readonly availability: "available" | "partial";
  readonly checkedCoverage?: StudioReleasePayload["coverage"];
  readonly rows: readonly RouteTreatmentInterventionEventRow[];
};

export type BuildRouteInterventionInventoryInput = {
  readonly release: unknown;
  readonly interventionCorpus: unknown;
  readonly routeEvidenceIndex: unknown;
  readonly routeEvidenceBundles: readonly RouteEvidenceBundleBytesInput[];
  readonly wikiOccurrences: unknown;
  readonly wikiTreatmentCompanions: {
    readonly releaseId: string;
    readonly manifestSha256: string;
    readonly treatmentSemantics: unknown;
    readonly treatmentVocabularyScopes: unknown;
    readonly routeTreatmentScopes: unknown;
    readonly routeTreatmentScopeReconciliation: unknown;
  };
  readonly localRegistry?: RouteInterventionInventoryLocalRegistryInput;
  readonly reviewedOpenDispositions?: readonly ReviewedOpenTreatmentDispositionV1[];
};

export type RouteInterventionInventoryArtifactBytes = {
  readonly key: string;
  readonly bytes: Uint8Array;
};

export type BuiltRouteInterventionInventoryBundle = RouteInterventionInventoryArtifactBytes & {
  readonly value: StudioRouteInterventionInventoryBundle;
  readonly sha256: string;
  readonly byteSize: number;
};

export type BuiltRouteInterventionInventory = {
  readonly bundles: readonly BuiltRouteInterventionInventoryBundle[];
  readonly routeIndex: StudioRouteInterventionInventoryIndex;
  readonly routeIndexBytes: Uint8Array;
  readonly facetIndex: StudioInterventionFacetIndex;
  readonly facetIndexBytes: Uint8Array;
  readonly reconciliation: StudioRouteInterventionInventoryReconciliation;
  readonly reconciliationBytes: Uint8Array;
};

type ComponentDispositionClaim = {
  readonly id: string;
  readonly disposition: TreatmentCrosswalkDisposition | { readonly disposition: "mapped" };
};

type MutableTreatment = StudioRouteInterventionTreatment & { occurrenceIds: string[] };

type RouteAccumulator = {
  readonly route: StudioRouteIdentityPresentation;
  readonly evidence: StudioRouteEvidenceBundleV2;
  readonly treatments: MutableTreatment[];
  readonly occurrences: StudioRouteInterventionOccurrence[];
  readonly projectRefs: StudioRouteInterventionProjectRef[];
  readonly sourceGaps: StudioRouteInterventionSourceGap[];
  readonly corpusRecordIds: Set<string>;
  readonly wikiOccurrenceIds: Set<string>;
  readonly localRegistryEventIds: Set<string>;
};

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

export function canonicalRouteInterventionInventoryBytes(value: unknown): Uint8Array {
  return textEncoder.encode(`${canonicalJson(value)}\n`);
}

function bytesFromInput(value: Uint8Array | string): Uint8Array {
  return typeof value === "string" ? textEncoder.encode(value) : value;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function strictJson<S>(schema: S, bytes: Uint8Array): unknown {
  const parsed = JSON.parse(textDecoder.decode(bytes)) as unknown;
  return decodeSchemaStrict(schema as never, parsed);
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function dispositionForOpenOrClosed(
  rawValue: string,
  reviewed: readonly ReviewedOpenTreatmentDispositionV1[],
): TreatmentCrosswalkDisposition {
  if (Object.hasOwn(DOCUMENT_TREATMENT_DISPOSITIONS, rawValue)) {
    return DOCUMENT_TREATMENT_DISPOSITIONS[
      rawValue as keyof typeof DOCUMENT_TREATMENT_DISPOSITIONS
    ];
  }
  if (Object.hasOwn(LEGACY_ROUTE_TREATMENT_DISPOSITIONS, rawValue)) {
    return LEGACY_ROUTE_TREATMENT_DISPOSITIONS[
      rawValue as keyof typeof LEGACY_ROUTE_TREATMENT_DISPOSITIONS
    ];
  }
  return reviewedOpenTreatmentDisposition(rawValue, reviewed);
}

function treatmentMembers(row: OperationalOccurrenceRowV2) {
  return row.treatment.kind === "atomic" ? [row.treatment.member] : row.treatment.members;
}

function evidenceBindingRefs(
  bindings: readonly OperationalOccurrenceEvidenceBindingV2[],
): string[] {
  return uniqueSorted(
    bindings.flatMap((binding) => [
      `evidence:${binding.evidence_id}`,
      `record:${binding.record_id}`,
      `source:${binding.source_id}`,
    ]),
  );
}

function assertAllowedLifecycle(
  value: ReturnType<typeof normalizeRouteTreatmentStatus>,
  label: string,
): StudioInterventionLifecycleState {
  switch (value) {
    case "current_confirmed":
    case "implemented":
    case "historical_confirmed":
    case "planned":
    case "proposed":
    case "under_consideration":
    case "candidate":
      return value;
    default:
      throw new Error(`${label} resolved to non-presentational lifecycle ${value}`);
  }
}

function sourceIdForCitationKeys(
  bundle: StudioRouteEvidenceBundleV2,
  citationKeys: readonly string[],
): string {
  const wanted = new Set(citationKeys);
  return (
    bundle.citations
      .filter((citation) => wanted.has(citation.key))
      .map((citation) => citation.sourceId)
      .sort(compareText)[0] ?? bundle.source.wikiRelease
  );
}

function sourceRefsForCitationKeys(
  bundle: StudioRouteEvidenceBundleV2,
  citationKeys: readonly string[],
): string[] {
  const wanted = new Set(citationKeys);
  return uniqueSorted([
    ...citationKeys.map((key) => `citation:${key}`),
    ...bundle.citations
      .filter((citation) => wanted.has(citation.key))
      .map((citation) => `source:${citation.sourceId}`),
  ]);
}

function toPublicTreatment(fact: NormalizedRouteTreatmentFact, sourceId: string): MutableTreatment {
  return {
    treatmentId: fact.treatmentId,
    sourceNamespace: fact.sourceNamespace,
    sourceRecordId: fact.sourceRecordId,
    sourceId,
    componentCollection: fact.componentCollection,
    componentPosition: fact.componentPosition,
    rawKind: fact.rawKind,
    rawLabel: fact.rawLabel,
    treatmentKind: fact.treatmentKind,
    treatmentFamily: fact.treatmentFamily,
    lifecycleState: assertAllowedLifecycle(fact.lifecycleState, `Treatment ${fact.treatmentId}`),
    statusAsOf: fact.statusAsOf,
    effectiveDate: fact.effectiveDate,
    datePrecision: fact.datePrecision,
    geographyScope: fact.geographyScope,
    sourceRefs: uniqueSorted(fact.sourceRefs),
    occurrenceIds: uniqueSorted(fact.occurrenceIds),
    projectIds: uniqueSorted(fact.projectIds),
  };
}

function releaseIdentity(release: StudioReleasePayload) {
  return {
    releaseId: release.releaseId,
    publishedAt: release.publishedAt,
    coverage: release.coverage,
  } as const;
}

function validateEvidenceCoverage(bundle: StudioRouteEvidenceBundleV2): void {
  const expected = {
    timelineCount: bundle.timeline.length,
    interventionCount: bundle.interventions.length,
    metricClaimCount: bundle.metricClaims.length,
    projectCount: bundle.projects.length,
    sourceGapCount: bundle.sourceGaps.length,
    citationCount: bundle.citations.length,
  };
  if (!sameCanonical(bundle.coverage, expected)) {
    throw new Error(`Route evidence coverage counts disagree for ${bundle.routeId}`);
  }
}

function decodeRequiredInputs(input: BuildRouteInterventionInventoryInput): {
  readonly release: StudioReleasePayload;
  readonly corpus: StudioInterventionCorpus;
  readonly evidenceIndex: StudioRouteEvidenceIndexV2;
  readonly evidenceByRoute: ReadonlyMap<string, StudioRouteEvidenceBundleV2>;
  readonly occurrences: typeof MtaWikiOperationalOccurrenceImportArtifactV5Schema.Type;
  readonly treatmentSemantics: MtaWikiTreatmentSemanticArtifactV1;
  readonly treatmentVocabularyScopes: readonly MtaWikiTreatmentVocabularyScopeV1[];
  readonly routeTreatmentScopes: readonly MtaWikiRouteTreatmentScopeV1[];
  readonly routeTreatmentScopeReconciliation: readonly MtaWikiRouteTreatmentScopeReconciliationV1[];
} {
  const release = decodeSchemaStrict(StudioReleasePayloadSchema, input.release);
  const corpus = decodeSchemaStrict(StudioInterventionCorpusSchema, input.interventionCorpus);
  const evidenceIndex = decodeSchemaStrict(
    StudioRouteEvidenceIndexV2Schema,
    input.routeEvidenceIndex,
  );
  const occurrences = decodeSchemaStrict(
    MtaWikiOperationalOccurrenceImportArtifactV5Schema,
    input.wikiOccurrences,
  );
  const companionRelease = decodeSchemaStrict(
    Schema.Struct({ releaseId: NonEmptyStringSchema, manifestSha256: Sha256Schema }),
    {
      releaseId: input.wikiTreatmentCompanions.releaseId,
      manifestSha256: input.wikiTreatmentCompanions.manifestSha256,
    },
  );
  const treatmentSemantics = decodeSchemaStrict(
    MtaWikiTreatmentSemanticArtifactV1Schema,
    input.wikiTreatmentCompanions.treatmentSemantics,
  );
  const treatmentVocabularyScopes = decodeSchemaStrict(
    Schema.Array(MtaWikiTreatmentVocabularyScopeV1Schema),
    input.wikiTreatmentCompanions.treatmentVocabularyScopes,
  );
  const routeTreatmentScopes = decodeSchemaStrict(
    Schema.Array(MtaWikiRouteTreatmentScopeV1Schema),
    input.wikiTreatmentCompanions.routeTreatmentScopes,
  );
  const routeTreatmentScopeReconciliation = decodeSchemaStrict(
    Schema.Array(MtaWikiRouteTreatmentScopeReconciliationV1Schema),
    input.wikiTreatmentCompanions.routeTreatmentScopeReconciliation,
  );

  if (evidenceIndex.source.wikiRelease !== occurrences.sourceRelease.releaseId) {
    throw new Error("Route evidence and Wiki occurrences use different named releases");
  }
  if (evidenceIndex.source.manifestSha256 !== occurrences.sourceRelease.manifestSha256) {
    throw new Error("Route evidence and Wiki occurrences use different manifest SHA-256 values");
  }
  if (
    companionRelease.releaseId !== evidenceIndex.source.wikiRelease ||
    companionRelease.manifestSha256 !== evidenceIndex.source.manifestSha256
  ) {
    throw new Error("MTA Wiki treatment companions do not match the route-evidence release");
  }
  if (evidenceIndex.summary.routeCount !== evidenceIndex.routes.length) {
    throw new Error("Route evidence index route count disagrees with its rows");
  }

  assertInjectiveStudioRouteIdentityUniverse(
    evidenceIndex.routes.map((row) => ({
      routeId: row.routeIdentity.routeId,
      slug: row.routeSlug,
    })),
    "Route intervention inventory evidence universe",
  );

  const bytesByKey = new Map<string, Uint8Array>();
  for (const candidate of input.routeEvidenceBundles) {
    if (bytesByKey.has(candidate.artifactKey)) {
      throw new Error(`Duplicate route evidence bundle input ${candidate.artifactKey}`);
    }
    bytesByKey.set(candidate.artifactKey, bytesFromInput(candidate.bytes));
  }

  const evidenceByRoute = new Map<string, StudioRouteEvidenceBundleV2>();
  for (const row of [...evidenceIndex.routes].sort((left, right) =>
    compareText(left.routeId, right.routeId),
  )) {
    const expectedKey = studioRouteEvidenceBundleKey(row.routeSlug);
    if (row.artifactKey !== expectedKey) {
      throw new Error(`Route evidence index key mismatch for ${row.routeId}`);
    }
    const bytes = bytesByKey.get(row.artifactKey);
    if (bytes === undefined) {
      throw new Error(`Missing required route evidence bundle ${row.artifactKey}`);
    }
    if (bytes.byteLength !== row.byteLength || sha256(bytes) !== row.sha256) {
      throw new Error(`Route evidence bundle hash or byte-size mismatch for ${row.routeId}`);
    }
    const bundle = strictJson(
      StudioRouteEvidenceBundleV2Schema,
      bytes,
    ) as StudioRouteEvidenceBundleV2;
    validateEvidenceCoverage(bundle);
    if (
      bundle.routeId !== row.routeId ||
      bundle.routeSlug !== row.routeSlug ||
      !sameCanonical(bundle.routeIdentity, row.routeIdentity) ||
      !sameCanonical(bundle.source, evidenceIndex.source)
    ) {
      throw new Error(`Route evidence bundle identity mismatch for ${row.routeId}`);
    }
    evidenceByRoute.set(row.routeId, bundle);
  }
  if (bytesByKey.size !== evidenceIndex.routes.length) {
    const extras = [...bytesByKey.keys()].filter(
      (key) => !evidenceIndex.routes.some((row) => row.artifactKey === key),
    );
    if (extras.length > 0) {
      throw new Error(
        `Unreferenced route evidence bundle inputs: ${extras.sort(compareText).join(", ")}`,
      );
    }
  }

  const routeIds = new Set(evidenceIndex.routes.map((row) => row.routeId));
  for (const occurrence of occurrences.occurrences) {
    for (const route of occurrence.routes) {
      if (!routeIds.has(route.gtfs_route_id)) {
        throw new Error(
          `Wiki occurrence ${occurrence.occurrence_id} projects unresolved exact route ${route.gtfs_route_id}`,
        );
      }
    }
  }
  return {
    release,
    corpus,
    evidenceIndex,
    evidenceByRoute,
    occurrences,
    treatmentSemantics,
    treatmentVocabularyScopes,
    routeTreatmentScopes,
    routeTreatmentScopeReconciliation,
  };
}

function reviewedVocabulary(input: {
  readonly corpus: StudioInterventionCorpus;
  readonly localRows: readonly RouteTreatmentInterventionEventRow[];
  readonly table: readonly ReviewedOpenTreatmentDispositionV1[];
}) {
  const localValues = input.localRows
    .map((row) => row.intervention_type)
    .filter((rawValue) => rawValue.length > 0);
  return assertReviewedOpenTreatmentVocabularyExact(
    {
      reviewedCorpusCustomTreatments: input.corpus.records.flatMap(
        (record) => record.customTreatments,
      ),
      localRegistryRawInterventionTypes: localValues,
    },
    input.table,
  );
}

function addDispositionClaim(
  claims: Map<string, ComponentDispositionClaim>,
  claim: ComponentDispositionClaim,
): void {
  const previous = claims.get(claim.id);
  if (previous !== undefined && !sameCanonical(previous.disposition, claim.disposition)) {
    throw new Error(`Conflicting treatment dispositions for ${claim.id}`);
  }
  claims.set(claim.id, claim);
}

function addTreatment(accumulator: RouteAccumulator, treatment: MutableTreatment): void {
  const previous = accumulator.treatments.find(
    (candidate) => candidate.treatmentId === treatment.treatmentId,
  );
  if (previous !== undefined) {
    if (!sameCanonical(previous, treatment)) {
      throw new Error(
        `Treatment ${treatment.treatmentId} has conflicting facts on route ${accumulator.route.routeId}`,
      );
    }
    return;
  }
  accumulator.treatments.push(treatment);
}

function addOccurrence(
  accumulator: RouteAccumulator,
  occurrence: StudioRouteInterventionOccurrence,
) {
  const previous = accumulator.occurrences.find(
    (candidate) => candidate.occurrenceId === occurrence.occurrenceId,
  );
  if (previous !== undefined) {
    if (!sameCanonical(previous, occurrence)) {
      throw new Error(
        `Occurrence ${occurrence.occurrenceId} has conflicting facts on route ${accumulator.route.routeId}`,
      );
    }
    return;
  }
  accumulator.occurrences.push(occurrence);
}

function makeAccumulators(
  index: StudioRouteEvidenceIndexV2,
  evidenceByRoute: ReadonlyMap<string, StudioRouteEvidenceBundleV2>,
): Map<string, RouteAccumulator> {
  return new Map(
    [...index.routes]
      .sort((left, right) => compareText(left.routeId, right.routeId))
      .map((row) => {
        const evidence = evidenceByRoute.get(row.routeId);
        if (evidence === undefined) throw new Error(`Missing route evidence for ${row.routeId}`);
        return [
          row.routeId,
          {
            route: row.routeIdentity,
            evidence,
            treatments: [],
            occurrences: [],
            projectRefs: [],
            sourceGaps: [],
            corpusRecordIds: new Set<string>(),
            wikiOccurrenceIds: new Set<string>(),
            localRegistryEventIds: new Set<string>(),
          },
        ];
      }),
  );
}

function addCorpusTreatments(input: {
  readonly release: StudioReleasePayload;
  readonly corpus: StudioInterventionCorpus;
  readonly accumulators: Map<string, RouteAccumulator>;
  readonly reviewed: readonly ReviewedOpenTreatmentDispositionV1[];
  readonly claims: Map<string, ComponentDispositionClaim>;
  readonly projectionFailures: StudioRouteInterventionProjectionFailure[];
}): void {
  const recordsById = new Map(input.corpus.records.map((record) => [record.recordId, record]));
  const normalized = normalizedRouteTreatmentFactsFromPublishableInterventions({
    rows: input.corpus.records.map((record) => ({
      recordId: record.recordId,
      sourceId: record.sourceId,
      status: record.recordKind,
      routes: record.routes,
      primaryTreatments: record.primaryTreatments,
      customTreatments: record.customTreatments,
      effectiveDate: record.effectiveDate,
      datePrecision: record.datePrecision,
      matchedRegistryEventIds: record.matchedRegistryEventIds,
    })),
    routes: [...input.accumulators.values()].map((accumulator) => accumulator.route),
    statusAsOf: input.release.publishedAt,
    reviewedOpenDispositions: input.reviewed,
  });
  for (const reconciliation of normalized.componentReconciliation) {
    addDispositionClaim(input.claims, {
      id: reconciliation.treatmentId,
      disposition: reconciliation.disposition,
    });
  }
  input.projectionFailures.push(
    ...normalized.routeReconciliation.map((row) => ({
      sourceNamespace: row.sourceNamespace,
      sourceRecordId: row.sourceVocabulary,
      rawRouteId: row.rawRouteId.length === 0 ? null : row.rawRouteId,
      reason: row.reason,
    })),
  );
  for (const fact of normalized.facts) {
    const accumulator = input.accumulators.get(fact.routeId);
    if (accumulator === undefined) continue;
    const record = recordsById.get(fact.sourceRecordId);
    if (record === undefined) throw new Error(`Missing corpus record ${fact.sourceRecordId}`);
    accumulator.corpusRecordIds.add(record.recordId);
    addTreatment(accumulator, toPublicTreatment(fact, record.sourceId));
  }
}

function companionSemantics(input: {
  readonly treatmentSemantics: MtaWikiTreatmentSemanticArtifactV1;
  readonly vocabularyScopes: readonly MtaWikiTreatmentVocabularyScopeV1[];
  readonly routeScopes: readonly MtaWikiRouteTreatmentScopeV1[];
  readonly unscopedRows: readonly MtaWikiRouteTreatmentScopeReconciliationV1[];
}) {
  const reconciliation = assertMtaWikiTreatmentSemanticsReconciledV1({
    vocabularyScopes: input.vocabularyScopes,
    artifact: input.treatmentSemantics,
  });
  const contract = adaptMtaWikiTreatmentSemanticContractV1(input.treatmentSemantics);
  const vocabularyByRecord = new Map(
    input.vocabularyScopes.map((scope) => [scope.recordId, scope.rawValue]),
  );
  if (vocabularyByRecord.size !== input.vocabularyScopes.length) {
    throw new Error("MTA Wiki treatment vocabulary must contain one exact scope per record");
  }
  const routedRecordIds = new Set<string>();
  const scopeIds = new Set<string>();
  for (const scope of input.routeScopes) {
    if (scopeIds.has(scope.scope_id))
      throw new Error(`Duplicate route treatment scope ${scope.scope_id}`);
    scopeIds.add(scope.scope_id);
    const rawValue = vocabularyByRecord.get(scope.treatment_record_id);
    if (rawValue !== scope.raw_treatment_kind) {
      throw new Error(
        `Route treatment scope ${scope.scope_id} disagrees with the treatment vocabulary`,
      );
    }
    routedRecordIds.add(scope.treatment_record_id);
  }
  const unscopedRecordIds = new Set<string>();
  for (const row of input.unscopedRows) {
    if (unscopedRecordIds.has(row.treatment_record_id)) {
      throw new Error(`Duplicate unscoped treatment reconciliation ${row.treatment_record_id}`);
    }
    const rawValue = vocabularyByRecord.get(row.treatment_record_id);
    if (rawValue !== row.raw_treatment_kind) {
      throw new Error(
        `Unscoped treatment ${row.treatment_record_id} disagrees with the treatment vocabulary`,
      );
    }
    unscopedRecordIds.add(row.treatment_record_id);
  }
  const partition = new Set([...routedRecordIds, ...unscopedRecordIds]);
  if (
    partition.size !== vocabularyByRecord.size ||
    [...vocabularyByRecord.keys()].some((recordId) => !partition.has(recordId))
  ) {
    throw new Error("Route scopes and explicit reconciliation rows do not cover treatment records");
  }
  const dispositionByRecord = new Map<string, MtaWikiTreatmentSemanticDispositionV1>();
  for (const disposition of contract.dispositions) {
    for (const recordId of disposition.recordIds) dispositionByRecord.set(recordId, disposition);
  }
  return { reconciliation, dispositionByRecord };
}

function semanticTreatmentSpecs(disposition: MtaWikiTreatmentSemanticDispositionV1) {
  if (disposition.disposition === "atomic") {
    return [
      {
        rawKind: disposition.rawValue,
        treatmentKind: disposition.mapping.treatmentKind as StudioInterventionTreatmentKind,
        treatmentFamily: disposition.mapping.treatmentFamily as StudioInterventionTreatmentFamily,
      },
    ];
  }
  if (disposition.disposition === "bundle") {
    return disposition.members.map((member) => ({
      rawKind: member.rawValue,
      treatmentKind: member.canonicalKind as StudioInterventionTreatmentKind,
      treatmentFamily: member.family as StudioInterventionTreatmentFamily,
    }));
  }
  return [];
}

function scopeSourceRefs(scope: MtaWikiRouteTreatmentScopeV1): string[] {
  return uniqueSorted([
    `route_treatment_scope:${scope.scope_id}`,
    ...scope.source_ids.map((sourceId) => `source:${sourceId}`),
    ...scope.evidence_bindings.flatMap((binding) => [
      `evidence:${binding.evidence_id}`,
      `record:${binding.record_id}`,
      `source:${binding.source_id}`,
    ]),
  ]);
}

function addMtaWikiScopeFacts(input: {
  readonly release: StudioReleasePayload;
  readonly accumulators: Map<string, RouteAccumulator>;
  readonly occurrences: typeof MtaWikiOperationalOccurrenceImportArtifactV5Schema.Type;
  readonly routeScopes: readonly MtaWikiRouteTreatmentScopeV1[];
  readonly unscopedRows: readonly MtaWikiRouteTreatmentScopeReconciliationV1[];
  readonly dispositionByRecord: ReadonlyMap<string, MtaWikiTreatmentSemanticDispositionV1>;
  readonly claims: Map<string, ComponentDispositionClaim>;
  readonly projectionFailures: StudioRouteInterventionProjectionFailure[];
}): void {
  const occurrencesById = new Map(
    input.occurrences.occurrences.map((occurrence) => [occurrence.occurrence_id, occurrence]),
  );
  for (const scope of [...input.routeScopes].sort(
    (left, right) =>
      compareText(left.route_identity.source_route_id, right.route_identity.source_route_id) ||
      compareText(left.treatment_record_id, right.treatment_record_id) ||
      compareText(left.scope_id, right.scope_id),
  )) {
    if (scope.route_identity.gtfs_route_id !== scope.route_identity.source_route_id) {
      throw new Error(
        `Route treatment scope ${scope.scope_id} does not preserve exact route identity`,
      );
    }
    const accumulator = input.accumulators.get(scope.route_identity.source_route_id);
    if (accumulator === undefined) {
      throw new Error(`Route treatment scope ${scope.scope_id} has an unresolved exact route`);
    }
    const disposition = input.dispositionByRecord.get(scope.treatment_record_id);
    if (disposition === undefined || disposition.rawValue !== scope.raw_treatment_kind) {
      throw new Error(
        `Route treatment scope ${scope.scope_id} has no reconciled semantic disposition`,
      );
    }
    if (disposition.disposition === "unresolved") {
      const id = stableTreatmentId({
        sourceNamespace: "mta_wiki_treatment_semantics",
        sourceRecordId: scope.treatment_record_id,
        componentCollection: "wiki",
        componentPosition: 0,
        rawKind: scope.raw_treatment_kind,
      });
      addDispositionClaim(input.claims, {
        id,
        disposition: {
          disposition: "unmapped_review_required",
          rawValue: scope.raw_treatment_kind,
          reason: "unreviewed_open_value",
        },
      });
      const sourceKind = scope.authorization.kinds.includes("operational_occurrence")
        ? "operational_occurrences"
        : "route_evidence";
      accumulator.sourceGaps.push({
        gapId: `semantic:${scope.scope_id}`,
        sourceKind,
        sourceId: scope.source_ids.toSorted()[0] ?? input.occurrences.sourceRelease.releaseId,
        treatmentKind: null,
        gapKind: "unresolved_treatment_semantics",
        sourceRefs: uniqueSorted([
          ...scopeSourceRefs(scope),
          `review_reason:${disposition.reviewReason}`,
        ]),
        projectIds: [],
      });
      input.projectionFailures.push({
        sourceNamespace: "mta_wiki_treatment_semantics",
        sourceRecordId: scope.treatment_record_id,
        rawRouteId: scope.route_identity.source_route_id,
        reason: "unresolved_treatment_semantics",
      });
      continue;
    }
    const evidenceRows = accumulator.evidence.interventions.filter(
      (intervention) => intervention.recordId === scope.treatment_record_id,
    );
    const projectIds = uniqueSorted(evidenceRows.flatMap((row) => row.projectRecordIds));
    const evidenceRefs = uniqueSorted(
      evidenceRows.flatMap((row) =>
        sourceRefsForCitationKeys(accumulator.evidence, row.citationKeys),
      ),
    );
    const onsetCandidates = scope.authorization.occurrence_ids
      .map((occurrenceId) => occurrencesById.get(occurrenceId))
      .filter((row): row is OperationalOccurrenceRowV2 => row !== undefined)
      .sort((left, right) => compareText(right.resolved_onset.date, left.resolved_onset.date));
    if (onsetCandidates.length !== scope.authorization.occurrence_ids.length) {
      throw new Error(`Route treatment scope ${scope.scope_id} references a missing occurrence`);
    }
    for (const [componentPosition, spec] of semanticTreatmentSpecs(disposition).entries()) {
      const treatmentId = stableTreatmentId({
        sourceNamespace: "mta_wiki_treatment_semantics",
        sourceRecordId: scope.treatment_record_id,
        componentCollection: "wiki",
        componentPosition,
        rawKind: spec.rawKind,
      });
      addDispositionClaim(input.claims, {
        id: treatmentId,
        disposition: { disposition: "mapped" },
      });
      addTreatment(accumulator, {
        treatmentId,
        sourceNamespace: "mta_wiki_treatment_semantics",
        sourceRecordId: scope.treatment_record_id,
        sourceId: scope.source_ids.toSorted()[0] ?? input.occurrences.sourceRelease.releaseId,
        componentCollection: "wiki",
        componentPosition,
        rawKind: spec.rawKind,
        rawLabel: scope.raw_treatment_kind,
        treatmentKind: spec.treatmentKind,
        treatmentFamily: spec.treatmentFamily,
        lifecycleState: onsetCandidates.length > 0 ? "implemented" : "candidate",
        statusAsOf: input.release.publishedAt,
        effectiveDate: onsetCandidates[0]?.resolved_onset.date ?? null,
        datePrecision: onsetCandidates[0]?.resolved_onset.precision ?? "unknown",
        geographyScope: "route",
        sourceRefs: uniqueSorted([...scopeSourceRefs(scope), ...evidenceRefs]),
        occurrenceIds: [],
        projectIds,
      });
    }
  }
  for (const row of input.unscopedRows) {
    const disposition = input.dispositionByRecord.get(row.treatment_record_id);
    if (disposition === undefined || disposition.rawValue !== row.raw_treatment_kind) {
      throw new Error(`Unscoped treatment ${row.treatment_record_id} has no semantic disposition`);
    }
    const specs = semanticTreatmentSpecs(disposition);
    const rawKinds =
      specs.length > 0 ? specs.map((spec) => spec.rawKind) : [row.raw_treatment_kind];
    for (const [componentPosition, rawKind] of rawKinds.entries()) {
      const id = stableTreatmentId({
        sourceNamespace: "mta_wiki_treatment_semantics",
        sourceRecordId: row.treatment_record_id,
        componentCollection: "wiki",
        componentPosition,
        rawKind,
      });
      addDispositionClaim(input.claims, {
        id,
        disposition:
          disposition.disposition === "unresolved"
            ? {
                disposition: "unmapped_review_required",
                rawValue: row.raw_treatment_kind,
                reason: "unreviewed_open_value",
              }
            : { disposition: "mapped" },
      });
    }
    input.projectionFailures.push({
      sourceNamespace: "mta_wiki_route_treatment_scope",
      sourceRecordId: row.treatment_record_id,
      rawRouteId: null,
      reason: row.reason_code,
    });
  }
  for (const accumulator of input.accumulators.values()) {
    accumulator.sourceGaps.push(
      ...accumulator.evidence.sourceGaps.map((gap) => ({
        gapId: gap.recordId,
        sourceKind: "route_evidence" as const,
        sourceId: sourceIdForCitationKeys(accumulator.evidence, gap.citationKeys),
        treatmentKind: null,
        gapKind: gap.gapKind ?? gap.recordKind,
        sourceRefs: sourceRefsForCitationKeys(accumulator.evidence, gap.citationKeys),
        projectIds: [],
      })),
    );
  }
}

function occurrencePhaseKey(row: OperationalOccurrenceRowV2): string {
  if (row.phase_relation_disposition === "single_phase" && row.phase_record_ids.length === 1) {
    return row.phase_record_ids[0] as string;
  }
  return row.phase_relation_disposition;
}

function wikiOccurrenceSourceRefs(row: OperationalOccurrenceRowV2): string[] {
  return uniqueSorted([
    `wiki_occurrence:${row.occurrence_id}`,
    ...row.source_ids.map((sourceId) => `source:${sourceId}`),
    ...evidenceBindingRefs(row.evidence_bindings),
    ...evidenceBindingRefs(row.phase_relation_evidence_bindings),
    ...evidenceBindingRefs(row.physical_scope_evidence_bindings),
    ...row.phase_record_ids.map((id) => `phase:${id}`),
    ...row.physical_scope_record_ids.map((id) => `physical_scope:${id}`),
  ]);
}

function addWikiOccurrences(input: {
  readonly occurrences: typeof MtaWikiOperationalOccurrenceImportArtifactV5Schema.Type;
  readonly accumulators: Map<string, RouteAccumulator>;
  readonly routeScopes: readonly MtaWikiRouteTreatmentScopeV1[];
}): void {
  for (const row of [...input.occurrences.occurrences].sort((left, right) =>
    compareText(left.occurrence_id, right.occurrence_id),
  )) {
    const members = [...treatmentMembers(row)].sort((left, right) =>
      compareText(left.treatment_record_id, right.treatment_record_id),
    );
    for (const route of [...row.routes].sort((left, right) =>
      compareText(left.gtfs_route_id, right.gtfs_route_id),
    )) {
      const accumulator = input.accumulators.get(route.gtfs_route_id);
      if (accumulator === undefined) {
        throw new Error(
          `Wiki occurrence ${row.occurrence_id} has unresolved route ${route.gtfs_route_id}`,
        );
      }
      accumulator.wikiOccurrenceIds.add(row.occurrence_id);
      for (const member of members) {
        const authorizedScope = input.routeScopes.find(
          (scope) =>
            scope.route_identity.source_route_id === route.gtfs_route_id &&
            scope.treatment_record_id === member.treatment_record_id &&
            scope.authorization.occurrence_ids.includes(row.occurrence_id),
        );
        if (authorizedScope === undefined) {
          throw new Error(
            `Wiki occurrence ${row.occurrence_id} treatment ${member.treatment_record_id} lacks an authorized route scope`,
          );
        }
        const treatments = accumulator.treatments.filter(
          (candidate) =>
            candidate.sourceNamespace === "mta_wiki_treatment_semantics" &&
            candidate.sourceRecordId === member.treatment_record_id,
        );
        // Reconciled producer-unresolved scopes have an explicit source gap,
        // but deliberately do not manufacture a treatment or occurrence.
        for (const treatment of treatments) {
          const normalized = normalizedRouteTreatmentOccurrenceFact({
            sourceNamespace: "mta_wiki_operational_occurrence",
            sourceOccurrenceId: row.occurrence_id,
            producerPhaseOrPosition: occurrencePhaseKey(row),
            routeId: route.gtfs_route_id,
            treatmentId: treatment.treatmentId,
            lifecycleState: "implemented",
            phase: row.phase_relation_disposition,
            rawStatus: row.resolved_status,
            effectiveDate: row.resolved_onset.date,
            datePrecision: row.resolved_onset.precision,
            geographyScope: "route",
            sourceRefs: uniqueSorted([
              ...wikiOccurrenceSourceRefs(row),
              ...evidenceBindingRefs(route.evidence_bindings),
              ...evidenceBindingRefs(member.evidence_bindings),
            ]),
            projectIds: treatment.projectIds,
            wikiOccurrenceId: row.occurrence_id,
          });
          const occurrence = toPublicOccurrence(normalized);
          treatment.occurrenceIds = uniqueSorted([
            ...treatment.occurrenceIds,
            occurrence.occurrenceId,
          ]);
          addOccurrence(accumulator, occurrence);
        }
      }
    }
  }
}

function toPublicOccurrence(
  fact: NormalizedRouteTreatmentOccurrenceFact,
): StudioRouteInterventionOccurrence {
  return decodeSchemaStrict(StudioRouteInterventionOccurrenceSchema, {
    occurrenceId: fact.occurrenceId,
    sourceNamespace: fact.sourceNamespace,
    sourceOccurrenceId: fact.sourceOccurrenceId,
    sourceId:
      fact.registryLineage?.sourceId ??
      fact.sourceRefs.find((ref) => ref.startsWith("source:"))?.slice("source:".length) ??
      fact.sourceNamespace,
    producerPhaseOrPosition: String(fact.producerPhaseOrPosition),
    routeId: fact.routeId,
    treatmentIds: uniqueSorted(fact.treatmentIds),
    lifecycleState: assertAllowedLifecycle(fact.lifecycleState, `Occurrence ${fact.occurrenceId}`),
    phase: fact.phase,
    rawStatus: fact.rawStatus,
    program: fact.program,
    effectiveDate: fact.effectiveDate,
    datePrecision: fact.datePrecision,
    geographyScope: fact.geographyScope,
    sourceRefs: uniqueSorted(fact.sourceRefs),
    projectIds: uniqueSorted(fact.projectIds),
    wikiOccurrenceId: fact.wikiOccurrenceId,
    registryLineage: fact.registryLineage,
  });
}

function addLocalRegistryFacts(input: {
  readonly local: RouteInterventionInventoryLocalRegistryInput | undefined;
  readonly corpus: StudioInterventionCorpus;
  readonly accumulators: Map<string, RouteAccumulator>;
  readonly reviewed: readonly ReviewedOpenTreatmentDispositionV1[];
  readonly claims: Map<string, ComponentDispositionClaim>;
  readonly projectionFailures: StudioRouteInterventionProjectionFailure[];
}): void {
  if (input.local === undefined) return;
  const corpusByEvent = new Map<string, string[]>();
  for (const record of input.corpus.records) {
    for (const eventId of record.matchedRegistryEventIds) {
      const ids = corpusByEvent.get(eventId) ?? [];
      ids.push(record.recordId);
      corpusByEvent.set(eventId, ids);
    }
  }
  for (const row of [...input.local.rows].sort(
    (left, right) =>
      compareText(left.route_id, right.route_id) || compareText(left.event_id, right.event_id),
  )) {
    const accumulator = input.accumulators.get(row.route_id);
    if (accumulator === undefined) {
      input.projectionFailures.push({
        sourceNamespace: "local_registry",
        sourceRecordId: row.event_id,
        rawRouteId: row.route_id,
        reason: "exact_route_not_found",
      });
      continue;
    }
    const treatmentId = stableTreatmentId({
      sourceNamespace: "local_registry",
      sourceRecordId: row.event_id,
      componentCollection: "registry",
      componentPosition: 0,
      rawKind: row.intervention_type,
    });
    const disposition = dispositionForOpenOrClosed(row.intervention_type, input.reviewed);
    addDispositionClaim(input.claims, { id: treatmentId, disposition });
    if (disposition.disposition === "unmapped_review_required") continue;
    const normalizedLifecycle = normalizeRouteTreatmentStatus(row.event_status);
    const sourceRefs = uniqueSorted([
      `local_intervention_event:${row.event_id}`,
      `source:${row.source_id}`,
    ]);
    if (normalizedLifecycle === "source_gap") {
      accumulator.sourceGaps.push({
        gapId: `local_registry:${row.event_id}`,
        sourceKind: "local_registry",
        sourceId: row.source_id,
        treatmentKind: disposition.treatmentKind,
        gapKind: "local_registry_source_gap",
        sourceRefs,
        projectIds: [],
      });
      accumulator.localRegistryEventIds.add(row.event_id);
      continue;
    }
    const lifecycleState = assertAllowedLifecycle(
      normalizedLifecycle,
      `Registry event ${row.event_id}`,
    );
    const treatment: MutableTreatment = {
      treatmentId,
      sourceNamespace: "local_registry",
      sourceRecordId: row.event_id,
      sourceId: row.source_id,
      componentCollection: "registry",
      componentPosition: 0,
      rawKind: row.intervention_type,
      rawLabel: row.intervention_type,
      treatmentKind: disposition.treatmentKind,
      treatmentFamily: disposition.treatmentFamily,
      lifecycleState,
      statusAsOf: null,
      effectiveDate: row.implementation_date,
      datePrecision: "day",
      geographyScope: "route",
      sourceRefs,
      occurrenceIds: [],
      projectIds: [],
    };
    addTreatment(accumulator, treatment);
    const relatedCorpusTreatmentIds = accumulator.treatments
      .filter(
        (candidate) =>
          candidate.sourceNamespace === "reviewed_intervention_corpus" &&
          (corpusByEvent.get(row.event_id) ?? []).includes(candidate.sourceRecordId) &&
          candidate.treatmentFamily === treatment.treatmentFamily,
      )
      .map((candidate) => candidate.treatmentId);
    const normalized = normalizedRouteTreatmentOccurrenceFact({
      sourceNamespace: "local_registry",
      sourceOccurrenceId: row.event_id,
      producerPhaseOrPosition: "0",
      routeId: row.route_id,
      treatmentId,
      lifecycleState,
      rawStatus: row.event_status,
      program: row.program,
      effectiveDate: row.implementation_date,
      datePrecision: "day",
      geographyScope: "route",
      sourceRefs: treatment.sourceRefs,
      registryLineage: {
        dataProductId: "local_intervention_events_release",
        eventId: row.event_id,
        rawRouteId: row.route_id,
        rawInterventionType: row.intervention_type,
        sourceId: row.source_id,
        rawStatus: row.event_status,
        program: row.program,
        implementationDate: row.implementation_date,
        implementationMonth: row.implementation_month,
      },
    });
    const occurrence = toPublicOccurrence({
      ...normalized,
      treatmentIds: uniqueSorted([treatmentId, ...relatedCorpusTreatmentIds]),
    });
    for (const relatedTreatmentId of occurrence.treatmentIds) {
      const related = accumulator.treatments.find(
        (candidate) => candidate.treatmentId === relatedTreatmentId,
      );
      if (related !== undefined) {
        related.occurrenceIds = uniqueSorted([...related.occurrenceIds, occurrence.occurrenceId]);
      }
    }
    addOccurrence(accumulator, occurrence);
    accumulator.localRegistryEventIds.add(row.event_id);
  }
}

function buildProjectRefs(accumulator: RouteAccumulator): StudioRouteInterventionProjectRef[] {
  const citationKeysByProject = new Map(
    accumulator.evidence.projects.map((project) => [
      project.recordId,
      uniqueSorted(project.citationKeys),
    ]),
  );
  const projectIds = uniqueSorted([
    ...citationKeysByProject.keys(),
    ...accumulator.treatments.flatMap((treatment) => treatment.projectIds),
    ...accumulator.occurrences.flatMap((occurrence) => occurrence.projectIds),
  ]);
  return projectIds.map((projectId) => ({
    projectId,
    treatmentIds: uniqueSorted(
      accumulator.treatments
        .filter((treatment) => treatment.projectIds.includes(projectId))
        .map((treatment) => treatment.treatmentId),
    ),
    occurrenceIds: uniqueSorted(
      accumulator.occurrences
        .filter((occurrence) => occurrence.projectIds.includes(projectId))
        .map((occurrence) => occurrence.occurrenceId),
    ),
    citationKeys: citationKeysByProject.get(projectId) ?? [],
  }));
}

function dateForCurrentState(input: {
  readonly state: {
    readonly treatmentIds: readonly string[];
    readonly occurrenceIds: readonly string[];
  };
  readonly treatments: readonly StudioRouteInterventionTreatment[];
  readonly occurrences: readonly StudioRouteInterventionOccurrence[];
}): Pick<StudioRouteInterventionCurrentState, "effectiveDate" | "datePrecision"> {
  const candidates = [
    ...input.treatments
      .filter((row) => input.state.treatmentIds.includes(row.treatmentId))
      .map((row) => ({ date: row.effectiveDate, precision: row.datePrecision })),
    ...input.occurrences
      .filter((row) => input.state.occurrenceIds.includes(row.occurrenceId))
      .map((row) => ({ date: row.effectiveDate, precision: row.datePrecision })),
  ]
    .filter((row): row is { date: string; precision: typeof row.precision } => row.date !== null)
    .sort((left, right) => compareText(right.date, left.date));
  const latest = candidates[0];
  return latest === undefined
    ? { effectiveDate: null, datePrecision: "unknown" }
    : { effectiveDate: latest.date, datePrecision: latest.precision };
}

function buildCurrentState(accumulator: RouteAccumulator): StudioRouteInterventionCurrentState[] {
  const rank: Record<StudioInterventionLifecycleState, number> = {
    current_confirmed: 7,
    implemented: 6,
    historical_confirmed: 5,
    planned: 4,
    proposed: 3,
    under_consideration: 2,
    candidate: 1,
  };
  const groups = new Map<
    string,
    {
      treatmentKind: StudioInterventionTreatmentKind;
      treatmentFamily: StudioInterventionTreatmentFamily;
      lifecycleState: StudioInterventionLifecycleState;
      treatmentIds: Set<string>;
      occurrenceIds: Set<string>;
    }
  >();
  const groupByTreatment = new Map<string, string>();
  for (const treatment of accumulator.treatments) {
    const key = `${treatment.treatmentKind}|${treatment.treatmentFamily}`;
    const group = groups.get(key) ?? {
      treatmentKind: treatment.treatmentKind,
      treatmentFamily: treatment.treatmentFamily,
      lifecycleState: treatment.lifecycleState,
      treatmentIds: new Set<string>(),
      occurrenceIds: new Set<string>(),
    };
    if (rank[treatment.lifecycleState] > rank[group.lifecycleState]) {
      group.lifecycleState = treatment.lifecycleState;
    }
    group.treatmentIds.add(treatment.treatmentId);
    groupByTreatment.set(treatment.treatmentId, key);
    groups.set(key, group);
  }
  for (const occurrence of accumulator.occurrences) {
    for (const treatmentId of occurrence.treatmentIds) {
      const key = groupByTreatment.get(treatmentId);
      const group = key === undefined ? undefined : groups.get(key);
      if (group === undefined) continue;
      group.occurrenceIds.add(occurrence.occurrenceId);
      if (rank[occurrence.lifecycleState] > rank[group.lifecycleState]) {
        group.lifecycleState = occurrence.lifecycleState;
      }
    }
  }
  return [...groups.values()]
    .map((group) => {
      const state = {
        treatmentIds: uniqueSorted([...group.treatmentIds]),
        occurrenceIds: uniqueSorted([...group.occurrenceIds]),
      };
      return {
        treatmentKind: group.treatmentKind,
        treatmentFamily: group.treatmentFamily,
        lifecycleState: group.lifecycleState,
        ...dateForCurrentState({
          state,
          treatments: accumulator.treatments,
          occurrences: accumulator.occurrences,
        }),
        ...state,
      };
    })
    .sort(
      (left, right) =>
        compareText(left.treatmentKind, right.treatmentKind) ||
        compareText(left.treatmentFamily, right.treatmentFamily),
    );
}

function sortTreatments(rows: readonly StudioRouteInterventionTreatment[]) {
  return [...rows].sort((left, right) => compareText(left.treatmentId, right.treatmentId));
}

function sortOccurrences(rows: readonly StudioRouteInterventionOccurrence[]) {
  return [...rows].sort((left, right) => compareText(left.occurrenceId, right.occurrenceId));
}

function sourceStatesForRoute(input: {
  readonly release: StudioReleasePayload;
  readonly accumulator: RouteAccumulator;
  readonly occurrenceSourcePartial: boolean;
  readonly local: RouteInterventionInventoryLocalRegistryInput | undefined;
}): StudioRouteInterventionSourceState[] {
  const evidenceRecordCount =
    input.accumulator.evidence.timeline.length +
    input.accumulator.evidence.interventions.length +
    input.accumulator.evidence.metricClaims.length +
    input.accumulator.evidence.projects.length +
    input.accumulator.evidence.sourceGaps.length;
  return [
    {
      sourceKind: "intervention_corpus",
      requirement: "required",
      availability: "available",
      checkedCoverage: input.release.coverage,
      recordCount: input.accumulator.corpusRecordIds.size,
    },
    {
      sourceKind: "route_evidence",
      requirement: "required",
      availability: input.accumulator.sourceGaps.some((gap) => gap.sourceKind === "route_evidence")
        ? "partial"
        : "available",
      checkedCoverage: input.release.coverage,
      recordCount: evidenceRecordCount,
    },
    {
      sourceKind: "operational_occurrences",
      requirement: "required",
      availability:
        input.occurrenceSourcePartial ||
        input.accumulator.sourceGaps.some((gap) => gap.sourceKind === "operational_occurrences")
          ? "partial"
          : "available",
      checkedCoverage: input.release.coverage,
      recordCount: input.accumulator.wikiOccurrenceIds.size,
    },
    input.local === undefined
      ? {
          sourceKind: "local_registry",
          requirement: "optional",
          availability: "unavailable",
          checkedCoverage: null,
          recordCount: 0,
        }
      : {
          sourceKind: "local_registry",
          requirement: "optional",
          availability: input.accumulator.sourceGaps.some(
            (gap) => gap.sourceKind === "local_registry",
          )
            ? "partial"
            : input.local.availability,
          checkedCoverage: input.local.checkedCoverage ?? input.release.coverage,
          recordCount: input.accumulator.localRegistryEventIds.size,
        },
  ];
}

function countsBy<T extends string>(values: readonly T[]): Array<{ value: T; count: number }> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([value, count]) => ({ value, count }));
}

function sourceStateSummary(states: readonly StudioRouteInterventionSourceState[]) {
  return {
    availableCount: states.filter((state) => state.availability === "available").length,
    partialCount: states.filter((state) => state.availability === "partial").length,
    unavailableCount: states.filter((state) => state.availability === "unavailable").length,
  };
}

function facetRowsForBundle(
  bundle: StudioRouteInterventionInventoryBundle,
): StudioInterventionFacetIndexRow[] {
  const bundleKey = routeInterventionInventoryBundleKey(bundle.routeSlug);
  const treatmentById = new Map(
    bundle.treatments.map((treatment) => [treatment.treatmentId, treatment]),
  );
  const treatmentRows = bundle.treatments.map((treatment) => ({
    facetId: `${bundle.route.routeId}|${treatment.treatmentId}`,
    sourceNamespace: treatment.sourceNamespace,
    sourceRecordId: treatment.sourceRecordId,
    sourceOccurrenceId: null,
    occurrenceId: null,
    routeId: bundle.route.routeId,
    routeSlug: bundle.routeSlug,
    treatmentIds: [treatment.treatmentId],
    treatmentKinds: [treatment.treatmentKind],
    treatmentFamilies: [treatment.treatmentFamily],
    lifecycleState: treatment.lifecycleState,
    effectiveDate: treatment.effectiveDate,
    datePrecision: treatment.datePrecision,
    projectIds: treatment.projectIds,
    bundleKey,
  }));
  const occurrenceRows = bundle.occurrences.map((occurrence) => {
    const treatments = occurrence.treatmentIds.map((id) => {
      const treatment = treatmentById.get(id);
      if (treatment === undefined) {
        throw new Error(`Occurrence ${occurrence.occurrenceId} references missing treatment ${id}`);
      }
      return treatment;
    });
    return {
      facetId: `${bundle.route.routeId}|${occurrence.occurrenceId}`,
      sourceNamespace: occurrence.sourceNamespace,
      sourceRecordId: occurrence.sourceOccurrenceId,
      sourceOccurrenceId: occurrence.sourceOccurrenceId,
      occurrenceId: occurrence.occurrenceId,
      routeId: bundle.route.routeId,
      routeSlug: bundle.routeSlug,
      treatmentIds: occurrence.treatmentIds,
      treatmentKinds: uniqueSorted(
        treatments.map((treatment) => treatment.treatmentKind),
      ) as StudioInterventionTreatmentKind[],
      treatmentFamilies: uniqueSorted(
        treatments.map((treatment) => treatment.treatmentFamily),
      ) as StudioInterventionTreatmentFamily[],
      lifecycleState: occurrence.lifecycleState,
      effectiveDate: occurrence.effectiveDate,
      datePrecision: occurrence.datePrecision,
      projectIds: occurrence.projectIds,
      bundleKey,
    };
  });
  return [...treatmentRows, ...occurrenceRows].sort((left, right) =>
    compareText(left.facetId, right.facetId),
  );
}

function assertWithinBudget(label: string, bytes: Uint8Array, budget: number): void {
  if (bytes.byteLength > budget) {
    throw new Error(`${label} is ${bytes.byteLength} bytes, exceeding its ${budget}-byte budget`);
  }
}

export function buildRouteInterventionInventory(
  input: BuildRouteInterventionInventoryInput,
): BuiltRouteInterventionInventory {
  const {
    release,
    corpus,
    evidenceIndex,
    evidenceByRoute,
    occurrences,
    treatmentSemantics,
    treatmentVocabularyScopes,
    routeTreatmentScopes,
    routeTreatmentScopeReconciliation,
  } = decodeRequiredInputs(input);
  const reviewed = input.reviewedOpenDispositions ?? REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1;
  const localRows = input.localRegistry?.rows ?? [];
  const vocabulary = reviewedVocabulary({
    corpus,
    localRows,
    table: reviewed,
  });
  const accumulators = makeAccumulators(evidenceIndex, evidenceByRoute);
  const claims = new Map<string, ComponentDispositionClaim>();
  const projectionFailures: StudioRouteInterventionProjectionFailure[] = [];
  addCorpusTreatments({
    release,
    corpus,
    accumulators,
    reviewed,
    claims,
    projectionFailures,
  });
  addLocalRegistryFacts({
    local: input.localRegistry,
    corpus,
    accumulators,
    reviewed,
    claims,
    projectionFailures,
  });
  const unreviewedLocalClaims = [...claims.values()].filter(
    (claim) => claim.disposition.disposition === "unmapped_review_required",
  );
  if (unreviewedLocalClaims.length > 0) {
    throw new Error(
      `Unmapped corpus or local treatments block inventory publication: ${unreviewedLocalClaims
        .map((claim) => claim.id)
        .sort(compareText)
        .join(", ")}`,
    );
  }
  const semantics = companionSemantics({
    treatmentSemantics,
    vocabularyScopes: treatmentVocabularyScopes,
    routeScopes: routeTreatmentScopes,
    unscopedRows: routeTreatmentScopeReconciliation,
  });
  addMtaWikiScopeFacts({
    release,
    accumulators,
    occurrences,
    routeScopes: routeTreatmentScopes,
    unscopedRows: routeTreatmentScopeReconciliation,
    dispositionByRecord: semantics.dispositionByRecord,
    claims,
    projectionFailures,
  });
  addWikiOccurrences({ occurrences, accumulators, routeScopes: routeTreatmentScopes });

  const identity = releaseIdentity(release);
  const bundles: BuiltRouteInterventionInventoryBundle[] = [];
  for (const accumulator of [...accumulators.values()].sort((left, right) =>
    compareText(left.route.routeId, right.route.routeId),
  )) {
    accumulator.projectRefs.push(...buildProjectRefs(accumulator));
    const treatments = sortTreatments(accumulator.treatments);
    const occurrencesForRoute = sortOccurrences(accumulator.occurrences);
    const currentState = buildCurrentState(accumulator);
    const sourceStates = sourceStatesForRoute({
      release,
      accumulator,
      occurrenceSourcePartial: occurrences.projectionRejections.length > 0,
      local: input.localRegistry,
    });
    const hasPositiveEvidence = treatments.length > 0 || occurrencesForRoute.length > 0;
    const requiredSourcePartial = sourceStates.some(
      (state) => state.requirement === "required" && state.availability !== "available",
    );
    const coverageState =
      requiredSourcePartial || accumulator.sourceGaps.length > 0
        ? "partial"
        : !hasPositiveEvidence
          ? "checked_no_positive_evidence"
          : sourceStates.every((state) => state.availability === "available")
            ? "available"
            : "partial";
    const value = decodeSchemaStrict(StudioRouteInterventionInventoryBundleSchema, {
      artifactKind: "bp.studio.route_intervention_inventory_bundle.v1",
      schemaVersion: 1,
      ...identity,
      route: accumulator.route,
      routeSlug: routeIdToStudioSlug(accumulator.route.routeId),
      coverageState,
      sourceStates,
      treatments,
      occurrences: occurrencesForRoute,
      currentState,
      projectRefs: [...accumulator.projectRefs].sort((left, right) =>
        compareText(left.projectId, right.projectId),
      ),
      sourceGaps: [...accumulator.sourceGaps].sort((left, right) =>
        compareText(left.gapId, right.gapId),
      ),
    });
    const bytes = canonicalRouteInterventionInventoryBytes(value);
    assertWithinBudget(
      `Route intervention inventory bundle ${accumulator.route.routeId}`,
      bytes,
      ROUTE_INTERVENTION_INVENTORY_BYTE_BUDGETS.routeBundle,
    );
    bundles.push({
      key: routeInterventionInventoryBundleKey(value.routeSlug),
      value,
      bytes,
      sha256: sha256(bytes),
      byteSize: bytes.byteLength,
    });
  }

  const routeIndexRoutes: StudioRouteInterventionInventoryIndexRoute[] = bundles.map((bundle) => {
    const familyCounts = countsBy(
      bundle.value.treatments.map((treatment) => treatment.treatmentFamily),
    ).map(({ value, count }) => ({ treatmentFamily: value, count }));
    const stateCounts = countsBy([
      ...bundle.value.treatments.map((treatment) => treatment.lifecycleState),
      ...bundle.value.occurrences.map((occurrence) => occurrence.lifecycleState),
    ]).map(({ value, count }) => ({ lifecycleState: value, count }));
    return {
      route: bundle.value.route,
      routeSlug: bundle.value.routeSlug,
      bundleKey: bundle.key,
      sha256: bundle.sha256,
      byteSize: bundle.byteSize,
      coverageState: bundle.value.coverageState,
      familyCounts,
      stateCounts,
      sourceStateSummary: sourceStateSummary(bundle.value.sourceStates),
    };
  });
  const routeIndex = decodeSchemaStrict(StudioRouteInterventionInventoryIndexSchema, {
    artifactKind: "bp.studio.route_intervention_inventory_index.v1",
    schemaVersion: 1,
    ...identity,
    summary: {
      routeCount: routeIndexRoutes.length,
      checkedEmptyRouteCount: routeIndexRoutes.filter(
        (route) => route.coverageState === "checked_no_positive_evidence",
      ).length,
      totalByteSize: bundles.reduce((sum, bundle) => sum + bundle.byteSize, 0),
    },
    routes: routeIndexRoutes,
  });
  const routeIndexBytes = canonicalRouteInterventionInventoryBytes(routeIndex);
  assertWithinBudget(
    "Route intervention inventory index",
    routeIndexBytes,
    ROUTE_INTERVENTION_INVENTORY_BYTE_BUDGETS.routeIndex,
  );

  const facetRows = bundles.flatMap((bundle) => facetRowsForBundle(bundle.value));
  const facetIndex = decodeSchemaStrict(StudioInterventionFacetIndexSchema, {
    artifactKind: "bp.studio.intervention_facet_index.v1",
    schemaVersion: 1,
    ...identity,
    summary: {
      rowCount: facetRows.length,
      routeCount: new Set(facetRows.map((row) => row.routeId)).size,
      treatmentCount: new Set(facetRows.flatMap((row) => row.treatmentIds)).size,
      occurrenceCount: new Set(
        facetRows.flatMap((row) => (row.occurrenceId === null ? [] : [row.occurrenceId])),
      ).size,
    },
    rows: facetRows,
  });
  const facetIndexBytes = canonicalRouteInterventionInventoryBytes(facetIndex);
  assertWithinBudget(
    `Studio intervention facet index (${facetIndex.summary.rowCount} rows across ${facetIndex.summary.routeCount} routes, ${facetIndex.summary.treatmentCount} treatments, and ${facetIndex.summary.occurrenceCount} occurrences)`,
    facetIndexBytes,
    ROUTE_INTERVENTION_INVENTORY_BYTE_BUDGETS.facetIndex,
  );

  const allTreatments = bundles.flatMap((bundle) => bundle.value.treatments);
  const allOccurrences = bundles.flatMap((bundle) => bundle.value.occurrences);
  const globalSourceStates = sourceStatesForRoute({
    release,
    accumulator: {
      route: bundles[0]?.value.route ?? evidenceIndex.routes[0]?.routeIdentity,
      evidence: evidenceByRoute.values().next().value,
      treatments: [],
      occurrences: [],
      projectRefs: [],
      sourceGaps: [...accumulators.values()].flatMap((accumulator) => accumulator.sourceGaps),
      corpusRecordIds: new Set(corpus.records.map((record) => record.recordId)),
      wikiOccurrenceIds: new Set(occurrences.occurrences.map((row) => row.occurrence_id)),
      localRegistryEventIds: new Set(localRows.map((row) => row.event_id)),
    } as RouteAccumulator,
    occurrenceSourcePartial: occurrences.projectionRejections.length > 0,
    local: input.localRegistry,
  });
  const globalRouteEvidenceState = globalSourceStates.find(
    (state) => state.sourceKind === "route_evidence",
  );
  if (globalRouteEvidenceState === undefined) {
    throw new Error("Global reconciliation is missing its route-evidence source state");
  }
  globalSourceStates.splice(1, 1, {
    ...globalRouteEvidenceState,
    recordCount: [...evidenceByRoute.values()].reduce(
      (count, bundle) =>
        count +
        bundle.timeline.length +
        bundle.interventions.length +
        bundle.metricClaims.length +
        bundle.projects.length +
        bundle.sourceGaps.length,
      0,
    ),
  });
  const mappedTreatmentCount = [...claims.values()].filter(
    (claim) => claim.disposition.disposition === "mapped",
  ).length;
  const otherDocumentedTreatmentCount = [...claims.values()].filter(
    (claim) => claim.disposition.disposition === "other_documented",
  ).length;
  const unmappedTreatmentCount = [...claims.values()].filter(
    (claim) => claim.disposition.disposition === "unmapped_review_required",
  ).length;
  if (
    mappedTreatmentCount + otherDocumentedTreatmentCount + unmappedTreatmentCount !==
    claims.size
  ) {
    throw new Error("Treatment reconciliation does not account for every source component");
  }
  const reviewedVocabularyBytes = canonicalRouteInterventionInventoryBytes(vocabulary.dispositions);
  const reconciliation = decodeSchemaStrict(StudioRouteInterventionInventoryReconciliationSchema, {
    artifactKind: "bp.studio.route_intervention_inventory_reconciliation.v1",
    schemaVersion: 1,
    ...identity,
    summary: {
      sourceRecordCount:
        corpus.records.length +
        new Set(
          [...evidenceByRoute.values()].flatMap((bundle) =>
            bundle.interventions.map((row) => row.recordId),
          ),
        ).size +
        occurrences.occurrences.length +
        localRows.length,
      sourceTreatmentCount: claims.size,
      sourceOccurrenceCount: occurrences.occurrences.length + localRows.length,
      mappedTreatmentCount,
      otherDocumentedTreatmentCount,
      unmappedTreatmentCount,
      projectedTreatmentCount: allTreatments.length,
      projectedOccurrenceCount: allOccurrences.length,
      projectTreatmentRelationshipCount: bundles.reduce(
        (count, bundle) =>
          count +
          bundle.value.projectRefs.reduce(
            (routeCount, project) => routeCount + project.treatmentIds.length,
            0,
          ),
        0,
      ),
      projectOccurrenceRelationshipCount: bundles.reduce(
        (count, bundle) =>
          count +
          bundle.value.projectRefs.reduce(
            (routeCount, project) => routeCount + project.occurrenceIds.length,
            0,
          ),
        0,
      ),
      routeProjectionFailureCount: projectionFailures.length,
      checkedEmptyRouteCount: routeIndex.summary.checkedEmptyRouteCount,
    },
    sourceStates: globalSourceStates,
    familyCounts: countsBy(allTreatments.map((treatment) => treatment.treatmentFamily)).map(
      ({ value, count }) => ({ treatmentFamily: value, count }),
    ),
    stateCounts: countsBy([
      ...allTreatments.map((treatment) => treatment.lifecycleState),
      ...allOccurrences.map((occurrence) => occurrence.lifecycleState),
    ]).map(({ value, count }) => ({ lifecycleState: value, count })),
    projectionFailures: [...projectionFailures].sort(
      (left, right) =>
        compareText(left.sourceNamespace, right.sourceNamespace) ||
        compareText(left.sourceRecordId, right.sourceRecordId) ||
        compareText(left.rawRouteId ?? "", right.rawRouteId ?? ""),
    ),
    reviewedOpenVocabulary: {
      sha256: sha256(reviewedVocabularyBytes),
      literalCount: vocabulary.collected.length,
      sourceCounts: Object.keys(
        vocabulary.collected[0]?.sourceCounts ?? {
          reviewed_corpus_custom: 0,
          wiki_route_evidence: 0,
          wiki_operational_occurrence: 0,
          local_registry: 0,
        },
      )
        .sort(compareText)
        .map((sourceNamespace) => ({
          sourceNamespace,
          literalCount: vocabulary.collected.reduce(
            (count, row) =>
              count +
              row.sourceCounts[
                sourceNamespace as keyof (typeof vocabulary.collected)[number]["sourceCounts"]
              ],
            0,
          ),
        })),
    },
  });
  const reconciliationBytes = canonicalRouteInterventionInventoryBytes(reconciliation);

  return {
    bundles,
    routeIndex,
    routeIndexBytes,
    facetIndex,
    facetIndexBytes,
    reconciliation,
    reconciliationBytes,
  };
}

function finalPath(artifactRoot: string, key: string): string {
  const root = resolve(artifactRoot);
  const target = resolve(root, key);
  const rel = relative(root, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`Artifact key escapes root: ${key}`);
  }
  return target;
}

async function writeAtomicFile(input: {
  readonly artifactRoot: string;
  readonly artifact: RouteInterventionInventoryArtifactBytes;
  readonly schema: unknown;
}): Promise<void> {
  const path = finalPath(input.artifactRoot, input.artifact.key);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx");
    await handle.writeFile(input.artifact.bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    strictJson(input.schema as never, input.artifact.bytes);
    await rename(temporaryPath, path);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function promoteRouteInterventionInventoryArtifacts(input: {
  readonly artifactRoot: string;
  readonly build: BuiltRouteInterventionInventory;
}): Promise<void> {
  for (const bundle of input.build.bundles) {
    await writeAtomicFile({
      artifactRoot: input.artifactRoot,
      artifact: bundle,
      schema: StudioRouteInterventionInventoryBundleSchema,
    });
  }
  await writeAtomicFile({
    artifactRoot: input.artifactRoot,
    artifact: {
      key: routeInterventionInventoryIndexKey(),
      bytes: input.build.routeIndexBytes,
    },
    schema: StudioRouteInterventionInventoryIndexSchema,
  });
  await writeAtomicFile({
    artifactRoot: input.artifactRoot,
    artifact: { key: interventionFacetIndexKey(), bytes: input.build.facetIndexBytes },
    schema: StudioInterventionFacetIndexSchema,
  });
  await writeAtomicFile({
    artifactRoot: input.artifactRoot,
    artifact: {
      key: routeInterventionInventoryReconciliationKey(),
      bytes: input.build.reconciliationBytes,
    },
    schema: StudioRouteInterventionInventoryReconciliationSchema,
  });
}

export async function buildAndPromoteRouteInterventionInventory(
  input: BuildRouteInterventionInventoryInput & { readonly artifactRoot: string },
): Promise<BuiltRouteInterventionInventory> {
  const build = buildRouteInterventionInventory(input);
  await promoteRouteInterventionInventoryArtifacts({ artifactRoot: input.artifactRoot, build });
  return build;
}
