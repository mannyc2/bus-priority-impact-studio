import { Schema } from "effect";

/**
 * Operational-date assertions for Tier 2 document-derived events.
 *
 * Premise (per project decision): official MTA/DOT sources are trusted. If a
 * source states that an intervention was implemented/launched/activated, or
 * states a planned/scheduled launch date, we record that date as the source's
 * operational-date assertion. Historical GTFS is used only to confirm
 * route/service *exposure*, never as a universal validator of the date.
 *
 * The operational fact is derived from two faithful, low-cardinality signals
 * that the extraction already captures:
 *   - `statusRaw` (the source's own stated status) -> operational-state axis
 *   - `eventKind`  (intervention vs process/eval/planning) -> intervention axis
 *
 * This is deliberately NOT derived from the free-text `familyRaw`/`subtypeRaw`
 * vocabulary (1k+ distinct values); those are preserved for review only.
 */

export const SourceStatedStatusSchema = Schema.Literals([
  "done", // source says it happened / is in service / complete
  "committed_future", // source states a planned or scheduled launch date
  "proposed", // proposed / conceptual / under study / approved-only — not a committed launch
  "existing", // pre-existing baseline condition, not a new treatment
  "unknown", // status absent or ambiguous (e.g. "ongoing"/"in_progress")
]);
export type SourceStatedStatus = typeof SourceStatedStatusSchema.Type;

export const OperationalDateValidationStateSchema = Schema.Literals([
  // Source directly states the intervention is operational/complete on this date.
  // Trust the date; historical GTFS is only an optional route/service exposure check.
  "source_stated_operational_date",
  // Source states a planned/scheduled operational date. Trusted per source, but
  // flagged so a downstream causal step can confirm the plan was realized.
  "source_stated_planned_date",
  // Engagement / evaluation / planning / proposal / baseline — not a treatment anchor.
  "non_operational_milestone",
  // Operational-type intervention but the source gave no usable date.
  "operational_without_date",
  // Operational-looking intervention with ambiguous status — needs human review.
  "needs_review",
]);
export type OperationalDateValidationState = typeof OperationalDateValidationStateSchema.Type;

export const OperationalDateBasisSchema = Schema.Literals([
  "source_stated_complete",
  "source_stated_plan",
  "not_operational",
]);
export type OperationalDateBasis = typeof OperationalDateBasisSchema.Type;

/**
 * Event kinds (from the resolution classifier) that represent an actual
 * physical/service/enforcement intervention reaching operation — as opposed to
 * outreach, evaluation, planning, funding, or context.
 */
const OPERATIONAL_EVENT_KINDS = new Set<string>([
  "physical_bus_priority_change",
  "service_change",
  "enforcement_or_regulatory_change",
]);

/**
 * The normalized `eventKind` is a keyword heuristic and is NOT a reliable
 * intervention-vs-process axis: it labels many outreach/planning events as
 * `service_change`. The source's OWN `familyRaw`/`subtypeRaw` categorization is
 * faithful, so we use it to VETO operational-date assertions for events that
 * are really meetings, outreach, planning, study, or condition measurements.
 * `eventKind` gives recall; this veto gives precision.
 */
const PROCESS_PLANNING_TOKENS = new Set<string>([
  "meeting",
  "outreach",
  "engagement",
  "advisory",
  "hearing",
  "workshop",
  "presentation",
  "briefing",
  "kickoff",
  "tour",
  "survey",
  "forum",
  "webinar",
  "charrette",
  "comment",
  "planning",
  "scoping",
  "selection",
  "conceptual",
  "feasibility",
  "alternatives",
  "study",
  "analysis",
  "agenda",
  "identified",
  "identification",
  "rfp",
  "procurement",
]);

// High-precision "not an operational date" phrases. Checked against the event
// name too, because design/study milestones often appear only in the name
// (e.g. "Final Design", "...- After condition"). These are specific enough that
// genuine launch/implementation names do not contain them.
const PROCESS_PLANNING_PHRASES = [
  "open house",
  "design ideas",
  "project phase",
  "project development",
  "project design",
  "design phase",
  "planning phase",
  "environmental review",
  "before condition",
  "after condition",
  "existing condition",
  "listening session",
  "final design",
  "draft design",
  "conceptual design",
  "detailed design",
  "engineering design",
  "designs complete",
  "feasibility",
  "alternatives analysis",
  "streets plan",
  "transit goals",
  "publication",
  // design / process milestones that are not an operational date
  "design completion",
  "design finalization",
  "site visit",
  "air rights",
  "real estate",
  "performance review",
  "implementation plan",
  "implementation timeframe",
  "project handoff",
  "project transfer",
  "map date",
  "map production",
  "corridor selection",
  "next corridor",
  // non-bus (rail / ferry) modes — kept out of bus-priority operational dates.
  // Specific compound phrases so a bus event merely *mentioning* a subway is not vetoed.
  "second avenue subway",
  "2nd ave subway",
  "2nd avenue subway",
  "second ave subway",
  "subway opening",
  "subway shutdown",
  "subway construction",
  "subway extension",
  "subway station",
  "train shutdown",
  "g train",
  "l train",
  "f train",
  "a train",
  "7 train",
  "ferry",
  "lirr",
  "metro-north",
  "metro north",
  // observation / non-intervention context (not an operational change)
  "summer streets",
  "open streets",
  "traffic volume",
  "pre-covid",
  "ridership trend",
];

function isProcessOrPlanningFamily(
  familyRaw: string | null | undefined,
  subtypeRaw: string | null | undefined,
  eventName?: string | null | undefined,
): boolean {
  const familyText = `${familyRaw ?? ""} ${subtypeRaw ?? ""}`.toLowerCase().replace(/[_/-]+/g, " ");
  // The broad token veto runs only on the source's structured family/subtype,
  // not the free-text name, to avoid vetoing real launches whose names mention
  // outreach in passing.
  const tokens = familyText.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.some((token) => PROCESS_PLANNING_TOKENS.has(token))) return true;
  const phraseText = `${familyText} ${(eventName ?? "").toLowerCase()}`;
  return PROCESS_PLANNING_PHRASES.some((phrase) => phraseText.includes(phrase));
}

// Recall rescue: the normalized eventKind is noisy and drops real launches into
// non-operational kinds. When the source's OWN family/subtype unambiguously names
// an operational change (and the process/planning veto has not fired), treat the
// event as operational even if eventKind disagrees.
const OPERATIONAL_FAMILY_TOKENS = new Set<string>([
  "launch",
  "launched",
  "implementation",
  "implemented",
  "install",
  "installed",
  "installation",
  "deploy",
  "deployed",
  "deployment",
  "activation",
  "activated",
  "opening",
  "opened",
  "busway",
  "transitway",
  "sbs",
  "brt",
  "tsp",
  "commenced",
  "inaugurated",
  "debut",
]);

const OPERATIONAL_FAMILY_PHRASES = [
  "bus lane",
  "select bus service",
  "signal priority",
  "queue jump",
  "camera enforcement",
  "service launch",
  "service change",
  "go live",
  "in service",
  "bus priority",
];

function isOperationalFamily(
  familyRaw: string | null | undefined,
  subtypeRaw: string | null | undefined,
): boolean {
  const text = `${familyRaw ?? ""} ${subtypeRaw ?? ""}`.toLowerCase().replace(/[_/-]+/g, " ");
  const tokens = text.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.some((token) => OPERATIONAL_FAMILY_TOKENS.has(token))) return true;
  return OPERATIONAL_FAMILY_PHRASES.some((phrase) => text.includes(phrase));
}

const DONE_STATUSES = new Set<string>([
  "completed",
  "complete",
  "implemented",
  "occurred",
  "finished",
  "opened",
  "open",
  "launched",
  "operational",
  "in_service",
  "live",
  "active",
  "installed",
  "activated",
  "constructed",
  "effective",
  "in_effect",
  "operating",
  "historical", // a past operational condition with a date
]);

const FUTURE_STATUSES = new Set<string>([
  "scheduled",
  "upcoming",
  "planned",
  "announced",
  "slated",
  "expected",
  "forthcoming",
  "pending",
]);

// Statuses that explicitly say the intervention did NOT happen / is not committed.
// These must be caught before the substring fallback, which would otherwise map
// "not_implemented" -> done via the /implement/ rule.
const NEGATIVE_STATUS_PATTERNS = [
  "not_implement",
  "denied",
  "cancel",
  "withdraw",
  "rejected",
  "abandon",
  "supersed",
  "discontinu",
  "deferred",
  "on_hold",
  "no_longer",
  "terminated",
  "halted",
  "paused",
];

const PROPOSED_STATUSES = new Set<string>([
  "proposed",
  "conceptual",
  "scoping",
  "design",
  "under_review",
  "recommended",
  "presented",
  "draft",
  "study",
  "planning",
  "considered",
  "potential",
  "proposal",
  "alternatives",
  "approved", // greenlit, but approval is not an operational/launch date
  "awarded",
  "funded",
]);

const EXISTING_STATUSES = new Set<string>([
  "existing",
  "current",
  "existing_condition",
  "baseline",
  "longstanding",
  "prior",
]);

/** Map the source's raw status string to a coarse operational-state bucket. */
export function normalizeStatedStatus(raw: string | null | undefined): SourceStatedStatus {
  if (raw == null) return "unknown";
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_");
  if (key.length === 0) return "unknown";
  // Negated / cancelled statuses are not operational; treat as proposed (-> non
  // operational) and stop before the substring fallback would mis-map them.
  if (NEGATIVE_STATUS_PATTERNS.some((pattern) => key.includes(pattern))) return "proposed";
  // Disjunctive "X_or_Y" statuses (e.g. proposed_or_implemented) are ambiguous;
  // route them to review rather than collapsing to a confident bucket.
  if (key.includes("_or_")) return "unknown";
  if (DONE_STATUSES.has(key)) return "done";
  if (FUTURE_STATUSES.has(key)) return "committed_future";
  if (PROPOSED_STATUSES.has(key)) return "proposed";
  if (EXISTING_STATUSES.has(key)) return "existing";
  // High-confidence substring fallbacks for the long tail of raw values.
  // "ongoing"/"in_progress" intentionally fall through to "unknown" so that an
  // operational-looking row with an ambiguous status is routed to review rather
  // than asserted as a source-backed operational date.
  if (/complet|implement|launch|install|activat|operational|in_service/.test(key)) {
    return "done";
  }
  if (/schedul|upcoming|announc/.test(key)) return "committed_future";
  if (/propos|concept|scoping|under_review/.test(key)) return "proposed";
  return "unknown";
}

const MONTH_NUMBERS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
const SEASON_MONTHS: Record<string, number> = {
  winter: 12,
  spring: 3,
  summer: 6,
  fall: 9,
  autumn: 9,
};

export type NormalizedDatePrecision = "day" | "month" | "year" | "range" | "season" | "unknown";

export type ParsedOperationalDate = {
  /** ISO YYYY-MM-DD start of the stated date/period. */
  effectiveDateStart: string | null;
  /** ISO YYYY-MM-DD end (same as start for a single day/month; span end for ranges). */
  effectiveDateEnd: string | null;
  /** YYYY-MM, populated only for month-or-finer precision (what the event-study resolver wants). */
  implementationMonth: string | null;
  precision: NormalizedDatePrecision;
};

const NO_DATE: ParsedOperationalDate = {
  effectiveDateStart: null,
  effectiveDateEnd: null,
  implementationMonth: null,
  precision: "unknown",
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}
function lastDayOfMonth(year: number, month: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 30;
}
function monthResult(year: number, month: number): ParsedOperationalDate {
  return {
    effectiveDateStart: isoDate(year, month, 1),
    effectiveDateEnd: isoDate(year, month, lastDayOfMonth(year, month)),
    implementationMonth: `${year}-${pad2(month)}`,
    precision: "month",
  };
}
function dayResult(year: number, month: number, day: number): ParsedOperationalDate {
  return {
    effectiveDateStart: isoDate(year, month, day),
    effectiveDateEnd: isoDate(year, month, day),
    implementationMonth: `${year}-${pad2(month)}`,
    precision: "day",
  };
}
function expandTwoDigitYear(year: number): number {
  if (year >= 100) return year;
  return year < 50 ? 2000 + year : 1900 + year;
}

/**
 * Deterministically parse the source's verbatim operational-date text into a
 * normalized ISO start/end + precision. Returns precision "unknown" for text
 * that is not actually a date ("concurrent with...", "Over the next 6 months",
 * "Map Date") so it can be routed to operational_without_date rather than
 * trusted. This also fixes US-slash dates (7/3/16) that the upstream
 * datePrecision tagged as year/unknown.
 */
export function parseOperationalDate(text: string | null | undefined): ParsedOperationalDate {
  if (text == null) return NO_DATE;
  const t = text.trim().toLowerCase();
  if (t.length === 0) return NO_DATE;

  // ISO day YYYY-MM-DD
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    const yearRaw = m[1];
    const monthRaw = m[2];
    const dayRaw = m[3];

    if (yearRaw !== undefined && monthRaw !== undefined && dayRaw !== undefined) {
      const y = +yearRaw;
      const mo = +monthRaw;
      const d = +dayRaw;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return dayResult(y, mo, d);
    }
  }
  // US-slash day M/D/YY(YY)
  m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    const monthRaw = m[1];
    const dayRaw = m[2];
    const yearRaw = m[3];

    if (monthRaw !== undefined && dayRaw !== undefined && yearRaw !== undefined) {
      const mo = +monthRaw;
      const d = +dayRaw;
      const y = expandTwoDigitYear(+yearRaw);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return dayResult(y, mo, d);
    }
  }
  // Month name + day + year ("October 3, 2019")
  m = t.match(/\b([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m) {
    const monthRaw = m[1];
    const dayRaw = m[2];
    const yearRaw = m[3];
    const mo = monthRaw === undefined ? undefined : MONTH_NUMBERS[monthRaw];

    if (mo !== undefined && dayRaw !== undefined && yearRaw !== undefined) {
      const d = +dayRaw;
      const y = +yearRaw;
      if (d >= 1 && d <= 31) return dayResult(y, mo, d);
    }
  }
  // Year range ("2015-2016", "2024/2025", "2016 to 2017")
  m = t.match(/\b(19\d{2}|20\d{2})\s*(?:-|–|—|\/|to|through|and)\s*(19\d{2}|20\d{2})\b/);
  if (m) {
    const startYearRaw = m[1];
    const endYearRaw = m[2];

    if (startYearRaw === undefined || endYearRaw === undefined) return NO_DATE;

    const y1 = +startYearRaw;
    const y2 = +endYearRaw;
    return {
      effectiveDateStart: isoDate(Math.min(y1, y2), 1, 1),
      effectiveDateEnd: isoDate(Math.max(y1, y2), 12, 31),
      implementationMonth: null,
      precision: "range",
    };
  }
  // ISO month YYYY-MM (not followed by another -digit)
  m = t.match(/\b(\d{4})-(\d{1,2})\b(?!-\d)/);
  if (m) {
    const yearRaw = m[1];
    const monthRaw = m[2];

    if (yearRaw !== undefined && monthRaw !== undefined) {
      const y = +yearRaw;
      const mo = +monthRaw;
      if (mo >= 1 && mo <= 12) return monthResult(y, mo);
    }
  }
  // US-slash month M/YYYY
  m = t.match(/\b(\d{1,2})\/(\d{4})\b/);
  if (m) {
    const monthRaw = m[1];
    const yearRaw = m[2];

    if (monthRaw !== undefined && yearRaw !== undefined) {
      const mo = +monthRaw;
      const y = +yearRaw;
      if (mo >= 1 && mo <= 12) return monthResult(y, mo);
    }
  }
  // Month-name range within a year ("late March/April 2025", "March-April 2025")
  m = t.match(/\b([a-z]+)\s*(?:-|–|\/|to|and)\s*([a-z]+)\s+(\d{4})\b/);
  if (m) {
    const startMonthRaw = m[1];
    const endMonthRaw = m[2];
    const yearRaw = m[3];
    const a = startMonthRaw === undefined ? undefined : MONTH_NUMBERS[startMonthRaw];
    const b = endMonthRaw === undefined ? undefined : MONTH_NUMBERS[endMonthRaw];

    if (a !== undefined && b !== undefined && yearRaw !== undefined) {
      const y = +yearRaw;
      const lo = Math.min(a, b),
        hi = Math.max(a, b);
      return {
        effectiveDateStart: isoDate(y, lo, 1),
        effectiveDateEnd: isoDate(y, hi, lastDayOfMonth(y, hi)),
        implementationMonth: null,
        precision: "range",
      };
    }
  }
  // Season + year ("Spring 2016", "Spring/Summer 2017")
  m = t.match(/\b(winter|spring|summer|fall|autumn)\b[\s\S]*?\b(19\d{2}|20\d{2})\b/);
  if (m) {
    const seasonRaw = m[1];
    const yearRaw = m[2];
    const mo = seasonRaw === undefined ? undefined : SEASON_MONTHS[seasonRaw];

    if (mo === undefined || yearRaw === undefined) return NO_DATE;

    const y = +yearRaw;
    return {
      effectiveDateStart: isoDate(y, mo, 1),
      effectiveDateEnd: isoDate(y, mo, lastDayOfMonth(y, mo)),
      implementationMonth: null,
      precision: "season",
    };
  }
  // Month name + year ("June 2013", "Nov 2011")
  m = t.match(/\b([a-z]+)\.?\s+(19\d{2}|20\d{2})\b/);
  if (m) {
    const monthRaw = m[1];
    const yearRaw = m[2];
    const mo = monthRaw === undefined ? undefined : MONTH_NUMBERS[monthRaw];

    if (mo !== undefined && yearRaw !== undefined) {
      return monthResult(+yearRaw, mo);
    }
  }
  // Bare year, possibly with a qualifier ("2010", "by 2022", "late 2019")
  m = t.match(/\b(19\d{2}|20\d{2})\b/);
  if (m) {
    const yearRaw = m[1];
    if (yearRaw === undefined) return NO_DATE;

    const y = +yearRaw;
    return {
      effectiveDateStart: isoDate(y, 1, 1),
      effectiveDateEnd: isoDate(y, 12, 31),
      implementationMonth: null,
      precision: "year",
    };
  }
  return NO_DATE;
}

export type OperationalDateClassification = {
  sourceStatedStatus: SourceStatedStatus;
  dateBasis: OperationalDateBasis;
  validationState: OperationalDateValidationState;
  /** True => downstream may treat `operationalDate` as a treatment-anchor candidate. */
  trustedOperationalDate: boolean;
  reasons: string[];
};

/**
 * Deterministically classify an event's operational-date assertion from the
 * source's stated status + the intervention-vs-process event kind. Pure.
 */
export function classifyOperationalDate(input: {
  statusRaw: string | null | undefined;
  dateText: string | null | undefined;
  datePrecision?: string | null | undefined;
  eventKind: string;
  /** Source's own family/subtype categorization, used to veto process/planning events. */
  familyRaw?: string | null | undefined;
  subtypeRaw?: string | null | undefined;
  /** Event name, checked for high-precision design/study-milestone phrases. */
  eventName?: string | null | undefined;
  /**
   * Normalized event status, used ONLY as a fallback when the faithful raw
   * status is absent/ambiguous (a small minority of rows). The raw status is
   * always preferred because the normalized status conflates committed launch
   * dates with vague "planned".
   */
  eventStatus?: string | null | undefined;
}): OperationalDateClassification {
  let status = normalizeStatedStatus(input.statusRaw);
  if (status === "unknown" && input.eventStatus != null) {
    status = normalizeStatedStatus(input.eventStatus);
  }
  // A usable date must actually parse to a date. This rejects placeholder and
  // relative text ("future", "during start-up period", "concurrent with...",
  // "Over the next 6 months", "Map Date") while keeping real dates of any
  // precision ("2010", "Spring 2016", "7/3/16", "October 3, 2019").
  const hasDate = parseOperationalDate(input.dateText).precision !== "unknown";
  const operationalKind = OPERATIONAL_EVENT_KINDS.has(input.eventKind);
  const processOrPlanning = isProcessOrPlanningFamily(
    input.familyRaw,
    input.subtypeRaw,
    input.eventName,
  );
  // Recall rescue: a genuine operational family overrides a non-operational eventKind.
  const operationalFamily = isOperationalFamily(input.familyRaw, input.subtypeRaw);
  const isOperationalEvent = !processOrPlanning && (operationalKind || operationalFamily);
  const reasons: string[] = [];

  if (!isOperationalEvent) {
    reasons.push(
      processOrPlanning
        ? "source family/subtype indicates outreach/meeting/planning/study, not an operational change"
        : `event kind '${input.eventKind}' and family are not an operational intervention`,
    );
    return {
      sourceStatedStatus: status,
      dateBasis: "not_operational",
      validationState: "non_operational_milestone",
      trustedOperationalDate: false,
      reasons,
    };
  }

  if (status === "done") {
    if (!hasDate) {
      reasons.push("source states the intervention is operational but gives no usable date");
      return {
        sourceStatedStatus: status,
        dateBasis: "not_operational",
        validationState: "operational_without_date",
        trustedOperationalDate: false,
        reasons,
      };
    }
    reasons.push("source states the intervention is operational/complete on the stated date");
    return {
      sourceStatedStatus: status,
      dateBasis: "source_stated_complete",
      validationState: "source_stated_operational_date",
      trustedOperationalDate: true,
      reasons,
    };
  }

  if (status === "committed_future") {
    if (!hasDate) {
      reasons.push("source states a planned/scheduled launch but gives no usable date");
      return {
        sourceStatedStatus: status,
        dateBasis: "not_operational",
        validationState: "operational_without_date",
        trustedOperationalDate: false,
        reasons,
      };
    }
    reasons.push("source states a planned/scheduled operational date (trusted per source)");
    return {
      sourceStatedStatus: status,
      dateBasis: "source_stated_plan",
      validationState: "source_stated_planned_date",
      trustedOperationalDate: true,
      reasons,
    };
  }

  if (status === "proposed" || status === "existing") {
    reasons.push(`source status '${status}' is not a committed operational/launch date`);
    return {
      sourceStatedStatus: status,
      dateBasis: "not_operational",
      validationState: "non_operational_milestone",
      trustedOperationalDate: false,
      reasons,
    };
  }

  reasons.push("operational intervention kind but the source status is ambiguous");
  return {
    sourceStatedStatus: status,
    dateBasis: "not_operational",
    validationState: "needs_review",
    trustedOperationalDate: false,
    reasons,
  };
}

export const OperationalDateEvidenceRefSchema = Schema.Struct({
  sourceId: Schema.optional(Schema.String),
  blockId: Schema.optional(Schema.String),
  pageNumber: Schema.optional(Schema.Number),
  lineStart: Schema.optional(Schema.Number),
  lineEnd: Schema.optional(Schema.Number),
  blockHash: Schema.optional(Schema.String),
  roleRaw: Schema.optional(Schema.String),
});

export const OperationalDateAssertionSchema = Schema.Struct({
  surfaceId: Schema.String,
  sourceId: Schema.String,
  sourceTitle: Schema.NullOr(Schema.String),
  sourceGroup: Schema.NullOr(Schema.String),
  displayLabel: Schema.NullOr(Schema.String),
  eventName: Schema.NullOr(Schema.String),
  treatmentText: Schema.NullOr(Schema.String),
  locationText: Schema.NullOr(Schema.String),
  /** The operational date exactly as stated by the source (verbatim text). */
  operationalDate: Schema.NullOr(Schema.String),
  datePrecision: Schema.NullOr(Schema.String),
  /** Faithful source signals, preserved for review. */
  statusRaw: Schema.NullOr(Schema.String),
  familyRaw: Schema.NullOr(Schema.String),
  subtypeRaw: Schema.NullOr(Schema.String),
  /** Intervention-vs-process axis (from the resolution event classifier). */
  eventKind: Schema.String,
  interventionFamily: Schema.String,
  /** Derived operational-date classification. */
  sourceStatedStatus: SourceStatedStatusSchema,
  dateBasis: OperationalDateBasisSchema,
  validationState: OperationalDateValidationStateSchema,
  trustedOperationalDate: Schema.Boolean,
  classificationReasons: Schema.Array(Schema.String),
  evidenceRefs: Schema.Array(OperationalDateEvidenceRefSchema),
  // --- anchor adapter fields (normalized date, route join, dedup, eligibility) ---
  /** Normalized ISO start/end parsed from the verbatim operationalDate. */
  effectiveDateStart: Schema.NullOr(Schema.String),
  effectiveDateEnd: Schema.NullOr(Schema.String),
  /** YYYY-MM, present only for month-or-finer precision (what the event-study resolver wants). */
  implementationMonth: Schema.NullOr(Schema.String),
  /** Precision derived from the parse (more reliable than the upstream datePrecision). */
  normalizedPrecision: Schema.Literals(["day", "month", "year", "range", "season", "unknown"]),
  /** True when the source states a realized onset (not a plan). */
  isRealizedOnset: Schema.Boolean,
  /** Route scope joined from the event-route-resolution artifact (by surfaceId). */
  routeIds: Schema.Array(Schema.String),
  routeIdentityValidationState: Schema.NullOr(Schema.String),
  routeResolutionTier: Schema.NullOr(Schema.String),
  /** Cross-source dedup: one canonical id per (family + month/year + route/location). */
  interventionId: Schema.String,
  evidenceSourceIds: Schema.Array(Schema.String),
  sourceCount: Schema.Number,
  /** Deterministic confidence in [0,1] for the operational-date assertion. */
  confidence: Schema.Number,
  /** Realized AND month-or-finer AND route-linked: usable as a causal treatment anchor. */
  causalAnchorEligible: Schema.Boolean,
});
export type OperationalDateAssertion = typeof OperationalDateAssertionSchema.Type;

/** Realized onset + month-or-finer date + a resolved route scope = causal-anchor usable. */
export function computeCausalAnchorEligibility(input: {
  trustedOperationalDate: boolean;
  isRealizedOnset: boolean;
  normalizedPrecision: NormalizedDatePrecision;
  routeCount: number;
}): boolean {
  return (
    input.trustedOperationalDate &&
    input.isRealizedOnset &&
    (input.normalizedPrecision === "day" || input.normalizedPrecision === "month") &&
    input.routeCount > 0
  );
}

/** Deterministic confidence in [0,1] from date basis, precision, and route-resolution tier. */
export function operationalDateConfidence(input: {
  dateBasis: OperationalDateBasis;
  normalizedPrecision: NormalizedDatePrecision;
  routeResolutionTier: string | null | undefined;
}): number {
  let score = 0.4;
  if (input.dateBasis === "source_stated_complete") score += 0.2;
  else if (input.dateBasis === "source_stated_plan") score += 0.1;
  if (input.normalizedPrecision === "day") score += 0.2;
  else if (input.normalizedPrecision === "month") score += 0.15;
  else if (input.normalizedPrecision === "range" || input.normalizedPrecision === "season")
    score += 0.05;
  if (input.routeResolutionTier === "direct_event_text") score += 0.2;
  else if (input.routeResolutionTier === "source_single_route_context") score += 0.1;
  else if (input.routeResolutionTier === "corridor_gazetteer") score += 0.05;
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}
