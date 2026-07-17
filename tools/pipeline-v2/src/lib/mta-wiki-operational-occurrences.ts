import {
  type MtaWikiOperationalOccurrenceImportArtifact,
  MtaWikiOperationalOccurrenceImportArtifactSchema,
  type OperationalOccurrenceEvidenceBinding,
  type OperationalOccurrenceReviewDecision,
  type OperationalOccurrenceReviewSnapshot,
  OperationalOccurrenceReviewSnapshotSchema,
  type OperationalOccurrenceRow,
  OperationalOccurrenceRowSchema,
  type OperationalOccurrenceSummary,
  OperationalOccurrenceSummarySchema,
} from "@bp/domain/documents/operational-occurrence";
import { Effect, Schema } from "effect";
import { PipelineFileSystemLayer, PipelineFileSystemService } from "../effect/file-system.ts";
import { runPipelineEffect } from "../effect/runtime.ts";
import {
  decodeMtaWikiReleaseUtf8,
  isSafeMtaWikiReleaseRelativePath,
  type MtaWikiReleaseVerificationError,
  readMtaWikiReleaseBytes,
  resolveMtaWikiRelease,
  safeMtaWikiReleaseFilePath,
  sha256Bytes,
  type VerifiedMtaWikiReleaseFile,
  verifyMtaWikiReleaseFile,
} from "./mta-wiki-release.ts";

export type { MtaWikiOperationalOccurrenceImportArtifact } from "@bp/domain/documents/operational-occurrence";

const COMMAND = "studio.import-mta-wiki-operational-occurrences";
const MANIFEST_VERSION = 3;
const OPERATIONAL_ANCHOR_CONTRACT_VERSION = 1;
const OPERATIONAL_ANCHOR_REVIEW_CONTRACT_VERSION = 1;
const OPERATIONAL_OCCURRENCE_CONTRACT_VERSION = 1;
const OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION = 1;

const SUPPORTED_BUNDLE_ANALYSIS_FAMILIES = new Set([
  "all_door_boarding",
  "automated_bus_lane_enforcement",
  "bus_lane",
  "busway",
  "off_board_fare_collection",
  "queue_jump",
  "route_redesign",
  "select_bus_service",
  "stop_change",
  "transit_signal_priority",
]);

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

const ReleaseManifestV3Schema = Schema.Struct({
  manifest_version: Schema.Literal(MANIFEST_VERSION),
  release_id: Schema.String,
  generator_commit: Schema.String,
  contract_versions: Schema.Struct({
    operational_anchors: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
    operational_anchor_review_decisions: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_CONTRACT_VERSION),
    operational_occurrences: Schema.Literal(OPERATIONAL_OCCURRENCE_CONTRACT_VERSION),
    operational_occurrence_review_decisions: Schema.Literal(
      OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION,
    ),
  }),
  record_counts: StringCountSchema,
  files: Schema.Record(Schema.String, ReleaseFileSchema),
  pointers: Schema.Struct({
    operational_anchors: Schema.String,
    operational_anchor_summary: Schema.String,
    operational_anchor_review_decisions: Schema.String,
    operational_occurrences: Schema.String,
    operational_occurrence_summary: Schema.String,
    operational_occurrence_review_decisions: Schema.String,
    route_anchors: Schema.NullOr(Schema.String),
    taxonomy: Schema.NullOr(Schema.String),
    quality_report: Schema.NullOr(Schema.String),
  }),
});
type ReleaseManifestV3 = typeof ReleaseManifestV3Schema.Type;

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
  "duplicate_occurrence_id",
  "semantic_mismatch",
  "write_failed",
]);

export class MtaWikiOperationalOccurrenceImportError extends Schema.TaggedErrorClass<MtaWikiOperationalOccurrenceImportError>()(
  "MtaWikiOperationalOccurrenceImportError",
  {
    code: ImportErrorCodeSchema,
    operation: Schema.String,
    path: Schema.String,
    line: Schema.NullOr(PositiveIntegerSchema),
    detail: Schema.String,
  },
) {}

export type ImportMtaWikiOperationalOccurrencesInput = {
  readonly mtaWikiRoot: string;
  readonly wikiRelease: string;
  readonly wikiManifestSha256: string;
  readonly output: string;
};

function importError(input: {
  code: typeof ImportErrorCodeSchema.Type;
  operation: string;
  path: string;
  detail: string;
  line?: number | null | undefined;
}): MtaWikiOperationalOccurrenceImportError {
  return MtaWikiOperationalOccurrenceImportError.make({ ...input, line: input.line ?? null });
}

function fromReleaseError(
  error: MtaWikiReleaseVerificationError,
): MtaWikiOperationalOccurrenceImportError {
  return importError({
    code: error.code,
    operation: error.operation,
    path: error.path,
    line: error.line,
    detail: error.detail,
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
}): Effect.Effect<S["Type"], MtaWikiOperationalOccurrenceImportError> {
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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function isSortedUnique(values: readonly string[]): boolean {
  return (
    values.length === new Set(values).size &&
    values.join("\n") === [...values].toSorted().join("\n")
  );
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function parseJson(
  text: string,
  input: { operation: string; path: string; line?: number | null | undefined },
): Effect.Effect<unknown, MtaWikiOperationalOccurrenceImportError> {
  return Effect.try({
    try: () => JSON.parse(text),
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

function validOnset(date: string, precision: "day" | "month"): boolean {
  if (precision === "month") return /^\d{4}-(?:0[1-9]|1[0-2])$/u.test(date);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (match === null) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function bindingKey(binding: OperationalOccurrenceEvidenceBinding): string {
  return canonicalJson(binding);
}

function bindingsAreCanonicalUnique(
  bindings: readonly OperationalOccurrenceEvidenceBinding[],
): boolean {
  return new Set(bindings.map(bindingKey)).size === bindings.length;
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

function stringsAreNonEmptyUnique(values: readonly string[], nonempty = false): boolean {
  return (
    (!nonempty || values.length > 0) &&
    values.every(isNonEmptyString) &&
    values.length === new Set(values).size
  );
}

function treatmentReviewShape(
  row: OperationalOccurrenceRow,
): OperationalOccurrenceReviewDecision["treatment"] {
  if (row.treatment.kind === "atomic") {
    return {
      kind: "atomic",
      member: {
        treatment_record_id: row.treatment.member.treatment_record_id,
        treatment_family: row.treatment.member.treatment_family,
        evidence_bindings: row.treatment.member.evidence_bindings,
      },
    };
  }
  return {
    kind: "bundle",
    bundle_family: row.treatment.bundle_family,
    bundle_family_evidence_bindings: row.treatment.bundle_family_evidence_bindings,
    members: row.treatment.members.map((member) => ({
      treatment_record_id: member.treatment_record_id,
      treatment_family: member.treatment_family,
      evidence_bindings: member.evidence_bindings,
    })),
  };
}

function rowSemanticError(input: { path: string; line: number; detail: string }) {
  return importError({
    code: "semantic_mismatch",
    operation: "validateOperationalOccurrence",
    ...input,
  });
}

function validateOccurrenceRow(
  row: OperationalOccurrenceRow,
  input: { path: string; line: number },
): Effect.Effect<void, MtaWikiOperationalOccurrenceImportError> {
  const fail = (detail: string) => Effect.fail(rowSemanticError({ ...input, detail }));
  const requiredScalars = [
    row.occurrence_id,
    row.occurrence_review_decision_id,
    row.founding_key,
    row.resolved_onset.date,
  ];
  if (
    requiredScalars.some((value) => !isNonEmptyString(value)) ||
    (row.resolution_cluster_id !== null && !isNonEmptyString(row.resolution_cluster_id))
  ) {
    return fail("occurrence identity and resolved-onset strings must be non-empty");
  }
  if (!validOnset(row.resolved_onset.date, row.resolved_onset.precision)) {
    return fail("resolved onset date disagrees with its day/month precision");
  }
  const sortedArrays: ReadonlyArray<readonly string[]> = [
    row.occurrence_aliases,
    row.resolved_onset.resolver_ids,
    row.resolved_onset.publication_dates,
    row.resolved_onset.retrieval_dates,
    row.source_ids,
    row.exclusion_reasons,
    row.provenance.anchor_review_decision_ids,
    row.provenance.event_record_ids,
    row.provenance.relation_record_ids,
    row.provenance.route_record_ids,
    row.provenance.treatment_record_ids,
  ];
  if (sortedArrays.some((values) => !isSortedUnique(values))) {
    return fail("identity, provenance, source, and exclusion arrays must be sorted and unique");
  }
  if (
    !stringsAreNonEmptyUnique(row.occurrence_aliases) ||
    !stringsAreNonEmptyUnique(row.resolved_onset.resolver_ids, true) ||
    !stringsAreNonEmptyUnique(row.resolved_onset.publication_dates) ||
    !stringsAreNonEmptyUnique(row.resolved_onset.retrieval_dates) ||
    !stringsAreNonEmptyUnique(row.source_ids, true) ||
    !stringsAreNonEmptyUnique(row.provenance.anchor_review_decision_ids) ||
    !stringsAreNonEmptyUnique(row.provenance.event_record_ids, true) ||
    !stringsAreNonEmptyUnique(row.provenance.relation_record_ids, true) ||
    !stringsAreNonEmptyUnique(row.provenance.route_record_ids, true) ||
    !stringsAreNonEmptyUnique(row.provenance.treatment_record_ids, true)
  ) {
    return fail(
      "occurrence id, source, resolver, date, and provenance arrays contain empty or duplicate values",
    );
  }
  if (row.occurrence_aliases.includes(row.occurrence_id)) {
    return fail("occurrence_aliases must not contain occurrence_id");
  }
  if (row.observations.length === 0) return fail("an occurrence must contain observations");
  for (const observation of row.observations) {
    if (
      !isNonEmptyString(observation.event_record_id) ||
      !stringsAreNonEmptyUnique(observation.relation_record_ids, true) ||
      !stringsAreNonEmptyUnique(observation.document_time_statuses) ||
      !stringsAreNonEmptyUnique(observation.status_as_of_dates) ||
      observation.document_time_dates.some(
        (date) =>
          !isNonEmptyString(date.raw) ||
          !isNonEmptyString(date.normalized) ||
          !isNonEmptyString(date.precision) ||
          !isNonEmptyString(date.source_field),
      )
    ) {
      return fail(
        "observation ids, dates, statuses, and relation arrays must contain non-empty unique values",
      );
    }
  }
  if (row.routes.length === 0) return fail("an occurrence must bind at least one route");
  for (const route of row.routes) {
    if (
      !isNonEmptyString(route.route_record_id) ||
      !isNonEmptyString(route.gtfs_route_id) ||
      route.evidence_bindings.length === 0 ||
      !bindingsAreCanonicalUnique(route.evidence_bindings)
    ) {
      return fail("route identity strings must be non-empty and evidence bindings unique");
    }
  }
  const routeRecordIds = row.routes.map((route) => route.route_record_id);
  const gtfsRouteIds = row.routes.map((route) => route.gtfs_route_id);
  if (!isSortedUnique(routeRecordIds) || new Set(gtfsRouteIds).size !== gtfsRouteIds.length) {
    return fail("routes must be sorted by unique route_record_id and have unique GTFS ids");
  }
  if (canonicalJson(routeRecordIds) !== canonicalJson(row.provenance.route_record_ids)) {
    return fail("route rows disagree with provenance.route_record_ids");
  }

  const eventIds = row.observations.map((observation) => observation.event_record_id);
  if (!isSortedUnique(eventIds))
    return fail("observations must be sorted by unique event_record_id");
  if (canonicalJson(eventIds) !== canonicalJson(row.provenance.event_record_ids)) {
    return fail("observations disagree with provenance.event_record_ids");
  }
  const relationIds = uniqueSorted(
    row.observations.flatMap((observation) => observation.relation_record_ids),
  );
  if (canonicalJson(relationIds) !== canonicalJson(row.provenance.relation_record_ids)) {
    return fail("observation relations disagree with provenance.relation_record_ids");
  }

  const members = row.treatment.kind === "atomic" ? [row.treatment.member] : row.treatment.members;
  if (members.length === 0) return fail("treatment scope must contain at least one member");
  if (row.treatment.kind === "bundle" && members.length < 2) {
    return fail("bundle treatment must contain at least two members");
  }
  const treatmentIds = members.map((member) => member.treatment_record_id);
  if (
    members.some(
      (member) =>
        !isNonEmptyString(member.treatment_record_id) ||
        !isNonEmptyString(member.treatment_family) ||
        member.evidence_bindings.length === 0 ||
        !bindingsAreCanonicalUnique(member.evidence_bindings),
    )
  ) {
    return fail("treatment identity strings must be non-empty and evidence bindings unique");
  }
  if (!isSortedUnique(treatmentIds)) return fail("treatment members must be sorted and unique");
  if (canonicalJson(treatmentIds) !== canonicalJson(row.provenance.treatment_record_ids)) {
    return fail("treatment members disagree with provenance.treatment_record_ids");
  }

  const topLevelBindingKeys = new Set(row.evidence_bindings.map(bindingKey));
  if (row.evidence_bindings.length === 0 || row.resolved_onset.evidence_bindings.length === 0) {
    return fail("occurrence and resolved-onset evidence arrays must be non-empty");
  }
  if (!bindingsAreCanonicalUnique(row.resolved_onset.evidence_bindings)) {
    return fail("resolved-onset evidence bindings must be unique");
  }
  if (topLevelBindingKeys.size !== row.evidence_bindings.length) {
    return fail("top-level evidence bindings must be unique");
  }
  const nestedBindings = [
    ...row.resolved_onset.evidence_bindings,
    ...row.routes.flatMap((route) => route.evidence_bindings),
    ...members.flatMap((member) => member.evidence_bindings),
    ...(row.treatment.kind === "bundle" ? row.treatment.bundle_family_evidence_bindings : []),
  ];
  for (const binding of nestedBindings) {
    if (!topLevelBindingKeys.has(bindingKey(binding))) {
      return fail(
        `nested evidence binding is absent from the occurrence evidence ledger: ${binding.evidence_id}`,
      );
    }
  }
  for (const binding of row.evidence_bindings) {
    if (
      !isNonEmptyString(binding.role) ||
      !isNonEmptyString(binding.record_id) ||
      !isNonEmptyString(binding.source_id) ||
      !isNonEmptyString(binding.evidence_id)
    ) {
      return fail("evidence binding fields must be non-empty");
    }
    if (!row.source_ids.includes(binding.source_id)) {
      return fail(`evidence binding source is absent from source_ids: ${binding.source_id}`);
    }
  }
  if (!row.resolved_onset.evidence_bindings.some((binding) => binding.role === "event_date")) {
    return fail("resolved onset must carry event_date evidence");
  }
  for (const route of row.routes) {
    const roles = new Set(route.evidence_bindings.map((binding) => binding.role));
    if (!roles.has("route_identity") || !roles.has("route_scope")) {
      return fail(`route ${route.route_record_id} lacks route_identity or route_scope evidence`);
    }
  }
  for (const member of members) {
    const roles = new Set(member.evidence_bindings.map((binding) => binding.role));
    if (!roles.has("treatment_definition") || !roles.has("treatment_scope")) {
      return fail(`treatment ${member.treatment_record_id} lacks definition or scope evidence`);
    }
  }

  if (
    row.treatment.kind === "bundle" &&
    !bindingsAreCanonicalUnique(row.treatment.bundle_family_evidence_bindings)
  ) {
    return fail("bundle_family_evidence_bindings must be unique");
  }
  if (
    row.treatment.kind === "bundle" &&
    row.treatment.bundle_family_evidence_bindings.some(
      (binding) => binding.role !== "bundle_analysis_family",
    )
  ) {
    return fail("bundle_family_evidence_bindings must all use bundle_analysis_family");
  }
  if (
    row.treatment.kind === "bundle" &&
    row.treatment.bundle_family !== null &&
    !isNonEmptyString(row.treatment.bundle_family)
  ) {
    return fail("bundle_family must be null or a non-empty string");
  }
  const bundleSupported =
    row.treatment.kind === "bundle" &&
    row.treatment.bundle_family !== null &&
    SUPPORTED_BUNDLE_ANALYSIS_FAMILIES.has(row.treatment.bundle_family) &&
    row.treatment.bundle_family_evidence_bindings.length > 0;
  const unsupportedBundle = row.treatment.kind === "bundle" && !bundleSupported;
  if (unsupportedBundle !== row.exclusion_reasons.includes("unsupported_bundle_analysis_family")) {
    return fail("bundle umbrella evidence disagrees with unsupported_bundle_analysis_family");
  }
  if (row.study_projection_eligible !== (row.exclusion_reasons.length === 0)) {
    return fail("study_projection_eligible disagrees with exclusion_reasons");
  }
  return Effect.void;
}

const decodeOccurrenceRows = Effect.fn("MtaWikiOperationalOccurrences.decodeRows")(function* (
  file: VerifiedMtaWikiReleaseFile,
) {
  const text = yield* decodeMtaWikiReleaseUtf8(file.bytes, {
    operation: "decodeOperationalOccurrences",
    path: file.path,
  }).pipe(Effect.mapError(fromReleaseError));
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const rows: OperationalOccurrenceRow[] = [];
  const ids = new Map<string, number>();
  const aliases = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (line.trim().length === 0) {
      return yield* importError({
        code: "invalid_json",
        operation: "decodeOperationalOccurrences",
        path: file.path,
        line: lineNumber,
        detail: "blank JSONL records are not allowed",
      });
    }
    const value = yield* parseJson(line, {
      operation: "decodeOperationalOccurrences",
      path: file.path,
      line: lineNumber,
    });
    const row = yield* decodeStrict({
      schema: OperationalOccurrenceRowSchema,
      value,
      operation: "decodeOperationalOccurrences",
      path: file.path,
      line: lineNumber,
    });
    yield* validateOccurrenceRow(row, { path: file.path, line: lineNumber });
    const prior = ids.get(row.occurrence_id);
    if (prior !== undefined) {
      return yield* importError({
        code: "duplicate_occurrence_id",
        operation: "decodeOperationalOccurrences",
        path: file.path,
        line: lineNumber,
        detail: `occurrence_id ${row.occurrence_id} already appeared on line ${prior}`,
      });
    }
    ids.set(row.occurrence_id, lineNumber);
    for (const alias of row.occurrence_aliases) {
      const aliasOwner = aliases.get(alias);
      if (aliasOwner !== undefined) {
        return yield* importError({
          code: "semantic_mismatch",
          operation: "decodeOperationalOccurrences",
          path: file.path,
          line: lineNumber,
          detail: `occurrence alias ${alias} already appeared on line ${aliasOwner}`,
        });
      }
      aliases.set(alias, lineNumber);
    }
    rows.push(row);
  }
  for (const [alias, line] of aliases) {
    if (ids.has(alias)) {
      return yield* importError({
        code: "semantic_mismatch",
        operation: "decodeOperationalOccurrences",
        path: file.path,
        line,
        detail: `occurrence alias collides with an active occurrence_id: ${alias}`,
      });
    }
  }
  return rows.toSorted((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
});

const decodeJsonFile = Effect.fn("MtaWikiOperationalOccurrences.decodeJsonFile")(function* <
  S extends Schema.Constraint,
>(file: VerifiedMtaWikiReleaseFile, schema: S, operation: string) {
  const text = yield* decodeMtaWikiReleaseUtf8(file.bytes, {
    operation,
    path: file.path,
  }).pipe(Effect.mapError(fromReleaseError));
  const value = yield* parseJson(text, { operation, path: file.path });
  return yield* decodeStrict({ schema, value, operation, path: file.path });
});

export function recomputeOperationalOccurrenceSummary(
  rows: readonly OperationalOccurrenceRow[],
): OperationalOccurrenceSummary {
  return {
    schema_version: 1,
    occurrence_count: rows.length,
    study_projection_eligible_count: rows.filter((row) => row.study_projection_eligible).length,
    atomic_count: rows.filter((row) => row.treatment.kind === "atomic").length,
    bundle_count: rows.filter((row) => row.treatment.kind === "bundle").length,
    multi_route_count: rows.filter((row) => row.routes.length > 1).length,
    candidate_projection_count: rows
      .filter((row) => row.study_projection_eligible)
      .reduce((sum, row) => sum + row.routes.length, 0),
    counts_by_exclusion_reason: countBy(rows.flatMap((row) => row.exclusion_reasons)),
  };
}

function validateSummary(
  rows: readonly OperationalOccurrenceRow[],
  summary: OperationalOccurrenceSummary,
  path: string,
): Effect.Effect<void, MtaWikiOperationalOccurrenceImportError> {
  const expected = recomputeOperationalOccurrenceSummary(rows);
  return canonicalJson(expected) === canonicalJson(summary)
    ? Effect.void
    : Effect.fail(
        importError({
          code: "summary_mismatch",
          operation: "validateOperationalOccurrenceSummary",
          path,
          detail: `producer summary does not match rows; expected ${canonicalJson(expected)}`,
        }),
      );
}

function validateReviewSnapshot(input: {
  rows: readonly OperationalOccurrenceRow[];
  snapshot: OperationalOccurrenceReviewSnapshot;
  path: string;
}): Effect.Effect<void, MtaWikiOperationalOccurrenceImportError> {
  const fail = (detail: string) =>
    Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalOccurrenceReviewSnapshot",
        path: input.path,
        detail,
      }),
    );
  if (input.snapshot.decision_count !== input.snapshot.decisions.length) {
    return fail("decision_count does not match decisions length");
  }
  const decisionIds = input.snapshot.decisions.map((decision) => decision.decision_id);
  if (!isSortedUnique(decisionIds)) return fail("review decisions must be sorted and unique");
  const byOccurrence = new Map<string, OperationalOccurrenceReviewDecision>();
  const byDecisionId = new Map<string, OperationalOccurrenceReviewDecision>();
  for (const decision of input.snapshot.decisions) {
    if (
      !isNonEmptyString(decision.decision_id) ||
      !isNonEmptyString(decision.occurrence_id) ||
      !isNonEmptyString(decision.founding_key) ||
      !stringsAreNonEmptyUnique(decision.anchor_review_decision_ids) ||
      decision.routes.length === 0 ||
      decision.resolved_onset.evidence_bindings.length === 0 ||
      decision.evidence_bindings.length === 0 ||
      !stringsAreNonEmptyUnique(decision.reviewers, true) ||
      !isNonEmptyString(decision.rationale)
    ) {
      return fail(
        `${decision.decision_id || "unnamed decision"} contains empty identity, route, evidence, reviewer, or rationale fields`,
      );
    }
    if (
      !bindingsAreCanonicalUnique(decision.resolved_onset.evidence_bindings) ||
      !bindingsAreCanonicalUnique(decision.evidence_bindings)
    ) {
      return fail(
        `${decision.decision_id} occurrence and resolved-onset evidence bindings must be unique`,
      );
    }
    if (
      decision.routes.some(
        (route) =>
          !isNonEmptyString(route.route_record_id) ||
          !isNonEmptyString(route.gtfs_route_id) ||
          route.evidence_bindings.length === 0,
      ) ||
      new Set(decision.routes.map((route) => route.route_record_id)).size !== decision.routes.length
    ) {
      return fail(`${decision.decision_id} routes must have non-empty, unique route identities`);
    }
    if (decision.routes.some((route) => !bindingsAreCanonicalUnique(route.evidence_bindings))) {
      return fail(`${decision.decision_id} route evidence bindings must be unique`);
    }
    const reviewMembers =
      decision.treatment.kind === "atomic"
        ? [decision.treatment.member]
        : decision.treatment.members;
    if (
      reviewMembers.length === 0 ||
      (decision.treatment.kind === "bundle" && reviewMembers.length < 2) ||
      reviewMembers.some(
        (member) =>
          !isNonEmptyString(member.treatment_record_id) ||
          !isNonEmptyString(member.treatment_family) ||
          member.evidence_bindings.length === 0,
      ) ||
      new Set(reviewMembers.map((member) => member.treatment_record_id)).size !==
        reviewMembers.length ||
      (decision.treatment.kind === "bundle" &&
        decision.treatment.bundle_family !== null &&
        !isNonEmptyString(decision.treatment.bundle_family)) ||
      (decision.treatment.kind === "bundle" &&
        decision.treatment.bundle_family_evidence_bindings.some(
          (binding) => binding.role !== "bundle_analysis_family",
        ))
    ) {
      return fail(`${decision.decision_id} treatment identity and member fields are invalid`);
    }
    if (
      reviewMembers.some((member) => !bindingsAreCanonicalUnique(member.evidence_bindings)) ||
      (decision.treatment.kind === "bundle" &&
        !bindingsAreCanonicalUnique(decision.treatment.bundle_family_evidence_bindings))
    ) {
      return fail(`${decision.decision_id} treatment evidence bindings must be unique`);
    }
    if (!validOnset(decision.resolved_onset.date, decision.resolved_onset.precision)) {
      return fail(`${decision.decision_id} has an invalid resolved onset`);
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(decision.accepted_at) ||
      Number.isNaN(Date.parse(decision.accepted_at))
    ) {
      return fail(`${decision.decision_id} accepted_at is not an ISO-8601 UTC timestamp`);
    }
    if (byOccurrence.has(decision.occurrence_id)) {
      return fail(`multiple review decisions bind occurrence ${decision.occurrence_id}`);
    }
    byOccurrence.set(decision.occurrence_id, decision);
    byDecisionId.set(decision.decision_id, decision);
  }
  for (const row of input.rows) {
    const decision = byOccurrence.get(row.occurrence_id);
    if (decision === undefined) {
      return fail(`approved occurrence ${row.occurrence_id} lacks a current review decision`);
    }
    if (byDecisionId.get(row.occurrence_review_decision_id) !== decision) {
      return fail(
        `occurrence ${row.occurrence_id} does not bind its approved review decision ${decision.decision_id}`,
      );
    }
    const expectedRoutes = row.routes.map((route) => ({
      route_record_id: route.route_record_id,
      gtfs_route_id: route.gtfs_route_id,
      evidence_bindings: route.evidence_bindings,
    }));
    if (
      decision.founding_key !== row.founding_key ||
      canonicalJson(decision.anchor_review_decision_ids) !==
        canonicalJson(row.provenance.anchor_review_decision_ids) ||
      canonicalJson(decision.resolved_onset) !==
        canonicalJson({
          date: row.resolved_onset.date,
          precision: row.resolved_onset.precision,
          evidence_bindings: row.resolved_onset.evidence_bindings,
        }) ||
      canonicalJson(decision.routes) !== canonicalJson(expectedRoutes) ||
      canonicalJson(decision.treatment) !== canonicalJson(treatmentReviewShape(row)) ||
      canonicalJson(decision.evidence_bindings) !== canonicalJson(row.evidence_bindings)
    ) {
      return fail(`review decision ${decision.decision_id} is stale for ${row.occurrence_id}`);
    }
  }
  for (const occurrenceId of byOccurrence.keys()) {
    if (!input.rows.some((row) => row.occurrence_id === occurrenceId)) {
      return fail(`review decision points to missing occurrence ${occurrenceId}`);
    }
  }
  return Effect.void;
}

function importedFile(file: VerifiedMtaWikiReleaseFile, releaseId: string) {
  return {
    pointer: file.pointer,
    path: `data/exports/releases/${releaseId}/${file.pointer}`,
    bytes: file.metadata.bytes,
    sha256: file.metadata.sha256,
  };
}

const buildImportArtifact = Effect.fn("MtaWikiOperationalOccurrences.buildArtifact")(
  function* (input: {
    manifest: ReleaseManifestV3;
    manifestSha256: string;
    occurrenceFile: VerifiedMtaWikiReleaseFile;
    summaryFile: VerifiedMtaWikiReleaseFile;
    reviewFile: VerifiedMtaWikiReleaseFile;
    summary: OperationalOccurrenceSummary;
    snapshot: OperationalOccurrenceReviewSnapshot;
    rows: readonly OperationalOccurrenceRow[];
  }) {
    const projectionRejections = input.rows
      .filter((row) => !row.study_projection_eligible)
      .map((row) => ({
        occurrenceId: row.occurrence_id,
        reasonCodes: uniqueSorted(row.exclusion_reasons),
      }));
    const value: unknown = {
      artifactKind: "bp.studio.mta_wiki_operational_occurrences.v3",
      schemaVersion: 3,
      sourceRelease: {
        manifestVersion: 3,
        releaseId: input.manifest.release_id,
        generatorCommit: input.manifest.generator_commit,
        manifestPath: `data/exports/releases/${input.manifest.release_id}/manifest.json`,
        manifestSha256: input.manifestSha256,
        operationalOccurrenceContractVersion: 1,
        operationalOccurrenceReviewDecisionContractVersion: 1,
        occurrences: importedFile(input.occurrenceFile, input.manifest.release_id),
        summary: importedFile(input.summaryFile, input.manifest.release_id),
        reviewDecisions: importedFile(input.reviewFile, input.manifest.release_id),
        reviewDecisionCount: input.snapshot.decision_count,
      },
      producerSummary: input.summary,
      summary: {
        sourceOccurrenceCount: input.rows.length,
        eligibleOccurrenceCount: input.rows.filter((row) => row.study_projection_eligible).length,
        routeProjectionCount: input.summary.candidate_projection_count,
        rejectedOccurrenceCount: projectionRejections.length,
        countsByRejectionReason: countBy(
          projectionRejections.flatMap((entry) => entry.reasonCodes),
        ),
      },
      occurrences: input.rows,
      projectionRejections,
    };
    return yield* decodeStrict({
      schema: MtaWikiOperationalOccurrenceImportArtifactSchema,
      value,
      operation: "buildOperationalOccurrenceImportArtifact",
      path: input.occurrenceFile.path,
    });
  },
);

export const importMtaWikiOperationalOccurrences = Effect.fn("importMtaWikiOperationalOccurrences")(
  function* (input: ImportMtaWikiOperationalOccurrencesInput) {
    const resolved = yield* resolveMtaWikiRelease(input).pipe(Effect.mapError(fromReleaseError));
    const manifestPath = yield* safeMtaWikiReleaseFilePath({
      ...resolved,
      pointer: "manifest.json",
      operation: "readManifest",
    }).pipe(Effect.mapError(fromReleaseError));
    const manifestBytes = yield* readMtaWikiReleaseBytes(manifestPath, "readManifest").pipe(
      Effect.mapError(fromReleaseError),
    );
    const actualManifestSha256 = sha256Bytes(manifestBytes);
    if (actualManifestSha256 !== input.wikiManifestSha256) {
      return yield* importError({
        code: "hash_mismatch",
        operation: "verifyManifest",
        path: manifestPath,
        detail: `expected ${input.wikiManifestSha256}, received ${actualManifestSha256}`,
      });
    }
    const manifestText = yield* decodeMtaWikiReleaseUtf8(manifestBytes, {
      operation: "decodeManifest",
      path: manifestPath,
    }).pipe(Effect.mapError(fromReleaseError));
    const manifestValue = yield* parseJson(manifestText, {
      operation: "decodeManifest",
      path: manifestPath,
    });
    const manifest = yield* decodeStrict({
      schema: ReleaseManifestV3Schema,
      value: manifestValue,
      operation: "decodeManifest",
      path: manifestPath,
    });
    if (manifest.release_id !== input.wikiRelease) {
      return yield* importError({
        code: "release_mismatch",
        operation: "verifyManifest",
        path: manifestPath,
        detail: `expected release_id ${input.wikiRelease}, received ${manifest.release_id}`,
      });
    }

    const unsafeFileKey = Object.keys(manifest.files).find(
      (pointer) => !isSafeMtaWikiReleaseRelativePath(pointer),
    );
    if (unsafeFileKey !== undefined) {
      return yield* importError({
        code: "unsafe_path",
        operation: "verifyManifest",
        path: manifestPath,
        detail: `manifest files contains an unsafe release-relative path: ${unsafeFileKey}`,
      });
    }
    const allPointers = Object.values(manifest.pointers).filter(
      (pointer): pointer is string => pointer !== null,
    );
    const unsafePointer = allPointers.find((pointer) => !isSafeMtaWikiReleaseRelativePath(pointer));
    if (unsafePointer !== undefined) {
      return yield* importError({
        code: "unsafe_path",
        operation: "verifyManifest",
        path: manifestPath,
        detail: `manifest pointers contains an unsafe release-relative path: ${unsafePointer}`,
      });
    }

    const addressed = [
      {
        pointer: manifest.pointers.operational_anchors,
        operation: "verifyOperationalAnchors",
      },
      {
        pointer: manifest.pointers.operational_anchor_summary,
        operation: "verifyOperationalAnchorSummary",
      },
      {
        pointer: manifest.pointers.operational_anchor_review_decisions,
        operation: "verifyOperationalAnchorReviewDecisions",
      },
      {
        pointer: manifest.pointers.operational_occurrences,
        operation: "verifyOperationalOccurrences",
      },
      {
        pointer: manifest.pointers.operational_occurrence_summary,
        operation: "verifyOperationalOccurrenceSummary",
      },
      {
        pointer: manifest.pointers.operational_occurrence_review_decisions,
        operation: "verifyOperationalOccurrenceReviewDecisions",
      },
    ] as const;
    const pointers = addressed.map(({ pointer }) => pointer);
    if (new Set(pointers).size !== pointers.length) {
      return yield* importError({
        code: "invalid_input",
        operation: "verifyManifest",
        path: manifestPath,
        detail: "all six anchor and occurrence dual-publish pointers must be different files",
      });
    }

    const verifiedFiles: VerifiedMtaWikiReleaseFile[] = [];
    for (const entry of addressed) {
      if (!Object.hasOwn(manifest.files, entry.pointer)) {
        return yield* importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `files is missing ${entry.pointer}`,
        });
      }
      const metadata = manifest.files[entry.pointer];
      if (metadata === undefined) {
        return yield* importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `files is missing ${entry.pointer}`,
        });
      }
      verifiedFiles.push(
        yield* verifyMtaWikiReleaseFile({
          ...resolved,
          pointer: entry.pointer,
          metadata,
          operation: entry.operation,
        }).pipe(Effect.mapError(fromReleaseError)),
      );
    }
    const occurrenceFile = verifiedFiles[3];
    const summaryFile = verifiedFiles[4];
    const reviewFile = verifiedFiles[5];
    if (occurrenceFile === undefined || summaryFile === undefined || reviewFile === undefined) {
      return yield* importError({
        code: "missing_manifest_file",
        operation: "verifyManifest",
        path: manifestPath,
        detail: "manifest occurrence file verification is incomplete",
      });
    }

    const rows = yield* decodeOccurrenceRows(occurrenceFile);
    const summary = yield* decodeJsonFile(
      summaryFile,
      OperationalOccurrenceSummarySchema,
      "decodeOperationalOccurrenceSummary",
    );
    const snapshot = yield* decodeJsonFile(
      reviewFile,
      OperationalOccurrenceReviewSnapshotSchema,
      "decodeOperationalOccurrenceReviewSnapshot",
    );
    yield* validateSummary(rows, summary, summaryFile.path);
    yield* validateReviewSnapshot({ rows, snapshot, path: reviewFile.path });
    const artifact = yield* buildImportArtifact({
      manifest,
      manifestSha256: actualManifestSha256,
      occurrenceFile,
      summaryFile,
      reviewFile,
      summary,
      snapshot,
      rows,
    });

    const files = yield* PipelineFileSystemService;
    yield* files
      .writeText({
        command: COMMAND,
        operation: "writeImportArtifact",
        path: input.output,
        contents: `${JSON.stringify(artifact, null, 2)}\n`,
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

export function runMtaWikiOperationalOccurrenceImport(
  input: ImportMtaWikiOperationalOccurrencesInput,
): Promise<MtaWikiOperationalOccurrenceImportArtifact> {
  return runPipelineEffect(importMtaWikiOperationalOccurrences(input), PipelineFileSystemLayer);
}
