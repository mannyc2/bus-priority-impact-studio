import { describe, expect, test } from "bun:test";
import {
  routeInsightCardSpec,
  routeInsightMicroFigureKind,
  routeInsightSectionLabel,
} from "../../src/components/route/route-insight-card";
import type { StudioRouteInsight } from "../../src/studio/api-contract";

function insight(input: Partial<StudioRouteInsight> = {}) {
  return {
    routeId: "B48",
    kind: "performance_annotation",
    placement: "overview",
    title: "Fixture",
    shortText: "Fixture insight.",
    severity: "medium",
    detectorId: "speed_pace_hotspot",
    refs: [],
    ...input,
  } satisfies StudioRouteInsight;
}

describe("route insight card specs", () => {
  test("describes map-targeted insights as segment card cues", () => {
    expect(
      routeInsightCardSpec(
        insight({
          kind: "map_segment",
          placement: "map_segment",
          detectorId: "speed_pace_hotspot",
          refs: [
            { evidenceRefPath: "findings/1.json" },
            { sourceProjectionPath: "sources/1.json" },
          ],
        }),
      ),
    ).toEqual({
      detectorLabel: "speed pace hotspot",
      evidenceLabel: "2 cited refs",
      microFigureKind: "segment_strip",
      section: "where-when",
      sectionLabel: "Where & when",
    });
  });

  test("keeps source gaps pointed at the evidence section with coverage cues", () => {
    expect(
      routeInsightCardSpec(
        insight({
          detectorId: "source_gap",
          refs: [],
        }),
      ),
    ).toMatchObject({
      evidenceLabel: "Source gap",
      microFigureKind: "coverage_chip",
      section: "evidence",
      sectionLabel: "Evidence",
    });
  });

  test("uses timeline cues for treatment and timeline insight families", () => {
    const treatmentInsight = insight({
      kind: "treatment_scope",
      placement: "timeline",
      detectorId: "treatment_scope_gap",
    });

    expect(routeInsightMicroFigureKind(treatmentInsight)).toBe("timeline_tick");
    expect(routeInsightCardSpec(treatmentInsight)).toMatchObject({
      section: "treatments",
      sectionLabel: "Treatments & history",
    });
  });

  test("uses compact labels for evidence index section links", () => {
    expect(routeInsightSectionLabel("where-when")).toBe("Where & when");
    expect(routeInsightSectionLabel("reliability")).toBe("Reliability");
  });
});
