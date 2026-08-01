import { mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ReleaseStatusResponseSchema } from "@bp/domain/routes";
import { StudioRouteEvidenceBundleSchema } from "@bp/domain/studio";
import {
  StudioRouteDetailResponseSchema,
  StudioRouteHistoryResponseSchema,
  StudioRouteHourlyProfileResponseSchema,
  StudioRouteSpeedHistoryResponseSchema,
} from "@bp/domain/studio/routes";
import { StudioRouteIndex3ResponseSchema } from "@bp/domain/studio/snapshots";
import type { Schema } from "effect";
import { ExactRouteIndexRecoveryAuditSchema } from "../src/lib/route-index-v3-recovery.ts";
import { decodeSchemaStrict } from "../src/lib/schema-decode.ts";

type Arguments = ReadonlyMap<string, string>;
type RequestReceipt = {
  path: string;
  status: number;
  requestId: string | null;
  cfRay: string | null;
};

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

async function writeAtomic(path: string, text: string): Promise<void> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await Bun.write(temporary, text);
  await rename(temporary, output);
}

async function getJson<A>(input: {
  baseUrl: string;
  path: string;
  schema: Schema.Schema<A>;
  receipts: RequestReceipt[];
}): Promise<A> {
  const response = await fetch(new URL(input.path, input.baseUrl), {
    headers: { accept: "application/json", "user-agent": "bp-plan098-release-smoke/2" },
  });
  input.receipts.push({
    path: input.path,
    status: response.status,
    requestId: response.headers.get("x-request-id"),
    cfRay: response.headers.get("cf-ray"),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${input.path} returned ${response.status}: ${text.slice(0, 500)}`);
  }
  return decodeSchemaStrict(input.schema, JSON.parse(text) as unknown);
}

async function run(argv: readonly string[]): Promise<void> {
  const args = parseArguments(argv);
  const baseUrl = required(args, "base-url");
  const audit = decodeSchemaStrict(
    ExactRouteIndexRecoveryAuditSchema,
    JSON.parse(await Bun.file(required(args, "audit")).text()) as unknown,
  );
  const requests: RequestReceipt[] = [];
  const nonce = audit.recoveryId.split(":").at(-1) ?? "plan095";
  const status = await getJson({
    baseUrl,
    path: `/api/v1/status?plan095=${nonce}`,
    schema: ReleaseStatusResponseSchema,
    receipts: requests,
  });
  if (
    status.coverage.start !== audit.servingRelease.coverage.start ||
    status.coverage.end !== audit.servingRelease.coverage.end
  ) {
    throw new Error("Production release coverage does not match the exact-identity source receipt");
  }
  const index = await getJson({
    baseUrl,
    path: `/api/v1/studio/routes?schema=3&plan095=${nonce}`,
    schema: StudioRouteIndex3ResponseSchema,
    receipts: requests,
  });
  if (
    index.releaseId !== status.releaseId ||
    index.publishedAt !== status.publishedAt ||
    index.coverage.start !== status.coverage.start ||
    index.coverage.end !== status.coverage.end
  ) {
    throw new Error("Schema-v3 route index does not match the active pointed release envelope");
  }
  if (index.routes.length !== audit.counts.exactRouteCount) {
    throw new Error(
      `Schema-v3 route count ${index.routes.length} != ${audit.counts.exactRouteCount}`,
    );
  }
  const expectedExactRoutes = [
    { routeId: "B44", slug: "b44", displayLabel: "B44" },
    { routeId: "B44+", slug: "b44-sbs", displayLabel: "B44-SBS" },
  ] as const;
  for (const expected of expectedExactRoutes) {
    const row = index.routes.find((candidate) => candidate.routeId === expected.routeId);
    if (
      row === undefined ||
      row.slug !== expected.slug ||
      row.displayLabel !== expected.displayLabel
    ) {
      throw new Error(`Schema-v3 exact route identity mismatch for ${expected.routeId}`);
    }
  }

  for (const route of [
    { routeId: "BX38", slug: "bx38" },
    { routeId: "B1", slug: "b1" },
    { routeId: "B44", slug: "b44" },
    { routeId: "B44+", slug: "b44-sbs" },
  ]) {
    const detail = await getJson({
      baseUrl,
      path: `/api/v1/studio/routes/${route.slug}?plan095=${nonce}`,
      schema: StudioRouteDetailResponseSchema,
      receipts: requests,
    });
    if (detail.route.routeId !== route.routeId || detail.route.slug !== route.slug) {
      throw new Error(`Route-detail exact identity mismatch for ${route.routeId}`);
    }
  }

  for (const slug of ["bx38", "b1"] as const) {
    await getJson({
      baseUrl,
      path: `/api/v1/studio/routes/${slug}/history?plan095=${nonce}`,
      schema: StudioRouteHistoryResponseSchema,
      receipts: requests,
    });
    await getJson({
      baseUrl,
      path: `/api/v1/studio/routes/${slug}/hourly-profile?plan095=${nonce}`,
      schema: StudioRouteHourlyProfileResponseSchema,
      receipts: requests,
    });
    await getJson({
      baseUrl,
      path: `/api/v1/studio/routes/${slug}/speed-history?plan095=${nonce}`,
      schema: StudioRouteSpeedHistoryResponseSchema,
      receipts: requests,
    });
    await getJson({
      baseUrl,
      path: `/api/v1/studio/routes/${slug}/timeline?plan095=${nonce}`,
      schema: StudioRouteEvidenceBundleSchema,
      receipts: requests,
    });
  }

  const smokeReceipt = {
    artifactKind: "bp.ops.exact_route_index_v3_production_smoke.v2",
    schemaVersion: 2,
    checkedAt: new Date().toISOString(),
    baseUrl,
    recoveryId: audit.recoveryId,
    sourceServingRelease: audit.servingRelease,
    servingRelease: {
      releaseId: status.releaseId,
      publishedAt: status.publishedAt,
      coverage: status.coverage,
    },
    exactRouteCount: index.routes.length,
    requests,
  };
  await writeAtomic(required(args, "output"), `${JSON.stringify(smokeReceipt, null, 2)}\n`);
  console.log(JSON.stringify(smokeReceipt));
}

if (import.meta.main) await run(process.argv.slice(2));
