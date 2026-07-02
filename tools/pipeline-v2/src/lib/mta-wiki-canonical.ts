import { dirname, isAbsolute, join } from "node:path";
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

export type MtaWikiCanonicalCorpus = {
  root: string;
  canonicalRoot: string;
  sources: MtaWikiCanonicalRecord[];
  routes: MtaWikiCanonicalRecord[];
  projects: MtaWikiCanonicalRecord[];
  events: MtaWikiCanonicalRecord[];
  metricClaims: MtaWikiCanonicalRecord[];
  relations: MtaWikiCanonicalRecord[];
  treatmentComponents: MtaWikiCanonicalRecord[];
  sourceGaps: MtaWikiCanonicalRecord[];
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

export async function readMtaWikiJsonlRecords(path: string): Promise<MtaWikiCanonicalRecord[]> {
  const text = await runPipelineFileSystemBoundary({
    command: "studio.import-mta-wiki-route-evidence",
    operation: "readCanonicalJsonl",
    run: (files) =>
      files.readTextIfExists({
        command: "studio.import-mta-wiki-route-evidence",
        operation: "readCanonicalJsonl",
        path,
      }),
  });
  if (text === null) throw new Error(`mta-wiki canonical JSONL not found: ${path}`);
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

export async function loadMtaWikiCanonicalCorpus(
  rootInput: string | undefined,
): Promise<MtaWikiCanonicalCorpus> {
  const root = resolveMtaWikiRoot(rootInput);
  const canonicalRoot = join(root, "data", "canonical");
  return {
    root,
    canonicalRoot,
    sources: await readMtaWikiJsonlRecords(
      mtaWikiCanonicalPath(root, MTA_WIKI_CANONICAL_FILES.sources),
    ),
    routes: await readMtaWikiJsonlRecords(
      mtaWikiCanonicalPath(root, MTA_WIKI_CANONICAL_FILES.routes),
    ),
    projects: await readMtaWikiJsonlRecords(
      mtaWikiCanonicalPath(root, MTA_WIKI_CANONICAL_FILES.projects),
    ),
    events: await readMtaWikiJsonlRecords(
      mtaWikiCanonicalPath(root, MTA_WIKI_CANONICAL_FILES.events),
    ),
    metricClaims: await readMtaWikiJsonlRecords(
      mtaWikiCanonicalPath(root, MTA_WIKI_CANONICAL_FILES.metricClaims),
    ),
    relations: await readMtaWikiJsonlRecords(
      mtaWikiCanonicalPath(root, MTA_WIKI_CANONICAL_FILES.relations),
    ),
    treatmentComponents: await readMtaWikiJsonlRecords(
      mtaWikiCanonicalPath(root, MTA_WIKI_CANONICAL_FILES.treatmentComponents),
    ),
    sourceGaps: await readMtaWikiJsonlRecords(
      mtaWikiCanonicalPath(root, MTA_WIKI_CANONICAL_FILES.sourceGaps),
    ),
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
