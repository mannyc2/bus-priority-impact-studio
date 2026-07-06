import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { routeHead } from "../lib/head.js";
import {
  fetchStudioInterventionsEvidence,
  fetchStudioRoutes,
  staticStudioLoaderStaleTimeMs,
} from "../studio/api-client.js";

// Lazy so the page module (SourceNote popover stack) stays out of the entry bundle.
const InterventionsPage = lazy(() =>
  import("../studio/pages/interventions.js").then((module) => ({
    default: module.InterventionsPage,
  })),
);

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
  pendingComponent: InterventionsRouteFallback,
  head: () =>
    routeHead(
      "Interventions",
      "Browse bus-priority intervention timelines and before/after context by route.",
    ),
  component: InterventionsRoute,
});

function InterventionsRoute() {
  const data = Route.useLoaderData();
  return (
    <Suspense fallback={<InterventionsRouteFallback />}>
      <InterventionsPage routes={data.routes.routes} evidence={data.evidence} />
    </Suspense>
  );
}

function InterventionsRouteFallback() {
  return (
    <main className="min-h-full p-7 max-sm:p-4">
      <div className="mb-6 h-[84px] max-w-[640px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
      <div className="mb-5 h-[74px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
      <div className="h-[420px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
    </main>
  );
}
