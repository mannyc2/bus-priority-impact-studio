import { describe, expect, test } from "bun:test";
import { runtimeTrendScoreVectorPath } from "../../../src/commands/build/runtime-trend-score-vectors.ts";

describe("build runtime-trend-score-vectors boundary", () => {
  test("keeps runtime-trend score-vector study logic out of the pipeline command", async () => {
    const text = await Bun.file(
      new URL("../../../src/commands/build/runtime-trend-score-vectors.ts", import.meta.url),
    ).text();

    expect(text).toContain("@bp/applied-research/artifacts");
    expect(text).toContain("@bp/applied-research/local-db");
    expect(text).toContain("@bp/applied-research/score-vectors");
    expect(text).not.toContain("local_route_segment_speed");
    expect(text).not.toContain("local_route_schedule_stop");
    expect(text).not.toContain("local_route_month_trend");
    expect(text).not.toContain("buildRuntimeTrendScoreVectorArtifact(");
    expect(text).not.toContain("ObservedRuntimeSourceRow");
    expect(text).not.toContain("ScheduledRuntimeSourceRow");
    expect(text).not.toContain("RouteMetricHistorySourceRow");
  });

  test("uses the applied-research runtime-trend score-vector artifact namespace", () => {
    expect(
      runtimeTrendScoreVectorPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        endMonth: "2026-03",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/runtime-trend-score-vectors/2023-04_to_2026-03/2026-03/runtime-trend-score-vectors.json",
    );
  });
});
