import {
  createCandidateScopedD1Database,
  isServingReleaseContextCurrent,
  resolveActiveServingRelease,
  type ServingReleaseContext,
} from "@bp/db/d1";
import { decodeStrict } from "@bp/domain/decode";
import type { ReleaseIdentity } from "@bp/domain/studio/shared";
import { ReleaseIdentitySchema } from "@bp/domain/studio/shared";
import type { StudioApiEnv } from "./env.js";

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${error.message} ${error.cause === undefined ? "" : errorMessage(error.cause)}`;
}

function isMissingPointerMigration(error: unknown): boolean {
  const message = errorMessage(error);
  return message.includes("no such table") && message.includes("serving_active_release");
}

export type PreparedServingRequest = {
  context: ServingReleaseContext | null;
  env: StudioApiEnv;
};

export async function prepareServingRequest(
  env: StudioApiEnv,
  requestId: string,
): Promise<PreparedServingRequest> {
  if (env.DB === undefined) return { context: null, env };
  if (env.SERVING_POINTER_ENABLED?.trim().toLowerCase() !== "true") {
    return { context: { kind: "legacy", generation: 0 }, env };
  }
  let context: ServingReleaseContext;
  try {
    context = await resolveActiveServingRelease(env.DB);
  } catch (error) {
    if (!isMissingPointerMigration(error)) throw error;
    console.info("Serving pointer migration is absent; using bounded legacy resolver.", {
      code: "serving_pointer_pre_expand",
      requestId,
    });
    return { context: { kind: "legacy", generation: 0 }, env };
  }
  if (context.kind === "legacy") {
    console.info("Serving pointer is null; using bounded legacy resolver.", {
      code: "serving_pointer_null_bootstrap",
      requestId,
    });
    return { context, env };
  }
  return {
    context,
    env: {
      ...env,
      DB: createCandidateScopedD1Database(env.DB, {
        candidateId: context.candidate.candidateId,
      }),
      SERVING_RELEASE_CONTEXT: context,
      SERVING_UNSCOPED_DB: env.DB,
    },
  };
}

export async function servingRequestStillCurrent(
  request: PreparedServingRequest,
): Promise<boolean> {
  if (request.context?.kind !== "pointed") return true;
  const database = request.env.SERVING_UNSCOPED_DB;
  return database === undefined ? false : isServingReleaseContextCurrent(database, request.context);
}

export function pointedReleaseIdentity(env: StudioApiEnv): ReleaseIdentity | null {
  const context = env.SERVING_RELEASE_CONTEXT;
  if (context === undefined) return null;
  const monthDatasets = context.candidate.datasets.filter(
    (dataset) =>
      dataset.grain === "month" &&
      /^\d{4}-\d{2}$/.test(dataset.coverage.end) &&
      (dataset.coverage.start === null || /^\d{4}-\d{2}$/.test(dataset.coverage.start)),
  );
  if (monthDatasets.length === 0) return null;
  const starts = monthDatasets
    .map((dataset) => dataset.coverage.start)
    .filter((value): value is string => value !== null)
    .toSorted();
  const ends = monthDatasets.map((dataset) => dataset.coverage.end).toSorted();
  const end = ends.at(-1);
  if (end === undefined) return null;
  return decodeStrict(ReleaseIdentitySchema)({
    releaseId: context.release.releaseId,
    publishedAt: context.release.publishedAt,
    coverage: { start: starts[0] ?? null, end },
  });
}
