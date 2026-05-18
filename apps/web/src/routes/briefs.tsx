import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { BriefsGalleryPage } from "../studio/pages/briefs.js";

export const Route = createFileRoute("/briefs")({
  head: () => routeHead("Briefs"),
  component: BriefsGalleryPage,
});
