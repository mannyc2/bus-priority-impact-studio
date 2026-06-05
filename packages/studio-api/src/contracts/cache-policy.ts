import type { RouteCachePolicy } from "./route-spec.js";

export const publicStudioCache = {
  kind: "public",
  maxAgeSeconds: 60,
  staleWhileRevalidateSeconds: 86_400,
} as const satisfies RouteCachePolicy;

export const privateNoStore = {
  kind: "private-no-store",
} as const satisfies RouteCachePolicy;

export const noStore = {
  kind: "no-store",
} as const satisfies RouteCachePolicy;
