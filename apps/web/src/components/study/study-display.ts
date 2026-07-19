import type { SourceNoteEntry } from "@/components/SourceNote";
import type {
  RouteStudiesArtifact,
  StudyArtifact,
  StudyIndexArtifact,
  StudyIndexRow,
  StudySensitivityEstimate,
} from "@/studio/api-contract";

export type StudyTone = "accent" | "good" | "warn" | "bad";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2024-09" → "Sep 2024". Falls back to the raw value on malformed input. */
export function studyMonthLabel(month: string): string {
  const [year, monthPart] = month.split("-");
  const index = Number(monthPart) - 1;
  const name = MONTH_NAMES[index];
  if (year === undefined || name === undefined) return month;
  return `${name} ${year}`;
}

/** Studies keyed by the registry event id they evaluate — the same mint as
 * the served `StudioIntervention.eventId` (never a title-string match). */
export function studiesByEventId(
  studies: RouteStudiesArtifact | null,
): ReadonlyMap<string, StudyArtifact> {
  const map = new Map<string, StudyArtifact>();
  for (const study of studies?.studies ?? []) {
    for (const provenance of study.provenance.event) {
      map.set(provenance.sourceEventId, study);
    }
  }
  return map;
}

function studyRouteJoinKey(routeId: string): string {
  return routeId;
}

/** Citywide index rows keyed by route + implementation month — the identity
 * the registry event id encodes ("ace:{routeId}:{program}:{date}"). Ambiguous
 * keys (two studies, same route and month) map to null and never match. */
export function studyIndexRowsByJoinKey(
  index: StudyIndexArtifact | null,
): ReadonlyMap<string, StudyIndexRow | null> {
  const map = new Map<string, StudyIndexRow | null>();
  for (const row of index?.studies ?? []) {
    const key = `${studyRouteJoinKey(row.routeId)}:${row.implementationMonth}`;
    map.set(key, map.has(key) ? null : row);
  }
  return map;
}

/** Resolve a served registry event id to its citywide index row, if any. */
export function studyIndexRowForEventId(
  eventId: string | undefined,
  rowsByJoinKey: ReadonlyMap<string, StudyIndexRow | null>,
): StudyIndexRow | undefined {
  if (eventId === undefined) return undefined;
  const [, routeId, , date] = eventId.split(":");
  if (routeId === undefined || date === undefined) return undefined;
  return rowsByJoinKey.get(`${studyRouteJoinKey(routeId)}:${date.slice(0, 7)}`) ?? undefined;
}

export function signedMphLabel(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)} mph`;
}

function signedBound(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
}

export function ciLongLabel(ci: { lowerMph: number; upperMph: number }): string {
  return `95% CI ${signedBound(ci.lowerMph)} to ${signedBound(ci.upperMph)}`;
}

/** Compact row form: "+0.22 (+0.06 to +0.39) mph". Signed bounds make an
 * en-dash range separator ambiguous, hence "to". */
export function ciCompactLabel(
  effectMph: number,
  ci: { lowerMph: number; upperMph: number },
): string {
  return `${signedBound(effectMph)} (${signedBound(ci.lowerMph)} to ${signedBound(ci.upperMph)}) mph`;
}

export function studyToneColor(tone: StudyTone): string {
  if (tone === "good") return "var(--bp-color-good)";
  if (tone === "warn") return "var(--bp-color-warn)";
  if (tone === "bad") return "var(--bp-color-bad)";
  return "var(--bp-color-accent)";
}

export function studyTone(direction: StudyArtifact["direction"]): StudyTone {
  if (direction === "improved") return "good";
  if (direction === "worsened") return "bad";
  return "accent";
}

export function studyBadgeLabel(study: StudyArtifact): string {
  const count = study.variants.allDay.matchedSegmentCount;
  if (study.treatedSegmentScope === "lane_overlap_spines") {
    return count === 1 ? "1 lane segment" : `${count} lane segments`;
  }
  return count === 1 ? "1 segment studied" : `${count} segments studied`;
}

const FAMILY_EVENT_PHRASES: Partial<Record<StudyArtifact["treatmentFamily"], string>> = {
  automated_bus_lane_enforcement: "enforcement starts",
  bus_lane: "lanes open",
  busway: "busway opens",
  select_bus_service: "SBS starts",
  transit_signal_priority: "signal priority starts",
  route_redesign: "redesign takes effect",
};

/** Plain-language implementation reference line label, e.g. "enforcement starts Sep 2024". */
export function implementationLineLabel(study: StudyArtifact): string {
  const phrase = FAMILY_EVENT_PHRASES[study.treatmentFamily] ?? "change takes effect";
  return `${phrase} ${studyMonthLabel(study.implementationMonth)}`;
}

const FAMILY_NOUN_PHRASES: Partial<Record<StudyArtifact["treatmentFamily"], string>> = {
  automated_bus_lane_enforcement: "enforcement began",
  bus_lane: "the lanes opened",
  busway: "the busway opened",
  select_bus_service: "SBS service began",
  transit_signal_priority: "signal priority began",
  route_redesign: "the redesign took effect",
};

function eventNounPhrase(study: StudyArtifact): string {
  return FAMILY_NOUN_PHRASES[study.treatmentFamily] ?? "the change took effect";
}

/** Display-only finding template derived from direction + series shape —
 * never a causal verb (ADR-0018 claim-language rules). */
export function findingSentence(study: StudyArtifact): string {
  const means = study.variants.allDay.windowMeans;
  const controlHeld =
    means === null || Math.abs(means.controlPostMeanMph - means.controlPreMeanMph) < 0.1;
  switch (study.direction) {
    case "improved":
      return controlHeld
        ? "Speeds on treated segments rose while matched controls held flat"
        : "Speeds on treated segments rose faster than matched controls";
    case "worsened":
      return controlHeld
        ? "Speeds on treated segments fell while matched controls held flat"
        : "Speeds on treated segments fell behind matched controls";
    default:
      return `Treated and control segments moved together before and after ${eventNounPhrase(study)}`;
  }
}

export type StudyConfounderMarker = { month: string; label: string };

/** Warn marker on the chart when a confounder gate flags. */
export function confounderMarker(study: StudyArtifact): StudyConfounderMarker | null {
  const candidates: {
    estimate: StudySensitivityEstimate | null;
    flagged: boolean;
    label: string;
  }[] = [
    {
      estimate: study.sensitivityEstimates.congestionPricing,
      flagged: study.gates.congestionPricingOverlap.status === "fail",
      label: "tolling starts",
    },
    {
      estimate: study.sensitivityEstimates.queensRedesign,
      flagged: study.gates.redesignOverlap.status === "fail",
      label: "redesign starts",
    },
  ];
  for (const candidate of candidates) {
    const month = candidate.estimate?.excludedMonths[0];
    if (candidate.flagged && month !== undefined) {
      return { month, label: candidate.label };
    }
  }
  return null;
}

/** One muted caveat sentence carrying the sensitivity estimate, shown only
 * when a confounder gate flags. */
export function caveatSentence(study: StudyArtifact): string | null {
  const congestion = study.sensitivityEstimates.congestionPricing;
  if (study.gates.congestionPricingOverlap.status === "fail" && congestion !== null) {
    return sensitivityCaveat("Excluding the months after Manhattan tolling began", congestion);
  }
  const redesign = study.sensitivityEstimates.queensRedesign;
  if (study.gates.redesignOverlap.status === "fail" && redesign !== null) {
    return sensitivityCaveat("Excluding the months after the Queens redesign began", redesign);
  }
  return null;
}

function sensitivityCaveat(prefix: string, estimate: StudySensitivityEstimate): string {
  if (estimate.effectMph === null) return `${prefix}: too few months remain to re-estimate.`;
  const ci =
    estimate.confidenceInterval === null ? "" : ` (${ciLongLabel(estimate.confidenceInterval)})`;
  return `${prefix}: ${signedMphLabel(estimate.effectMph)}${ci}.`;
}

/** Descriptive tier: the single consolidated before-vs-after change. */
export function descriptiveChangeLabel(study: StudyArtifact): string {
  const variant = study.variants.allDay;
  if (variant.effectMph !== null) return signedMphLabel(variant.effectMph);
  const means = variant.windowMeans;
  if (means !== null) return signedMphLabel(means.treatedPostMeanMph - means.treatedPreMeanMph);
  return "n/a";
}

/** Descriptive tier body: both window means with the implementation date
 * inline, then the uncontrolled caveat. */
export function descriptiveSentence(study: StudyArtifact): string {
  const means = study.variants.allDay.windowMeans;
  const date = studyMonthLabel(study.implementationMonth);
  if (means === null) {
    return `Too little matched segment data to compare windows around ${eventNounPhrase(study)} (${date}).`;
  }
  return (
    `Route speeds averaged ${means.treatedPreMeanMph.toFixed(2)} mph in the months before ` +
    `${eventNounPhrase(study)} (${date}) and ${means.treatedPostMeanMph.toFixed(2)} mph in the ` +
    `months after — many things besides the treatment could explain the difference.`
  );
}

function seriesWindowLabels(study: StudyArtifact): { pre: string; post: string } {
  const months = study.variants.allDay.monthlySeries.map((point) => point.month);
  const preMonths = months.filter((month) => month < study.implementationMonth);
  const postMonths = months.filter((month) => month >= study.implementationMonth);
  const range = (list: readonly string[]) =>
    list.length === 0
      ? "none"
      : `${studyMonthLabel(list[0] ?? "")} to ${studyMonthLabel(list.at(-1) ?? "")}`;
  return { pre: range(preMonths), post: range(postMonths) };
}

const GATE_LABELS: Record<keyof StudyArtifact["gates"], string> = {
  preTrend: "Pre-trend",
  placeboInTime: "Placebo in time",
  minSample: "Minimum sample",
  controlEligibility: "Control eligibility",
  congestionPricingOverlap: "Congestion pricing overlap",
  redesignOverlap: "Redesign overlap",
};

/** Full method & provenance entries: gate table with reasons, exact windows,
 * counts, engine version, and event source. Never on the card face. */
export function methodProvenanceEntries(study: StudyArtifact): SourceNoteEntry[] {
  const variant = study.variants.allDay;
  const windows = seriesWindowLabels(study);
  const source = study.provenance.event[0];
  return [
    {
      label: `Windows: ${windows.pre} pre, ${windows.post} post`,
      detail: `implementation ${study.implementationDate}`,
    },
    {
      label: `${variant.matchedSegmentCount} treated segments, ${variant.eligibleControlSegmentCount} eligible controls`,
    },
    ...(Object.keys(GATE_LABELS) as (keyof StudyArtifact["gates"])[]).map((key) => {
      const gate = study.gates[key];
      return {
        label: `${GATE_LABELS[key]}: ${gate.status.replaceAll("_", " ")}`,
        detail: gate.reason,
      };
    }),
    { label: `Engine ${study.provenance.engineVersion}` },
    ...(source === undefined
      ? []
      : [{ label: `Event source: ${source.sourceId} (${source.sourceKind})` }]),
  ];
}
