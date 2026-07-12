import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  computeCausalAnchorEligibility,
  isRealizedOperationalLifecyclePhase,
  OperationalAnchorConflictStateSchema,
  OperationalAnchorExclusionReasonSchema,
  OperationalAnchorScopeResolutionSchema,
  OperationalAnchorSourceAuthoritySchema,
  type OperationalDateBasis,
  type OperationalDateValidationState,
  operationalDateConfidence,
  parseOperationalDate,
  type SourceStatedStatus,
  type WikiOperationalDateAssertion,
  WikiOperationalDateAssertionSchema,
} from "@bp/domain/documents/operational-date";
import { Effect, Schema } from "effect";
import { PipelineFileSystemLayer, PipelineFileSystemService } from "../effect/file-system.ts";
import { runPipelineEffect } from "../effect/runtime.ts";

const COMMAND = "studio.import-mta-wiki-operational-anchors";
const MANIFEST_VERSION = 2;
const OPERATIONAL_ANCHOR_CONTRACT_VERSION = 1;
const OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION = 1;
const OPERATIONAL_ANCHOR_REVIEW_DECISION_VERSION = 1;

const NonNegativeIntegerSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const PositiveIntegerSchema = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const StringCountSchema = Schema.Record(Schema.String, NonNegativeIntegerSchema);

const ReleaseFileSchema = Schema.Struct({
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});

const ReleaseManifestSchema = Schema.Struct({
  manifest_version: Schema.Literal(MANIFEST_VERSION),
  release_id: Schema.String,
  generator_commit: Schema.String,
  contract_versions: Schema.Struct({
    operational_anchors: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
    operational_anchor_review_decisions: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION),
  }),
  record_counts: StringCountSchema,
  files: Schema.Record(Schema.String, ReleaseFileSchema),
  pointers: Schema.Struct({
    operational_anchors: Schema.String,
    operational_anchor_summary: Schema.String,
    operational_anchor_review_decisions: Schema.String,
    route_anchors: Schema.NullOr(Schema.String),
    taxonomy: Schema.NullOr(Schema.String),
    quality_report: Schema.NullOr(Schema.String),
  }),
});
type ReleaseManifest = typeof ReleaseManifestSchema.Type;
type ReleaseFile = typeof ReleaseFileSchema.Type;

const OperationalAnchorDateCandidateSchema = Schema.Struct({
  source_field: Schema.String,
  raw: Schema.String,
  normalized: Schema.String,
  precision: Schema.String,
  origin: Schema.Literals([
    "canonical_scalar",
    "merged_field",
    "normalized_companion",
    "payload_field",
  ]),
});

const OperationalAnchorEvidenceRefSchema = Schema.Struct({
  record_id: Schema.String,
  source_id: Schema.String,
  evidence_id: Schema.NullOr(Schema.String),
  block_id: Schema.NullOr(Schema.String),
  page_number: Schema.NullOr(PositiveIntegerSchema),
  text_sha256: Schema.NullOr(Sha256Schema),
  role: Schema.Literals(["event", "route_scope", "timeline_relation", "treatment_scope"]),
});

const OperationalAnchorEvidenceCoverageSchema = Schema.Struct({
  event: Schema.Boolean,
  timeline: Schema.Boolean,
  route_scope: Schema.Boolean,
  treatment_scope: Schema.Boolean,
});

const OperationalAnchorRowSchema = Schema.Struct({
  schema_version: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
  anchor_id: Schema.String,
  operational_change_id: Schema.String,
  event_record_id: Schema.String,
  timeline_relation_record_ids: Schema.Array(Schema.String),
  project_record_ids: Schema.Array(Schema.String),
  subject_record_ids: Schema.Array(Schema.String),
  subject_record_kinds: Schema.Array(Schema.String),
  route_record_ids: Schema.Array(Schema.String),
  unmatched_route_record_ids: Schema.Array(Schema.String),
  gtfs_route_ids: Schema.Array(Schema.String),
  treatment_record_ids: Schema.Array(Schema.String),
  treatment_families: Schema.Array(Schema.String),
  route_scope_direct: Schema.Boolean,
  treatment_scope_direct: Schema.Boolean,
  temporal_role: Schema.Literals(["status_as_of", "planned_operational", "realized_operational"]),
  raw_date: Schema.NullOr(Schema.String),
  normalized_date: Schema.NullOr(Schema.String),
  date_precision: Schema.String,
  candidate_operational_date_raw: Schema.NullOr(Schema.String),
  candidate_operational_date_normalized: Schema.NullOr(Schema.String),
  candidate_operational_date_precision: Schema.String,
  candidate_operational_date_source_field: Schema.NullOr(Schema.String),
  candidate_operational_date_candidates: Schema.Array(OperationalAnchorDateCandidateSchema),
  candidate_operational_dates_normalized: Schema.Array(Schema.String),
  status_as_of_dates: Schema.Array(Schema.String),
  event_family: Schema.String,
  lifecycle_phase: Schema.NullOr(Schema.String),
  assertion_statuses: Schema.Array(Schema.String),
  truth_status: Schema.String,
  truth_statuses: Schema.Array(Schema.String),
  review_state: Schema.String,
  source_id: Schema.String,
  source_ids: Schema.Array(Schema.String),
  source_authority: OperationalAnchorSourceAuthoritySchema,
  source_publishers: Schema.Array(Schema.String),
  route_scope_resolution: OperationalAnchorScopeResolutionSchema,
  treatment_scope_resolution: OperationalAnchorScopeResolutionSchema,
  scope_resolution: OperationalAnchorScopeResolutionSchema,
  conflict_states: Schema.Array(OperationalAnchorConflictStateSchema),
  evidence_coverage: OperationalAnchorEvidenceCoverageSchema,
  evidence_refs: Schema.Array(OperationalAnchorEvidenceRefSchema),
  exclusion_reasons: Schema.Array(OperationalAnchorExclusionReasonSchema),
  study_eligible: Schema.Boolean,
});
type OperationalAnchorRow = typeof OperationalAnchorRowSchema.Type;

const OperationalAnchorSummarySchema = Schema.Struct({
  schema_version: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
  row_count: NonNegativeIntegerSchema,
  study_eligible_count: NonNegativeIntegerSchema,
  counts_by_temporal_role: StringCountSchema,
  counts_by_scope_resolution: StringCountSchema,
  counts_by_exclusion_reason: StringCountSchema,
  funnel: Schema.Struct({
    canonical_events: NonNegativeIntegerSchema,
    timeline_linked_operational_events: NonNegativeIntegerSchema,
    candidate_operational_date_present: NonNegativeIntegerSchema,
    realized_operational: NonNegativeIntegerSchema,
    realized_day_or_month: NonNegativeIntegerSchema,
    resolved_route_scope: NonNegativeIntegerSchema,
    resolved_treatment_scope: NonNegativeIntegerSchema,
    evidence_complete: NonNegativeIntegerSchema,
    conflict_free: NonNegativeIntegerSchema,
    study_eligible: NonNegativeIntegerSchema,
  }),
});
type OperationalAnchorSummary = typeof OperationalAnchorSummarySchema.Type;

const OperationalAnchorReviewEvidenceBindingSchema = Schema.Struct({
  role: Schema.Literals([
    "event_date",
    "route_identity",
    "route_scope",
    "route_treatment_event_bridge",
    "timeline_relation",
    "treatment_definition",
    "treatment_scope",
  ]),
  record_id: Schema.String,
  source_id: Schema.String,
  evidence_id: Schema.String,
});

const OperationalAnchorReviewDecisionSchema = Schema.Struct({
  schema_version: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_DECISION_VERSION),
  decision_id: Schema.String,
  review_state: Schema.Literal("accepted"),
  accepted_at: Schema.String,
  reviewer: Schema.String,
  rationale: Schema.String,
  source_id: Schema.String,
  event_record_id: Schema.String,
  timeline_relation_record_id: Schema.String,
  route_record_id: Schema.String,
  route_scope_relation_record_id: Schema.String,
  treatment_record_id: Schema.String,
  treatment_scope_relation_record_id: Schema.String,
  treatment_family: Schema.String,
  expected_operational_date: Schema.String,
  expected_date_precision: Schema.Literals(["day", "month"]),
  evidence_bindings: Schema.Array(OperationalAnchorReviewEvidenceBindingSchema),
});

const OperationalAnchorReviewSnapshotSchema = Schema.Struct({
  snapshot_version: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION),
  decision_schema_version: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_DECISION_VERSION),
  decision_count: NonNegativeIntegerSchema,
  decisions: Schema.Array(OperationalAnchorReviewDecisionSchema),
});
type OperationalAnchorReviewSnapshot = typeof OperationalAnchorReviewSnapshotSchema.Type;

const ImportedReleaseFileSchema = Schema.Struct({
  pointer: Schema.String,
  path: Schema.String,
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});

const OperationalAnchorRejectionSchema = Schema.Struct({
  operationalChangeId: Schema.String,
  anchorIds: Schema.Array(Schema.String),
  reasonCodes: Schema.Array(Schema.String),
});

const OperationalAnchorConflictSchema = Schema.Struct({
  operationalChangeId: Schema.String,
  anchorIds: Schema.Array(Schema.String),
  candidateOperationalDates: Schema.Array(Schema.NullOr(Schema.String)),
  reason: Schema.Literal("cross_anchor_date_conflict"),
});

export const MtaWikiOperationalAnchorImportArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.mta_wiki_operational_date_assertions.v2"),
  schemaVersion: Schema.Literal(2),
  sourceRelease: Schema.Struct({
    manifestVersion: Schema.Literal(MANIFEST_VERSION),
    releaseId: Schema.String,
    generatorCommit: Schema.String,
    manifestPath: Schema.String,
    manifestSha256: Sha256Schema,
    operationalAnchorContractVersion: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
    operationalAnchorReviewDecisionContractVersion: Schema.Literal(
      OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION,
    ),
    anchors: ImportedReleaseFileSchema,
    summary: ImportedReleaseFileSchema,
    reviewDecisions: ImportedReleaseFileSchema,
    reviewDecisionCount: NonNegativeIntegerSchema,
  }),
  producerSummary: OperationalAnchorSummarySchema,
  summary: Schema.Struct({
    sourceRowCount: NonNegativeIntegerSchema,
    assertionCount: NonNegativeIntegerSchema,
    eligibleAssertionCount: NonNegativeIntegerSchema,
    rejectedAssertionCount: NonNegativeIntegerSchema,
    rejectedAnchorCount: NonNegativeIntegerSchema,
    exactDuplicateGroupCount: NonNegativeIntegerSchema,
    exactDuplicateRowCount: NonNegativeIntegerSchema,
    crossDateConflictGroupCount: NonNegativeIntegerSchema,
    countsByRejectionReason: StringCountSchema,
  }),
  assertions: Schema.Array(WikiOperationalDateAssertionSchema),
  rejections: Schema.Array(OperationalAnchorRejectionSchema),
  conflicts: Schema.Array(OperationalAnchorConflictSchema),
});
export type MtaWikiOperationalAnchorImportArtifact =
  typeof MtaWikiOperationalAnchorImportArtifactSchema.Type;

const ImportErrorCodeSchema = Schema.Literals([
  "invalid_input",
  "unsafe_path",
  "read_failed",
  "hash_mismatch",
  "byte_count_mismatch",
  "invalid_utf8",
  "invalid_json",
  "schema_mismatch",
  "release_mismatch",
  "missing_manifest_file",
  "summary_mismatch",
  "duplicate_anchor_id",
  "semantic_mismatch",
  "write_failed",
]);

export class MtaWikiOperationalAnchorImportError extends Schema.TaggedErrorClass<MtaWikiOperationalAnchorImportError>()(
  "MtaWikiOperationalAnchorImportError",
  {
    code: ImportErrorCodeSchema,
    operation: Schema.String,
    path: Schema.String,
    line: Schema.NullOr(PositiveIntegerSchema),
    detail: Schema.String,
  },
) {}

export type ImportMtaWikiOperationalAnchorsInput = {
  readonly mtaWikiRoot: string;
  readonly wikiRelease: string;
  readonly wikiManifestSha256: string;
  readonly output: string;
};

type VerifiedReleaseFile = {
  readonly pointer: string;
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly metadata: ReleaseFile;
};

type AdaptedAssertion = {
  readonly assertion: WikiOperationalDateAssertion;
  readonly candidateDate: string | null;
  readonly dedupeKey: string;
};

type DedupeResult = {
  readonly assertions: AdaptedAssertion[];
  readonly duplicateGroupCount: number;
  readonly duplicateRowCount: number;
};

function importError(input: {
  code: typeof ImportErrorCodeSchema.Type;
  operation: string;
  path: string;
  detail: string;
  line?: number | null | undefined;
}): MtaWikiOperationalAnchorImportError {
  return MtaWikiOperationalAnchorImportError.make({
    code: input.code,
    operation: input.operation,
    path: input.path,
    line: input.line ?? null,
    detail: input.detail,
  });
}

function serviceFreeSchema<S extends Schema.Constraint>(
  schema: S,
): Schema.Codec<S["Type"], S["Encoded"], never, unknown> {
  return Schema.make<Schema.Codec<S["Type"], S["Encoded"], never, unknown>>(schema.ast);
}

function decodeStrict<S extends Schema.Constraint>(input: {
  schema: S;
  value: unknown;
  operation: string;
  path: string;
  line?: number | null | undefined;
}): Effect.Effect<S["Type"], MtaWikiOperationalAnchorImportError> {
  return Schema.decodeUnknownEffect(serviceFreeSchema(input.schema), {
    onExcessProperty: "error",
  })(input.value).pipe(
    Effect.mapError((error) =>
      importError({
        code: "schema_mismatch",
        operation: input.operation,
        path: input.path,
        line: input.line,
        detail: String(error),
      }),
    ),
  );
}

function parseJsonUnknown(text: string): unknown {
  return JSON.parse(text);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

function artifactJson(artifact: MtaWikiOperationalAnchorImportArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

function releaseArtifactPath(releaseId: string, pointer: string): string {
  return `data/exports/releases/${releaseId}/${pointer}`;
}

function isInside(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path);
  return (
    pathFromRoot.length > 0 &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

const readBytes = Effect.fn("MtaWikiOperationalAnchors.readBytes")(function* (
  path: string,
  operation: string,
) {
  return yield* Effect.tryPromise({
    try: () => readFile(path),
    catch: (cause) =>
      importError({
        code: "read_failed",
        operation,
        path,
        detail: String(cause),
      }),
  });
});

const canonicalPath = Effect.fn("MtaWikiOperationalAnchors.canonicalPath")(function* (
  path: string,
  operation: string,
) {
  return yield* Effect.tryPromise({
    try: () => realpath(path),
    catch: (cause) =>
      importError({
        code: "read_failed",
        operation,
        path,
        detail: String(cause),
      }),
  });
});

function isMissingPathError(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";
}

/**
 * Resolve an output path through its nearest existing ancestor. This catches
 * both an existing output symlink and a symlinked parent before a write can
 * escape into the immutable producer release.
 */
const canonicalProspectivePath = Effect.fn("MtaWikiOperationalAnchors.canonicalProspectivePath")(
  function* (path: string, operation: string) {
    return yield* Effect.tryPromise({
      try: async () => {
        const target = resolve(path);
        let ancestor = target;
        while (true) {
          try {
            const canonicalAncestor = await realpath(ancestor);
            return resolve(canonicalAncestor, relative(ancestor, target));
          } catch (cause) {
            if (!isMissingPathError(cause)) throw cause;
            const parent = dirname(ancestor);
            if (parent === ancestor) throw cause;
            ancestor = parent;
          }
        }
      },
      catch: (cause) =>
        importError({
          code: "read_failed",
          operation,
          path,
          detail: String(cause),
        }),
    });
  },
);

function decodeUtf8(
  bytes: Uint8Array,
  input: { operation: string; path: string },
): Effect.Effect<string, MtaWikiOperationalAnchorImportError> {
  return Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    catch: (cause) =>
      importError({
        code: "invalid_utf8",
        operation: input.operation,
        path: input.path,
        detail: String(cause),
      }),
  });
}

function parseJson(
  text: string,
  input: { operation: string; path: string; line?: number | null | undefined },
): Effect.Effect<unknown, MtaWikiOperationalAnchorImportError> {
  return Effect.try({
    try: () => parseJsonUnknown(text),
    catch: (cause) =>
      importError({
        code: "invalid_json",
        operation: input.operation,
        path: input.path,
        line: input.line,
        detail: String(cause),
      }),
  });
}

type NormalizedLiteralPrecision = "day" | "month" | "year" | "season";

function normalizedLiteralPrecision(value: string): NormalizedLiteralPrecision | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (day !== null) {
    const yearPart = day[1];
    const monthPart = day[2];
    const dayPart = day[3];
    if (yearPart === undefined || monthPart === undefined || dayPart === undefined) return null;
    const year = Number(yearPart);
    const month = Number(monthPart);
    const dayOfMonth = Number(dayPart);
    const parsed = new Date(Date.UTC(year, month - 1, dayOfMonth));
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === dayOfMonth
      ? "day"
      : null;
  }
  const month = /^(\d{4})-(\d{2})$/u.exec(value);
  if (month !== null) {
    const monthPart = month[2];
    if (monthPart === undefined) return null;
    const monthNumber = Number(monthPart);
    return monthNumber >= 1 && monthNumber <= 12 ? "month" : null;
  }
  if (/^\d{4}$/u.test(value)) return "year";
  if (/^\d{4}-(?:winter|spring|summer|fall)$/u.test(value)) return "season";
  return null;
}

function precisionDisagrees(normalized: string, declared: string): boolean {
  const detected = normalizedLiteralPrecision(normalized);
  if (detected !== null) return detected !== declared;
  return declared === "day" || declared === "month" || declared === "year";
}

function validateRowSemantics(
  row: OperationalAnchorRow,
  input: { path: string; line: number },
): Effect.Effect<void, MtaWikiOperationalAnchorImportError> {
  const selectedDate = row.candidate_operational_date_normalized;
  if (
    selectedDate !== null &&
    precisionDisagrees(selectedDate, row.candidate_operational_date_precision)
  ) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: `candidate date ${selectedDate} disagrees with precision ${row.candidate_operational_date_precision}`,
      }),
    );
  }
  for (const candidate of row.candidate_operational_date_candidates) {
    if (precisionDisagrees(candidate.normalized, candidate.precision)) {
      return Effect.fail(
        importError({
          code: "semantic_mismatch",
          operation: "validateOperationalAnchor",
          path: input.path,
          line: input.line,
          detail: `candidate ${candidate.source_field} date ${candidate.normalized} disagrees with precision ${candidate.precision}`,
        }),
      );
    }
  }
  const candidateDates = uniqueSorted(
    row.candidate_operational_date_candidates.map((candidate) => candidate.normalized),
  );
  if (canonicalJson(candidateDates) !== canonicalJson(row.candidate_operational_dates_normalized)) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: "candidate_operational_dates_normalized does not match the structured candidates",
      }),
    );
  }
  if (selectedDate !== null && !candidateDates.includes(selectedDate)) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: `selected candidate date ${selectedDate} is absent from the structured candidates`,
      }),
    );
  }
  if (selectedDate === null && candidateDates.length > 0) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: "structured candidate dates exist but no operational date was selected",
      }),
    );
  }
  if (
    row.temporal_role !== "status_as_of" &&
    (selectedDate === null ||
      row.normalized_date !== selectedDate ||
      row.date_precision !== row.candidate_operational_date_precision)
  ) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: "operational temporal fields disagree with the selected candidate date",
      }),
    );
  }
  const combinedScopeResolution =
    row.route_scope_resolution === "missing" || row.treatment_scope_resolution === "missing"
      ? "missing"
      : row.route_scope_resolution === "ambiguous" || row.treatment_scope_resolution === "ambiguous"
        ? "ambiguous"
        : row.route_scope_resolution === "unreviewed_inherited" ||
            row.treatment_scope_resolution === "unreviewed_inherited"
          ? "unreviewed_inherited"
          : row.route_scope_resolution === "reviewed_inherited" ||
              row.treatment_scope_resolution === "reviewed_inherited"
            ? "reviewed_inherited"
            : "direct";
  if (row.scope_resolution !== combinedScopeResolution) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: `combined scope resolution should be ${combinedScopeResolution}, received ${row.scope_resolution}`,
      }),
    );
  }
  if (row.study_eligible !== (row.exclusion_reasons.length === 0)) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: "study_eligible disagrees with exclusion_reasons",
      }),
    );
  }
  if (!row.source_ids.includes(row.source_id)) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: `source_ids does not include primary source_id ${row.source_id}`,
      }),
    );
  }
  if (!row.truth_statuses.includes(row.truth_status)) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: `truth_statuses does not include event truth_status ${row.truth_status}`,
      }),
    );
  }
  return Effect.void;
}

const resolveReleaseDirectory = Effect.fn("MtaWikiOperationalAnchors.resolveReleaseDirectory")(
  function* (input: ImportMtaWikiOperationalAnchorsInput) {
    if (
      input.mtaWikiRoot.trim().length === 0 ||
      input.wikiRelease.trim().length === 0 ||
      input.output.trim().length === 0
    ) {
      return yield* Effect.fail(
        importError({
          code: "invalid_input",
          operation: "resolveReleaseDirectory",
          path: input.mtaWikiRoot,
          detail: "mtaWikiRoot, wikiRelease, and output must be non-empty",
        }),
      );
    }
    if (!/^[a-f0-9]{64}$/u.test(input.wikiManifestSha256)) {
      return yield* Effect.fail(
        importError({
          code: "invalid_input",
          operation: "resolveReleaseDirectory",
          path: input.mtaWikiRoot,
          detail: "wikiManifestSha256 must be a lowercase 64-character SHA-256 digest",
        }),
      );
    }

    const releasesRoot = resolve(input.mtaWikiRoot, "data", "exports", "releases");
    const releaseDirectory = resolve(releasesRoot, input.wikiRelease);
    if (!isInside(releasesRoot, releaseDirectory)) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: "resolveReleaseDirectory",
          path: releaseDirectory,
          detail: "wikiRelease escapes the MTA Wiki releases directory",
        }),
      );
    }
    const canonicalReleasesRoot = yield* canonicalPath(releasesRoot, "resolveReleaseDirectory");
    const canonicalReleaseDirectory = yield* canonicalPath(
      releaseDirectory,
      "resolveReleaseDirectory",
    );
    if (!isInside(canonicalReleasesRoot, canonicalReleaseDirectory)) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: "resolveReleaseDirectory",
          path: canonicalReleaseDirectory,
          detail: "wikiRelease resolves outside the MTA Wiki releases directory",
        }),
      );
    }
    const outputPath = resolve(input.output);
    if (outputPath === releaseDirectory || isInside(releaseDirectory, outputPath)) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: "resolveReleaseDirectory",
          path: outputPath,
          detail: "output must not overwrite files in the pinned MTA Wiki release",
        }),
      );
    }
    const canonicalOutputPath = yield* canonicalProspectivePath(
      outputPath,
      "resolveReleaseDirectory",
    );
    if (
      canonicalOutputPath === canonicalReleaseDirectory ||
      isInside(canonicalReleaseDirectory, canonicalOutputPath)
    ) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: "resolveReleaseDirectory",
          path: canonicalOutputPath,
          detail: "output resolves inside the pinned MTA Wiki release",
        }),
      );
    }
    return { releaseDirectory, canonicalReleaseDirectory };
  },
);

const safeReleaseFilePath = Effect.fn("MtaWikiOperationalAnchors.safeReleaseFilePath")(
  function* (input: {
    releaseDirectory: string;
    canonicalReleaseDirectory: string;
    pointer: string;
    operation: string;
  }) {
    const target = resolve(input.releaseDirectory, input.pointer);
    if (!isInside(input.releaseDirectory, target)) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: input.operation,
          path: target,
          detail: `release pointer escapes its release directory: ${input.pointer}`,
        }),
      );
    }
    const canonicalTarget = yield* canonicalPath(target, input.operation);
    if (!isInside(input.canonicalReleaseDirectory, canonicalTarget)) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: input.operation,
          path: canonicalTarget,
          detail: `release pointer resolves outside its release directory: ${input.pointer}`,
        }),
      );
    }
    return canonicalTarget;
  },
);

const verifyReleaseFile = Effect.fn("MtaWikiOperationalAnchors.verifyReleaseFile")(
  function* (input: {
    releaseDirectory: string;
    canonicalReleaseDirectory: string;
    pointer: string;
    metadata: ReleaseFile;
    operation: string;
  }): Generator<
    Effect.Effect<unknown, MtaWikiOperationalAnchorImportError>,
    VerifiedReleaseFile,
    never
  > {
    const path = yield* safeReleaseFilePath(input);
    const bytes = yield* readBytes(path, input.operation);
    if (bytes.length !== input.metadata.bytes) {
      return yield* Effect.fail(
        importError({
          code: "byte_count_mismatch",
          operation: input.operation,
          path,
          detail: `expected ${input.metadata.bytes} bytes, received ${bytes.length}`,
        }),
      );
    }
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== input.metadata.sha256) {
      return yield* Effect.fail(
        importError({
          code: "hash_mismatch",
          operation: input.operation,
          path,
          detail: `expected ${input.metadata.sha256}, received ${actualSha256}`,
        }),
      );
    }
    return { pointer: input.pointer, path, bytes, metadata: input.metadata };
  },
);

const decodeOperationalAnchorRows = Effect.fn("MtaWikiOperationalAnchors.decodeRows")(function* (
  file: VerifiedReleaseFile,
) {
  const text = yield* decodeUtf8(file.bytes, {
    operation: "decodeOperationalAnchors",
    path: file.path,
  });
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const rows: OperationalAnchorRow[] = [];
  const anchorLines = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (line.trim().length === 0) {
      return yield* Effect.fail(
        importError({
          code: "invalid_json",
          operation: "decodeOperationalAnchors",
          path: file.path,
          line: lineNumber,
          detail: "blank JSONL records are not allowed",
        }),
      );
    }
    const value = yield* parseJson(line, {
      operation: "decodeOperationalAnchors",
      path: file.path,
      line: lineNumber,
    });
    const row = yield* decodeStrict({
      schema: OperationalAnchorRowSchema,
      value,
      operation: "decodeOperationalAnchors",
      path: file.path,
      line: lineNumber,
    });
    yield* validateRowSemantics(row, { path: file.path, line: lineNumber });
    const previousLine = anchorLines.get(row.anchor_id);
    if (previousLine !== undefined) {
      return yield* Effect.fail(
        importError({
          code: "duplicate_anchor_id",
          operation: "decodeOperationalAnchors",
          path: file.path,
          line: lineNumber,
          detail: `anchor_id ${row.anchor_id} already appeared on line ${previousLine}`,
        }),
      );
    }
    anchorLines.set(row.anchor_id, lineNumber);
    rows.push(row);
  }
  return rows.toSorted((left, right) => left.anchor_id.localeCompare(right.anchor_id));
});

const decodeOperationalAnchorSummary = Effect.fn("MtaWikiOperationalAnchors.decodeSummary")(
  function* (file: VerifiedReleaseFile) {
    const text = yield* decodeUtf8(file.bytes, {
      operation: "decodeOperationalAnchorSummary",
      path: file.path,
    });
    const value = yield* parseJson(text, {
      operation: "decodeOperationalAnchorSummary",
      path: file.path,
    });
    return yield* decodeStrict({
      schema: OperationalAnchorSummarySchema,
      value,
      operation: "decodeOperationalAnchorSummary",
      path: file.path,
    });
  },
);

const decodeOperationalAnchorReviewSnapshot = Effect.fn(
  "MtaWikiOperationalAnchors.decodeReviewSnapshot",
)(function* (file: VerifiedReleaseFile) {
  const text = yield* decodeUtf8(file.bytes, {
    operation: "decodeOperationalAnchorReviewSnapshot",
    path: file.path,
  });
  const value = yield* parseJson(text, {
    operation: "decodeOperationalAnchorReviewSnapshot",
    path: file.path,
  });
  return yield* decodeStrict({
    schema: OperationalAnchorReviewSnapshotSchema,
    value,
    operation: "decodeOperationalAnchorReviewSnapshot",
    path: file.path,
  });
});

const requiredReviewEvidenceRoles = [
  "event_date",
  "route_identity",
  "route_scope",
  "route_treatment_event_bridge",
  "timeline_relation",
  "treatment_definition",
  "treatment_scope",
] as const;

function rowMatchesReviewDecision(
  row: OperationalAnchorRow,
  decision: OperationalAnchorReviewSnapshot["decisions"][number],
): boolean {
  return (
    row.scope_resolution === "reviewed_inherited" &&
    row.event_record_id === decision.event_record_id &&
    row.route_record_ids.includes(decision.route_record_id) &&
    row.treatment_record_ids.includes(decision.treatment_record_id) &&
    row.candidate_operational_date_normalized === decision.expected_operational_date &&
    row.candidate_operational_date_precision === decision.expected_date_precision
  );
}

const validateOperationalAnchorReviewSnapshot = Effect.fn(
  "MtaWikiOperationalAnchors.validateReviewSnapshot",
)(function* (input: {
  snapshot: OperationalAnchorReviewSnapshot;
  rows: readonly OperationalAnchorRow[];
  path: string;
}) {
  const fail = (detail: string) =>
    Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchorReviewSnapshot",
        path: input.path,
        detail,
      }),
    );
  if (input.snapshot.decision_count !== input.snapshot.decisions.length) {
    return yield* fail(
      `decision_count ${input.snapshot.decision_count} does not match ${input.snapshot.decisions.length} decisions`,
    );
  }
  const decisionIds = input.snapshot.decisions.map((decision) => decision.decision_id);
  if (new Set(decisionIds).size !== decisionIds.length) {
    return yield* fail("review snapshot contains duplicate decision_id values");
  }
  if (decisionIds.join("\n") !== decisionIds.toSorted().join("\n")) {
    return yield* fail("review snapshot decisions must be sorted by decision_id");
  }

  for (const decision of input.snapshot.decisions) {
    const datePattern =
      decision.expected_date_precision === "day" ? /^\d{4}-\d{2}-\d{2}$/u : /^\d{4}-\d{2}$/u;
    if (!datePattern.test(decision.expected_operational_date)) {
      return yield* fail(
        `${decision.decision_id} expected_operational_date disagrees with expected_date_precision`,
      );
    }
    if (Number.isNaN(Date.parse(decision.accepted_at))) {
      return yield* fail(`${decision.decision_id} accepted_at is not an ISO date-time`);
    }
    const roles = new Set(decision.evidence_bindings.map((binding) => binding.role));
    for (const role of requiredReviewEvidenceRoles) {
      if (!roles.has(role)) {
        return yield* fail(`${decision.decision_id} is missing evidence role ${role}`);
      }
    }
    if (decision.evidence_bindings.some((binding) => binding.source_id !== decision.source_id)) {
      return yield* fail(`${decision.decision_id} contains a cross-source evidence binding`);
    }
    const matchingRows = input.rows.filter((row) => rowMatchesReviewDecision(row, decision));
    if (matchingRows.length !== 1) {
      return yield* fail(
        `${decision.decision_id} must bind exactly one exported anchor row; matched ${matchingRows.length}`,
      );
    }
  }

  for (const row of input.rows) {
    const usesReviewedScope =
      row.route_scope_resolution === "reviewed_inherited" ||
      row.treatment_scope_resolution === "reviewed_inherited" ||
      row.scope_resolution === "reviewed_inherited";
    if (
      usesReviewedScope &&
      !input.snapshot.decisions.some((decision) => rowMatchesReviewDecision(row, decision))
    ) {
      return yield* fail(
        `reviewed-inherited anchor ${row.anchor_id} has no matching accepted review decision`,
      );
    }
  }
  return undefined;
});

function recomputedProducerSummary(
  rows: readonly OperationalAnchorRow[],
  canonicalEventCount: number,
): OperationalAnchorSummary {
  const dated = rows.filter((row) => row.candidate_operational_date_normalized !== null);
  const realized = dated.filter((row) => row.temporal_role === "realized_operational");
  const precise = realized.filter(
    (row) =>
      row.candidate_operational_date_precision === "day" ||
      row.candidate_operational_date_precision === "month",
  );
  const routeResolved = precise.filter(
    (row) =>
      row.gtfs_route_ids.length === 1 &&
      (row.route_scope_resolution === "direct" ||
        row.route_scope_resolution === "reviewed_inherited"),
  );
  const treatmentResolved = routeResolved.filter(
    (row) =>
      row.treatment_record_ids.length === 1 &&
      (row.treatment_scope_resolution === "direct" ||
        row.treatment_scope_resolution === "reviewed_inherited"),
  );
  const evidenceComplete = treatmentResolved.filter((row) =>
    Object.values(row.evidence_coverage).every(Boolean),
  );
  const conflictFree = evidenceComplete.filter((row) => row.conflict_states.length === 0);
  return {
    schema_version: OPERATIONAL_ANCHOR_CONTRACT_VERSION,
    row_count: rows.length,
    study_eligible_count: rows.filter((row) => row.study_eligible).length,
    counts_by_temporal_role: countBy(rows.map((row) => row.temporal_role)),
    counts_by_scope_resolution: countBy(rows.map((row) => row.scope_resolution)),
    counts_by_exclusion_reason: countBy(rows.flatMap((row) => row.exclusion_reasons)),
    funnel: {
      canonical_events: canonicalEventCount,
      timeline_linked_operational_events: rows.length,
      candidate_operational_date_present: dated.length,
      realized_operational: realized.length,
      realized_day_or_month: precise.length,
      resolved_route_scope: routeResolved.length,
      resolved_treatment_scope: treatmentResolved.length,
      evidence_complete: evidenceComplete.length,
      conflict_free: conflictFree.length,
      study_eligible: rows.filter((row) => row.study_eligible).length,
    },
  };
}

function validateProducerSummary(
  rows: readonly OperationalAnchorRow[],
  summary: OperationalAnchorSummary,
  manifest: ReleaseManifest,
  path: string,
): Effect.Effect<void, MtaWikiOperationalAnchorImportError> {
  // biome-ignore lint/complexity/useLiteralKeys: record_counts is a string-indexed manifest map.
  const manifestEventCount = manifest.record_counts["event"];
  if (manifestEventCount === undefined) {
    return Effect.fail(
      importError({
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
        path,
        detail: "manifest record_counts is missing event",
      }),
    );
  }
  if (manifestEventCount !== summary.funnel.canonical_events) {
    return Effect.fail(
      importError({
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
        path,
        detail: `manifest event count ${manifestEventCount} disagrees with summary canonical event count ${summary.funnel.canonical_events}`,
      }),
    );
  }
  if (summary.funnel.canonical_events < rows.length) {
    return Effect.fail(
      importError({
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
        path,
        detail: "funnel.canonical_events is smaller than the operational anchor row count",
      }),
    );
  }
  const expected = recomputedProducerSummary(rows, summary.funnel.canonical_events);
  if (canonicalJson(expected) !== canonicalJson(summary)) {
    return Effect.fail(
      importError({
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
        path,
        detail: `producer summary does not match its rows; expected ${canonicalJson(expected)}`,
      }),
    );
  }
  return Effect.void;
}

function normalizedPrecision(
  value: string,
): "day" | "month" | "year" | "range" | "season" | "unknown" {
  if (
    value === "day" ||
    value === "month" ||
    value === "year" ||
    value === "range" ||
    value === "season"
  ) {
    return value;
  }
  return "unknown";
}

function sourceStatedStatus(row: OperationalAnchorRow): SourceStatedStatus {
  if (row.temporal_role === "realized_operational") return "done";
  if (row.temporal_role === "planned_operational") return "committed_future";
  return "unknown";
}

function dateBasis(row: OperationalAnchorRow): OperationalDateBasis {
  if (row.temporal_role === "realized_operational") return "source_stated_complete";
  if (row.temporal_role === "planned_operational") return "source_stated_plan";
  return "not_operational";
}

function validationState(row: OperationalAnchorRow): OperationalDateValidationState {
  if (row.candidate_operational_date_normalized === null) return "operational_without_date";
  if (row.temporal_role === "realized_operational") {
    return "source_stated_operational_date";
  }
  if (row.temporal_role === "planned_operational") {
    return "source_stated_planned_date";
  }
  return "non_operational_milestone";
}

function routeResolutionTier(row: OperationalAnchorRow): string | null {
  if (row.route_scope_resolution === "direct") return "direct_event_text";
  if (row.route_scope_resolution === "reviewed_inherited") {
    return "source_single_route_context";
  }
  return null;
}

function evidenceRef(ref: OperationalAnchorRow["evidence_refs"][number]): unknown {
  return {
    recordId: ref.record_id,
    sourceId: ref.source_id,
    ...(ref.evidence_id === null ? {} : { evidenceId: ref.evidence_id }),
    ...(ref.block_id === null ? {} : { blockId: ref.block_id }),
    ...(ref.page_number === null ? {} : { pageNumber: ref.page_number }),
    ...(ref.text_sha256 === null ? {} : { blockHash: ref.text_sha256 }),
    roleRaw: ref.role,
  };
}

function evidenceComplete(assertion: WikiOperationalDateAssertion): boolean {
  return (
    assertion.evidenceCoverage.event &&
    assertion.evidenceCoverage.timeline &&
    assertion.evidenceCoverage.routeScope &&
    assertion.evidenceCoverage.treatmentScope
  );
}

function locallyEligible(assertion: WikiOperationalDateAssertion): boolean {
  return computeCausalAnchorEligibility({
    producerStudyEligible: assertion.producerStudyEligible,
    trustedOperationalDate: assertion.trustedOperationalDate,
    isRealizedOnset: assertion.isRealizedOnset,
    eventFamily: assertion.familyRaw,
    dateRole: assertion.dateRole,
    lifecyclePhase: assertion.lifecyclePhase,
    normalizedPrecision: assertion.normalizedPrecision,
    routeCount: assertion.routeIds.length,
    treatmentCount: assertion.treatmentRecordIds.length,
    treatmentFamilyCount: assertion.treatmentFamilies.length,
    routeScopeResolution: assertion.routeScopeResolution,
    treatmentScopeResolution: assertion.treatmentScopeResolution,
    scopeResolution: assertion.scopeResolution,
    evidenceComplete: evidenceComplete(assertion),
    conflictCount: assertion.conflictStates.length,
    exclusionCount: assertion.exclusionReasons.length,
    reviewState: assertion.reviewState,
    truthStatuses: assertion.truthStatuses,
    sourceAuthority: assertion.sourceAuthority,
  });
}

function localRejectionReasons(assertion: WikiOperationalDateAssertion): string[] {
  const reasons: string[] = [];
  const resolved = (value: WikiOperationalDateAssertion["scopeResolution"]): boolean =>
    value === "direct" || value === "reviewed_inherited";
  if (!assertion.producerStudyEligible) reasons.push("producer_ineligible");
  if (!assertion.trustedOperationalDate) reasons.push("untrusted_operational_date");
  if (!assertion.isRealizedOnset || assertion.dateRole !== "realized_operational") {
    reasons.push("non_realized_operational_date");
  }
  if (assertion.familyRaw !== "implementation" && assertion.familyRaw !== "launch") {
    reasons.push("unsupported_operational_event_family");
  }
  if (!isRealizedOperationalLifecyclePhase(assertion.lifecyclePhase)) {
    reasons.push("ambiguous_lifecycle_phase");
  }
  if (assertion.normalizedPrecision !== "day" && assertion.normalizedPrecision !== "month") {
    reasons.push("imprecise_operational_date");
  }
  if (assertion.routeIds.length !== 1) reasons.push("route_count_not_one");
  if (assertion.treatmentRecordIds.length !== 1) reasons.push("treatment_count_not_one");
  if (assertion.treatmentFamilies.length !== 1) reasons.push("treatment_family_count_not_one");
  if (!resolved(assertion.routeScopeResolution)) reasons.push("unresolved_route_scope");
  if (!resolved(assertion.treatmentScopeResolution)) reasons.push("unresolved_treatment_scope");
  if (!resolved(assertion.scopeResolution)) reasons.push("unresolved_combined_scope");
  if (!evidenceComplete(assertion)) reasons.push("incomplete_evidence");
  if (assertion.conflictStates.length > 0) reasons.push("conflict_present");
  if (assertion.exclusionReasons.length > 0) reasons.push("exclusion_present");
  if (assertion.reviewState === "quarantined") reasons.push("quarantined_record");
  if (
    assertion.truthStatuses.length === 0 ||
    assertion.truthStatuses.some((status) => status !== "source_stated")
  ) {
    reasons.push("non_source_stated_evidence");
  }
  if (assertion.sourceAuthority !== "official_public_agency") {
    reasons.push("untrusted_source_authority");
  }
  reasons.push(...assertion.exclusionReasons.map((reason) => `producer:${reason}`));
  return uniqueSorted(reasons);
}

function assertionDedupeKey(row: OperationalAnchorRow): string {
  return canonicalJson({
    operationalChangeId: row.operational_change_id,
    candidateDate: row.candidate_operational_date_normalized,
    candidatePrecision: row.candidate_operational_date_precision,
    candidateDates: uniqueSorted(row.candidate_operational_dates_normalized),
    statusAsOfDates: uniqueSorted(row.status_as_of_dates),
    routeRecordIds: uniqueSorted(row.route_record_ids),
    unmatchedRouteRecordIds: uniqueSorted(row.unmatched_route_record_ids),
    gtfsRouteIds: uniqueSorted(row.gtfs_route_ids),
    treatmentRecordIds: uniqueSorted(row.treatment_record_ids),
    treatmentFamilies: uniqueSorted(row.treatment_families),
    projectRecordIds: uniqueSorted(row.project_record_ids),
    subjectRecordIds: uniqueSorted(row.subject_record_ids),
    temporalRole: row.temporal_role,
    eventFamily: row.event_family,
    lifecyclePhase: row.lifecycle_phase,
    assertionStatuses: uniqueSorted(row.assertion_statuses),
    truthStatus: row.truth_status,
    truthStatuses: uniqueSorted(row.truth_statuses),
    reviewState: row.review_state,
    sourceAuthority: row.source_authority,
    routeScopeResolution: row.route_scope_resolution,
    treatmentScopeResolution: row.treatment_scope_resolution,
    scopeResolution: row.scope_resolution,
    conflictStates: uniqueSorted(row.conflict_states),
    evidenceCoverage: row.evidence_coverage,
    exclusionReasons: uniqueSorted(row.exclusion_reasons),
    producerStudyEligible: row.study_eligible,
  });
}

const adaptRow = Effect.fn("MtaWikiOperationalAnchors.adaptRow")(function* (input: {
  row: OperationalAnchorRow;
  release: ReleaseManifest;
  manifestSha256: string;
  anchorFile: VerifiedReleaseFile;
}) {
  const row = input.row;
  const precision = normalizedPrecision(row.candidate_operational_date_precision);
  const parsed = parseOperationalDate(
    row.candidate_operational_date_normalized ?? row.candidate_operational_date_raw,
  );
  const routeTier = routeResolutionTier(row);
  const trustedOperationalDate =
    row.candidate_operational_date_normalized !== null &&
    row.source_authority === "official_public_agency" &&
    row.truth_statuses.length > 0 &&
    row.truth_statuses.every((status) => status === "source_stated");
  const classificationReasons = uniqueSorted([
    `producer temporal role: ${row.temporal_role}`,
    ...(row.study_eligible ? [] : ["producer marked this anchor ineligible"]),
    ...row.exclusion_reasons.map((reason) => `producer exclusion: ${reason}`),
  ]);

  const assertionValue: unknown = {
    surfaceId: row.anchor_id,
    sourceId: row.source_id,
    sourceTitle: null,
    sourceGroup: null,
    displayLabel: null,
    eventName: null,
    treatmentText: row.treatment_families.length === 0 ? null : row.treatment_families.join(", "),
    locationText: null,
    operationalDate:
      row.candidate_operational_date_raw ?? row.candidate_operational_date_normalized,
    datePrecision: row.candidate_operational_date_precision,
    statusRaw: row.assertion_statuses.length === 0 ? null : row.assertion_statuses.join(","),
    familyRaw: row.event_family,
    subtypeRaw: row.lifecycle_phase,
    eventKind: row.event_family,
    interventionFamily: row.treatment_families[0] ?? "unknown",
    sourceStatedStatus: sourceStatedStatus(row),
    dateBasis: dateBasis(row),
    validationState: validationState(row),
    trustedOperationalDate,
    classificationReasons,
    evidenceRefs: row.evidence_refs.map(evidenceRef),
    effectiveDateStart: parsed.effectiveDateStart,
    effectiveDateEnd: parsed.effectiveDateEnd,
    implementationMonth:
      precision === "day" || precision === "month" ? parsed.implementationMonth : null,
    normalizedPrecision: precision,
    isRealizedOnset: row.temporal_role === "realized_operational",
    routeIds: uniqueSorted(row.gtfs_route_ids),
    routeIdentityValidationState:
      row.gtfs_route_ids.length === 1 && row.unmatched_route_record_ids.length === 0
        ? "confirmed_in_current_gtfs"
        : row.gtfs_route_ids.length === 0
          ? "unresolved"
          : "ambiguous",
    routeResolutionTier: routeTier,
    interventionId: row.operational_change_id,
    evidenceSourceIds: uniqueSorted(row.source_ids),
    sourceCount: uniqueSorted(row.source_ids).length,
    confidence: operationalDateConfidence({
      dateBasis: dateBasis(row),
      normalizedPrecision: precision,
      routeResolutionTier: routeTier,
    }),
    causalAnchorEligible: false,
    producer: "mta-wiki",
    producerSchemaVersion: OPERATIONAL_ANCHOR_CONTRACT_VERSION,
    producerStudyEligible: row.study_eligible,
    operationalChangeId: row.operational_change_id,
    dateRole: row.temporal_role,
    lifecyclePhase: row.lifecycle_phase,
    routeScopeResolution: row.route_scope_resolution,
    treatmentScopeResolution: row.treatment_scope_resolution,
    scopeResolution: row.scope_resolution,
    treatmentRecordIds: uniqueSorted(row.treatment_record_ids),
    treatmentFamilies: uniqueSorted(row.treatment_families),
    conflictStates: uniqueSorted(row.conflict_states),
    exclusionReasons: uniqueSorted(row.exclusion_reasons),
    evidenceCoverage: {
      event: row.evidence_coverage.event,
      timeline: row.evidence_coverage.timeline,
      routeScope: row.evidence_coverage.route_scope,
      treatmentScope: row.evidence_coverage.treatment_scope,
    },
    candidateOperationalDatesNormalized: uniqueSorted(row.candidate_operational_dates_normalized),
    statusAsOfDates: uniqueSorted(row.status_as_of_dates),
    assertionStatuses: uniqueSorted(row.assertion_statuses),
    truthStatus: row.truth_status,
    truthStatuses: uniqueSorted(row.truth_statuses),
    reviewState: row.review_state,
    sourceAuthority: row.source_authority,
    sourcePublishers: uniqueSorted(row.source_publishers),
    wikiReleaseId: input.release.release_id,
    wikiGeneratorCommit: input.release.generator_commit,
    wikiManifestSha256: input.manifestSha256,
    wikiAnchorArtifactPath: input.anchorFile.pointer,
    wikiAnchorArtifactSha256: input.anchorFile.metadata.sha256,
    wikiAnchorId: row.anchor_id,
    wikiAnchorIds: [row.anchor_id],
    wikiEventRecordId: row.event_record_id,
    wikiTimelineRelationRecordIds: uniqueSorted(row.timeline_relation_record_ids),
    wikiProjectRecordIds: uniqueSorted(row.project_record_ids),
    wikiSubjectRecordIds: uniqueSorted(row.subject_record_ids),
    wikiRouteRecordIds: uniqueSorted(row.route_record_ids),
    wikiUnmatchedRouteRecordIds: uniqueSorted(row.unmatched_route_record_ids),
    wikiSourceIds: uniqueSorted(row.source_ids),
  };
  const provisional = yield* decodeStrict({
    schema: WikiOperationalDateAssertionSchema,
    value: assertionValue,
    operation: "adaptOperationalAnchor",
    path: input.anchorFile.path,
  });
  const assertion = yield* decodeStrict({
    schema: WikiOperationalDateAssertionSchema,
    value: { ...provisional, causalAnchorEligible: locallyEligible(provisional) },
    operation: "adaptOperationalAnchor",
    path: input.anchorFile.path,
  });
  return {
    assertion,
    candidateDate: row.candidate_operational_date_normalized,
    dedupeKey: assertionDedupeKey(row),
  } satisfies AdaptedAssertion;
});

function evidenceRefKey(ref: WikiOperationalDateAssertion["evidenceRefs"][number]): string {
  return canonicalJson(ref);
}

const mergeExactDuplicates = Effect.fn("MtaWikiOperationalAnchors.mergeExactDuplicates")(function* (
  entries: readonly AdaptedAssertion[],
): Generator<Effect.Effect<unknown, MtaWikiOperationalAnchorImportError>, DedupeResult, never> {
  const groups = new Map<string, AdaptedAssertion[]>();
  for (const entry of entries) {
    const group = groups.get(entry.dedupeKey) ?? [];
    group.push(entry);
    groups.set(entry.dedupeKey, group);
  }

  const assertions: AdaptedAssertion[] = [];
  let duplicateGroupCount = 0;
  let duplicateRowCount = 0;
  for (const [dedupeKey, unsortedGroup] of [...groups.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const group = unsortedGroup.toSorted((left, right) =>
      left.assertion.wikiAnchorId.localeCompare(right.assertion.wikiAnchorId),
    );
    const first = group[0];
    if (first === undefined) continue;
    if (group.length > 1) {
      duplicateGroupCount += 1;
      duplicateRowCount += group.length - 1;
    }
    const base = first.assertion;
    const anchorIds = uniqueSorted(group.flatMap((entry) => entry.assertion.wikiAnchorIds));
    const sourceIds = uniqueSorted(group.flatMap((entry) => entry.assertion.wikiSourceIds));
    const primarySourceIds = uniqueSorted(group.map((entry) => entry.assertion.sourceId));
    const refsByKey = new Map<string, WikiOperationalDateAssertion["evidenceRefs"][number]>();
    for (const ref of group.flatMap((entry) => entry.assertion.evidenceRefs)) {
      refsByKey.set(evidenceRefKey(ref), ref);
    }
    const mergedValue: unknown = {
      ...base,
      surfaceId: anchorIds[0] ?? base.surfaceId,
      sourceId: primarySourceIds[0] ?? base.sourceId,
      classificationReasons: uniqueSorted(
        group.flatMap((entry) => entry.assertion.classificationReasons),
      ),
      evidenceRefs: [...refsByKey.entries()]
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([, ref]) => ref),
      evidenceSourceIds: sourceIds,
      sourceCount: sourceIds.length,
      sourcePublishers: uniqueSorted(group.flatMap((entry) => entry.assertion.sourcePublishers)),
      wikiAnchorId: anchorIds[0] ?? base.wikiAnchorId,
      wikiAnchorIds: anchorIds,
      wikiTimelineRelationRecordIds: uniqueSorted(
        group.flatMap((entry) => entry.assertion.wikiTimelineRelationRecordIds),
      ),
      wikiProjectRecordIds: uniqueSorted(
        group.flatMap((entry) => entry.assertion.wikiProjectRecordIds),
      ),
      wikiSubjectRecordIds: uniqueSorted(
        group.flatMap((entry) => entry.assertion.wikiSubjectRecordIds),
      ),
      wikiRouteRecordIds: uniqueSorted(
        group.flatMap((entry) => entry.assertion.wikiRouteRecordIds),
      ),
      wikiUnmatchedRouteRecordIds: uniqueSorted(
        group.flatMap((entry) => entry.assertion.wikiUnmatchedRouteRecordIds),
      ),
      wikiSourceIds: sourceIds,
    };
    const provisional = yield* decodeStrict({
      schema: WikiOperationalDateAssertionSchema,
      value: mergedValue,
      operation: "mergeExactOperationalAnchors",
      path: base.wikiAnchorArtifactPath,
    });
    const assertion = yield* decodeStrict({
      schema: WikiOperationalDateAssertionSchema,
      value: { ...provisional, causalAnchorEligible: locallyEligible(provisional) },
      operation: "mergeExactOperationalAnchors",
      path: base.wikiAnchorArtifactPath,
    });
    assertions.push({ assertion, candidateDate: first.candidateDate, dedupeKey });
  }
  return {
    assertions: assertions.toSorted((left, right) =>
      left.assertion.surfaceId.localeCompare(right.assertion.surfaceId),
    ),
    duplicateGroupCount,
    duplicateRowCount,
  };
});

const quarantineCrossDateGroups = Effect.fn("MtaWikiOperationalAnchors.quarantineCrossDateGroups")(
  function* (entries: readonly AdaptedAssertion[]) {
    const byChange = new Map<string, AdaptedAssertion[]>();
    for (const entry of entries) {
      const group = byChange.get(entry.assertion.operationalChangeId) ?? [];
      group.push(entry);
      byChange.set(entry.assertion.operationalChangeId, group);
    }
    const output: AdaptedAssertion[] = [];
    const conflicts: Array<typeof OperationalAnchorConflictSchema.Type> = [];
    for (const [operationalChangeId, group] of [...byChange.entries()].toSorted(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const dates = [...new Set(group.map((entry) => entry.candidateDate))].toSorted(
        (left, right) => (left ?? "").localeCompare(right ?? ""),
      );
      if (dates.length <= 1) {
        output.push(...group);
        continue;
      }
      const anchorIds = uniqueSorted(group.flatMap((entry) => entry.assertion.wikiAnchorIds));
      conflicts.push({
        operationalChangeId,
        anchorIds,
        candidateOperationalDates: dates,
        reason: "cross_anchor_date_conflict",
      });
      for (const entry of group) {
        const provisional = yield* decodeStrict({
          schema: WikiOperationalDateAssertionSchema,
          value: {
            ...entry.assertion,
            causalAnchorEligible: false,
            conflictStates: uniqueSorted([...entry.assertion.conflictStates, "date_conflict"]),
            exclusionReasons: uniqueSorted([
              ...entry.assertion.exclusionReasons,
              "conflicting_date_evidence",
            ]),
            classificationReasons: uniqueSorted([
              ...entry.assertion.classificationReasons,
              "local quarantine: operational change has conflicting dates across anchors",
            ]),
          },
          operation: "quarantineCrossDateOperationalAnchors",
          path: entry.assertion.wikiAnchorArtifactPath,
        });
        const assertion = yield* decodeStrict({
          schema: WikiOperationalDateAssertionSchema,
          value: { ...provisional, causalAnchorEligible: locallyEligible(provisional) },
          operation: "quarantineCrossDateOperationalAnchors",
          path: entry.assertion.wikiAnchorArtifactPath,
        });
        output.push({ ...entry, assertion });
      }
    }
    return {
      assertions: output.toSorted((left, right) =>
        left.assertion.surfaceId.localeCompare(right.assertion.surfaceId),
      ),
      conflicts,
    };
  },
);

const buildImportArtifact = Effect.fn("MtaWikiOperationalAnchors.buildImportArtifact")(
  function* (input: {
    manifest: ReleaseManifest;
    manifestSha256: string;
    anchorFile: VerifiedReleaseFile;
    summaryFile: VerifiedReleaseFile;
    reviewDecisionFile: VerifiedReleaseFile;
    reviewSnapshot: OperationalAnchorReviewSnapshot;
    producerSummary: OperationalAnchorSummary;
    rows: readonly OperationalAnchorRow[];
  }) {
    const adapted: AdaptedAssertion[] = [];
    for (const row of input.rows) {
      adapted.push(
        yield* adaptRow({
          row,
          release: input.manifest,
          manifestSha256: input.manifestSha256,
          anchorFile: input.anchorFile,
        }),
      );
    }
    const deduped = yield* mergeExactDuplicates(adapted);
    const quarantined = yield* quarantineCrossDateGroups(deduped.assertions);
    const assertions = quarantined.assertions.map((entry) => entry.assertion);
    const rejections = assertions
      .filter((assertion) => !assertion.causalAnchorEligible)
      .map((assertion) => ({
        operationalChangeId: assertion.operationalChangeId,
        anchorIds: assertion.wikiAnchorIds,
        reasonCodes: localRejectionReasons(assertion),
      }))
      .toSorted(
        (left, right) =>
          left.operationalChangeId.localeCompare(right.operationalChangeId) ||
          (left.anchorIds[0] ?? "").localeCompare(right.anchorIds[0] ?? ""),
      );
    const countsByRejectionReason = countBy(rejections.flatMap((entry) => entry.reasonCodes));
    const artifactValue: unknown = {
      artifactKind: "bp.studio.mta_wiki_operational_date_assertions.v2",
      schemaVersion: 2,
      sourceRelease: {
        manifestVersion: MANIFEST_VERSION,
        releaseId: input.manifest.release_id,
        generatorCommit: input.manifest.generator_commit,
        manifestPath: releaseArtifactPath(input.manifest.release_id, "manifest.json"),
        manifestSha256: input.manifestSha256,
        operationalAnchorContractVersion: OPERATIONAL_ANCHOR_CONTRACT_VERSION,
        operationalAnchorReviewDecisionContractVersion: OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION,
        anchors: {
          pointer: input.anchorFile.pointer,
          path: releaseArtifactPath(input.manifest.release_id, input.anchorFile.pointer),
          bytes: input.anchorFile.metadata.bytes,
          sha256: input.anchorFile.metadata.sha256,
        },
        summary: {
          pointer: input.summaryFile.pointer,
          path: releaseArtifactPath(input.manifest.release_id, input.summaryFile.pointer),
          bytes: input.summaryFile.metadata.bytes,
          sha256: input.summaryFile.metadata.sha256,
        },
        reviewDecisions: {
          pointer: input.reviewDecisionFile.pointer,
          path: releaseArtifactPath(input.manifest.release_id, input.reviewDecisionFile.pointer),
          bytes: input.reviewDecisionFile.metadata.bytes,
          sha256: input.reviewDecisionFile.metadata.sha256,
        },
        reviewDecisionCount: input.reviewSnapshot.decision_count,
      },
      producerSummary: input.producerSummary,
      summary: {
        sourceRowCount: input.rows.length,
        assertionCount: assertions.length,
        eligibleAssertionCount: assertions.filter((assertion) => assertion.causalAnchorEligible)
          .length,
        rejectedAssertionCount: rejections.length,
        rejectedAnchorCount: rejections.reduce((sum, entry) => sum + entry.anchorIds.length, 0),
        exactDuplicateGroupCount: deduped.duplicateGroupCount,
        exactDuplicateRowCount: deduped.duplicateRowCount,
        crossDateConflictGroupCount: quarantined.conflicts.length,
        countsByRejectionReason,
      },
      assertions,
      rejections,
      conflicts: quarantined.conflicts,
    };
    return yield* decodeStrict({
      schema: MtaWikiOperationalAnchorImportArtifactSchema,
      value: artifactValue,
      operation: "buildImportArtifact",
      path: input.anchorFile.path,
    });
  },
);

export const importMtaWikiOperationalAnchors = Effect.fn("importMtaWikiOperationalAnchors")(
  function* (input: ImportMtaWikiOperationalAnchorsInput) {
    const { releaseDirectory, canonicalReleaseDirectory } = yield* resolveReleaseDirectory(input);
    const manifestPath = yield* safeReleaseFilePath({
      releaseDirectory,
      canonicalReleaseDirectory,
      pointer: "manifest.json",
      operation: "readManifest",
    });
    const manifestBytes = yield* readBytes(manifestPath, "readManifest");
    const actualManifestSha256 = sha256(manifestBytes);
    if (actualManifestSha256 !== input.wikiManifestSha256) {
      return yield* Effect.fail(
        importError({
          code: "hash_mismatch",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `expected ${input.wikiManifestSha256}, received ${actualManifestSha256}`,
        }),
      );
    }
    const manifestText = yield* decodeUtf8(manifestBytes, {
      operation: "decodeManifest",
      path: manifestPath,
    });
    const manifestValue = yield* parseJson(manifestText, {
      operation: "decodeManifest",
      path: manifestPath,
    });
    const manifest = yield* decodeStrict({
      schema: ReleaseManifestSchema,
      value: manifestValue,
      operation: "decodeManifest",
      path: manifestPath,
    });
    if (manifest.release_id !== input.wikiRelease) {
      return yield* Effect.fail(
        importError({
          code: "release_mismatch",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `expected release_id ${input.wikiRelease}, received ${manifest.release_id}`,
        }),
      );
    }
    const operationalPointers = [
      manifest.pointers.operational_anchors,
      manifest.pointers.operational_anchor_summary,
      manifest.pointers.operational_anchor_review_decisions,
    ];
    if (new Set(operationalPointers).size !== operationalPointers.length) {
      return yield* Effect.fail(
        importError({
          code: "invalid_input",
          operation: "verifyManifest",
          path: manifestPath,
          detail:
            "operational anchor, summary, and review-decision pointers must be different files",
        }),
      );
    }

    const anchorMetadata = manifest.files[manifest.pointers.operational_anchors];
    if (anchorMetadata === undefined) {
      return yield* Effect.fail(
        importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `files is missing ${manifest.pointers.operational_anchors}`,
        }),
      );
    }
    const summaryMetadata = manifest.files[manifest.pointers.operational_anchor_summary];
    if (summaryMetadata === undefined) {
      return yield* Effect.fail(
        importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `files is missing ${manifest.pointers.operational_anchor_summary}`,
        }),
      );
    }
    const reviewDecisionMetadata =
      manifest.files[manifest.pointers.operational_anchor_review_decisions];
    if (reviewDecisionMetadata === undefined) {
      return yield* Effect.fail(
        importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `files is missing ${manifest.pointers.operational_anchor_review_decisions}`,
        }),
      );
    }
    const anchorFile = yield* verifyReleaseFile({
      releaseDirectory,
      canonicalReleaseDirectory,
      pointer: manifest.pointers.operational_anchors,
      metadata: anchorMetadata,
      operation: "verifyOperationalAnchors",
    });
    const summaryFile = yield* verifyReleaseFile({
      releaseDirectory,
      canonicalReleaseDirectory,
      pointer: manifest.pointers.operational_anchor_summary,
      metadata: summaryMetadata,
      operation: "verifyOperationalAnchorSummary",
    });
    const reviewDecisionFile = yield* verifyReleaseFile({
      releaseDirectory,
      canonicalReleaseDirectory,
      pointer: manifest.pointers.operational_anchor_review_decisions,
      metadata: reviewDecisionMetadata,
      operation: "verifyOperationalAnchorReviewDecisions",
    });
    const rows = yield* decodeOperationalAnchorRows(anchorFile);
    const producerSummary = yield* decodeOperationalAnchorSummary(summaryFile);
    const reviewSnapshot = yield* decodeOperationalAnchorReviewSnapshot(reviewDecisionFile);
    yield* validateProducerSummary(rows, producerSummary, manifest, summaryFile.path);
    yield* validateOperationalAnchorReviewSnapshot({
      snapshot: reviewSnapshot,
      rows,
      path: reviewDecisionFile.path,
    });
    const artifact = yield* buildImportArtifact({
      manifest,
      manifestSha256: actualManifestSha256,
      anchorFile,
      summaryFile,
      reviewDecisionFile,
      reviewSnapshot,
      producerSummary,
      rows,
    });

    const files = yield* PipelineFileSystemService;
    yield* files
      .writeText({
        command: COMMAND,
        operation: "writeImportArtifact",
        path: input.output,
        contents: artifactJson(artifact),
      })
      .pipe(
        Effect.mapError((cause) =>
          importError({
            code: "write_failed",
            operation: "writeImportArtifact",
            path: input.output,
            detail: String(cause),
          }),
        ),
      );
    return artifact;
  },
);

export function runMtaWikiOperationalAnchorImport(
  input: ImportMtaWikiOperationalAnchorsInput,
): Promise<MtaWikiOperationalAnchorImportArtifact> {
  return runPipelineEffect(importMtaWikiOperationalAnchors(input), PipelineFileSystemLayer);
}
