import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRawSnapshotCoverageAudit } from "../../../src/commands/audit/raw-snapshot-coverage.ts";
import {
  buildRawCoverageReport,
  buildRawFamilyReports,
  buildRawReclaimScript,
  probeRawFamilySqliteCoverage,
  type RawFamilyMapping,
  type RawFamilyReport,
  type RawListingEntry,
} from "../../../src/lib/raw-deprecation.ts";

const commandPath = join(import.meta.dir, "../../../src/commands/audit/raw-snapshot-coverage.ts");

function file(path: string, size = 1): RawListingEntry {
  return { path, size, type: "File" };
}

function directory(path: string): RawListingEntry {
  return { path, size: 0, type: "Directory" };
}

function report(overrides: Partial<RawFamilyReport>): RawFamilyReport {
  return {
    family: "fixture",
    path: "/raw/fixture",
    bytes: 1,
    fileCount: 1,
    months: ["2026-03"],
    layout: "monthly-snapshots",
    ...overrides,
  };
}

describe("raw snapshot coverage audit", () => {
  test("classifies raw families from the verified monthly snapshot naming convention", () => {
    const families = buildRawFamilyReports("/raw", [
      directory("/raw/bus-lanes"),
      file("/raw/bus-lanes/bus-lanes-2026-03.json", 10),
      file("/raw/bus-lanes/bus-lanes-2026-04.json", 20),
      directory("/raw/network"),
      file("/raw/network/current_bus_routes.json", 30),
      directory("/raw/socrata-partitioned"),
      file("/raw/socrata-partitioned/source/run/partition-manifest.json", 40),
      file("/raw/socrata-partitioned/source/run/chunks/event_date-2026-03-01-to-2026-04-01/rows.csv", 50),
      file("/raw/.gitkeep", 0),
    ]);

    expect(families.map((family) => [family.family, family.layout, family.months])).toEqual([
      ["socrata-partitioned/source", "partitioned", ["2026-03"]],
      ["bus-lanes", "monthly-snapshots", ["2026-03", "2026-04"]],
      ["network", "opaque", []],
    ]);
  });

  test("builds one verdict per deletion state", () => {
    const mappings: RawFamilyMapping[] = [
      { family: "ingested", tables: [{ table: "covered", monthColumns: ["month"] }] },
      { family: "partial", tables: [{ table: "covered", monthColumns: ["month"] }] },
      { family: "date-only", tables: [{ table: "date_only", dateColumns: ["created_at"] }] },
      {
        family: "indexed-date",
        tables: [{ table: "indexed_date", dateColumns: ["created_at"] }],
      },
      { family: "raw-only", tables: [] },
      { family: "opaque", tables: [{ table: "opaque_table" }] },
      { family: "constrained", tables: [{ table: "covered", monthColumns: ["month"] }] },
    ];
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE covered (month TEXT NOT NULL);
        INSERT INTO covered (month) VALUES ('2026-03');
        CREATE TABLE date_only (created_at TEXT NOT NULL);
        INSERT INTO date_only (created_at) VALUES ('2026-03-01');
        CREATE TABLE indexed_date (created_at TEXT NOT NULL);
        CREATE INDEX indexed_date_created_at_idx ON indexed_date (created_at);
        INSERT INTO indexed_date (created_at) VALUES ('2026-03-01');
        CREATE TABLE opaque_table (id TEXT NOT NULL);
      `);
      const families = [
        report({ family: "ingested", path: "/raw/ingested" }),
        report({ family: "partial", path: "/raw/partial", months: ["2026-03", "2026-04"] }),
        report({ family: "raw-only", path: "/raw/raw-only" }),
        report({ family: "opaque", path: "/raw/opaque", layout: "opaque", months: [] }),
        report({ family: "constrained", path: "/raw/constrained" }),
        report({ family: "date-only", path: "/raw/date-only" }),
        report({ family: "indexed-date", path: "/raw/indexed-date" }),
      ];
      const probes = probeRawFamilySqliteCoverage(sqlite, families, mappings);
      const coverage = buildRawCoverageReport({
        generatedAt: "2026-07-04T00:00:00.000Z",
        rawRoot: "/raw",
        dbPath: ":memory:",
        families,
        sqliteProbes: probes,
        directReaders: [{ family: "constrained", reader: "reader.ts", reason: "live raw reader" }],
        orphanedArtifacts: [],
      });

      expect(
        Object.fromEntries(coverage.families.map((family) => [family.family, family.verdict])),
      ).toEqual({
        ingested: "INGESTED",
        partial: "PARTIAL",
        "raw-only": "RAW-ONLY",
        opaque: "OPAQUE",
        constrained: "CONSTRAINED",
        "date-only": "PARTIAL",
        "indexed-date": "INGESTED",
      });
      expect(
        coverage.families.find((family) => family.family === "partial")?.missingMonths,
      ).toEqual(["2026-04"]);
      expect(coverage.deletionManifest.map((entry) => entry.family)).toEqual([
        "ingested",
        "indexed-date",
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("probes table, month-column, date-column, and missing-table coverage", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE month_table (month TEXT NOT NULL);
        INSERT INTO month_table (month) VALUES ('2026-03');
        CREATE TABLE date_table (created_at TEXT NOT NULL);
        CREATE TABLE indexed_date_table (created_at TEXT NOT NULL);
        CREATE INDEX indexed_date_table_created_at_idx ON indexed_date_table (created_at);
        INSERT INTO indexed_date_table (created_at) VALUES ('2026-03-15');
      `);
      const families = [
        report({ family: "monthy" }),
        report({ family: "datey" }),
        report({ family: "indexed-datey" }),
        report({ family: "missing" }),
      ];
      const probes = probeRawFamilySqliteCoverage(sqlite, families, [
        { family: "monthy", tables: [{ table: "month_table", monthColumns: ["month"] }] },
        { family: "datey", tables: [{ table: "date_table", dateColumns: ["created_at"] }] },
        {
          family: "indexed-datey",
          tables: [{ table: "indexed_date_table", dateColumns: ["created_at"] }],
        },
        { family: "missing", tables: [{ table: "missing_table", monthColumns: ["month"] }] },
      ]);

      expect(probes.get("monthy")?.tables[0]).toMatchObject({
        exists: true,
        monthGranularity: "month-column",
        months: ["2026-03"],
      });
      expect(probes.get("datey")?.tables[0]).toMatchObject({
        exists: true,
        monthGranularity: "date-column-unscanned",
        dateColumns: ["created_at"],
        months: [],
      });
      expect(probes.get("indexed-datey")?.tables[0]).toMatchObject({
        exists: true,
        monthGranularity: "indexed-date-column",
        dateColumns: ["created_at"],
        months: ["2026-03"],
      });
      expect(probes.get("missing")?.tables[0]).toMatchObject({ exists: false });
    } finally {
      sqlite.close();
    }
  });

  test("command boundary uses Effect services and writes both artifacts", async () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("localDbOptions: { readonly: true }");
    expect(source).toContain("runPipelineFileSystemBoundary({");
    expect(source).not.toContain('from "bun:sqlite"');
    expect(source).not.toContain("Bun.file");
    expect(source).not.toContain("Bun.write");
    expect(source).not.toContain("rm ");

    const root = mkdtempSync(join(tmpdir(), "bp-raw-coverage-"));
    const rawRoot = join(root, "raw");
    const artifactRoot = join(root, "artifacts");
    const dbPath = join(root, "pipeline.sqlite");
    mkdirSync(join(rawRoot, "fixture"), { recursive: true });
    writeFileSync(join(rawRoot, "fixture", "fixture-2026-03.json"), "{}");
    const sqlite = new Database(dbPath);
    sqlite.exec(
      "CREATE TABLE local_fixture (month TEXT NOT NULL); INSERT INTO local_fixture VALUES ('2026-03');",
    );
    sqlite.close();

    try {
      const result = await runRawSnapshotCoverageAudit({
        dbPath,
        rawRoot,
        artifactRoot,
        generatedAt: "2026-07-04T12:00:00.000Z",
      });
      expect(result.reportPath).toBe(
        join(artifactRoot, "raw-deprecation", "raw-coverage-2026-07-04.json"),
      );
      expect(result.deletionManifestPath).toBe(
        join(artifactRoot, "raw-deprecation", "deletion-manifest-2026-07-04.json"),
      );
      expect(JSON.parse(readFileSync(result.reportPath, "utf8")).families).toHaveLength(1);
      expect(JSON.parse(readFileSync(result.deletionManifestPath, "utf8"))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("builds an operator-only reclaim script from a deletion manifest", () => {
    const script = buildRawReclaimScript({
      generatedAt: "2026-07-05T00:00:00.000Z",
      manifestPath: "/repo/data/artifacts/raw-deprecation/deletion-manifest-2026-07-05.json",
      repoRoot: "/repo",
      manifestEntries: [
        {
          path: "/repo/data/raw/parking-violations",
          family: "parking-violations",
          bytes: 123,
          evidence: ["36 raw files"],
        },
      ],
      orphanedArtifacts: [
        {
          path: "data/artifacts/docs",
          status: "orphaned",
          bytes: 456,
          evidence: "docs pipeline retired",
        },
      ],
    });

    expect(script).toContain("OPERATOR-RUN ONLY");
    expect(script).toContain("sqlite_bytes=");
    expect(script).toContain("canonical sqlite missing/small; abort");
    expect(script).toContain("rm -rf -- 'data/raw/parking-violations'");
    expect(script).toContain("rm -rf -- 'data/artifacts/docs'");
    expect(script).toContain("df -h /mnt/models");
    expect(script.match(/rm -rf/g)).toHaveLength(2);
  });
});
