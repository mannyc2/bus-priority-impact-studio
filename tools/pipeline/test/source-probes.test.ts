import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SocrataDatasetIdSchema } from "@bp/sources";
import type { SourceProbeOutput } from "@bp/sources/probes";
import { writeProbeOutput } from "../src/jobs/sources/source-probes.js";

describe("pipeline source probe writes", () => {
  test("writes source probe output plus Socrata metadata sidecars", async () => {
    const output: SourceProbeOutput = {
      schemaVersion: 1,
      sourceId: "bus_segment_speeds_2025",
      sourceType: "socrata_dataset",
      sourcePriority: "core",
      manifestStatus: "needs_schema_probe",
      checkedAt: "2026-04-27T00:00:00.000Z",
      probeStatus: "active",
      statusRecommendation: "active",
      url: "https://data.ny.gov/Transportation/example/kufs-yh3x",
      socrata: {
        datasetId: "kufs-yh3x",
        domain: "data.ny.gov",
        metadataUrl: "https://data.ny.gov/api/views/kufs-yh3x",
        columnsUrl: "https://data.ny.gov/api/views/kufs-yh3x/columns.json",
        rowsCsvUrl: "https://data.ny.gov/api/views/kufs-yh3x/rows.csv?accessType=DOWNLOAD",
        rowCountUrl: "https://data.ny.gov/resource/kufs-yh3x.json?$select=count(*)",
        name: "MTA Bus Speeds Sample",
        columnCount: 1,
        rowCount: 42,
      },
      socrataDataset: {
        metadata: {
          id: SocrataDatasetIdSchema.parse("kufs-yh3x"),
          name: "MTA Bus Speeds Sample",
          columns: [],
        },
        columns: [{ name: "route_id", fieldName: "route_id" }],
      },
    };

    const dir = await mkdtemp(join(tmpdir(), "bp-source-probe-"));
    try {
      await writeProbeOutput(output, dir);

      expect(await Bun.file(join(dir, "bus_segment_speeds_2025.json")).exists()).toBe(true);
      expect(await Bun.file(join(dir, "kufs-yh3x.json")).exists()).toBe(true);
      expect(await Bun.file(join(dir, "kufs-yh3x_columns.json")).exists()).toBe(true);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
