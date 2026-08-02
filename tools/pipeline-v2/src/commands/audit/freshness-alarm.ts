import { ReleaseStatusResponseSchema } from "@bp/domain/routes";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { runPipelineFileSystemBoundary } from "../../effect/file-system.ts";
import {
  buildFreshnessAlarmReport,
  canonicalFreshnessAlarmJson,
  type FreshnessAlarmRelease,
  type FreshnessAlarmReport,
  FreshnessAlarmReportSchema,
  renderFreshnessAlarmIssue,
} from "../../lib/freshness-alarm.ts";
import {
  FRESHNESS_SOURCE_DESCRIPTORS,
  type FreshnessSourceDescriptor,
} from "../../lib/freshness-ledger.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";
import { decodeSchemaStrict } from "../../lib/schema-decode.ts";
import type { SocrataFetch } from "../../lib/soda3.ts";
import {
  type FreshnessLatestResolver,
  loadFreshnessSourceManifest,
  probeFreshnessUpstreamLatest,
} from "./freshness.ts";

const COMMAND = "audit.freshness-alarm";
const DEFAULT_STATUS_URL =
  "https://bus-priority-impact-studio.c20carroll.workers.dev/api/v1/status";
const DEFAULT_PROBE_TIMEOUT_MS = 45_000;

export type RunFreshnessAlarmInputs = {
  readonly publicStatusUrl?: string | undefined;
  readonly artifactRoot?: string | undefined;
  readonly outputPath?: string | undefined;
  readonly issueBodyPath?: string | undefined;
  readonly checkedAt?: string | undefined;
  readonly manifestText?: string | undefined;
  readonly descriptors?: readonly FreshnessSourceDescriptor[] | undefined;
  readonly upstreamLatestResolver?: FreshnessLatestResolver | undefined;
  readonly releaseResolver?: (() => Promise<FreshnessAlarmRelease>) | undefined;
  readonly fetcher?: SocrataFetch | undefined;
  readonly probeTimeoutMs?: number | undefined;
};

async function resolveAdvisoryProbe(input: {
  readonly descriptor: FreshnessSourceDescriptor;
  readonly resolve: () => Promise<string | null> | string | null;
  readonly timeoutMs: number;
}): Promise<readonly [string, string | null]> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const latest = await Promise.race([
      Promise.resolve().then(input.resolve),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Freshness probe timed out for ${input.descriptor.sourceId}.`)),
          input.timeoutMs,
        );
      }),
    ]);
    return [input.descriptor.sourceId, latest] as const;
  } catch {
    // A failed advisory probe becomes an attention row without persisting
    // provider diagnostics, request bodies, or credentials in the report.
    return [input.descriptor.sourceId, null] as const;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function fetchPublicRelease(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<FreshnessAlarmRelease> {
  const response = await fetcher(url, {
    headers: { accept: "application/json", "user-agent": "bp-freshness-alarm/1" },
  });
  if (!response.ok) throw new Error(`Public release status failed with HTTP ${response.status}.`);
  const status = decodeSchemaStrict(ReleaseStatusResponseSchema, await response.json());
  return {
    releaseId: status.releaseId,
    publishedAt: status.publishedAt,
    coverage: status.coverage,
  };
}

export async function runFreshnessAlarm(
  input: RunFreshnessAlarmInputs = {},
): Promise<FreshnessAlarmReport> {
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const outputPath = input.outputPath ?? `${artifactRoot}/audits/freshness-alarm.json`;
  const issueBodyPath = input.issueBodyPath ?? `${artifactRoot}/audits/freshness-alarm.md`;
  const descriptors = input.descriptors ?? FRESHNESS_SOURCE_DESCRIPTORS;
  const manifest =
    input.upstreamLatestResolver === undefined
      ? await loadFreshnessSourceManifest(input.manifestText)
      : undefined;
  const probeTimeoutMs = input.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  if (!Number.isFinite(probeTimeoutMs) || probeTimeoutMs <= 0) {
    throw new Error("Freshness probe timeout must be a positive number of milliseconds.");
  }
  const upstreamLatest = new Map(
    await Promise.all(
      descriptors.map((descriptor) =>
        resolveAdvisoryProbe({
          descriptor,
          timeoutMs: probeTimeoutMs,
          resolve: () => {
            if (input.upstreamLatestResolver !== undefined) {
              return input.upstreamLatestResolver(descriptor);
            }
            if (manifest === undefined) {
              throw new Error("Freshness source manifest is unavailable.");
            }
            return probeFreshnessUpstreamLatest({
              descriptor,
              manifest,
              artifactRoot,
              fetcher: input.fetcher,
            });
          },
        }),
      ),
    ),
  );
  const release = await (input.releaseResolver?.() ??
    fetchPublicRelease(input.publicStatusUrl ?? DEFAULT_STATUS_URL));
  const report = decodeSchemaStrict(
    FreshnessAlarmReportSchema,
    buildFreshnessAlarmReport({
      checkedAt: input.checkedAt ?? new Date().toISOString(),
      release,
      descriptors,
      upstreamLatest,
    }),
  );
  await Promise.all([
    runPipelineFileSystemBoundary({
      command: COMMAND,
      operation: "writeCanonicalReport",
      run: (files) =>
        files.writeText({
          command: COMMAND,
          operation: "writeCanonicalReport",
          path: outputPath,
          contents: canonicalFreshnessAlarmJson(report),
        }),
    }),
    runPipelineFileSystemBoundary({
      command: COMMAND,
      operation: "writeIssueBody",
      run: (files) =>
        files.writeText({
          command: COMMAND,
          operation: "writeIssueBody",
          path: issueBodyPath,
          contents: renderFreshnessAlarmIssue(report),
        }),
    }),
  ]);
  process.stdout.write(
    `${JSON.stringify({ status: report.status, releaseId: report.release.releaseId, outputPath, issueBodyPath })}\n`,
  );
  return report;
}

export default defineCommand({
  path: ["audit", "freshness-alarm"],
  summary: "Write the advisory production freshness alarm report and issue body.",
  input: {
    options: Schema.Struct({
      publicStatusUrl: Schema.optionalKey(Schema.String).annotate({
        description: "Public release-status URL",
      }),
      artifactRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Temporary root for probe artifacts",
      }),
      output: Schema.optionalKey(Schema.String).annotate({
        description: "Canonical alarm report path",
      }),
      issueBody: Schema.optionalKey(Schema.String).annotate({
        description: "Generated GitHub issue body path",
      }),
    }),
  },
  output: FreshnessAlarmReportSchema,
  run({ input }) {
    return runFreshnessAlarm({
      publicStatusUrl: input.options.publicStatusUrl,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
      outputPath:
        input.options.output === undefined ? undefined : fromCliPath(input.options.output),
      issueBodyPath:
        input.options.issueBody === undefined ? undefined : fromCliPath(input.options.issueBody),
    });
  },
});
