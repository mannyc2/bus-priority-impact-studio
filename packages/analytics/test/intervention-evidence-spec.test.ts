import { describe, expect, test } from "bun:test";
import { DATA_PRODUCT_MANIFEST, DataProductManifestSchema } from "@bp/analytics/data-products";
import { getFeatureContract, ROUTE_METRIC_HISTORY_FEATURE_GRAIN } from "@bp/analytics/features";
import {
  INTERVENTION_ANALYSIS_DISPOSITIONS_V1,
  INTERVENTION_EVIDENCE_SPECS,
  InterventionEvidenceSpecSchema,
  interventionEvidenceSpecFor,
  validateInterventionEvidenceRegistry,
} from "@bp/analytics/intervention-evidence";
import {
  STUDIO_INTERVENTION_TREATMENT_KINDS,
  type StudioInterventionTreatmentKind,
} from "@bp/domain/studio";
import { Schema } from "effect";

const StrictParseOptions = { onExcessProperty: "error" } as const;

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Assert<Value extends true> = Value;
type LookupInputIsCanonicalKind = Assert<
  Equal<Parameters<typeof interventionEvidenceSpecFor>[0], StudioInterventionTreatmentKind>
>;
const lookupInputIsCanonicalKind: LookupInputIsCanonicalKind = true;

describe("intervention evidence registry", () => {
  test("strictly decodes the single ACE spec and the expanded product manifest", () => {
    expect(lookupInputIsCanonicalKind).toBe(true);
    expect(INTERVENTION_EVIDENCE_SPECS).toHaveLength(1);
    expect(() =>
      Schema.decodeUnknownSync(InterventionEvidenceSpecSchema)(
        INTERVENTION_EVIDENCE_SPECS[0],
        StrictParseOptions,
      ),
    ).not.toThrow();
    expect(() =>
      Schema.decodeUnknownSync(DataProductManifestSchema)(
        DATA_PRODUCT_MANIFEST,
        StrictParseOptions,
      ),
    ).not.toThrow();
    expect(() => validateInterventionEvidenceRegistry()).not.toThrow();
  });

  test("fixes value-blind binding order, roles, labels, and route display window", () => {
    const spec = INTERVENTION_EVIDENCE_SPECS[0];
    expect(spec.analysisFamily).toBe("automated_bus_lane_enforcement");
    expect(spec.effectClaimPolicy).toBe("gated_study_artifact_only");
    expect(spec.bindings).toEqual([
      expect.objectContaining({
        bindingId: "route_speed_around_implementation_v1",
        metricId: "route_average_speed_mph",
        sourceField: "average_speed_mph",
        label: "Observed average speed",
        unit: "mph",
        role: "primary_outcome",
        claimCeiling: "descriptive_observation",
        presentationPriority: 1,
        window: { monthsBefore: 12, monthsAfter: 12, includeAnchorMonth: true },
      }),
      expect.objectContaining({
        bindingId: "route_ridership_around_implementation_v1",
        metricId: "route_monthly_ridership",
        sourceField: "ridership",
        label: "Monthly riders",
        unit: "riders",
        role: "context",
        claimCeiling: "descriptive_observation",
        presentationPriority: 2,
        window: { monthsBefore: 12, monthsAfter: 12, includeAnchorMonth: true },
      }),
    ]);
  });

  test("references only live products and the live route metric history resolver", () => {
    const productIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));
    const feature = getFeatureContract(ROUTE_METRIC_HISTORY_FEATURE_GRAIN);
    expect(feature?.resolverId).toBe("sqlite.local_route_month_trend.history.v1");
    for (const binding of INTERVENTION_EVIDENCE_SPECS.flatMap((spec) => spec.bindings)) {
      expect(productIds.has(binding.dataProductId)).toBe(true);
      expect(binding.featureGrain).toBe(ROUTE_METRIC_HISTORY_FEATURE_GRAIN);
      expect(binding.resolverId).toBe(feature?.resolverId);
    }
    expect(productIds.has("studio_intervention_observation_route_bundles")).toBe(true);
    expect(productIds.has("studio_intervention_observation_index")).toBe(true);
  });

  test("has one reviewed disposition for every Plan 091 presentation kind", () => {
    expect(Object.keys(INTERVENTION_ANALYSIS_DISPOSITIONS_V1).sort()).toEqual(
      [...STUDIO_INTERVENTION_TREATMENT_KINDS].sort(),
    );
    for (const kind of STUDIO_INTERVENTION_TREATMENT_KINDS) {
      expect(INTERVENTION_ANALYSIS_DISPOSITIONS_V1[kind]).toBeDefined();
    }
  });

  test("supports only canonical ACE and keeps other families explicitly unsupported", () => {
    expect(interventionEvidenceSpecFor("automated_bus_lane_enforcement")).toEqual({
      status: "supported",
      analysisFamily: "automated_bus_lane_enforcement",
      specId: "automated_bus_lane_enforcement_route_observations_v1",
      spec: INTERVENTION_EVIDENCE_SPECS[0],
    });
    for (const kind of ["bus_lane", "route_redesign", "other_documented"] as const) {
      expect(interventionEvidenceSpecFor(kind)).toEqual({
        status: "unsupported_treatment_family",
        analysisFamily: null,
        reasonId: "not_reviewed_for_observation_v1",
        spec: null,
      });
    }
  });
});
