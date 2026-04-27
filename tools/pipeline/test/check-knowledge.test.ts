import { expect, test } from "bun:test";

test("knowledge check has a small fixed contract", async () => {
  const file = await Bun.file("tools/pipeline/src/check-knowledge.ts").text();

  expect(file).toContain("knowledge/index.md");
  expect(file).toContain("knowledge/log.md");
  expect(file).toContain("knowledge/raw/source_manifest.yaml");
});
