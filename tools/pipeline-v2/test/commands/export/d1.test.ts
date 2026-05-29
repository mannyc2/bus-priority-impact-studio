import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runExportD1AppendixSeed,
  runExportD1Seed,
} from "../../../src/commands/export/d1.ts";
import { openLocalPipelineDb } from "../../../src/lib/local-db.ts";

describe("runExportD1Seed", () => {
  it("writes schema, seed, and summary files against an empty local DB", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "export-d1-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const exportRoot = join(tmp, "exports");

    const local = await openLocalPipelineDb(dbPath);
    try {
      const result = await runExportD1Seed({
        local,
        year: 2026,
        month: 3,
        exportRoot,
      });

      expect(result.isoMonth).toBe("2026-03");
      expect(result.analysisPeriod).toBe("2026-03");
      expect(result.schemaVersion).toBe(1);
      expect(result.routeCount).toBe(0);
      expect(result.comparisonRowCount).toBe(0);
      expect(result.routeCatalogRowCount).toBe(0);

      expect(existsSync(result.schemaPath)).toBe(true);
      expect(existsSync(result.seedPath)).toBe(true);
      expect(existsSync(result.summaryPath)).toBe(true);

      const summary = JSON.parse(await Bun.file(result.summaryPath).text());
      expect(summary.isoMonth).toBe("2026-03");
      expect(summary.schemaFile.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(summary.seedFile.sha256).toMatch(/^[0-9a-f]{64}$/);

      const schemaSql = await Bun.file(result.schemaPath).text();
      expect(schemaSql.length).toBeGreaterThan(0);
      expect(schemaSql).toContain("CREATE TABLE");
    } finally {
      local.sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("writes appendix-only files in appendix mode", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "export-d1-appendix-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const exportRoot = join(tmp, "exports");

    const local = await openLocalPipelineDb(dbPath);
    try {
      const result = await runExportD1AppendixSeed({
        local,
        year: 2026,
        month: 3,
        exportRoot,
      });

      expect(result.mode).toBe("appendix");
      expect(result.isoMonth).toBe("2026-03");
      expect(result.routeObservedReliabilitySummaryRowCount).toBe(0);
      expect(result.routeMonthSourceStatusRowCount).toBe(0);
      expect(existsSync(result.seedPath)).toBe(true);
      expect(existsSync(result.summaryPath)).toBe(true);
      expect(result.seedPath.endsWith("seed.appendix.sql")).toBe(true);
    } finally {
      local.sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
