// Spike: project the broad document-derived-surfaces-v1 substrate down to a
// single route's cleaned intervention timeline.
//
// Purpose: make the "scattered candidate rows -> one cited, deduped, month-keyed
// timeline" path concrete and reviewable for one route BEFORE committing the
// reviewer-disposition and serving-projection schema. The output milestones are
// shaped to map 1:1 onto the existing `Tier2CanonicalInterventionEvent` /
// `local_tier2_intervention_event*` staging contract, so promotion is a later
// reviewer step rather than a new model.
//
// Deterministic. No LLM. Document-claimed, not public truth.
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  DocumentDerivedEventSurface,
  DocumentDerivedMetricClaimSurface,
} from "@bp/domain/documents/derived-surfaces";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { normalizeRouteIdText } from "../../../lib/route-ids.ts";
import { type CliOption, latestDocsRunId, parseCliOptions, runArtifactRoot } from "./_shared.ts";

// ---------------------------------------------------------------------------
// Route-family resolution
// ---------------------------------------------------------------------------

// NYC bus-route tokens: prefix (longest-first so SIM/BX/BM/QM win over S/B/Q/M)
// + 1-3 digits + optional single branch letter (M14A, M14D, Bx6, SIM5).
const ROUTE_TOKEN_RE = /\b(SIM|BX|BM|QM|M|B|Q|S|X)(\d{1,3})([A-Z]?)\b/gi;

function routeTokensIn(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.toUpperCase().matchAll(ROUTE_TOKEN_RE)) {
    const normalized = normalizeRouteIdText(`${match[1]}${match[2]}${match[3]}`);
    if (normalized !== null) out.add(normalized);
  }
  return [...out];
}

// A token belongs to the target family if it is the target, or a single-letter
// branch of it (M14 <-> M14A/M14D). Documented, deliberately conservative.
function inRouteFamily(token: string, target: string): boolean {
  if (token === target) return true;
  if (token.length === target.length + 1 && token.startsWith(target) && /[A-Z]$/.test(token)) {
    return true;
  }
  if (target.length === token.length + 1 && target.startsWith(token) && /[A-Z]$/.test(target)) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Intervention-type classification (deterministic, order matters)
// ---------------------------------------------------------------------------

const TYPE_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  [
    "automated_bus_lane_enforcement",
    /\b(ace|able|camera enforcement|automated.{0,20}enforcement|bus lane camera)\b/i,
  ],
  [
    "busway",
    /\b(busway|transit (?:and|&|\/) truck priority|transit\/truck priority|truck priority)\b/i,
  ],
  ["select_bus_service", /\b(select bus service|sbs|brt|bus rapid transit)\b/i],
  ["transit_signal_priority", /\b(transit signal priority|tsp|signal priority)\b/i],
  ["bus_lane_infrastructure", /\b(bus lane|red lane|offset lane|bus[- ]only lane|painted lane)\b/i],
  ["all_door_boarding", /\b(all[- ]door boarding|off[- ]board fare)\b/i],
  ["queue_jump", /\bqueue jump\b/i],
  [
    "stop_consolidation",
    /\b(stop consolidation|stop removal|stop balancing|stop spacing|stop relocation)\b/i,
  ],
  ["route_redesign", /\b(route redesign|network redesign|bus network redesign)\b/i],
  [
    "service_change",
    /\b(frequenc|headway|span of service|service increase|more frequent|route extension|reroute)\b/i,
  ],
  ["curb_management", /\b(curb|loading zone|daylighting|parking regulation)\b/i],
];

const TYPE_LABEL: Record<string, string> = {
  automated_bus_lane_enforcement: "Automated bus lane enforcement",
  busway: "Busway",
  bus_lane_infrastructure: "Bus lane",
  select_bus_service: "Select Bus Service",
  transit_signal_priority: "Transit signal priority",
  all_door_boarding: "All-door boarding",
  queue_jump: "Queue jump",
  stop_consolidation: "Stop consolidation",
  route_redesign: "Route redesign",
  service_change: "Service change",
  curb_management: "Curb management",
  other: "Other intervention",
};

function classifyInterventionType(text: string): string {
  for (const [type, re] of TYPE_RULES) {
    if (re.test(text)) return type;
  }
  return "other";
}

function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

// Event families that count as interventions even when the treatment text is
// too thin to classify a specific type.
const INTERVENTION_FAMILIES = new Set([
  "planned_intervention",
  "implementation_milestone",
  "service_change",
]);

// ---------------------------------------------------------------------------
// Date -> (date, month, precision)
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
// Representative month for a season label so timeline ordering works.
const SEASONS: Record<string, number> = { winter: 1, spring: 4, summer: 7, fall: 10, autumn: 10 };

type ParsedDate = {
  date: string;
  month: string;
  precision: "day" | "month" | "year";
  approximate: boolean;
};

const pad2 = (value: number): string => String(value).padStart(2, "0");

function parseEventDate(dateText: string | undefined): ParsedDate | null {
  if (dateText === undefined) return null;
  const text = dateText.toLowerCase();

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso)
    return {
      date: `${iso[1]}-${iso[2]}-${iso[3]}`,
      month: `${iso[1]}-${iso[2]}`,
      precision: "day",
      approximate: false,
    };

  const monthDay = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/,
  );
  if (monthDay) {
    const mo = MONTHS[monthDay[1] ?? ""];
    if (mo !== undefined) {
      return {
        date: `${monthDay[3]}-${pad2(mo)}-${pad2(Number(monthDay[2]))}`,
        month: `${monthDay[3]}-${pad2(mo)}`,
        precision: "day",
        approximate: false,
      };
    }
  }

  const monthYear = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{4})\b/,
  );
  if (monthYear) {
    const mo = MONTHS[monthYear[1] ?? ""];
    if (mo !== undefined) {
      return {
        date: `${monthYear[2]}-${pad2(mo)}-01`,
        month: `${monthYear[2]}-${pad2(mo)}`,
        precision: "month",
        approximate: false,
      };
    }
  }

  const season = text.match(/\b(winter|spring|summer|fall|autumn)\s+(\d{4})\b/);
  if (season) {
    const mo = SEASONS[season[1] ?? ""];
    if (mo !== undefined) {
      return {
        date: `${season[2]}-${pad2(mo)}-01`,
        month: `${season[2]}-${pad2(mo)}`,
        precision: "month",
        approximate: true,
      };
    }
  }

  const year = text.match(/\b(?:19|20)\d{2}\b/);
  if (year)
    return {
      date: `${year[0]}-01-01`,
      month: `${year[0]}-01`,
      precision: "year",
      approximate: true,
    };

  return null;
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

async function* readSurfaceLines<T>(path: string): AsyncGenerator<T> {
  const file = Bun.file(path);
  if (!(await file.exists())) return;
  const text = await file.text();
  for (const line of text.split("\n")) {
    if (line.trim().length > 0) yield JSON.parse(line) as T;
  }
}

// Text used to find route tokens — includes affectedEntitiesRaw (where branch
// route names like "M14D" live).
function routeMatchText(event: DocumentDerivedEventSurface): string {
  return [
    event.eventName,
    event.displayLabel,
    event.treatmentText,
    event.locationText,
    ...(event.affectedEntitiesRaw ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" :: ");
}

// Text used to classify the intervention TYPE — deliberately excludes the route
// name (affectedEntitiesRaw), so a route called "M14 A/D Select Bus Service"
// does not force every one of its events to classify as select_bus_service.
function interventionTypeText(event: DocumentDerivedEventSurface): string {
  return [
    event.treatmentText,
    event.eventName,
    event.displayLabel,
    event.eventSubtype,
    event.locationText,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" :: ")
    .replace(/[_-]+/g, " "); // snake_case treatments (e.g. transit_and_truck_priority) -> matchable words
}

function metricText(metric: DocumentDerivedMetricClaimSurface): string {
  return [metric.metricLabel, metric.subjectText, metric.geographyText, metric.displayLabel]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" :: ");
}

// ---------------------------------------------------------------------------
// Core projection
// ---------------------------------------------------------------------------

type Citation = {
  sourceId: string;
  sourceTitle: string;
  pageNumbers: number[];
  blockId?: string;
  snippet?: string;
};

type Milestone = {
  milestoneId: string;
  interventionType: string;
  eventStatus: string;
  date: string;
  month: string;
  datePrecision: "day" | "month" | "year";
  dateApproximate: boolean;
  routeIds: string[];
  title: string;
  treatmentText?: string;
  locationText?: string;
  memberCount: number;
  memberSurfaceIds: string[];
  sourceCount: number;
  citations: Citation[];
};

type MilestoneAccumulator = {
  interventionType: string;
  eventStatus: string;
  parsed: ParsedDate;
  routeIds: Set<string>;
  titleCandidates: string[];
  treatmentText?: string;
  locationText?: string;
  memberSurfaceIds: string[];
  citationsBySource: Map<string, Citation>;
};

function citationKeyMerge(
  accumulator: MilestoneAccumulator,
  event: DocumentDerivedEventSurface,
): void {
  for (const ref of event.evidenceRefs ?? []) {
    const existing = accumulator.citationsBySource.get(event.sourceId);
    if (existing === undefined) {
      accumulator.citationsBySource.set(event.sourceId, {
        sourceId: event.sourceId,
        sourceTitle: event.sourceTitle,
        pageNumbers: [ref.pageNumber],
        ...(ref.blockId === undefined ? {} : { blockId: ref.blockId }),
        ...(ref.snippet === undefined ? {} : { snippet: ref.snippet }),
      });
    } else {
      if (!existing.pageNumbers.includes(ref.pageNumber)) existing.pageNumbers.push(ref.pageNumber);
      if (existing.snippet === undefined && ref.snippet !== undefined)
        existing.snippet = ref.snippet;
    }
  }
  // Guarantee at least a page-level citation even when evidenceRefs is empty.
  if ((event.evidenceRefs ?? []).length === 0) {
    if (!accumulator.citationsBySource.has(event.sourceId)) {
      accumulator.citationsBySource.set(event.sourceId, {
        sourceId: event.sourceId,
        sourceTitle: event.sourceTitle,
        pageNumbers: [...event.pageNumbers],
      });
    }
  }
}

export type RouteTimelineResult = {
  jsonPath: string;
  markdownPath: string;
  report: RouteTimelineReport;
};

export type RouteTimelineReport = {
  version: 1;
  generatedAt: string;
  route: string;
  surfacesDir: string;
  scanned: { eventRows: number; metricRows: number };
  routeEventRows: number;
  timeline: {
    milestoneCount: number;
    collapsedFromEventRows: number;
    sourceCount: number;
    compressionRatio: number;
    milestones: Milestone[];
  };
  excluded: { undatedEventRows: number; contextEventRows: number };
  corroboratingMetrics: {
    matchedRows: number;
    byFamily: Record<string, number>;
    byAuthority: Record<string, number>;
    examples: Array<{
      metricLabel: string;
      valueText?: string;
      valueNumeric?: number;
      unit?: string;
      metricAuthority: string;
      canonicalFamily: string;
      sourceId: string;
      sourceTitle: string;
    }>;
  };
  stagingMappingNote: string;
};

export type RunRouteTimelineArgs = {
  surfacesDir: string;
  route: string;
  outputDir?: string;
  generatedAt?: string;
};

export async function runRouteTimeline(args: RunRouteTimelineArgs): Promise<RouteTimelineResult> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const route = normalizeRouteIdText(args.route);
  if (route === null) throw new Error(`Invalid --route value: ${args.route}`);

  const eventsPath = join(args.surfacesDir, "events.jsonl");
  const metricsPath = join(args.surfacesDir, "metric-claims.jsonl");

  let eventRows = 0;
  let routeEventRows = 0;
  let undatedEventRows = 0;
  let contextEventRows = 0;
  const accumulators = new Map<string, MilestoneAccumulator>();

  for await (const event of readSurfaceLines<DocumentDerivedEventSurface>(eventsPath)) {
    if (event.surfaceKind !== "event") continue;
    eventRows += 1;

    const tokens = routeTokensIn(routeMatchText(event));
    const familyRouteIds = tokens.filter((token) => inRouteFamily(token, route));
    if (familyRouteIds.length === 0) continue;
    routeEventRows += 1;

    const interventionType = classifyInterventionType(interventionTypeText(event));
    const isIntervention =
      interventionType !== "other" || INTERVENTION_FAMILIES.has(event.canonicalFamily);
    if (!isIntervention) {
      contextEventRows += 1;
      continue;
    }

    const parsed = parseEventDate(event.dateText);
    if (parsed === null) {
      undatedEventRows += 1;
      continue;
    }

    const sortedRouteIds = [...new Set(familyRouteIds)].toSorted();
    // Collapse to the route FAMILY (target route), not the exact token set, so
    // M14 / M14A / M14D events for the same month+type+status become one
    // milestone. The specific branch tokens are preserved in routeIds (union).
    const key = [interventionType, parsed.month, event.eventStatus, route].join("|");
    let accumulator = accumulators.get(key);
    if (accumulator === undefined) {
      accumulator = {
        interventionType,
        eventStatus: event.eventStatus,
        parsed,
        routeIds: new Set(sortedRouteIds),
        titleCandidates: [],
        ...(event.treatmentText === undefined ? {} : { treatmentText: event.treatmentText }),
        ...(event.locationText === undefined ? {} : { locationText: event.locationText }),
        memberSurfaceIds: [],
        citationsBySource: new Map(),
      };
      accumulators.set(key, accumulator);
    }
    for (const routeId of sortedRouteIds) accumulator.routeIds.add(routeId);
    accumulator.memberSurfaceIds.push(event.surfaceId);
    const title = event.eventName ?? event.displayLabel;
    if (title.length > 0) accumulator.titleCandidates.push(title);
    if (accumulator.treatmentText === undefined && event.treatmentText !== undefined) {
      accumulator.treatmentText = event.treatmentText;
    }
    if (accumulator.locationText === undefined && event.locationText !== undefined) {
      accumulator.locationText = event.locationText;
    }
    citationKeyMerge(accumulator, event);
  }

  const milestones: Milestone[] = [...accumulators.values()]
    .map((accumulator) => {
      const citations = [...accumulator.citationsBySource.values()].map((citation) => ({
        ...citation,
        pageNumbers: citation.pageNumbers.toSorted((a, b) => a - b),
      }));
      const routeIds = [...accumulator.routeIds].toSorted();
      const title =
        mostCommon(accumulator.titleCandidates) ?? typeLabel(accumulator.interventionType);
      const milestoneId = `tl_${shortHash(
        [
          accumulator.interventionType,
          accumulator.parsed.month,
          accumulator.eventStatus,
          routeIds.join(","),
        ].join("|"),
      )}`;
      return {
        milestoneId,
        interventionType: accumulator.interventionType,
        eventStatus: accumulator.eventStatus,
        date: accumulator.parsed.date,
        month: accumulator.parsed.month,
        datePrecision: accumulator.parsed.precision,
        dateApproximate: accumulator.parsed.approximate,
        routeIds,
        title,
        ...(accumulator.treatmentText === undefined
          ? {}
          : { treatmentText: accumulator.treatmentText }),
        ...(accumulator.locationText === undefined
          ? {}
          : { locationText: accumulator.locationText }),
        memberCount: accumulator.memberSurfaceIds.length,
        memberSurfaceIds: accumulator.memberSurfaceIds,
        sourceCount: citations.length,
        citations: citations.toSorted((a, b) => b.pageNumbers.length - a.pageNumbers.length),
      } satisfies Milestone;
    })
    .toSorted((a, b) =>
      a.month < b.month
        ? -1
        : a.month > b.month
          ? 1
          : a.interventionType.localeCompare(b.interventionType),
    );

  // Corroborating metric claims: best-effort textual match on the route family.
  let metricRows = 0;
  let matchedRows = 0;
  const byFamily: Record<string, number> = {};
  const byAuthority: Record<string, number> = {};
  const examples: RouteTimelineReport["corroboratingMetrics"]["examples"] = [];
  const exampleFamilies = new Set([
    "bus_speed",
    "travel_time",
    "ridership",
    "reliability_or_dwell",
    "safety_outcome",
  ]);
  for await (const metric of readSurfaceLines<DocumentDerivedMetricClaimSurface>(metricsPath)) {
    if (metric.surfaceKind !== "metric_claim") continue;
    metricRows += 1;
    const tokens = routeTokensIn(metricText(metric));
    if (!tokens.some((token) => inRouteFamily(token, route))) continue;
    matchedRows += 1;
    byFamily[metric.canonicalFamily] = (byFamily[metric.canonicalFamily] ?? 0) + 1;
    byAuthority[metric.metricAuthority] = (byAuthority[metric.metricAuthority] ?? 0) + 1;
    if (examples.length < 12 && exampleFamilies.has(metric.canonicalFamily)) {
      examples.push({
        metricLabel: metric.metricLabel,
        ...(metric.valueText === undefined ? {} : { valueText: metric.valueText }),
        ...(metric.valueNumeric === undefined ? {} : { valueNumeric: metric.valueNumeric }),
        ...(metric.unit === undefined ? {} : { unit: metric.unit }),
        metricAuthority: metric.metricAuthority,
        canonicalFamily: metric.canonicalFamily,
        sourceId: metric.sourceId,
        sourceTitle: metric.sourceTitle,
      });
    }
  }

  const collapsedFromEventRows = milestones.reduce(
    (sum, milestone) => sum + milestone.memberCount,
    0,
  );
  const sourceCount = new Set(
    milestones.flatMap((milestone) => milestone.citations.map((c) => c.sourceId)),
  ).size;

  const report: RouteTimelineReport = {
    version: 1,
    generatedAt,
    route,
    surfacesDir: args.surfacesDir,
    scanned: { eventRows, metricRows },
    routeEventRows,
    timeline: {
      milestoneCount: milestones.length,
      collapsedFromEventRows,
      sourceCount,
      compressionRatio:
        milestones.length === 0
          ? 0
          : Number((collapsedFromEventRows / milestones.length).toFixed(2)),
      milestones,
    },
    excluded: { undatedEventRows, contextEventRows },
    corroboratingMetrics: { matchedRows, byFamily, byAuthority, examples },
    stagingMappingNote:
      "Each milestone maps to a Tier2CanonicalInterventionEvent (milestoneId->eventId, routeIds, " +
      "month->implementationMonth, citations->sourceSpans). Rows stay document-claimed/research_only " +
      "until a reviewer disposition promotes them; this spike does not write to serving tables.",
  };

  const outputDir = args.outputDir ?? args.surfacesDir;
  const jsonPath = join(outputDir, `route-intervention-timeline-${route}.json`);
  const markdownPath = join(outputDir, `route-intervention-timeline-${route}.md`);
  await mkdir(outputDir, { recursive: true });
  await writeJson(jsonPath, report);
  await Bun.write(markdownPath, renderMarkdown(report));

  return { jsonPath, markdownPath, report };
}

// ---------------------------------------------------------------------------
// Rendering + small utilities
// ---------------------------------------------------------------------------

function shortHash(value: string, length = 16): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function mostCommon(values: string[]): string | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const sorted = [...counts.entries()].toSorted((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  return sorted[0]?.[0];
}

function renderMarkdown(report: RouteTimelineReport): string {
  const lines: string[] = [];
  lines.push(`# ${report.route} — document-derived intervention timeline (spike)`);
  lines.push("");
  lines.push(
    `_Generated ${report.generatedAt}. Document-claimed candidate layer, not public truth — ` +
      `every row stays research-only until reviewed._`,
  );
  lines.push("");
  lines.push(
    `**${report.routeEventRows}** event rows mention ${report.route} → ` +
      `**${report.timeline.collapsedFromEventRows}** intervention rows collapsed into ` +
      `**${report.timeline.milestoneCount}** dated milestones across ` +
      `**${report.timeline.sourceCount}** sources ` +
      `(${report.timeline.compressionRatio}× compression). ` +
      `Excluded: ${report.excluded.undatedEventRows} undated, ${report.excluded.contextEventRows} non-intervention/context.`,
  );
  lines.push("");
  lines.push("## Timeline");
  lines.push("");
  if (report.timeline.milestones.length === 0) {
    lines.push("_No dated intervention milestones for this route._");
  }
  for (const milestone of report.timeline.milestones) {
    const approx = milestone.dateApproximate ? " ~approx" : "";
    const label = typeLabel(milestone.interventionType);
    lines.push(
      `### ${milestone.month}${approx} · ${label} · ${milestone.eventStatus} · [${milestone.routeIds.join(", ")}]`,
    );
    lines.push(`*${milestone.title}*  `);
    lines.push(
      `date ${milestone.date} (${milestone.datePrecision}) · ${milestone.memberCount} candidate rows · ${milestone.sourceCount} sources`,
    );
    if (milestone.treatmentText !== undefined)
      lines.push(`treatment: ${milestone.treatmentText}  `);
    for (const citation of milestone.citations.slice(0, 6)) {
      const pages = citation.pageNumbers.length > 0 ? ` p.${citation.pageNumbers.join(",")}` : "";
      const snippet =
        citation.snippet !== undefined
          ? ` — "${citation.snippet.replace(/\s+/g, " ").trim()}"`
          : "";
      lines.push(`- ${citation.sourceTitle}${pages}${snippet}`);
    }
    if (milestone.citations.length > 6)
      lines.push(`- …and ${milestone.citations.length - 6} more sources`);
    lines.push("");
  }

  lines.push("## Corroborating metric claims (textual match, document-claimed)");
  lines.push("");
  lines.push(
    `${report.corroboratingMetrics.matchedRows} metric-claim rows textually mention ${report.route}. ` +
      `These are source-stated, not deterministic Studio metrics.`,
  );
  const families = Object.entries(report.corroboratingMetrics.byFamily).toSorted(
    (a, b) => b[1] - a[1],
  );
  if (families.length > 0) {
    lines.push("");
    lines.push("| family | rows |");
    lines.push("|---|---:|");
    for (const [family, count] of families.slice(0, 12)) lines.push(`| ${family} | ${count} |`);
  }
  if (report.corroboratingMetrics.examples.length > 0) {
    lines.push("");
    lines.push("Examples:");
    for (const example of report.corroboratingMetrics.examples) {
      const value =
        example.valueText ??
        (example.valueNumeric !== undefined ? String(example.valueNumeric) : "");
      const unit = example.unit !== undefined ? ` ${example.unit}` : "";
      lines.push(
        `- **${example.metricLabel}** = ${value}${unit} (${example.metricAuthority}; ${example.canonicalFamily}) — ${example.sourceTitle}`,
      );
    }
  }
  lines.push("");
  lines.push(`> ${report.stagingMappingNote}`);
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

type CliArgs = {
  surfacesDir?: string;
  route?: string;
  artifactRoot?: string;
  runId?: string;
  outputDir?: string;
  generatedAt?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const options: CliOption<CliArgs>[] = [
    {
      flags: ["--surfaces-dir"],
      apply: (output, value) => {
        if (value !== undefined) output.surfacesDir = fromCliPath(value);
      },
    },
    {
      flags: ["--route"],
      apply: (output, value) => {
        if (value !== undefined) output.route = value;
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--output-dir"],
      apply: (output, value) => {
        if (value !== undefined) output.outputDir = fromCliPath(value);
      },
    },
    {
      flags: ["--generated-at"],
      apply: (output, value) => {
        if (value !== undefined) output.generatedAt = value;
      },
    },
  ];
  return parseCliOptions(argv, {}, options);
}

async function resolveSurfacesDir(args: CliArgs): Promise<string> {
  if (args.surfacesDir !== undefined) return args.surfacesDir;
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) throw new Error("No docs run found. Provide --run-id or --surfaces-dir.");
  return join(runArtifactRoot(artifactRoot, runId), "document-derived-surfaces-v1");
}

export async function runRouteTimelineFromCli(argv: string[]): Promise<RouteTimelineReport> {
  const args = parseArgs(argv);
  if (args.route === undefined) throw new Error("Missing required --route (e.g. --route M14).");
  const surfacesDir = await resolveSurfacesDir(args);
  const result = await runRouteTimeline({
    surfacesDir,
    route: args.route,
    ...(args.outputDir === undefined ? {} : { outputDir: args.outputDir }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
  console.log(
    `route-timeline ${result.report.route}: ${result.report.routeEventRows} route event rows -> ` +
      `${result.report.timeline.milestoneCount} milestones (${result.report.timeline.sourceCount} sources); ` +
      `excluded ${result.report.excluded.undatedEventRows} undated / ${result.report.excluded.contextEventRows} context; ` +
      `${result.report.corroboratingMetrics.matchedRows} metric claims. md=${result.markdownPath}`,
  );
  return result.report;
}
