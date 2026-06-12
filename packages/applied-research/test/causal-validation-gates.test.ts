import { describe, expect, test } from "bun:test";
import { causalValidationGatesArtifactPath } from "../src/artifacts";
import { buildCausalValidationGatesArtifact } from "../src/causal";

describe("causal validation gates", () => {
  test("projects treatment event panel gate counts into compact gate statuses", () => {
    const artifact = buildCausalValidationGatesArtifact({
      generatedAt: "2026-06-11T00:00:00.000Z",
      releaseMonth: "2026-03",
      historyStartMonth: "2023-04",
      artifactPath: "causal-validation-gates.json",
      sourcePanelPath: "treatment-event-panel.json",
      treatmentEventPanel: {
        historyWindow: { startMonth: "2023-04", endMonth: "2026-03" },
        summary: {
          panelRowCount: 10,
          supportedRowCount: 6,
          candidateCausalEligibleRowCount: 4,
          routeCount: 5,
          eventCount: 6,
          gateStatusCounts: {
            preTrendStatus: { passes: 6 },
            placeboInTimeStatus: { passes: 5, fails: 1 },
            placeboInSpaceStatus: { not_tested: 10 },
            autocorrelationStatus: { passes: 4, not_tested: 6 },
            methodDivergenceStatus: { passes: 6 },
          },
        },
      },
    });

    expect(artifact.summary).toMatchObject({
      panelRowCount: 10,
      supportedRowCount: 6,
      candidateCausalEligibleRowCount: 4,
      passGateCount: 2,
      warnGateCount: 2,
      failGateCount: 1,
    });
    expect(Object.fromEntries(artifact.gates.map((gate) => [gate.gateId, gate.status]))).toEqual({
      pre_trend: "pass",
      placebo_in_time: "warn",
      placebo_in_space: "fail",
      autocorrelation: "warn",
      method_divergence: "pass",
    });
  });

  test("adds event-family gate rows when response-drift artifacts are present", () => {
    const artifact = buildCausalValidationGatesArtifact({
      generatedAt: "2026-06-11T00:00:00.000Z",
      releaseMonth: "2026-03",
      historyStartMonth: "2023-04",
      artifactPath: "causal-validation-gates.json",
      sourcePanelPath: "treatment-event-panel.json",
      sourceEventFamilyEffectPanelPath: "event-family-effect-panel.json",
      sourceEventFamilyResponseDriftStudyPath: "event-family-response-drift-study.json",
      treatmentEventPanel: {
        historyWindow: { startMonth: "2023-04", endMonth: "2026-03" },
        summary: {
          panelRowCount: 2,
          supportedRowCount: 2,
          candidateCausalEligibleRowCount: 2,
          routeCount: 2,
          eventCount: 2,
          gateStatusCounts: {
            preTrendStatus: { passes: 2 },
            placeboInTimeStatus: { passes: 2 },
            placeboInSpaceStatus: { passes: 2 },
            autocorrelationStatus: { passes: 2 },
            methodDivergenceStatus: { passes: 2 },
          },
        },
      },
      eventFamilyEffectPanel: {
        summary: {
          panelRowCount: 2,
          familyCount: 1,
          comparableFamilyCount: 1,
          mixedContrastCount: 0,
          corroboratedContrastCount: 2,
        },
      },
      eventFamilyResponseDriftStudy: {
        summary: {
          familyCount: 1,
          comparableFamilyCount: 1,
        },
      },
    });

    expect(artifact.summary).toMatchObject({
      passGateCount: 5,
      warnGateCount: 3,
      failGateCount: 0,
    });
    expect(Object.fromEntries(artifact.gates.map((gate) => [gate.gateId, gate.status]))).toMatchObject({
      event_family_placebos: "warn",
      temporal_transportability: "warn",
      regime_sensitivity: "warn",
    });
    expect(artifact.sourceEventFamilyEffectPanelPath).toBe("event-family-effect-panel.json");
  });

  test("owns the causal validation gates artifact path", () => {
    expect(
      causalValidationGatesArtifactPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/applied-research/2023-04_to_2026-03/2026-03/causal-validation-gates.json",
    );
  });
});
