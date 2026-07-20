import type { TrendPoint } from "@/components/route/route-derived";
import { interventionPresentationForTreatment } from "@/components/route/route-intervention-model";
import type {
  StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionObservationBundle,
} from "@/studio/api-contract";

export const ROUTE_SPEED_OBSERVATION_BINDING_ID = "route_speed_around_implementation_v1" as const;
export const ROUTE_SPEED_OBSERVATION_METRIC_ID = "route_average_speed_mph" as const;

export type TrendMarker = {
  month: string;
  label: string;
  count: number;
  eventIds: readonly string[];
  occurrenceIds: readonly string[];
  treatmentIds: readonly string[];
};

export type RouteSpeedTrendModel = {
  source: "observation_bundle" | "dossier_fallback";
  points: readonly TrendPoint[];
  markers: readonly TrendMarker[];
  focalEventId: string | null;
  limitations: readonly string[];
};

type ObservationEvent = StudioRouteInterventionObservationBundle["events"][number];
type ObservationSeries = ObservationEvent["series"][number];

type EligibleEvent = { event: ObservationEvent; series: ObservationSeries };

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
] as const;

export function routeSpeedInterventionTrend(
  observations: StudioRouteInterventionObservationBundle | null,
  inventory: StudioRouteInterventionInventoryBundle | null,
  dossierPoints: readonly TrendPoint[],
  markerCap: number,
): RouteSpeedTrendModel {
  if (observations === null || inventory === null) {
    return dossierFallback(dossierPoints, ["inputs"]);
  }

  if (
    observations.releaseId !== inventory.releaseId ||
    observations.publishedAt !== inventory.publishedAt
  ) {
    return dossierFallback(dossierPoints, ["release"]);
  }

  if (
    observations.routeId !== observations.route.routeId ||
    observations.routeId !== inventory.route.routeId ||
    observations.routeSlug !== inventory.routeSlug
  ) {
    return dossierFallback(dossierPoints, ["route"]);
  }

  const eligible: EligibleEvent[] = [];
  for (const event of observations.events) {
    const series = event.series.find(
      (candidate) =>
        candidate.bindingId === ROUTE_SPEED_OBSERVATION_BINDING_ID &&
        candidate.metricId === ROUTE_SPEED_OBSERVATION_METRIC_ID &&
        (candidate.status === "available" || candidate.status === "partial") &&
        candidate.points.some((point) => point.value !== null),
    );
    if (series !== undefined) eligible.push({ event, series });
  }
  eligible.sort(
    (left, right) =>
      left.event.implementationMonth.localeCompare(right.event.implementationMonth) ||
      left.event.eventId.localeCompare(right.event.eventId),
  );

  const focal = eligible.at(-1);
  if (focal === undefined) {
    return dossierFallback(dossierPoints, [...observations.limitations, "series"]);
  }

  const points = focal.series.points.map(
    (point): TrendPoint => ({ month: point.month, value: point.value }),
  );
  const firstMonth = focal.series.coverage.requestedStart;
  const lastMonth = focal.series.coverage.requestedEnd;
  const occurrenceIds = new Set(inventory.occurrences.map((occurrence) => occurrence.occurrenceId));
  const treatmentById = new Map(
    inventory.treatments.map((treatment) => [treatment.treatmentId, treatment]),
  );
  const limitations = [...observations.limitations];
  const grouped: Array<{ month: string; annotationStem: string; events: ObservationEvent[] }> = [];

  for (const entry of eligible) {
    const { event } = entry;
    if (event.implementationMonth < firstMonth || event.implementationMonth > lastMonth) continue;

    if (!occurrenceIds.has(event.occurrenceId)) {
      limitations.push(`occurrence:${event.eventId}`);
      continue;
    }
    const treatment = treatmentById.get(event.treatmentId);
    if (treatment === undefined) {
      limitations.push(`treatment:${event.eventId}`);
      continue;
    }
    const annotationStem =
      interventionPresentationForTreatment(treatment).operationalAnnotationStem;
    if (annotationStem === null) {
      limitations.push(`annotation:${event.eventId}`);
      continue;
    }
    const group = grouped.at(-1);
    if (group?.month === event.implementationMonth) {
      group.events.push(event);
    } else {
      grouped.push({ month: event.implementationMonth, annotationStem, events: [event] });
    }
  }

  const markers = grouped.map((group): TrendMarker => {
    const eventIds = sortedUnique(group.events.map((event) => event.eventId));
    const occurrenceIds = sortedUnique(group.events.map((event) => event.occurrenceId));
    const treatmentIds = sortedUnique(group.events.map((event) => event.treatmentId));
    const monthLabel = `${MONTH_NAMES[Number(group.month.slice(5)) - 1]} ${group.month.slice(0, 4)}`;
    return {
      month: group.month,
      label:
        occurrenceIds.length === 1
          ? `${group.annotationStem} ${monthLabel}`
          : `${occurrenceIds.length} ${group.annotationStem.toLowerCase()}, ${monthLabel}`,
      count: occurrenceIds.length,
      eventIds,
      occurrenceIds,
      treatmentIds,
    };
  });
  const cap = Math.max(0, Math.floor(markerCap));
  return {
    source: "observation_bundle",
    points,
    markers: cap > 0 ? markers.slice(-cap) : [],
    focalEventId: focal.event.eventId,
    limitations,
  };
}

function dossierFallback(
  points: readonly TrendPoint[],
  limitations: readonly string[],
): RouteSpeedTrendModel {
  return {
    source: "dossier_fallback",
    points,
    markers: [],
    focalEventId: null,
    limitations,
  };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
