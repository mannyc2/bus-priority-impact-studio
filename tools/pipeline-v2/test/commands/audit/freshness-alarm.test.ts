import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import { runFreshnessAlarm } from "../../../src/commands/audit/freshness-alarm.ts";
import {
  buildFreshnessAlarmReport,
  canonicalFreshnessAlarmJson,
  FRESHNESS_ALARM_MARKER,
  FreshnessAlarmReportSchema,
  renderFreshnessAlarmIssue,
} from "../../../src/lib/freshness-alarm.ts";
import type { FreshnessSourceDescriptor } from "../../../src/lib/freshness-ledger.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function descriptor(
  sourceId: string,
  upstreamProbe: FreshnessSourceDescriptor["upstreamProbe"] = {
    kind: "socrata_max",
    sourceId,
    field: "period",
  },
): FreshnessSourceDescriptor {
  return {
    sourceId,
    grain: upstreamProbe.kind === "none" ? "snapshot" : "month",
    servingCritical: true,
    upstreamProbe,
    ingestedProbe: { kind: "none" },
    publishTarget: "d1",
  };
}

const release = {
  releaseId: "pub_20260802T160400000Z",
  publishedAt: "2026-08-02T16:04:00.000Z",
  coverage: { start: "2023-04", end: "2026-06" },
} as const;

describe("scheduled freshness alarm", () => {
  test("uses only advisory healthy/attention decisions and labels the compatibility fallback", () => {
    const descriptors = [
      descriptor("current_source"),
      descriptor("behind_source"),
      descriptor("unavailable_source"),
      descriptor("snapshot_source", { kind: "none" }),
    ];
    const report = buildFreshnessAlarmReport({
      checkedAt: "2026-08-02T17:00:00.000Z",
      release,
      descriptors,
      upstreamLatest: new Map([
        ["current_source", "2026-06"],
        ["behind_source", "2026-07"],
        ["unavailable_source", null],
        ["snapshot_source", null],
      ]),
    });

    expect(report.status).toBe("attention");
    expect(report.rows.map((row) => row.datasetId)).toEqual([
      "behind_source",
      "unavailable_source",
      "current_source",
      "snapshot_source",
    ]);
    expect(report.rows[0]).toMatchObject({
      publishLagPeriods: 1,
      coverageEvidence: "release_compatibility_fallback",
      attentionReasons: ["published_behind_upstream"],
    });
    expect(report.rows[1]).toMatchObject({
      attentionReasons: ["upstream_probe_unavailable"],
    });
    expect(report.rows[3]).toMatchObject({
      assessment: "not_assessed",
      attentionReasons: [],
    });
    const json = canonicalFreshnessAlarmJson(report);
    expect(json).not.toContain('"breach"');
    expect(json).not.toContain('"unknown"');
    expect(decodeStrict(FreshnessAlarmReportSchema)(JSON.parse(json)) as unknown).toEqual(report);
  });

  test("renders one stable bot-owned issue marker and exact local investigation command", () => {
    const report = buildFreshnessAlarmReport({
      checkedAt: "2026-08-02T17:00:00.000Z",
      release,
      descriptors: [descriptor("behind_source")],
      upstreamLatest: new Map([["behind_source", "2026-07"]]),
    });
    const body = renderFreshnessAlarmIssue(report);
    expect(body.match(new RegExp(FRESHNESS_ALARM_MARKER, "gu"))).toHaveLength(1);
    expect(body).toContain("audit freshness --db data/local/pipeline.sqlite");
    expect(body).toContain("never publishes data or changes the serving pointer");
  });

  test("writes canonical report bytes and an issue body without needing a local corpus", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-freshness-alarm-"));
    roots.push(root);
    const outputPath = join(root, "report.json");
    const issueBodyPath = join(root, "issue.md");
    const descriptors = [descriptor("current_source")];
    const run = () =>
      runFreshnessAlarm({
        artifactRoot: join(root, "artifacts"),
        outputPath,
        issueBodyPath,
        checkedAt: "2026-08-02T17:00:00.000Z",
        descriptors,
        upstreamLatestResolver: () => "2026-06",
        releaseResolver: async () => release,
      });

    const first = await run();
    const firstBytes = await Bun.file(outputPath).text();
    const second = await run();
    expect(second).toEqual(first);
    expect(await Bun.file(outputPath).text()).toBe(firstBytes);
    expect(first.status).toBe("healthy");
    expect(await Bun.file(issueBodyPath).text()).toContain(FRESHNESS_ALARM_MARKER);
  });

  test("turns a failed supported probe into advisory attention without leaking diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-freshness-alarm-failure-"));
    roots.push(root);
    const report = await runFreshnessAlarm({
      artifactRoot: join(root, "artifacts"),
      outputPath: join(root, "report.json"),
      issueBodyPath: join(root, "issue.md"),
      checkedAt: "2026-08-02T17:00:00.000Z",
      descriptors: [descriptor("failed_source")],
      upstreamLatestResolver: () => {
        throw new Error("provider diagnostic with credential-shaped text");
      },
      releaseResolver: async () => release,
    });

    expect(report.status).toBe("attention");
    expect(report.rows[0]?.attentionReasons).toEqual(["upstream_probe_unavailable"]);
    expect(await Bun.file(join(root, "report.json")).text()).not.toContain("credential-shaped");
  });

  test("bounds concurrent advisory probes and reports a timeout as unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-freshness-alarm-timeout-"));
    roots.push(root);
    const started: string[] = [];
    const report = await runFreshnessAlarm({
      artifactRoot: join(root, "artifacts"),
      outputPath: join(root, "report.json"),
      issueBodyPath: join(root, "issue.md"),
      checkedAt: "2026-08-02T17:00:00.000Z",
      descriptors: [descriptor("slow_source"), descriptor("current_source")],
      probeTimeoutMs: 10,
      upstreamLatestResolver: (source) => {
        started.push(source.sourceId);
        return source.sourceId === "slow_source"
          ? new Promise<string>(() => undefined)
          : "2026-06";
      },
      releaseResolver: async () => release,
    });

    expect(started).toEqual(["slow_source", "current_source"]);
    expect(report.rows.find((row) => row.datasetId === "slow_source")?.attentionReasons).toEqual([
      "upstream_probe_unavailable",
    ]);
    expect(report.rows.find((row) => row.datasetId === "current_source")).toMatchObject({
      assessment: "assessed",
      publishLagPeriods: 0,
      attentionReasons: [],
    });
  });

  test("actively aborts an in-flight provider request at the advisory timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-freshness-alarm-abort-"));
    roots.push(root);
    let aborted = false;
    const report = await runFreshnessAlarm({
      artifactRoot: join(root, "artifacts"),
      outputPath: join(root, "report.json"),
      issueBodyPath: join(root, "issue.md"),
      checkedAt: "2026-08-02T17:00:00.000Z",
      descriptors: [descriptor("bus_hourly_ridership_2025")],
      manifestText: await Bun.file("knowledge/raw/source_manifest.yaml").text(),
      probeTimeoutMs: 10,
      fetcher: async (_resource, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        }),
      releaseResolver: async () => release,
    });

    expect(aborted).toBe(true);
    expect(report.rows[0]?.attentionReasons).toEqual(["upstream_probe_unavailable"]);
  });
});
