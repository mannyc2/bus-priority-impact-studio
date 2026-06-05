import type { z } from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type RouteAuth =
  | { kind: "public" }
  | { kind: "optional-session" }
  | { kind: "session"; scopes: readonly string[] };

export type RouteCachePolicy =
  | { kind: "public"; maxAgeSeconds: number; staleWhileRevalidateSeconds?: number }
  | { kind: "private-no-store" }
  | { kind: "no-store" };

export type IdempotencyPolicy =
  | { kind: "none" }
  | {
      kind: "required";
      header: "Idempotency-Key";
      scope: "actor-route-body";
      replayStatusCodes: readonly number[];
    };

export type RouteSpec = {
  id: string;
  operationId: string;
  method: HttpMethod;
  path: `/${string}`;
  tags: readonly string[];
  summary: string;
  auth: RouteAuth;
  cache: RouteCachePolicy;
  idempotency: IdempotencyPolicy;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  responses?: Readonly<Record<number, z.ZodTypeAny>>;
};
