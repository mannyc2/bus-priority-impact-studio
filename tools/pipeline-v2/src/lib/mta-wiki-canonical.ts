import { dirname, isAbsolute, join } from "node:path";
import { decodeEitherStrip } from "@bp/domain/decode";
import { Result, Schema } from "effect";
import { runPipelineFileSystemBoundary } from "../effect/file-system.ts";
import { fromCliPath, repoRoot } from "./paths.ts";

export type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type MtaWikiEvidenceRef = JsonObject & {
  source_id?: JsonValue;
  evidence_id?: JsonValue;
  source_path?: JsonValue;
  page_number?: JsonValue;
  block_id?: JsonValue;
  text_sha256?: JsonValue;
};

export type MtaWikiCanonicalRecord = {
  record_id: string;
  record_kind: string;
  display_name?: string | undefined;
  source_id?: string | undefined;
  source_ids?: string[] | undefined;
  payload?: JsonObject | undefined;
  evidence_refs?: MtaWikiEvidenceRef[] | undefined;
};

const MtaWikiRouteAnchorSchema = Schema.Struct({
  gtfs_route_id: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
  canonical_route_record_id: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
  variant_record_ids: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  aliases: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  disposition: Schema.String.check(Schema.isMinLength(1)),
  anchor_reason: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
});

export type MtaWikiRouteAnchor = typeof MtaWikiRouteAnchorSchema.Type;

export type MtaWikiCanonicalCorpus = {
  root: string;
  canonicalRoot: string;
  wikiRelease?: string | undefined;
  sources: MtaWikiCanonicalRecord[];
  routes: MtaWikiCanonicalRecord[];
  projects: MtaWikiCanonicalRecord[];
  events: MtaWikiCanonicalRecord[];
  metricClaims: MtaWikiCanonicalRecord[];
  relations: MtaWikiCanonicalRecord[];
  treatmentComponents: MtaWikiCanonicalRecord[];
  sourceGaps: MtaWikiCanonicalRecord[];
  routeAnchors: MtaWikiRouteAnchor[];
};

export const MTA_WIKI_CANONICAL_FILES = {
  sources: "sources.jsonl",
  routes: "routes.jsonl",
  projects: "projects.jsonl",
  events: "events.jsonl",
  metricClaims: "metric_claims.jsonl",
  relations: "relations.jsonl",
  treatmentComponents: "treatment_components.jsonl",
  sourceGaps: "source_gaps.jsonl",
} as const;

export const MTA_WIKI_ROUTE_ANCHORS_FILE = "route_anchors.jsonl";

const RouteTokenPattern = /\b(?:SIM|BXM|BM|QM|BX|B|M|Q|S|X)\d{1,3}[A-Z]?(?:\+|[-\s]?SBS)?\b/giu;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length === value.length ? strings : undefined;
}

function evidenceRefsValue(value: unknown): MtaWikiEvidenceRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isJsonObject);
}

function canonicalRecordValue(
  value: unknown,
  path: string,
  lineNumber: number,
): MtaWikiCanonicalRecord {
  if (!isJsonObject(value)) {
    throw new Error(`Failed to parse ${path}:${lineNumber}: record must be an object`);
  }
  const recordId = stringValue(value["record_id"]);
  const recordKind = stringValue(value["record_kind"]);
  if (recordId === undefined || recordKind === undefined) {
    throw new Error(
      `Failed to parse ${path}:${lineNumber}: record_id and record_kind are required strings`,
    );
  }
  const payload = isJsonObject(value["payload"]) ? value["payload"] : undefined;
  const displayName = stringValue(value["display_name"]);
  const sourceId = stringValue(value["source_id"]);
  const sourceIds = stringArrayValue(value["source_ids"]);
  const evidenceRefs = evidenceRefsValue(value["evidence_refs"]);
  return {
    record_id: recordId,
    record_kind: recordKind,
    ...(displayName === undefined ? {} : { display_name: displayName }),
    ...(sourceId === undefined ? {} : { source_id: sourceId }),
    ...(sourceIds === undefined ? {} : { source_ids: sourceIds }),
    ...(payload === undefined ? {} : { payload }),
    ...(evidenceRefs === undefined ? {} : { evidence_refs: evidenceRefs }),
  };
}

export function defaultMtaWikiRoot(): string {
  return process.env["MTA_WIKI_ROOT"] ?? join(dirname(repoRoot), "mta-wiki");
}

export function resolveMtaWikiRoot(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) return defaultMtaWikiRoot();
  return isAbsolute(value) ? value : fromCliPath(value);
}

export function mtaWikiCanonicalPath(root: string, fileName: string): string {
  return join(root, "data", "canonical", fileName);
}

export function mtaWikiReleasePath(root: string, releaseId: string): string {
  return join(root, "data", "exports", "releases", releaseId);
}

async function readTextIfExists(path: string): Promise<string | null> {
  return runPipelineFileSystemBoundary({
    command: "studio.import-mta-wiki-route-evidence",
    operation: "readCanonicalJsonl",
    run: (files) =>
      files.readTextIfExists({
        command: "studio.import-mta-wiki-route-evidence",
        operation: "readCanonicalJsonl",
        path,
      }),
  });
}

export function parseMtaWikiJsonlRecords(text: string, path: string): MtaWikiCanonicalRecord[] {
  const records: MtaWikiCanonicalRecord[] = [];
  let lineNumber = 0;
  for (const line of text.split(/\r?\n/u)) {
    lineNumber += 1;
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse ${path}:${lineNumber}: ${message}`);
    }
    records.push(canonicalRecordValue(parsed, path, lineNumber));
  }
  return records;
}

export async function readMtaWikiJsonlRecords(path: string): Promise<MtaWikiCanonicalRecord[]> {
  const text = await readTextIfExists(path);
  if (text === null) throw new Error(`mta-wiki canonical JSONL not found: ${path}`);
  return parseMtaWikiJsonlRecords(text, path);
}

function routeAnchorValue(value: unknown, path: string, lineNumber: number): MtaWikiRouteAnchor {
  const parsed = decodeEitherStrip(MtaWikiRouteAnchorSchema)(value);
  if (Result.isFailure(parsed)) {
    throw new Error(`Failed to parse ${path}:${lineNumber}: ${String(parsed.failure)}`);
  }
  return parsed.success;
}

export async function readMtaWikiRouteAnchors(path: string): Promise<MtaWikiRouteAnchor[]> {
  const text = await readTextIfExists(path);
  if (text === null) return [];
  const anchors: MtaWikiRouteAnchor[] = [];
  let lineNumber = 0;
  for (const line of text.split(/\r?\n/u)) {
    lineNumber += 1;
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse ${path}:${lineNumber}: ${message}`);
    }
    anchors.push(routeAnchorValue(parsed, path, lineNumber));
  }
  return anchors;
}

export async function loadMtaWikiCanonicalCorpus(
  rootInput: string | undefined,
  options: { wikiRelease?: string | undefined } = {},
): Promise<MtaWikiCanonicalCorpus> {
  const root = resolveMtaWikiRoot(rootInput);
  const canonicalRoot =
    options.wikiRelease === undefined
      ? join(root, "data", "canonical")
      : mtaWikiReleasePath(root, options.wikiRelease);
  return {
    root,
    canonicalRoot,
    ...(options.wikiRelease === undefined ? {} : { wikiRelease: options.wikiRelease }),
    sources: await readMtaWikiJsonlRecords(join(canonicalRoot, MTA_WIKI_CANONICAL_FILES.sources)),
    routes: await readMtaWikiJsonlRecords(join(canonicalRoot, MTA_WIKI_CANONICAL_FILES.routes)),
    projects: await readMtaWikiJsonlRecords(join(canonicalRoot, MTA_WIKI_CANONICAL_FILES.projects)),
    events: await readMtaWikiJsonlRecords(join(canonicalRoot, MTA_WIKI_CANONICAL_FILES.events)),
    metricClaims: await readMtaWikiJsonlRecords(
      join(canonicalRoot, MTA_WIKI_CANONICAL_FILES.metricClaims),
    ),
    relations: await readMtaWikiJsonlRecords(
      join(canonicalRoot, MTA_WIKI_CANONICAL_FILES.relations),
    ),
    treatmentComponents: await readMtaWikiJsonlRecords(
      join(canonicalRoot, MTA_WIKI_CANONICAL_FILES.treatmentComponents),
    ),
    sourceGaps: await readMtaWikiJsonlRecords(
      join(canonicalRoot, MTA_WIKI_CANONICAL_FILES.sourceGaps),
    ),
    routeAnchors: await readMtaWikiRouteAnchors(join(canonicalRoot, MTA_WIKI_ROUTE_ANCHORS_FILE)),
  };
}

const VERIFIED_CANONICAL_FILES = {
  sources: { fileName: "sources.jsonl", recordKind: "source" },
  routes: { fileName: "routes.jsonl", recordKind: "route" },
  projects: { fileName: "projects.jsonl", recordKind: "project" },
  events: { fileName: "events.jsonl", recordKind: "event" },
  metricClaims: { fileName: "metric_claims.jsonl", recordKind: "metric_claim" },
  relations: { fileName: "relations.jsonl", recordKind: "relation" },
  treatmentComponents: {
    fileName: "treatment_components.jsonl",
    recordKind: "treatment_component",
  },
  sourceGaps: { fileName: "source_gaps.jsonl", recordKind: "source_gap" },
} as const;

function canonicalStableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Canonical JSON cannot encode undefined");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalStableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalStableJson(entry)}`)
    .join(",")}}`;
}

function decodeVerifiedCanonicalFile(input: {
  bytes: Uint8Array;
  path: string;
  recordKind: string;
  expectedCount: number | undefined;
}): MtaWikiCanonicalRecord[] {
  if (input.expectedCount === undefined) {
    throw new Error(`MTA Wiki manifest is missing record count for ${input.recordKind}`);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
  } catch (cause) {
    throw new Error(`${input.path}: invalid UTF-8: ${String(cause)}`);
  }
  if (text.length > 0 && (!text.endsWith("\n") || text.includes("\r") || text.includes("\n\n"))) {
    throw new Error(`${input.path}: expected canonical LF-terminated JSONL bytes`);
  }
  if (text.length > 0) {
    for (const [index, line] of text.slice(0, -1).split("\n").entries()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (cause) {
        throw new Error(`${input.path}:${index + 1}: invalid canonical JSON: ${String(cause)}`);
      }
      if (canonicalStableJson(parsed) !== line) {
        throw new Error(`${input.path}:${index + 1}: expected canonical stable JSON`);
      }
    }
  }
  const records = parseMtaWikiJsonlRecords(text, input.path);
  if (records.length !== input.expectedCount) {
    throw new Error(
      `${input.path}: logical row count mismatch; expected ${input.expectedCount}, received ${records.length}`,
    );
  }
  const wrongKind = records.find((record) => record.record_kind !== input.recordKind);
  if (wrongKind !== undefined) {
    throw new Error(
      `${input.path}: record ${wrongKind.record_id} has kind ${wrongKind.record_kind}, expected ${input.recordKind}`,
    );
  }
  return records;
}

export function loadMtaWikiCanonicalCorpusFromVerifiedRelease(input: {
  root: string;
  releaseDirectory: string;
  wikiRelease: string;
  files: Readonly<Record<string, Uint8Array>>;
  recordCounts: Readonly<Record<string, number>>;
  routeAnchors: MtaWikiRouteAnchor[];
}): MtaWikiCanonicalCorpus {
  const decoded = Object.fromEntries(
    Object.entries(VERIFIED_CANONICAL_FILES).map(([key, descriptor]) => {
      const bytes = input.files[descriptor.fileName];
      if (bytes === undefined) {
        throw new Error(`Missing verified MTA Wiki canonical bytes for ${descriptor.fileName}`);
      }
      return [
        key,
        decodeVerifiedCanonicalFile({
          bytes,
          path: join(input.releaseDirectory, descriptor.fileName),
          recordKind: descriptor.recordKind,
          expectedCount: input.recordCounts[descriptor.recordKind],
        }),
      ];
    }),
  ) as Pick<
    MtaWikiCanonicalCorpus,
    | "sources"
    | "routes"
    | "projects"
    | "events"
    | "metricClaims"
    | "relations"
    | "treatmentComponents"
    | "sourceGaps"
  >;
  return {
    root: input.root,
    canonicalRoot: input.releaseDirectory,
    wikiRelease: input.wikiRelease,
    ...decoded,
    routeAnchors: [...input.routeAnchors],
  };
}

export function normalizeBusRouteKey(value: string): string | null {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/\bSELECT\s+BUS\s+SERVICE\b/gu, "SBS")
    .replace(/[^A-Z0-9+]/gu, "");
  if (normalized.length === 0) return null;
  const withoutSbs = normalized.replace(/\+$/u, "").replace(/SBS$/u, "");
  return withoutSbs.length === 0 ? null : withoutSbs;
}

export function busRouteKeysFromText(value: string): Set<string> {
  const keys = new Set<string>();
  const whole = normalizeBusRouteKey(value);
  if (whole !== null) keys.add(whole);
  for (const match of value.matchAll(RouteTokenPattern)) {
    const routeKey = normalizeBusRouteKey(match[0]);
    if (routeKey !== null) keys.add(routeKey);
  }
  return keys;
}

export function busRouteKeysFromValue(value: JsonValue | undefined): Set<string> {
  const keys = new Set<string>();
  const visit = (candidate: JsonValue | undefined): void => {
    if (candidate === undefined || candidate === null) return;
    if (typeof candidate === "string") {
      for (const key of busRouteKeysFromText(candidate)) keys.add(key);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (typeof candidate === "object") {
      for (const item of Object.values(candidate)) visit(item);
    }
  };
  visit(value);
  return keys;
}
