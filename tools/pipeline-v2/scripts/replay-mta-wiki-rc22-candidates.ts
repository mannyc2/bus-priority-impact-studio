import { decodeStrict } from "@bp/domain/decode";
import { MtaWikiOperationalOccurrenceImportArtifactV4Schema } from "@bp/domain/documents/operational-occurrence";
import { StudyEventMergeArtifactV3Schema } from "@bp/domain/studio/study";
import { Schema } from "effect";
import { readJsonArtifact, writeJson } from "../src/lib/json.ts";
import {
  buildStudyEventMergeArtifactV3,
  pinnedOccurrenceStudyInputV4,
} from "../src/lib/study-engine/study-events.ts";

const LogicalStudyMergeInputsSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.rc19_study_merge_logical_inputs.v1"),
  schemaVersion: Schema.Literal(1),
  summary: Schema.Struct({
    registryRowCount: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    availableAnalysisRouteIdCount: Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  registryRows: Schema.Array(
    Schema.Struct({
      event_id: Schema.String,
      route_id: Schema.String,
      intervention_type: Schema.String,
      source_id: Schema.String,
      program: Schema.String,
      implementation_date: Schema.String,
      implementation_month: Schema.String,
      event_status: Schema.String,
      description: Schema.String,
    }),
  ),
  availableAnalysisRouteIds: Schema.Array(Schema.String),
});

function parseArguments(argv: readonly string[]): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || value === undefined || !flag.startsWith("--")) {
      throw new Error(`Expected --flag value, received ${flag ?? "end of arguments"}`);
    }
    values.set(flag.slice(2), value);
  }
  return values;
}

function required(args: ReadonlyMap<string, string>, name: string): string {
  const value = args.get(name);
  if (value === undefined || value.length === 0) throw new Error(`Missing --${name}`);
  return value;
}

export async function replayRc22CandidateSet(argv: readonly string[]): Promise<void> {
  const args = parseArguments(argv);
  const wikiImport = await readJsonArtifact(
    required(args, "wiki-import"),
    MtaWikiOperationalOccurrenceImportArtifactV4Schema,
    "strict",
  );
  const logicalInputs = await readJsonArtifact(
    required(args, "logical-inputs"),
    LogicalStudyMergeInputsSchema,
    "strict",
  );
  if (
    logicalInputs.registryRows.length !== logicalInputs.summary.registryRowCount ||
    logicalInputs.availableAnalysisRouteIds.length !==
      logicalInputs.summary.availableAnalysisRouteIdCount ||
    new Set(logicalInputs.availableAnalysisRouteIds).size !==
      logicalInputs.availableAnalysisRouteIds.length
  ) {
    throw new Error("Logical study-merge snapshot counts or route identities drifted");
  }
  const artifact = buildStudyEventMergeArtifactV3({
    registryEvents: logicalInputs.registryRows,
    wiki: pinnedOccurrenceStudyInputV4(wikiImport),
    availableAnalysisRouteIds: new Set(logicalInputs.availableAnalysisRouteIds),
  });
  decodeStrict(StudyEventMergeArtifactV3Schema)(artifact);
  await writeJson(required(args, "output"), artifact);
}

if (import.meta.main) {
  await replayRc22CandidateSet(Bun.argv.slice(2));
}
