import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "../components/ui/skeleton.js";
import { routeHead } from "../lib/head.js";
import { NotFoundPage } from "../studio/pages/not-found.js";

const DevDesignReview = import.meta.env.DEV
  ? lazy(() =>
      import("../dev/design-review.js").then((module) => ({ default: module.DesignReview })),
    )
  : null;

export const Route = createFileRoute("/$")({
  head: ({ params }) =>
    import.meta.env.DEV && params._splat === "system"
      ? routeHead(
          "Design Review",
          "Dev-only review environment for the proposed public interventions and route history pages.",
        )
      : routeHead("Not Found"),
  component: SplatPage,
});

function SplatPage() {
  const { _splat } = Route.useParams();
  if (_splat !== "system" || DevDesignReview === null) {
    return <NotFoundPage />;
  }

  return (
    <Suspense fallback={<PreviewFallback />}>
      <DevDesignReview />
    </Suspense>
  );
}

function PreviewFallback() {
  return (
    <main className="min-h-full p-7 max-sm:p-4">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Loading design review
        </span>
        <Skeleton className="h-20" />
        <Skeleton className="h-10" />
        <Skeleton className="h-[420px]" />
      </div>
    </main>
  );
}
