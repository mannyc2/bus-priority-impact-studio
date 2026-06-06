import { join } from "node:path";

export function speedPaceShadowAuditPath(input: {
  readonly artifactRoot: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-shadow-audits",
    input.releaseMonth,
    "speed-pace-route-month-shadow.json",
  );
}

export function routeMonthShadowAuditPath(input: {
  readonly artifactRoot: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-shadow-audits",
    input.releaseMonth,
    "route-month-false-negative-shadow.json",
  );
}
