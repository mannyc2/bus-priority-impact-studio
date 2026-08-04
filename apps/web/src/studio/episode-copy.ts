/**
 * Public wording for intervention changes.
 *
 * The artifact carries producer and tracker vocabulary because that is what the
 * reviewed sources said. This module is the one place that turns it into
 * ordinary sentences, so a component's words and a component's layout are
 * decided separately. Two rules bound everything here: never translate a
 * producer "unknown" into an affirmative verb, and never delete a stated
 * uncertainty — restate it in plain words instead.
 */

import type {
  PublicInterventionEpisode,
  PublicProducerEpisodeComponent,
  PublicProducerPlacement,
} from "@bp/domain/studio/public-intervention-episodes";

/**
 * No entry carries a provenance eyebrow: `SourceNote` is the sanctioned
 * provenance surface. Kept as the single place a future authority distinction
 * would live.
 */
export function authorityNote(_authority: PublicInterventionEpisode["authority"]): string | null {
  return null;
}

const PLACEMENT_STATE_LABELS: Record<string, string> = {
  confirmed_active: "Confirmed active",
  last_confirmed_active: "Last confirmed active",
  confirmed_inactive: "Confirmed inactive",
  planned: "Planned",
  suspended: "Suspended",
  conflicted: "Conflicting records",
  unknown: "Status not established",
};

/** A new enum member reads as itself rather than throwing or vanishing. */
export function placementStateLabel(stateAsOf: string): string {
  return PLACEMENT_STATE_LABELS[stateAsOf] ?? stateAsOf.replaceAll("_", " ");
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** The form the artifact already uses for `date.display`: "July 27, 2026". */
export function formatEpisodeDay(isoDay: string): string {
  const month = MONTH_NAMES[Number(isoDay.slice(5, 7)) - 1];
  if (month === undefined) return isoDay;
  return `${month} ${Number(isoDay.slice(8, 10))}, ${isoDay.slice(0, 4)}`;
}

/**
 * The extent as its own line. A description that only names the route the
 * entry already shows as a badge is dropped (the pack writes these as
 * "Exact <route> incidence"); every other stated extent survives, including
 * the producer's explicit "not established".
 */
const ROUTE_INCIDENCE = /^Exact\s+\S+\s+route\s+incidence$/iu;

export function extentLine(extent: PublicProducerEpisodeComponent["extent"]): string {
  const label =
    extent.kind === "route_wide"
      ? "Route-wide"
      : extent.kind === "unknown"
        ? "Extent not established"
        : extent.label;
  if (extent.description === null || ROUTE_INCIDENCE.test(extent.description)) return label;
  return `${label} — ${extent.description}`;
}

export type ComponentSentence = {
  lead: string;
  detail: string | null;
  extent: string | null;
};

/**
 * One change component as words. A reviewed action keeps its verb; an unstated
 * one gets the neutral lead the honesty rules allow, never an invented verb.
 */
export function componentSentence(
  component: PublicInterventionEpisode["components"][number],
): ComponentSentence {
  if (component.authority === "tracker_enrichment") {
    return { lead: component.label, detail: component.detail, extent: null };
  }
  const lead =
    component.action === "unknown"
      ? `Recorded change: ${component.treatmentFamilyLabel}`
      : `${component.actionLabel}: ${component.treatmentFamilyLabel}`;
  return {
    lead,
    detail: restatesFamily(component) ? null : component.details,
    extent: extentLine(component.extent),
  };
}

/** The pack often repeats the family label as the detail sentence. */
function restatesFamily(component: PublicProducerEpisodeComponent): boolean {
  const details = component.details.toLowerCase();
  const family = component.treatmentFamilyLabel.toLowerCase();
  return details.includes(family) || family.includes(details);
}

export type PlacementLine = { text: string; count: number };

/**
 * Placement history as distinct dated states. The pinned release repeats one
 * state across every placement of a change, so the raw list said the same
 * sentence up to a hundred times.
 */
export function placementLines(placements: readonly PublicProducerPlacement[]): PlacementLine[] {
  const counts = new Map<string, number>();
  for (const placement of placements) {
    const text =
      placement.confirmedCurrent === null
        ? `${placementStateLabel(placement.stateAsOf)} as of ${formatEpisodeDay(placement.asOfDate)}`
        : `Confirmed active as of ${formatEpisodeDay(placement.confirmedCurrent.asOfDate)}`;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return [...counts.entries()].map(([text, count]) => ({ text, count }));
}

/** Stated once above the list, so no single record reads as a current claim. */
export const PLACEMENT_DISCLAIMER =
  "These are historical placement records; none is a confirmed-current claim.";

const TRACKER_SUMMARY_BOILERPLATE = "Tracker-owned MTA camera-enforcement registry event.";

export function trackerSummaryVisible(summary: string): boolean {
  return summary.trim() !== TRACKER_SUMMARY_BOILERPLATE;
}
