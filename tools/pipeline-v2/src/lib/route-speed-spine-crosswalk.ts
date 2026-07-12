import { routeSpeedSpineArtifactPath } from "@bp/analytics/artifacts";
import {
  buildRouteSpeedSpineCrosswalk,
  classifyRouteSpeedSpineArtifact,
  type RouteSpeedSpineArtifact,
  type RouteSpeedSpineCrosswalk,
  type RouteSpeedSpineReadinessAudit,
  routeSpeedSpineRouteSlug,
} from "@bp/analytics/feature-history";
import { readJsonIfExists } from "./json.ts";

export type LoadedRouteSpeedSpineCrosswalk =
  | {
      status: "ready";
      path: string;
      artifact: RouteSpeedSpineArtifact;
      audit: RouteSpeedSpineReadinessAudit;
      crosswalk: RouteSpeedSpineCrosswalk;
    }
  | {
      status: "not_built";
      path: string;
      routeId: string;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRouteSpeedSpineArtifact(
  value: unknown,
  input: { path: string; routeId: string },
): asserts value is RouteSpeedSpineArtifact {
  if (!isObject(value)) throw new Error(`Invalid route speed spine ${input.path}: not an object.`);
  if (value["artifactKind"] !== "studio_route_speed_spine" || value["schemaVersion"] !== 1) {
    throw new Error(`Invalid route speed spine ${input.path}: unsupported artifact contract.`);
  }
  if (
    typeof value["routeId"] !== "string" ||
    value["routeId"].trim().toUpperCase() !== input.routeId
  ) {
    throw new Error(
      `Invalid route speed spine ${input.path}: expected route ${input.routeId}, received ${String(value["routeId"])}.`,
    );
  }
  if (!isObject(value["summary"]) || !isObject(value["source"]) || !isObject(value["validation"])) {
    throw new Error(`Invalid route speed spine ${input.path}: missing summary/source/validation.`);
  }
  if (
    !Array.isArray(value["nodes"]) ||
    !Array.isArray(value["segments"]) ||
    !Array.isArray(value["monthCoverage"])
  ) {
    throw new Error(`Invalid route speed spine ${input.path}: missing artifact arrays.`);
  }
  if (!isObject(value["sourceKeys"]) || !Array.isArray(value["sourceKeys"]["observed"])) {
    throw new Error(
      `Invalid route speed spine ${input.path}: exact observed source keys are missing; rebuild the spine artifact.`,
    );
  }
  for (const [index, segment] of value["segments"].entries()) {
    if (
      !isObject(segment) ||
      typeof segment["segmentId"] !== "string" ||
      !isObject(segment["raw"]) ||
      !Array.isArray(segment["raw"]["sourceKeys"])
    ) {
      throw new Error(
        `Invalid route speed spine ${input.path}: segment ${index} has no exact source-key aliases.`,
      );
    }
  }
}

export async function loadRouteSpeedSpineCrosswalk(input: {
  artifactRoot: string;
  routeId: string;
  spinePath?: string | undefined;
  requireSpine?: boolean | undefined;
}): Promise<LoadedRouteSpeedSpineCrosswalk> {
  const routeId = input.routeId.trim().toUpperCase();
  const path =
    input.spinePath ??
    routeSpeedSpineArtifactPath({
      artifactRoot: input.artifactRoot,
      routeSlug: routeSpeedSpineRouteSlug(routeId),
    });
  const value = await readJsonIfExists<unknown>(path);
  if (value === null) {
    if (input.requireSpine === true) {
      throw new Error(`Route speed spine is required for ${routeId} but was not found at ${path}.`);
    }
    return { status: "not_built", path, routeId };
  }

  assertRouteSpeedSpineArtifact(value, { path, routeId });
  if (value.validation.status === "fail") {
    const reasons = value.validation.issues.map((issue) => issue.code).join(", ");
    throw new Error(
      `Invalid route speed spine ${path} for ${routeId}: ${reasons || "validation failed"}.`,
    );
  }
  const crosswalk = buildRouteSpeedSpineCrosswalk(value);
  return {
    status: "ready",
    path,
    artifact: value,
    audit: classifyRouteSpeedSpineArtifact(value),
    crosswalk,
  };
}
