import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ClaimList, RouteBadge } from "../../design-system/primitives.js";
import { Badge } from "@/components/ui/badge";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";
import { getStudioBrief, getStudioRoute, studioBriefs } from "../sample-data.js";
import { NotFoundPage } from "./not-found.js";

export function BriefsGalleryPage() {
  return (
    <StudioPage>
      <StudioHero
        label="Briefs"
        title="Cited route evidence briefs"
        body="Briefs are the output: claim-driven, caveated, and backed by the same route, segment, and source objects that power the rest of the studio."
        action={
          <Link
            to="/briefs/new"
            viewTransition
            className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 text-[12.5px] font-medium text-[var(--bp-color-paper)] no-underline"
          >
            New brief
            <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        {studioBriefs.map((brief) => {
          const route = getStudioRoute(brief.routeSlug);
          if (!route) return null;

          return (
            <Link
              key={brief.id}
              to="/briefs/$briefId"
              params={{ briefId: brief.id }}
              viewTransition
              className="block rounded-[3px] bg-[var(--bp-color-card)] p-5 text-[var(--bp-color-ink)] no-underline shadow-[0_0_0_1px_var(--bp-color-rule)]"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
                <Badge variant={brief.status === "Published" ? "good" : "warn"}>{brief.status}</Badge>
              </div>
              <div className="text-[20px] font-semibold tracking-[0]">{brief.title}</div>
              <p className="mt-2 text-[13px] leading-6 text-[var(--bp-color-ink-70)]">
                {brief.summary}
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-[var(--bp-color-accent)]">
                Read brief
                <ArrowRight size={13} />
              </div>
            </Link>
          );
        })}
      </div>
    </StudioPage>
  );
}

export function BriefReadingPage({ briefId }: { briefId: string }) {
  const brief = getStudioBrief(briefId);
  if (!brief) return <NotFoundPage />;

  const route = getStudioRoute(brief.routeSlug);
  if (!route) return <NotFoundPage />;

  return (
    <StudioPage
      rail={
        <StudioPanel>
          <div className="mb-3 text-[13px] font-semibold">Claims</div>
          <ClaimList
            density="compact"
            claims={brief.claims.map((claim, index) => ({
              n: index + 1,
              title: claim,
              strength: index === 2 ? 3 : 5,
              evidence: index + 2,
              caveats: index === 2 ? 2 : 1,
              weak: index === 2,
            }))}
          />
        </StudioPanel>
      }
    >
      <StudioHero
        label={
          <span className="inline-flex items-center gap-2">
            <RouteBadge route={route.label} sbs={route.sbs} size="md" />
            {brief.status}
          </span>
        }
        title={brief.title}
        body={brief.summary}
        action={
          <Link
            to="/briefs/$briefId/evidence"
            params={{ briefId: brief.id }}
            viewTransition
            className="inline-flex h-9 items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] px-3.5 text-[12.5px] font-medium no-underline"
          >
            Evidence
            <ArrowRight size={14} />
          </Link>
        }
      />
      <article className="max-w-[760px] rounded-[3px] bg-[var(--bp-color-card)] p-7 text-[15px] leading-8 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <p>
          On weekdays in March 2026, buses on the Madison Avenue segment averaged{" "}
          <strong>4.2 mph northbound</strong>, with the worst hours concentrated between 16:00 and
          19:00.
        </p>
        <p>
          The segment carries enough riders that the lost time is visible at the route scale. This
          is why the claim belongs in a brief rather than staying hidden in a table.
        </p>
        <p>
          The treatment gap matters because the rest of the route already has a stronger stack of
          lanes, enforcement, and signal priority. The caveat is attribution: multiple citywide
          changes overlap in time.
        </p>
      </article>
    </StudioPage>
  );
}
