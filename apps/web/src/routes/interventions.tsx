import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { routeHead } from "../lib/head.js";
import {
  fetchStudioInterventionCorpus,
  fetchStudioInterventionFacetIndex,
  fetchStudioInterventionsEvidence,
  fetchStudioRoutes,
  fetchStudioStudiesIndex,
  staticStudioLoaderStaleTimeMs,
} from "../studio/api-client.js";
import type { StudioInterventionTreatmentFamily } from "../studio/api-contract.js";
import { ROUTE_INDEX_ALL_BOROUGHS, ROUTE_INDEX_BOROUGHS } from "../studio/home-route-index.js";

// Lazy so the page module (SourceNote popover stack) stays out of the entry bundle.
const InterventionsPage = lazy(() =>
  import("../studio/pages/interventions.js").then((module) => ({
    default: module.InterventionsPage,
  })),
);

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

const INTERVENTION_STATUSES = ["all", "evaluated", "future", "source-gap"] as const;
const INTERVENTION_VIEWS = ["documented", "planned"] as const;
const INTERVENTION_FAMILIES = [
  "bus_priority_lane",
  "signal_priority",
  "stop_change",
  "street_design",
  "boarding_and_fare",
  "enforcement",
  "service_change",
  "service_package",
  "capital",
  "curb_management",
  "customer_information",
  "other",
] as const satisfies readonly StudioInterventionTreatmentFamily[];

export type InterventionsSearch = {
  status?: (typeof INTERVENTION_STATUSES)[number];
  view?: (typeof INTERVENTION_VIEWS)[number];
  studied?: true;
  borough?: (typeof ROUTE_INDEX_BOROUGHS)[number] | typeof ROUTE_INDEX_ALL_BOROUGHS;
  family?: StudioInterventionTreatmentFamily | "all";
  route?: string;
  q?: string;
};

export function validateInterventionsSearch(search: Record<string, unknown>): InterventionsSearch {
  const {
    status: statusValue,
    view: viewValue,
    studied: studiedValue,
    borough: boroughValue,
    family: familyValue,
    route: routeValue,
    q: queryValue,
  } = search;
  const status = member(INTERVENTION_STATUSES, statusValue);
  const view = member(INTERVENTION_VIEWS, viewValue);
  const studied = studiedValue === true || studiedValue === "true" ? true : undefined;
  const borough = member(
    [ROUTE_INDEX_ALL_BOROUGHS, ...ROUTE_INDEX_BOROUGHS] as const,
    boroughValue,
  );
  const family = member(["all", ...INTERVENTION_FAMILIES] as const, familyValue);
  const route = boundedTrimmedSearch(routeValue, 96);
  const q = boundedTrimmedSearch(queryValue, 120);
  return {
    ...(view === "planned" || (view === undefined && status === "future")
      ? { view: "planned" as const }
      : {}),
    ...(studied === true || (studied === undefined && status === "evaluated")
      ? { studied: true as const }
      : {}),
    ...(status === "source-gap" ? { status } : {}),
    ...(borough === undefined || borough === ROUTE_INDEX_ALL_BOROUGHS ? {} : { borough }),
    ...(family === undefined || family === "all" ? {} : { family }),
    ...(route === undefined ? {} : { route }),
    ...(q === undefined ? {} : { q }),
  };
}

function member<const TValue extends string>(
  values: readonly TValue[],
  value: unknown,
): TValue | undefined {
  return typeof value === "string" && (values as readonly string[]).includes(value)
    ? (value as TValue)
    : undefined;
}

function boundedTrimmedSearch(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return undefined;
  for (const character of trimmed) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return undefined;
  }
  return trimmed;
}

export const Route = createFileRoute("/interventions")({
  loader: async ({ abortController }) => {
    const [routes, evidenceResult, corpusResult, studiesIndex, facetIndex] = await Promise.all([
      fetchStudioRoutes({ signal: abortController.signal }),
      fetchStudioInterventionsEvidence({ signal: abortController.signal }).then(
        (evidence) => ({ ok: true, evidence }) as const,
        (error: unknown) => ({ ok: false, error }) as const,
      ),
      fetchStudioInterventionCorpus({ signal: abortController.signal }).then(
        (corpus) => ({ ok: true, corpus }) as const,
        (error: unknown) => ({ ok: false, error }) as const,
      ),
      // Studies index is nullable; a failure never blocks the page.
      fetchStudioStudiesIndex({ signal: abortController.signal }).catch((error: unknown) => {
        if (isAbortError(error)) throw error;
        console.warn("Studies index request failed; rendering rows without studies.", { error });
        return null;
      }),
      fetchStudioInterventionFacetIndex({ signal: abortController.signal }).catch(
        (error: unknown) => {
          if (isAbortError(error)) throw error;
          console.warn("Intervention facet index request failed; typed filters are unavailable.", {
            error,
          });
          return null;
        },
      ),
    ]);

    if (!evidenceResult.ok) {
      if (isAbortError(evidenceResult.error)) throw evidenceResult.error;
      console.warn("Interventions evidence request failed; rendering route records only.", {
        error: evidenceResult.error,
      });
      if (!corpusResult.ok && isAbortError(corpusResult.error)) throw corpusResult.error;
      return {
        routes,
        evidence: [],
        corpus: corpusResult.ok ? corpusResult.corpus : null,
        studiesIndex,
        facetIndex,
      };
    }

    if (!corpusResult.ok) {
      if (isAbortError(corpusResult.error)) throw corpusResult.error;
      console.warn("Intervention corpus request failed; rendering registry records only.", {
        error: corpusResult.error,
      });
    }

    return {
      routes,
      evidence: evidenceResult.evidence.bundles,
      corpus: corpusResult.ok ? corpusResult.corpus : null,
      studiesIndex,
      facetIndex,
    };
  },
  validateSearch: (search: Record<string, unknown>): InterventionsSearch =>
    validateInterventionsSearch(search),
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
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Suspense fallback={<InterventionsRouteFallback />}>
      <InterventionsPage
        routes={data.routes.routes}
        evidence={data.evidence}
        corpus={data.corpus}
        studiesIndex={data.studiesIndex}
        facetIndex={data.facetIndex}
        search={search}
        onSearchChange={(nextSearch) => {
          void navigate({ search: nextSearch });
        }}
      />
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
