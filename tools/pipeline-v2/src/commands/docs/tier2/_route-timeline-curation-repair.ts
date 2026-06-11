import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { fromCliPath } from "../../../lib/paths.ts";
import {
  type TimelineCurationToolCall,
  validateRouteTimelineCuration,
} from "./_route-timeline-curation.ts";
import type { Tier2RouteTimelineCurationPackArtifact } from "./_route-timeline-curation-pack.ts";

const SUMMARY_KIND = "bp.tier2_route_timeline_curation_repair_summary.v1";

type DatePrecision = "day" | "month" | "season" | "year" | "range" | "unknown";

export type RepairRouteTimelineCurationArgs = {
  packPath: string;
  toolCallPath: string;
  outputPath?: string;
  summaryPath?: string;
  validationPath?: string;
  generatedAt?: string;
};

type CliArgs = Partial<RepairRouteTimelineCurationArgs>;

type RepairAppliedEvent = {
  eventIndex: number;
  eventId: string;
  title: string;
  dateAssertionRefs: string[];
  dateAssertionIds: string[];
  date: string | null;
  month: string | null;
  datePrecision: DatePrecision;
};

type IssueCount = {
  total: number;
  errors: number;
  warnings: number;
  byCode: Record<string, number>;
};

export type RouteTimelineCurationRepairSummary = {
  artifactKind: typeof SUMMARY_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourcePackPath: string;
  sourceToolCallPath: string;
  outputToolCallPath: string;
  validationPath: string;
  routeId: string;
  eventCount: number;
  repairedEventCount: number;
  addedDateAssertionRefCount: number;
  repairedUnknownPrecisionEventCount: number;
  skippedAlreadyDatedEventCount: number;
  skippedNoResolvedDateEventCount: number;
  skippedNoDateAssertionRefEventCount: number;
  beforeValidation: IssueCount & { status: "accepted" | "rejected" };
  afterValidation: IssueCount & { status: "accepted" | "rejected" };
  repairedEvents: RepairAppliedEvent[];
};

function defaultOutputPath(toolCallPath: string): string {
  const resolved = fromCliPath(toolCallPath);
  return resolved.replace(/\.json$/, "-repaired.json");
}

function defaultPath(outputPath: string, suffix: string): string {
  return outputPath.replace(/\.json$/, suffix);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" && item.length > 0 ? [item] : []))
    : [];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function issueCount(validation: ReturnType<typeof validateRouteTimelineCuration>): IssueCount {
  const byCode: Record<string, number> = {};
  for (const issue of validation.issues) {
    byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
  }
  return {
    total: validation.issues.length,
    errors: validation.issues.filter((issue) => issue.severity === "error").length,
    warnings: validation.issues.filter((issue) => issue.severity === "warning").length,
    byCode,
  };
}

function repairToolCall(input: {
  toolCall: TimelineCurationToolCall;
  validation: ReturnType<typeof validateRouteTimelineCuration>;
}): {
  toolCall: TimelineCurationToolCall;
  repairedEvents: RepairAppliedEvent[];
  skippedAlreadyDatedEventCount: number;
  skippedNoResolvedDateEventCount: number;
  skippedNoDateAssertionRefEventCount: number;
} {
  const suggestionsByEventIndex = new Map(
    (input.validation.dateResolutionSuggestions ?? []).map((suggestion) => [
      suggestion.eventIndex,
      suggestion,
    ]),
  );
  const repairedEvents: RepairAppliedEvent[] = [];
  let skippedAlreadyDatedEventCount = 0;
  let skippedNoResolvedDateEventCount = 0;
  let skippedNoDateAssertionRefEventCount = 0;
  const events = input.toolCall.events.map((event, eventIndex) => {
    const existingRefs = stringArray(event.dateAssertionRefs);
    const existingIds = stringArray(event.dateAssertionIds);
    if (existingRefs.length > 0 || existingIds.length > 0) {
      skippedAlreadyDatedEventCount += 1;
      return event;
    }
    const suggestion = suggestionsByEventIndex.get(eventIndex);
    if (suggestion === undefined || suggestion.status !== "resolved") {
      skippedNoResolvedDateEventCount += 1;
      return event;
    }
    const dateAssertionRefs = uniqueSorted(suggestion.dateAssertionRefs);
    if (dateAssertionRefs.length === 0) {
      skippedNoDateAssertionRefEventCount += 1;
      return event;
    }
    repairedEvents.push({
      eventIndex,
      eventId: event.eventId,
      title: event.title,
      dateAssertionRefs,
      dateAssertionIds: uniqueSorted(suggestion.dateAssertionIds),
      date: suggestion.date,
      month: suggestion.month,
      datePrecision: suggestion.datePrecision,
    });
    return {
      ...event,
      dateAssertionRefs,
    };
  });
  return {
    toolCall: {
      ...input.toolCall,
      events,
    },
    repairedEvents,
    skippedAlreadyDatedEventCount,
    skippedNoResolvedDateEventCount,
    skippedNoDateAssertionRefEventCount,
  };
}

export async function repairRouteTimelineCuration(args: RepairRouteTimelineCurationArgs): Promise<{
  toolCall: TimelineCurationToolCall;
  outputPath: string;
  summaryPath: string;
  validationPath: string;
  summary: RouteTimelineCurationRepairSummary;
}> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const packPath = fromCliPath(args.packPath);
  const toolCallPath = fromCliPath(args.toolCallPath);
  const outputPath = fromCliPath(args.outputPath ?? defaultOutputPath(args.toolCallPath));
  const summaryPath = fromCliPath(args.summaryPath ?? defaultPath(outputPath, "-repair-summary.json"));
  const validationPath = fromCliPath(
    args.validationPath ?? defaultPath(outputPath, "-repair-validation.json"),
  );
  const pack = (await Bun.file(packPath).json()) as Tier2RouteTimelineCurationPackArtifact;
  const toolCall = (await Bun.file(toolCallPath).json()) as TimelineCurationToolCall;
  const beforeValidation = validateRouteTimelineCuration({
    pack,
    toolCall,
    generatedAt,
  });
  const repaired = repairToolCall({
    toolCall,
    validation: beforeValidation,
  });
  const afterValidation = validateRouteTimelineCuration({
    pack,
    toolCall: repaired.toolCall,
    generatedAt,
  });
  const repairedUnknownPrecisionEventCount = repaired.repairedEvents.filter(
    (event) => event.datePrecision === "unknown",
  ).length;
  const summary: RouteTimelineCurationRepairSummary = {
    artifactKind: SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt,
    sourcePackPath: packPath,
    sourceToolCallPath: toolCallPath,
    outputToolCallPath: outputPath,
    validationPath,
    routeId: pack.routeId,
    eventCount: repaired.toolCall.events.length,
    repairedEventCount: repaired.repairedEvents.length,
    addedDateAssertionRefCount: repaired.repairedEvents.reduce(
      (sum, event) => sum + event.dateAssertionRefs.length,
      0,
    ),
    repairedUnknownPrecisionEventCount,
    skippedAlreadyDatedEventCount: repaired.skippedAlreadyDatedEventCount,
    skippedNoResolvedDateEventCount: repaired.skippedNoResolvedDateEventCount,
    skippedNoDateAssertionRefEventCount: repaired.skippedNoDateAssertionRefEventCount,
    beforeValidation: {
      status: beforeValidation.status,
      ...issueCount(beforeValidation),
    },
    afterValidation: {
      status: afterValidation.status,
      ...issueCount(afterValidation),
    },
    repairedEvents: repaired.repairedEvents,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(dirname(summaryPath), { recursive: true });
  await mkdir(dirname(validationPath), { recursive: true });
  await writeJson(outputPath, repaired.toolCall);
  await writeJson(validationPath, afterValidation);
  await writeJson(summaryPath, summary);
  return { toolCall: repaired.toolCall, outputPath, summaryPath, validationPath, summary };
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
    } else if (arg === "--tool-call") {
      if (value === undefined) throw new Error("--tool-call requires a value.");
      args.toolCallPath = value;
      index += 1;
    } else if (arg === "--output") {
      if (value === undefined) throw new Error("--output requires a value.");
      args.outputPath = value;
      index += 1;
    } else if (arg === "--summary") {
      if (value === undefined) throw new Error("--summary requires a value.");
      args.summaryPath = value;
      index += 1;
    } else if (arg === "--validation") {
      if (value === undefined) throw new Error("--validation requires a value.");
      args.validationPath = value;
      index += 1;
    } else if (arg === "--generated-at") {
      if (value === undefined) throw new Error("--generated-at requires a value.");
      args.generatedAt = value;
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 route-timeline-curation-repair option: ${arg}`);
    }
  }
  return args;
}

export async function runRouteTimelineCurationRepairFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.packPath === undefined) throw new Error("Provide --pack.");
  if (args.toolCallPath === undefined) throw new Error("Provide --tool-call.");
  const result = await repairRouteTimelineCuration({
    packPath: args.packPath,
    toolCallPath: args.toolCallPath,
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
    ...(args.validationPath === undefined ? {} : { validationPath: args.validationPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
  console.log(
    `route-timeline-curation-repair: route=${result.summary.routeId} repaired=${result.summary.repairedEventCount} warnings=${result.summary.beforeValidation.warnings}->${result.summary.afterValidation.warnings}`,
  );
  return {
    artifactKind: result.summary.artifactKind,
    schemaVersion: result.summary.schemaVersion,
    generatedAt: result.summary.generatedAt,
    outputPath: result.outputPath,
    summaryPath: result.summaryPath,
    validationPath: result.validationPath,
    summary: result.summary,
  };
}
