/**
 * normalize-agentic-payloads.ts
 *
 * Best-effort deterministic normalizer for the Tier 2 agentic-extraction `rawPayload`
 * fields produced by the qv7 (and sibling) runs.
 *
 * The agentic extractor emits ~692 distinct `*Raw` field names with heavy naming drift
 * (dateRaw / eventDate / dateText all mean "date"; statusRaw / eventStatus / status all
 * mean "status"; etc.). Only routes (routeTextRaw -> canonicalSelections.routeIds) and
 * metric numerics (metricValueRaw -> metricValueNumeric) are structured today.
 *
 * This script collapses the naming drift into canonical CONCEPTS and normalizes their
 * VALUES onto the project's existing canonical vocabularies in `@bp/domain`
 * (DocumentDerivedEventStatus / MetricAuthority / Priority / DatePrecision / EntityMode),
 * so we do not invent a parallel taxonomy. Where a concept has no domain enum yet
 * (unit, direction, claimKind, questionKind, contextKind, eventFamily, tableKind,
 * documentMode, metricValueKind) it uses a curated controlled vocabulary derived from the
 * observed value distributions, and records every value it could NOT map to canonical so
 * the vocabularies can be widened from real fallthrough data.
 *
 * Outputs (under <run-dir>/normalized/ by default):
 *   - normalized-payloads.jsonl  one record per accepted draft (skipped in --report-only)
 *   - coverage-report.json       per-concept canonical/fallthrough rates + top unmapped values
 *
 * Run:
 *   bun tools/pipeline-v2/scripts/normalize-agentic-payloads.ts [--run-dir <dir>] \
 *       [--out <dir>] [--limit N] [--report-only] [--examples N]
 *
 * Deterministic + idempotent: re-running overwrites the outputs.
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DocumentDerivedDatePrecisionSchema,
  DocumentDerivedEntityModeSchema,
  DocumentDerivedEventStatusSchema,
  DocumentDerivedMetricAuthoritySchema,
  DocumentDerivedPrioritySchema,
} from "@bp/domain/documents/derived-surfaces";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const DEFAULT_RUN_DIR =
  "/mnt/models/dev/bus-reliability-tracker/data/artifacts/docs/agentic-runs-20260604/full-authority-retry-qv7-pioneer-on16";

function parseArgs(argv: string[]) {
  const out: {
    runDir: string;
    out?: string;
    limit?: number;
    reportOnly: boolean;
    examples: number;
  } = { runDir: DEFAULT_RUN_DIR, reportOnly: false, examples: 5 };
  const readValue = (index: number, flag: string): string => {
    const value = argv[index];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--run-dir") out.runDir = readValue(++i, a);
    else if (a === "--out") out.out = readValue(++i, a);
    else if (a === "--limit") out.limit = Number(readValue(++i, a));
    else if (a === "--report-only") out.reportOnly = true;
    else if (a === "--examples") out.examples = Number(readValue(++i, a));
    else if (a === "--help" || a === "-h") {
      console.log(
        "usage: bun normalize-agentic-payloads.ts [--run-dir D] [--out D] [--limit N] [--report-only] [--examples N]",
      );
      process.exit(0);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Text helpers (mirror _document-derived-surfaces.ts style)
// ---------------------------------------------------------------------------

const compact = (s: unknown): string =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
const lc = (s: unknown): string => compact(s).toLowerCase();
const includesAny = (text: string, terms: string[]): boolean => terms.some((t) => text.includes(t));
/** snake_case a free value: lowercase, non-alnum runs -> "_", trim "_". */
const snake = (s: unknown): string =>
  lc(s)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const ES = DocumentDerivedEventStatusSchema.options;
const MA = DocumentDerivedMetricAuthoritySchema.options;
const PR = DocumentDerivedPrioritySchema.options;
const DP = DocumentDerivedDatePrecisionSchema.options;
const EM = new Set<string>(DocumentDerivedEntityModeSchema.options);

// ---------------------------------------------------------------------------
// Concept resolver: rawPayload field name -> canonical concept.
// Keys are matched after lowercasing and stripping a trailing "raw".
// A field maps to the FIRST concept whose member set contains its stripped name.
// ---------------------------------------------------------------------------

const CONCEPT_FIELDS: Record<string, string[]> = {
  // enum concepts (normalized to a controlled value)
  status: ["status", "eventstatus", "projectstatus", "interventionstatus", "milestonestatus"],
  authority: ["authority", "sourceclaimauthority", "metricauthority", "claimauthority"],
  truthstatus: ["truthstatus"],
  wordinggate: ["publicationwordinggate", "wordinggate"],
  priority: ["priority", "reviewerpriority"],
  unit: ["unit", "metricunit", "changeunit", "valueunit"],
  direction: ["direction", "changedirection", "traveldirection", "metricdirection"],
  metricvaluekind: ["metricvaluekind", "valuekind"],
  claimkind: ["claimkind", "claimtype"],
  questionkind: ["questionkind", "questiontype"],
  contextkind: ["contextkind", "contexttype"],
  entitykind: ["entitykind", "entitytype"],
  eventfamily: ["eventfamily", "family"],
  eventsubtype: ["eventsubtype", "subtype", "subkind", "eventsubkind"],
  tablekind: ["tablekind", "tabletype"],
  documentmode: ["documentmode", "docmode", "pagemode"],
  modehint: ["mode", "modehint"],
  treatmentkind: ["treatmentkind", "treatmenttype", "treatmentcategory", "treatmentsubtype"],
  role: ["role", "entityrole", "pagerole", "pageroles"],
  // parsed/open-world concepts
  date: [
    "date",
    "eventdate",
    "dateobserved",
    "datedetail",
    "datelabel",
    "datedescription",
    "datetext",
  ],
  period: ["period", "beforeperiod", "afterperiod", "timeperiod", "metricperiod"],
  geography: [
    "geography",
    "geographies",
    "metricgeography",
    "corridor",
    "corridortext",
    "affectedcorridors",
    "eventaffectedcorridors",
  ],
  location: ["location", "eventlocation", "locationtext", "locationdescription", "borough"],
};

const FIELD_TO_CONCEPT = new Map<string, string>();
for (const [concept, fields] of Object.entries(CONCEPT_FIELDS)) {
  for (const f of fields) if (!FIELD_TO_CONCEPT.has(f)) FIELD_TO_CONCEPT.set(f, concept);
}
/** Concepts that resolve to a closed canonical vocabulary (so "fallthrough" is meaningful). */
const ENUM_CONCEPTS = new Set([
  "status",
  "authority",
  "truthstatus",
  "priority",
  "unit",
  "direction",
  "metricvaluekind",
  "claimkind",
  "questionkind",
  "contextkind",
  "entitykind",
  "eventfamily",
  "tablekind",
  "documentmode",
  "modehint",
  "truthstatus",
  "wordinggate",
  "treatmentkind",
]);

function conceptFor(fieldName: string): string | null {
  const base = lc(fieldName)
    .replace(/raw$/i, "")
    .replace(/[^a-z0-9]/g, "");
  return FIELD_TO_CONCEPT.get(base) ?? null;
}

// Fields with no concept fall into three buckets, only the last of which is a gap:
//  - structured: already typed upstream (numeric metric value, route ids, counts) — leave as-is
//  - freetext:   intentionally open prose (claim text, labels, names, questions)
//  - unknown:    unrecognized — the real "widen the resolver" signal
const STRUCTURED_PASSTHROUGH = new Set([
  "metricvalue",
  "metricvaluenumeric",
  "value",
  "valuenumeric",
  "comparisonvalue",
  "comparisonvaluenumeric",
  "changevalue",
  "changenumeric",
  "change",
  "rowcount",
  "columncount",
  "pagenumber",
  "sourcepagenumbers",
  "routetext",
  "routeids",
  "affectedrouteids",
  "subjectrouteids",
  "entitycandidateids",
  "attendeecount",
  "researchusetags",
  "contenttypes",
  "attributes",
  "affectedentities",
  "rows",
  "headers",
  "headertexts",
  "agendaitems",
  "agencies",
  "affectedstreets",
  "affectedintersections",
  // already-typed entity/source metadata (not a normalization gap)
  "sourceid",
  "sourcegroup",
  "documentdate",
  "entityid",
  "entity",
  "entitymode",
  "entitymodehint",
  "entitynamenormalized",
  "normalizedrefhint",
  "subjectroute",
  "subjectentity",
]);
function classifyUnknown(fieldName: string): "structured" | "freetext" | "unknown" {
  const base = lc(fieldName)
    .replace(/raw$/i, "")
    .replace(/[^a-z0-9]/g, "");
  if (STRUCTURED_PASSTHROUGH.has(base)) return "structured";
  if (
    /(text|label|name|question|summary|description|reason|note|notes|title|excerpt|quote|comment|detail|details|subject|treatment|comparison|context)$/.test(
      base,
    )
  )
    return "freetext";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Value normalizers. Each returns { value, canonical } where canonical=false means
// "recognized concept, but value not in the controlled vocabulary" (a widen-me signal).
// ---------------------------------------------------------------------------

type Norm = { value: unknown; canonical: boolean; extra?: Record<string, unknown> };
const ok = (value: unknown, extra?: Record<string, unknown>): Norm =>
  extra === undefined ? { value, canonical: true } : { value, canonical: true, extra };
const fall = (value: unknown, extra?: Record<string, unknown>): Norm =>
  extra === undefined ? { value, canonical: false } : { value, canonical: false, extra };

/** General project/intervention status (superset of the domain event-status enum). */
function normStatus(v: string): Norm {
  const t = lc(v);
  if (includesAny(t, ["cancel", "withdrawn", "abandoned"])) return ok("cancelled");
  if (includesAny(t, ["implemented", "launched", "in service", "in effect", "operational"]))
    return ok("implemented");
  if (includesAny(t, ["complete", "completed", "done", "finished", "delivered"]))
    return ok("completed");
  if (includesAny(t, ["in_progress", "in progress", "underway", "construction", "active"]))
    return ok("in_progress");
  if (includesAny(t, ["ongoing", "continuing", "continue"])) return ok("ongoing");
  if (includesAny(t, ["approved", "adopted"])) return ok("approved");
  if (includesAny(t, ["scheduled", "upcoming"])) return ok("scheduled");
  if (includesAny(t, ["planned", "plan", "future"])) return ok("planned");
  if (includesAny(t, ["proposed", "proposal", "recommended", "concept"])) return ok("proposed");
  if (includesAny(t, ["existing", "current", "today", "baseline"])) return ok("existing");
  if (t === "" || t === "unknown" || t === "n/a" || t === "tbd" || t === "not specified")
    return ok("unknown");
  return fall(snake(v));
}

/** Map a status string to the domain DocumentDerivedEventStatus enum (used for event surfaces). */
function normEventStatus(v: string): Norm {
  const t = lc(v);
  if (
    includesAny(t, [
      "implemented",
      "launched",
      "complete",
      "in service",
      "in effect",
      "operational",
    ])
  )
    return ok("implemented");
  if (includesAny(t, ["approved", "adopted"])) return ok("approved");
  if (includesAny(t, ["planned", "upcoming", "scheduled", "future"])) return ok("planned");
  if (includesAny(t, ["proposed", "proposal", "recommended", "concept"])) return ok("proposed");
  if (includesAny(t, ["historical", "past", "former"])) return ok("historical_context");
  return ES.includes(t as never) ? ok(t) : ok("unclear");
}

/** Metric authority -> domain enum (mirrors classifyMetricAuthority) + cleaned agency token. */
function normAuthority(v: string): Norm {
  const t = lc(v);
  let agency = "unknown";
  if (includesAny(t, ["comptroller"])) agency = "nyc_comptroller";
  else if (includesAny(t, ["mta", "nyct", "new york city transit"])) agency = "mta_nyct";
  else if (includesAny(t, ["dot", "department of transportation"])) agency = "nyc_dot";
  else if (includesAny(t, ["dca", "city council", "community board", "cb"]))
    agency = "nyc_local_gov";
  else if (includesAny(t, ["consultant", "aecom", "sam schwartz", "wsp", "hdr"]))
    agency = "consultant";
  else if (includesAny(t, ["advocacy", "riders alliance", "tstc", "transportation alternatives"]))
    agency = "advocacy";

  let metricAuthority: string;
  if (includesAny(t, ["customer journey", "abst", "additional bus stop time", "customer"]))
    metricAuthority = "official_customer_metric";
  else if (includesAny(t, ["comptroller", "audit", "independent"]))
    metricAuthority = "independent_audit";
  else if (includesAny(t, ["mta", "nyct", "dot", "agency", "official"]))
    metricAuthority = "official_agency_metric";
  else if (includesAny(t, ["consultant", "advocacy"])) metricAuthority = "consultant_or_advocacy";
  else metricAuthority = "document_claim_only";

  const canonical = MA.includes(metricAuthority as never) && agency !== "unknown";
  return { value: metricAuthority, canonical, extra: { authorityAgency: agency } };
}

const UNIT_ALIAS: Record<string, string> = {
  "%": "percent",
  pct: "percent",
  percentage: "percent",
  percent: "percent",
  percentages: "percent",
  min: "minutes",
  mins: "minutes",
  minute: "minutes",
  minutes: "minutes",
  sec: "seconds",
  secs: "seconds",
  second: "seconds",
  seconds: "seconds",
  hr: "hours",
  hrs: "hours",
  hour: "hours",
  hours: "hours",
  ft: "feet",
  foot: "feet",
  feet: "feet",
  mi: "miles",
  mile: "miles",
  miles: "miles",
  mph: "mph",
  "miles per hour": "mph",
  rider: "riders",
  riders: "riders",
  ridership: "riders",
  passenger: "passengers",
  passengers: "passengers",
  vehicle: "vehicles",
  vehicles: "vehicles",
  trip: "trips",
  trips: "trips",
  day: "days",
  days: "days",
  dollar: "dollars",
  dollars: "dollars",
  usd: "dollars",
  $: "dollars",
};
function normUnit(v: string): Norm {
  const t = lc(v);
  if (UNIT_ALIAS[t]) return ok(UNIT_ALIAS[t]);
  for (const [k, val] of Object.entries(UNIT_ALIAS)) if (t.includes(k)) return ok(val);
  if (t === "" || t === "none" || t === "n/a") return ok("unknown");
  return fall(snake(v));
}

/** direction is overloaded: split compass heading from change-direction. */
function normDirection(v: string): Norm {
  const t = lc(v);
  const compass = includesAny(t, ["north", "nb", "uptown"])
    ? "NB"
    : includesAny(t, ["south", "sb", "downtown"])
      ? "SB"
      : includesAny(t, ["east", "eb"])
        ? "EB"
        : includesAny(t, ["west", "wb"])
          ? "WB"
          : includesAny(t, ["both", "bidirectional", "two-way", "two way"])
            ? "both"
            : null;
  const change = includesAny(t, ["increase", "faster", "higher", "up", "improv", "gain"])
    ? "increase"
    : includesAny(t, ["decrease", "slower", "lower", "down", "reduc", "loss", "drop"])
      ? "decrease"
      : includesAny(t, ["no change", "none", "flat", "unchanged"])
        ? "none"
        : null;
  if (compass || change) return ok({ compass, change });
  return fall(snake(v));
}

function makeEnum(canon: string[], aliases: Record<string, string> = {}) {
  const set = new Set(canon);
  return (v: string): Norm => {
    const s = snake(v);
    if (set.has(s)) return ok(s);
    if (aliases[s]) return ok(aliases[s]);
    for (const [k, val] of Object.entries(aliases)) if (s.includes(k)) return ok(val);
    if (s === "") return ok("unknown");
    return fall(s);
  };
}

const normMetricValueKind = makeEnum(
  [
    "absolute",
    "percent",
    "textual",
    "range",
    "duration",
    "currency",
    "rate",
    "count",
    "ratio",
    "unknown",
  ],
  {
    textual_qualitative: "textual",
    qualitative: "textual",
    monetary: "currency",
    percentage: "percent",
    time: "duration",
  },
);
const normClaimKind = makeEnum(
  [
    "existing_condition",
    "proposed_treatment",
    "project_scope",
    "public_feedback",
    "performance_observation",
    "methodology_note",
    "policy_or_operations_statement",
    "problem_statement",
    "other",
  ],
  {
    existing_conditions: "existing_condition",
    feedback: "public_feedback",
    performance: "performance_observation",
    methodology: "methodology_note",
    scope: "project_scope",
    problem: "problem_statement",
  },
);
const normQuestionKind = makeEnum(
  [
    "missing_detail",
    "content_gap",
    "design_detail",
    "data_gap",
    "clarification",
    "missing_context",
    "scope_clarification",
    "content_anticipation",
    "other",
  ],
  { missing_information: "missing_detail", data: "data_gap", clarify: "clarification" },
);
const normContextKind = makeEnum(
  [
    "section_heading",
    "presentation_context",
    "document_context",
    "project_timeline",
    "document_structure",
    "meeting_context",
    "page_context",
    "other",
  ],
  {
    section_context: "section_heading",
    heading: "section_heading",
    presentation: "presentation_context",
    meeting: "meeting_context",
  },
);
const normEventFamily = makeEnum(
  [
    "community_engagement",
    "implementation",
    "planning",
    "design",
    "service_change",
    "milestone",
    "study",
    "construction",
    "approval",
    "other",
  ],
  {
    community_outreach: "community_engagement",
    public_outreach: "community_engagement",
    community_outreach_meeting: "community_engagement",
    outreach: "community_engagement",
    project_phase: "milestone",
    project_milestone: "milestone",
    service_launch: "service_change",
    service_change_candidate: "service_change",
  },
);
const normTableKind = makeEnum(
  [
    "legend",
    "comparison_table",
    "breakdown",
    "stop_list",
    "lane_configuration",
    "schedule",
    "mode_share",
    "other",
  ],
  {
    map_legend: "legend",
    legend_table: "legend",
    percentage_breakdown: "breakdown",
    mode_share_table: "mode_share",
    cross_section_lane_configuration: "lane_configuration",
  },
);
const normDocumentMode = makeEnum(
  ["presentation_slide", "newsletter", "report_section", "map_figure", "fact_sheet", "other"],
  {}, // presentation_slide_* variants collapse via the includes() pass below
);
function normDocumentModeWrapped(v: string): Norm {
  const s = snake(v);
  if (s.startsWith("presentation_slide") || s.startsWith("presentation"))
    return ok("presentation_slide");
  return normDocumentMode(v);
}
const normModeHint = makeEnum(
  [
    "bus",
    "rail",
    "subway",
    "select_bus_service",
    "roadway",
    "ferry",
    "bike",
    "pedestrian",
    "unknown",
  ],
  {
    sbs: "select_bus_service",
    brt: "select_bus_service",
    bus_rapid_transit: "select_bus_service",
    local_bus: "bus",
    limited_bus: "bus",
    train: "rail",
    metro: "subway",
    walk: "pedestrian",
    bicycle: "bike",
  },
);
const normTreatmentKind = makeEnum(
  [
    "bus_lane",
    "busway",
    "offset_bus_lane",
    "transit_signal_priority",
    "camera_enforcement",
    "stop_optimization",
    "all_door_boarding",
    "fare_payment",
    "roadway_redesign",
    "signal_timing",
    "pavement_markings",
    "pedestrian_safety",
    "parking_changes",
    "turn_restriction",
    "other",
  ],
  {
    tsp: "transit_signal_priority",
    signal_priority: "transit_signal_priority",
    ace: "camera_enforcement",
    able: "camera_enforcement",
    bus_lane_camera: "camera_enforcement",
    red_lane: "bus_lane",
    bus_lanes: "bus_lane",
    offset_lane: "offset_bus_lane",
    stop_consolidation: "stop_optimization",
    stop_changes: "stop_optimization",
    boarding: "all_door_boarding",
    off_board_fare: "fare_payment",
    roadway: "roadway_redesign",
    street_redesign: "roadway_redesign",
    markings: "pavement_markings",
  },
);

/** entityKind -> domain DocumentDerivedEntityMode. */
function normEntityKind(v: string): Norm {
  const s = snake(v);
  if (EM.has(s)) return ok(s);
  const t = lc(v);
  if (includesAny(t, ["bus route", "bus_route", "route"])) return ok("bus_route");
  if (includesAny(t, ["bus stop", "stop"])) return ok("bus_stop");
  if (includesAny(t, ["subway", "train line"])) return ok("subway_line");
  if (includesAny(t, ["lirr"])) return ok("lirr_line");
  if (includesAny(t, ["station"])) return ok("rail_station");
  if (includesAny(t, ["intersection"])) return ok("intersection");
  if (includesAny(t, ["corridor"])) return ok("corridor");
  if (includesAny(t, ["street", "avenue", "road", "boulevard", "lane"])) return ok("street");
  if (includesAny(t, ["community board"])) return ok("community_board");
  if (includesAny(t, ["neighborhood"])) return ok("neighborhood");
  if (includesAny(t, ["borough"])) return ok("borough");
  if (includesAny(t, ["agency", "mta", "nyct", "dot"])) return ok("agency");
  if (includesAny(t, ["program", "initiative"])) return ok("program");
  if (includesAny(t, ["lane", "busway", "camera", "tsp", "treatment", "design"]))
    return ok("treatment");
  if (includesAny(t, ["metric", "speed", "ridership", "headway"])) return ok("metric_subject");
  return fall(s);
}

/** Agentic truthStatus vocab -> domain DocumentDerivedTruthStatus. */
function normTruthStatus(v: string): Norm {
  const t = lc(v);
  if (includesAny(t, ["official"])) return ok("official_source_claim");
  if (includesAny(t, ["confirm", "reviewer"])) return ok("reviewer_confirmed");
  if (includesAny(t, ["disput", "contest"])) return ok("disputed");
  if (includesAny(t, ["metadata"])) return ok("source_metadata");
  if (includesAny(t, ["deterministic", "computed", "measured"]))
    return ok("deterministic_project_metric");
  if (
    includesAny(t, [
      "stated",
      "proposed",
      "plausible",
      "claim",
      "source_statement",
      "source_stated",
      "needs_review",
      "design",
    ])
  )
    return ok("document_claim_only");
  if (t === "" || t === "unknown" || t === "n/a") return ok("unknown");
  return fall(snake(v));
}

/** publicationWordingGate vocab (~99% quote_as_source_statement). */
function normWordingGate(v: string): Norm {
  const t = lc(v);
  if (includesAny(t, ["quote"])) return ok("quote_as_source_statement");
  if (includesAny(t, ["paraphrase"])) return ok("paraphrase_permitted");
  if (includesAny(t, ["suppress"])) return ok("suppress_from_public");
  if (includesAny(t, ["causal"])) return ok("needs_causal_review");
  if (t === "" || t === "unknown") return ok("unknown");
  return fall(snake(v));
}

const PRIORITY_BY = (v: string): Norm => {
  const t = lc(v);
  if (includesAny(t, ["high", "critical", "urgent"])) return ok("high");
  if (includesAny(t, ["medium", "moderate", "normal"])) return ok("medium");
  if (includesAny(t, ["low", "minor"])) return ok("low");
  return PR.includes(t as never) ? ok(t) : ok("unknown");
};

// ---- date / period parsing -> ISO + precision ----------------------------
const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};
function classifyDatePrecision(text: string): string {
  if (text.includes(" to ") || text.includes(" through ") || /\d{4}\s*[-/]\s*\d{4}/.test(text))
    return "range";
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(text)) return "day";
  if (
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/.test(
      text,
    )
  )
    return "day";
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\b/.test(text))
    return "month";
  if (/\b\d{4}\b/.test(text)) return "year";
  return "unknown";
}
function normDate(v: string): Norm {
  const raw = compact(v);
  const t = lc(raw);
  if (t === "" || includesAny(t, ["unknown", "not specified", "n/a", "tbd", "undated"])) {
    return ok({ iso: null, precision: "unknown" });
  }
  const precision = classifyDatePrecision(t);
  let iso: string | null = null;
  const isoDayMatch = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const monthDayYearMatch = t.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/,
  );
  const monthYearMatch = t.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{4})\b/,
  );
  const yearMatch = t.match(/\b(\d{4})\b/);
  if (isoDayMatch !== null) {
    const [year, month, day] = [isoDayMatch[1], isoDayMatch[2], isoDayMatch[3]];
    if (year !== undefined && month !== undefined && day !== undefined) {
      iso = `${year}-${month}-${day}`;
    }
  } else if (monthDayYearMatch !== null) {
    const [monthName, day, year] = [
      monthDayYearMatch[1],
      monthDayYearMatch[2],
      monthDayYearMatch[3],
    ];
    const month = monthName === undefined ? undefined : MONTHS[monthName];
    if (year !== undefined && month !== undefined && day !== undefined) {
      iso = `${year}-${month}-${day.padStart(2, "0")}`;
    }
  } else if (monthYearMatch !== null) {
    const [monthName, year] = [monthYearMatch[1], monthYearMatch[2]];
    const month = monthName === undefined ? undefined : MONTHS[monthName];
    if (year !== undefined && month !== undefined) {
      iso = `${year}-${month}`;
    }
  } else if (yearMatch !== null) {
    iso = yearMatch[1] ?? null;
  }
  const canonical = DP.includes(precision as never) && (precision === "unknown" || iso !== null);
  return { value: { iso, precision }, canonical };
}

// ---- geography / location -> cleaned string (needs a gazetteer to resolve) --
const STREET_ABBR: Array<[RegExp, string]> = [
  [/\bst\b\.?/g, "street"],
  [/\bave\b\.?/g, "avenue"],
  [/\bav\b\.?/g, "avenue"],
  [/\bblvd\b\.?/g, "boulevard"],
  [/\brd\b\.?/g, "road"],
  [/\bpkwy\b\.?/g, "parkway"],
  [/\bpl\b\.?/g, "place"],
  [/\bdr\b\.?/g, "drive"],
  [/\bln\b\.?/g, "lane"],
  [/\bhwy\b\.?/g, "highway"],
];
const BOROUGHS = ["manhattan", "brooklyn", "queens", "bronx", "staten island"];
function normPlace(v: string): Norm {
  let t = lc(v);
  if (
    t === "" ||
    t === "unknown" ||
    t === "not specified" ||
    t === "new york city" ||
    t === "nyc" ||
    t === "citywide"
  ) {
    return ok({ cleaned: t || "unknown", borough: null, resolved: false, needsGazetteer: false });
  }
  let borough: string | null = null;
  for (const b of BOROUGHS) if (t.includes(b)) borough = b.replace(" ", "_");
  for (const [re, full] of STREET_ABBR) t = t.replace(re, full);
  t = t
    .replace(/\b(corridor|area|study area|project area)\b/g, "")
    .replace(/,\s*(manhattan|brooklyn|queens|bronx|staten island)\b/g, "");
  const cleaned = compact(t).replace(/\s+/g, " ");
  // dedup key is the structuring target; resolution itself needs a street/corridor gazetteer.
  return { value: { cleaned, borough, resolved: false, needsGazetteer: true }, canonical: false };
}

// ---------------------------------------------------------------------------
// Concept dispatch
// ---------------------------------------------------------------------------

function normalizeConcept(concept: string, value: unknown, surfaceKind: string): Norm {
  const v = Array.isArray(value) ? value.map((x) => compact(x)).join(" | ") : String(value ?? "");
  switch (concept) {
    case "status":
      return surfaceKind === "event_candidate" || surfaceKind === "service_change_candidate"
        ? normEventStatus(v)
        : normStatus(v);
    case "authority":
      return normAuthority(v);
    case "truthstatus":
      return normTruthStatus(v);
    case "wordinggate":
      return normWordingGate(v);
    case "priority":
      return PRIORITY_BY(v);
    case "unit":
      return normUnit(v);
    case "direction":
      return normDirection(v);
    case "metricvaluekind":
      return normMetricValueKind(v);
    case "claimkind":
      return normClaimKind(v);
    case "questionkind":
      return normQuestionKind(v);
    case "contextkind":
      return normContextKind(v);
    case "entitykind":
      return normEntityKind(v);
    case "eventfamily":
      return normEventFamily(v);
    case "tablekind":
      return normTableKind(v);
    case "documentmode":
      return normDocumentModeWrapped(v);
    case "modehint":
      return normModeHint(v);
    case "treatmentkind":
      return normTreatmentKind(v);
    case "date":
      return normDate(v);
    case "period":
      return normDate(v); // periods reuse the date parser (scenario labels fall through to precision=unknown)
    case "geography":
    case "location":
      return normPlace(v);
    default:
      return fall(snake(v)); // recognized-but-free-text concept
  }
}

// canonical domain surfaceKind for each agentic surfaceKind
const SURFACE_KIND_CANON: Record<string, string> = {
  entity_mention: "entity",
  metric_observation: "metric_claim",
  event_candidate: "event",
  table_observation: "table",
  claim: "claim",
  context_signal: "context_signal",
  review_question: "review_question",
  relation: "relation",
  treatment_component: "entity",
  source_note: "context_signal",
  service_change_candidate: "event",
  causal_claim: "claim",
  finding_reasoning_seed: "claim",
  source_gap_seed: "review_question",
};

// ---------------------------------------------------------------------------
// Main walk
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const shardRoot = join(args.runDir, "shards");
if (!existsSync(shardRoot)) {
  console.error(`No shards dir at ${shardRoot}`);
  process.exit(1);
}
const outDir = args.out ?? join(args.runDir, "normalized");
if (!args.reportOnly) mkdirSync(outDir, { recursive: true });
const jsonlPath = join(outDir, "normalized-payloads.jsonl");
const reportPath = join(outDir, "coverage-report.json");
const jsonl = args.reportOnly ? null : createWriteStream(jsonlPath, { flags: "w" });

type ConceptStat = {
  instances: number;
  canonical: number;
  fallthrough: number;
  unmappedTop: Map<string, number>;
};
const conceptStats: Record<string, ConceptStat> = {};
const rawFieldStats = {
  total: 0,
  mappedToConcept: 0,
  structuredPassthrough: 0,
  freetextPassthrough: 0,
  trulyUnknown: 0,
  unknownTop: new Map<string, number>(),
};
let drafts = 0,
  draftsWritten = 0;
const examples: unknown[] = [];

function bump(concept: string, n: Norm, rawValue: unknown) {
  let s = conceptStats[concept];
  if (s === undefined) {
    s = {
      instances: 0,
      canonical: 0,
      fallthrough: 0,
      unmappedTop: new Map(),
    };
    conceptStats[concept] = s;
  }
  s.instances++;
  if (n.canonical) s.canonical++;
  else {
    s.fallthrough++;
    if (ENUM_CONCEPTS.has(concept)) {
      const key =
        compact(Array.isArray(rawValue) ? rawValue.join("|") : rawValue).slice(0, 60) || "(empty)";
      s.unmappedTop.set(key, (s.unmappedTop.get(key) ?? 0) + 1);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberFromRecord(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringFromRecord(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function recordsFromValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

const canonicalSelectionsKey = "canonicalSelections";
const selectedIdsKey = "selectedIds";
const summaryKey = "summary";
const sourceKey = "source";
const pageNumbersKey = "pageNumbers";
const draftsKey = "drafts";
const rawPayloadKey = "rawPayload";
const surfaceIdKey = "surfaceId";
const corpusRoleKey = "corpusRole";

function selectedRouteIdsFromDraft(draft: Record<string, unknown>): string[] {
  return [
    ...new Set(
      recordsFromValue(draft[canonicalSelectionsKey]).flatMap((selection) => {
        const selectedIds = selection[selectedIdsKey];
        return Array.isArray(selectedIds)
          ? selectedIds.filter((selectedId): selectedId is string => typeof selectedId === "string")
          : [];
      }),
    ),
  ];
}

const shards = readdirSync(shardRoot)
  .filter((d) => d.startsWith("shard-"))
  .sort();
outer: for (const sh of shards) {
  const sdir = join(shardRoot, sh);
  let wins: import("node:fs").Dirent[];
  try {
    wins = readdirSync(sdir, { withFileTypes: true }).filter(
      (e) => e.isDirectory() && !e.name.startsWith("."),
    );
  } catch {
    continue;
  }
  for (const w of wins) {
    const ap = join(sdir, w.name, "artifact.json");
    if (!existsSync(ap)) continue;
    let art: unknown;
    try {
      art = JSON.parse(readFileSync(ap, "utf8"));
    } catch {
      continue;
    }
    if (!isRecord(art)) continue;
    const summary = isRecord(art[summaryKey]) ? art[summaryKey] : {};
    if ((numberFromRecord(summary, "acceptedCount") ?? 0) <= 0) continue;
    const source = isRecord(art[sourceKey]) ? art[sourceKey] : {};
    const sourceId = stringFromRecord(source, "sourceId");
    const pageNumbers = Array.isArray(source[pageNumbersKey]) ? source[pageNumbersKey] : [];
    for (const d of recordsFromValue(art[draftsKey])) {
      drafts++;
      const surfaceKind = stringFromRecord(d, "surfaceKind") ?? "?";
      const payload = isRecord(d[rawPayloadKey]) ? d[rawPayloadKey] : {};
      const normalized: Record<string, unknown> = {};
      const unmappedKeys: string[] = [];
      for (const [k, val] of Object.entries(payload)) {
        rawFieldStats.total++;
        const concept = conceptFor(k);
        if (!concept) {
          unmappedKeys.push(k);
          const cls = classifyUnknown(k);
          if (cls === "structured") rawFieldStats.structuredPassthrough++;
          else if (cls === "freetext") rawFieldStats.freetextPassthrough++;
          else {
            rawFieldStats.trulyUnknown++;
            const kk = lc(k).replace(/raw$/i, "");
            rawFieldStats.unknownTop.set(kk, (rawFieldStats.unknownTop.get(kk) ?? 0) + 1);
          }
          continue;
        }
        rawFieldStats.mappedToConcept++;
        const n = normalizeConcept(concept, val, surfaceKind);
        bump(concept, n, val);
        // first writer wins per concept; record provenance + the raw source field
        if (!(concept in normalized)) {
          normalized[concept] = {
            value: n.value,
            canonical: n.canonical,
            sourceField: k,
            ...(n.extra ?? {}),
          };
        }
      }
      if (jsonl) {
        const rec = {
          surfaceId: d[surfaceIdKey] ?? null,
          surfaceKind,
          surfaceKindCanonical: SURFACE_KIND_CANON[surfaceKind] ?? "other",
          corpusRole: d[corpusRoleKey] ?? null,
          sourceId,
          pageNumbers,
          // routes are already structured upstream — carry them through, don't re-derive
          routeIds: selectedRouteIdsFromDraft(d),
          normalized,
          unmappedKeys,
          rawKeyCount: Object.keys(payload).length,
        };
        jsonl.write(`${JSON.stringify(rec)}\n`);
        draftsWritten++;
        if (examples.length < args.examples)
          examples.push({ surfaceKind, rawPayload: payload, normalized });
      }
      if (args.limit && drafts >= args.limit) break outer;
    }
  }
}

if (jsonl) await new Promise<void>((res) => jsonl.end(res));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

type ConceptReportEntry = {
  enum: boolean;
  instances: number;
  canonicalPct: number;
  fallthrough: number;
  topUnmapped: string[];
};

const conceptReport: Record<string, ConceptReportEntry> = {};
let enumInstances = 0,
  enumCanonical = 0;
for (const [c, s] of Object.entries(conceptStats).sort((a, b) => b[1].instances - a[1].instances)) {
  if (ENUM_CONCEPTS.has(c)) {
    enumInstances += s.instances;
    enumCanonical += s.canonical;
  }
  conceptReport[c] = {
    enum: ENUM_CONCEPTS.has(c),
    instances: s.instances,
    canonicalPct: +((100 * s.canonical) / s.instances).toFixed(1),
    fallthrough: s.fallthrough,
    topUnmapped: [...s.unmappedTop.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([v, n]) => `${v} (${n})`),
  };
}
const report = {
  generatedFrom: args.runDir,
  drafts,
  rawFields: {
    totalInstances: rawFieldStats.total,
    mappedToConcept: rawFieldStats.mappedToConcept,
    mappedPct: +((100 * rawFieldStats.mappedToConcept) / rawFieldStats.total).toFixed(1),
    structuredPassthrough: rawFieldStats.structuredPassthrough,
    freetextPassthrough: rawFieldStats.freetextPassthrough,
    trulyUnknown: rawFieldStats.trulyUnknown,
    trulyUnknownPct: +((100 * rawFieldStats.trulyUnknown) / rawFieldStats.total).toFixed(1),
    topUnknownFields: [...rawFieldStats.unknownTop.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([f, n]) => `${f} (${n})`),
  },
  enumConcepts: {
    instances: enumInstances,
    canonicalPct: enumInstances ? +((100 * enumCanonical) / enumInstances).toFixed(1) : 0,
  },
  concepts: conceptReport,
};

if (!args.reportOnly) {
  const fd = createWriteStream(reportPath, { flags: "w" });
  fd.write(JSON.stringify(report, null, 2));
  await new Promise<void>((res) => fd.end(res));
}

console.log(
  JSON.stringify(
    {
      ...report,
      concepts: undefined,
      _examples: args.reportOnly ? examples.slice(0, args.examples) : undefined,
    },
    null,
    2,
  ),
);
console.log(`\nconcepts (canonical%):`);
for (const [c, r] of Object.entries(conceptReport)) {
  console.log(
    `  ${c.padEnd(16)} ${String(r.instances).padStart(6)}  ${String(r.canonicalPct).padStart(5)}%  ${r.enum ? "enum" : "open"}`,
  );
}
if (!args.reportOnly)
  console.log(`\nwrote ${draftsWritten} records -> ${jsonlPath}\nreport -> ${reportPath}`);
