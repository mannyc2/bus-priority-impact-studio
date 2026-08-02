import {
  createCandidateScopedD1Database,
  isServingReleaseContextCurrent,
  type PointedServingReleaseContext,
  resolveActiveServingRelease,
} from "@bp/db/d1";
import { decodeStrict } from "@bp/domain/decode";
import type { ReleaseIdentity } from "@bp/domain/studio/shared";
import { ReleaseIdentitySchema } from "@bp/domain/studio/shared";
import type { StudioApiEnv } from "./env.js";
import { ServingDataCorruptionError } from "./serving-decode-policy.js";

export type PreparedServingRequest = {
  context: PointedServingReleaseContext | null;
  env: StudioApiEnv;
};

export async function prepareServingRequest(env: StudioApiEnv): Promise<PreparedServingRequest> {
  if (env.DB === undefined) return { context: null, env };
  const context = await resolveActiveServingRelease(env.DB);
  if (context.kind === "legacy") {
    throw new ServingDataCorruptionError(
      "active_pointer_required",
      "Active serving pointer is required.",
    );
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
  const reviewedServing = context.candidate.datasets.find(
    (dataset) => dataset.datasetId === "reviewed-serving",
  );
  if (
    reviewedServing !== undefined &&
    reviewedServing.grain === "month" &&
    /^\d{4}-\d{2}$/.test(reviewedServing.coverage.end) &&
    (reviewedServing.coverage.start === null ||
      /^\d{4}-\d{2}$/.test(reviewedServing.coverage.start))
  ) {
    return decodeStrict(ReleaseIdentitySchema)({
      releaseId: context.release.releaseId,
      publishedAt: context.release.publishedAt,
      coverage: {
        start: reviewedServing.coverage.start,
        end: reviewedServing.coverage.end,
      },
    });
  }
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
