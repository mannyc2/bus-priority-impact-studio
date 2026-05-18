import { createFileRoute } from "@tanstack/react-router";

import { SystemGallery } from "../dev/system-gallery.js";
import { routeHead } from "../lib/head.js";
import { NotFoundPage } from "../studio/pages/not-found.js";

export const Route = createFileRoute("/system")({
  head: () =>
    routeHead(
      "Design System",
      "Dev-only example gallery for the Bus Priority Impact Studio composites.",
    ),
  component: SystemRoute,
});

function SystemRoute() {
  if (!import.meta.env.DEV) return <NotFoundPage />;
  return <SystemGallery />;
}
