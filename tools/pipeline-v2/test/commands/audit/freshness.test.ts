import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import { runFreshnessAudit } from "../../../src/commands/audit/freshness.ts";
import {
  FreshnessLedgerSchema,
  type FreshnessSourceDescriptor,
} from "../../../src/lib/freshness-ledger.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const descriptors = [
  descriptor("current_source"),
  descriptor("recent_source"),
  descriptor("stale_source"),
  descriptor("unknown_source"),
] as const satisfies readonly FreshnessSourceDescriptor[];

function descriptor(sourceId: string): FreshnessSourceDescriptor {
  return {
    sourceId,
    grain: "month",
    servingCritical: true,
    upstreamProbe: { kind: "none" },
    ingestedProbe: { kind: "none" },
    publishTarget: "d1",
  };
}

async function fixtureRoots(): Promise<{
  root: string;
  artifactRoot: string;
  exportRoot: string;
  outputPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "bp-freshness-ledger-"));
  tempRoots.push(root);
  const artifactRoot = join(root, "artifacts");
  const exportRoot = join(root, "exports");
  const older = join(exportRoot, "d1", "2099-12");
  const newer = join(exportRoot, "d1", "2000-01");
  await Promise.all([
    mkdir(artifactRoot, { recursive: true }),
    mkdir(older, { recursive: true }),
    mkdir(newer, { recursive: true }),
  ]);
  await Bun.write(
    join(older, "export-summary.json"),
    JSON.stringify({
      releaseId: "pub_20260101T000000000Z",
      publishedAt: "2026-01-01T00:00:00.000Z",
      coverage: { start: "2023-04", end: "2026-01" },
    }),
  );
  await Bun.write(
    join(newer, "export-summary.json"),
    JSON.stringify({
      releaseId: "pub_20260701T000000000Z",
      publishedAt: "2026-07-01T00:00:00.000Z",
      coverage: { start: "2023-04", end: "2026-06" },
    }),
  );
  return { root, artifactRoot, exportRoot, outputPath: join(artifactRoot, "custom-ledger.json") };
}

const upstream = new Map<string, string | null>([
  ["current_source", "2026-06"],
  ["recent_source", "2026-06"],
  ["stale_source", "2026-06"],
  ["unknown_source", null],
]);

const ingested = new Map<string, string | null>([
  ["current_source", "2026-06"],
  ["recent_source", "2026-04"],
  ["stale_source", "2026-02"],
  ["unknown_source", "2026-06"],
]);

describe("audit freshness", () => {
  test("writes a schema-valid, worst-first ledger with exact lag classes", async () => {
    const paths = await fixtureRoots();
    const ledger = await runFreshnessAudit({
      artifactRoot: paths.artifactRoot,
      exportRoot: paths.exportRoot,
      outputPath: paths.outputPath,
      checkedAt: "2026-07-20T12:00:00.000Z",
      descriptors,
      upstreamLatestResolver: ({ sourceId }) => upstream.get(sourceId) ?? null,
      ingestedLatestResolver: ({ sourceId }) => ingested.get(sourceId) ?? null,
      print: false,
    });

    expect(ledger.publishedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(ledger.rows.map((row) => [row.datasetId, row.status])).toEqual([
      ["stale_source", "behind(4)"],
      ["unknown_source", "unknown"],
      ["recent_source", "behind(2)"],
      ["current_source", "current"],
    ]);
    expect(ledger.rows.find((row) => row.datasetId === "current_source")).toMatchObject({
      ingestLagMonths: 0,
      publishLagMonths: 0,
    });
    expect(ledger.rows.find((row) => row.datasetId === "recent_source")).toMatchObject({
      ingestLagMonths: 2,
      publishLagMonths: 0,
    });
    expect(ledger.rows.find((row) => row.datasetId === "stale_source")).toMatchObject({
      ingestLagMonths: 4,
      publishLagMonths: 0,
    });
    expect(ledger.rows.find((row) => row.datasetId === "unknown_source")).toMatchObject({
      upstreamLatest: null,
      ingestLagMonths: null,
      publishLagMonths: null,
    });

    const written: unknown = await Bun.file(paths.outputPath).json();
    expect(decodeStrict(FreshnessLedgerSchema)(written) as unknown).toEqual(ledger);
  });

  test("strict mode fails for stale or unknown serving-critical sources", async () => {
    const paths = await fixtureRoots();
    await expect(
      runFreshnessAudit({
        artifactRoot: paths.artifactRoot,
        exportRoot: paths.exportRoot,
        outputPath: paths.outputPath,
        checkedAt: "2026-07-20T12:00:00.000Z",
        descriptors,
        upstreamLatestResolver: ({ sourceId }) => upstream.get(sourceId) ?? null,
        ingestedLatestResolver: ({ sourceId }) => ingested.get(sourceId) ?? null,
        strict: true,
        print: false,
      }),
    ).rejects.toThrow("stale_source");

    const knownCriticalDescriptors = descriptors.filter(
      (candidate) => candidate.sourceId === "current_source",
    );
    const ledger = await runFreshnessAudit({
      artifactRoot: paths.artifactRoot,
      exportRoot: paths.exportRoot,
      outputPath: paths.outputPath,
      checkedAt: "2026-07-20T12:00:00.000Z",
      descriptors: knownCriticalDescriptors,
      upstreamLatestResolver: ({ sourceId }) => upstream.get(sourceId) ?? null,
      ingestedLatestResolver: ({ sourceId }) => ingested.get(sourceId) ?? null,
      strict: true,
      print: false,
    });
    expect(
      ledger.rows.every((row) => row.status !== "unknown" && !row.status.startsWith("behind(")),
    ).toBe(true);

    await expect(
      runFreshnessAudit({
        artifactRoot: paths.artifactRoot,
        exportRoot: paths.exportRoot,
        outputPath: paths.outputPath,
        checkedAt: "2026-07-20T12:00:00.000Z",
        descriptors: descriptors.filter((candidate) => candidate.sourceId !== "stale_source"),
        upstreamLatestResolver: ({ sourceId }) => upstream.get(sourceId) ?? null,
        ingestedLatestResolver: ({ sourceId }) => ingested.get(sourceId) ?? null,
        strict: true,
        print: false,
      }),
    ).rejects.toThrow("unknown_source");
  });
});
