import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type ParkingCandidateQualityAudit,
  writeParkingCandidateQualityAudit,
} from "../src/jobs/audit/parking-candidate-quality.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const dbPath = fromRepoRoot(join("data/working/test-parking-candidate-quality/pipeline.sqlite"));
const artifactRoot = fromRepoRoot(join("data/working/test-parking-candidate-quality/artifacts"));

type SqlValue = string | number | null;

async function resetDb(): Promise<void> {
  await rm(dirname(dbPath), { recursive: true, force: true });
}

function insertRow(sqlite: Database, table: string, row: Record<string, SqlValue>) {
  const columns = Object.keys(row);
  sqlite
    .query(
      `INSERT INTO ${table} (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    )
    .run(...columns.map((column) => row[column] ?? null));
}

function insertParkingMatch(
  sqlite: Database,
  input: {
    locationKey: string;
    matchRank: number;
    matchKind: string;
    confidence: string;
    routeId: string;
    candidateCount: number;
    matchWeight: number;
    eventCount: number;
    violationCode?: number;
  },
) {
  insertRow(sqlite, "local_parking_violation_match", {
    location_key: input.locationKey,
    match_rank: input.matchRank,
    match_kind: input.matchKind,
    confidence: input.confidence,
    violation_code: input.violationCode ?? 5,
    violation_county: "QN",
    street_name: "JAMAICA AVE",
    intersecting_street: "MERRICK BLVD",
    physical_id: `p-${input.locationKey}-${input.matchRank}`,
    route_id: input.routeId,
    candidate_count: input.candidateCount,
    route_fanout: input.matchRank + 1,
    match_weight: input.matchWeight,
    event_count: input.eventCount,
    matched_at: "2026-05-23T00:00:00.000Z",
    evidence_json: "{}",
  });
}

afterEach(async () => {
  await resetDb();
});

describe("parking candidate quality audit", () => {
  test("classifies strict review candidates without promoting parking automatically", async () => {
    await resetDb();
    const local = await openLocalPipelineDb(dbPath);
    try {
      insertParkingMatch(local.sqlite, {
        locationKey: "camera-high",
        matchRank: 1,
        matchKind: "camera_intersection_snap",
        confidence: "high",
        routeId: "Q5",
        candidateCount: 2,
        matchWeight: 0.425,
        eventCount: 10,
      });
      insertParkingMatch(local.sqlite, {
        locationKey: "camera-high",
        matchRank: 2,
        matchKind: "camera_intersection_snap",
        confidence: "high",
        routeId: "Q6",
        candidateCount: 2,
        matchWeight: 0.425,
        eventCount: 10,
      });

      for (const routeId of ["M1", "M2", "M3", "M4"]) {
        insertParkingMatch(local.sqlite, {
          locationKey: "street-high-wide",
          matchRank: Number(routeId.slice(1)),
          matchKind: "street_code_house_range",
          confidence: "high",
          routeId,
          candidateCount: 4,
          matchWeight: 0.225,
          eventCount: 30,
          violationCode: 14,
        });
      }

      for (const routeId of ["B1", "B2", "B3"]) {
        insertParkingMatch(local.sqlite, {
          locationKey: "corridor-low",
          matchRank: Number(routeId.slice(1)),
          matchKind: "camera_street_corridor",
          confidence: "low",
          routeId,
          candidateCount: 3,
          matchWeight: 0.0666667,
          eventCount: 5,
          violationCode: 5,
        });
      }
    } finally {
      local.sqlite.close();
    }

    const result = await writeParkingCandidateQualityAudit({
      dbPath,
      artifactRoot,
      computedAt: new Date("2026-05-23T12:00:00.000Z"),
    });
    const audit = (await Bun.file(result.outputPath).json()) as ParkingCandidateQualityAudit;

    expect(result).toEqual(
      expect.objectContaining({
        recommendedDecision: "keep_release_context_only",
        matchedLocationGroups: 3,
        representedEvents: 45,
        detectorReviewCandidateGroups: 1,
        detectorReviewCandidateEvents: 10,
        weightedReleaseContextGroups: 1,
        lowConfidenceReleaseContextGroups: 1,
      }),
    );
    expect(audit.summary).toEqual(
      expect.objectContaining({
        automaticPromotionAllowed: false,
        totalCandidateRows: 9,
        maxCandidateCount: 4,
        eventWeightedP90CandidateCount: 4,
        detectorReviewCandidateEventRate: 0.222222,
      }),
    );
    expect(audit.topFanoutGroups[0]).toEqual(
      expect.objectContaining({
        locationKey: "street-high-wide",
        candidateCount: 4,
        promotionTier: "weighted_release_context",
      }),
    );
    expect(
      audit.byMatchKindConfidence.find(
        (row) => row.matchKind === "camera_intersection_snap" && row.confidence === "high",
      )?.promotionTiers.detector_review_candidate,
    ).toEqual({
      groups: 1,
      representedEvents: 10,
      eventRate: 1,
    });
  });
});
