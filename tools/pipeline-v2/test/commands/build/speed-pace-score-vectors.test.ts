import { describe, expect, test } from "bun:test";
import { speedPaceScoreVectorPath } from "../../../src/commands/build/speed-pace-score-vectors.ts";

describe("build speed-pace-score-vectors boundary", () => {
  test("keeps speed-pace score-vector study logic out of the pipeline command", async () => {
    const text = await Bun.file(
      new URL("../../../src/commands/build/speed-pace-score-vectors.ts", import.meta.url),
    ).text();

    expect(text).toContain("@bp/applied-research/artifacts");
    expect(text).toContain("@bp/applied-research/local-db");
    expect(text).toContain("@bp/applied-research/score-vectors");
    expect(text).not.toContain("local_route_segment_speed");
    expect(text).not.toContain("average_travel_time_minutes");
    expect(text).not.toContain("buildSpeedPaceScoreVectorArtifact(");
    expect(text).not.toContain("SegmentDaypartSpeedSourceRow");
  });

  test("uses the applied-research speed-pace score-vector artifact namespace", () => {
    expect(
      speedPaceScoreVectorPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        endMonth: "2026-03",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/speed-pace-score-vectors/2023-04_to_2026-03/2026-03/speed-pace-score-vectors.json",
    );
  });
});
