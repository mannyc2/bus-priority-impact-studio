import { describe, expect, test } from "bun:test";
import { isValidArtifactKey } from "../src/public-api.js";

describe("artifact key validation", () => {
  test("accepts public artifact keys", () => {
    expect(isValidArtifactKey("map/2026-03/manifest.json")).toBe(true);
    expect(isValidArtifactKey("studio/v2/routes/m15-sbs/dossier.json")).toBe(true);
  });

  test("rejects traversal and ambiguous encoded components", () => {
    for (const key of [
      "",
      "/map/2026-03/manifest.json",
      "map/../manifest.json",
      "map/./manifest.json",
      "map/%2e%2e/manifest.json",
      "map/%252e%252e/manifest.json",
      "map\\2026-03\\manifest.json",
      "map/\u0000/manifest.json",
      "map/\u0001/manifest.json",
      "map//manifest.json",
      "C:/manifest.json",
      ".",
      "..",
    ]) {
      expect(isValidArtifactKey(key)).toBe(false);
    }
  });
});
