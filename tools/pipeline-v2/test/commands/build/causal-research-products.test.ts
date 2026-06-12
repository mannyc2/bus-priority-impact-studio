import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPaths = [
  "../../../src/commands/build/pulse-candidate-set.ts",
  "../../../src/commands/build/pulse-event-overlap.ts",
  "../../../src/commands/build/event-effect-contrast.ts",
  "../../../src/commands/build/mechanism-corroboration.ts",
  "../../../src/commands/build/event-family-effect-panel.ts",
  "../../../src/commands/build/event-family-response-drift-study.ts",
].map((path) => join(import.meta.dir, path));

describe("build causal research product command boundaries", () => {
  test("keep causal product construction in applied-research", () => {
    for (const commandPath of commandPaths) {
      const source = readFileSync(commandPath, "utf8");
      expect(source).toContain('from "@bp/applied-research/artifacts"');
      expect(source).toContain('from "@bp/applied-research/causal"');
      expect(source).not.toContain("gateDisposition");
      expect(source).not.toContain("eventStudyEstimate");
    }
  });
});
