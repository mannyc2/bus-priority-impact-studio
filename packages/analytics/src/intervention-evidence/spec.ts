import {
  STUDIO_INTERVENTION_TREATMENT_KINDS,
  type StudioInterventionTreatmentKind,
} from "@bp/domain/studio";
import { Schema } from "effect";
import {
  DATA_PRODUCT_MANIFEST,
  ROUTE_METRIC_HISTORY_DATA_PRODUCT_ID,
  ROUTE_METRIC_HISTORY_METRICS,
} from "../data-products/registry.js";
import { getFeatureContract, ROUTE_METRIC_HISTORY_FEATURE_GRAIN } from "../features/index.js";
import { decodeSchemaStrict } from "../schema-decode.js";

export const InterventionEvidenceBindingRoleSchema = Schema.Literals([
  "primary_outcome",
  "secondary_outcome",
  "exposure",
  "mechanism",
  "confounder",
  "context",
]);

export const InterventionEvidenceWindowSchema = Schema.Struct({
  monthsBefore: Schema.Literal(12),
  monthsAfter: Schema.Literal(12),
  includeAnchorMonth: Schema.Literal(true),
});

export const TreatmentRelevanceScopeSemanticSchema = Schema.Struct({
  scopeKind: Schema.Literals(["route", "corridor", "segment", "intersection", "source_only"]),
  status: Schema.Literals(["supported", "blocked"]),
  role: Schema.NullOr(InterventionEvidenceBindingRoleSchema),
  reasonId: Schema.NullOr(Schema.NonEmptyString),
  methodLimitation: Schema.NullOr(Schema.NonEmptyString),
});

export const TreatmentRelevanceBindingSchema = Schema.Struct({
  bindingId: Schema.NonEmptyString,
  dataProductId: Schema.NonEmptyString,
  featureGrain: Schema.NonEmptyString,
  resolverId: Schema.NonEmptyString,
  metricId: Schema.NonEmptyString,
  sourceField: Schema.Literals(["average_speed_mph", "ridership"]),
  label: Schema.NonEmptyString,
  unit: Schema.NonEmptyString,
  scopeSemantics: Schema.Array(TreatmentRelevanceScopeSemanticSchema).check(Schema.isMinLength(1)),
  window: InterventionEvidenceWindowSchema,
  claimCeiling: Schema.Literal("descriptive_observation"),
  presentationPriority: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
});

export const TreatmentRelevanceSpecSchema = Schema.Struct({
  specId: Schema.NonEmptyString,
  schemaVersion: Schema.Literal(1),
  treatmentKind: Schema.Literals(["automated_bus_lane_enforcement", "bus_lane", "busway"]),
  treatmentFamily: Schema.Literals(["enforcement", "bus_priority_lane"]),
  analysisFamily: Schema.Literals(["automated_bus_lane_enforcement", "bus_lane", "busway"]),
  supportedScopeKinds: Schema.Array(Schema.Literals(["route", "corridor", "segment"])).check(
    Schema.isMinLength(1),
  ),
  admittedLifecycleStates: Schema.Tuple([
    Schema.Literal("current_confirmed"),
    Schema.Literal("implemented"),
    Schema.Literal("historical_confirmed"),
  ]),
  admittedDatePrecisions: Schema.Tuple([Schema.Literal("day"), Schema.Literal("month")]),
  entityJoinPolicy: Schema.Literal("exact_route_identity"),
  minimumObservedMonths: Schema.Literal(1),
  nullPolicy: Schema.Literal("preserve_explicit_null_months"),
  requiredLineage: Schema.Tuple([Schema.Literal("reviewed_occurrence_source_refs")]),
  effectClaimPolicy: Schema.Literal("gated_study_artifact_only"),
  bindings: Schema.Array(TreatmentRelevanceBindingSchema).check(Schema.isMinLength(1)),
});

export const TreatmentRelevanceDispositionSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("supported"),
    specIds: Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
  }),
  Schema.Struct({
    status: Schema.Literal("blocked"),
    analysisFamily: Schema.Null,
    reasonId: Schema.NonEmptyString,
    unlockRequirement: Schema.NonEmptyString,
  }),
  Schema.Struct({
    status: Schema.Literal("not_relevant"),
    analysisFamily: Schema.Null,
    reasonId: Schema.NonEmptyString,
  }),
]);

export type InterventionEvidenceBindingRole = typeof InterventionEvidenceBindingRoleSchema.Type;
export type InterventionEvidenceWindow = typeof InterventionEvidenceWindowSchema.Type;
export type TreatmentRelevanceScopeSemantic = typeof TreatmentRelevanceScopeSemanticSchema.Type;
export type TreatmentRelevanceBinding = typeof TreatmentRelevanceBindingSchema.Type;
export type TreatmentRelevanceSpec = typeof TreatmentRelevanceSpecSchema.Type;
export type TreatmentRelevanceDisposition = typeof TreatmentRelevanceDispositionSchema.Type;

const routeMetricHistoryContract = getFeatureContract(ROUTE_METRIC_HISTORY_FEATURE_GRAIN);
if (routeMetricHistoryContract === null) {
  throw new Error(`Missing feature contract for ${ROUTE_METRIC_HISTORY_FEATURE_GRAIN}`);
}
const ROUTE_METRIC_HISTORY_RESOLVER_ID = routeMetricHistoryContract.resolverId;

const DISPLAY_WINDOW = { monthsBefore: 12, monthsAfter: 12, includeAnchorMonth: true } as const;
const SCOPE_MISMATCH_LIMITATION =
  "Route-level observations are context for a treatment scoped below the full route.";

function blockedScope(scopeKind: "corridor" | "segment" | "intersection" | "source_only") {
  return {
    scopeKind,
    status: "blocked",
    role: null,
    reasonId: "scope_unresolved",
    methodLimitation: null,
  } as const;
}

const ACE_SCOPE_SEMANTICS = [
  {
    scopeKind: "route",
    status: "supported",
    role: "primary_outcome",
    reasonId: null,
    methodLimitation: null,
  },
  blockedScope("corridor"),
  blockedScope("segment"),
  blockedScope("intersection"),
  blockedScope("source_only"),
] as const;

const ROUTE_SPEED_SCOPE_SEMANTICS = [
  {
    scopeKind: "route",
    status: "supported",
    role: "primary_outcome",
    reasonId: null,
    methodLimitation: null,
  },
  {
    scopeKind: "corridor",
    status: "supported",
    role: "context",
    reasonId: null,
    methodLimitation: SCOPE_MISMATCH_LIMITATION,
  },
  {
    scopeKind: "segment",
    status: "supported",
    role: "context",
    reasonId: null,
    methodLimitation: SCOPE_MISMATCH_LIMITATION,
  },
  blockedScope("intersection"),
  blockedScope("source_only"),
] as const;

const ROUTE_CONTEXT_SCOPE_SEMANTICS = ROUTE_SPEED_SCOPE_SEMANTICS.map((semantic) =>
  semantic.status === "supported"
    ? {
        ...semantic,
        role: "context" as const,
        methodLimitation: semantic.scopeKind === "route" ? null : SCOPE_MISMATCH_LIMITATION,
      }
    : semantic,
);

const ACE_CONTEXT_SCOPE_SEMANTICS = ACE_SCOPE_SEMANTICS.map((semantic) =>
  semantic.status === "supported" ? { ...semantic, role: "context" as const } : semantic,
);

function relevanceBinding(
  bindingId: string,
  metricKey: keyof typeof ROUTE_METRIC_HISTORY_METRICS,
  presentationPriority: number,
  scopeSemantics: readonly TreatmentRelevanceScopeSemantic[],
): TreatmentRelevanceBinding {
  const metric = ROUTE_METRIC_HISTORY_METRICS[metricKey];
  return {
    bindingId,
    dataProductId: ROUTE_METRIC_HISTORY_DATA_PRODUCT_ID,
    featureGrain: ROUTE_METRIC_HISTORY_FEATURE_GRAIN,
    resolverId: ROUTE_METRIC_HISTORY_RESOLVER_ID,
    ...metric,
    scopeSemantics,
    window: DISPLAY_WINDOW,
    claimCeiling: "descriptive_observation",
    presentationPriority,
  };
}

export const TREATMENT_RELEVANCE_SPECS_V1: readonly TreatmentRelevanceSpec[] = [
  {
    specId: "automated_bus_lane_enforcement_route_observations_v1",
    schemaVersion: 1,
    treatmentKind: "automated_bus_lane_enforcement",
    treatmentFamily: "enforcement",
    analysisFamily: "automated_bus_lane_enforcement",
    supportedScopeKinds: ["route"],
    admittedLifecycleStates: ["current_confirmed", "implemented", "historical_confirmed"],
    admittedDatePrecisions: ["day", "month"],
    entityJoinPolicy: "exact_route_identity",
    minimumObservedMonths: 1,
    nullPolicy: "preserve_explicit_null_months",
    requiredLineage: ["reviewed_occurrence_source_refs"],
    effectClaimPolicy: "gated_study_artifact_only",
    bindings: [
      relevanceBinding(
        "route_speed_around_implementation_v1",
        "route_average_speed_mph",
        1,
        ACE_SCOPE_SEMANTICS,
      ),
      relevanceBinding(
        "route_ridership_around_implementation_v1",
        "route_monthly_ridership",
        2,
        ACE_CONTEXT_SCOPE_SEMANTICS,
      ),
    ],
  },
  {
    specId: "bus_lane_route_observations_v1",
    schemaVersion: 1,
    treatmentKind: "bus_lane",
    treatmentFamily: "bus_priority_lane",
    analysisFamily: "bus_lane",
    supportedScopeKinds: ["route", "corridor", "segment"],
    admittedLifecycleStates: ["current_confirmed", "implemented", "historical_confirmed"],
    admittedDatePrecisions: ["day", "month"],
    entityJoinPolicy: "exact_route_identity",
    minimumObservedMonths: 1,
    nullPolicy: "preserve_explicit_null_months",
    requiredLineage: ["reviewed_occurrence_source_refs"],
    effectClaimPolicy: "gated_study_artifact_only",
    bindings: [
      relevanceBinding(
        "bus_lane_route_speed_around_implementation_v1",
        "route_average_speed_mph",
        1,
        ROUTE_SPEED_SCOPE_SEMANTICS,
      ),
      relevanceBinding(
        "bus_lane_route_ridership_around_implementation_v1",
        "route_monthly_ridership",
        2,
        ROUTE_CONTEXT_SCOPE_SEMANTICS,
      ),
    ],
  },
  {
    specId: "busway_route_observations_v1",
    schemaVersion: 1,
    treatmentKind: "busway",
    treatmentFamily: "bus_priority_lane",
    analysisFamily: "busway",
    supportedScopeKinds: ["route", "corridor", "segment"],
    admittedLifecycleStates: ["current_confirmed", "implemented", "historical_confirmed"],
    admittedDatePrecisions: ["day", "month"],
    entityJoinPolicy: "exact_route_identity",
    minimumObservedMonths: 1,
    nullPolicy: "preserve_explicit_null_months",
    requiredLineage: ["reviewed_occurrence_source_refs"],
    effectClaimPolicy: "gated_study_artifact_only",
    bindings: [
      relevanceBinding(
        "busway_route_speed_around_implementation_v1",
        "route_average_speed_mph",
        1,
        ROUTE_SPEED_SCOPE_SEMANTICS,
      ),
      relevanceBinding(
        "busway_route_ridership_around_implementation_v1",
        "route_monthly_ridership",
        2,
        ROUTE_CONTEXT_SCOPE_SEMANTICS,
      ),
    ],
  },
];

function blocked(reasonId: string, unlockRequirement: string): TreatmentRelevanceDisposition {
  return { status: "blocked", analysisFamily: null, reasonId, unlockRequirement };
}

function notRelevant(reasonId: string): TreatmentRelevanceDisposition {
  return { status: "not_relevant", analysisFamily: null, reasonId };
}

const datedOperationalOccurrenceRequired = blocked(
  "dated_operational_occurrence_required",
  "Publish a reviewed day- or month-precision operational occurrence with exact route and source lineage.",
);
const stopObservationContractRequired = blocked(
  "stop_dwell_boarding_contract_required",
  "Register stop-level dwell or boarding history, exact stop identities, and a dated operational occurrence.",
);
const routeLineageContractRequired = blocked(
  "route_lineage_comparability_required",
  "Prove longitudinal route-lineage comparability across the change before resolving route observations.",
);
const signalInventoryContractRequired = blocked(
  "signal_inventory_contract_required",
  "Register a current dated signal or queue-jump inventory with exact route/intersection projection and an appropriate metric product.",
);
const physicalScopeContractRequired = blocked(
  "physical_scope_product_required",
  "Map the reviewed physical scope to stable served segment or stop IDs and register a matching historical metric product.",
);
const curbScopeContractRequired = blocked(
  "curb_scope_product_required",
  "Register a dated curb-segment inventory, exact route projection, and a matching curb or travel-time history product.",
);

export const INTERVENTION_RELEVANCE_DISPOSITIONS_V1 = {
  all_door_boarding: stopObservationContractRequired,
  automated_bus_lane_enforcement: {
    status: "supported",
    specIds: ["automated_bus_lane_enforcement_route_observations_v1"],
  },
  bench: notRelevant("passenger_amenity_not_route_operation"),
  bus_bulb: stopObservationContractRequired,
  bus_lane: { status: "supported", specIds: ["bus_lane_route_observations_v1"] },
  bus_shelter: notRelevant("passenger_amenity_not_route_operation"),
  bus_stop_adjustment: stopObservationContractRequired,
  busway: { status: "supported", specIds: ["busway_route_observations_v1"] },
  capital_project_milestone: notRelevant("timeline_only_without_typed_treatment"),
  curb_extension: physicalScopeContractRequired,
  curb_regulation: curbScopeContractRequired,
  fare_machine_installation: stopObservationContractRequired,
  frequency_change: routeLineageContractRequired,
  high_visibility_crosswalk: notRelevant("street_safety_not_route_operation"),
  left_turn_bay: physicalScopeContractRequired,
  neckdown: physicalScopeContractRequired,
  off_board_fare_collection: stopObservationContractRequired,
  other_documented: blocked(
    "canonical_treatment_semantics_required",
    "Review the preserved raw label into a canonical treatment kind and register that kind's data contract.",
  ),
  pedestrian_improvement: notRelevant("street_safety_not_route_operation"),
  pedestrian_island: notRelevant("street_safety_not_route_operation"),
  planting: notRelevant("passenger_amenity_not_route_operation"),
  queue_jump: signalInventoryContractRequired,
  real_time_passenger_information: notRelevant("passenger_information_not_route_operation"),
  red_paint: datedOperationalOccurrenceRequired,
  resurfacing: notRelevant("maintenance_activity_not_typed_operational_treatment"),
  route_redesign: routeLineageContractRequired,
  select_bus_service: blocked(
    "service_package_decomposition_required",
    "Resolve the package to dated typed operational occurrences before selecting any observation spec.",
  ),
  signal_retiming: signalInventoryContractRequired,
  stop_change: stopObservationContractRequired,
  stop_consolidation: stopObservationContractRequired,
  stop_relocation: stopObservationContractRequired,
  transit_signal_priority: signalInventoryContractRequired,
  truck_loading_zone: curbScopeContractRequired,
  turn_restriction: physicalScopeContractRequired,
  wayfinding_sign: notRelevant("passenger_information_not_route_operation"),
} as const satisfies Record<StudioInterventionTreatmentKind, TreatmentRelevanceDisposition>;

export type TreatmentRelevanceResolution =
  | (Extract<TreatmentRelevanceDisposition, { status: "supported" }> & {
      readonly specs: readonly TreatmentRelevanceSpec[];
    })
  | (Exclude<TreatmentRelevanceDisposition, { status: "supported" }> & {
      readonly specs: readonly [];
    });

export function treatmentRelevanceFor(
  kind: StudioInterventionTreatmentKind,
): TreatmentRelevanceResolution {
  const disposition = INTERVENTION_RELEVANCE_DISPOSITIONS_V1[kind];
  if (disposition.status !== "supported") return { ...disposition, specs: [] };
  const specs = disposition.specIds.map((specId) => {
    const spec = TREATMENT_RELEVANCE_SPECS_V1.find((candidate) => candidate.specId === specId);
    if (spec === undefined) throw new Error(`Missing treatment relevance spec ${specId}`);
    return spec;
  });
  return { ...disposition, specs };
}

export type TreatmentRelevanceCoverageMatrixRow = {
  readonly treatmentKind: StudioInterventionTreatmentKind;
  readonly status: TreatmentRelevanceDisposition["status"];
  readonly specId: string | null;
  readonly reasonId: string | null;
  readonly unlockRequirement: string | null;
};

function buildTreatmentRelevanceCoverageMatrix(): readonly TreatmentRelevanceCoverageMatrixRow[] {
  const rows: TreatmentRelevanceCoverageMatrixRow[] = [];
  for (const treatmentKind of [...STUDIO_INTERVENTION_TREATMENT_KINDS].sort((left, right) =>
    left.localeCompare(right),
  )) {
    const disposition = INTERVENTION_RELEVANCE_DISPOSITIONS_V1[treatmentKind];
    if (disposition.status === "supported") {
      for (const specId of [...disposition.specIds].sort((left, right) =>
        left.localeCompare(right),
      )) {
        rows.push({
          treatmentKind,
          status: disposition.status,
          specId,
          reasonId: null,
          unlockRequirement: null,
        });
      }
      continue;
    }
    rows.push({
      treatmentKind,
      status: disposition.status,
      specId: null,
      reasonId: disposition.reasonId,
      unlockRequirement: disposition.status === "blocked" ? disposition.unlockRequirement : null,
    });
  }
  return rows;
}

export const INTERVENTION_RELEVANCE_COVERAGE_MATRIX_V1 = buildTreatmentRelevanceCoverageMatrix();

export function validateInterventionEvidenceRegistry(): void {
  const productIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));
  const relevanceSpecIds = new Set<string>();
  const relevanceBindingIds = new Set<string>();
  for (const spec of TREATMENT_RELEVANCE_SPECS_V1) {
    decodeSchemaStrict(TreatmentRelevanceSpecSchema, spec);
    if (relevanceSpecIds.has(spec.specId)) {
      throw new Error(`Duplicate treatment relevance spec ${spec.specId}`);
    }
    relevanceSpecIds.add(spec.specId);
    let previousPriority = 0;
    const priorities = new Set<number>();
    for (const binding of spec.bindings) {
      if (!productIds.has(binding.dataProductId)) {
        throw new Error(`Unknown data product ${binding.dataProductId}`);
      }
      if (binding.dataProductId !== ROUTE_METRIC_HISTORY_DATA_PRODUCT_ID) {
        throw new Error(`Unexpected data product for ${binding.bindingId}`);
      }
      const feature = getFeatureContract(binding.featureGrain);
      if (feature === null) throw new Error(`Unknown feature grain ${binding.featureGrain}`);
      if (feature.resolverId !== binding.resolverId) {
        throw new Error(`Resolver mismatch for ${binding.bindingId}`);
      }
      const metric = Object.values(ROUTE_METRIC_HISTORY_METRICS).find(
        (candidate) => candidate.metricId === binding.metricId,
      );
      if (
        metric === undefined ||
        metric.sourceField !== binding.sourceField ||
        metric.label !== binding.label ||
        metric.unit !== binding.unit
      ) {
        throw new Error(`Metric metadata mismatch for ${binding.bindingId}`);
      }
      if (relevanceBindingIds.has(binding.bindingId)) {
        throw new Error(`Duplicate treatment relevance binding ${binding.bindingId}`);
      }
      relevanceBindingIds.add(binding.bindingId);
      if (priorities.has(binding.presentationPriority)) {
        throw new Error(`Duplicate presentation priority in ${spec.specId}`);
      }
      priorities.add(binding.presentationPriority);
      if (binding.presentationPriority <= previousPriority) {
        throw new Error(`Bindings are not priority ordered in ${spec.specId}`);
      }
      previousPriority = binding.presentationPriority;
      const scopeKinds = new Set(binding.scopeSemantics.map((semantic) => semantic.scopeKind));
      if (scopeKinds.size !== 5) {
        throw new Error(`Incomplete scope semantics for ${binding.bindingId}`);
      }
      const supportedScopes = binding.scopeSemantics
        .filter((semantic) => semantic.status === "supported")
        .map((semantic) => semantic.scopeKind)
        .sort((left, right) => left.localeCompare(right));
      const declaredScopes = [...spec.supportedScopeKinds].sort((left, right) =>
        left.localeCompare(right),
      );
      if (supportedScopes.join("|") !== declaredScopes.join("|")) {
        throw new Error(`Scope semantics mismatch for ${binding.bindingId}`);
      }
      for (const semantic of binding.scopeSemantics) {
        if (
          semantic.status === "supported"
            ? semantic.role === null || semantic.reasonId !== null
            : semantic.role !== null || semantic.reasonId === null
        ) {
          throw new Error(`Invalid scope semantic for ${binding.bindingId}:${semantic.scopeKind}`);
        }
      }
      const sourceOnly = binding.scopeSemantics.find(
        (semantic) => semantic.scopeKind === "source_only",
      );
      if (sourceOnly?.status !== "blocked" || sourceOnly.reasonId !== "scope_unresolved") {
        throw new Error(`source_only must be scope_unresolved for ${binding.bindingId}`);
      }
    }
  }
  const referencedSpecIds = new Set<string>();
  for (const [kind, disposition] of Object.entries(INTERVENTION_RELEVANCE_DISPOSITIONS_V1)) {
    decodeSchemaStrict(TreatmentRelevanceDispositionSchema, disposition);
    if (disposition.status !== "supported") continue;
    for (const specId of disposition.specIds) {
      const spec = TREATMENT_RELEVANCE_SPECS_V1.find((candidate) => candidate.specId === specId);
      if (spec === undefined || spec.treatmentKind !== kind) {
        throw new Error(`Invalid relevance spec ${specId} for ${kind}`);
      }
      referencedSpecIds.add(specId);
    }
  }
  if (referencedSpecIds.size !== relevanceSpecIds.size) {
    throw new Error("Every treatment relevance spec must be referenced exactly once");
  }
}

validateInterventionEvidenceRegistry();
