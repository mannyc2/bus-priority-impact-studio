import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSocrataCsvSnapshot } from "../../../src/commands/ingest/socrata-csv-snapshot.ts";

const manifestText = `
verified_at: "2026-05-31T00:00:00.000Z"
sources:
  - id: current_bus_routes
    type: socrata_dataset
    priority: core
    domain: data.ny.gov
    dataset_id: h2wf-afav
    url: https://data.ny.gov/Transportation/MTA-Current-Bus-Routes/h2wf-afav
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

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bp-socrata-csv-snapshot-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("runSocrataCsvSnapshot", () => {
  test("sends a Socrata app token when available", async () => {
    const socrataAppTokenEnv = "SOCRATA_APP_TOKEN";
    const originalToken = process.env[socrataAppTokenEnv];
    process.env[socrataAppTokenEnv] = "test-app-token";
    try {
      const tempDir = await makeTempDir();
      const outputPath = join(tempDir, "rows.csv");
      const csv = "route_id,route_name\nM15,First Avenue\n";
      let observedToken: string | null = null;

      await runSocrataCsvSnapshot({
        sourceId: "current_bus_routes",
        outputPath,
        manifestText,
        fetcher: async (_url, init) => {
          observedToken = new Headers(init?.headers).get("X-App-Token");
          return new Response(csv);
        },
      });

      expect(String(observedToken)).toBe("test-app-token");
    } finally {
      if (originalToken === undefined) {
        delete process.env[socrataAppTokenEnv];
      } else {
        process.env[socrataAppTokenEnv] = originalToken;
      }
    }
  });

  test("downloads and reuses a manifest rows.csv snapshot", async () => {
    const tempDir = await makeTempDir();
    const outputPath = join(tempDir, "rows.csv");
    const csv = "route_id,route_name\nM15,First Avenue\n";
    let fetchCount = 0;

    const first = await runSocrataCsvSnapshot({
      sourceId: "current_bus_routes",
      outputPath,
      manifestText,
      fetcher: async () => {
        fetchCount += 1;
        return new Response(csv);
      },
    });
    const second = await runSocrataCsvSnapshot({
      sourceId: "current_bus_routes",
      outputPath,
      manifestText,
      fetcher: async () => {
        fetchCount += 1;
        return new Response("unexpected");
      },
    });

    expect(first).toMatchObject({
      sourceId: "current_bus_routes",
      datasetId: "h2wf-afav",
      downloaded: true,
      bytes: csv.length,
    });
    expect(second).toMatchObject({
      downloaded: false,
      bytes: csv.length,
    });
    expect(fetchCount).toBe(1);
    expect(await Bun.file(outputPath).text()).toBe(csv);
  });

  test("retries transient CSV download failures", async () => {
    const tempDir = await makeTempDir();
    const outputPath = join(tempDir, "rows.csv");
    const csv = "route_id,route_name\nM15,First Avenue\n";
    let fetchCount = 0;
    const attemptFailures: unknown[] = [];

    const result = await runSocrataCsvSnapshot({
      sourceId: "current_bus_routes",
      outputPath,
      manifestText,
      retryCount: 1,
      retryDelayMs: 0,
      progress: (event) => {
        if (event.kind === "download_attempt_failed") attemptFailures.push(event);
      },
      fetcher: async () => {
        fetchCount += 1;
        if (fetchCount === 1) throw new Error("socket closed");
        return new Response(csv);
      },
    });

    expect(result).toMatchObject({
      downloaded: true,
      bytes: csv.length,
    });
    expect(fetchCount).toBe(2);
    expect(attemptFailures).toHaveLength(1);
    expect(await Bun.file(outputPath).text()).toBe(csv);
  });
});
