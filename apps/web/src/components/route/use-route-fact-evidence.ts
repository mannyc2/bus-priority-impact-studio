import type { MapManifestResponse, MapRouteFactsResponse } from "@bp/domain/maps";
import { useEffect, useState } from "react";
import {
  type RouteFactEvidenceState,
  type RouteFactParityInput,
  resolveRouteFactEvidence,
  routeFactParityInput,
} from "@/components/route/route-fact-evidence";
import {
  type ArtifactLoad,
  fetchMapManifest,
  fetchMapRouteFacts,
  type StudioQueryOptions,
} from "@/studio/api-client";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

export type RouteFactEvidenceSource = {
  fetchManifest: (options?: StudioQueryOptions) => Promise<MapManifestResponse | null>;
  fetchRouteFacts: (
    manifest: MapManifestResponse,
    options?: StudioQueryOptions,
  ) => Promise<ArtifactLoad<MapRouteFactsResponse>>;
};

const defaultSource: RouteFactEvidenceSource = {
  fetchManifest: fetchMapManifest,
  fetchRouteFacts: fetchMapRouteFacts,
};

export type SettledRouteFactEvidenceState = Exclude<RouteFactEvidenceState, { status: "pending" }>;

function errorReason(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Load only the map manifest and its hash-verified compact route-facts artifact.
 * The source argument is a deterministic unit-test seam, not a second runtime path.
 */
export async function loadRouteFactEvidence(
  detail: RouteFactParityInput,
  options: StudioQueryOptions = {},
  source: RouteFactEvidenceSource = defaultSource,
): Promise<SettledRouteFactEvidenceState> {
  let stage: "manifest" | "route_facts" = "manifest";
  try {
    const manifest = await source.fetchManifest(options);
    options.signal?.throwIfAborted();
    if (manifest === null) {
      return {
        status: "unavailable",
        kind: "manifest_unavailable",
        reason: "The map artifact manifest is unavailable.",
      };
    }

    stage = "route_facts";
    const load = await source.fetchRouteFacts(manifest, options);
    options.signal?.throwIfAborted();
    switch (load.status) {
      case "ready":
        return resolveRouteFactEvidence(detail, manifest, load.data);
      case "unavailable":
        return {
          status: "unavailable",
          kind: "route_facts_unavailable",
          reason: load.reason,
        };
      case "missing":
        return {
          status: "unavailable",
          kind: "route_facts_missing",
          reason: "The manifest-declared map route-facts artifact is missing.",
        };
      case "request_failed":
        return { status: "error", kind: load.status, reason: load.reason };
      case "invalid_contract":
        return { status: "error", kind: load.status, reason: load.reason };
      case "integrity_mismatch":
        return {
          status: "error",
          kind: load.status,
          reason: `Map route facts failed integrity verification (expected ${load.expectedSha256}, received ${load.actualSha256}).`,
        };
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return {
      status: "error",
      kind: stage === "manifest" ? "manifest_request_failed" : "route_facts_request_failed",
      reason: errorReason(error, `The ${stage.replace("_", " ")} request failed.`),
    };
  }
}

/** One lazy request owner for every route-fact consumer in the Segments tab. */
export function useRouteFactEvidence(data: StudioRouteDetailResponse): RouteFactEvidenceState {
  const detail = routeFactParityInput(data);
  const requestKey = JSON.stringify(detail);
  const [owned, setOwned] = useState<{
    requestKey: string;
    state: RouteFactEvidenceState;
  }>(() => ({ requestKey, state: { status: "pending" } }));

  useEffect(() => {
    const controller = new AbortController();
    setOwned({ requestKey, state: { status: "pending" } });
    loadRouteFactEvidence(detail, { signal: controller.signal })
      .then((state) => {
        if (!controller.signal.aborted) setOwned({ requestKey, state });
      })
      .catch(() => {
        // Cleanup aborts are expected. Non-abort failures are classified by
        // loadRouteFactEvidence before this promise settles.
      });
    return () => controller.abort();
  }, [requestKey]);

  return owned.requestKey === requestKey ? owned.state : { status: "pending" };
}
