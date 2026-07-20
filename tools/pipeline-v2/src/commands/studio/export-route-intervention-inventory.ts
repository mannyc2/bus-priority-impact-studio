import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  adaptMtaWikiTreatmentSemanticContractV1,
  diffReviewedOpenTreatmentVocabulary,
  type MtaWikiTreatmentSemanticArtifactV1,
  type MtaWikiTreatmentVocabularyScopeV1,
  REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1,
  type RouteTreatmentInterventionEventRow,
  reconcileMtaWikiTreatmentSemanticsV1,
} from "@bp/analytics/interventions";
import { MtaWikiOperationalOccurrenceImportArtifactV5Schema } from "@bp/domain/documents/operational-occurrence";
import {
  interventionFacetIndexKey,
  routeInterventionInventoryIndexKey,
  routeInterventionInventoryReconciliationKey,
  type StudioInterventionCorpus,
  StudioInterventionCorpusSchema,
  StudioReleasePayloadSchema,
  StudioRouteEvidenceIndexV2Schema,
} from "@bp/domain/studio";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { loadRouteInterventionInventoryLocalDbRows } from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { loadMtaWikiRouteIdentities } from "../../lib/mta-wiki-route-identities.ts";
import { fromCliPath } from "../../lib/paths.ts";
import {
  type BuildRouteInterventionInventoryInput,
  buildRouteInterventionInventory,
  promoteRouteInterventionInventoryArtifacts,
} from "../../lib/route-intervention-inventory.ts";

const textDecoder = new TextDecoder("utf-8", { fatal: true });

type RouteTreatmentScope = {
  readonly scopeId: string;
  readonly treatmentRecordId: string;
  readonly rawValue: string;
};

type RouteTreatmentScopeReconciliation = {
  readonly treatmentRecordId: string;
  readonly rawValue: string;
};

type ScopePartitionReport = {
  readonly exact: boolean;
  readonly vocabularyRecordCount: number;
  readonly routedRecordCount: number;
  readonly explicitlyUnscopedRecordCount: number;
  readonly missingRecordIds: readonly string[];
  readonly unknownRecordIds: readonly string[];
  readonly duplicateScopeIds: readonly string[];
  readonly duplicateUnscopedRecordIds: readonly string[];
  readonly duplicateVocabularyRecordIds: readonly string[];
  readonly overlappingRecordIds: readonly string[];
  readonly literalMismatches: readonly string[];
};

type LoadedCommandInputs = {
  readonly buildInput: BuildRouteInterventionInventoryInput;
  readonly corpus: StudioInterventionCorpus;
  readonly localRows: readonly RouteTreatmentInterventionEventRow[];
  readonly treatmentSemantics: MtaWikiTreatmentSemanticArtifactV1;
  readonly treatmentVocabularyScopes: readonly MtaWikiTreatmentVocabularyScopeV1[];
  readonly routeTreatmentScopes: readonly RouteTreatmentScope[];
  readonly routeTreatmentScopeReconciliation: readonly RouteTreatmentScopeReconciliation[];
  readonly wikiRelease: string;
  readonly wikiManifestSha256: string;
  readonly addressedManifestFileCount: number;
  readonly completeReleaseFileCount: number;
};

export type ExportRouteInterventionInventoryOptions = {
  readonly db?: string | undefined;
  readonly releaseArtifact: string;
  readonly interventionCorpus: string;
  readonly routeEvidenceIndex: string;
  readonly wikiOccurrences: string;
  readonly mtaWikiRoot: string;
  readonly artifactRoot: string;
  readonly checkVocabulary: boolean;
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}: expected object`);
  }
  return value as Record<string, unknown>;
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}: expected nonempty string`);
  }
  return value;
}

function parseJsonl(text: string, label: string): unknown[] {
  return text.split(/\r?\n/u).flatMap((line, index) => {
    if (line.length === 0) return [];
    try {
      return [JSON.parse(line) as unknown];
    } catch (error) {
      throw new Error(
        `${label}:${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

function parseTreatmentVocabularyScopes(bytes: Uint8Array): MtaWikiTreatmentVocabularyScopeV1[] {
  return parseJsonl(textDecoder.decode(bytes), "treatment_components.jsonl").map((value, index) => {
    const row = objectValue(value, `treatment_components.jsonl:${index + 1}`);
    const payload = objectValue(row["payload"], `treatment_components.jsonl:${index + 1}.payload`);
    return {
      rawValue: nonemptyString(
        payload["treatment_kind"],
        `treatment_components.jsonl:${index + 1}.payload.treatment_kind`,
      ),
      recordId: nonemptyString(
        row["record_id"],
        `treatment_components.jsonl:${index + 1}.record_id`,
      ),
    };
  });
}

function parseRouteTreatmentScopes(values: readonly unknown[]): RouteTreatmentScope[] {
  return values.map((value, index) => {
    const row = objectValue(value, `route_treatment_scopes.jsonl:${index + 1}`);
    return {
      scopeId: nonemptyString(
        row["scope_id"],
        `route_treatment_scopes.jsonl:${index + 1}.scope_id`,
      ),
      treatmentRecordId: nonemptyString(
        row["treatment_record_id"],
        `route_treatment_scopes.jsonl:${index + 1}.treatment_record_id`,
      ),
      rawValue: nonemptyString(
        row["raw_treatment_kind"],
        `route_treatment_scopes.jsonl:${index + 1}.raw_treatment_kind`,
      ),
    };
  });
}

function parseRouteTreatmentScopeReconciliation(
  values: readonly unknown[],
): RouteTreatmentScopeReconciliation[] {
  return values.map((value, index) => {
    const row = objectValue(value, `route_treatment_scope_reconciliation.jsonl:${index + 1}`);
    return {
      treatmentRecordId: nonemptyString(
        row["treatment_record_id"],
        `route_treatment_scope_reconciliation.jsonl:${index + 1}.treatment_record_id`,
      ),
      rawValue: nonemptyString(
        row["raw_treatment_kind"],
        `route_treatment_scope_reconciliation.jsonl:${index + 1}.raw_treatment_kind`,
      ),
    };
  });
}

function countDuplicates(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort(compareText);
}

export function reconcileRouteTreatmentScopePartition(input: {
  readonly vocabularyScopes: readonly MtaWikiTreatmentVocabularyScopeV1[];
  readonly routeScopes: readonly RouteTreatmentScope[];
  readonly unscopedRows: readonly RouteTreatmentScopeReconciliation[];
}): ScopePartitionReport {
  const vocabularyByRecord = new Map(
    input.vocabularyScopes.map((scope) => [scope.recordId, scope.rawValue]),
  );
  const routedRecordIds = new Set(input.routeScopes.map((row) => row.treatmentRecordId));
  const unscopedRecordIds = new Set(input.unscopedRows.map((row) => row.treatmentRecordId));
  const addressedRecordIds = new Set([...routedRecordIds, ...unscopedRecordIds]);
  const missingRecordIds = [...vocabularyByRecord.keys()]
    .filter((recordId) => !addressedRecordIds.has(recordId))
    .sort(compareText);
  const unknownRecordIds = [...addressedRecordIds]
    .filter((recordId) => !vocabularyByRecord.has(recordId))
    .sort(compareText);
  const overlappingRecordIds = [...routedRecordIds]
    .filter((recordId) => unscopedRecordIds.has(recordId))
    .sort(compareText);
  const literalMismatches = [...input.routeScopes, ...input.unscopedRows]
    .filter((row) => vocabularyByRecord.get(row.treatmentRecordId) !== row.rawValue)
    .map((row) => row.treatmentRecordId)
    .sort(compareText);
  const duplicateScopeIds = countDuplicates(input.routeScopes.map((row) => row.scopeId));
  const duplicateUnscopedRecordIds = countDuplicates(
    input.unscopedRows.map((row) => row.treatmentRecordId),
  );
  const vocabularyRecordIds = input.vocabularyScopes.map((scope) => scope.recordId);
  const duplicateVocabularyRecordIds = countDuplicates(vocabularyRecordIds);
  const exact =
    missingRecordIds.length === 0 &&
    unknownRecordIds.length === 0 &&
    duplicateScopeIds.length === 0 &&
    duplicateUnscopedRecordIds.length === 0 &&
    duplicateVocabularyRecordIds.length === 0 &&
    overlappingRecordIds.length === 0 &&
    literalMismatches.length === 0;
  return {
    exact,
    vocabularyRecordCount: vocabularyByRecord.size,
    routedRecordCount: routedRecordIds.size,
    explicitlyUnscopedRecordCount: unscopedRecordIds.size,
    missingRecordIds,
    unknownRecordIds,
    duplicateScopeIds,
    duplicateUnscopedRecordIds,
    duplicateVocabularyRecordIds,
    overlappingRecordIds,
    literalMismatches: sortedUnique(literalMismatches),
  };
}

function treatmentSemanticsArtifact(value: unknown): MtaWikiTreatmentSemanticArtifactV1 {
  const artifact = value as MtaWikiTreatmentSemanticArtifactV1;
  adaptMtaWikiTreatmentSemanticContractV1(artifact);
  return artifact;
}

export function routeInterventionInventoryVocabularyReport(input: {
  readonly corpus: StudioInterventionCorpus;
  readonly localRows: readonly RouteTreatmentInterventionEventRow[];
  readonly treatmentSemantics: MtaWikiTreatmentSemanticArtifactV1;
  readonly treatmentVocabularyScopes: readonly MtaWikiTreatmentVocabularyScopeV1[];
  readonly routeTreatmentScopes: readonly RouteTreatmentScope[];
  readonly routeTreatmentScopeReconciliation: readonly RouteTreatmentScopeReconciliation[];
}) {
  const nonWiki = diffReviewedOpenTreatmentVocabulary(
    {
      reviewedCorpusCustomTreatments: input.corpus.records.flatMap(
        (record) => record.customTreatments,
      ),
      localRegistryRawInterventionTypes: input.localRows
        .map((row) => row.intervention_type)
        .filter((rawValue) => rawValue.length > 0),
    },
    REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1,
  );
  const wikiSemantics = reconcileMtaWikiTreatmentSemanticsV1({
    vocabularyScopes: input.treatmentVocabularyScopes,
    artifact: input.treatmentSemantics,
  });
  const routeScopePartition = reconcileRouteTreatmentScopePartition({
    vocabularyScopes: input.treatmentVocabularyScopes,
    routeScopes: input.routeTreatmentScopes,
    unscopedRows: input.routeTreatmentScopeReconciliation,
  });
  const exact = nonWiki.exact && wikiSemantics.exact && routeScopePartition.exact;
  return {
    mode: "vocabulary_check" as const,
    exact,
    coverageState:
      wikiSemantics.blockingUnresolvedScopes.length === 0
        ? ("available" as const)
        : ("partial" as const),
    blockingUnresolvedScopeCount: wikiSemantics.blockingUnresolvedScopes.length,
    nonWiki,
    wikiSemantics,
    routeScopePartition,
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function loadCommandInputs(input: {
  readonly options: ExportRouteInterventionInventoryOptions;
  readonly local?: OpenLocalPipelineDb | undefined;
}): Promise<LoadedCommandInputs> {
  const releaseArtifactPath = fromCliPath(input.options.releaseArtifact);
  const interventionCorpusPath = fromCliPath(input.options.interventionCorpus);
  const routeEvidenceIndexPath = fromCliPath(input.options.routeEvidenceIndex);
  const wikiOccurrencesPath = fromCliPath(input.options.wikiOccurrences);
  const routeEvidenceIndex = await readJsonArtifact(
    routeEvidenceIndexPath,
    StudioRouteEvidenceIndexV2Schema,
    "strict",
  );
  const verifiedRelease = await loadMtaWikiRouteIdentities({
    mtaWikiRoot: fromCliPath(input.options.mtaWikiRoot),
    wikiRelease: routeEvidenceIndex.source.wikiRelease,
    wikiManifestSha256: routeEvidenceIndex.source.manifestSha256,
  });
  const release = await readJsonArtifact(releaseArtifactPath, StudioReleasePayloadSchema, "strict");
  const corpus = await readJsonArtifact(
    interventionCorpusPath,
    StudioInterventionCorpusSchema,
    "strict",
  );
  const wikiOccurrences = await readJsonArtifact(
    wikiOccurrencesPath,
    MtaWikiOperationalOccurrenceImportArtifactV5Schema,
    "strict",
  );
  const routeEvidenceBundles = await Promise.all(
    routeEvidenceIndex.routes.map(async (route) => ({
      artifactKey: route.artifactKey,
      bytes: await readFile(
        join(dirname(routeEvidenceIndexPath), "routes", `${route.routeSlug}.json`),
      ),
    })),
  );
  const releaseFile = async (name: string): Promise<unknown> =>
    readJson(join(verifiedRelease.releaseDirectory, name));
  const releaseJsonl = async (name: string): Promise<unknown[]> =>
    parseJsonl(await readFile(join(verifiedRelease.releaseDirectory, name), "utf8"), name);
  const treatmentSemantics = treatmentSemanticsArtifact(
    await releaseFile("treatment_semantics.json"),
  );
  const rawRouteTreatmentScopes = await releaseJsonl("route_treatment_scopes.jsonl");
  const rawRouteTreatmentScopeReconciliation = await releaseJsonl(
    "route_treatment_scope_reconciliation.jsonl",
  );
  const treatmentVocabularyScopes = parseTreatmentVocabularyScopes(
    verifiedRelease.canonicalFiles["treatment_components.jsonl"],
  );
  const routeTreatmentScopes = parseRouteTreatmentScopes(rawRouteTreatmentScopes);
  const routeTreatmentScopeReconciliation = parseRouteTreatmentScopeReconciliation(
    rawRouteTreatmentScopeReconciliation,
  );
  const localRows =
    input.local === undefined
      ? { interventionEventRows: [], sourceAvailable: false }
      : loadRouteInterventionInventoryLocalDbRows({ sqlite: input.local.sqlite });
  const localRegistry = localRows.sourceAvailable
    ? ({
        availability: "available",
        rows: localRows.interventionEventRows,
      } as const)
    : undefined;

  return {
    buildInput: {
      release,
      interventionCorpus: corpus,
      routeEvidenceIndex,
      routeEvidenceBundles,
      wikiOccurrences,
      wikiTreatmentCompanions: {
        releaseId: routeEvidenceIndex.source.wikiRelease,
        manifestSha256: routeEvidenceIndex.source.manifestSha256,
        treatmentSemantics,
        treatmentVocabularyScopes,
        routeTreatmentScopes: rawRouteTreatmentScopes,
        routeTreatmentScopeReconciliation: rawRouteTreatmentScopeReconciliation,
      },
      ...(localRegistry === undefined ? {} : { localRegistry }),
    },
    corpus,
    localRows: localRows.interventionEventRows,
    treatmentSemantics,
    treatmentVocabularyScopes,
    routeTreatmentScopes,
    routeTreatmentScopeReconciliation,
    wikiRelease: routeEvidenceIndex.source.wikiRelease,
    wikiManifestSha256: routeEvidenceIndex.source.manifestSha256,
    addressedManifestFileCount: verifiedRelease.addressedManifestFileCount,
    completeReleaseFileCount: verifiedRelease.completeReleaseFileCount,
  };
}

export async function runExportRouteInterventionInventory(input: {
  readonly options: ExportRouteInterventionInventoryOptions;
  readonly local?: OpenLocalPipelineDb | undefined;
}) {
  const loaded = await loadCommandInputs(input);
  if (input.options.checkVocabulary) {
    return {
      ...routeInterventionInventoryVocabularyReport({
        corpus: loaded.corpus,
        localRows: loaded.localRows,
        treatmentSemantics: loaded.treatmentSemantics,
        treatmentVocabularyScopes: loaded.treatmentVocabularyScopes,
        routeTreatmentScopes: loaded.routeTreatmentScopes,
        routeTreatmentScopeReconciliation: loaded.routeTreatmentScopeReconciliation,
      }),
      wikiRelease: loaded.wikiRelease,
      wikiManifestSha256: loaded.wikiManifestSha256,
      addressedManifestFileCount: loaded.addressedManifestFileCount,
      completeReleaseFileCount: loaded.completeReleaseFileCount,
    };
  }

  const artifactRoot = fromCliPath(input.options.artifactRoot);
  const build = buildRouteInterventionInventory(loaded.buildInput);
  await promoteRouteInterventionInventoryArtifacts({ artifactRoot, build });
  return {
    mode: "export" as const,
    artifactRoot,
    releaseId: build.routeIndex.releaseId,
    publishedAt: build.routeIndex.publishedAt,
    wikiRelease: loaded.wikiRelease,
    wikiManifestSha256: loaded.wikiManifestSha256,
    addressedManifestFileCount: loaded.addressedManifestFileCount,
    completeReleaseFileCount: loaded.completeReleaseFileCount,
    routeBundleCount: build.bundles.length,
    routeCount: build.routeIndex.summary.routeCount,
    checkedEmptyRouteCount: build.routeIndex.summary.checkedEmptyRouteCount,
    totalRouteBundleByteSize: build.routeIndex.summary.totalByteSize,
    facetRowCount: build.facetIndex.summary.rowCount,
    treatmentCount: build.facetIndex.summary.treatmentCount,
    occurrenceCount: build.facetIndex.summary.occurrenceCount,
    routeProjectionFailureCount: build.reconciliation.summary.routeProjectionFailureCount,
    routeIndexKey: routeInterventionInventoryIndexKey(),
    facetIndexKey: interventionFacetIndexKey(),
    reconciliationKey: routeInterventionInventoryReconciliationKey(),
  };
}

const optionsSchema = Schema.Struct({
  ...dbOptions.fields,
  releaseArtifact: Schema.String.annotate({
    description: "Strict Studio release payload path.",
  }),
  interventionCorpus: Schema.String.annotate({
    description: "Strict reviewed Studio intervention corpus path.",
  }),
  routeEvidenceIndex: Schema.String.annotate({
    description: "Strict manifest-v5 route evidence v2 index path.",
  }),
  wikiOccurrences: Schema.String.annotate({
    description: "Strict same-release MTA Wiki operational occurrence v5 artifact path.",
  }),
  mtaWikiRoot: Schema.String.annotate({
    description: "MTA Wiki repository root containing the immutable named release.",
  }),
  artifactRoot: Schema.String.annotate({
    description: "Artifact root for atomic route inventory promotion.",
  }),
  checkVocabulary: arg
    .boolean()
    .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
    .annotate({
      description: "Report exact vocabulary and scope reconciliation without writing outputs.",
    }),
});

export default defineCommand({
  path: ["studio", "export-route-intervention-inventory"],
  summary: "Export exact, lossless per-route intervention inventory artifacts.",
  input: { options: optionsSchema },
  output: Schema.Unknown,
  async run({ input }) {
    const options = input.options;
    const result =
      options.db === undefined
        ? await runExportRouteInterventionInventory({ options })
        : await runLocalDbCommandBoundary({
            dbPath: options.db,
            localDbOptions: { readonly: true },
            command: "studio.export-route-intervention-inventory",
            operation: "runExportRouteInterventionInventory",
            run: (local) => runExportRouteInterventionInventory({ options, local }),
          });
    if (result.mode === "vocabulary_check" && !result.exact) process.exitCode = 1;
    return result;
  },
});
