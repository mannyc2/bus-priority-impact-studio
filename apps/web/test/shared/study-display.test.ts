import { describe, expect, test } from "bun:test";
import {
  caveatSentence,
  ciCompactLabel,
  ciLongLabel,
  confounderMarker,
  descriptiveChangeLabel,
  findingSentence,
  implementationLineLabel,
  signedMphLabel,
  studiesByEventId,
  studyBadgeLabel,
  studyIndexRowForEventId,
  studyIndexRowsByJoinKey,
  studyMonthLabel,
  studyTone,
} from "../../src/components/study/study-display";
import type { StudyIndexRow } from "../../src/studio/api-contract";
import { gatePass, studyFixture } from "./study-fixture";

function indexRow(over: Partial<StudyIndexRow> = {}): StudyIndexRow {
  return {
    eventKey: "study-event-abc",
    routeId: "B41",
    routeSlug: "b41",
    treatmentFamily: "automated_bus_lane_enforcement",
    implementationMonth: "2024-09",
    effectMph: 0.22,
    confidenceInterval: { lowerMph: 0.06, upperMph: 0.39, iterationCount: 1000, seed: 7 },
    evaluationLevel: "segment_matched_did",
    claimTier: "gated_estimate",
    direction: "improved",
    ...over,
  };
}

describe("study display helpers", () => {
  test("formats months, effects, and long/compact CI copy", () => {
    expect(studyMonthLabel("2024-09")).toBe("Sep 2024");
    expect(signedMphLabel(0.22)).toBe("+0.22 mph");
    expect(signedMphLabel(-0.04)).toBe("−0.04 mph");
    expect(ciLongLabel({ lowerMph: 0.06, upperMph: 0.39 })).toBe("95% CI +0.06 to +0.39");
    expect(ciCompactLabel(0.22, { lowerMph: 0.06, upperMph: 0.39 })).toBe(
      "+0.22 (+0.06 to +0.39) mph",
    );
  });

  test("keys studies by registry event id", () => {
    const study = studyFixture();
    const map = studiesByEventId({
      artifactKind: "bp.studio.route_studies.v1",
      schemaVersion: 1,
      analysisMonth: "2026-03",
      routeId: "B41",
      routeSlug: "b41",
      studies: [study],
    });
    expect(map.get("ace:B41:ACE:2024-09-16")?.eventKey).toBe("study-event-abc");
    expect(studiesByEventId(null).size).toBe(0);
  });

  test("tone and badge derive from direction and scope counts only", () => {
    expect(studyTone("improved")).toBe("good");
    expect(studyTone("worsened")).toBe("bad");
    expect(studyTone("no_detectable_change")).toBe("accent");
    expect(studyBadgeLabel(studyFixture())).toBe("24 segments studied");
    const lane = studyFixture({ treatedSegmentScope: "lane_overlap_spines" });
    expect(studyBadgeLabel(lane)).toBe("24 lane segments");
  });

  test("finding sentence follows direction and control shape, never causal verbs", () => {
    expect(findingSentence(studyFixture())).toBe(
      "Speeds on treated segments rose while matched controls held flat",
    );
    expect(findingSentence(studyFixture({ direction: "no_detectable_change" }))).toBe(
      "Treated and control segments moved together before and after enforcement began",
    );
    expect(implementationLineLabel(studyFixture())).toBe("enforcement starts Sep 2024");
  });

  test("caveat sentence and chart marker appear only when a confounder gate flags", () => {
    expect(caveatSentence(studyFixture())).toBeNull();
    expect(confounderMarker(studyFixture())).toBeNull();
    const flagged = studyFixture({
      gates: {
        preTrend: gatePass,
        placeboInTime: gatePass,
        minSample: gatePass,
        controlEligibility: gatePass,
        congestionPricingOverlap: { status: "fail", reason: "post window overlaps tolling" },
        redesignOverlap: gatePass,
      },
      sensitivityEstimates: {
        congestionPricing: {
          reason: "congestion_pricing",
          excludedMonths: ["2025-01", "2025-02"],
          effectMph: 0.01,
          effectPercent: 0.1,
          confidenceInterval: { lowerMph: -0.17, upperMph: 0.19, iterationCount: 1000, seed: 7 },
        },
        queensRedesign: null,
      },
    });
    expect(caveatSentence(flagged)).toBe(
      "Excluding the months after Manhattan tolling began: +0.01 mph (95% CI −0.17 to +0.19).",
    );
    expect(confounderMarker(flagged)).toEqual({ month: "2025-01", label: "tolling starts" });
  });

  test("descriptive change falls back from effect to window means", () => {
    expect(descriptiveChangeLabel(studyFixture())).toBe("+0.22 mph");
  });

  test("index join resolves event ids by route + month and drops ambiguous keys", () => {
    const map = studyIndexRowsByJoinKey({
      artifactKind: "bp.studio.segment_study_index.v1",
      schemaVersion: 1,
      analysisMonth: "2026-03",
      studies: [
        indexRow(),
        indexRow({ eventKey: "study-event-m79", routeId: "M79+", implementationMonth: "2024-09" }),
        indexRow({ eventKey: "study-event-b44", routeId: "B44", implementationMonth: "2024-10" }),
        indexRow({
          eventKey: "study-event-b44-plus",
          routeId: "B44+",
          implementationMonth: "2024-10",
        }),
        indexRow({ eventKey: "dupe-a", routeId: "Q44", implementationMonth: "2024-11" }),
        indexRow({ eventKey: "dupe-b", routeId: "Q44", implementationMonth: "2024-11" }),
      ],
    });
    expect(studyIndexRowForEventId("ace:B41:ACE:2024-09-16", map)?.eventKey).toBe(
      "study-event-abc",
    );
    expect(studyIndexRowForEventId("ace:M79+:ACE:2024-09-29", map)?.eventKey).toBe(
      "study-event-m79",
    );
    expect(studyIndexRowForEventId("ace:B44:ACE:2024-10-01", map)?.eventKey).toBe(
      "study-event-b44",
    );
    expect(studyIndexRowForEventId("ace:B44+:ACE:2024-10-01", map)?.eventKey).toBe(
      "study-event-b44-plus",
    );
    expect(studyIndexRowForEventId("ace:Q44:ACE:2024-11-01", map)).toBeUndefined();
    expect(studyIndexRowForEventId(undefined, map)).toBeUndefined();
    expect(studyIndexRowForEventId("malformed", map)).toBeUndefined();
  });
});
