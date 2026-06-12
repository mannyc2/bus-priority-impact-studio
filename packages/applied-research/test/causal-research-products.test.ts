import { describe, expect, test } from "bun:test";
import {
  eventFamilyEffectPanelArtifactPath,
  eventFamilyResponseDriftStudyArtifactPath,
  eventEffectContrastArtifactPath,
  mechanismCorroborationArtifactPath,
  pulseCandidateSetArtifactPath,
  pulseEventOverlapArtifactPath,
} from "../src/artifacts";
import {
  buildEventFamilyEffectPanelArtifact,
  buildEventFamilyResponseDriftStudyArtifact,
  buildEventEffectContrastArtifact,
  buildMechanismCorroborationArtifact,
  buildPulseCandidateSetArtifact,
  buildPulseEventOverlapArtifact,
} from "../src/causal";

const treatmentEventPanel = {
  historyWindow: { startMonth: "2023-04", endMonth: "2026-03" },
  rows: [
    {
      eventId: "event-a",
      interventionType: "bus_lane_infrastructure",
      treatedScopeKind: "route",
      treatedScopeId: "M1",
      interventionDate: "2025-10-01T00:00:00.000Z",
      preWindowStart: "2025-07",
      preWindowEnd: "2025-09",
      postWindowStart: "2025-11",
      postWindowEnd: "2026-01",
      controlScopeIds: ["M2", "M3"],
      controlEligibilityStatus: "eligible",
      preTrendStatus: "passes",
      placeboInTimeStatus: "passes",
      placeboInSpaceStatus: "passes",
      autocorrelationStatus: "passes",
      methodDivergenceStatus: "passes",
      eventStudyEstimate: -0.5,
      matchedPeerDelta: -0.4,
    },
    {
      eventId: "event-c",
      interventionType: "bus_lane_infrastructure",
      treatedScopeKind: "route",
      treatedScopeId: "M4",
      interventionDate: "2023-05-01T00:00:00.000Z",
      preWindowStart: "2023-02",
      preWindowEnd: "2023-04",
      postWindowStart: "2023-06",
      postWindowEnd: "2023-08",
      controlScopeIds: ["M5", "M6"],
      controlEligibilityStatus: "eligible",
      preTrendStatus: "passes",
      placeboInTimeStatus: "passes",
      placeboInSpaceStatus: "passes",
      autocorrelationStatus: "passes",
      methodDivergenceStatus: "passes",
      eventStudyEstimate: 0.2,
      matchedPeerDelta: 0.25,
    },
    {
      eventId: "event-b",
      interventionType: "source_gap",
      treatedScopeKind: "route",
      treatedScopeId: "B1",
      interventionDate: null,
      controlScopeIds: [],
      controlEligibilityStatus: "not_evaluated",
      preTrendStatus: "not_tested",
      placeboStatus: "not_tested",
      eventStudyEstimate: null,
      matchedPeerDelta: null,
    },
  ],
};

describe("causal research products", () => {
  test("builds candidate, overlap, and contrast artifacts from treatment event panel rows", () => {
    const candidateSet = buildPulseCandidateSetArtifact({
      treatmentEventPanel,
      generatedAt: "2026-06-11T00:00:00.000Z",
      releaseMonth: "2026-03",
      historyStartMonth: "2023-04",
      artifactPath: "pulse-candidate-set.json",
      sourcePanelPath: "treatment-event-panel.json",
    });
    const overlap = buildPulseEventOverlapArtifact({
      candidateSet,
      generatedAt: "2026-06-11T00:00:00.000Z",
      artifactPath: "pulse-event-overlap.json",
      sourceCandidateSetPath: "pulse-candidate-set.json",
      segmentDaypartPanelPath: "segment-daypart-panel.json",
    });
    const contrast = buildEventEffectContrastArtifact({
      candidateSet,
      generatedAt: "2026-06-11T00:00:00.000Z",
      artifactPath: "event-effect-contrast.json",
      sourceCandidateSetPath: "pulse-candidate-set.json",
    });
    const mechanism = buildMechanismCorroborationArtifact({
      eventEffectContrast: contrast,
      generatedAt: "2026-06-11T00:00:00.000Z",
      artifactPath: "mechanism-corroboration.json",
      sourceEventEffectContrastPath: "event-effect-contrast.json",
    });
    const familyPanel = buildEventFamilyEffectPanelArtifact({
      eventEffectContrast: contrast,
      mechanismCorroboration: mechanism,
      generatedAt: "2026-06-11T00:00:00.000Z",
      artifactPath: "event-family-effect-panel.json",
      sourceEventEffectContrastPath: "event-effect-contrast.json",
      sourceMechanismCorroborationPath: "mechanism-corroboration.json",
    });
    const drift = buildEventFamilyResponseDriftStudyArtifact({
      eventFamilyEffectPanel: familyPanel,
      generatedAt: "2026-06-11T00:00:00.000Z",
      artifactPath: "event-family-response-drift-study.json",
      sourceEventFamilyEffectPanelPath: "event-family-effect-panel.json",
    });

    expect(candidateSet.summary).toMatchObject({
      candidateCount: 3,
      routeCount: 3,
      eventCount: 3,
      candidateCausalCount: 2,
      screeningEffectCount: 0,
    });
    expect(overlap.summary).toMatchObject({
      overlapRowCount: 3,
      completeWindowCount: 2,
    });
    expect(contrast.summary).toMatchObject({
      contrastCount: 2,
      candidateCausalContrastCount: 2,
      medianAbsEffectEstimateMph: 0.35,
    });
    expect(mechanism.summary).toMatchObject({
      rowCount: 2,
      familyCount: 1,
      corroboratedCount: 2,
    });
    expect(familyPanel.summary).toMatchObject({
      panelRowCount: 2,
      familyCount: 1,
      comparableFamilyCount: 1,
      contrastCount: 2,
    });
    expect(drift.summary).toMatchObject({
      familyCount: 1,
      comparableFamilyCount: 1,
      reversedFamilyCount: 1,
    });
  });

  test("owns causal research product artifact paths", () => {
    const input = {
      artifactRoot: "data/artifacts",
      historyStartMonth: "2023-04",
      releaseMonth: "2026-03",
    };
    expect(pulseCandidateSetArtifactPath(input)).toBe(
      "data/artifacts/applied-research/2023-04_to_2026-03/2026-03/pulse-candidate-set.json",
    );
    expect(pulseEventOverlapArtifactPath(input)).toBe(
      "data/artifacts/applied-research/2023-04_to_2026-03/2026-03/pulse-event-overlap.json",
    );
    expect(eventEffectContrastArtifactPath(input)).toBe(
      "data/artifacts/applied-research/2023-04_to_2026-03/2026-03/event-effect-contrast.json",
    );
    expect(mechanismCorroborationArtifactPath(input)).toBe(
      "data/artifacts/applied-research/2023-04_to_2026-03/2026-03/mechanism-corroboration.json",
    );
    expect(eventFamilyEffectPanelArtifactPath(input)).toBe(
      "data/artifacts/applied-research/2023-04_to_2026-03/2026-03/event-family-effect-panel.json",
    );
    expect(eventFamilyResponseDriftStudyArtifactPath(input)).toBe(
      "data/artifacts/applied-research/2023-04_to_2026-03/2026-03/event-family-response-drift-study.json",
    );
  });
});
