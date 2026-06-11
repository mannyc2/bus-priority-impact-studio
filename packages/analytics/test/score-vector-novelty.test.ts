import { describe, expect, test } from "bun:test";
import {
  type DetectorScoreVectorEntry,
  detectorScoreNovelty,
  scoreSpreadStats,
  spearmanRankCorrelation,
} from "@bp/analytics/calibration";

describe("score-vector novelty stats (S4.4)", () => {
  test("spearman rank correlation: monotonic, reversed, ties, and degenerate inputs", () => {
    // Perfectly monotonic (non-linear) -> rho = 1.
    expect(spearmanRankCorrelation([1, 2, 3, 4], [1, 4, 9, 16])).toBe(1);
    // Perfectly reversed -> rho = -1.
    expect(spearmanRankCorrelation([1, 2, 3, 4], [40, 30, 20, 10])).toBe(-1);
    // Ties handled via average ranks (still perfectly ordered) -> rho = 1.
    expect(spearmanRankCorrelation([1, 1, 2, 3], [5, 5, 7, 9])).toBe(1);
    // Fewer than 2 points -> null.
    expect(spearmanRankCorrelation([1], [2])).toBeNull();
    // No variance on one side -> null (undefined correlation).
    expect(spearmanRankCorrelation([3, 3, 3], [1, 2, 3])).toBeNull();
    expect(() => spearmanRankCorrelation([1, 2], [1])).toThrow(/equal-length/);
  });

  test("score spread stats compute range / iqr / stddev (and null on empty)", () => {
    const spread = scoreSpreadStats([60, 70, 80, 90, 100]);
    expect(spread).toMatchObject({
      count: 5,
      min: 60,
      max: 100,
      range: 40,
      mean: 80,
      median: 80,
      p25: 70,
      p75: 90,
      iqr: 20,
    });
    expect(scoreSpreadStats([])).toMatchObject({ count: 0, min: null, iqr: null });
  });

  test("detector novelty: redundant ranking -> low novelty; independent ranking -> high novelty", () => {
    const entry = (scopeId: string, score: number, flagged: boolean): DetectorScoreVectorEntry => ({
      scopeId,
      score,
      flagged,
    });

    const candidate = {
      detectorId: "candidate",
      entries: [
        entry("a", 90, true),
        entry("b", 80, true),
        entry("c", 70, false),
        entry("d", 60, false),
      ],
    };
    // Redundant peer: same scope ordering as the candidate.
    const redundant = {
      detectorId: "redundant_peer",
      entries: [
        entry("a", 9, true),
        entry("b", 8, true),
        entry("c", 7, false),
        entry("d", 6, false),
      ],
    };
    // Independent peer: reverses the candidate's ordering.
    const independent = {
      detectorId: "independent_peer",
      entries: [
        entry("a", 1, false),
        entry("b", 2, false),
        entry("c", 3, true),
        entry("d", 4, true),
      ],
    };

    const novelty = detectorScoreNovelty(candidate, [redundant, independent, candidate]);

    // self-comparison is excluded; peers sorted by id.
    expect(novelty.comparisons.map((c) => c.peerDetectorId)).toEqual([
      "independent_peer",
      "redundant_peer",
    ]);
    const byPeer = new Map(novelty.comparisons.map((c) => [c.peerDetectorId, c]));
    expect(byPeer.get("redundant_peer")?.rankCorrelation).toBe(1);
    expect(byPeer.get("redundant_peer")?.flaggedJaccard).toBe(1);
    expect(byPeer.get("independent_peer")?.rankCorrelation).toBe(-1);
    expect(byPeer.get("independent_peer")?.sharedScopeCount).toBe(4);

    // max |rho| = 1 (the redundant peer) -> noveltyScore 0.
    expect(novelty.maxAbsRankCorrelation).toBe(1);
    expect(novelty.noveltyScore).toBe(0);
    expect(novelty.spread).toMatchObject({ count: 4, min: 60, max: 90 });
  });

  test("detector novelty: no comparable peer -> fully novel (noveltyScore 1)", () => {
    const candidate = {
      detectorId: "candidate",
      entries: [
        { scopeId: "a", score: 90, flagged: true },
        { scopeId: "b", score: 80, flagged: false },
      ],
    };
    // Peer shares no scopes -> no rank correlation possible.
    const disjoint = {
      detectorId: "disjoint_peer",
      entries: [
        { scopeId: "x", score: 5, flagged: true },
        { scopeId: "y", score: 4, flagged: false },
      ],
    };
    const novelty = detectorScoreNovelty(candidate, [disjoint]);
    expect(novelty.comparisons[0]?.sharedScopeCount).toBe(0);
    expect(novelty.comparisons[0]?.rankCorrelation).toBeNull();
    expect(novelty.maxAbsRankCorrelation).toBeNull();
    expect(novelty.noveltyScore).toBe(1);
  });
});
