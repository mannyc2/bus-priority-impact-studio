import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import type { ToolCallMessage } from "../../../lib/llm.ts";
import { fromCliPath } from "../../../lib/paths.ts";
import {
  callDeepSeekToolCallDirect,
  callPioneerToolCallDirect,
  openRouterErrorMessage,
} from "./_llm-clients.ts";
import type { Tier2RouteTimelineCurationPackArtifact } from "./_route-timeline-curation-pack.ts";
import {
  extractToolCallArguments,
  type FetchLike,
  missingToolCallErrorMessage,
} from "./_shared.ts";

const ARTIFACT_KIND = "bp.tier2_route_timeline_curation_run.v1";
const SUMMARY_KIND = "bp.tier2_route_timeline_curation_run_summary.v1";
const TOOL_NAME = "submit_route_timeline_curation";
const DEFAULT_PROVIDER = "deepseek";
const DEFAULT_MODEL = "deepseek-v4-pro";
const DEFAULT_MAX_TOKENS = 12000;
const DEFAULT_TEMPERATURE = 0.3;

type JsonRecord = Record<string, unknown>;
type TimelineCurationProvider = "deepseek" | "pioneer";
type RunStatus = "not_executed" | "accepted" | "rejected" | "provider_failed";

export type TimelineCurationEvent = {
  eventId: string;
  title: string;
  date?: string | null;
  month?: string | null;
  datePrecision?: "day" | "month" | "season" | "year" | "range" | "unknown";
  eventStatus:
    | "proposed"
    | "planned"
    | "approved"
    | "implemented"
    | "historical_context"
    | "needs_review";
  timelineLayer:
    | "project_milestone"
    | "service_change"
    | "treatment_change"
    | "evaluation"
    | "context";
  routeScope: "direct_route" | "route_family" | "corridor" | "uncertain";
  summary: string;
  whyItMatters: string;
  candidateRefs?: string[];
  candidateIds?: string[];
  dateAssertionRefs?: string[];
  dateAssertionIds?: string[];
  evidencePointerIds?: string[];
  sourceIds?: string[];
  confidence: "high" | "medium" | "low";
  reviewNotes: string[];
};

export type TimelineCurationToolCall = {
  schemaVersion: 1;
  routeId: string;
  events: TimelineCurationEvent[];
  excludedCandidates: Array<{
    candidateRef?: string;
    candidateId?: string;
    reason:
      | "duplicate"
      | "too_vague"
      | "not_route_specific"
      | "process_only"
      | "missing_date"
      | "not_timeline_event"
      | "conflicting_sources"
      | "other";
    notes: string;
  }>;
};

export type Tier2RouteTimelineCurationRunArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourcePackPath: string;
  sourcePackMarkdownPath: string | null;
  routeId: string;
  execute: boolean;
  provider: TimelineCurationProvider | null;
  model: string | null;
  maxTokens: number | null;
  temperature: number | null;
  status: RunStatus;
  promptPath: string;
  requestPath: string;
  responsePath: string | null;
  toolCallPath: string | null;
  validationPath: string | null;
  errorPath: string | null;
  summary: {
    packCandidateCount: number;
    outputEventCount: number;
    excludedCandidateCount: number;
    validationIssueCount: number;
    providerAttemptCount: number;
    usage: unknown | null;
  };
};

export type RunRouteTimelineCurationArgs = {
  packPath: string;
  packMarkdownPath?: string;
  outputPath?: string;
  promptPath?: string;
  requestPath?: string;
  responsePath?: string;
  toolCallPath?: string;
  validationPath?: string;
  summaryPath?: string;
  errorPath?: string;
  generatedAt?: string;
  execute?: boolean;
  provider?: TimelineCurationProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  deepseekApiKey?: string;
  pioneerApiKey?: string;
  fetcher?: FetchLike;
};

type CliArgs = Partial<RunRouteTimelineCurationArgs>;

function boolValue(value: string | undefined): boolean {
  if (value === undefined) return true;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${flag} requires a positive integer.`);
  return parsed;
}

function numberValue(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} requires a number.`);
  return parsed;
}

function defaultOutputPath(packPath: string): string {
  const resolved = fromCliPath(packPath);
  return join(dirname(resolved), "route-timeline-curation-run.json");
}

function defaultMarkdownPath(packPath: string): string {
  return fromCliPath(packPath).replace(/\.json$/, ".md");
}

function defaultPath(outputPath: string, suffix: string): string {
  return outputPath.replace(/\.json$/, suffix);
}

function systemPrompt(): string {
  return [
    "You are curating a public-facing bus route intervention timeline from source-grounded Tier 2 candidates.",
    "You are not an extractor. Do not invent facts, dates, source ids, candidate ids, or evidence handles.",
    "Use the provided pack plus filesystem inspection guidance only to merge, sequence, and exclude candidates.",
    "The output is a review artifact, not automatically public truth.",
  ].join("\n");
}

function userPrompt(input: {
  pack: Tier2RouteTimelineCurationPackArtifact;
  markdown: string;
}): string {
  return [
    input.markdown,
    "",
    "## Final instruction",
    "",
    `Call ${TOOL_NAME} exactly once.`,
    "Keep the timeline compact and useful: merge duplicates, exclude process-only rows unless they explain a major project milestone, and preserve uncertainty.",
    "Use excludedCandidates for important duplicates, near-misses, conflicts, or tempting but rejected rows. Do not enumerate the whole unused tail.",
    "Phrase performance or effect claims as source-stated/source-reported unless they have a separate deterministic observed-data gate.",
    "Use candidateRefs and dateAssertionRefs from the pack. Do not rewrite dates, months, long candidate ids, source ids, evidence pointer ids, artifact paths, or known source metadata.",
    "The runner resolves event dates/months/precision from dateAssertionRefs. If no date assertion fits, leave dateAssertionRefs empty and explain the uncertainty in reviewNotes.",
    `Route id must be ${input.pack.routeId}.`,
  ].join("\n");
}

function timelineTool() {
  return {
    name: TOOL_NAME,
    description: "Submit a curated route timeline derived only from the provided candidate pack.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "routeId", "events", "excludedCandidates"],
      properties: {
        schemaVersion: { type: "integer", enum: [1] },
        routeId: { type: "string" },
        events: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "eventId",
              "title",
              "eventStatus",
              "timelineLayer",
              "routeScope",
              "summary",
              "whyItMatters",
              "candidateRefs",
              "dateAssertionRefs",
              "confidence",
              "reviewNotes",
            ],
            properties: {
              eventId: { type: "string", minLength: 1 },
              title: { type: "string", minLength: 1 },
              eventStatus: {
                type: "string",
                enum: [
                  "proposed",
                  "planned",
                  "approved",
                  "implemented",
                  "historical_context",
                  "needs_review",
                ],
              },
              timelineLayer: {
                type: "string",
                enum: [
                  "project_milestone",
                  "service_change",
                  "treatment_change",
                  "evaluation",
                  "context",
                ],
              },
              routeScope: {
                type: "string",
                enum: ["direct_route", "route_family", "corridor", "uncertain"],
              },
              summary: { type: "string", minLength: 1 },
              whyItMatters: { type: "string", minLength: 1 },
              candidateRefs: { type: "array", minItems: 1, items: { type: "string" } },
              dateAssertionRefs: { type: "array", items: { type: "string" } },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              reviewNotes: { type: "array", items: { type: "string" } },
            },
          },
        },
        excludedCandidates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["candidateRef", "reason", "notes"],
            properties: {
              candidateRef: { type: "string", minLength: 1 },
              reason: {
                type: "string",
                enum: [
                  "duplicate",
                  "too_vague",
                  "not_route_specific",
                  "process_only",
                  "missing_date",
                  "not_timeline_event",
                  "conflicting_sources",
                  "other",
                ],
              },
              notes: { type: "string" },
            },
          },
        },
      },
    },
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseTimelineToolCall(value: unknown): TimelineCurationToolCall | null {
  if (!isRecord(value)) return null;
  if (value["schemaVersion"] !== 1) return null;
  if (typeof value["routeId"] !== "string") return null;
  if (!Array.isArray(value["events"]) || !Array.isArray(value["excludedCandidates"])) return null;
  return value as TimelineCurationToolCall;
}

function dateValueKey(assertion: {
  displayDate?: string | null;
  date: string | null;
  month: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  datePrecision: string;
}): string {
  return [
    assertion.displayDate ?? "",
    assertion.date ?? "",
    assertion.month ?? "",
    assertion.rangeStart ?? "",
    assertion.rangeEnd ?? "",
    assertion.datePrecision,
  ].join("|");
}

function resolveDateFromAssertions(
  assertions: Array<{
    dateAssertionRef?: string;
    dateAssertionId: string;
    displayDate?: string | null;
    date: string | null;
    month: string | null;
    rangeStart?: string | null;
    rangeEnd?: string | null;
    datePrecision: "day" | "month" | "season" | "year" | "range" | "unknown";
    dateRole: string;
  }>,
) {
  const eventDateAssertions = assertions.filter(
    (assertion) => assertion.dateRole === "event_date_candidate",
  );
  const source = eventDateAssertions.length > 0 ? eventDateAssertions : assertions;
  const byPrecision = ["day", "month", "season", "year", "range", "unknown"].map((precision) =>
    source.filter((assertion) => assertion.datePrecision === precision),
  );
  const best = byPrecision.find((items) => items.length > 0) ?? [];
  const groups = new Map<string, typeof best>();
  for (const assertion of best) {
    const key = dateValueKey(assertion);
    const items = groups.get(key) ?? [];
    items.push(assertion);
    groups.set(key, items);
  }
  if (groups.size !== 1) {
    return {
      status: assertions.length === 0 ? ("none" as const) : ("ambiguous" as const),
      dateAssertionRefs: [] as string[],
      dateAssertionIds: [] as string[],
      date: null,
      month: null,
      datePrecision: "unknown" as const,
    };
  }
  const only = [...groups.values()][0] ?? [];
  const assertion = only[0];
  if (assertion === undefined) {
    return {
      status: "none" as const,
      dateAssertionRefs: [] as string[],
      dateAssertionIds: [] as string[],
      date: null,
      month: null,
      datePrecision: "unknown" as const,
    };
  }
  return {
    status: "resolved" as const,
    dateAssertionRefs: only.flatMap((item) =>
      item.dateAssertionRef === undefined ? [] : [item.dateAssertionRef],
    ),
    dateAssertionIds: only.map((item) => item.dateAssertionId),
    date: assertion.date,
    month: assertion.month,
    datePrecision: assertion.datePrecision,
  };
}

function candidateRefValue(candidate: {
  candidateRef?: unknown;
  candidateId: string;
}): string | null {
  return typeof candidate.candidateRef === "string" && candidate.candidateRef.length > 0
    ? candidate.candidateRef
    : null;
}

function dateAssertionRefValue(assertion: {
  dateAssertionRef?: unknown;
  dateAssertionId: string;
}): string | null {
  return typeof assertion.dateAssertionRef === "string" && assertion.dateAssertionRef.length > 0
    ? assertion.dateAssertionRef
    : null;
}

export function validateRouteTimelineCuration(input: {
  pack: Tier2RouteTimelineCurationPackArtifact;
  toolCall: TimelineCurationToolCall | null;
  generatedAt: string;
}) {
  const issues: Array<{ severity: "error" | "warning"; code: string; message: string }> = [];
  if (input.toolCall === null) {
    issues.push({
      severity: "error",
      code: "invalid_tool_call",
      message: "Tool call did not match the expected object shape.",
    });
    return {
      generatedAt: input.generatedAt,
      status: "rejected" as const,
      eventCount: 0,
      excludedCandidateCount: 0,
      unaccountedCandidateCount: 0,
      unaccountedCandidateRefs: [] as string[],
      unaccountedCandidateIds: [] as string[],
      dateResolutionSuggestions: [],
      issues,
    };
  }
  if (input.toolCall.routeId !== input.pack.routeId) {
    issues.push({
      severity: "error",
      code: "route_mismatch",
      message: `Expected routeId ${input.pack.routeId}, got ${input.toolCall.routeId}.`,
    });
  }
  const candidateIds = new Set(input.pack.candidates.map((candidate) => candidate.candidateId));
  const candidateById = new Map(
    input.pack.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const candidateIdByRef = new Map(
    input.pack.candidates.flatMap((candidate) => {
      const candidateRef = candidateRefValue(candidate);
      return candidateRef === null ? [] : [[candidateRef, candidate.candidateId] as const];
    }),
  );
  const dateAssertionById = new Map(
    input.pack.candidates.flatMap((candidate) =>
      (candidate.dateAssertions ?? []).map(
        (assertion) => [assertion.dateAssertionId, assertion] as const,
      ),
    ),
  );
  const dateAssertionIdByRef = new Map(
    input.pack.candidates.flatMap((candidate) =>
      (candidate.dateAssertions ?? []).flatMap((assertion) => {
        const assertionRef = dateAssertionRefValue(assertion);
        return assertionRef === null ? [] : [[assertionRef, assertion.dateAssertionId] as const];
      }),
    ),
  );
  const sourceIds = new Set(input.pack.sourceRefs.map((source) => source.sourceId));
  const usedCandidateIds = new Set<string>();
  const dateResolutionSuggestions: Array<{
    eventIndex: number;
    eventId: string;
    status: "resolved" | "ambiguous" | "none";
    dateAssertionRefs: string[];
    dateAssertionIds: string[];
    date: string | null;
    month: string | null;
    datePrecision: "day" | "month" | "season" | "year" | "range" | "unknown";
  }> = [];
  for (const [eventIndex, event] of input.toolCall.events.entries()) {
    const eventCandidateIds = [
      ...(event.candidateIds ?? []),
      ...(event.candidateRefs ?? []).flatMap((candidateRef) => {
        const candidateId = candidateIdByRef.get(candidateRef);
        return candidateId === undefined ? [] : [candidateId];
      }),
    ];
    const eventDateAssertionIds = [
      ...(event.dateAssertionIds ?? []),
      ...(event.dateAssertionRefs ?? []).flatMap((assertionRef) => {
        const assertionId = dateAssertionIdByRef.get(assertionRef);
        return assertionId === undefined ? [] : [assertionId];
      }),
    ];
    const eventDate = typeof event.date === "string" ? event.date : null;
    const eventMonth = typeof event.month === "string" ? event.month : null;
    const eventDatePrecision = event.datePrecision ?? "unknown";
    if (eventCandidateIds.length === 0) {
      issues.push({
        severity: "error",
        code: "event_missing_candidate",
        message: `events[${eventIndex}] has no candidateRefs or candidateIds.`,
      });
    }
    for (const candidateRef of event.candidateRefs ?? []) {
      if (!candidateIdByRef.has(candidateRef)) {
        issues.push({
          severity: "error",
          code: "unknown_candidate_ref",
          message: `events[${eventIndex}] cites unknown candidateRef ${candidateRef}.`,
        });
      }
    }
    for (const candidateId of eventCandidateIds) {
      usedCandidateIds.add(candidateId);
      if (!candidateIds.has(candidateId)) {
        issues.push({
          severity: "error",
          code: "unknown_candidate_id",
          message: `events[${eventIndex}] cites unknown candidateId ${candidateId}.`,
        });
      }
    }
    const citedCandidateDateAssertions = eventCandidateIds.flatMap((candidateId) => {
      const candidate = candidateById.get(candidateId);
      return candidate?.dateAssertions ?? [];
    });
    const backfillCandidateAssertions =
      eventDate !== null
        ? citedCandidateDateAssertions.filter((assertion) => assertion.date === eventDate)
        : eventMonth !== null
          ? citedCandidateDateAssertions.filter((assertion) => assertion.month === eventMonth)
          : citedCandidateDateAssertions;
    const resolvedDate =
      eventDateAssertionIds.length > 0
        ? resolveDateFromAssertions(
            eventDateAssertionIds.flatMap((id) => {
              const assertion = dateAssertionById.get(id);
              return assertion === undefined ? [] : [assertion];
            }),
          )
        : resolveDateFromAssertions(
            backfillCandidateAssertions.length > 0
              ? backfillCandidateAssertions
              : citedCandidateDateAssertions,
          );
    dateResolutionSuggestions.push({
      eventIndex,
      eventId: event.eventId,
      status: resolvedDate.status,
      dateAssertionRefs: resolvedDate.dateAssertionRefs,
      dateAssertionIds: resolvedDate.dateAssertionIds,
      date: resolvedDate.date,
      month: resolvedDate.month,
      datePrecision: resolvedDate.datePrecision,
    });
    if (eventDateAssertionIds.length === 0 && resolvedDate.status === "resolved") {
      const suggestedDateRefs =
        resolvedDate.dateAssertionRefs.length > 0
          ? resolvedDate.dateAssertionRefs
          : resolvedDate.dateAssertionIds;
      issues.push({
        severity: "warning",
        code: "date_assertion_available",
        message: `events[${eventIndex}] can cite ${suggestedDateRefs.join(",")} for its date.`,
      });
    }
    for (const dateAssertionId of eventDateAssertionIds) {
      if (!dateAssertionById.has(dateAssertionId)) {
        issues.push({
          severity: "error",
          code: "unknown_date_assertion_id",
          message: `events[${eventIndex}] cites unknown dateAssertionId ${dateAssertionId}.`,
        });
      }
    }
    for (const dateAssertionRef of event.dateAssertionRefs ?? []) {
      if (!dateAssertionIdByRef.has(dateAssertionRef)) {
        issues.push({
          severity: "error",
          code: "unknown_date_assertion_ref",
          message: `events[${eventIndex}] cites unknown dateAssertionRef ${dateAssertionRef}.`,
        });
      }
    }
    if (
      (eventDate !== null || eventMonth !== null || event.datePrecision !== undefined) &&
      eventDateAssertionIds.length === 0
    ) {
      issues.push({
        severity: "warning",
        code: "date_without_assertion",
        message: `events[${eventIndex}] provides a date/month/precision without a dateAssertionRef.`,
      });
    }
    if (eventDateAssertionIds.length > 0) {
      const citedAssertions = eventDateAssertionIds.flatMap((id) => {
        const assertion = dateAssertionById.get(id);
        return assertion === undefined ? [] : [assertion];
      });
      const citedCandidateIdSet = new Set(eventCandidateIds);
      for (const assertion of citedAssertions) {
        if (eventCandidateIds.length > 0 && !citedCandidateIdSet.has(assertion.candidateId)) {
          issues.push({
            severity: "warning",
            code: "date_assertion_candidate_mismatch",
            message: `events[${eventIndex}] cites a date assertion from candidateId ${assertion.candidateId}, which is not one of the cited candidates.`,
          });
        }
      }
      const matchesDate =
        eventDate === null || citedAssertions.some((assertion) => assertion.date === eventDate);
      const matchesMonth =
        eventMonth === null || citedAssertions.some((assertion) => assertion.month === eventMonth);
      if (!matchesDate || !matchesMonth) {
        issues.push({
          severity: "warning",
          code: "date_assertion_mismatch",
          message: `events[${eventIndex}] date/month does not match any cited dateAssertionRef.`,
        });
      }
    }
    for (const sourceId of event.sourceIds ?? []) {
      if (!sourceIds.has(sourceId)) {
        issues.push({
          severity: "warning",
          code: "unknown_source_id",
          message: `events[${eventIndex}] cites sourceId ${sourceId} not present in pack sourceRefs.`,
        });
      }
    }
    if (eventDate === null && eventMonth === null && eventDatePrecision !== "unknown") {
      issues.push({
        severity: "warning",
        code: "date_precision_without_date",
        message: `events[${eventIndex}] has datePrecision=${eventDatePrecision} with no date or month.`,
      });
    }
    if (eventDatePrecision === "day" && eventDate === null) {
      issues.push({
        severity: "warning",
        code: "day_precision_missing_date",
        message: `events[${eventIndex}] has day precision but no day-level date.`,
      });
    }
    if (eventDatePrecision === "month" && eventMonth === null) {
      issues.push({
        severity: "warning",
        code: "month_precision_missing_month",
        message: `events[${eventIndex}] has month precision but no month value.`,
      });
    }
  }
  for (const [excludedIndex, excluded] of input.toolCall.excludedCandidates.entries()) {
    const excludedCandidateId =
      excluded.candidateId ??
      (excluded.candidateRef === undefined
        ? undefined
        : candidateIdByRef.get(excluded.candidateRef));
    if (excludedCandidateId === undefined || !candidateIds.has(excludedCandidateId)) {
      issues.push({
        severity: "error",
        code: "unknown_excluded_candidate_id",
        message: `excludedCandidates[${excludedIndex}] cites unknown candidateId ${excluded.candidateId ?? excluded.candidateRef}.`,
      });
    }
  }
  const resolvedCandidateIds = new Set([
    ...usedCandidateIds,
    ...input.toolCall.excludedCandidates.flatMap((candidate) => {
      if (candidate.candidateId !== undefined) return [candidate.candidateId];
      if (candidate.candidateRef === undefined) return [];
      const candidateId = candidateIdByRef.get(candidate.candidateRef);
      return candidateId === undefined ? [] : [candidateId];
    }),
  ]);
  const unaccountedCandidateIds = [...candidateIds].filter(
    (candidateId) => !resolvedCandidateIds.has(candidateId),
  );
  const unaccountedCandidateRefs = unaccountedCandidateIds.flatMap((candidateId) => {
    const candidate = candidateById.get(candidateId);
    if (candidate === undefined) return [];
    const candidateRef = candidateRefValue(candidate);
    return candidateRef === null ? [] : [candidateRef];
  });
  return {
    generatedAt: input.generatedAt,
    status: issues.some((issue) => issue.severity === "error")
      ? ("rejected" as const)
      : ("accepted" as const),
    eventCount: input.toolCall.events.length,
    excludedCandidateCount: input.toolCall.excludedCandidates.length,
    unaccountedCandidateCount: unaccountedCandidateIds.length,
    unaccountedCandidateRefs,
    unaccountedCandidateIds,
    dateResolutionSuggestions,
    issues,
  };
}

function usageFromBody(body: unknown): unknown | null {
  if (!isRecord(body)) return null;
  return body["usage"] ?? null;
}

function attemptCount(result: { attempts?: unknown[] }): number {
  return Array.isArray(result.attempts) ? result.attempts.length : 1;
}

export async function runRouteTimelineCuration(args: RunRouteTimelineCurationArgs): Promise<{
  artifact: Tier2RouteTimelineCurationRunArtifact;
  outputPath: string;
  summaryPath: string;
}> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const sourcePackPath = fromCliPath(args.packPath);
  const pack = (await Bun.file(sourcePackPath).json()) as Tier2RouteTimelineCurationPackArtifact;
  if (!Array.isArray(pack.candidates))
    throw new Error(`Pack has no candidates array: ${sourcePackPath}`);
  const sourcePackMarkdownPath =
    args.packMarkdownPath === undefined
      ? defaultMarkdownPath(args.packPath)
      : fromCliPath(args.packMarkdownPath);
  const markdownFile = Bun.file(sourcePackMarkdownPath);
  const markdown = (await markdownFile.exists())
    ? await markdownFile.text()
    : JSON.stringify(pack, null, 2);

  const outputPath = fromCliPath(args.outputPath ?? defaultOutputPath(args.packPath));
  const promptPath = fromCliPath(args.promptPath ?? defaultPath(outputPath, "-provided-prompt.md"));
  const requestPath = fromCliPath(args.requestPath ?? defaultPath(outputPath, "-request.json"));
  const responsePath = fromCliPath(args.responsePath ?? defaultPath(outputPath, "-response.json"));
  const toolCallPath = fromCliPath(args.toolCallPath ?? defaultPath(outputPath, "-tool-call.json"));
  const validationPath = fromCliPath(
    args.validationPath ?? defaultPath(outputPath, "-validation.json"),
  );
  const summaryPath = fromCliPath(args.summaryPath ?? defaultPath(outputPath, "-summary.json"));
  const errorPath = fromCliPath(args.errorPath ?? defaultPath(outputPath, "-error.json"));
  const prompt = userPrompt({ pack, markdown });
  const provider = args.provider ?? DEFAULT_PROVIDER;
  const model = args.model ?? DEFAULT_MODEL;
  const maxTokens = args.maxTokens ?? DEFAULT_MAX_TOKENS;
  const temperature = args.temperature ?? DEFAULT_TEMPERATURE;
  const execute = args.execute === true;
  const messages: ToolCallMessage[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: prompt },
  ];
  const request = {
    artifactKind: "bp.tier2_route_timeline_curation_request.v1",
    schemaVersion: 1,
    generatedAt,
    provider,
    model,
    maxTokens,
    temperature,
    toolName: TOOL_NAME,
    messages,
    tool: timelineTool(),
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await Bun.write(promptPath, `${prompt}\n`);
  await writeJson(requestPath, request);

  if (!execute) {
    const artifact: Tier2RouteTimelineCurationRunArtifact = {
      artifactKind: ARTIFACT_KIND,
      schemaVersion: 1,
      generatedAt,
      sourcePackPath,
      sourcePackMarkdownPath: (await markdownFile.exists()) ? sourcePackMarkdownPath : null,
      routeId: pack.routeId,
      execute: false,
      provider: null,
      model: null,
      maxTokens: null,
      temperature: null,
      status: "not_executed",
      promptPath,
      requestPath,
      responsePath: null,
      toolCallPath: null,
      validationPath: null,
      errorPath: null,
      summary: {
        packCandidateCount: pack.candidates.length,
        outputEventCount: 0,
        excludedCandidateCount: 0,
        validationIssueCount: 0,
        providerAttemptCount: 0,
        usage: null,
      },
    };
    await writeJson(outputPath, artifact);
    await writeJson(summaryPath, {
      artifactKind: SUMMARY_KIND,
      schemaVersion: 1,
      generatedAt,
      sourceArtifactPath: outputPath,
      summary: artifact.summary,
    });
    return { artifact, outputPath, summaryPath };
  }

  const apiKey =
    provider === "deepseek"
      ? (args.deepseekApiKey ?? process.env["DEEPSEEK_API_KEY"] ?? "")
      : (args.pioneerApiKey ?? process.env["PIONEER_API_KEY"] ?? "");
  if (apiKey.trim().length === 0) {
    throw new Error(
      `${provider === "deepseek" ? "DEEPSEEK_API_KEY" : "PIONEER_API_KEY"} is required.`,
    );
  }
  const fetcher = args.fetcher ?? globalThis.fetch.bind(globalThis);
  let responseJson: unknown | null = null;
  let toolCall: TimelineCurationToolCall | null = null;
  let validation = validateRouteTimelineCuration({ pack, toolCall: null, generatedAt });
  let status: RunStatus = "provider_failed";
  let errorPathOut: string | null = null;
  let providerAttemptCount = 0;
  let usage: unknown | null = null;
  try {
    const providerResult =
      provider === "deepseek"
        ? await callDeepSeekToolCallDirect({
            apiKey,
            model,
            maxTokens,
            temperature,
            toolName: TOOL_NAME,
            messages: request.messages,
            tools: [timelineTool()],
            fetcher,
          })
        : await callPioneerToolCallDirect({
            apiKey,
            model,
            maxTokens,
            temperature,
            toolName: TOOL_NAME,
            messages: request.messages,
            tools: [timelineTool()],
            fetcher,
          });
    responseJson = providerResult.body;
    providerAttemptCount = attemptCount(providerResult);
    usage = usageFromBody(providerResult.body);
    await writeJson(responsePath, providerResult.body);
    if (!providerResult.response.ok) {
      throw new Error(
        openRouterErrorMessage(providerResult.body) ??
          `HTTP ${providerResult.response.status} ${providerResult.response.statusText}`,
      );
    }
    const rawToolCall = extractToolCallArguments(providerResult.body, TOOL_NAME);
    if (rawToolCall === null) {
      throw new Error(
        missingToolCallErrorMessage({
          responseJson: providerResult.body,
          toolName: TOOL_NAME,
          maxTokens,
        }),
      );
    }
    toolCall = parseTimelineToolCall(rawToolCall);
    await writeJson(toolCallPath, rawToolCall);
    validation = validateRouteTimelineCuration({ pack, toolCall, generatedAt });
    await writeJson(validationPath, validation);
    status = validation.status;
  } catch (error) {
    errorPathOut = errorPath;
    await writeJson(errorPath, {
      artifactKind: "bp.tier2_route_timeline_curation_error.v1",
      schemaVersion: 1,
      generatedAt,
      message: error instanceof Error ? error.message : String(error),
      responseJson,
    });
  }

  const artifact: Tier2RouteTimelineCurationRunArtifact = {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt,
    sourcePackPath,
    sourcePackMarkdownPath: (await markdownFile.exists()) ? sourcePackMarkdownPath : null,
    routeId: pack.routeId,
    execute: true,
    provider,
    model,
    maxTokens,
    temperature,
    status,
    promptPath,
    requestPath,
    responsePath,
    toolCallPath: toolCall === null ? null : toolCallPath,
    validationPath: toolCall === null ? null : validationPath,
    errorPath: errorPathOut,
    summary: {
      packCandidateCount: pack.candidates.length,
      outputEventCount: toolCall?.events.length ?? 0,
      excludedCandidateCount: toolCall?.excludedCandidates.length ?? 0,
      validationIssueCount: validation.issues.length,
      providerAttemptCount,
      usage,
    },
  };
  await writeJson(outputPath, artifact);
  await writeJson(summaryPath, {
    artifactKind: SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceArtifactPath: outputPath,
    summary: artifact.summary,
  });
  return { artifact, outputPath, summaryPath };
}

function parseProvider(value: string): TimelineCurationProvider {
  if (value === "deepseek" || value === "pioneer") return value;
  throw new Error("--provider must be deepseek or pioneer.");
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--pack") {
      if (value === undefined) throw new Error("--pack requires a value.");
      args.packPath = value;
      index += 1;
    } else if (arg === "--pack-markdown") {
      if (value === undefined) throw new Error("--pack-markdown requires a value.");
      args.packMarkdownPath = value;
      index += 1;
    } else if (arg === "--output") {
      if (value === undefined) throw new Error("--output requires a value.");
      args.outputPath = value;
      index += 1;
    } else if (arg === "--generated-at") {
      if (value === undefined) throw new Error("--generated-at requires a value.");
      args.generatedAt = value;
      index += 1;
    } else if (arg === "--execute") {
      args.execute = boolValue(value?.startsWith("--") ? undefined : value);
      if (value !== undefined && !value.startsWith("--")) index += 1;
    } else if (arg === "--provider") {
      if (value === undefined) throw new Error("--provider requires a value.");
      args.provider = parseProvider(value);
      index += 1;
    } else if (arg === "--model") {
      if (value === undefined) throw new Error("--model requires a value.");
      args.model = value;
      index += 1;
    } else if (arg === "--max-tokens") {
      if (value === undefined) throw new Error("--max-tokens requires a value.");
      args.maxTokens = positiveInteger(value, "--max-tokens");
      index += 1;
    } else if (arg === "--temperature") {
      if (value === undefined) throw new Error("--temperature requires a value.");
      args.temperature = numberValue(value, "--temperature");
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 route-timeline-curation option: ${arg}`);
    }
  }
  return args;
}

export async function runRouteTimelineCurationFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.packPath === undefined) throw new Error("Provide --pack.");
  const result = await runRouteTimelineCuration({
    packPath: args.packPath,
    ...(args.packMarkdownPath === undefined ? {} : { packMarkdownPath: args.packMarkdownPath }),
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
    ...(args.execute === undefined ? {} : { execute: args.execute }),
    ...(args.provider === undefined ? {} : { provider: args.provider }),
    ...(args.model === undefined ? {} : { model: args.model }),
    ...(args.maxTokens === undefined ? {} : { maxTokens: args.maxTokens }),
    ...(args.temperature === undefined ? {} : { temperature: args.temperature }),
  });
  console.log(
    `route-timeline-curation: route=${result.artifact.routeId} status=${result.artifact.status} events=${result.artifact.summary.outputEventCount} excluded=${result.artifact.summary.excludedCandidateCount}`,
  );
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    summaryPath: result.summaryPath,
    status: result.artifact.status,
    summary: result.artifact.summary,
  };
}
