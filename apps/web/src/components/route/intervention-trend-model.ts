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

type EligibleEvent = {
  event: ObservationEvent;
  series: ObservationSeries;
};

type MarkerCandidate = {
  event: ObservationEvent;
  annotationStem: string;
};

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
    return dossierFallback(
      dossierPoints,
      "Intervention observations and inventory are not both available.",
    );
  }

  if (
    observations.releaseId !== inventory.releaseId ||
    observations.publishedAt !== inventory.publishedAt
  ) {
    return dossierFallback(
      dossierPoints,
      "Intervention observations and inventory do not share a release.",
    );
  }

  if (!hasExactRouteIdentity(observations, inventory)) {
    return dossierFallback(
      dossierPoints,
      "Intervention observations and inventory do not share an exact route identity.",
    );
  }

  const eligible = observations.events
    .flatMap((event): EligibleEvent[] => {
      const series = event.series.find(
        (candidate) =>
          candidate.bindingId === ROUTE_SPEED_OBSERVATION_BINDING_ID &&
          candidate.metricId === ROUTE_SPEED_OBSERVATION_METRIC_ID &&
          (candidate.status === "available" || candidate.status === "partial") &&
          candidate.points.some((point) => point.value !== null),
      );
      return series === undefined ? [] : [{ event, series }];
    })
    .sort(
      (left, right) =>
        left.event.implementationMonth.localeCompare(right.event.implementationMonth) ||
        left.event.eventId.localeCompare(right.event.eventId),
    );

  const focal = eligible.at(-1);
  if (focal === undefined) {
    return dossierFallback(dossierPoints, [
      ...observations.limitations,
      "No eligible route-speed observation series is available.",
    ]);
  }

  const points = focal.series.points
    .map((point): TrendPoint => ({ month: point.month, value: point.value }))
    .sort((left, right) => left.month.localeCompare(right.month));
  const pointMonths = new Set(points.map((point) => point.month));
  const occurrenceById = new Map(
    inventory.occurrences.map((occurrence) => [occurrence.occurrenceId, occurrence]),
  );
  const treatmentById = new Map(
    inventory.treatments.map((treatment) => [treatment.treatmentId, treatment]),
  );
  const limitations = [...observations.limitations];
  const candidates: MarkerCandidate[] = [];

  for (const entry of eligible) {
    const { event } = entry;
    if (!pointMonths.has(event.implementationMonth)) continue;

    const occurrence = occurrenceById.get(event.occurrenceId);
    if (occurrence === undefined) {
      addLimitation(
        limitations,
        `Event ${event.eventId} references unknown occurrence ${event.occurrenceId}.`,
      );
      continue;
    }
    const treatment = treatmentById.get(event.treatmentId);
    if (treatment === undefined) {
      addLimitation(
        limitations,
        `Event ${event.eventId} references unknown treatment ${event.treatmentId}.`,
      );
      continue;
    }
    if (event.routeId !== observations.routeId || occurrence.routeId !== inventory.route.routeId) {
      addLimitation(limitations, `Event ${event.eventId} does not resolve to this route.`);
      continue;
    }
    if (
      !occurrence.treatmentIds.includes(event.treatmentId) ||
      !treatment.occurrenceIds.includes(event.occurrenceId)
    ) {
      addLimitation(
        limitations,
        `Event ${event.eventId} occurrence and treatment IDs do not resolve together.`,
      );
      continue;
    }

    const annotationStem =
      interventionPresentationForTreatment(treatment).operationalAnnotationStem;
    if (annotationStem === null) {
      addLimitation(limitations, `Event ${event.eventId} has no operational annotation stem.`);
      continue;
    }
    candidates.push({ event, annotationStem });
  }

  const markers = clusterMarkers(candidates);
  const cap = Math.max(0, Math.floor(markerCap));

  return {
    source: "observation_bundle",
    points,
    markers: markers.slice(Math.max(0, markers.length - cap)),
    focalEventId: focal.event.eventId,
    limitations,
  };
}

function dossierFallback(
  points: readonly TrendPoint[],
  limitation: string | readonly string[],
): RouteSpeedTrendModel {
  return {
    source: "dossier_fallback",
    points,
    markers: [],
    focalEventId: null,
    limitations: typeof limitation === "string" ? [limitation] : limitation,
  };
}

function hasExactRouteIdentity(
  observations: StudioRouteInterventionObservationBundle,
  inventory: StudioRouteInterventionInventoryBundle,
): boolean {
  const left = observations.route;
  const right = inventory.route;
  return (
    observations.routeId === left.routeId &&
    observations.routeId === right.routeId &&
    observations.routeSlug === inventory.routeSlug &&
    left.routeId === right.routeId &&
    left.routeFamilyId === right.routeFamilyId &&
    left.displayLabel === right.displayLabel &&
    left.officialLongName === right.officialLongName &&
    sameValues(left.designationLiterals, right.designationLiterals) &&
    sameValues(left.serviceModes, right.serviceModes) &&
    sameValues(left.routeTypes, right.routeTypes) &&
    sameValues(left.tripTypes, right.tripTypes)
  );
}

function sameValues(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function addLimitation(limitations: string[], limitation: string): void {
  if (!limitations.includes(limitation)) limitations.push(limitation);
}

function clusterMarkers(candidates: readonly MarkerCandidate[]): TrendMarker[] {
  const byMonth = new Map<string, MarkerCandidate[]>();
  for (const candidate of candidates) {
    const monthCandidates = byMonth.get(candidate.event.implementationMonth) ?? [];
    monthCandidates.push(candidate);
    byMonth.set(candidate.event.implementationMonth, monthCandidates);
  }

  return [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, monthCandidates]) => {
      const ordered = [...monthCandidates].sort(
        (left, right) =>
          left.event.eventId.localeCompare(right.event.eventId) ||
          left.event.occurrenceId.localeCompare(right.event.occurrenceId) ||
          left.event.treatmentId.localeCompare(right.event.treatmentId),
      );
      const eventIds = sortedUnique(ordered.map(({ event }) => event.eventId));
      const occurrenceIds = sortedUnique(ordered.map(({ event }) => event.occurrenceId));
      const treatmentIds = sortedUnique(ordered.map(({ event }) => event.treatmentId));
      const annotationStem = ordered[0]?.annotationStem ?? "";
      const monthLabel = trendMonthLabel(month);
      const label =
        occurrenceIds.length === 1
          ? `${annotationStem} ${monthLabel}`
          : `${occurrenceIds.length} ${annotationStem.toLocaleLowerCase("en-US")}, ${monthLabel}`;

      return {
        month,
        label,
        count: occurrenceIds.length,
        eventIds,
        occurrenceIds,
        treatmentIds,
      };
    });
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function trendMonthLabel(month: string): string {
  const [year, monthPart] = month.split("-");
  const name = MONTH_NAMES[Number(monthPart) - 1];
  return year === undefined || name === undefined ? month : `${name} ${year}`;
}
