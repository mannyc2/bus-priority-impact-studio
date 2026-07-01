// biome-ignore-all lint/suspicious/noAssignInExpressions: Legacy Tier 2 command code is pending plan 024 deletion; assignment-in-condition shape is unchanged.
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  classifyOperationalDate,
  computeCausalAnchorEligibility,
  type OperationalDateAssertion,
  operationalDateConfidence,
  parseOperationalDate,
} from "@bp/domain/documents/operational-date";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { classifyTier2Event, type DocumentDerivedEventSurface } from "./_event-route-resolution.ts";
import { latestDocsRunId, runArtifactRoot } from "./_shared.ts";

const ARTIFACT_KIND = "bp.tier2_document_operational_date_assertions.v1";
const DEFAULT_SURFACES_DIR = "document-derived-surfaces-v1";
const DEFAULT_OUTPUT_FILENAME = "document-operational-date-assertions-v1.json";
const DEFAULT_ROUTE_RESOLUTION_FILENAME = "document-event-route-resolution-v1.json";

type RouteJoinInfo = {
  routeIds: string[];
  routeIdentityValidationState: string | null;
  routeResolutionTier: string | null;
};

const EMPTY_ROUTE_JOIN: RouteJoinInfo = {
  routeIds: [],
  routeIdentityValidationState: null,
  routeResolutionTier: null,
};

async function loadRouteMap(path: string): Promise<Map<string, RouteJoinInfo>> {
  const map = new Map<string, RouteJoinInfo>();
  const file = Bun.file(path);
  if (!(await file.exists())) return map;
  const artifact = (await file.json()) as { rows?: unknown[] };
  for (const entry of artifact.rows ?? []) {
    const row = entry as Record<string, unknown>;
    const surfaceId = typeof row["surfaceId"] === "string" ? row["surfaceId"] : null;
    if (surfaceId === null) continue;
    const routeIds = Array.isArray(row["routeIds"])
      ? (row["routeIds"] as unknown[]).filter((value): value is string => typeof value === "string")
      : [];
    map.set(surfaceId, {
      routeIds,
      routeIdentityValidationState:
        typeof row["routeIdentityValidationState"] === "string"
          ? row["routeIdentityValidationState"]
          : null,
      routeResolutionTier:
        typeof row["routeResolutionTier"] === "string" ? row["routeResolutionTier"] : null,
    });
  }
  return map;
}

function shortHash(value: string, length = 16): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function normalizeLocation(text: string | null): string {
  return (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Canonical key so one real intervention (same family + month/year + route-or-location)
// collapses to one interventionId across the many source PDFs that mention it.
function interventionKey(input: {
  interventionFamily: string;
  implementationMonth: string | null;
  effectiveDateStart: string | null;
  routeIds: string[];
  locationText: string | null;
}): string {
  const datePart =
    input.implementationMonth ??
    (input.effectiveDateStart ? input.effectiveDateStart.slice(0, 4) : "nodate");
  const scopePart =
    input.routeIds.length > 0
      ? [...input.routeIds].sort().join(",")
      : normalizeLocation(input.locationText) || "noscope";
  return `${input.interventionFamily}|${datePart}|${scopePart}`;
}

type EvidenceRef = OperationalDateAssertion["evidenceRefs"][number];

export type OperationalDateAssertionsSummary = {
  inputEventCount: number;
  trustedOperationalDateCount: number;
  causalAnchorEligibleCount: number;
  routeLinkedTrustedCount: number;
  distinctInterventionCount: number;
  countsByValidationState: Record<string, number>;
  countsBySourceStatedStatus: Record<string, number>;
  countsByEventKind: Record<string, number>;
  trustedByNormalizedPrecision: Record<string, number>;
};

export type OperationalDateAssertionsArtifact = {
  artifactKind: string;
  schemaVersion: number;
  generatedAt: string;
  sourceSurfacesPath: string;
  routeResolutionPath: string;
  summary: OperationalDateAssertionsSummary;
  samples: Record<string, OperationalDateAssertion[]>;
  rows: OperationalDateAssertion[];
};

export type RunTier2OperationalDateAssertionsArgs = {
  surfacesDir: string;
  outputPath: string;
  eventsPath?: string;
  routeResolutionPath?: string;
  generatedAt?: string;
};

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function strField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

function numField(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key];
  return typeof value === "number" ? value : undefined;
}

function pickEvidenceRefs(value: unknown): EvidenceRef[] {
  if (!Array.isArray(value)) return [];
  const refs: EvidenceRef[] = [];
  for (const entry of value) {
    const ref = (entry ?? {}) as Record<string, unknown>;
    const out: EvidenceRef = {};
    const sourceId = strField(ref, "sourceId");
    const blockId = strField(ref, "blockId");
    const pageNumber = numField(ref, "pageNumber");
    const lineStart = numField(ref, "lineStart");
    const lineEnd = numField(ref, "lineEnd");
    const blockHash = strField(ref, "blockHash");
    const roleRaw = strField(ref, "roleRaw");
    if (sourceId !== undefined) out.sourceId = sourceId;
    if (blockId !== undefined) out.blockId = blockId;
    if (pageNumber !== undefined) out.pageNumber = pageNumber;
    if (lineStart !== undefined) out.lineStart = lineStart;
    if (lineEnd !== undefined) out.lineEnd = lineEnd;
    if (blockHash !== undefined) out.blockHash = blockHash;
    if (roleRaw !== undefined) out.roleRaw = roleRaw;
    refs.push(out);
  }
  return refs;
}

export function buildOperationalDateAssertion(
  event: DocumentDerivedEventSurface,
  routeInfo: RouteJoinInfo = EMPTY_ROUTE_JOIN,
): OperationalDateAssertion {
  const classification = classifyTier2Event(event);
  const raw: Record<string, unknown> = event.rawCandidate ?? {};
  const statusRaw = strOrNull(raw["statusRaw"]);
  const familyRaw = strOrNull(raw["familyRaw"]) ?? event.eventFamily ?? null;
  const subtypeRaw = strOrNull(raw["subtypeRaw"]) ?? event.eventSubtype ?? null;
  const operationalDate = classifyOperationalDate({
    statusRaw,
    dateText: event.dateText ?? null,
    datePrecision: event.datePrecision ?? null,
    eventKind: classification.eventKind,
    familyRaw,
    subtypeRaw,
    eventName: event.eventName ?? null,
    eventStatus: event.eventStatus ?? null,
  });

  const parsed = parseOperationalDate(event.dateText ?? null);
  const isRealizedOnset = operationalDate.dateBasis === "source_stated_complete";
  const routeIds = routeInfo.routeIds;
  const causalAnchorEligible = computeCausalAnchorEligibility({
    trustedOperationalDate: operationalDate.trustedOperationalDate,
    isRealizedOnset,
    normalizedPrecision: parsed.precision,
    routeCount: routeIds.length,
  });
  const confidence = operationalDateConfidence({
    dateBasis: operationalDate.dateBasis,
    normalizedPrecision: parsed.precision,
    routeResolutionTier: routeInfo.routeResolutionTier,
  });
  const interventionId = `intv_${shortHash(
    interventionKey({
      interventionFamily: classification.interventionFamily,
      implementationMonth: parsed.implementationMonth,
      effectiveDateStart: parsed.effectiveDateStart,
      routeIds,
      locationText: event.locationText ?? null,
    }),
  )}`;

  return {
    surfaceId: event.surfaceId,
    sourceId: event.sourceId,
    sourceTitle: event.sourceTitle ?? null,
    sourceGroup: event.sourceGroup ?? null,
    displayLabel: event.displayLabel ?? null,
    eventName: event.eventName ?? null,
    treatmentText: event.treatmentText ?? null,
    locationText: event.locationText ?? null,
    operationalDate: event.dateText ?? null,
    datePrecision: event.datePrecision ?? null,
    statusRaw,
    familyRaw,
    subtypeRaw,
    eventKind: classification.eventKind,
    interventionFamily: classification.interventionFamily,
    sourceStatedStatus: operationalDate.sourceStatedStatus,
    dateBasis: operationalDate.dateBasis,
    validationState: operationalDate.validationState,
    trustedOperationalDate: operationalDate.trustedOperationalDate,
    classificationReasons: [...classification.reasons, ...operationalDate.reasons],
    evidenceRefs: pickEvidenceRefs(raw["evidenceRefs"] ?? event.evidenceRefs),
    effectiveDateStart: parsed.effectiveDateStart,
    effectiveDateEnd: parsed.effectiveDateEnd,
    implementationMonth: parsed.implementationMonth,
    normalizedPrecision: parsed.precision,
    isRealizedOnset,
    routeIds,
    routeIdentityValidationState: routeInfo.routeIdentityValidationState,
    routeResolutionTier: routeInfo.routeResolutionTier,
    interventionId,
    evidenceSourceIds: [],
    sourceCount: 0,
    confidence,
    causalAnchorEligible,
  };
}

// Cross-source dedup: fill evidenceSourceIds/sourceCount for each interventionId
// group so one real intervention = one treatment with its supporting sources.
function applyCrossSourceDedup(rows: OperationalDateAssertion[]): void {
  const groups = new Map<string, OperationalDateAssertion[]>();
  for (const row of rows) {
    const group = groups.get(row.interventionId) ?? [];
    group.push(row);
    groups.set(row.interventionId, group);
  }
  for (const group of groups.values()) {
    const sources = [...new Set(group.map((row) => row.sourceId))].sort();
    for (const row of group) {
      row.evidenceSourceIds = sources;
      row.sourceCount = sources.length;
    }
  }
}

function addCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function buildSummary(rows: readonly OperationalDateAssertion[]): OperationalDateAssertionsSummary {
  const countsByValidationState: Record<string, number> = {};
  const countsBySourceStatedStatus: Record<string, number> = {};
  const countsByEventKind: Record<string, number> = {};
  const trustedByNormalizedPrecision: Record<string, number> = {};
  const distinctInterventions = new Set<string>();
  let trustedOperationalDateCount = 0;
  let causalAnchorEligibleCount = 0;
  let routeLinkedTrustedCount = 0;

  for (const row of rows) {
    addCount(countsByValidationState, row.validationState);
    addCount(countsBySourceStatedStatus, row.sourceStatedStatus);
    addCount(countsByEventKind, row.eventKind);
    if (row.causalAnchorEligible) {
      causalAnchorEligibleCount += 1;
      distinctInterventions.add(row.interventionId);
    }
    if (row.trustedOperationalDate) {
      trustedOperationalDateCount += 1;
      addCount(trustedByNormalizedPrecision, row.normalizedPrecision);
      if (row.routeIds.length > 0) routeLinkedTrustedCount += 1;
    }
  }

  return {
    inputEventCount: rows.length,
    trustedOperationalDateCount,
    causalAnchorEligibleCount,
    routeLinkedTrustedCount,
    distinctInterventionCount: distinctInterventions.size,
    countsByValidationState,
    countsBySourceStatedStatus,
    countsByEventKind,
    trustedByNormalizedPrecision,
  };
}

function sampleRows(
  rows: readonly OperationalDateAssertion[],
): Record<string, OperationalDateAssertion[]> {
  const samples: Record<string, OperationalDateAssertion[]> = {};
  for (const row of rows) {
    const bucket = (samples[row.validationState] ??= []);
    if (bucket.length < 10) bucket.push(row);
  }
  return samples;
}

async function* readJsonl<T>(path: string): AsyncGenerator<T> {
  const text = await Bun.file(path).text();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) yield JSON.parse(trimmed) as T;
  }
}

export async function runTier2OperationalDateAssertions(
  args: RunTier2OperationalDateAssertionsArgs,
): Promise<{ outputPath: string; artifact: OperationalDateAssertionsArtifact }> {
  const eventsPath = args.eventsPath ?? join(args.surfacesDir, "events.jsonl");
  const routeResolutionPath =
    args.routeResolutionPath ?? join(args.surfacesDir, DEFAULT_ROUTE_RESOLUTION_FILENAME);
  const routeMap = await loadRouteMap(routeResolutionPath);

  const rows: OperationalDateAssertion[] = [];
  for await (const event of readJsonl<DocumentDerivedEventSurface>(eventsPath)) {
    rows.push(
      buildOperationalDateAssertion(event, routeMap.get(event.surfaceId) ?? EMPTY_ROUTE_JOIN),
    );
  }
  applyCrossSourceDedup(rows);

  const artifact: OperationalDateAssertionsArtifact = {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    sourceSurfacesPath: eventsPath,
    routeResolutionPath,
    summary: buildSummary(rows),
    samples: sampleRows(rows),
    rows,
  };

  await mkdir(dirname(args.outputPath), { recursive: true });
  await writeJson(args.outputPath, artifact);
  return { outputPath: args.outputPath, artifact };
}

type CliArgs = {
  artifactRoot?: string;
  runId?: string;
  surfacesDir?: string;
  eventsPath?: string;
  routeResolutionPath?: string;
  outputPath?: string;
  generatedAt?: string;
};

function parseCliOptions(args: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !flag.startsWith("--")) throw new Error(`Unknown argument: ${flag ?? ""}`);
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    index += 1;
    switch (flag) {
      case "--artifact-root":
        parsed.artifactRoot = value;
        break;
      case "--run-id":
        parsed.runId = value;
        break;
      case "--surfaces-dir":
        parsed.surfacesDir = value;
        break;
      case "--events":
        parsed.eventsPath = value;
        break;
      case "--route-resolution":
        parsed.routeResolutionPath = value;
        break;
      case "--output":
        parsed.outputPath = value;
        break;
      case "--generated-at":
        parsed.generatedAt = value;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return parsed;
}

export async function runTier2OperationalDateAssertionsFromCli(args: string[]) {
  const parsed = parseCliOptions(args);
  const artifactRoot = parsed.artifactRoot
    ? fromCliPath(parsed.artifactRoot)
    : defaultArtifactRootPath();
  const runId = parsed.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null && parsed.surfacesDir === undefined && parsed.eventsPath === undefined) {
    throw new Error("No Tier 2 run found. Pass --surfaces-dir or --run-id.");
  }
  const surfacesDir =
    parsed.surfacesDir !== undefined
      ? fromCliPath(parsed.surfacesDir)
      : join(runArtifactRoot(artifactRoot, runId ?? ""), DEFAULT_SURFACES_DIR);
  const outputPath =
    parsed.outputPath !== undefined
      ? fromCliPath(parsed.outputPath)
      : join(surfacesDir, DEFAULT_OUTPUT_FILENAME);
  return runTier2OperationalDateAssertions({
    surfacesDir,
    outputPath,
    ...(parsed.eventsPath ? { eventsPath: fromCliPath(parsed.eventsPath) } : {}),
    ...(parsed.routeResolutionPath
      ? { routeResolutionPath: fromCliPath(parsed.routeResolutionPath) }
      : {}),
    ...(parsed.generatedAt ? { generatedAt: parsed.generatedAt } : {}),
  });
}
