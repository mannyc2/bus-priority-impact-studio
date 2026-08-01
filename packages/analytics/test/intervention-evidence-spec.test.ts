import { describe, expect, test } from "bun:test";
import { DATA_PRODUCT_MANIFEST, DataProductManifestSchema } from "@bp/analytics/data-products";
import { getFeatureContract, ROUTE_METRIC_HISTORY_FEATURE_GRAIN } from "@bp/analytics/features";
import {
  INTERVENTION_RELEVANCE_COVERAGE_MATRIX_V1,
  INTERVENTION_RELEVANCE_DISPOSITIONS_V1,
  TREATMENT_RELEVANCE_SPECS_V1,
  TreatmentRelevanceDispositionSchema,
  TreatmentRelevanceSpecSchema,
  treatmentRelevanceFor,
  validateInterventionEvidenceRegistry,
} from "@bp/analytics/intervention-evidence";
import {
  STUDIO_INTERVENTION_TREATMENT_KINDS,
  type StudioInterventionTreatmentKind,
} from "@bp/domain/studio";
import { Schema } from "effect";
import {
  ROUTE_METRIC_HISTORY_DATA_PRODUCT_ID,
  ROUTE_METRIC_HISTORY_METRICS,
} from "../src/data-products/registry.js";

const StrictParseOptions = { onExcessProperty: "error" } as const;

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Assert<Value extends true> = Value;
type LookupInputIsCanonicalKind = Assert<
  Equal<Parameters<typeof treatmentRelevanceFor>[0], StudioInterventionTreatmentKind>
>;
type MatrixIsExhaustive = Assert<
  Equal<keyof typeof EXPECTED_COVERAGE, StudioInterventionTreatmentKind>
>;
const lookupInputIsCanonicalKind: LookupInputIsCanonicalKind = true;
const matrixIsExhaustive: MatrixIsExhaustive = true;

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label} in test fixture`);
  return value;
}

const EXPECTED_COVERAGE = {
  all_door_boarding: "blocked:stop_dwell_boarding_contract_required",
  automated_bus_lane_enforcement: "supported:automated_bus_lane_enforcement_route_observations_v1",
  bench: "not_relevant:passenger_amenity_not_route_operation",
  bus_bulb: "blocked:stop_dwell_boarding_contract_required",
  bus_lane: "supported:bus_lane_route_observations_v1",
  bus_shelter: "not_relevant:passenger_amenity_not_route_operation",
  bus_stop_adjustment: "blocked:stop_dwell_boarding_contract_required",
  busway: "supported:busway_route_observations_v1",
  capital_project_milestone: "not_relevant:timeline_only_without_typed_treatment",
  curb_extension: "blocked:physical_scope_product_required",
  curb_regulation: "blocked:curb_scope_product_required",
  fare_machine_installation: "blocked:stop_dwell_boarding_contract_required",
  frequency_change: "blocked:route_lineage_comparability_required",
  high_visibility_crosswalk: "not_relevant:street_safety_not_route_operation",
  left_turn_bay: "blocked:physical_scope_product_required",
  neckdown: "blocked:physical_scope_product_required",
  off_board_fare_collection: "blocked:stop_dwell_boarding_contract_required",
  other_documented: "blocked:canonical_treatment_semantics_required",
  pedestrian_improvement: "not_relevant:street_safety_not_route_operation",
  pedestrian_island: "not_relevant:street_safety_not_route_operation",
  planting: "not_relevant:passenger_amenity_not_route_operation",
  queue_jump: "blocked:signal_inventory_contract_required",
  real_time_passenger_information: "not_relevant:passenger_information_not_route_operation",
  red_paint: "blocked:dated_operational_occurrence_required",
  resurfacing: "not_relevant:maintenance_activity_not_typed_operational_treatment",
  route_redesign: "blocked:route_lineage_comparability_required",
  select_bus_service: "blocked:service_package_decomposition_required",
  signal_retiming: "blocked:signal_inventory_contract_required",
  stop_change: "blocked:stop_dwell_boarding_contract_required",
  stop_consolidation: "blocked:stop_dwell_boarding_contract_required",
  stop_relocation: "blocked:stop_dwell_boarding_contract_required",
  transit_signal_priority: "blocked:signal_inventory_contract_required",
  truck_loading_zone: "blocked:curb_scope_product_required",
  turn_restriction: "blocked:physical_scope_product_required",
  wayfinding_sign: "not_relevant:passenger_information_not_route_operation",
} as const satisfies Record<StudioInterventionTreatmentKind, string>;

const EXPECTED_UNLOCKS = {
  canonical_treatment_semantics_required:
    "Review the preserved raw label into a canonical treatment kind and register that kind's data contract.",
  curb_scope_product_required:
    "Register a dated curb-segment inventory, exact route projection, and a matching curb or travel-time history product.",
  dated_operational_occurrence_required:
    "Publish a reviewed day- or month-precision operational occurrence with exact route and source lineage.",
  physical_scope_product_required:
    "Map the reviewed physical scope to stable served segment or stop IDs and register a matching historical metric product.",
  route_lineage_comparability_required:
    "Prove longitudinal route-lineage comparability across the change before resolving route observations.",
  service_package_decomposition_required:
    "Resolve the package to dated typed operational occurrences before selecting any observation spec.",
  signal_inventory_contract_required:
    "Register a current dated signal or queue-jump inventory with exact route/intersection projection and an appropriate metric product.",
  stop_dwell_boarding_contract_required:
    "Register stop-level dwell or boarding history, exact stop identities, and a dated operational occurrence.",
} as const;

const TARGET_ACE_SPEC = required(
  TREATMENT_RELEVANCE_SPECS_V1.find(
    (spec) => spec.treatmentKind === "automated_bus_lane_enforcement",
  ),
  "target ACE spec",
);
const BUS_LANE_SPEC = required(
  TREATMENT_RELEVANCE_SPECS_V1.find((spec) => spec.treatmentKind === "bus_lane"),
  "bus-lane spec",
);
const BUSWAY_SPEC = required(
  TREATMENT_RELEVANCE_SPECS_V1.find((spec) => spec.treatmentKind === "busway"),
  "busway spec",
);

describe("intervention evidence registry", () => {
  test("strictly decodes the target specs, dispositions, and product manifest", () => {
    expect(lookupInputIsCanonicalKind).toBe(true);
    expect(matrixIsExhaustive).toBe(true);
    expect(TREATMENT_RELEVANCE_SPECS_V1).toHaveLength(3);
    for (const spec of TREATMENT_RELEVANCE_SPECS_V1) {
      expect(() =>
        Schema.decodeUnknownSync(TreatmentRelevanceSpecSchema)(spec, StrictParseOptions),
      ).not.toThrow();
    }
    for (const disposition of Object.values(INTERVENTION_RELEVANCE_DISPOSITIONS_V1)) {
      expect(() =>
        Schema.decodeUnknownSync(TreatmentRelevanceDispositionSchema)(
          disposition,
          StrictParseOptions,
        ),
      ).not.toThrow();
    }
    expect(() =>
      Schema.decodeUnknownSync(DataProductManifestSchema)(
        DATA_PRODUCT_MANIFEST,
        StrictParseOptions,
      ),
    ).not.toThrow();
    expect(() => validateInterventionEvidenceRegistry()).not.toThrow();
  });

  test("builds an exact exhaustive coverage matrix sorted by treatment kind and spec ID", () => {
    expect(Object.keys(INTERVENTION_RELEVANCE_DISPOSITIONS_V1).sort()).toEqual(
      [...STUDIO_INTERVENTION_TREATMENT_KINDS].sort(),
    );
    expect(INTERVENTION_RELEVANCE_COVERAGE_MATRIX_V1).toHaveLength(35);
    expect(
      INTERVENTION_RELEVANCE_COVERAGE_MATRIX_V1.map((row) =>
        [row.treatmentKind, row.status, row.specId ?? row.reasonId].join(":"),
      ),
    ).toEqual(
      Object.entries(EXPECTED_COVERAGE)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([kind, disposition]) => `${kind}:${disposition}`),
    );
    for (const row of INTERVENTION_RELEVANCE_COVERAGE_MATRIX_V1) {
      if (row.status !== "blocked") continue;
      expect(row.unlockRequirement).toBe(
        EXPECTED_UNLOCKS[row.reasonId as keyof typeof EXPECTED_UNLOCKS],
      );
    }
  });

  test("defines distinct bus-lane and busway specs with exact lifecycle and scope semantics", () => {
    expect(BUS_LANE_SPEC.specId).not.toBe(BUSWAY_SPEC.specId);
    expect(BUS_LANE_SPEC.bindings.map((binding) => binding.bindingId)).not.toEqual(
      BUSWAY_SPEC.bindings.map((binding) => binding.bindingId),
    );
    for (const spec of [TARGET_ACE_SPEC, BUS_LANE_SPEC, BUSWAY_SPEC]) {
      expect(spec.admittedLifecycleStates).toEqual([
        "current_confirmed",
        "implemented",
        "historical_confirmed",
      ]);
      expect(spec.admittedDatePrecisions).toEqual(["day", "month"]);
      expect(spec.entityJoinPolicy).toBe("exact_route_identity");
      expect(spec.minimumObservedMonths).toBe(1);
      expect(spec.nullPolicy).toBe("preserve_explicit_null_months");
      for (const binding of spec.bindings) {
        const sourceOnly = required(
          binding.scopeSemantics.find((semantic) => semantic.scopeKind === "source_only"),
          `${binding.bindingId} source_only semantic`,
        );
        expect(sourceOnly).toEqual({
          scopeKind: "source_only",
          status: "blocked",
          role: null,
          reasonId: "scope_unresolved",
          methodLimitation: null,
        });
      }
    }
    for (const spec of [BUS_LANE_SPEC, BUSWAY_SPEC]) {
      const speed = required(spec.bindings[0], `${spec.specId} speed binding`);
      const roleFor = (scopeKind: "route" | "corridor" | "segment") =>
        required(
          speed.scopeSemantics.find((semantic) => semantic.scopeKind === scopeKind),
          `${spec.specId}:${scopeKind}`,
        ).role;
      expect(roleFor("route")).toBe("primary_outcome");
      expect(roleFor("corridor")).toBe("context");
      expect(roleFor("segment")).toBe("context");
      expect(spec.bindings[1]?.scopeSemantics.map((semantic) => semantic.role)).toEqual([
        "context",
        "context",
        "context",
        null,
        null,
      ]);
    }
    expect(TARGET_ACE_SPEC.supportedScopeKinds).toEqual(["route"]);
    expect(TARGET_ACE_SPEC.bindings[0]?.scopeSemantics.map((semantic) => semantic.role)).toEqual([
      "primary_outcome",
      null,
      null,
      null,
      null,
    ]);
  });

  test("derives product, feature, resolver, and metric metadata from canonical registries", () => {
    const productIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));
    const feature = getFeatureContract(ROUTE_METRIC_HISTORY_FEATURE_GRAIN);
    if (feature === null) throw new Error("Missing route metric history feature contract");
    expect(feature.resolverId).toBe("sqlite.local_route_month_trend.history.v1");
    for (const binding of TREATMENT_RELEVANCE_SPECS_V1.flatMap((spec) => spec.bindings)) {
      expect(productIds.has(binding.dataProductId)).toBe(true);
      expect(binding.dataProductId).toBe(ROUTE_METRIC_HISTORY_DATA_PRODUCT_ID);
      expect(binding.featureGrain).toBe(ROUTE_METRIC_HISTORY_FEATURE_GRAIN);
      expect(binding.resolverId).toBe(feature.resolverId);
      expect(binding).toEqual(
        expect.objectContaining(
          ROUTE_METRIC_HISTORY_METRICS[
            binding.metricId as keyof typeof ROUTE_METRIC_HISTORY_METRICS
          ],
        ),
      );
    }
  });

  test("selects the same specs and priorities for rising, falling, flat, large, small, and null-heavy values", () => {
    const fixtures = [
      { label: "rising", values: [1, 2, 3] },
      { label: "falling", values: [3, 2, 1] },
      { label: "flat", values: [2, 2, 2] },
      { label: "large", values: [1_000_000, 2_000_000, 3_000_000] },
      { label: "small", values: [0.001, 0.002, 0.003] },
      { label: "null-heavy", values: [null, null, 2] },
    ].map((fixture) => ({ ...fixture, treatmentKind: "bus_lane" as const }));
    const selections = fixtures.map((fixture) => {
      const resolution = treatmentRelevanceFor(fixture.treatmentKind);
      if (resolution.status !== "supported") throw new Error(`Unexpected ${fixture.label} block`);
      return resolution.specs.map((spec) => ({
        specId: spec.specId,
        bindings: spec.bindings.map((binding) => ({
          bindingId: binding.bindingId,
          presentationPriority: binding.presentationPriority,
        })),
      }));
    });
    expect(new Set(selections.map((selection) => JSON.stringify(selection))).size).toBe(1);
  });
});
