import { describe, expect, test } from "bun:test";
import {
  boroughPrefix,
  rankByDetectorScore,
  roundRobinByBorough,
} from "../src/evaluation/cap-policy";

describe("cap-policy shared helpers (S2.2)", () => {
  test("boroughPrefix extracts the leading route-family letters", () => {
    expect(boroughPrefix("M15")).toBe("M");
    expect(boroughPrefix("SIM4")).toBe("SIM");
    expect(boroughPrefix("bx12")).toBe("BX");
    expect(boroughPrefix(null)).toBe("unknown");
    expect(boroughPrefix("404")).toBe("unknown");
  });

  test("rankByDetectorScore ranks by score desc, tie-broken by scopeId asc", () => {
    const ranks = rankByDetectorScore([
      { detectorId: "d", scopeId: "b", detectorScore: 90 },
      { detectorId: "d", scopeId: "a", detectorScore: 100 },
      { detectorId: "d", scopeId: "c", detectorScore: 90 },
      { detectorId: "d", scopeId: "z", detectorScore: null },
    ]);
    expect(ranks.get("d\0a")).toBe(1);
    expect(ranks.get("d\0b")).toBe(2); // tie at 90, "b" < "c"
    expect(ranks.get("d\0c")).toBe(3);
    expect(ranks.get("d\0z")).toBe(4); // null score -> 0, last
  });

  test("roundRobinByBorough cycles boroughs in sorted order and respects the limit", () => {
    const rows = [
      { id: "B1", boro: "B" },
      { id: "B2", boro: "B" },
      { id: "B3", boro: "B" },
      { id: "Q1", boro: "Q" },
      { id: "M1", boro: "M" },
    ];
    const picked = roundRobinByBorough(rows, 4, (row) => row.boro).map((row) => row.id);
    // sorted boroughs B, M, Q -> first round one each, then back to B
    expect(picked).toEqual(["B1", "M1", "Q1", "B2"]);
  });

  test("roundRobinByBorough returns [] for non-positive limits", () => {
    expect(roundRobinByBorough([{ boro: "B" }], 0, (row) => row.boro)).toEqual([]);
  });
});
