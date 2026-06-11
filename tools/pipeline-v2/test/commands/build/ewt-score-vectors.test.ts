import { describe, expect, test } from "bun:test";
import { ewtScoreVectorArtifactPath } from "../../../src/commands/build/ewt-score-vectors.ts";

describe("build ewt-score-vectors boundary", () => {
  test("keeps EWT score-vector study logic out of the pipeline command", async () => {
    const text = await Bun.file(
      new URL("../../../src/commands/build/ewt-score-vectors.ts", import.meta.url),
    ).text();

    expect(text).toContain("@bp/applied-research/artifacts");
    expect(text).toContain("@bp/applied-research/local-db");
    expect(text).toContain("@bp/applied-research/score-vectors");
    expect(text).not.toContain("local_route_observed_reliability_summary");
    expect(text).not.toContain("local_bus_customer_journey_metric");
    expect(text).not.toContain("additional_bus_stop_time_minutes");
    expect(text).not.toContain("parseEwtRouteMonthRows");
    expect(text).not.toContain("buildEwtRouteMonthScoreVectorArtifact(");
  });

  test("uses the applied-research EWT score-vector artifact namespace", () => {
    expect(ewtScoreVectorArtifactPath("data/artifacts", "2023-04", "2026-03", "2026-03")).toBe(
      "data/artifacts/analytics-ewt-score-vectors/2023-04_to_2026-03/2026-03/ewt-route-month-score-vectors.json",
    );
  });
});
