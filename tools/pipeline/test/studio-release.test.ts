import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildStudioReleaseFromCli } from "../src/jobs/build/studio-release.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workRootRelative = join("data/working/test-studio-release");
const workRoot = fromRepoRoot(workRootRelative);
const month = "2026-03";

const schemaRelative = join(workRootRelative, "schema.sql");
const seedRelative = join(workRootRelative, "seed.sql");
const outputRelative = join(workRootRelative, "studio/release.json");
const reviewQueueRelative = join(workRootRelative, "findings/review-queue.json");
const promotedFindingsRelative = join(workRootRelative, "findings/promoted-findings.json");
const contextAppendixRelative = join(workRootRelative, "findings/context-appendix.json");

async function reset(): Promise<void> {
  await rm(workRoot, { recursive: true, force: true });
}

async function writeFile(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, body);
}

async function writeD1ExportFixture(): Promise<void> {
  const migrationNames = [
    "0000_tense_jane_foster.sql",
    "0001_funny_firelord.sql",
    "0002_whole_black_bird.sql",
    "0003_flippant_justice.sql",
  ];
  const schema = (
    await Promise.all(
      migrationNames.map((name) =>
        readFile(fromRepoRoot(join("packages/db/migrations/d1", name)), "utf8"),
      ),
    )
  ).join("\n");
  const seed = `
insert into route_readiness (
  route_id, month, route_short_name, route_long_name, readiness_status, build_eligible,
  readiness_score, speed_observation_count, speed_bus_trip_count, average_speed_mph,
  schedule_timepoint_count, shape_count, stop_count, timepoint_stop_count
) values
  ('M1', '${month}', 'M1', 'M1 Corridor', 'ready', 1, 100, 1000, 300, 6.2, 40, 3, 50, 20),
  ('M2', '${month}', 'M2', 'M2 Corridor', 'ready', 1, 100, 900, 280, 6.8, 35, 3, 48, 18);

insert into route_brief_summary (
  route_id, month, route_score, public_visible, public_visibility_reason, average_speed_mph,
  hotspot_count, total_ridership, total_transfers, ace_active, ace_violation_count,
  bus_lane_matched_lane_count, schedule_match_rate
) values
  ('M1', '${month}', 10, 1, 'fixture', 6.2, 4, 90000, 1000, 0, 0, 5, 0.9),
  ('M2', '${month}', 20, 1, 'fixture', 6.8, 3, 80000, 900, 0, 0, 3, 0.9);

insert into route_artifact (
  route_id, month, artifact_name, artifact_key, content_type, byte_length, sha256
) values
  ('M1', '${month}', 'brief.json', 'route-briefs/m1.json', 'application/json', 10, '${"a".repeat(64)}'),
  ('M2', '${month}', 'brief.json', 'route-briefs/m2.json', 'application/json', 10, '${"b".repeat(64)}');
`;

  await writeFile(fromRepoRoot(schemaRelative), schema);
  await writeFile(fromRepoRoot(seedRelative), seed);
}

function reviewQueueCandidate(routeId: "M1" | "M2") {
  return {
    candidateId: `candidate-${routeId.toLowerCase()}`,
    detectorId: "observed_reliability",
    routeId,
    reasonCode: "high_long_gap_share",
    category: "reliability",
    severity: routeId === "M1" ? "high" : "medium",
    confidence: "high",
    detectorScore: routeId === "M1" ? 91 : 83,
    claimSafeLabel: "issue_needs_review",
    claimText: `${routeId} has a high long-gap share in the release window.`,
    reviewState: "needs_review",
    evidenceRefCount: 2,
  };
}

function promotedFindingArtifact() {
  const sourceCandidate = {
    candidateId: "candidate-m1",
    detectorId: "observed_reliability",
    detectorRunId: "detector-run-m1",
    month,
    scopeKind: "route",
    scopeId: "M1",
    routeId: "M1",
    physicalId: null,
    category: "reliability",
    severity: "high",
    confidence: "high",
    detectorScore: 91,
    reasonCode: "high_long_gap_share",
    claimSafeLabel: "issue_clean",
    claimText: "M1 has a high long-gap share in the release window.",
    status: "open",
    reviewState: "needs_review",
    windowStart: null,
    windowEnd: null,
    createdAt: "2026-05-24T00:00:00.000Z",
  };

  return {
    artifactKind: "promoted_findings",
    schemaVersion: 1,
    month,
    generatedAt: "2026-05-24T00:10:00.000Z",
    promotionQueueArtifactPath: "/tmp/promotion-queue.json",
    reviewDecisionsArtifactPath: "/tmp/review-decisions.json",
    promotedFindingCount: 2,
    summary: {
      promotedFindingCount: 2,
      detectorCounts: { observed_reliability: 1, service_request_context: 1 },
      routeCount: 1,
    },
    findings: [
      {
        promotedFindingId: "promoted_finding_m1",
        sourceCandidateId: "candidate-m1",
        sourceDecisionId: "review_decision_m1",
        sourcePacketId: "packet-m1",
        detectorId: "observed_reliability",
        month,
        scopeKind: "route",
        scopeId: "M1",
        routeId: "M1",
        category: "reliability",
        severity: "high",
        confidence: "high",
        reasonCode: "high_long_gap_share",
        claimText: "M1 has a high long-gap share in the release window.",
        approvedClaimStrength: 4,
        approvedEvidenceRefs: ["evidence-m1-primary"],
        reviewer: "fixture-reviewer",
        reviewedAt: "2026-05-24T00:05:00.000Z",
        reviewRationale: "Primary reliability evidence supports a route-scoped claim.",
        sourceCandidate,
        decisionHash: "c".repeat(64),
        candidateSnapshotHash: "d".repeat(64),
        promotedFindingHash: "e".repeat(64),
      },
      {
        promotedFindingId: "promoted_finding_m1_context",
        sourceCandidateId: "candidate-m1-context",
        sourceDecisionId: "review_decision_m1_context",
        sourcePacketId: "packet-m1-context",
        detectorId: "service_request_context",
        month,
        scopeKind: "route",
        scopeId: "M1",
        routeId: "M1",
        category: "context",
        severity: "medium",
        confidence: "high",
        reasonCode: "service_request_context_slowdown",
        claimText: "M1 has slow-speed evidence during a month with substantial 311 context.",
        approvedClaimStrength: 2,
        approvedEvidenceRefs: ["evidence-m1-context"],
        reviewer: "fixture-reviewer",
        reviewedAt: "2026-05-24T00:06:00.000Z",
        reviewRationale: "Context evidence supports a non-causal route-scoped claim.",
        sourceCandidate: {
          ...sourceCandidate,
          candidateId: "candidate-m1-context",
          detectorId: "service_request_context",
          detectorScore: 87,
          category: "context",
          severity: "medium",
          reasonCode: "service_request_context_slowdown",
          claimText: "M1 has slow-speed evidence during a month with substantial 311 context.",
        },
        decisionHash: "f".repeat(64),
        candidateSnapshotHash: "0".repeat(64),
        promotedFindingHash: "1".repeat(64),
      },
    ],
  };
}

async function writeFindingArtifacts(): Promise<void> {
  await writeFile(
    fromRepoRoot(reviewQueueRelative),
    `${JSON.stringify(
      {
        artifactKind: "finding_review_queue",
        candidates: [
          reviewQueueCandidate("M1"),
          { ...reviewQueueCandidate("M1"), candidateId: "candidate-m1-context" },
          reviewQueueCandidate("M2"),
        ],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    fromRepoRoot(promotedFindingsRelative),
    `${JSON.stringify(promotedFindingArtifact(), null, 2)}\n`,
  );
  await writeFile(
    fromRepoRoot(contextAppendixRelative),
    `${JSON.stringify(
      {
        artifactKind: "finding_context_appendix",
        schemaVersion: 1,
        month,
        generatedAt: "2026-05-24T00:20:00.000Z",
        summary: {
          routeCount: 1,
          weatherAvailable: true,
          equityRouteCount: 1,
          trafficVolumeRouteCount: 1,
          currentTrafficSpeedRouteCount: 1,
          trafficVolumeSourceMonths: ["2026-02"],
          currentTrafficSpeedDays: ["2026-05-18"],
        },
        weather: {
          artifactKind: "route_month_weather_normalization_context",
          month,
          observationDayCount: 31,
          stationCount: 3,
          rainDayCount: 2,
          snowDayCount: 0,
          highWindDayCount: 1,
          normalizationStatus: "weather_context_only",
        },
        routes: [
          {
            routeId: "M1",
            weatherReliability: {
              artifactKind: "route_weather_reliability_context",
              routeId: "M1",
              sampleSupport: "sufficient_split",
              interpretation: "reference_days_still_poor",
              weatherImpactedSampleCount: 140,
              referenceSampleCount: 600,
              weatherImpactedLongGapShare: 0.32,
              referenceLongGapShare: 0.29,
              expectedWaitDeltaMinutes: 0.8,
              controlledWindowCount: 4,
              controlledWindowSampleSupport: "sufficient_split",
              controlledWindowInterpretation: "reference_days_still_poor",
              controlledReferenceSampleCount: 420,
              plannedServiceControlStatus: "available",
              plannedServiceBestMatchMethod: "mixed",
              controlledObservedToScheduledExpectedWaitRatio: 2.1,
              passengerLoadControlStatus: "available",
              controlledPassengerLoadAverageRidership: 280,
              incidentControlStatus: "available",
              controlledIncidentWeightDelta: 0.2,
            },
            equity: {
              artifactKind: "route_equity_prioritization_context",
              routeId: "M1",
              equityPriorityBand: "high",
              noVehicleHouseholdShare: 0.7,
              povertyRate: 0.21,
              publicTransitCommuterShare: 0.61,
            },
            trafficVolume: {
              artifactKind: "route_traffic_volume_context",
              routeId: "M1",
              sourceMonth: "2026-02",
              observationCount: 144,
              lagMonths: 1,
            },
            currentTrafficSpeed: {
              artifactKind: "route_current_traffic_speed_context",
              routeId: "M1",
              currentSignalDay: "2026-05-18",
              temporalRelation: "after_release",
              linkSampleCount: 3,
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

afterEach(async () => {
  await reset();
});

describe("build:studio-release promoted findings", () => {
  test("publishes approved promoted findings before review candidates and keeps audit trail", async () => {
    await reset();
    await writeD1ExportFixture();
    await writeFindingArtifacts();

    const result = await buildStudioReleaseFromCli([
      "--month",
      month,
      "--schema",
      schemaRelative,
      "--seed",
      seedRelative,
      "--output",
      outputRelative,
      "--review-queue",
      reviewQueueRelative,
      "--promoted-findings",
      promotedFindingsRelative,
      "--context-appendix",
      contextAppendixRelative,
      "--finding-limit",
      "3",
    ]);

    const release = (await Bun.file(result.outputPath).json()) as {
      findings: Array<{
        routeSlug: string;
        reasoning: Array<{ title: string; source: string }>;
        review?: {
          publicationState: string;
          reviewState: string | null;
          source: string;
          candidateId: string | null;
          detectorId: string | null;
          promotedFindingId?: string | null;
          decisionId?: string | null;
          packetId?: string | null;
          approvedEvidenceRefs?: string[];
          reviewRationale?: string | null;
          decisionHash?: string | null;
          candidateSnapshotHash?: string | null;
          promotedFindingHash?: string | null;
        };
      }>;
    };

    expect(release.findings).toHaveLength(3);
    expect(release.findings.map((finding) => finding.routeSlug)).toEqual(["m1", "m1", "m2"]);
    expect(release.findings[0]?.reasoning.map((step) => step.title)).toEqual(
      expect.arrayContaining([
        "Equity context",
        "Weather normalization",
        "Observed reliability weather split",
        "Traffic-volume context",
        "Current traffic appendix",
      ]),
    );
    expect(release.findings[2]?.reasoning.map((step) => step.title)).toEqual(
      expect.not.arrayContaining(["Traffic-volume context", "Current traffic appendix"]),
    );
    expect(release.findings[0]?.review).toMatchObject({
      publicationState: "reviewed",
      reviewState: "approved",
      source: "promoted_finding",
      candidateId: "candidate-m1",
      detectorId: "observed_reliability",
      promotedFindingId: "promoted_finding_m1",
      decisionId: "review_decision_m1",
      packetId: "packet-m1",
      approvedEvidenceRefs: ["evidence-m1-primary"],
      reviewRationale: "Primary reliability evidence supports a route-scoped claim.",
      decisionHash: "c".repeat(64),
      candidateSnapshotHash: "d".repeat(64),
      promotedFindingHash: "e".repeat(64),
    });
    expect(release.findings[1]?.review).toMatchObject({
      publicationState: "reviewed",
      source: "promoted_finding",
      candidateId: "candidate-m1-context",
    });
    expect(release.findings[2]?.review).toMatchObject({
      publicationState: "review_candidate",
      source: "detector_review_queue",
      candidateId: "candidate-m2",
    });

    const findingsProjection = (await Bun.file(
      fromRepoRoot(join(workRootRelative, "studio/findings.json")),
    ).json()) as {
      findings: Array<{
        finding: { routeSlug: string; review?: { source: string; candidateId: string | null } };
      }>;
    };
    expect(findingsProjection.findings.map((entry) => entry.finding.review?.source)).toEqual([
      "promoted_finding",
      "promoted_finding",
      "detector_review_queue",
    ]);
    expect(
      findingsProjection.findings.find((entry) => entry.finding.routeSlug === "m1")?.finding.review
        ?.candidateId,
    ).toBe("candidate-m1");
  });
});
