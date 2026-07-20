import type { StudioInterventionTreatmentKind } from "@bp/domain/studio";
import { Schema } from "effect";
import { DATA_PRODUCT_MANIFEST } from "../data-products/registry.js";
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

export const InterventionEvidenceClaimCeilingSchema = Schema.Literals([
  "annotation_only",
  "descriptive_observation",
  "gated_study_only",
]);

export const InterventionEvidenceWindowSchema = Schema.Struct({
  monthsBefore: Schema.Literal(12),
  monthsAfter: Schema.Literal(12),
  includeAnchorMonth: Schema.Literal(true),
});

export const InterventionEvidenceBindingSchema = Schema.Struct({
  bindingId: Schema.NonEmptyString,
  dataProductId: Schema.NonEmptyString,
  featureGrain: Schema.NonEmptyString,
  resolverId: Schema.NonEmptyString,
  metricId: Schema.NonEmptyString,
  sourceField: Schema.Literals(["average_speed_mph", "ridership"]),
  label: Schema.NonEmptyString,
  unit: Schema.NonEmptyString,
  role: InterventionEvidenceBindingRoleSchema,
  scopePolicy: Schema.Literal("route"),
  window: InterventionEvidenceWindowSchema,
  claimCeiling: InterventionEvidenceClaimCeilingSchema,
  presentationPriority: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
});

export const InterventionEvidenceSpecSchema = Schema.Struct({
  specId: Schema.NonEmptyString,
  schemaVersion: Schema.Literal(1),
  analysisFamily: Schema.Literal("automated_bus_lane_enforcement"),
  supportedScopeKinds: Schema.Tuple([Schema.Literal("route")]),
  effectClaimPolicy: Schema.Literal("gated_study_artifact_only"),
  bindings: Schema.Array(InterventionEvidenceBindingSchema).check(Schema.isMinLength(1)),
});

export const InterventionAnalysisDispositionSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("supported"),
    analysisFamily: Schema.Literal("automated_bus_lane_enforcement"),
    specId: Schema.NonEmptyString,
  }),
  Schema.Struct({
    status: Schema.Literal("unsupported_treatment_family"),
    analysisFamily: Schema.Null,
    reasonId: Schema.Literal("not_reviewed_for_observation_v1"),
  }),
]);

export type InterventionEvidenceBindingRole = typeof InterventionEvidenceBindingRoleSchema.Type;
export type InterventionEvidenceClaimCeiling = typeof InterventionEvidenceClaimCeilingSchema.Type;
export type InterventionEvidenceWindow = typeof InterventionEvidenceWindowSchema.Type;
export type InterventionEvidenceBinding = typeof InterventionEvidenceBindingSchema.Type;
export type InterventionEvidenceSpec = typeof InterventionEvidenceSpecSchema.Type;
export type InterventionAnalysisDisposition = typeof InterventionAnalysisDispositionSchema.Type;

const routeMetricHistoryContract = getFeatureContract(ROUTE_METRIC_HISTORY_FEATURE_GRAIN);
if (routeMetricHistoryContract === null) {
  throw new Error(`Missing feature contract for ${ROUTE_METRIC_HISTORY_FEATURE_GRAIN}`);
}

const ACE_SPEC_ID = "automated_bus_lane_enforcement_route_observations_v1" as const;

export const INTERVENTION_EVIDENCE_SPECS: readonly InterventionEvidenceSpec[] = [
  {
    specId: ACE_SPEC_ID,
    schemaVersion: 1,
    analysisFamily: "automated_bus_lane_enforcement",
    supportedScopeKinds: ["route"],
    effectClaimPolicy: "gated_study_artifact_only",
    bindings: [
      {
        bindingId: "route_speed_around_implementation_v1",
        dataProductId: "local_route_month_trends_history",
        featureGrain: ROUTE_METRIC_HISTORY_FEATURE_GRAIN,
        resolverId: routeMetricHistoryContract.resolverId,
        metricId: "route_average_speed_mph",
        sourceField: "average_speed_mph",
        label: "Observed average speed",
        unit: "mph",
        role: "primary_outcome",
        scopePolicy: "route",
        window: { monthsBefore: 12, monthsAfter: 12, includeAnchorMonth: true },
        claimCeiling: "descriptive_observation",
        presentationPriority: 1,
      },
      {
        bindingId: "route_ridership_around_implementation_v1",
        dataProductId: "local_route_month_trends_history",
        featureGrain: ROUTE_METRIC_HISTORY_FEATURE_GRAIN,
        resolverId: routeMetricHistoryContract.resolverId,
        metricId: "route_monthly_ridership",
        sourceField: "ridership",
        label: "Monthly riders",
        unit: "riders",
        role: "context",
        scopePolicy: "route",
        window: { monthsBefore: 12, monthsAfter: 12, includeAnchorMonth: true },
        claimCeiling: "descriptive_observation",
        presentationPriority: 2,
      },
    ],
  },
] as const;

const unsupported = {
  status: "unsupported_treatment_family",
  analysisFamily: null,
  reasonId: "not_reviewed_for_observation_v1",
} as const;

export const INTERVENTION_ANALYSIS_DISPOSITIONS_V1 = {
  all_door_boarding: unsupported,
  automated_bus_lane_enforcement: {
    status: "supported",
    analysisFamily: "automated_bus_lane_enforcement",
    specId: ACE_SPEC_ID,
  },
  bench: unsupported,
  bus_bulb: unsupported,
  bus_lane: unsupported,
  bus_shelter: unsupported,
  bus_stop_adjustment: unsupported,
  busway: unsupported,
  capital_project_milestone: unsupported,
  curb_extension: unsupported,
  curb_regulation: unsupported,
  fare_machine_installation: unsupported,
  frequency_change: unsupported,
  high_visibility_crosswalk: unsupported,
  left_turn_bay: unsupported,
  neckdown: unsupported,
  off_board_fare_collection: unsupported,
  other_documented: unsupported,
  pedestrian_improvement: unsupported,
  pedestrian_island: unsupported,
  planting: unsupported,
  queue_jump: unsupported,
  real_time_passenger_information: unsupported,
  red_paint: unsupported,
  resurfacing: unsupported,
  route_redesign: unsupported,
  select_bus_service: unsupported,
  signal_retiming: unsupported,
  stop_change: unsupported,
  stop_consolidation: unsupported,
  stop_relocation: unsupported,
  transit_signal_priority: unsupported,
  truck_loading_zone: unsupported,
  turn_restriction: unsupported,
  wayfinding_sign: unsupported,
} as const satisfies Record<StudioInterventionTreatmentKind, InterventionAnalysisDisposition>;

export type InterventionEvidenceSpecResolution =
  | {
      readonly status: "supported";
      readonly analysisFamily: "automated_bus_lane_enforcement";
      readonly specId: string;
      readonly spec: InterventionEvidenceSpec;
    }
  | {
      readonly status: "unsupported_treatment_family";
      readonly analysisFamily: null;
      readonly reasonId: "not_reviewed_for_observation_v1";
      readonly spec: null;
    };

export function interventionEvidenceSpecFor(
  kind: StudioInterventionTreatmentKind,
): InterventionEvidenceSpecResolution {
  const disposition = INTERVENTION_ANALYSIS_DISPOSITIONS_V1[kind];
  if (disposition.status === "unsupported_treatment_family") {
    return { ...disposition, spec: null };
  }
  const spec = INTERVENTION_EVIDENCE_SPECS.find(
    (candidate) => candidate.specId === disposition.specId,
  );
  if (spec === undefined)
    throw new Error(`Missing intervention evidence spec ${disposition.specId}`);
  return { ...disposition, spec };
}

export function validateInterventionEvidenceRegistry(): void {
  const productIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));
  const bindingIds = new Set<string>();
  for (const spec of INTERVENTION_EVIDENCE_SPECS) {
    decodeSchemaStrict(InterventionEvidenceSpecSchema, spec);
    let previousPriority = 0;
    const priorities = new Set<number>();
    for (const binding of spec.bindings) {
      if (!productIds.has(binding.dataProductId)) {
        throw new Error(`Unknown data product ${binding.dataProductId}`);
      }
      const feature = getFeatureContract(binding.featureGrain);
      if (feature === null) throw new Error(`Unknown feature grain ${binding.featureGrain}`);
      if (feature.resolverId !== binding.resolverId) {
        throw new Error(`Resolver mismatch for ${binding.bindingId}`);
      }
      if (bindingIds.has(binding.bindingId)) {
        throw new Error(`Duplicate intervention evidence binding ${binding.bindingId}`);
      }
      bindingIds.add(binding.bindingId);
      if (priorities.has(binding.presentationPriority)) {
        throw new Error(`Duplicate presentation priority in ${spec.specId}`);
      }
      priorities.add(binding.presentationPriority);
      if (binding.presentationPriority <= previousPriority) {
        throw new Error(`Bindings are not priority ordered in ${spec.specId}`);
      }
      previousPriority = binding.presentationPriority;
      if (
        binding.window.monthsBefore !== 12 ||
        binding.window.monthsAfter !== 12 ||
        !binding.window.includeAnchorMonth
      ) {
        throw new Error(`Unsupported display window for ${binding.bindingId}`);
      }
    }
  }
  for (const disposition of Object.values(INTERVENTION_ANALYSIS_DISPOSITIONS_V1)) {
    decodeSchemaStrict(InterventionAnalysisDispositionSchema, disposition);
  }
}

validateInterventionEvidenceRegistry();
