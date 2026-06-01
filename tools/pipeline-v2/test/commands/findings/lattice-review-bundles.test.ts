import { describe, expect, test } from "bun:test";
import {
  buildLatticeOpportunityPreviewArtifact,
  buildLatticeOpportunityRouteInputs,
  renderLatticeOpportunityPreviewHtml,
  renderLatticeOpportunityPreviewMarkdown,
} from "../../../src/commands/findings/lattice-review-bundles.ts";

const month = "2026-03";
const generatedAt = "2026-06-01T00:00:00.000Z";

function packet(input: {
  candidateId: string;
  detectorId: string;
  routeId: string;
  detectorScore: number;
  reasonCode?: string;
  evidenceObjects?: unknown[];
}) {
  return {
    candidate: {
      candidateId: input.candidateId,
      detectorId: input.detectorId,
      routeId: input.routeId,
      scopeId: input.routeId,
      category: "speed",
      detectorScore: input.detectorScore,
      reasonCode: input.reasonCode ?? "fixture_signal",
      claimText: `${input.detectorId} fixture for ${input.routeId}`,
    },
    evidenceObjects: {
      primary: input.evidenceObjects ?? [],
    },
  };
}

describe("findings lattice-review-bundles preview", () => {
  test("builds route inputs from review packets and signal features", () => {
    const result = buildLatticeOpportunityRouteInputs({
      reviewPackets: {
        packets: [
          packet({
            candidateId: "speed-q65",
            detectorId: "speed_pace_hotspot",
            routeId: "Q65",
            detectorScore: 92,
          }),
          packet({
            candidateId: "reliability-q65",
            detectorId: "observed_reliability",
            routeId: "Q65",
            detectorScore: 88,
          }),
          packet({
            candidateId: "gap-q65",
            detectorId: "intervention_gap",
            routeId: "Q65",
            detectorScore: 89,
            reasonCode: "intervention_gap",
            evidenceObjects: [{ interventionEvidenceStatus: "absent" }],
          }),
        ],
      },
      signalFeatures: {
        features: [
          {
            routeId: "Q65",
            maxHotspotScore: 77,
            permitTouchedEventCount: 2000,
            contextEventCounts: [
              {
                eventKind: "311_complaint",
                touchedEventCount: 1500,
                highConfidenceTouchCount: 800,
              },
            ],
          },
        ],
      },
    });

    const q65 = result.routes.find((route) => route.routeId === "Q65");
    expect(q65?.speedPainScore).toBe(92);
    expect(q65?.reliabilityPainScore).toBe(88);
    expect(q65?.permitContextScore).toBeGreaterThanOrEqual(75);
    expect(q65?.serviceRequestContextScore).toBeGreaterThanOrEqual(70);
    expect(q65?.interventionEvidenceStatus).toBe("absent");
    expect(result.routeSources["Q65"]?.candidateIds["speed_pace_hotspot"]).toEqual(["speed-q65"]);
  });

  test("renders local-only preview rows without publishing findings", () => {
    const artifact = buildLatticeOpportunityPreviewArtifact({
      month,
      generatedAt,
      bundleRunId: "lattice_review_bundle-2026-03-preview",
      sourceArtifacts: {
        reviewPackets: "data/artifacts/findings/2026-03/review-packets.json",
        signalFeatures: "data/artifacts/findings/2026-03/signal-features.json",
      },
      reviewPackets: {
        packets: [
          packet({
            candidateId: "speed-q65",
            detectorId: "speed_pace_hotspot",
            routeId: "Q65",
            detectorScore: 92,
          }),
          packet({
            candidateId: "reliability-q65",
            detectorId: "observed_reliability",
            routeId: "Q65",
            detectorScore: 88,
          }),
          packet({
            candidateId: "gap-q65",
            detectorId: "intervention_gap",
            routeId: "Q65",
            detectorScore: 89,
            reasonCode: "intervention_gap",
            evidenceObjects: [{ interventionEvidenceStatus: "absent" }],
          }),
          packet({
            candidateId: "speed-bx38",
            detectorId: "speed_pace_hotspot",
            routeId: "BX38",
            detectorScore: 95,
          }),
          packet({
            candidateId: "under-bx38",
            detectorId: "intervention_underperformance",
            routeId: "BX38",
            detectorScore: 91,
            reasonCode: "negative_peer_adjusted_delta",
            evidenceObjects: [
              {
                eventId: "ace:BX38:ACE:2024-09-16",
                interventionType: "automated_bus_lane_enforcement",
              },
            ],
          }),
        ],
      },
      signalFeatures: {
        features: [
          {
            routeId: "Q65",
            permitTouchedEventCount: 64,
          },
        ],
      },
    });

    expect(artifact.artifactKind).toBe("lattice_review_bundle_preview");
    expect(artifact.summary.routeInputCount).toBe(2);
    expect(artifact.summary.bundleCount).toBeGreaterThanOrEqual(1);
    expect(artifact.summary.opportunityKindCounts["underperforming_treatment_review"]).toBe(1);
    expect(artifact.note).toContain("not promoted");
    expect(artifact.previewRows.some((row) => row.routeId === "BX38")).toBeTrue();
    expect(
      artifact.previewRows.find((row) => row.routeId === "BX38")?.scoringComponents?.[
        "rawKindScore"
      ],
    ).toBeGreaterThan(0);

    const markdown = renderLatticeOpportunityPreviewMarkdown(artifact);
    expect(markdown).toContain("local-only");
    expect(markdown).toContain("Score factors");
    expect(markdown).toContain("Opportunity Mix");
    expect(markdown).toContain("Review Guidance");

    const html = renderLatticeOpportunityPreviewHtml(artifact);
    expect(html).toContain("<table>");
    expect(html).toContain("underperforming_treatment_review");
  });
});
