import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { detectorEvaluationLabelsPath } from "../src/artifacts";
import { buildDetectorEvaluationLabelSetArtifact } from "../src/evaluation";
import { loadDetectorEvaluationLabelLocalDbRows } from "../src/local-db";

describe("detector evaluation labels", () => {
  test("turns clean no-hit coverage rows into derived negatives and preserves missing-data scopes", () => {
    const artifact = buildDetectorEvaluationLabelSetArtifact({
      rows: [
        {
          detector_id: "observed_reliability",
          month: "2026-03",
          scope_kind: "route",
          scope_id: "M15",
          outcome: "clean_no_hit",
          reason_code: "below_threshold",
          reason: "No finding was emitted.",
          inputs_seen_json: '{"headways":12}',
          inputs_expected_json: '{"headways":10}',
        },
        {
          detector_id: "observed_reliability",
          month: "2026-03",
          scope_kind: "route",
          scope_id: "M16",
          outcome: "skipped_missing_input",
          reason_code: "low_coverage",
          reason: "No observed headways.",
          inputs_seen_json: '{"headways":0}',
          inputs_expected_json: '{"headways":10}',
        },
        {
          detector_id: "observed_reliability",
          month: "2026-03",
          scope_kind: "route",
          scope_id: "M17",
          outcome: "hit",
          reason_code: "above_threshold",
          reason: "Finding emitted.",
          inputs_seen_json: null,
          inputs_expected_json: null,
        },
        {
          detector_id: "multi_month_speed_peer",
          month: "2026-03",
          scope_kind: "route",
          scope_id: "M18",
          outcome: "clean_no_hit",
          reason_code: "below_threshold",
          reason: "No finding was emitted.",
          inputs_seen_json: null,
          inputs_expected_json: null,
        },
      ],
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/detector-evaluation-labels.json",
      holdoutModulo: 1,
      maxCleanNoHitPerDetector: null,
      maxMissingDataScopesPerDetector: 5000,
    });

    expect(artifact.summary.confirmedNegativeCount).toBe(2);
    expect(artifact.summary.trainingNegativeCount).toBe(2);
    expect(artifact.summary.holdoutNegativeCount).toBe(0);
    expect(artifact.summary.missingDataScopeCount).toBe(1);
    expect(artifact.summary.detectorNativeOrRouteLevelLabelCount).toBe(1);
    expect(artifact.summary.screeningGrainReviewRequiredLabelCount).toBe(1);
    const observed = artifact.labels.find((label) => label.detectorId === "observed_reliability");
    const routeMonth = artifact.labels.find(
      (label) => label.detectorId === "multi_month_speed_peer",
    );
    expect(observed?.label).toBe("confirmed_negative");
    expect(observed?.grainSafety).toBe("detector_native_or_route_level");
    expect(routeMonth?.grainSafety).toBe("screening_grain_review_required");
    expect(artifact.missingDataScopes[0]?.sourceOutcome).toBe("skipped_missing_input");
    expect(artifact.missingDataScopes[0]?.grainSafety).toBe("detector_native_or_route_level");
  });

  test("loads deterministic label source rows from local SQLite coverage audit", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_finding_coverage_audit (
          detector_id TEXT NOT NULL,
          month TEXT NOT NULL,
          scope_kind TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          outcome TEXT NOT NULL,
          reason_code TEXT,
          reason TEXT,
          inputs_seen_json TEXT,
          inputs_expected_json TEXT
        );
      `);
      const insert = sqlite.prepare(`
        INSERT INTO local_finding_coverage_audit (
          detector_id,
          month,
          scope_kind,
          scope_id,
          outcome,
          reason_code,
          reason,
          inputs_seen_json,
          inputs_expected_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insert.run(
        "observed_reliability",
        "2026-03",
        "route",
        "M15",
        "clean_no_hit",
        "below_threshold",
        "No finding was emitted.",
        '{"headways":12}',
        '{"headways":10}',
      );
      insert.run(
        "observed_reliability",
        "2026-03",
        "route",
        "M16",
        "clean_no_hit",
        "below_threshold",
        "No finding was emitted.",
        null,
        null,
      );
      insert.run(
        "observed_reliability",
        "2026-03",
        "route",
        "M17",
        "skipped_missing_input",
        "low_coverage",
        "No observed headways.",
        '{"headways":0}',
        '{"headways":10}',
      );
      insert.run(
        "observed_reliability",
        "2026-03",
        "route",
        "M18",
        "skipped_failed_join",
        "join_gap",
        "No schedule join.",
        null,
        null,
      );
      insert.run(
        "observed_reliability",
        "2026-03",
        "route",
        "M19",
        "hit",
        "above_threshold",
        "Finding emitted.",
        null,
        null,
      );
      insert.run(
        "observed_reliability",
        "2026-02",
        "route",
        "M20",
        "clean_no_hit",
        "below_threshold",
        "Out of release month.",
        null,
        null,
      );

      const { rows } = loadDetectorEvaluationLabelLocalDbRows({
        sqlite,
        releaseMonth: "2026-03",
        maxCleanNoHitPerDetector: 1,
        maxMissingDataScopesPerDetector: 1,
      });

      expect(rows.map((row) => [row.outcome, row.scope_id])).toEqual([
        ["clean_no_hit", "M15"],
        ["skipped_failed_join", "M18"],
        ["skipped_missing_input", "M17"],
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("owns the detector evaluation labels artifact path", () => {
    expect(
      detectorEvaluationLabelsPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation-labels.json",
    );
  });
});
