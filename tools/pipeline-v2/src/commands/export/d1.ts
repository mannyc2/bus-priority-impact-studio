import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildD1AppendixSeedSql,
  buildD1SeedSql,
  buildPlan097RecoverySeedSql,
} from "@bp/db/d1/seed";
import { decodeStrict } from "@bp/domain/decode";
import { StudioRouteEvidenceIndexV2Schema } from "@bp/domain/studio";
import {
  type ReleaseIdentity,
  ReleaseIdentitySchema,
  releaseIdFromPublishedAt,
} from "@bp/domain/studio/shared";
import { STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY } from "@bp/domain/studio/snapshots";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { type CloudflareCostSummary, estimateD1PaidCost } from "../../lib/cloudflare-costs.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, defaultExportRootPath, fromCliPath } from "../../lib/paths.ts";
import { buildExactRouteIndexRecovery } from "../../lib/route-index-v3-recovery.ts";
import {
  type D1AppendixInputs,
  type D1CanonicalInputs,
  readLocalD1AppendixInputs,
  readLocalD1Inputs,
} from "./d1-inputs.ts";
import { readD1MigrationSql } from "./d1-migrations.ts";
import {
  buildAndWriteRouteCapabilityManifest,
  readDetectorReadinessRouteSummaries,
} from "./route-capability-manifest.ts";
import { buildAndWriteRouteDossierSummaries } from "./route-dossier-summaries.ts";

type D1FileContract = {
  path: string;
  byteLength: number;
  sha256: string;
};

export type D1ExactRouteIdentityOutput = {
  registrationFile: D1FileContract;
  receiptFile: D1FileContract;
  exactRouteCount: number;
  routeTypeCount: number;
  tripTypeCount: number;
  catalogSnapshotSha256: string;
  projectionSha256: string;
  sourceIndexSha256: string;
};

type D1SqlFileCostFacts = {
  path: string;
  byteLength: number;
  statementCount: number;
  insertStatementCount: number;
  deleteStatementCount: number;
  updateStatementCount: number;
  ddlStatementCount: number;
};

type D1ExportCostEstimate = {
  schemaVersion: 1;
  operation: "d1-seed-export";
  exactRowsWrittenKnownBeforeExecution: false;
  seedSql: D1SqlFileCostFacts;
  schemaSql: D1SqlFileCostFacts;
  usageEstimate: {
    freshRowsWrittenLowerBound: number;
    replacementRowsWrittenEstimate: number;
    indexedRowsWrittenEstimate: number;
    replacementIndexedRowsWrittenEstimate: number;
    freeDailyRowsWrittenLimit: number;
    freshWithinWorkersFreeDailyLimit: boolean;
    replacementIndexedWithinWorkersFreeDailyLimit: boolean;
  };
  paidPlanCost: {
    fresh: CloudflareCostSummary;
    replacement: CloudflareCostSummary;
    replacementIndexed: CloudflareCostSummary;
  };
  notes: string[];
};

export type D1SeedOutputResult = {
  schemaVersion: number;
  releaseId: string;
  publishedAt: string;
  coverage: ReleaseIdentity["coverage"];
  generatedAt: string;
  summaryPath: string;
  schemaPath: string;
  seedPath: string;
  plan097RecoverySeedPath: string;
  schemaFile: D1FileContract;
  seedFile: D1FileContract;
  plan097RecoverySeedFile: D1FileContract;
  costEstimate: D1ExportCostEstimate;
  routeCount: number;
  comparisonRowCount: number;
  routeCatalogRowCount: number;
  routeCatalogTypeRowCount: number;
  routeCatalogTripTypeRowCount: number;
  routeDirectionRowCount: number;
  routeCoverageRowCount: number;
  routeReadinessRowCount: number;
  routeReadinessMissingInputRowCount: number;
  routeBuildPlanRowCount: number;
  routeReliabilityBaselineRowCount: number;
  routeReliabilityGapWindowRowCount: number;
  routeObservedReliabilitySummaryRowCount: number;
  interventionEventRowCount: number;
  routeInterventionComparisonRowCount: number;
  routeArtifactRowCount: number;
  corridorRowCount: number;
  corridorArtifactRowCount: number;
  corridorRouteMemberRowCount: number;
  corridorMonthSummaryRowCount: number;
  corridorInterventionContextRowCount: number;
  corridorHotspotRowCount: number;
  routeMonthSourceStatusRowCount: number;
  routeMonthTrendRowCount: number;
  routeTimelineIndexRowCount: number;
  routeEquityContextRowCount: number;
  routeBatchStatusRowCount: number;
  routeBatchBuiltRouteRowCount: number;
  routeBatchIssueRowCount: number;
  routeBriefPeakWindowRowCount: number;
  routeBriefSlowestWindowRowCount: number;
  routeScorecardCitationRowCount: number;
  routeSpeedHistoryCoverageRowCount: number;
  sourceMonthCoverageRowCount: number;
  detectorReadinessManifestAvailable: boolean;
  routeCapabilityManifestRouteCount: number;
  routeDossierSummaryRouteCount: number;
  exactRouteIdentity: D1ExactRouteIdentityOutput | null;
};

export function earliestRouteTrendMonth(d1Inputs: {
  readonly routeMonthTrends: readonly { readonly month: string }[];
}): string | null {
  let earliest: string | null = null;
  for (const trend of d1Inputs.routeMonthTrends) {
    if (earliest === null || trend.month < earliest) earliest = trend.month;
  }
  return earliest;
}

export type D1AppendixSeedOutputResult = {
  schemaVersion: number;
  isoMonth: string;
  mode: "appendix";
  generatedAt: string;
  summaryPath: string;
  seedPath: string;
  seedFile: D1FileContract;
  costEstimate: D1ExportCostEstimate;
  routeObservedReliabilitySummaryRowCount: number;
  routeMonthSourceStatusRowCount: number;
};

type ExportD1CommandResult = D1SeedOutputResult | D1AppendixSeedOutputResult;

function fileContract(path: string, content: string): D1FileContract {
  const bytes = new TextEncoder().encode(content);
  return {
    path,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function stageDetectorReadinessManifest(input: {
  manifestPath?: string | undefined;
  artifactRoot: string;
}): Promise<void> {
  if (input.manifestPath === undefined) return;
  const file = Bun.file(input.manifestPath);
  if (!(await file.exists())) return;
  const outputPath = join(input.artifactRoot, STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY);
  await mkdir(dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, await file.text());
}

function countMatches(sql: string, pattern: RegExp): number {
  return sql.match(pattern)?.length ?? 0;
}

function countStatements(sql: string): number {
  return sql
    .split(/;|-->\s*statement-breakpoint/g)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith("-->")).length;
}

function sqlCostFacts(path: string, content: string): D1SqlFileCostFacts {
  return {
    path,
    byteLength: new TextEncoder().encode(content).byteLength,
    statementCount: countStatements(content),
    insertStatementCount: countMatches(content, /\binsert\s+into\b/gi),
    deleteStatementCount: countMatches(content, /\bdelete\s+from\b/gi),
    updateStatementCount: countMatches(content, /\bupdate\b/gi),
    ddlStatementCount: countMatches(content, /\b(create|alter|drop)\s+(table|index)\b/gi),
  };
}

export function estimateD1ExportCost(input: {
  seedPath: string;
  seedSql: string;
  schemaPath: string;
  schemaSql: string;
}): D1ExportCostEstimate {
  const seedSql = sqlCostFacts(input.seedPath, input.seedSql);
  const schemaSql = sqlCostFacts(input.schemaPath, input.schemaSql);
  const freshRowsWrittenLowerBound = seedSql.insertStatementCount + seedSql.updateStatementCount;
  const replacementRowsWrittenEstimate =
    freshRowsWrittenLowerBound +
    (seedSql.deleteStatementCount > 0 ? freshRowsWrittenLowerBound : 0);
  const indexedRowsWrittenEstimate = freshRowsWrittenLowerBound * 2;
  const replacementIndexedRowsWrittenEstimate = replacementRowsWrittenEstimate * 2;
  const freeDailyRowsWrittenLimit = 100_000;

  return {
    schemaVersion: 1,
    operation: "d1-seed-export",
    exactRowsWrittenKnownBeforeExecution: false,
    seedSql,
    schemaSql,
    usageEstimate: {
      freshRowsWrittenLowerBound,
      replacementRowsWrittenEstimate,
      indexedRowsWrittenEstimate,
      replacementIndexedRowsWrittenEstimate,
      freeDailyRowsWrittenLimit,
      freshWithinWorkersFreeDailyLimit: freshRowsWrittenLowerBound <= freeDailyRowsWrittenLimit,
      replacementIndexedWithinWorkersFreeDailyLimit:
        replacementIndexedRowsWrittenEstimate <= freeDailyRowsWrittenLimit,
    },
    paidPlanCost: {
      fresh: estimateD1PaidCost({ rowsWritten: freshRowsWrittenLowerBound }, [
        "Fresh estimate counts seed INSERT/UPDATE statements and excludes scoped DELETE statements that may affect zero existing rows on first publish.",
      ]),
      replacement: estimateD1PaidCost({ rowsWritten: replacementRowsWrittenEstimate }, [
        "Replacement estimate assumes scoped DELETE statements remove roughly the same number of rows the seed inserts.",
      ]),
      replacementIndexed: estimateD1PaidCost(
        { rowsWritten: replacementIndexedRowsWrittenEstimate },
        [
          "Replacement indexed estimate doubles the replacement estimate to account for primary-key/index maintenance. Cloudflare rows_written metrics are authoritative after remote execution.",
        ],
      ),
    },
    notes: [
      "D1 export cost estimates are pre-execution estimates. Wrangler output, D1 query metadata, Cloudflare GraphQL analytics, or the dashboard are authoritative after publish.",
      "DDL/schema execution may contribute a mix of reads and writes; schema statement counts are recorded here, but seed write estimates drive release-publish cost.",
      "Workers Free has a 100k rows-written daily limit. Workers Paid includes monthly D1 rows-written allowance before paid overage.",
    ],
  };
}

export type ExportD1Inputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  publishedAt: string;
  releaseIdentity?: ReleaseIdentity | undefined;
  exportRoot?: string | undefined;
  artifactRoot?: string | undefined;
  routeTimelineProjectionPath?: string | undefined;
  detectorReadinessManifestPath?: string | undefined;
  routeEvidenceIndexPath?: string | undefined;
  inputs?: D1CanonicalInputs | undefined;
};

export async function runExportD1Seed(inputs: ExportD1Inputs): Promise<D1SeedOutputResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const exportDir = join(inputs.exportRoot ?? defaultExportRootPath(), "d1", month);
  const summaryPath = join(exportDir, "export-summary.json");
  const schemaPath = join(exportDir, "schema.sql");
  const seedPath = join(exportDir, "seed.sql");
  const plan097RecoverySeedPath = join(exportDir, "seed.plan097-recovery.sql");
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();

  await stageDetectorReadinessManifest({
    manifestPath: inputs.detectorReadinessManifestPath,
    artifactRoot,
  });

  let d1Inputs =
    inputs.inputs ??
    (await readLocalD1Inputs(inputs.local.db, month, {
      sqlite: inputs.local.sqlite,
      artifactRoot,
      routeTimelineProjectionPath: inputs.routeTimelineProjectionPath,
      detectorReadinessManifestPath: inputs.detectorReadinessManifestPath,
      routeEvidenceIndexPath: inputs.routeEvidenceIndexPath,
    }));
  const generatedAt = inputs.publishedAt;
  const releaseIdentity = decodeStrict(ReleaseIdentitySchema)(
    inputs.releaseIdentity ?? {
      releaseId: releaseIdFromPublishedAt(inputs.publishedAt),
      publishedAt: inputs.publishedAt,
      coverage: { start: earliestRouteTrendMonth(d1Inputs), end: month },
    },
  );
  if (
    releaseIdentity.publishedAt !== inputs.publishedAt ||
    releaseIdentity.coverage.end !== month
  ) {
    throw new Error("D1 export release identity does not match its publication inputs");
  }
  const routeEvidenceIndexPath =
    inputs.routeEvidenceIndexPath ?? join(artifactRoot, "studio", "v2", "wiki", "index.json");
  const routeEvidenceIndexFile = Bun.file(routeEvidenceIndexPath);
  let exactRouteIdentity: {
    output: D1ExactRouteIdentityOutput;
    registrationSql: string;
    receiptText: string;
  } | null = null;
  if (await routeEvidenceIndexFile.exists()) {
    const routeEvidenceIndexBytes = new Uint8Array(await routeEvidenceIndexFile.arrayBuffer());
    const routeEvidenceIndexValue: unknown = JSON.parse(
      new TextDecoder().decode(routeEvidenceIndexBytes),
    );
    const routeEvidenceIndexRecord =
      typeof routeEvidenceIndexValue === "object" && routeEvidenceIndexValue !== null
        ? (routeEvidenceIndexValue as {
            artifactKind?: unknown;
            schemaVersion?: unknown;
          })
        : null;
    const isExactIndex =
      routeEvidenceIndexRecord?.artifactKind === "bp.studio.route_evidence_index.v2" &&
      routeEvidenceIndexRecord.schemaVersion === 2;
    if (!isExactIndex) {
      exactRouteIdentity = null;
    } else {
      const routeEvidenceIndex = decodeStrict(StudioRouteEvidenceIndexV2Schema)(
        routeEvidenceIndexValue,
      );
      const sourceIndexSha256 = createHash("sha256").update(routeEvidenceIndexBytes).digest("hex");
      const exact = buildExactRouteIndexRecovery({
        routeEvidenceIndex,
        routeEvidenceIndexSha256: sourceIndexSha256,
        routeEvidenceIndexBytes: routeEvidenceIndexBytes.byteLength,
        catalogRows: d1Inputs.routeCatalog.map((route) => ({
          routeId: route.routeId,
          routeShortName: route.routeShortName,
          routeLongName: route.routeLongName,
        })),
        routeTypeRows: d1Inputs.routeCatalog.flatMap((route) =>
          route.routeTypes.map((routeType, index) => ({
            routeId: route.routeId,
            typeRank: index + 1,
            routeType,
          })),
        ),
        servingRelease: releaseIdentity,
        preparedAt: generatedAt,
        expectedSource: {
          wikiRelease: routeEvidenceIndex.source.wikiRelease,
          manifestSha256: routeEvidenceIndex.source.manifestSha256,
          routeIdentitySha256: routeEvidenceIndex.source.routeIdentitySha256,
          currentBusRoutesSha256: routeEvidenceIndex.source.catalogParity.currentBusRoutesSha256,
          routeEvidenceIndexSha256: sourceIndexSha256,
          routeEvidenceIndexBytes: routeEvidenceIndexBytes.byteLength,
        },
      });
      const registrationPath = join(exportDir, "exact-route-identity-registration.sql");
      const receiptPath = join(exportDir, "exact-route-identity-receipt.json");
      exactRouteIdentity = {
        output: {
          registrationFile: fileContract(registrationPath, exact.registrationSql),
          receiptFile: fileContract(receiptPath, exact.receiptText),
          exactRouteCount: exact.receipt.counts.exactRouteCount,
          routeTypeCount: exact.receipt.counts.exactRouteTypeCount,
          tripTypeCount: exact.receipt.counts.exactTripTypeCount,
          catalogSnapshotSha256: exact.receipt.catalogSnapshotSha256,
          projectionSha256: exact.receipt.projectionSha256,
          sourceIndexSha256,
        },
        registrationSql: exact.registrationSql,
        receiptText: exact.receiptText,
      };
      const tripTypesByRouteId = new Map<string, string[]>();
      for (const row of exact.tripTypeRows) {
        const tripTypes = tripTypesByRouteId.get(row.routeId) ?? [];
        tripTypes.push(row.tripType);
        tripTypesByRouteId.set(row.routeId, tripTypes);
      }
      d1Inputs = {
        ...d1Inputs,
        routeCatalog: d1Inputs.routeCatalog.map((route) => ({
          ...route,
          tripTypes: tripTypesByRouteId.get(route.routeId) ?? [],
        })),
      };
    }
  }

  const schemaSql = await readD1MigrationSql();
  const seed = buildD1SeedSql({ month, ...d1Inputs });
  const plan097RecoverySeed = buildPlan097RecoverySeedSql({ month, ...d1Inputs });

  const readinessSummaries = await readDetectorReadinessRouteSummaries({
    manifestPath: inputs.detectorReadinessManifestPath,
    month,
  });
  const capabilityManifest = await buildAndWriteRouteCapabilityManifest({
    d1Inputs,
    readinessSummaries,
    artifactRoot,
    ...releaseIdentity,
    generatedAt,
  });
  const dossierSummaries = await buildAndWriteRouteDossierSummaries({
    d1Inputs,
    artifactRoot,
    ...releaseIdentity,
    generatedAt,
  });

  const result: D1SeedOutputResult = {
    schemaVersion: 2,
    ...releaseIdentity,
    generatedAt,
    summaryPath,
    schemaPath,
    seedPath,
    plan097RecoverySeedPath,
    schemaFile: fileContract(schemaPath, schemaSql),
    seedFile: fileContract(seedPath, seed.seedSql),
    plan097RecoverySeedFile: fileContract(plan097RecoverySeedPath, plan097RecoverySeed.seedSql),
    costEstimate: estimateD1ExportCost({
      seedPath,
      seedSql: seed.seedSql,
      schemaPath,
      schemaSql,
    }),
    routeCount: seed.routeCount,
    comparisonRowCount: seed.comparisonRowCount,
    routeCatalogRowCount: seed.routeCatalogRowCount,
    routeCatalogTypeRowCount: seed.routeCatalogTypeRowCount,
    routeCatalogTripTypeRowCount: seed.routeCatalogTripTypeRowCount,
    routeDirectionRowCount: seed.routeDirectionRowCount,
    routeCoverageRowCount: seed.routeCoverageRowCount,
    routeReadinessRowCount: seed.routeReadinessRowCount,
    routeReadinessMissingInputRowCount: seed.routeReadinessMissingInputRowCount,
    routeBuildPlanRowCount: seed.routeBuildPlanRowCount,
    routeReliabilityBaselineRowCount: seed.routeReliabilityBaselineRowCount,
    routeReliabilityGapWindowRowCount: seed.routeReliabilityGapWindowRowCount,
    routeObservedReliabilitySummaryRowCount: seed.routeObservedReliabilitySummaryRowCount,
    interventionEventRowCount: seed.interventionEventRowCount,
    routeInterventionComparisonRowCount: seed.routeInterventionComparisonRowCount,
    routeArtifactRowCount: seed.routeArtifactRowCount,
    corridorRowCount: seed.corridorRowCount,
    corridorArtifactRowCount: seed.corridorArtifactRowCount,
    corridorRouteMemberRowCount: seed.corridorRouteMemberRowCount,
    corridorMonthSummaryRowCount: seed.corridorMonthSummaryRowCount,
    corridorInterventionContextRowCount: seed.corridorInterventionContextRowCount,
    corridorHotspotRowCount: seed.corridorHotspotRowCount,
    routeMonthSourceStatusRowCount: seed.routeMonthSourceStatusRowCount,
    routeMonthTrendRowCount: seed.routeMonthTrendRowCount,
    routeTimelineIndexRowCount: seed.routeTimelineIndexRowCount,
    routeEquityContextRowCount: seed.routeEquityContextRowCount,
    routeBatchStatusRowCount: seed.routeBatchStatusRowCount,
    routeBatchBuiltRouteRowCount: seed.routeBatchBuiltRouteRowCount,
    routeBatchIssueRowCount: seed.routeBatchIssueRowCount,
    routeBriefPeakWindowRowCount: seed.routeBriefPeakWindowRowCount,
    routeBriefSlowestWindowRowCount: seed.routeBriefSlowestWindowRowCount,
    routeScorecardCitationRowCount: seed.routeScorecardCitationRowCount,
    routeSpeedHistoryCoverageRowCount: seed.routeSpeedHistoryCoverageRowCount,
    sourceMonthCoverageRowCount: seed.sourceMonthCoverageRowCount,
    detectorReadinessManifestAvailable: d1Inputs.detectorReadinessManifestAvailable,
    routeCapabilityManifestRouteCount: capabilityManifest.routeCount,
    routeDossierSummaryRouteCount: dossierSummaries.routeCount,
    exactRouteIdentity: exactRouteIdentity?.output ?? null,
  };

  await mkdir(exportDir, { recursive: true });
  await Promise.all([
    Bun.write(schemaPath, schemaSql),
    Bun.write(seedPath, seed.seedSql),
    Bun.write(plan097RecoverySeedPath, plan097RecoverySeed.seedSql),
    Bun.write(summaryPath, `${JSON.stringify(result, null, 2)}\n`),
    ...(exactRouteIdentity === null
      ? []
      : [
          Bun.write(
            exactRouteIdentity.output.registrationFile.path,
            exactRouteIdentity.registrationSql,
          ),
          Bun.write(exactRouteIdentity.output.receiptFile.path, exactRouteIdentity.receiptText),
        ]),
  ]);
  return result;
}

export type ExportD1AppendixInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  exportRoot?: string | undefined;
  inputs?: D1AppendixInputs | undefined;
};

export async function runExportD1AppendixSeed(
  inputs: ExportD1AppendixInputs,
): Promise<D1AppendixSeedOutputResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const exportDir = join(inputs.exportRoot ?? defaultExportRootPath(), "d1", month);
  const summaryPath = join(exportDir, "appendix-summary.json");
  const seedPath = join(exportDir, "seed.appendix.sql");
  const d1Inputs = inputs.inputs ?? (await readLocalD1AppendixInputs(inputs.local.db, month));
  const seed = buildD1AppendixSeedSql({ month, ...d1Inputs });
  const generatedAt = new Date().toISOString();

  const result: D1AppendixSeedOutputResult = {
    schemaVersion: 1,
    isoMonth: month,
    mode: "appendix",
    generatedAt,
    summaryPath,
    seedPath,
    seedFile: fileContract(seedPath, seed.seedSql),
    costEstimate: estimateD1ExportCost({
      seedPath,
      seedSql: seed.seedSql,
      schemaPath: join(exportDir, "schema.sql"),
      schemaSql: "",
    }),
    routeObservedReliabilitySummaryRowCount: seed.routeObservedReliabilitySummaryRowCount,
    routeMonthSourceStatusRowCount: seed.routeMonthSourceStatusRowCount,
  };

  await mkdir(exportDir, { recursive: true });
  await Promise.all([
    Bun.write(seedPath, seed.seedSql),
    Bun.write(summaryPath, `${JSON.stringify(result, null, 2)}\n`),
  ]);
  return result;
}

export default defineCommand({
  path: ["export", "d1"],
  summary: "Export D1 schema and seed SQL for a given month.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Calendar year" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Calendar month, 1-12" }),
        mode: Schema.Literals(["canonical", "appendix"])
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("canonical")))
          .annotate({ description: "Canonical full export or observed-reliability appendix" }),
        exportRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override export root directory",
        }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override generated artifact root directory",
        }),
        routeTimelineProjectionPath: Schema.optionalKey(Schema.String).annotate({
          description:
            "Optional route timeline serving projection JSON to fold into D1 seed output",
        }),
        detectorReadinessManifestPath: Schema.optionalKey(Schema.String).annotate({
          description:
            "Optional detector readiness serving manifest JSON to fold into D1 route artifact refs",
        }),
        routeEvidenceIndexPath: Schema.optionalKey(Schema.String).annotate({
          description:
            "Optional MTA-wiki route evidence index JSON to fold into D1 route artifact refs",
        }),
      },
    }),
  },
  output: Schema.Union([
    Schema.Struct({ mode: Schema.Literal("appendix") }),
    Schema.Struct({ schemaPath: Schema.String }),
  ]),
  async run({ input }) {
    const publishedAt = new Date().toISOString();
    const exportRoot =
      input.options.exportRoot === undefined ? undefined : fromCliPath(input.options.exportRoot);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? undefined
        : fromCliPath(input.options.artifactRoot);
    const routeTimelineProjectionPath =
      input.options.routeTimelineProjectionPath === undefined
        ? undefined
        : fromCliPath(input.options.routeTimelineProjectionPath);
    const detectorReadinessManifestPath =
      input.options.detectorReadinessManifestPath === undefined
        ? undefined
        : fromCliPath(input.options.detectorReadinessManifestPath);
    const routeEvidenceIndexPath =
      input.options.routeEvidenceIndexPath === undefined
        ? undefined
        : fromCliPath(input.options.routeEvidenceIndexPath);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "export.d1",
      operation: input.options.mode === "appendix" ? "runExportD1AppendixSeed" : "runExportD1Seed",
      spanAttributes: {
        year: input.options.year,
        month: input.options.month,
        mode: input.options.mode,
      },
      run: async (local): Promise<ExportD1CommandResult> => {
        if (input.options.mode === "appendix") {
          return runExportD1AppendixSeed({
            local,
            year: input.options.year,
            month: input.options.month,
            exportRoot,
          });
        }
        return runExportD1Seed({
          local,
          year: input.options.year,
          month: input.options.month,
          publishedAt,
          exportRoot,
          artifactRoot,
          routeTimelineProjectionPath,
          detectorReadinessManifestPath,
          routeEvidenceIndexPath,
        });
      },
    });
  },
});
