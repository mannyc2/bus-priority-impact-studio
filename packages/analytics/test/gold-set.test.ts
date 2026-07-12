import { describe, expect, test } from "bun:test";
import { evaluateGoldSet } from "@bp/analytics/evaluation";

describe("gold-set evaluation", () => {
  test("counts reviewed outcomes and unexpected flagged scopes", () => {
    expect(
      evaluateGoldSet({
        expectations: [
          { scopeId: "M15", shouldFlag: true },
          { scopeId: "M14", shouldFlag: false },
          { scopeId: "B44", shouldFlag: true },
          { scopeId: "Q44", shouldFlag: false },
        ],
        flaggedScopes: new Set(["M15", "M14", "BX12"]),
      }),
    ).toEqual({
      truePositive: 1,
      falsePositive: 2,
      trueNegative: 1,
      falseNegative: 1,
    });
  });
});
