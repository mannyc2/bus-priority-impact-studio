import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { editorialStudioLoaderStaleTimeMs, fetchStudioBriefs } from "../studio/api-client.js";
import { BriefsGalleryPage } from "../studio/pages/briefs.js";

export const Route = createFileRoute("/briefs")({
  loader: ({ abortController }) => fetchStudioBriefs({ signal: abortController.signal }),
  staleTime: editorialStudioLoaderStaleTimeMs,
  head: () => routeHead("Briefs"),
  component: BriefsRoute,
});

function BriefsRoute() {
  const data = Route.useLoaderData();
  return <BriefsGalleryPage data={data} />;
}
