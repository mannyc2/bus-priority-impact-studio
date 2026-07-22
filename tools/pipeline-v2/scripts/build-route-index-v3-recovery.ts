import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ReleaseStatusResponseSchema } from "@bp/domain/routes";
import { decodeSchemaStrict } from "../src/lib/schema-decode.ts";
import {
  buildExactRouteIndexRecovery,
  type RouteCatalogRecoveryRow,
  type RouteCatalogTypeRecoveryRow,
} from "../src/lib/route-index-v3-recovery.ts";

const EXPECTED_SOURCE = {
  wikiRelease: "v1-rc25",
  manifestSha256: "77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f",
  routeIdentitySha256: "47d5976ce87cc00069e68909df38a2bfeffa1374edb3991f038b483fb013b586",
  currentBusRoutesSha256:
    "d0147d9bb26dd142fb2cb325c32d30284bc5207853be2638e77723ef695b69d4",
  routeEvidenceIndexSha256:
    "fd07c9991b3d7c56905b95a2e387eaee182e314eb84a2cb26de68e06b5cf0807",
  routeEvidenceIndexBytes: 392_566,
} as const;

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

async function readJson(path: string): Promise<{ bytes: Uint8Array; value: unknown }> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { bytes, value: JSON.parse(text) as unknown };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
  const indexPath = required(args, "route-evidence-index");
  const dbPath = required(args, "db");
  const releaseStatusPath = required(args, "release-status");
  const outputSqlPath = required(args, "output-sql");
  const outputReceiptPath = required(args, "output-receipt");
  const preparedAt = required(args, "prepared-at");
  const [indexInput, releaseInput] = await Promise.all([
    readJson(indexPath),
    readJson(releaseStatusPath),
  ]);
  const releaseStatus = decodeSchemaStrict(ReleaseStatusResponseSchema, releaseInput.value);
  if (releaseStatus.release.status !== "pass") {
    throw new Error(`Serving release status must pass, got ${releaseStatus.release.status}`);
  }

  const sqlite = new Database(dbPath, { readonly: true });
  try {
    const catalogRows = sqlite
      .query<RouteCatalogRecoveryRow, []>(
        `SELECT route_id AS routeId,
                route_short_name AS routeShortName,
                route_long_name AS routeLongName
           FROM local_route_catalog
          ORDER BY route_id`,
      )
      .all();
    const routeTypeRows = sqlite
      .query<RouteCatalogTypeRecoveryRow, []>(
        `SELECT route_id AS routeId,
                type_rank AS typeRank,
                route_type AS routeType
           FROM local_route_catalog_type
          ORDER BY route_id, type_rank`,
      )
      .all();
    const result = buildExactRouteIndexRecovery({
      routeEvidenceIndex: indexInput.value,
      routeEvidenceIndexSha256: sha256(indexInput.bytes),
      routeEvidenceIndexBytes: indexInput.bytes.byteLength,
      catalogRows,
      routeTypeRows,
      servingRelease: {
        releaseId: releaseStatus.releaseId,
        publishedAt: releaseStatus.publishedAt,
        coverage: releaseStatus.coverage,
      },
      preparedAt,
      expectedSource: EXPECTED_SOURCE,
    });
    await Promise.all([
      writeAtomic(outputSqlPath, result.sql),
      writeAtomic(outputReceiptPath, result.receiptText),
    ]);
    console.log(
      JSON.stringify({
        recoveryId: result.receipt.recoveryId,
        counts: result.receipt.counts,
        projectionSha256: result.receipt.projectionSha256,
        sqlSha256: result.receipt.sqlSha256,
      }),
    );
  } finally {
    sqlite.close(false);
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
