import type { TrendPoint } from "@/components/route/route-derived";
import { interventionPresentationForTreatment } from "@/components/route/route-intervention-model";
import type {
  StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionObservationBundle,
} from "@/studio/api-contract";

export const ROUTE_SPEED_OBSERVATION_BINDING_ID = "route_speed_around_implementation_v1" as const;
export const BUS_LANE_ROUTE_SPEED_OBSERVATION_BINDING_ID =
  "bus_lane_route_speed_around_implementation_v1" as const;
export const BUSWAY_ROUTE_SPEED_OBSERVATION_BINDING_ID =
  "busway_route_speed_around_implementation_v1" as const;
export const ROUTE_SPEED_OBSERVATION_METRIC_ID = "route_average_speed_mph" as const;

const ROUTE_AVERAGE_SPEED_LABEL = "Route average speed";
const ROUTE_AVERAGE_SPEED_CONTEXT_LABEL = "Route average speed (context)";
const ROUTE_CONTEXT_METHOD_LIMITATION =
  "Route-level observations are context for a treatment scoped below the full route.";

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
  seriesLabel: string;
  methodLimitation: string | null;
  limitations: readonly string[];
};

type ObservationEvent = StudioRouteInterventionObservationBundle["events"][number];
type ObservationSeries = ObservationEvent["series"][number];

type EligibleEvent = {
  event: ObservationEvent;
  series: ObservationSeries;
};

const SPEED_TREATMENT_BY_BINDING = {
  [ROUTE_SPEED_OBSERVATION_BINDING_ID]: "automated_bus_lane_enforcement",
  [BUS_LANE_ROUTE_SPEED_OBSERVATION_BINDING_ID]: "bus_lane",
  [BUSWAY_ROUTE_SPEED_OBSERVATION_BINDING_ID]: "busway",
} as const satisfies Partial<
  Record<ObservationSeries["bindingId"], ObservationEvent["treatmentKind"]>
>;

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
    for (const series of event.series) {
      const treatmentKind =
        SPEED_TREATMENT_BY_BINDING[series.bindingId as keyof typeof SPEED_TREATMENT_BY_BINDING];
      if (
        treatmentKind !== undefined &&
        event.treatmentKind === treatmentKind &&
        event.analysisFamily === treatmentKind &&
        event.specId === `${treatmentKind}_route_observations_v1` &&
        series.metricId === ROUTE_SPEED_OBSERVATION_METRIC_ID &&
        (series.status === "available" || series.status === "partial") &&
        series.points.some((point) => point.value !== null)
      ) {
        eligible.push({ event, series });
        break;
      }
    }
  }

  const focal = eligible.sort(compareFocalEvents)[0];
  if (focal === undefined) {
    return dossierFallback(dossierPoints, [...observations.limitations, "series"]);
  }

  const contextual =
    focal.series.role === "context" &&
    (focal.event.geographyScope === "corridor" || focal.event.geographyScope === "segment");
  const methodLimitation =
    contextual && focal.series.limitations.includes(ROUTE_CONTEXT_METHOD_LIMITATION)
      ? ROUTE_CONTEXT_METHOD_LIMITATION
      : null;
  if (contextual && methodLimitation === null) {
    return dossierFallback(dossierPoints, [...observations.limitations, "context"]);
  }

  const points = focal.series.points.map(
    (point): TrendPoint => ({ month: point.month, value: point.value }),
  );
  const firstMonth = focal.series.coverage.requestedStart;
  const lastMonth = focal.series.coverage.requestedEnd;
  const occurrenceById = new Map(
    inventory.occurrences.map((occurrence) => [occurrence.occurrenceId, occurrence]),
  );
  const treatmentById = new Map(
    inventory.treatments.map((treatment) => [treatment.treatmentId, treatment]),
  );
  const limitations = [...observations.limitations];
  const grouped: Array<{ month: string; annotationStem: string; events: ObservationEvent[] }> = [];

  const markerEvents = [...eligible].sort(compareMarkerEvents);
  for (const entry of markerEvents) {
    const { event } = entry;
    if (event.implementationMonth < firstMonth || event.implementationMonth > lastMonth) continue;

    const annotationStem = markerAnnotationStem(event, occurrenceById, treatmentById, limitations);
    if (annotationStem === null) {
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
    seriesLabel: contextual ? ROUTE_AVERAGE_SPEED_CONTEXT_LABEL : ROUTE_AVERAGE_SPEED_LABEL,
    methodLimitation,
    limitations,
  };
}

function compareFocalEvents(left: EligibleEvent, right: EligibleEvent): number {
  // All admitted v1 speed bindings have fixed registry priority 1.
  return (
    right.event.implementationMonth.localeCompare(left.event.implementationMonth) ||
    right.event.eventId.localeCompare(left.event.eventId)
  );
}

function compareMarkerEvents(left: EligibleEvent, right: EligibleEvent): number {
  return (
    left.event.implementationMonth.localeCompare(right.event.implementationMonth) ||
    left.event.eventId.localeCompare(right.event.eventId)
  );
}

function markerAnnotationStem(
  event: ObservationEvent,
  occurrenceById: ReadonlyMap<
    string,
    StudioRouteInterventionInventoryBundle["occurrences"][number]
  >,
  treatmentById: ReadonlyMap<string, StudioRouteInterventionInventoryBundle["treatments"][number]>,
  limitations: string[],
): string | null {
  const occurrence = occurrenceById.get(event.occurrenceId);
  if (
    occurrence === undefined ||
    occurrence.routeId !== event.routeId ||
    !occurrence.treatmentIds.includes(event.treatmentId)
  ) {
    limitations.push(`occurrence:${event.eventId}`);
    return null;
  }
  const treatment = treatmentById.get(event.treatmentId);
  if (treatment === undefined || treatment.treatmentKind !== event.treatmentKind) {
    limitations.push(`treatment:${event.eventId}`);
    return null;
  }
  const annotationStem = interventionPresentationForTreatment(treatment).operationalAnnotationStem;
  if (annotationStem === null) limitations.push(`annotation:${event.eventId}`);
  return annotationStem;
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
    seriesLabel: ROUTE_AVERAGE_SPEED_LABEL,
    methodLimitation: null,
    limitations,
  };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
