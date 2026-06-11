import { describe, expect, test } from "bun:test";
import {
  buildHistoryWindow,
  combineResearchQualityScore,
  createStudyDefinition,
  grainDescriptor,
  isAtLeastAsFineGrain,
  monthRange,
  previousMonth,
} from "@bp/applied-research";

describe("applied research core", () => {
  test("builds explicit history windows without implying missing months are clean", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);

    expect(
      buildHistoryWindow({
        startMonth: "2025-11",
        endMonth: "2026-02",
        availableMonths: ["2025-11", "2026-01"],
      }),
    ).toEqual({
      startMonth: "2025-11",
      endMonth: "2026-02",
      months: ["2025-11", "2025-12", "2026-01", "2026-02"],
      complete: false,
      missingMonths: ["2025-12", "2026-02"],
    });
  });

  test("marks coarse clean no-hit grains as requiring richer-grain shadow audit", () => {
    expect(grainDescriptor("route-month").cleanNoHitRequiresShadowAudit).toBe(true);
    expect(grainDescriptor("stop-direction-hour").cleanNoHitRequiresShadowAudit).toBe(false);
    expect(isAtLeastAsFineGrain("stop-direction-hour", "route-month")).toBe(true);
    expect(isAtLeastAsFineGrain("route-month", "stop-direction-hour")).toBe(false);
  });

  test("combines research quality scores with explicit missing components and veto caps", () => {
    const score = combineResearchQualityScore({
      components: {
        corpusCoverage: 1000,
        grainFidelity: 900,
        evidenceCompleteness: 800,
      },
      vetoCaps: [
        {
          code: "route_month_clean_no_hit_requires_shadow",
          cap: 500,
          reason: "Route-month clean no-hit cannot hide richer-grain candidates.",
        },
      ],
    });

    expect(score.weightedScore).toBeCloseTo(897.3, 1);
    expect(score.gatedScore).toBe(500);
    expect(score.missingComponents).toContain("claimDiscipline");
    expect(score.missingComponents).toContain("mechanismCorroboration");
    expect(score.missingComponents).toContain("searchPreservation");
    expect(score.missingComponents).toContain("placeboStrength");
    expect(score.missingComponents).toContain("temporalTransportability");
    expect(score.missingComponents).toContain("regimeSensitivity");
  });

  test("requires studies to declare purpose, grain, and artifact outputs", () => {
    const historyWindow = buildHistoryWindow({
      startMonth: "2023-04",
      endMonth: "2026-03",
      availableMonths: monthRange("2023-04", "2026-03"),
    });

    expect(
      createStudyDefinition({
        id: "detector-evaluation-2026-03",
        purpose: "Evaluate detector quality for the release month.",
        methodKind: "evaluation",
        releaseMonth: "2026-03",
        historyWindow,
        requiredGrains: ["route-month", "stop-direction-hour"],
        outputArtifacts: ["detector-evaluation"],
      }),
    ).toMatchObject({
      id: "detector-evaluation-2026-03",
      methodKind: "evaluation",
      releaseMonth: "2026-03",
    });
  });
});
