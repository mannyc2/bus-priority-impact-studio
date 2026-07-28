import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { routeHead } from "../lib/head.js";
import {
  fetchPublicInterventionEpisodes,
  staticStudioLoaderStaleTimeMs,
} from "../studio/api-client.js";
import type { StudioInterventionTreatmentFamily } from "../studio/api-contract.js";
import { ROUTE_INDEX_ALL_BOROUGHS, ROUTE_INDEX_BOROUGHS } from "../studio/home-route-index.js";
import type { RouteChangeGroup } from "../studio/network-change-record.js";

const PublicInterventions = lazy(() =>
  import("../components/interventions/PublicInterventions.js").then((module) => ({
    default: module.PublicInterventions,
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
// Spelled out rather than imported: this route module is eager, and pulling a
// value out of `network-change-record` would drag the whole derivation into the
// entry bundle. `satisfies` keeps the two lists in step.
const INTERVENTION_GROUPS = [
  "recent",
  "most",
  "measured",
  "proposed",
  "never",
] as const satisfies readonly RouteChangeGroup[];

export type InterventionsSearch = {
  status?: (typeof INTERVENTION_STATUSES)[number];
  view?: (typeof INTERVENTION_VIEWS)[number];
  /** Route-index view above the ledger. Defaults to `recent`, omitted at default. */
  group?: (typeof INTERVENTION_GROUPS)[number];
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
    group: groupValue,
    studied: studiedValue,
    borough: boroughValue,
    family: familyValue,
    route: routeValue,
    q: queryValue,
  } = search;
  const status = member(INTERVENTION_STATUSES, statusValue);
  const view = member(INTERVENTION_VIEWS, viewValue);
  const group = member(INTERVENTION_GROUPS, groupValue);
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
    ...(group === undefined || group === "recent" ? {} : { group }),
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
    const publicArtifact = await fetchPublicInterventionEpisodes({
      signal: abortController.signal,
    }).catch((error: unknown) => {
      if (isAbortError(error)) throw error;
      console.warn("Public intervention episode artifact request failed.", { error });
      return null;
    });
    return { publicArtifact };
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
  return (
    <Suspense fallback={<InterventionsRouteFallback />}>
      {data.publicArtifact === null ? (
        <InterventionsUnavailable />
      ) : (
        <main className="min-h-full p-7 max-sm:p-4">
          <PublicInterventions
            artifact={data.publicArtifact}
            initialRouteQuery={search.route ?? ""}
          />
        </main>
      )}
    </Suspense>
  );
}

function InterventionsUnavailable() {
  return (
    <main className="min-h-full p-7 max-sm:p-4">
      <div className="border-b border-[var(--bp-color-rule)] pb-6">
        <h1 className="m-0 text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] max-sm:text-[25px]">
          Interventions
        </h1>
        <p className="mt-3 max-w-[68ch] text-[14px] leading-[1.55] text-[var(--bp-color-ink-70)]">
          The source-backed intervention history is temporarily unavailable.
        </p>
      </div>
    </main>
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
