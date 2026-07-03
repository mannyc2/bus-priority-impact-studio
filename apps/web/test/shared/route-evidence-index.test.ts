import { describe, expect, test } from "bun:test";
import { routeEvidenceIndexRows } from "../../src/components/route/route-insight-card";
import type { StudioRouteInsight } from "../../src/studio/api-contract";

function insight(input: Partial<StudioRouteInsight> = {}) {
  return {
    routeId: "B48",
    kind: "performance_annotation",
    placement: "overview",
    title: "Fixture",
    shortText: "Fixture evidence row.",
    severity: "medium",
    detectorId: "speed_pace_hotspot",
    refs: [],
    ...input,
  } satisfies StudioRouteInsight;
}

describe("route evidence index", () => {
  test("sorts public insight evidence by severity, month, detector, and scope", () => {
    const rows = routeEvidenceIndexRows([
      insight({ severity: "medium", month: "2026-02", detectorId: "z_detector", scopeId: "b" }),
      insight({ severity: "high", month: "2026-01", detectorId: "a_detector", scopeId: "a" }),
      insight({ severity: "high", month: "2026-03", detectorId: "b_detector", scopeId: "a" }),
      insight({ severity: "low", month: "2026-03", detectorId: "a_detector", scopeId: "a" }),
    ]);

    expect(rows.map((row) => `${row.severity}:${row.monthLabel}:${row.detectorLabel}`)).toEqual([
      "high:2026-03:b detector",
      "high:2026-01:a detector",
      "medium:2026-02:z detector",
      "low:2026-03:a detector",
    ]);
  });

  test("counts evidence and source refs while preserving safe caveats", () => {
    expect(
      routeEvidenceIndexRows([
        insight({
          title: "Evidence-backed row",
          detectorId: "customer_journey_shortfall",
          refs: [
            { evidenceRefPath: "findings/1.json" },
            { sourceProjectionPath: "sources/1.json" },
            { evidenceRefPath: "findings/2.json", sourceProjectionPath: "sources/2.json" },
          ],
          caveatsForTooltip: [
            "Wait-time evidence is the main contributor.",
            "fit_status:true_uncovered",
            "Reviewed as route-level evidence.",
          ],
        }),
      ])[0],
    ).toMatchObject({
      title: "Evidence-backed row",
      detectorLabel: "customer journey shortfall",
      citationLabel: "3 cited refs",
      referenceDetailLabel: "2 evidence refs / 2 source refs",
      caveats: ["Wait-time evidence is the main contributor.", "Reviewed as route-level evidence."],
    });
  });

  test("keeps source gaps as Evidence rows even without attached refs", () => {
    expect(
      routeEvidenceIndexRows([
        insight({
          detectorId: "source_gap",
          title: "Treatment source gap",
        }),
      ])[0],
    ).toMatchObject({
      section: "evidence",
      sectionLabel: "Evidence",
      citationLabel: "No cited refs",
      referenceDetailLabel: "No public refs attached",
    });
  });
});
