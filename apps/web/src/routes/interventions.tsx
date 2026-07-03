import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import {
  fetchStudioInterventionsEvidence,
  fetchStudioRoutes,
  staticStudioLoaderStaleTimeMs,
} from "../studio/api-client.js";
import { InterventionsLoadingPage, InterventionsPage } from "../studio/pages/interventions.js";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export const Route = createFileRoute("/interventions")({
  loader: async ({ abortController }) => {
    const [routes, evidenceResult] = await Promise.all([
      fetchStudioRoutes({ signal: abortController.signal }),
      fetchStudioInterventionsEvidence({ signal: abortController.signal }).then(
        (evidence) => ({ ok: true, evidence }) as const,
        (error: unknown) => ({ ok: false, error }) as const,
      ),
    ]);

    if (!evidenceResult.ok) {
      if (isAbortError(evidenceResult.error)) throw evidenceResult.error;
      console.warn("Interventions evidence request failed; rendering route records only.", {
        error: evidenceResult.error,
      });
      return { routes, evidence: [] };
    }

    return { routes, evidence: evidenceResult.evidence.bundles };
  },
  staleTime: staticStudioLoaderStaleTimeMs,
  pendingComponent: InterventionsLoadingPage,
  head: () =>
    routeHead(
      "Interventions",
      "Browse bus-priority intervention timelines and before/after context by route.",
    ),
  component: InterventionsRoute,
});

function InterventionsRoute() {
  const data = Route.useLoaderData();
  return <InterventionsPage routes={data.routes.routes} evidence={data.evidence} />;
}
