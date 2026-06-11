import { describe, expect, test } from "bun:test";
import { listFeatureContracts } from "@bp/analytics/features";
import {
  detectorInputFeatureResolverSupport,
  listDetectorInputFeatureResolverIds,
} from "../src/detector-runs/detector-input-assembly";

describe("detector input assembly feature resolver support (S1.1 seam)", () => {
  test("covers every kernel feature contract — no declared grain falls through to unsupported", () => {
    const uncovered = listFeatureContracts()
      .filter(
        (contract) =>
          detectorInputFeatureResolverSupport(contract.resolverId).status === "unsupported",
      )
      .map((contract) => `${contract.featureGrain} (${contract.resolverId})`);

    expect(uncovered).toEqual([]);
  });

  test("derives resolved vs quality-carried from detector input resolver registrations", () => {
    const registeredResolverIds = listDetectorInputFeatureResolverIds();

    // The two quality-carried grains have no dedicated row resolver.
    expect(detectorInputFeatureResolverSupport("embedded.feature_quality.v1").status).toBe(
      "satisfied_by_feature_quality",
    );
    expect(detectorInputFeatureResolverSupport("sqlite.source_coverage.v1").status).toBe(
      "satisfied_by_feature_quality",
    );
    // Representative artifact, computed-artifact, and local-row registrations resolve.
    expect(registeredResolverIds).toContain("artifact.intervention_panel.v1");
    expect(registeredResolverIds).toContain("artifact.positive_deviance.v1");
    expect(detectorInputFeatureResolverSupport("artifact.intervention_panel.v1").status).toBe(
      "resolved",
    );
    expect(detectorInputFeatureResolverSupport("artifact.positive_deviance.v1").status).toBe(
      "resolved",
    );
    expect(
      detectorInputFeatureResolverSupport("sqlite.local_route_segment_speed.segment_daypart.v1")
        .status,
    ).toBe("resolved");
    // An unregistered resolver id is unsupported.
    expect(detectorInputFeatureResolverSupport("sqlite.not_a_real_resolver.v1").status).toBe(
      "unsupported",
    );
  });
});
