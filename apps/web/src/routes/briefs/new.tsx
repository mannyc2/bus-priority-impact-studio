import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../lib/head.js";
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
  head: () => routeHead("New Brief"),
  component: NewBriefRoute,
});

function NewBriefRoute() {
  const route = Route.useSearch({ select: (search) => search.route });
  return route ? <BriefComposerPage routeSlug={route} /> : <BriefComposerPage />;
}
