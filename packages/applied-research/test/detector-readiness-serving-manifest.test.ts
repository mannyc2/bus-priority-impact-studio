import { describe, expect, test } from "bun:test";
import { buildDetectorReadinessServingManifest } from "../src/evaluation";

describe("detector readiness serving manifest", () => {
  test("projects calibrated readiness into compact route-addressable refs and counts", () => {
    const manifest = buildDetectorReadinessServingManifest({
      generatedAt: "2026-06-08T00:00:00.000Z",
      releaseMonth: "2026-03",
      sourceEvaluations: [{ detectorFamily: "fixture", path: "eval.json" }],
      sourceProjections: [
        {
          path: "treatment-readiness.json",
          projection: {
            artifactKind: "treatment_scope_readiness_projection",
            schemaVersion: 1,
            generatedAt: "2026-06-07T00:00:00.000Z",
            releaseMonth: "2026-03",
            items: [
              {
                identityKey: "treatment_scope_gap\0M15:a-b",
                detectorId: "treatment_scope_gap",
                routeId: "M15",
                scopeId: "M15:a-b",
                bucket: "public_finding_candidate",
                reviewedFrontendUse: "primary_finding",
                emittedCandidate: true,
                geometrySourceConfirmed: true,
                reasonCode: "confirmed_uncovered",
                caveats: ["geometry_confirmed"],
                label: {
                  candidateId: "gap-1",
                  packetFile: "packets/gap-1.md",
                  rationale: "Long reviewer rationale should stay out of serving output.",
                  revisedClaimText: "Raw claim text should stay out of serving output.",
                },
                candidate: {
                  candidateId: "gap-1",
                  month: "2026-03",
                  rawMetricBlob: { treatmentOverlapShare: 0.01 },
                },
              },
              {
                detectorId: "treatment_scope_mismatch",
                routeId: "M15",
                scopeId: "M15:c-d",
                bucket: "review_queue",
                reviewedFrontendUse: "needs_more_evidence",
                reasonCode: "geometry_ambiguous",
                caveats: ["geometry_unavailable"],
                candidate: { candidateId: "mismatch-1", month: "2026-03" },
              },
            ],
          },
        },
        {
          path: "cjtp-readiness.json",
          projection: {
            artifactKind: "customer_journey_readiness_projection",
            schemaVersion: 1,
            generatedAt: "2026-06-07T01:00:00.000Z",
            releaseMonth: "2026-03",
            asOfMonth: "2026-04",
            summary: {
              coverageSkippedCount: 3,
              unreviewedSuppressedCoverageCount: 1,
            },
            items: [
              {
                detectorId: "customer_journey_shortfall",
                routeId: "M15",
                scopeId: "M15|weekday_peak",
                bucket: "route_context",
                reviewedFrontendUse: "route_context",
                reasonCode: "component_ambiguous",
                rootCauseTags: ["composite_metric_ambiguous", "wait_component_driven"],
                candidate: {
                  candidateId: "cjtp-1",
                  month: "2026-04",
                  rawMetricBlob: { customers: 100000, cjtp: 0.57 },
                },
              },
              {
                detectorId: "customer_journey_shortfall",
                routeId: "M14D",
                scopeId: "M14D|offpeak",
                bucket: "suppressed",
                reviewedFrontendUse: "suppress",
                reasonCode: "low_exposure",
                rootCauseTags: ["low_exposure"],
                candidate: { candidateId: "cjtp-2", month: "2026-04" },
              },
            ],
          },
        },
      ],
    });

    expect(manifest.summary).toMatchObject({
      routeCount: 2,
      publicFindingCandidateRefCount: 1,
      routeContextRefCount: 1,
      reviewQueueItemCount: 1,
      suppressedItemCount: 1,
      coverageSkippedCount: 3,
      unreviewedSuppressedCoverageCount: 1,
    });

    const m15 = manifest.routes.find((route) => route.routeId === "M15");
    expect(m15?.counts).toMatchObject({
      public_finding_candidate: 1,
      route_context: 1,
      review_queue: 1,
      suppressed: 0,
    });
    expect(m15?.publicFindingCandidateRefs).toEqual([
      {
        detectorId: "treatment_scope_gap",
        routeId: "M15",
        scopeId: "M15:a-b",
        month: "2026-03",
        asOfMonth: null,
        bucket: "public_finding_candidate",
        reviewedFrontendUse: "primary_finding",
        evidenceRefPath: "packets/gap-1.md",
        sourceProjectionPath: "treatment-readiness.json",
        readinessReason: "confirmed_uncovered; geometry_confirmed; primary_finding",
        caveats: ["geometry_confirmed"],
      },
    ]);
    expect(m15?.routeContextRefs[0]).toMatchObject({
      detectorId: "customer_journey_shortfall",
      bucket: "route_context",
      month: "2026-04",
      asOfMonth: "2026-04",
      caveats: ["composite_metric_ambiguous", "wait_component_driven"],
    });
    expect(m15?.reviewQueueCounts).toEqual({ treatment_scope_mismatch: 1 });
    expect(m15?.suppressedCounts).toEqual({});

    const encoded = JSON.stringify(manifest);
    expect(encoded).not.toContain("rawMetricBlob");
    expect(encoded).not.toContain("treatmentOverlapShare");
    expect(encoded).not.toContain("Long reviewer rationale");
    expect(encoded).not.toContain("Raw claim text");
    expect(encoded).not.toContain("candidateId");
  });

  test("omits unrouteable rows from route summaries while tracking the omission", () => {
    const manifest = buildDetectorReadinessServingManifest({
      generatedAt: "2026-06-08T00:00:00.000Z",
      releaseMonth: "2026-03",
      sourceProjections: [
        {
          path: "projection.json",
          projection: {
            artifactKind: "fixture_projection",
            schemaVersion: 1,
            generatedAt: "2026-06-07T00:00:00.000Z",
            releaseMonth: "2026-03",
            items: [
              {
                detectorId: "fixture_detector",
                routeId: null,
                scopeId: "system-only",
                bucket: "route_context",
              },
            ],
          },
        },
      ],
    });

    expect(manifest.summary.omittedNoRouteItemCount).toBe(1);
    expect(manifest.routes).toEqual([]);
    expect(manifest.summary.routeContextRefCount).toBe(0);
  });
});
