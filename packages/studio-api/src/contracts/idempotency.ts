import type { IdempotencyPolicy } from "./route-spec.js";

export const noIdempotency = {
  kind: "none",
} as const satisfies IdempotencyPolicy;

export const requiredMutationIdempotency = {
  kind: "required",
  header: "Idempotency-Key",
  scope: "actor-route-body",
  replayStatusCodes: [200, 201, 204],
} as const satisfies IdempotencyPolicy;
