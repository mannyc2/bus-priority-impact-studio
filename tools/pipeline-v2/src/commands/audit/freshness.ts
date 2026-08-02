import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { getSocrataSource, type SourceManifest } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import {
  buildFreshnessLedger,
  FRESHNESS_SOURCE_DESCRIPTORS,
  type FreshnessLedger,
  FreshnessLedgerSchema,
  type FreshnessSourceDescriptor,
  latestPublishedFreshness,
  normalizeFreshnessValue,
  readIngestedFreshness,
} from "../../lib/freshness-ledger.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions } from "../../lib/local-db.ts";
import {
  defaultArtifactRootPath,
  defaultExportRootPath,
  fromCliPath,
  fromRepoRoot,
} from "../../lib/paths.ts";
import { fetchSoda3RowsForSource, type SocrataFetch } from "../../lib/soda3.ts";
import { runRouteSpeedAvailability } from "../check/route-speed-availability.ts";

export type FreshnessLatestResolver = (
  descriptor: FreshnessSourceDescriptor,
) => Promise<string | null> | string | null;

export type RunFreshnessAuditInputs = {
  readonly dbPath?: string | undefined;
  readonly artifactRoot?: string | undefined;
  readonly exportRoot?: string | undefined;
  readonly outputPath?: string | undefined;
  readonly checkedAt?: string | undefined;
  readonly strict?: boolean | undefined;
  readonly print?: boolean | undefined;
  readonly fetcher?: SocrataFetch | undefined;
  readonly manifestText?: string | undefined;
  readonly descriptors?: readonly FreshnessSourceDescriptor[] | undefined;
  readonly upstreamLatestResolver?: FreshnessLatestResolver | undefined;
  readonly ingestedLatestResolver?: FreshnessLatestResolver | undefined;
};

export function freshnessLedgerArtifactPath(artifactRoot: string): string {
  return join(artifactRoot, "audits", "freshness-ledger.json");
}

function publishedAt(
  d1: { readonly publishedAt: string } | null,
  map: { readonly publishedAt: string } | null,
): string | null {
  if (d1 === null) return map?.publishedAt ?? null;
  if (map === null) return d1.publishedAt;
  return d1.publishedAt >= map.publishedAt ? d1.publishedAt : map.publishedAt;
}

export async function loadFreshnessSourceManifest(
  manifestText: string | undefined,
): Promise<SourceManifest> {
  const text =
    manifestText ?? (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  return loadSourceManifestYaml(text);
}

export async function probeFreshnessUpstreamLatest(input: {
  readonly descriptor: FreshnessSourceDescriptor;
  readonly manifest: SourceManifest;
  readonly artifactRoot: string;
  readonly fetcher?: SocrataFetch | undefined;
}): Promise<string | null> {
  const probe = input.descriptor.upstreamProbe;
  if (probe.kind === "none") return null;
  if (probe.kind === "route_speed") {
    const result = await runRouteSpeedAvailability({
      artifactRoot: input.artifactRoot,
      source: getSocrataSource(input.manifest, input.descriptor.sourceId),
      fetcher: input.fetcher,
    });
    return result.releaseDecision.latestCompleteMonth;
  }

  const source = getSocrataSource(input.manifest, probe.sourceId);
  const rows = await fetchSoda3RowsForSource(
    source,
    { select: `max(${probe.field}) as latest`, limit: 1 },
    { fetcher: input.fetcher },
  );
  const { latest = null } = rows[0] ?? {};
  return normalizeFreshnessValue(latest, input.descriptor.grain);
}

async function resolveUpstreamLatest(input: {
  readonly descriptors: readonly FreshnessSourceDescriptor[];
  readonly resolver?: FreshnessLatestResolver | undefined;
  readonly manifestText?: string | undefined;
  readonly artifactRoot: string;
  readonly fetcher?: SocrataFetch | undefined;
}): Promise<Map<string, string | null>> {
  const values = new Map<string, string | null>();
  if (input.resolver !== undefined) {
    for (const descriptor of input.descriptors) {
      const value = await input.resolver(descriptor);
      values.set(descriptor.sourceId, normalizeFreshnessValue(value, descriptor.grain));
    }
    return values;
  }

  const manifest = await loadFreshnessSourceManifest(input.manifestText);
  for (const descriptor of input.descriptors) {
    const value = await probeFreshnessUpstreamLatest({
      descriptor,
      manifest,
      artifactRoot: input.artifactRoot,
      fetcher: input.fetcher,
    });
    values.set(descriptor.sourceId, normalizeFreshnessValue(value, descriptor.grain));
  }
  return values;
}

async function resolveIngestedLatest(input: {
  readonly descriptors: readonly FreshnessSourceDescriptor[];
  readonly dbPath?: string | undefined;
  readonly resolver?: FreshnessLatestResolver | undefined;
}): Promise<Map<string, string | null>> {
  if (input.resolver !== undefined) {
    const values = new Map<string, string | null>();
    for (const descriptor of input.descriptors) {
      const value = await input.resolver(descriptor);
      values.set(descriptor.sourceId, normalizeFreshnessValue(value, descriptor.grain));
    }
    return values;
  }

  return runLocalDbCommandBoundary({
    dbPath: input.dbPath,
    localDbOptions: { readonly: true },
    command: "audit.freshness",
    operation: "readIngestedLatest",
    run: async (local) =>
      new Map(
        input.descriptors.map((descriptor) => [
          descriptor.sourceId,
          readIngestedFreshness(local.sqlite, descriptor),
        ]),
      ),
  });
}

function printable(value: string | number | null): string {
  return value === null ? "unknown" : String(value);
}

function printFreshnessLedger(ledger: FreshnessLedger): void {
  const lines = [
    "freshness-ledger:",
    [
      "source".padEnd(38),
      "status".padEnd(8),
      "upstream".padEnd(10),
      "ingested".padEnd(10),
      "published".padEnd(10),
      "ingest lag".padStart(10),
      "publish lag".padStart(11),
    ].join("  "),
    ...ledger.rows.map((row) =>
      [
        row.sourceId.padEnd(38),
        row.status.padEnd(8),
        printable(row.upstreamLatest).padEnd(10),
        printable(row.ingestedLatest).padEnd(10),
        printable(row.publishedCoverageEnd).padEnd(10),
        printable(row.ingestLagMonths).padStart(10),
        printable(row.publishLagMonths).padStart(11),
      ].join("  "),
    ),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

export async function runFreshnessAudit(
  input: RunFreshnessAuditInputs = {},
): Promise<FreshnessLedger> {
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const exportRoot = input.exportRoot ?? defaultExportRootPath();
  const descriptors = input.descriptors ?? FRESHNESS_SOURCE_DESCRIPTORS;
  const outputPath = input.outputPath ?? freshnessLedgerArtifactPath(artifactRoot);
  const checkedAt = input.checkedAt ?? new Date().toISOString();

  const [d1Published, mapPublished, upstreamLatest, ingestedLatest] = await Promise.all([
    latestPublishedFreshness(join(exportRoot, "d1"), "export-summary.json"),
    latestPublishedFreshness(join(artifactRoot, "map"), "manifest.json"),
    resolveUpstreamLatest({
      descriptors,
      resolver: input.upstreamLatestResolver,
      manifestText: input.manifestText,
      artifactRoot,
      fetcher: input.fetcher,
    }),
    resolveIngestedLatest({
      descriptors,
      dbPath: input.dbPath,
      resolver: input.ingestedLatestResolver,
    }),
  ]);

  const ledger = buildFreshnessLedger({
    checkedAt,
    publishedAt: publishedAt(d1Published, mapPublished),
    descriptors,
    upstreamLatest,
    ingestedLatest,
    publishedCoverageEnd: new Map([
      ["d1", d1Published?.coverageEnd ?? null],
      ["map", mapPublished?.coverageEnd ?? null],
      ["none", null],
    ]),
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, ledger);
  if (input.print !== false) printFreshnessLedger(ledger);

  if (input.strict) {
    const blocked = ledger.rows.filter(
      (row) => row.servingCritical && (row.status === "stale" || row.status === "unknown"),
    );
    if (blocked.length > 0) {
      throw new Error(
        `Freshness strict gate failed for serving-critical sources: ${blocked
          .map((row) => `${row.sourceId} (${row.status})`)
          .join(", ")}`,
      );
    }
  }

  return ledger;
}

export default defineCommand({
  path: ["audit", "freshness"],
  summary: "Report upstream, ingested, and published freshness for served sources.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      artifactRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Artifact root directory",
      }),
      output: Schema.optionalKey(Schema.String).annotate({
        description: "Override path for freshness-ledger JSON",
      }),
      strict: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({
          description: "Exit nonzero when a serving-critical source is stale or unknown",
        }),
    }),
  },
  output: FreshnessLedgerSchema,
  run({ input }) {
    return runFreshnessAudit({
      dbPath: input.options.db,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
      outputPath:
        input.options.output === undefined ? undefined : fromCliPath(input.options.output),
      strict: input.options.strict,
    });
  },
});
