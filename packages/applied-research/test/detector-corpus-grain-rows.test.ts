import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  detectDetectorSpecificScoreVectorIds,
  detectorCorpusGrainAuditMarkdownPath,
  detectorCorpusGrainAuditPath,
} from "../src/artifacts";
import { loadDetectorCorpusGrainLocalDbRows } from "../src/local-db";

describe("detector corpus grain local DB rows", () => {
  test("loads candidate and coverage counts from local finding tables", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_finding_candidate (
          detector_id TEXT NOT NULL,
          month TEXT NOT NULL
        );
        CREATE TABLE local_finding_coverage_audit (
          detector_id TEXT NOT NULL,
          month TEXT NOT NULL,
          outcome TEXT NOT NULL,
          reason_code TEXT
        );
      `);
      sqlite
        .prepare("INSERT INTO local_finding_candidate (detector_id, month) VALUES (?, ?)")
        .run("persistent_speed_hotspot", "2026-03");
      sqlite
        .prepare(
          "INSERT INTO local_finding_coverage_audit (detector_id, month, outcome, reason_code) VALUES (?, ?, ?, ?)",
        )
        .run("persistent_speed_hotspot", "2026-03", "hit", null);
      sqlite
        .prepare(
          "INSERT INTO local_finding_coverage_audit (detector_id, month, outcome, reason_code) VALUES (?, ?, ?, ?)",
        )
        .run("persistent_speed_hotspot", "2026-03", "skipped_missing_input", "missing_speed");
      sqlite
        .prepare(
          "INSERT INTO local_finding_coverage_audit (detector_id, month, outcome, reason_code) VALUES (?, ?, ?, ?)",
        )
        .run("persistent_speed_hotspot", "2026-02", "hit", null);

      const rows = loadDetectorCorpusGrainLocalDbRows({
        sqlite,
        releaseMonth: "2026-03",
      });

      expect(rows.candidateCounts?.get("persistent_speed_hotspot")).toBe(1);
      expect(rows.coverageCounts?.get("persistent_speed_hotspot")).toEqual({
        total: 2,
        hit: 1,
        cleanNoHit: 0,
        skippedMissingInput: 1,
        skippedFailedJoin: 0,
        sourceLag: 0,
        missingReasonCounts: {
          missing_speed: 1,
        },
      });
    } finally {
      sqlite.close();
    }
  });

  test("returns null maps when expected local finding tables are absent", () => {
    const sqlite = new Database(":memory:");
    try {
      const rows = loadDetectorCorpusGrainLocalDbRows({
        sqlite,
        releaseMonth: "2026-03",
      });

      expect(rows.candidateCounts).toBeNull();
      expect(rows.coverageCounts).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("owns detector corpus grain artifact paths", () => {
    expect(
      detectorCorpusGrainAuditPath({
        artifactRoot: "/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe("/artifacts/detector-corpus-grain/2023-04_to_2026-03/2026-03/grain-audit.json");
    expect(
      detectorCorpusGrainAuditMarkdownPath({
        artifactRoot: "/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe("/artifacts/detector-corpus-grain/2023-04_to_2026-03/2026-03/grain-audit.md");
  });

  test("detects detector-specific score-vector artifacts", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "bp-detector-score-vector-ids-"));
    try {
      const speedPacePath = join(
        artifactRoot,
        "speed-pace-score-vectors",
        "2023-04_to_2026-03",
        "2026-03",
        "speed-pace-score-vectors.json",
      );
      const runtimeTrendPath = join(
        artifactRoot,
        "runtime-trend-score-vectors",
        "2023-04_to_2026-03",
        "2026-03",
        "runtime-trend-score-vectors.json",
      );
      await mkdir(dirname(speedPacePath), { recursive: true });
      await mkdir(dirname(runtimeTrendPath), { recursive: true });
      await Bun.write(speedPacePath, "{}");
      await Bun.write(runtimeTrendPath, "{}");

      const detectorIds = await detectDetectorSpecificScoreVectorIds({
        artifactRoot,
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      });

      expect([...detectorIds].sort()).toEqual([
        "degradation_trend",
        "schedule_mismatch",
        "speed_pace_hotspot",
        "travel_time_variability",
      ]);
    } finally {
      await rm(artifactRoot, { force: true, recursive: true });
    }
  });
});
