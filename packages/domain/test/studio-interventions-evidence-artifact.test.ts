import { describe, expect, test } from "bun:test";
import { decodeStrict } from "../src/decode.js";
import {
  buildStudioInterventionsEvidenceArtifact,
  compactInterventionsEvidenceBundle,
  StudioRouteEvidenceBundleV1Schema,
} from "../src/studio/route-evidence.js";

function bundleFixture() {
  return decodeStrict(StudioRouteEvidenceBundleV1Schema)({
    routeId: "M15+",
    routeSlug: "m15-sbs",
    wikiRouteRecordId: "route_m15",
    wikiRouteIds: ["route_m15"],
    wikiAliases: [],
    coverage: {
      timelineCount: 1,
      interventionCount: 1,
      metricClaimCount: 1,
      projectCount: 0,
      sourceGapCount: 0,
      citationCount: 2,
    },
    timeline: [
      {
        recordId: "event_m15_sbs_launch",
        recordKind: "operational_event",
        citationKeys: ["m15_report#block-1"],
        eventKind: "sbs_launch",
        eventFamily: "select_bus_service",
        lifecyclePhase: "implemented",
        title: "M15 SBS launch",
        description: "Select Bus Service began.",
        dateText: "October 2010",
        dateNormalized: "2010-10-01",
        datePrecision: "month",
      },
    ],
    interventions: [
      {
        recordId: "treatment_m15_bus_lane",
        recordKind: "treatment",
        citationKeys: ["m15_report#block-1"],
        treatmentKind: "bus_lane",
        treatmentFamily: "bus_lane_infrastructure",
        title: "First Avenue bus lane",
        description: null,
        locations: ["First Avenue"],
        projectRecordIds: ["project_m15"],
      },
    ],
    metricClaims: [
      {
        recordId: "claim_m15_speed",
        recordKind: "metric_claim",
        citationKeys: ["m15_report#block-1"],
        metricName: "speed",
        rawValue: "18%",
        value: 18,
        unit: "percent",
        period: "2010-2011",
        scope: "corridor",
        description: "Agency-stated speed gain.",
      },
    ],
    projects: [],
    sourceGaps: [],
    citations: [
      {
        key: "m15_report#block-1",
        sourceId: "m15_report",
        blockId: "block-1",
        evidenceId: "evidence-1",
        sourcePath: "sources/m15_report.pdf",
        pageNumber: 4,
        sourceTitle: "M15 SBS report",
        publisher: "NYC DOT",
        sourceUrl: "https://example.test/m15-sbs-report",
      },
      {
        key: "unreferenced#block-9",
        sourceId: "other_report",
        blockId: "block-9",
        evidenceId: "evidence-9",
        sourcePath: "sources/other.pdf",
      },
    ],
  });
}

describe("interventions evidence artifact", () => {
  test("keeps only the fields and citations the citywide ledger renders", () => {
    const compact = compactInterventionsEvidenceBundle(bundleFixture());

    expect(compact.routeSlug).toBe("m15-sbs");
    expect(Object.keys(compact)).not.toContain("metricClaims");
    expect(compact.timeline[0]?.recordId).toBe("event_m15_sbs_launch");
    expect(Object.keys(compact.timeline[0] ?? {})).not.toContain("datePrecision");
    expect(Object.keys(compact.timeline[0] ?? {})).not.toContain("recordKind");
    expect(Object.keys(compact.interventions[0] ?? {})).not.toContain("projectRecordIds");

    // Unreferenced citations are dropped; referenced ones lose their block plumbing.
    expect(compact.citations.map((citation) => citation.key)).toEqual(["m15_report#block-1"]);
    expect(compact.coverage.citationCount).toBe(1);
    expect(Object.keys(compact.citations[0] ?? {})).not.toContain("sourcePath");
    expect(Object.keys(compact.citations[0] ?? {})).not.toContain("blockId");
    expect(compact.citations[0]?.sourceTitle).toBe("M15 SBS report");
  });

  test("orders bundles by route slug so the artifact is byte-stable", () => {
    const artifact = buildStudioInterventionsEvidenceArtifact({
      generatedAt: "2026-07-26T00:00:00.000Z",
      bundles: [
        { ...bundleFixture(), routeId: "Q10", routeSlug: "q10" },
        bundleFixture(),
        { ...bundleFixture(), routeId: "B62", routeSlug: "b62" },
      ],
    });

    expect(artifact.routeCount).toBe(3);
    expect(artifact.bundles.map((bundle) => bundle.routeSlug)).toEqual(["b62", "m15-sbs", "q10"]);
  });
});
