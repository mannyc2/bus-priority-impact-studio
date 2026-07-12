import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { RouteTreatmentInterventionEventRow } from "@bp/analytics/interventions";
import type { WikiOperationalDateAssertion } from "@bp/domain/documents/operational-date";
import type { StudyEventApprovalArtifact } from "@bp/domain/studio/study";
import { loadStudyEventRegistryRows } from "../../src/lib/local-db-aggregates/study-event-rows.ts";
import {
  type BuildStudyEventMergeInput,
  buildStudyEventMergeArtifact,
  type PinnedWikiStudyInput,
} from "../../src/lib/study-engine/study-events.ts";

function registryEvent(
  overrides: Partial<RouteTreatmentInterventionEventRow> = {},
): RouteTreatmentInterventionEventRow {
  return {
    event_id: "registry-m15-lane",
    route_id: "M15",
    intervention_type: "bus_lane",
    source_id: "nyc_dot_bus_lanes",
    program: "NYC DOT bus lanes",
    implementation_date: "2010-10-10",
    implementation_month: "2010-10",
    event_status: "implemented",
    description: "M15 bus lane implementation",
    ...overrides,
  };
}

function wikiAssertion(
  overrides: Partial<WikiOperationalDateAssertion> = {},
): WikiOperationalDateAssertion {
  return {
    surfaceId: "wiki-anchor-m15-lane",
    sourceId: "m15_progress_report",
    sourceTitle: "M15 Select Bus Service Progress Report",
    sourceGroup: "mta-wiki",
    displayLabel: "M15 bus lanes",
    eventName: "M15 SBS launch",
    treatmentText: "bus_lane",
    locationText: "First and Second Avenues",
    operationalDate: "October 10, 2010",
    datePrecision: "day",
    statusRaw: "implemented",
    familyRaw: "implementation",
    subtypeRaw: "launch",
    eventKind: "physical_bus_priority_change",
    interventionFamily: "bus_lane",
    sourceStatedStatus: "done",
    dateBasis: "source_stated_complete",
    validationState: "source_stated_operational_date",
    trustedOperationalDate: true,
    classificationReasons: ["source states a realized operational date"],
    evidenceRefs: [
      {
        recordId: "event_m15-sbs-launch-20101010",
        sourceId: "m15_progress_report",
        evidenceId: "m15_progress_report#p003_c0003",
        blockId: "p003_c0003",
        pageNumber: 3,
        roleRaw: "operational_date",
      },
    ],
    effectiveDateStart: "2010-10-10",
    effectiveDateEnd: "2010-10-10",
    implementationMonth: "2010-10",
    normalizedPrecision: "day",
    isRealizedOnset: true,
    routeIds: ["M15"],
    routeIdentityValidationState: "confirmed_in_current_gtfs",
    routeResolutionTier: "direct_event_text",
    interventionId: "wiki-change-m15-lane",
    evidenceSourceIds: ["m15_progress_report"],
    sourceCount: 1,
    confidence: 1,
    causalAnchorEligible: true,
    producer: "mta-wiki",
    producerSchemaVersion: 1,
    producerStudyEligible: true,
    operationalChangeId: "wiki-change-m15-lane",
    dateRole: "realized_operational",
    lifecyclePhase: "launched",
    routeScopeResolution: "direct",
    treatmentScopeResolution: "direct",
    scopeResolution: "direct",
    treatmentRecordIds: ["treatment_m15-bus-lanes"],
    treatmentFamilies: ["bus_lane"],
    conflictStates: [],
    exclusionReasons: [],
    evidenceCoverage: {
      event: true,
      timeline: true,
      routeScope: true,
      treatmentScope: true,
    },
    candidateOperationalDatesNormalized: ["2010-10-10"],
    statusAsOfDates: [],
    assertionStatuses: ["implemented"],
    truthStatus: "source_stated",
    truthStatuses: ["source_stated"],
    reviewState: "accepted",
    sourceAuthority: "official_public_agency",
    sourcePublishers: ["Metropolitan Transportation Authority"],
    wikiReleaseId: "wiki-release-1",
    wikiGeneratorCommit: "0123456789abcdef",
    wikiManifestSha256: "manifest-sha",
    wikiAnchorArtifactPath: "operational_anchors.jsonl",
    wikiAnchorArtifactSha256: "artifact-sha",
    wikiAnchorId: "wiki-anchor-m15-lane",
    wikiAnchorIds: ["wiki-anchor-m15-lane"],
    wikiEventRecordId: "event_m15-sbs-launch-20101010",
    wikiTimelineRelationRecordIds: ["relation_m15-has-launch"],
    wikiProjectRecordIds: ["project_m15-sbs"],
    wikiSubjectRecordIds: ["treatment_m15-bus-lanes"],
    wikiRouteRecordIds: ["route_m15"],
    wikiUnmatchedRouteRecordIds: [],
    wikiSourceIds: ["m15_progress_report"],
    ...overrides,
  };
}

function pinnedWiki(assertions: readonly WikiOperationalDateAssertion[]): PinnedWikiStudyInput {
  return {
    releaseId: "wiki-release-1",
    manifestSha256: "manifest-sha",
    artifactSha256: "artifact-sha",
    assertions,
  };
}

function build(input: Partial<BuildStudyEventMergeInput> = {}) {
  return buildStudyEventMergeArtifact({
    registryEvents: [],
    wiki: null,
    withoutWikiAnchors: true,
    ...input,
  });
}

describe("study-event candidate merge", () => {
  test("fails loudly when the local registry table is absent and loads all rows deterministically", () => {
    const sqlite = new Database(":memory:");
    try {
      expect(() => loadStudyEventRegistryRows({ sqlite })).toThrow(
        "Required study-event registry table is missing",
      );
      sqlite.exec(`
        CREATE TABLE local_intervention_event (
          event_id TEXT NOT NULL,
          route_id TEXT NOT NULL,
          intervention_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          program TEXT NOT NULL,
          implementation_date TEXT NOT NULL,
          implementation_month TEXT NOT NULL,
          event_status TEXT NOT NULL,
          description TEXT NOT NULL
        );
        INSERT INTO local_intervention_event VALUES
          ('event-z', 'M15', 'bus_lane', 'nyc_dot_bus_lanes', 'DOT', '2010-10-10', '2010-10', 'implemented', 'lane'),
          ('event-a', 'Bx41', 'off_board_fare_collection', 'mta_ace_routes', 'MTA', '2013-06-30', '2013-06', 'implemented', 'fare');
      `);

      expect(loadStudyEventRegistryRows({ sqlite }).map((row) => row.event_id)).toEqual([
        "event-a",
        "event-z",
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("accepts only implemented events from the trusted registry allowlist", () => {
    const artifact = build({
      registryEvents: [
        registryEvent(),
        registryEvent({
          event_id: "retired",
          source_id: "tier2_document_operational_date_assertions",
        }),
        registryEvent({ event_id: "proposal", event_status: "proposed" }),
      ],
    });

    expect(artifact.candidates).toHaveLength(1);
    expect(artifact.candidates[0]?.routeId).toBe("M15");
    expect(artifact.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceEventId: "retired",
          reasons: ["untrusted_or_retired_registry_source"],
        }),
        expect.objectContaining({
          sourceEventId: "proposal",
          reasons: ["registry_event_not_implemented"],
        }),
      ]),
    );
  });

  test("requires a pinned Wiki input unless an explicit opt-out is recorded", () => {
    expect(() =>
      buildStudyEventMergeArtifact({
        registryEvents: [],
        wiki: null,
        withoutWikiAnchors: false,
      }),
    ).toThrow("Pinned Wiki operational anchors are required");
    expect(() =>
      buildStudyEventMergeArtifact({
        registryEvents: [],
        wiki: pinnedWiki([]),
        withoutWikiAnchors: true,
      }),
    ).toThrow("Cannot provide pinned Wiki anchors");

    expect(build().wikiInput.mode).toBe("explicit_opt_out");
  });

  test("never upgrades an ineligible producer assertion locally", () => {
    const artifact = build({
      wiki: pinnedWiki([
        wikiAssertion({
          producerStudyEligible: false,
          causalAnchorEligible: false,
          normalizedPrecision: "year",
          effectiveDateStart: "2010-01-01",
          effectiveDateEnd: "2010-12-31",
          implementationMonth: null,
          dateRole: "planned_operational",
          isRealizedOnset: false,
          evidenceCoverage: {
            event: true,
            timeline: false,
            routeScope: true,
            treatmentScope: true,
          },
          exclusionReasons: ["imprecise_operational_date", "non_realized_operational_date"],
        }),
      ]),
      withoutWikiAnchors: false,
    });

    expect(artifact.candidates).toHaveLength(0);
    expect(artifact.rejections[0]?.reasons).toEqual(
      expect.arrayContaining([
        "producer_study_ineligible",
        "importer_causal_ineligible",
        "local_causal_eligibility_failed",
        "imprecise_operational_date",
        "non_realized_operational_date",
      ]),
    );
  });

  test("fails closed when assertion provenance disagrees with the pinned Wiki release", () => {
    expect(() =>
      build({
        wiki: pinnedWiki([wikiAssertion({ wikiManifestSha256: "different-manifest" })]),
        withoutWikiAnchors: false,
      }),
    ).toThrow("Pinned Wiki assertion provenance mismatch");
  });

  test("deduplicates exact registry and Wiki anchors while preserving provenance", () => {
    const artifact = build({
      registryEvents: [registryEvent()],
      wiki: pinnedWiki([wikiAssertion()]),
      withoutWikiAnchors: false,
    });

    expect(artifact.candidates).toHaveLength(1);
    expect(artifact.summary.exactDeduplicationCount).toBe(1);
    expect(artifact.candidates[0]?.provenance.map((value) => value.sourceKind)).toEqual([
      "mta_wiki",
      "registry",
    ]);
  });

  test("crosswalks only explicitly off-board Wiki fare records into the study family", () => {
    const accepted = build({
      wiki: pinnedWiki([
        wikiAssertion({
          treatmentFamilies: ["fare_collection"],
          treatmentRecordIds: ["treatment_m15-off-board-fare"],
        }),
      ]),
      withoutWikiAnchors: false,
    });
    expect(accepted.candidates[0]?.treatmentFamily).toBe("off_board_fare_collection");

    const rejected = build({
      wiki: pinnedWiki([
        wikiAssertion({
          treatmentFamilies: ["fare_collection"],
          treatmentRecordIds: ["treatment_cbd-toll-payment"],
        }),
      ]),
      withoutWikiAnchors: false,
    });
    expect(rejected.candidates).toHaveLength(0);
    expect(rejected.rejections[0]?.reasons).toContain("unsupported_or_ambiguous_treatment_family");
  });

  test("marks non-identical cross-source dates in the same month for review", () => {
    const artifact = build({
      registryEvents: [registryEvent()],
      wiki: pinnedWiki([
        wikiAssertion({
          operationalDate: "October 15, 2010",
          effectiveDateStart: "2010-10-15",
          effectiveDateEnd: "2010-10-15",
          candidateOperationalDatesNormalized: ["2010-10-15"],
        }),
      ]),
      withoutWikiAnchors: false,
    });

    expect(artifact.candidates).toHaveLength(2);
    expect(
      artifact.candidates.every((value) => value.conflictState === "same_month_review_required"),
    ).toBe(true);
    expect(artifact.conflicts).toEqual([
      expect.objectContaining({
        kind: "cross_source_same_month",
        dates: ["2010-10-10", "2010-10-15"],
      }),
    ]);
  });

  test("quarantines all Wiki assertions when one operational change has differing dates", () => {
    const artifact = build({
      wiki: pinnedWiki([
        wikiAssertion(),
        wikiAssertion({
          surfaceId: "wiki-anchor-m15-lane-second",
          wikiAnchorId: "wiki-anchor-m15-lane-second",
          wikiAnchorIds: ["wiki-anchor-m15-lane-second"],
          operationalDate: "October 11, 2010",
          effectiveDateStart: "2010-10-11",
          effectiveDateEnd: "2010-10-11",
          candidateOperationalDatesNormalized: ["2010-10-11"],
        }),
      ]),
      withoutWikiAnchors: false,
    });

    expect(artifact.candidates).toHaveLength(0);
    expect(artifact.rejections).toHaveLength(2);
    expect(
      artifact.rejections.every((value) => value.reasons.includes("wiki_change_date_conflict")),
    ).toBe(true);
    expect(artifact.conflicts).toEqual([
      expect.objectContaining({ kind: "wiki_date_conflict", dates: ["2010-10-10", "2010-10-11"] }),
    ]);
  });

  test("binds approval to the complete candidate set and rejects stale or partial decisions", () => {
    const awaiting = build({ registryEvents: [registryEvent()] });
    const candidateId = awaiting.candidates[0]?.candidateId;
    if (candidateId === undefined) throw new Error("Expected one candidate");

    const approval: StudyEventApprovalArtifact = {
      artifactKind: "bp.studio.study_event_approvals.v1",
      schemaVersion: 1,
      candidateSetId: awaiting.candidateSetId,
      decisions: [
        {
          candidateId,
          decision: "approved",
          reviewer: "operator@example.test",
          rationale: "Evidence and intervention scope reviewed",
        },
      ],
    };
    expect(() =>
      build({
        registryEvents: [registryEvent()],
        approval: { ...approval, candidateSetId: "stale" },
      }),
    ).toThrow("approval is stale");
    expect(() =>
      build({ registryEvents: [registryEvent()], approval: { ...approval, decisions: [] } }),
    ).toThrow("exactly one decision");

    const approved = build({ registryEvents: [registryEvent()], approval });
    expect(approved.approvalState).toBe("approved");
    expect(approved.approvedEvents.map((value) => value.candidateId)).toEqual([candidateId]);
  });

  test("allows an operator to resolve a same-month conflict but never approve both dates", () => {
    const input = {
      registryEvents: [registryEvent()],
      wiki: pinnedWiki([
        wikiAssertion({
          operationalDate: "October 15, 2010",
          effectiveDateStart: "2010-10-15",
          effectiveDateEnd: "2010-10-15",
          candidateOperationalDatesNormalized: ["2010-10-15"],
        }),
      ]),
      withoutWikiAnchors: false,
    } satisfies BuildStudyEventMergeInput;
    const awaiting = build(input);
    expect(awaiting.candidates).toHaveLength(2);
    const approveBoth: StudyEventApprovalArtifact = {
      artifactKind: "bp.studio.study_event_approvals.v1",
      schemaVersion: 1,
      candidateSetId: awaiting.candidateSetId,
      decisions: awaiting.candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        decision: "approved",
        reviewer: "operator@example.test",
        rationale: "Reviewed",
      })),
    };
    expect(() => build({ ...input, approval: approveBoth })).toThrow(
      "may approve at most one candidate",
    );

    const resolved = build({
      ...input,
      approval: {
        ...approveBoth,
        decisions: approveBoth.decisions.map((decision, index) => ({
          ...decision,
          decision: index === 0 ? "approved" : "rejected",
          rationale: index === 0 ? "Selected after source review" : "Superseded same-month date",
        })),
      },
    });
    expect(resolved.approvedEvents).toHaveLength(1);
  });

  test("is deterministic across input ordering", () => {
    const rows = [
      registryEvent(),
      registryEvent({
        event_id: "registry-bx41-fare",
        route_id: "Bx41-SBS",
        intervention_type: "off_board_fare_collection",
        implementation_date: "2013-06-30",
        implementation_month: "2013-06",
      }),
    ];

    const forward = build({ registryEvents: rows });
    const reverse = build({ registryEvents: rows.toReversed() });
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
  });
});
