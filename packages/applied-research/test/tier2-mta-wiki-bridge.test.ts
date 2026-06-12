import { describe, expect, test } from "bun:test";
import {
  buildMtaWikiTier2BridgeArtifact,
  buildMtaWikiTier2SourceAlignmentArtifact,
  renderMtaWikiTier2BridgeMarkdown,
  renderMtaWikiTier2SourceAlignmentMarkdown,
} from "../src/evaluation";

describe("mta-wiki Tier 2 bridge", () => {
  test("builds an honest review queue without marking canonical rows publishable", () => {
    const artifact = buildMtaWikiTier2BridgeArtifact({
      generatedAt: "2026-06-11T00:00:00.000Z",
      mtaWikiRoot: "/tmp/mta-wiki",
      canonicalRoot: "/tmp/mta-wiki/data/canonical",
      outputPath: "/tmp/bridge.json",
      canonical: {
        sources: [
          {
            record_id: "source_b44_report",
            record_kind: "source",
            display_name: "B44 SBS progress report",
          },
        ],
        routes: [
          {
            record_id: "route_b44-sbs",
            record_kind: "route",
            record_aliases: ["route_b44"],
            source_id: "source_b44_report",
            payload: { route_id: "B44-SBS" },
          },
        ],
        projects: [
          {
            record_id: "project_b44_sbs",
            record_kind: "project",
            source_id: "source_b44_report",
            display_name: "B44 Select Bus Service",
            payload: {
              routes_served: ["B44 SBS"],
              document_time_status: "complete",
            },
            evidence_refs: [
              {
                evidence_id: "source_b44_report#p001_c001",
                source_path: "raw/sources/source_b44_report/blocks.jsonl",
                page_number: 1,
                source_quote: "B44 Select Bus Service launched.",
              },
            ],
            truth_status: "source_stated",
            review_state: "unreviewed",
          },
        ],
        events: [
          {
            record_id: "event_b44_launch",
            record_kind: "event",
            source_id: "source_b44_report",
            payload: {
              event_family: "launch",
              date_normalized: "2013-11-17",
            },
            evidence_refs: [
              {
                evidence_id: "source_b44_report#p002_c003",
                source_path: "raw/sources/source_b44_report/blocks.jsonl",
                page_number: 2,
              },
            ],
            truth_status: "source_stated",
            review_state: "unreviewed",
          },
        ],
        treatmentComponents: [
          {
            record_id: "treatment_b44_bus_lanes",
            record_kind: "treatment_component",
            source_id: "source_b44_report",
            payload: {
              treatment_family: "bus_lane",
              description: "Dedicated bus lanes on Nostrand Avenue.",
            },
            truth_status: "source_stated",
            review_state: "unreviewed",
          },
        ],
        relations: [
          {
            record_id: "relation_b44_route_project",
            record_kind: "relation",
            source_id: "source_b44_report",
            payload: {
              relation_kind: "has_project",
              subject_id: "route_b44-sbs",
              object_id: "project_b44_sbs",
            },
            truth_status: "source_stated",
            review_state: "unreviewed",
          },
        ],
      },
    });

    expect(artifact.summary).toMatchObject({
      externalCorpus: "mta-wiki",
      publicPromotionStatus: "not_ready",
      interventionCandidateRecordCount: 3,
      reviewGroupCount: 1,
      reviewGroupsWithRoutes: 1,
      reviewGroupsWithoutRoutes: 0,
      eventReviewStateCounts: { unreviewed: 1 },
      treatmentComponentReviewStateCounts: { unreviewed: 1 },
      projectReviewStateCounts: { unreviewed: 1 },
      canonicalFactTruthStatusCounts: { source_stated: 3 },
    });
    expect(artifact.summary.promotionBlockers[0]).toContain("review_state=unreviewed");
    expect(artifact.reviewGroups[0]).toMatchObject({
      sourceId: "source_b44_report",
      sourceLabel: "B44 SBS progress report",
      routeIds: ["B44"],
      projectIds: ["project_b44_sbs"],
      eventIds: ["event_b44_launch"],
      treatmentComponentIds: ["treatment_b44_bus_lanes"],
      promotionReadiness: { status: "needs_manual_review" },
    });
    expect(artifact.reviewGroups[0]?.evidencePreviews).toHaveLength(2);

    const markdown = renderMtaWikiTier2BridgeMarkdown(artifact);
    expect(markdown).toContain("# mta-wiki Tier 2 Bridge");
    expect(markdown).toContain("public promotion status: `not_ready`");
  });

  test("aligns mta-wiki groups to Tier 2 source queue rows with exact normalized source keys", () => {
    const bridge = buildMtaWikiTier2BridgeArtifact({
      generatedAt: "2026-06-11T00:00:00.000Z",
      canonical: {
        sources: [
          {
            record_id: "source_2013-03-sbs-webster-bx-cb5",
            record_kind: "source",
            source_id: "2013_03_sbs_webster_bx_cb5",
            display_name: "Webster Avenue CB5 presentation",
          },
          {
            record_id: "source_external_only",
            record_kind: "source",
            source_id: "external_only",
            display_name: "External only source",
          },
        ],
        routes: [
          { record_id: "route_bx41-sbs", record_kind: "route", payload: { route_id: "Bx41 SBS" } },
        ],
        projects: [
          {
            record_id: "project_webster_sbs",
            record_kind: "project",
            source_id: "2013_03_sbs_webster_bx_cb5",
            payload: { routes_served: ["Bx41 SBS"] },
            evidence_refs: [
              { evidence_id: "ev-1", source_path: "raw/sources/source/blocks.jsonl" },
            ],
            truth_status: "source_stated",
            review_state: "unreviewed",
          },
          {
            record_id: "project_external",
            record_kind: "project",
            source_id: "external_only",
            payload: { routes_served: ["M15"] },
            truth_status: "source_stated",
            review_state: "unreviewed",
          },
        ],
        events: [
          {
            record_id: "event_webster_launch",
            record_kind: "event",
            source_id: "2013_03_sbs_webster_bx_cb5",
            payload: { date_normalized: "2013-06" },
            truth_status: "source_stated",
            review_state: "unreviewed",
          },
        ],
        treatmentComponents: [
          {
            record_id: "treatment_webster_bus_lane",
            record_kind: "treatment_component",
            source_id: "2013_03_sbs_webster_bx_cb5",
            payload: { treatment_family: "bus_lane" },
            truth_status: "source_stated",
            review_state: "unreviewed",
          },
        ],
        relations: [
          {
            record_id: "relation_webster_route",
            record_kind: "relation",
            source_id: "2013_03_sbs_webster_bx_cb5",
            payload: {
              subject_id: "route_bx41-sbs",
              object_id: "project_webster_sbs",
            },
          },
        ],
      },
    });

    const alignment = buildMtaWikiTier2SourceAlignmentArtifact({
      generatedAt: "2026-06-12T00:00:00.000Z",
      sourceQueuePath: "/tmp/source-queue.json",
      mtaWikiBridgePath: "/tmp/mta-wiki-bridge.json",
      mtaWikiBridge: bridge,
      sourceQueue: {
        generatedAt: "2026-06-11T00:00:00.000Z",
        items: [
          {
            queueRef: "s001",
            sourceId: "nyc_dot_select_bus_service_pdf_2013_03_sbs_webster_bx_cb5",
            sourceTitle: "Webster Avenue CB5",
            reviewLane: "record_candidate_review",
            priority: "high",
            routeIds: ["BX41"],
          },
          {
            queueRef: "s002",
            sourceId: "nyc_dot_bus_priority_document_pdf_unmatched_source",
            sourceTitle: "Unmatched",
            reviewLane: "source_disposition_review",
            priority: "low",
            routeIds: [],
          },
        ],
      },
    });

    expect(alignment.summary).toMatchObject({
      queueSourceCount: 2,
      mtaWikiReviewGroupCount: 2,
      exactAlignedSourceCount: 1,
      exactAlignedReviewGroupCount: 1,
      unalignedQueueSourceCount: 1,
      unalignedMtaWikiReviewGroupCount: 1,
      alignedInterventionCandidateRecordCount: 3,
      alignedEvidenceRefCount: 1,
      publicPromotionStatus: "not_ready",
    });
    expect(alignment.alignedSources[0]).toMatchObject({
      queueRef: "s001",
      queueSourceId: "nyc_dot_select_bus_service_pdf_2013_03_sbs_webster_bx_cb5",
      mtaWikiSourceId: "2013_03_sbs_webster_bx_cb5",
      alignmentKind: "exact_normalized_source_key",
      alignmentKeys: ["201303sbswebsterbxcb5"],
      candidateRecordCount: 3,
      promotionReadiness: { status: "needs_manual_review" },
    });
    expect(alignment.unalignedQueueSources[0]?.sourceId).toBe(
      "nyc_dot_bus_priority_document_pdf_unmatched_source",
    );
    expect(alignment.unalignedMtaWikiReviewGroups[0]?.sourceId).toBe("external_only");
    expect(alignment.summary.promotionBlockers.join("\n")).toContain("review context");

    const markdown = renderMtaWikiTier2SourceAlignmentMarkdown(alignment);
    expect(markdown).toContain("# mta-wiki Tier 2 Source Alignment");
    expect(markdown).toContain("exact aligned queue sources: 1");
  });
});
