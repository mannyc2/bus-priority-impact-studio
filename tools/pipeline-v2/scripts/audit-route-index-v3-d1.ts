import { appendFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import { Schema } from "effect";
import { decodeSchemaStrict } from "../src/lib/schema-decode.ts";
import {
  auditExactRouteIndexRecovery,
  type ExactRouteIdentityReleaseRecoveryRow,
  type RouteCatalogRecoveryRow,
  type RouteCatalogTripTypeRecoveryRow,
  type RouteCatalogTypeRecoveryRow,
} from "../src/lib/route-index-v3-recovery.ts";

const CatalogRowSchema = Schema.Struct({
  routeId: Schema.String,
  routeShortName: Schema.String,
  routeLongName: Schema.NullOr(Schema.String),
});
const RouteTypeRowSchema = Schema.Struct({
  routeId: Schema.String,
  typeRank: Schema.Number.check(Schema.isInt()),
  routeType: Schema.String,
});
const TripTypeRowSchema = Schema.Struct({
  routeId: Schema.String,
  tripTypeRank: Schema.Number.check(Schema.isInt()),
  tripType: Schema.String,
});
const RegistryRowSchema = Schema.Struct({
  releaseId: Schema.String,
  publishedAt: Schema.String,
  coverageStart: Schema.NullOr(Schema.String),
  coverageEnd: Schema.String,
  sourceWikiRelease: Schema.String,
  sourceManifestSha256: Schema.String,
  sourceRouteIdentitySha256: Schema.String,
  sourceCurrentBusRoutesSha256: Schema.String,
  sourceIndexSha256: Schema.String,
  catalogSnapshotSha256: Schema.String,
  projectionSha256: Schema.String,
  exactRouteCount: Schema.Number.check(Schema.isInt()),
  routeTypeCount: Schema.Number.check(Schema.isInt()),
  tripTypeCount: Schema.Number.check(Schema.isInt()),
});
const ReleaseRowSchema = Schema.Struct({
  publishedAt: Schema.String,
  coverageStart: Schema.NullOr(Schema.String),
  coverageEnd: Schema.String,
});
const TableRowSchema = Schema.Struct({ name: Schema.String });

type Arguments = ReadonlyMap<string, string>;

function parseArguments(argv: readonly string[]): Arguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || value === undefined || !flag.startsWith("--")) {
      throw new Error(`Expected --flag value, received ${flag ?? "end of arguments"}`);
    }
    values.set(flag.slice(2), value);
  }
  return values;
}

function required(args: Arguments, name: string): string {
  const value = args.get(name);
  if (value === undefined || value.length === 0) throw new Error(`Missing --${name}`);
  return value;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text()) as unknown;
}

function wranglerRows(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    if (value.every((entry) => entry !== null && typeof entry === "object" && "results" in entry)) {
      return value.flatMap((entry) => {
        const results = (entry as { results?: unknown }).results;
        if (!Array.isArray(results)) throw new Error("Wrangler result has no results array");
        return results;
      });
    }
    return value;
  }
  if (value !== null && typeof value === "object" && "results" in value) {
    const results = (value as { results?: unknown }).results;
    if (Array.isArray(results)) return results;
  }
  throw new Error("Unsupported Wrangler D1 JSON result shape");
}

async function writeAtomic(path: string, text: string): Promise<void> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await Bun.write(temporary, text);
  await rename(temporary, output);
}

async function run(argv: readonly string[]): Promise<void> {
  const args = parseArguments(argv);
  const modeValue = required(args, "mode");
  if (modeValue !== "pre" && modeValue !== "post") throw new Error("--mode must be pre or post");
  const [receipt, tableInput, catalogInput, routeTypeInput, tripTypeInput, registryInput, releaseInput] =
    await Promise.all([
      readJson(required(args, "receipt")),
      readJson(required(args, "tables")),
      readJson(required(args, "catalog")),
      readJson(required(args, "route-types")),
      readJson(required(args, "trip-types")),
      readJson(required(args, "registry")),
      readJson(required(args, "release")),
    ]);
  const tables = decodeSchemaStrict(Schema.Array(TableRowSchema), wranglerRows(tableInput));
  const tableNames = new Set(tables.map((row) => row.name));
  const catalogRows = decodeSchemaStrict(
    Schema.Array(CatalogRowSchema),
    wranglerRows(catalogInput),
  ) as RouteCatalogRecoveryRow[];
  const routeTypeRows = decodeSchemaStrict(
    Schema.Array(RouteTypeRowSchema),
    wranglerRows(routeTypeInput),
  ) as RouteCatalogTypeRecoveryRow[];
  const tripTypeRows = decodeSchemaStrict(
    Schema.Array(TripTypeRowSchema),
    wranglerRows(tripTypeInput),
  ) as RouteCatalogTripTypeRecoveryRow[];
  const registryRows = decodeSchemaStrict(
    Schema.Array(RegistryRowSchema),
    wranglerRows(registryInput),
  ) as ExactRouteIdentityReleaseRecoveryRow[];
  const releases = decodeSchemaStrict(Schema.Array(ReleaseRowSchema), wranglerRows(releaseInput));
  const release = releases[0];
  if (release === undefined || releases.length !== 1) {
    throw new Error("Expected exactly one active passing D1 serving release");
  }
  const audit = auditExactRouteIndexRecovery({
    mode: modeValue,
    receipt,
    servingRelease: {
      releaseId: releaseIdFromPublishedAt(release.publishedAt),
      publishedAt: release.publishedAt,
      coverage: { start: release.coverageStart, end: release.coverageEnd },
    },
    catalogRows,
    routeTypeRows,
    tripTypeTablePresent: tableNames.has("route_catalog_trip_type"),
    tripTypeRows,
    registryTablePresent: tableNames.has("exact_route_identity_release"),
    registryRows,
  });
  const outputText = `${JSON.stringify(audit, null, 2)}\n`;
  await writeAtomic(required(args, "output"), outputText);
  const githubOutput = args.get("github-output");
  if (githubOutput !== undefined) {
    await appendFile(
      githubOutput,
      [
        `apply_trip_type_migration=${String(audit.actions.applyTripTypeMigration)}`,
        `apply_registry_migration=${String(audit.actions.applyRegistryMigration)}`,
        `apply_recovery_projection=${String(audit.actions.applyRecoveryProjection)}`,
        "",
      ].join("\n"),
    );
  }
  console.log(JSON.stringify(audit));
}

if (import.meta.main) await run(process.argv.slice(2));
