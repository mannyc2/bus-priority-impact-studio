import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../lib/head.js";
import {
  fetchStudioBrief,
  fetchStudioFinding,
  fetchStudioRoute,
  mutableStudioLoaderStaleTimeMs,
} from "../../studio/api-client.js";
import { BriefComposerPage } from "../../studio/pages/brief-workflows.js";

type NewBriefSearch = {
  route?: string;
  finding?: string;
};

export const Route = createFileRoute("/briefs/new")({
  validateSearch: (search: { route?: unknown; finding?: unknown }): NewBriefSearch => {
    const next: NewBriefSearch = {};
    if (typeof search.route === "string") next.route = search.route;
    if (typeof search.finding === "string") next.finding = search.finding;
    return next;
  },
  loaderDeps: ({ search }) => ({ finding: search.finding, route: search.route }),
  loader: async ({ abortController, deps }) => {
    const options = { signal: abortController.signal };
    const seedPromise = fetchStudioBrief("m15-madison-corridor", options);
    const routePromise = deps.route ? fetchStudioRoute(deps.route, options) : Promise.resolve(null);
    const findingPromise = deps.finding
      ? fetchStudioFinding(deps.finding, options)
      : Promise.resolve(null);

    const [seed, route, finding] = await Promise.all([seedPromise, routePromise, findingPromise]);
    if (seed === null) return null;

    if (deps.route) {
      return route === null ? null : { ...seed, route: route.route };
    }

    if (deps.finding) {
      return finding === null ? null : { ...seed, route: finding.route };
    }

    return seed;
  },
  staleTime: mutableStudioLoaderStaleTimeMs,
  head: () => routeHead("New Brief"),
  component: NewBriefRoute,
});

function NewBriefRoute() {
  const data = Route.useLoaderData();
  return <BriefComposerPage data={data} mode="new" />;
}
