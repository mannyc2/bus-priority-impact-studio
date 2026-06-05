import { describe, expect, test } from "bun:test";
import { canonicalBoroughCode, canonicalBoroughName } from "@bp/sources/clients/geoclient";

describe("NYC Geoclient normalization", () => {
  test("normalizes NYC county and borough abbreviations used by source rows", () => {
    expect(canonicalBoroughCode("NY")).toBe("1");
    expect(canonicalBoroughName("MN")).toBe("manhattan");
    expect(canonicalBoroughName("BX")).toBe("bronx");
    expect(canonicalBoroughName("BK")).toBe("brooklyn");
    expect(canonicalBoroughName("Q")).toBe("queens");
    expect(canonicalBoroughName("QN")).toBe("queens");
    expect(canonicalBoroughName("SI")).toBe("staten island");
    expect(canonicalBoroughName("ST")).toBe("staten island");
    expect(canonicalBoroughName("Unspecified BRONX")).toBe("bronx");
  });
});
