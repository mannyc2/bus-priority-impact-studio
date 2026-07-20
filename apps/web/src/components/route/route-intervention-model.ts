import type {
  StudioInterventionLifecycleState,
  StudioInterventionTreatmentFamily,
  StudioInterventionTreatmentKind,
  StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionOccurrence,
  StudioRouteInterventionProjectRef,
  StudioRouteInterventionSourceGap,
  StudioRouteInterventionTreatment,
} from "@/studio/api-contract";

export type InterventionPresentation = {
  label: string;
  family: StudioInterventionTreatmentFamily;
  familyLabel: string;
  compactCode: string | null;
  order: number;
  tone: "accent" | "neutral";
  operationalAnnotationStem: string | null;
};

type KindPresentation = Omit<InterventionPresentation, "family" | "familyLabel" | "label"> & {
  label: string;
};

const KIND_PRESENTATION = {
  bus_lane: kind("Bus lane", "BL", 10),
  busway: kind("Busway", "BWY", 11),
  transit_signal_priority: kind("Transit signal priority", "TSP", 20),
  queue_jump: kind("Queue jump", "QJ", 21),
  stop_consolidation: kind("Stop consolidation", "SC", 30),
  stop_relocation: kind("Stop relocation", null, 31),
  bus_bulb: kind("Bus bulb", null, 40),
  neckdown: kind("Neckdown", null, 41),
  red_paint: kind("Red paint", null, 12),
  off_board_fare_collection: kind("Off-board fare collection", "OBF", 50),
  all_door_boarding: kind("All-door boarding", "AD", 51),
  automated_bus_lane_enforcement: kind("Automated bus lane enforcement", "ACE", 60, {
    operationalAnnotationStem: "Enforcement starts",
  }),
  route_redesign: kind("Route redesign", null, 70),
  pedestrian_improvement: kind("Pedestrian improvement", null, 42),
  signal_retiming: kind("Signal retiming", "SR", 22),
  select_bus_service: kind("Select Bus Service", "SBS", 80),
  stop_change: kind("Stop change", null, 32),
  capital_project_milestone: kind("Capital project milestone", "CAP", 90),
  frequency_change: kind("Frequency change", null, 71),
  turn_restriction: kind("Turn restriction", null, 43),
  bench: kind("Bench", null, 44),
  bus_shelter: kind("Bus shelter", null, 45),
  bus_stop_adjustment: kind("Bus stop adjustment", null, 33),
  curb_extension: kind("Curb extension", null, 100),
  curb_regulation: kind("Curb regulation", "CR", 101),
  fare_machine_installation: kind("Fare machine installation", null, 52),
  high_visibility_crosswalk: kind("High-visibility crosswalk", null, 46),
  left_turn_bay: kind("Left-turn bay", null, 47),
  pedestrian_island: kind("Pedestrian island", null, 48),
  planting: kind("Planting", null, 49),
  real_time_passenger_information: kind("Real-time passenger information", null, 110),
  resurfacing: kind("Resurfacing", null, 91),
  truck_loading_zone: kind("Truck loading zone", null, 102),
  wayfinding_sign: kind("Wayfinding sign", null, 111),
  other_documented: kind("Other documented treatment", null, 120, { tone: "neutral" }),
} satisfies Record<StudioInterventionTreatmentKind, KindPresentation>;

const FAMILY_LABELS = {
  bus_priority_lane: "Bus priority lanes",
  signal_priority: "Signal priority",
  stop_change: "Stop changes",
  street_design: "Street design",
  boarding_and_fare: "Boarding and fare",
  enforcement: "Enforcement",
  service_change: "Service changes",
  service_package: "Service packages",
  capital: "Capital work",
  curb_management: "Curb management",
  customer_information: "Customer information",
  other: "Other documented",
} satisfies Record<StudioInterventionTreatmentFamily, string>;

const LIFECYCLE_LABELS = {
  current_confirmed: "Current",
  implemented: "Implemented",
  historical_confirmed: "Historical",
  planned: "Planned",
  proposed: "Proposed",
  under_consideration: "Under consideration",
  candidate: "Candidate",
} satisfies Record<StudioInterventionLifecycleState, string>;

const LIFECYCLE_ORDER = {
  current_confirmed: 0,
  implemented: 1,
  historical_confirmed: 2,
  planned: 3,
  proposed: 4,
  under_consideration: 5,
  candidate: 6,
} satisfies Record<StudioInterventionLifecycleState, number>;

export type RouteInterventionTreatmentRow = {
  key: string;
  anchorId: string;
  treatment: StudioRouteInterventionTreatment;
  presentation: InterventionPresentation;
  lifecycleLabel: string;
  lifecycleOrder: number;
};

export type RouteInterventionTimelineRow = {
  key: string;
  anchorId: string;
  occurrence: StudioRouteInterventionOccurrence;
  treatmentRows: readonly RouteInterventionTreatmentRow[];
  projectIds: readonly string[];
};

export type RouteInterventionProjectRow = StudioRouteInterventionProjectRef & {
  key: string;
  anchorId: string;
};

export type RouteInterventionGapRow = StudioRouteInterventionSourceGap & {
  key: string;
  anchorId: string;
};

export type RouteInterventionCoveragePresentation =
  | { status: "unavailable"; message: "Treatment inventory unavailable" }
  | {
      status: "partial";
      message: "Treatment inventory coverage is partial; known records are shown.";
    }
  | {
      status: "checked_empty";
      message: "No positive treatment evidence was found in checked sources.";
    }
  | { status: "available"; message: null };

export type RouteInterventionViewModel = {
  routeId: string | null;
  routeSlug: string | null;
  coverage: RouteInterventionCoveragePresentation;
  treatments: readonly RouteInterventionTreatmentRow[];
  timeline: readonly RouteInterventionTimelineRow[];
  projects: readonly RouteInterventionProjectRow[];
  gaps: readonly RouteInterventionGapRow[];
};

function kind(
  label: string,
  compactCode: string | null,
  order: number,
  options: Partial<Pick<KindPresentation, "operationalAnnotationStem" | "tone">> = {},
): KindPresentation {
  return {
    label,
    compactCode,
    order,
    tone: options.tone ?? "accent",
    operationalAnnotationStem: options.operationalAnnotationStem ?? null,
  };
}

export function interventionPresentationForTreatment(
  treatment: StudioRouteInterventionTreatment,
): InterventionPresentation {
  const metadata = KIND_PRESENTATION[treatment.treatmentKind];
  const label =
    treatment.treatmentKind === "other_documented"
      ? (treatment.rawLabel ?? humanize(treatment.rawKind))
      : metadata.label;
  return {
    ...metadata,
    label,
    family: treatment.treatmentFamily,
    familyLabel: FAMILY_LABELS[treatment.treatmentFamily],
  };
}

export function treatmentLifecycleLabel(state: StudioInterventionLifecycleState): string {
  return LIFECYCLE_LABELS[state];
}

export function treatmentRecordAnchorId(recordId: string): string {
  const encoded = [...recordId]
    .map((character) =>
      /^[A-Za-z0-9-]$/u.test(character)
        ? character
        : `_${character.codePointAt(0)?.toString(16) ?? "0"}_`,
    )
    .join("");
  return `intervention-${encoded}`;
}

export function routeInterventionViewModel(
  bundle: StudioRouteInterventionInventoryBundle | null,
): RouteInterventionViewModel {
  if (bundle === null) {
    return {
      routeId: null,
      routeSlug: null,
      coverage: { status: "unavailable", message: "Treatment inventory unavailable" },
      treatments: [],
      timeline: [],
      projects: [],
      gaps: [],
    };
  }

  const treatments = bundle.treatments
    .map(
      (treatment): RouteInterventionTreatmentRow => ({
        key: treatment.treatmentId,
        anchorId: treatmentRecordAnchorId(treatment.treatmentId),
        treatment,
        presentation: interventionPresentationForTreatment(treatment),
        lifecycleLabel: treatmentLifecycleLabel(treatment.lifecycleState),
        lifecycleOrder: LIFECYCLE_ORDER[treatment.lifecycleState],
      }),
    )
    .sort(compareTreatmentRows);
  const treatmentById = new Map(treatments.map((row) => [row.treatment.treatmentId, row]));
  const projectIdsByOccurrenceId = projectOccurrenceRelationships(bundle.projectRefs);
  const timeline = [...bundle.occurrences]
    .sort(compareOccurrences)
    .map((occurrence): RouteInterventionTimelineRow => {
      const projectIds = new Set([
        ...occurrence.projectIds,
        ...(projectIdsByOccurrenceId.get(occurrence.occurrenceId) ?? []),
      ]);
      return {
        key: occurrence.occurrenceId,
        anchorId: treatmentRecordAnchorId(occurrence.occurrenceId),
        occurrence,
        treatmentRows: occurrence.treatmentIds.flatMap((id) => {
          const row = treatmentById.get(id);
          return row === undefined ? [] : [row];
        }),
        projectIds: [...projectIds].sort(),
      };
    });
  const projects = [...bundle.projectRefs]
    .sort((left, right) => left.projectId.localeCompare(right.projectId))
    .map((project) => ({
      ...project,
      key: project.projectId,
      anchorId: treatmentRecordAnchorId(project.projectId),
    }));
  const gaps = [...bundle.sourceGaps]
    .sort((left, right) => left.gapId.localeCompare(right.gapId))
    .map((gap) => ({ ...gap, key: gap.gapId, anchorId: treatmentRecordAnchorId(gap.gapId) }));

  return {
    routeId: bundle.route.routeId,
    routeSlug: bundle.routeSlug,
    coverage: coveragePresentation(bundle),
    treatments,
    timeline,
    projects,
    gaps,
  };
}

function coveragePresentation(
  bundle: StudioRouteInterventionInventoryBundle,
): RouteInterventionCoveragePresentation {
  if (bundle.coverageState === "partial") {
    return {
      status: "partial",
      message: "Treatment inventory coverage is partial; known records are shown.",
    };
  }
  if (bundle.coverageState === "checked_no_positive_evidence") {
    return {
      status: "checked_empty",
      message: "No positive treatment evidence was found in checked sources.",
    };
  }
  return { status: "available", message: null };
}

function compareTreatmentRows(
  left: RouteInterventionTreatmentRow,
  right: RouteInterventionTreatmentRow,
): number {
  return (
    left.lifecycleOrder - right.lifecycleOrder ||
    left.presentation.order - right.presentation.order ||
    compareDatesNewestFirst(left.treatment.effectiveDate, right.treatment.effectiveDate) ||
    left.key.localeCompare(right.key)
  );
}

function compareOccurrences(
  left: StudioRouteInterventionOccurrence,
  right: StudioRouteInterventionOccurrence,
): number {
  return (
    LIFECYCLE_ORDER[left.lifecycleState] - LIFECYCLE_ORDER[right.lifecycleState] ||
    compareDatesNewestFirst(left.effectiveDate, right.effectiveDate) ||
    left.occurrenceId.localeCompare(right.occurrenceId)
  );
}

function compareDatesNewestFirst(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right.localeCompare(left);
}

function projectOccurrenceRelationships(
  projects: readonly StudioRouteInterventionProjectRef[],
): ReadonlyMap<string, readonly string[]> {
  const relationships = new Map<string, string[]>();
  for (const project of projects) {
    for (const occurrenceId of project.occurrenceIds) {
      const projectIds = relationships.get(occurrenceId) ?? [];
      projectIds.push(project.projectId);
      relationships.set(occurrenceId, projectIds);
    }
  }
  return relationships;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}
