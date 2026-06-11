import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDateChunks,
  buildSocrataPartitionQuery,
  runSocrataPartitionedCsvSnapshot,
} from "../../../src/commands/ingest/socrata-partitioned-csv-snapshot.ts";

const manifestText = `
verified_at: "2026-05-31T00:00:00.000Z"
sources:
  - id: bus_hourly_ridership_2025
    type: socrata_dataset
    priority: core
    domain: data.ny.gov
    dataset_id: gxb3-akrn
    url: https://data.ny.gov/Transportation/MTA-Bus-Hourly-Ridership-2025/gxb3-akrn
    api: soda3
    default_access:
      kind: query
      format: json
    backfill:
      kind: soda3_export
      format: csv
      supportsByteRange: false
    purpose: Test source.
    status: active
`;

const tempDirs: string[] = [];
const socrataAppTokenEnv = "SOCRATA_APP_TOKEN";

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bp-socrata-partitioned-csv-snapshot-"));
  tempDirs.push(dir);
  return dir;
}

function withTemporaryToken<T>(token: string, run: () => Promise<T>): Promise<T> {
  const originalToken = process.env[socrataAppTokenEnv];
  process.env[socrataAppTokenEnv] = token;
  return run().finally(() => {
    if (originalToken === undefined) {
      delete process.env[socrataAppTokenEnv];
    } else {
      process.env[socrataAppTokenEnv] = originalToken;
    }
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("runSocrataPartitionedCsvSnapshot", () => {
  test("builds stable date chunks and SODA3 partition queries", () => {
    const chunks = buildDateChunks({
      partitionField: "transit_timestamp",
      startDate: "2025-01-01",
      endDate: "2025-04-01",
      interval: "month",
    });

    expect(chunks.map((chunk) => [chunk.startDate, chunk.endDate])).toEqual([
      ["2025-01-01", "2025-02-01"],
      ["2025-02-01", "2025-03-01"],
      ["2025-03-01", "2025-04-01"],
    ]);
    const firstChunk = chunks[0];
    if (firstChunk === undefined) {
      throw new Error("Expected at least one partition chunk.");
    }
    expect(
      buildSocrataPartitionQuery({
        partitionField: "transit_timestamp",
        chunk: firstChunk,
        where: "bus_route = 'M15'",
        limit: 10,
      }),
    ).toBe(
      "SELECT * WHERE (bus_route = 'M15') AND transit_timestamp >= '2025-01-01T00:00:00' AND transit_timestamp < '2025-02-01T00:00:00' ORDER BY transit_timestamp LIMIT 10",
    );
  });

  test("downloads and reuses an authenticated SODA3 CSV chunk", async () => {
    await withTemporaryToken("partition-test-token", async () => {
      const tempDir = await makeTempDir();
      const outputDir = join(tempDir, "partitioned");
      const csv = "transit_timestamp,bus_route,ridership\n2025-01-01T00:00:00,M15,10\n";
      const requests: Array<{ url: string; init: RequestInit | undefined }> = [];

      const first = await runSocrataPartitionedCsvSnapshot({
        sourceId: "bus_hourly_ridership_2025",
        partitionField: "transit_timestamp",
        startDate: "2025-01-01",
        endDate: "2025-03-01",
        interval: "month",
        maxChunks: 1,
        limit: 2,
        outputDir,
        manifestText,
        fetcher: async (url, init) => {
          requests.push({ url: url.toString(), init });
          return new Response(csv, {
            headers: {
              "content-type": "text/csv",
              "content-length": String(csv.length),
            },
          });
        },
      });

      const second = await runSocrataPartitionedCsvSnapshot({
        sourceId: "bus_hourly_ridership_2025",
        partitionField: "transit_timestamp",
        startDate: "2025-01-01",
        endDate: "2025-03-01",
        interval: "month",
        maxChunks: 1,
        limit: 2,
        outputDir,
        manifestText,
        fetcher: async () => {
          throw new Error("unexpected fetch on reused chunk");
        },
      });

      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toBe("https://data.ny.gov/api/v3/views/gxb3-akrn/export.csv");
      expect(requests[0]?.init?.method).toBe("POST");
      expect(new Headers(requests[0]?.init?.headers).get("X-App-Token")).toBe(
        "partition-test-token",
      );
      const body = JSON.parse(String(requests[0]?.init?.body)) as { query: string };
      expect(body.query).toContain("transit_timestamp >= '2025-01-01T00:00:00'");
      expect(body.query).toContain("LIMIT 2");

      expect(first).toMatchObject({
        sourceId: "bus_hourly_ridership_2025",
        datasetId: "gxb3-akrn",
        chunkCount: 1,
        downloadedChunkCount: 1,
        reusedChunkCount: 0,
        bytes: csv.length,
      });
      expect(second).toMatchObject({
        chunkCount: 1,
        downloadedChunkCount: 0,
        reusedChunkCount: 1,
        bytes: csv.length,
      });
      expect(await Bun.file(first.chunks[0]?.outputPath ?? "").text()).toBe(csv);

      const manifest = JSON.parse(await Bun.file(first.manifestPath).text()) as {
        chunks: Array<{ path: string; downloaded: boolean }>;
      };
      expect(manifest.chunks).toMatchObject([
        {
          path: join("chunks", "transit_timestamp-2025-01-01-to-2025-02-01", "rows.csv"),
          downloaded: false,
        },
      ]);
    });
  });

  test("retries SODA3 export processing responses", async () => {
    const tempDir = await makeTempDir();
    const outputDir = join(tempDir, "partitioned");
    const csv = "transit_timestamp,bus_route,ridership\n2025-01-01T00:00:00,M15,10\n";
    let fetchCount = 0;

    const result = await runSocrataPartitionedCsvSnapshot({
      sourceId: "bus_hourly_ridership_2025",
      partitionField: "transit_timestamp",
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      interval: "month",
      outputDir,
      manifestText,
      retryCount: 1,
      retryDelayMs: 0,
      fetcher: async () => {
        fetchCount += 1;
        if (fetchCount === 1) return new Response("processing", { status: 202 });
        return new Response(csv);
      },
    });

    expect(fetchCount).toBe(2);
    expect(result.downloadedChunkCount).toBe(1);
    expect(await Bun.file(result.chunks[0]?.outputPath ?? "").text()).toBe(csv);
  });
});
