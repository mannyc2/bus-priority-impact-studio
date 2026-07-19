import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { RouteTreatmentInterventionEventRow } from "@bp/analytics/interventions";
import { decodeStrict } from "@bp/domain/decode";
import {
  type DocumentInterventionRecord,
  DocumentInterventionRecordSchema,
} from "@bp/domain/documents/intervention-records";
import {
  interventionCorpusKey,
  interventionCorpusReconciliationKey,
  type StudioInterventionCorpus,
  type StudioInterventionCorpusReconciliation,
  type StudioInterventionCorpusReconciliationRecord,
  StudioInterventionCorpusReconciliationSchema,
  type StudioInterventionCorpusRecord,
  type StudioInterventionCorpusRegistryEvent,
  StudioInterventionCorpusSchema,
} from "@bp/domain/studio";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { loadRouteTreatmentSummaryLocalDbRows } from "@bp/pipeline-v2/local-db-aggregates";
import { Effect, Result } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, readOptionalJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot, repoRoot } from "../../lib/paths.ts";

const DEFAULT_CORPUS_PATH = fromRepoRoot(
  "data/artifacts/docs/gap-roadmap-docs-2026-05-25/intervention-records-corpus-v3-reviewed-2026-05-27.json",
);
const DEFAULT_CORPUS_SHA256 = "593cb776ffdfb4c95526772757c54ac6bfb60ba2dbe1443f013445e251132d04";
const ANALYSIS_WINDOW_START_MONTH = "2023-04";
const ANALYSIS_WINDOW_END_MONTH = "2026-03";

const ReviewedCorpusEnvelopeSchema = Schema.Struct({
  version: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  generatedAt: Schema.String.check(Schema.isMinLength(1)),
  summary: Schema.Struct({
    recordCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  documentInterventionRecords: Schema.Array(Schema.Unknown).check(Schema.isMaxLength(400)),
});

const SourceMetadataSchema = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(1)),
  sourceUrl: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
});

type ReviewedCorpusEnvelope = typeof ReviewedCorpusEnvelopeSchema.Type;

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function displayLabel(value: string): string {
  const normalized = value.replaceAll("_", " ").replaceAll("-", " ").trim();
  if (normalized.length === 0) return "Bus priority intervention";
  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Stable title: first corridor street (or route) plus the first treatment label. */
export function interventionCorpusRecordTitle(record: DocumentInterventionRecord): string {
  const place = record.corridor?.streets[0] ?? record.routes[0] ?? "Network";
  const treatment = record.primaryTreatments[0] ?? record.customTreatments?.[0];
  return `${place} — ${treatment === undefined ? "Bus priority intervention" : displayLabel(treatment)}`;
}

function effectiveMonth(record: DocumentInterventionRecord): string | null {
  if (
    record.effectiveDate === undefined ||
    record.datePrecision === undefined ||
    record.datePrecision === "year"
  ) {
    return null;
  }
  const match = record.effectiveDate.match(/^(\d{4})-(0[1-9]|1[0-2])/);
  return match === null ? null : `${match[1]}-${match[2]}`;
}

function monthInAnalysisWindow(month: string | null): boolean {
  return (
    month !== null && month >= ANALYSIS_WINDOW_START_MONTH && month <= ANALYSIS_WINDOW_END_MONTH
  );
}

export function projectInterventionCorpusRecord(
  record: DocumentInterventionRecord,
  source: { label: string; url: string | null },
): StudioInterventionCorpusRecord {
  return {
    recordId: record.recordId,
    routes: [...record.routes],
    primaryTreatments: [...record.primaryTreatments],
    customTreatments: [...(record.customTreatments ?? [])],
    title: interventionCorpusRecordTitle(record),
    effectiveDate: record.effectiveDate ?? null,
    datePrecision: record.datePrecision ?? null,
    recordKind: record.recordKind,
    statusLatest: record.statusHistory.at(-1)?.status ?? null,
    corridorStreets: [...(record.corridor?.streets ?? [])],
    // Documentation/display hint only. Study eligibility is built separately
    // from trusted registry events plus manifest-pinned Wiki anchors.
    evaluableInWindow:
      record.recordKind !== "proposed" &&
      record.routes.length > 0 &&
      record.primaryTreatments.length > 0 &&
      monthInAnalysisWindow(effectiveMonth(record)),
    sourceId: record.sourceId,
    sourceLabel: source.label,
    sourceUrl: source.url,
    caveatCount: record.caveats.length,
    matchedRegistryEventIds: [],
  };
}

function decodeRecords(envelope: ReviewedCorpusEnvelope): {
  records: DocumentInterventionRecord[];
  invalidRecordCount: number;
} {
  const decode = Schema.decodeUnknownResult(DocumentInterventionRecordSchema, {
    onExcessProperty: "error",
  });
  const records: DocumentInterventionRecord[] = [];
  let invalidRecordCount = 0;
  for (const value of envelope.documentInterventionRecords) {
    const result = decode(value);
    if (Result.isFailure(result)) {
      invalidRecordCount += 1;
      continue;
    }
    records.push(result.success);
  }
  return { records, invalidRecordCount };
}

async function loadSourceLabels(
  corpusPath: string,
  sourceIds: readonly string[],
): Promise<ReadonlyMap<string, { label: string; url: string | null }>> {
  const sourceRoot = join(dirname(corpusPath), "sources");
  const entries = await Promise.all(
    [...new Set(sourceIds)].toSorted().map(async (sourceId) => {
      const metadata = await readOptionalJsonArtifact(
        join(sourceRoot, sourceId, "metadata.json"),
        SourceMetadataSchema,
      );
      return [
        sourceId,
        {
          label: metadata?.title ?? displayLabel(sourceId),
          url: metadata?.sourceUrl ?? null,
        },
      ] as const;
    }),
  );
  return new Map(entries);
}

function routeJoinKey(routeId: string): string {
  return routeId;
}

const corpusFamilyToRegistryFamilies: Readonly<Record<string, readonly string[]>> = {
  able: ["automated_bus_lane_enforcement"],
  ace: ["automated_bus_lane_enforcement"],
  bus_lane: ["bus_lane_infrastructure"],
  busway: ["busway"],
  off_board_fare_collection: ["select_bus_service"],
  queue_jump: ["queue_jump"],
  red_paint: ["bus_lane_infrastructure"],
  reroute: ["route_redesign_or_service_pattern"],
  signal_retiming: ["transit_signal_priority"],
  stop_consolidation: ["stop_consolidation"],
  stop_relocation: ["route_redesign_or_service_pattern"],
  transit_signal_priority: ["transit_signal_priority"],
};

export function registryTreatmentFamilies(record: StudioInterventionCorpusRecord): string[] {
  const families = new Set<string>();
  for (const treatment of record.primaryTreatments) {
    const mapped = corpusFamilyToRegistryFamilies[treatment];
    if (mapped === undefined) families.add(treatment);
    else for (const family of mapped) families.add(family);
  }
  return [...families].toSorted();
}

function registryEventProjection(
  event: RouteTreatmentInterventionEventRow,
): StudioInterventionCorpusRegistryEvent {
  return {
    eventId: event.event_id,
    routeId: event.route_id,
    treatmentFamily: event.intervention_type,
    implementationMonth: event.implementation_month,
    sourceId: event.source_id,
    program: event.program,
  };
}

function eventsCompatibleWithRecord(
  record: StudioInterventionCorpusRecord,
  events: readonly RouteTreatmentInterventionEventRow[],
): RouteTreatmentInterventionEventRow[] {
  const routes = new Set(record.routes.map(routeJoinKey));
  const families = new Set(registryTreatmentFamilies(record));
  return events.filter(
    (event) => routes.has(routeJoinKey(event.route_id)) && families.has(event.intervention_type),
  );
}

function reconciliationRecord(
  record: StudioInterventionCorpusRecord,
  implementationMonth: string,
  matches: readonly RouteTreatmentInterventionEventRow[],
  conflicts: readonly RouteTreatmentInterventionEventRow[],
  studyReadinessIssues: readonly string[] = [],
): StudioInterventionCorpusReconciliationRecord {
  return {
    recordId: record.recordId,
    routes: [...record.routes],
    treatmentFamilies: registryTreatmentFamilies(record),
    effectiveDate: record.effectiveDate ?? implementationMonth,
    implementationMonth,
    sourceId: record.sourceId,
    sourceLabel: record.sourceLabel,
    title: record.title,
    matchedRegistryEventIds: matches.map((event) => event.event_id).toSorted(),
    conflictingRegistryEventIds: conflicts.map((event) => event.event_id).toSorted(),
    studyReadinessIssues: [...studyReadinessIssues],
  };
}

export function reconcileInterventionCorpus(input: {
  corpus: StudioInterventionCorpus;
  registryEvents: readonly RouteTreatmentInterventionEventRow[];
  generatedAt: string;
}): StudioInterventionCorpusReconciliation {
  const registryEvents = input.registryEvents.filter(
    (event) => event.event_status !== "source_gap",
  );
  const matched: StudioInterventionCorpusReconciliationRecord[] = [];
  const corpusOnlyEvaluable: StudioInterventionCorpusReconciliationRecord[] = [];
  const corpusOnlyPreWindow: StudioInterventionCorpusReconciliationRecord[] = [];
  const corpusOnlyPostWindow: StudioInterventionCorpusReconciliationRecord[] = [];
  const notStudyReady: StudioInterventionCorpusReconciliationRecord[] = [];
  const dateConflicts: StudioInterventionCorpusReconciliationRecord[] = [];
  const matchedRegistryEventIds = new Set<string>();
  let datePrecisionInsufficientCount = 0;

  for (const record of input.corpus.records) {
    const implementationMonth =
      record.datePrecision === "year" || record.effectiveDate === null
        ? null
        : (record.effectiveDate.match(/^(\d{4})-(0[1-9]|1[0-2])/)?.[0] ?? null);
    if (record.effectiveDate !== null && implementationMonth === null) {
      datePrecisionInsufficientCount += 1;
    }
    if (implementationMonth === null) continue;

    const studyReadinessIssues = [
      ...(record.routes.length === 0 ? ["missing_route_id"] : []),
      ...(registryTreatmentFamilies(record).length === 0
        ? ["missing_compatible_treatment_family"]
        : []),
      ...(record.recordKind === "proposed" ? ["proposed_not_implemented"] : []),
    ];
    if (studyReadinessIssues.length > 0) {
      notStudyReady.push(
        reconciliationRecord(record, implementationMonth, [], [], studyReadinessIssues),
      );
      continue;
    }

    const compatible = eventsCompatibleWithRecord(record, registryEvents);
    const exact = compatible.filter((event) => event.implementation_month === implementationMonth);
    const conflicts = compatible.filter(
      (event) => event.implementation_month !== implementationMonth,
    );
    const projected = reconciliationRecord(record, implementationMonth, exact, conflicts);

    if (exact.length > 0) {
      matched.push(projected);
      for (const event of exact) matchedRegistryEventIds.add(event.event_id);
    } else if (conflicts.length > 0) {
      dateConflicts.push(projected);
    } else if (implementationMonth < ANALYSIS_WINDOW_START_MONTH) {
      corpusOnlyPreWindow.push(projected);
    } else if (implementationMonth > ANALYSIS_WINDOW_END_MONTH) {
      corpusOnlyPostWindow.push(projected);
    } else {
      corpusOnlyEvaluable.push(projected);
    }
  }

  const registryOnly = registryEvents
    .filter((event) => !matchedRegistryEventIds.has(event.event_id))
    .map(registryEventProjection)
    .toSorted((left, right) =>
      `${left.routeId}|${left.implementationMonth}|${left.eventId}`.localeCompare(
        `${right.routeId}|${right.implementationMonth}|${right.eventId}`,
      ),
    );
  const datedCorpusRecordCount = input.corpus.records.filter(
    (record) => record.effectiveDate !== null,
  ).length;
  const monthReadyCorpusRecordCount =
    matched.length +
    corpusOnlyEvaluable.length +
    corpusOnlyPreWindow.length +
    corpusOnlyPostWindow.length +
    notStudyReady.length +
    dateConflicts.length;

  return decodeStrict(StudioInterventionCorpusReconciliationSchema)({
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    analysisWindow: {
      startMonth: ANALYSIS_WINDOW_START_MONTH,
      endMonth: ANALYSIS_WINDOW_END_MONTH,
    },
    summary: {
      corpusRecordCount: input.corpus.records.length,
      datedCorpusRecordCount,
      undatedCorpusRecordCount: input.corpus.records.length - datedCorpusRecordCount,
      monthReadyCorpusRecordCount,
      datePrecisionInsufficientCount,
      registryEventCount: registryEvents.length,
      matchedCorpusRecordCount: matched.length,
      corpusOnlyEvaluableCount: corpusOnlyEvaluable.length,
      corpusOnlyPreWindowCount: corpusOnlyPreWindow.length,
      corpusOnlyPostWindowCount: corpusOnlyPostWindow.length,
      notStudyReadyCount: notStudyReady.length,
      registryOnlyCount: registryOnly.length,
      dateConflictCount: dateConflicts.length,
    },
    matched,
    corpusOnlyEvaluable,
    corpusOnlyPreWindow,
    corpusOnlyPostWindow,
    notStudyReady,
    dateConflicts,
    registryOnly,
  });
}

export function interventionCorpusReconciliationMarkdown(
  report: StudioInterventionCorpusReconciliation,
): string {
  const { summary } = report;
  const lines = [
    "# Intervention corpus reconciliation",
    "",
    `Generated: ${report.generatedAt}`,
    `Analysis window: ${report.analysisWindow.startMonth} through ${report.analysisWindow.endMonth}`,
    "",
    "## Counts",
    "",
    `- Corpus records: ${summary.corpusRecordCount}`,
    `- Records with source-stated effective dates: ${summary.datedCorpusRecordCount}`,
    `- Records with month-ready effective dates: ${summary.monthReadyCorpusRecordCount}`,
    `- Undated records retained for documentation: ${summary.undatedCorpusRecordCount}`,
    `- Year-only dates excluded from month matching: ${summary.datePrecisionInsufficientCount}`,
    `- Registry events (source gaps excluded): ${summary.registryEventCount}`,
    `- Exact corpus-to-registry matches: ${summary.matchedCorpusRecordCount}`,
    `- Corpus-only, evaluable in-window: ${summary.corpusOnlyEvaluableCount}`,
    `- Corpus-only, pre-window history: ${summary.corpusOnlyPreWindowCount}`,
    `- Corpus-only, post-window: ${summary.corpusOnlyPostWindowCount}`,
    `- Month-ready records excluded from studies: ${summary.notStudyReadyCount}`,
    `- Corpus records with route/family date conflicts: ${summary.dateConflictCount}`,
    `- Registry-only events: ${summary.registryOnlyCount}`,
    "",
    "Undated proposals remain visible in the serving corpus but are never admitted to study inputs. The study-readiness gate is applied to implemented/in-progress records, because proposals are not expected to have implementation dates.",
    "",
    "Corpus-only rows are documentation and source-coverage findings. They never enter Plan 074 causal inputs; those come only from trusted registry events plus manifest-pinned, locally revalidated Wiki anchors.",
    "",
    "## Corpus-only window-aligned documentation findings (not study inputs)",
    "",
  ];
  if (report.corpusOnlyEvaluable.length === 0) {
    lines.push("None.");
  } else {
    for (const record of report.corpusOnlyEvaluable) {
      lines.push(
        `- ${record.implementationMonth} — ${record.routes.join(", ")} — ${record.title} (${record.sourceLabel}; \`${record.recordId}\`)`,
      );
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function runExportInterventionCorpus(input: {
  corpusPath?: string | undefined;
  artifactRoot?: string | undefined;
  output?: string | undefined;
  reconcileReport?: boolean | undefined;
  reconciliationOutput?: string | undefined;
  reconciliationMarkdownOutput?: string | undefined;
  local?: OpenLocalPipelineDb | undefined;
  generatedAt?: string | undefined;
  expectedCorpusSha256?: string | undefined;
}): Promise<{
  outputPath: string;
  reconciliationOutputPath: string | null;
  reconciliationMarkdownPath: string | null;
  sourceRecordCount: number;
  recordCount: number;
  invalidRecordCount: number;
  studyRelevantRecordCount: number;
  studyDateReadyRecordCount: number;
  corpusOnlyEvaluableCount: number;
}> {
  const corpusPath = input.corpusPath ?? DEFAULT_CORPUS_PATH;
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const outputPath = input.output ?? join(artifactRoot, interventionCorpusKey());
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const corpusBytes = await readFile(corpusPath);
  const corpusSha256 = createHash("sha256").update(corpusBytes).digest("hex");
  const expectedCorpusSha256 =
    input.expectedCorpusSha256 ??
    (resolve(corpusPath) === resolve(DEFAULT_CORPUS_PATH) ? DEFAULT_CORPUS_SHA256 : undefined);
  if (
    expectedCorpusSha256 !== undefined &&
    (!/^[a-f0-9]{64}$/u.test(expectedCorpusSha256) || corpusSha256 !== expectedCorpusSha256)
  ) {
    throw new Error(
      `Reviewed intervention corpus SHA-256 mismatch: expected ${expectedCorpusSha256}, received ${corpusSha256}.`,
    );
  }
  const envelope = await readJsonArtifact(corpusPath, ReviewedCorpusEnvelopeSchema, "strip");
  if (envelope.summary.recordCount !== envelope.documentInterventionRecords.length) {
    throw new Error(
      `Reviewed intervention corpus count mismatch: summary declares ${envelope.summary.recordCount}, array contains ${envelope.documentInterventionRecords.length}.`,
    );
  }
  const { records, invalidRecordCount } = decodeRecords(envelope);
  if (invalidRecordCount > 0) {
    throw new Error(
      `Reviewed intervention corpus validation failed: ${invalidRecordCount}/${envelope.documentInterventionRecords.length} records invalid; zero row loss is permitted.`,
    );
  }
  const recordIds = records.map((record) => record.recordId);
  if (new Set(recordIds).size !== recordIds.length) {
    throw new Error("Reviewed intervention corpus contains duplicate recordId values.");
  }

  const studyRelevantRecords = records.filter((record) => record.recordKind !== "proposed");
  const studyDateReadyRecords = studyRelevantRecords.filter(
    (record) => effectiveMonth(record) !== null,
  );

  const sourceLabels = await loadSourceLabels(
    corpusPath,
    records.map((record) => record.sourceId),
  );
  let corpus = decodeStrict(StudioInterventionCorpusSchema)({
    schemaVersion: 1,
    generatedAt,
    sourceCorpus: {
      path: repoDisplayPath(corpusPath),
      version: envelope.version,
      generatedAt: envelope.generatedAt,
      recordCount: envelope.summary.recordCount,
      sha256: corpusSha256,
    },
    records: records.map((record) =>
      projectInterventionCorpusRecord(
        record,
        sourceLabels.get(record.sourceId) ?? {
          label: displayLabel(record.sourceId),
          url: null,
        },
      ),
    ),
  });
  let reconciliationOutputPath: string | null = null;
  let reconciliationMarkdownPath: string | null = null;
  let corpusOnlyEvaluableCount = 0;
  if (input.reconcileReport === true) {
    if (input.local === undefined) {
      throw new Error("--reconcile-report requires the local pipeline database.");
    }
    const registryEvents = loadRouteTreatmentSummaryLocalDbRows({
      sqlite: input.local.sqlite,
      month: ANALYSIS_WINDOW_END_MONTH,
    }).interventionEventRows;
    const report = reconcileInterventionCorpus({ corpus, registryEvents, generatedAt });
    const matchesByRecordId = new Map(
      report.matched.map((record) => [record.recordId, record.matchedRegistryEventIds] as const),
    );
    corpus = decodeStrict(StudioInterventionCorpusSchema)({
      ...corpus,
      records: corpus.records.map((record) => ({
        ...record,
        matchedRegistryEventIds: [...(matchesByRecordId.get(record.recordId) ?? [])],
      })),
    });
    reconciliationOutputPath =
      input.reconciliationOutput ?? join(artifactRoot, interventionCorpusReconciliationKey());
    reconciliationMarkdownPath =
      input.reconciliationMarkdownOutput ??
      join(dirname(reconciliationOutputPath), "corpus-reconciliation.md");
    await mkdir(dirname(reconciliationOutputPath), { recursive: true });
    await mkdir(dirname(reconciliationMarkdownPath), { recursive: true });
    await writeJson(reconciliationOutputPath, report);
    await Bun.write(reconciliationMarkdownPath, interventionCorpusReconciliationMarkdown(report));
    corpusOnlyEvaluableCount = report.summary.corpusOnlyEvaluableCount;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, corpus);

  return {
    outputPath: repoDisplayPath(outputPath),
    reconciliationOutputPath:
      reconciliationOutputPath === null ? null : repoDisplayPath(reconciliationOutputPath),
    reconciliationMarkdownPath:
      reconciliationMarkdownPath === null ? null : repoDisplayPath(reconciliationMarkdownPath),
    sourceRecordCount: envelope.documentInterventionRecords.length,
    recordCount: corpus.records.length,
    invalidRecordCount,
    studyRelevantRecordCount: studyRelevantRecords.length,
    studyDateReadyRecordCount: studyDateReadyRecords.length,
    corpusOnlyEvaluableCount,
  };
}

export default defineCommand({
  path: ["studio", "export-intervention-corpus"],
  summary:
    "Project the reviewed intervention corpus and optionally reconcile it to registry events.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        corpus: Schema.String.pipe(
          Schema.withDecodingDefaultTypeKey(Effect.succeed(repoDisplayPath(DEFAULT_CORPUS_PATH))),
        ).annotate({ description: "Reviewed intervention corpus JSON path" }),
        expectedCorpusSha256: Schema.optionalKey(
          Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
        ).annotate({ description: "Optional exact SHA-256 pin for a custom reviewed corpus" }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        output: Schema.optionalKey(Schema.String).annotate({
          description: "Override serving-corpus output path",
        }),
        reconcileReport: arg
          .boolean()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
          .annotate({ description: "Write JSON and Markdown reconciliation reports" }),
        reconciliationOutput: Schema.optionalKey(Schema.String).annotate({
          description: "Override reconciliation JSON output path",
        }),
        reconciliationMarkdownOutput: Schema.optionalKey(Schema.String).annotate({
          description: "Override reconciliation Markdown output path",
        }),
      },
    }),
  },
  output: Schema.Struct({
    outputPath: Schema.String,
    reconciliationOutputPath: Schema.NullOr(Schema.String),
    reconciliationMarkdownPath: Schema.NullOr(Schema.String),
    sourceRecordCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    recordCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    invalidRecordCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    studyRelevantRecordCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    studyDateReadyRecordCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    corpusOnlyEvaluableCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  async run({ input }) {
    const options = input.options;
    const run = (local?: OpenLocalPipelineDb) =>
      runExportInterventionCorpus({
        corpusPath: fromCliPath(options.corpus),
        expectedCorpusSha256: options.expectedCorpusSha256,
        artifactRoot:
          options.artifactRoot === undefined ? undefined : fromCliPath(options.artifactRoot),
        output: options.output === undefined ? undefined : fromCliPath(options.output),
        reconcileReport: options.reconcileReport,
        reconciliationOutput:
          options.reconciliationOutput === undefined
            ? undefined
            : fromCliPath(options.reconciliationOutput),
        reconciliationMarkdownOutput:
          options.reconciliationMarkdownOutput === undefined
            ? undefined
            : fromCliPath(options.reconciliationMarkdownOutput),
        local,
      });
    if (!options.reconcileReport) return run();
    return runLocalDbCommandBoundary({
      dbPath: options.db,
      command: "studio.export-intervention-corpus",
      operation: "runExportInterventionCorpus",
      run,
    });
  },
});
