import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
  AiAttribution,
  Caveat,
  ChartFrame,
  Chip,
  ClaimList,
  CommentBadge,
  Heatmap,
  ReviewerStack,
  RouteBadge,
  Timeline,
} from "../../design-system/primitives.js";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";
import { getStudioBrief, getStudioRoute } from "../sample-data.js";
import { NotFoundPage } from "./not-found.js";

export function BriefEvidencePage({ briefId }: { briefId: string }) {
  const brief = getStudioBrief(briefId);
  if (!brief) return <NotFoundPage />;

  const route = getStudioRoute(brief.routeSlug);
  if (!route) return <NotFoundPage />;

  return (
    <StudioPage>
      <StudioHero
        label={
          <span className="inline-flex items-center gap-2">
            <RouteBadge route={route.label} sbs={route.sbs} size="md" />
            Evidence
          </span>
        }
        title="Citation evidence"
        body="Every citation can open into a chart, computation note, source object, and caveat trail."
      />
      <div className="grid grid-cols-[1fr_320px] gap-5 max-lg:grid-cols-1">
        <ChartFrame title="Speed by hour and day" source="MTA segment speeds">
          <Heatmap
            rows={["Mon", "Tue", "Wed", "Thu", "Fri"]}
            cols={["6", "7", "8", "9", "16", "17", "18", "19"]}
            values={[
              [6.2, 5.8, 5.1, 4.8, 4.4, 4.2, 4.5, 5.1],
              [6.0, 5.7, 5.2, 4.9, 4.1, 4.0, 4.6, 5.0],
              [6.1, 5.9, 5.0, 4.7, 4.2, 4.1, 4.4, 4.9],
              [6.3, 5.8, 5.3, 5.0, 4.3, 4.2, 4.7, 5.2],
              [6.4, 6.0, 5.5, 5.1, 4.8, 4.6, 5.0, 5.4],
            ]}
            min={4}
            max={7}
          />
        </ChartFrame>
        <StudioPanel>
          <div className="text-[13px] font-semibold">Computation</div>
          <p className="text-[12px] leading-5 text-[var(--bp-color-ink-70)]">
            Rider-hours lost is computed by applying scheduled-vs-observed travel time delta to
            hourly ridership, then summing across weekdays.
          </p>
          <Caveat tone="warn">
            Single-month windows are useful for briefs but not causal proof.
          </Caveat>
        </StudioPanel>
      </div>
    </StudioPage>
  );
}

export function BriefComposerPage({
  briefId,
  routeSlug,
}: {
  briefId?: string;
  routeSlug?: string;
}) {
  const seedBrief = getStudioBrief("m15-madison-corridor");
  const brief = briefId ? getStudioBrief(briefId) : seedBrief;
  if (!brief) return <NotFoundPage />;

  const requestedRoute = routeSlug ? getStudioRoute(routeSlug) : undefined;
  if (routeSlug && !requestedRoute) return <NotFoundPage />;

  const route = requestedRoute ?? getStudioRoute(brief.routeSlug);
  if (!route) return <NotFoundPage />;

  return (
    <StudioPage
      rail={
        <StudioPanel>
          <div className="mb-3 text-[13px] font-semibold">Evidence inspector</div>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="accent">Numbers</Chip>
            <Chip tone="neutral">Charts</Chip>
            <Chip tone="neutral">Sources</Chip>
            <Chip tone="neutral">Caveats</Chip>
          </div>
          <AiAttribution>
            Drafting is staged claim by claim so the analyst can accept, edit, or drop weak evidence
            before publishing.
          </AiAttribution>
        </StudioPanel>
      }
    >
      <StudioHero
        label={
          <span className="inline-flex items-center gap-2">
            <RouteBadge route={route.label} sbs={route.sbs} size="md" />
            Composer
          </span>
        }
        title={brief.title}
        body="Claims are the unit of composition. Evidence and caveats attach to each claim, not to the brief as unstructured metadata."
        action={
          <Link
            to="/briefs/$briefId/review"
            params={{ briefId: brief.id }}
            viewTransition
            className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 text-[12.5px] font-medium text-[var(--bp-color-paper)] no-underline"
          >
            Send to review
            <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="grid grid-cols-[260px_1fr] gap-5 max-lg:grid-cols-1">
        <StudioPanel>
          <ClaimList
            claims={brief.claims.map((claim, index) => ({
              n: index + 1,
              title: claim,
              strength: index === 2 ? 3 : 5,
              evidence: index + 2,
              caveats: index === 2 ? 2 : 1,
              editing: index === 0,
              weak: index === 2,
            }))}
          />
        </StudioPanel>
        <StudioPanel>
          <div className="font-mono text-[11px] font-bold text-[var(--bp-color-ink-55)]">
            CLAIM 01
          </div>
          <div className="mt-2 text-[22px] font-semibold tracking-[0]">{brief.claims[0]}</div>
          <p className="mt-4 text-[13px] leading-6 text-[var(--bp-color-ink-70)]">
            Attach the speed chart, rider-hour computation, and treatment coverage caveat before the
            brief can move to review.
          </p>
        </StudioPanel>
      </div>
    </StudioPage>
  );
}

export function BriefReviewPage({ briefId }: { briefId: string }) {
  const brief = getStudioBrief(briefId);
  if (!brief) return <NotFoundPage />;

  const route = getStudioRoute(brief.routeSlug);
  if (!route) return <NotFoundPage />;

  return (
    <StudioPage>
      <StudioHero
        label={
          <span className="inline-flex items-center gap-2">
            <RouteBadge route={route.label} sbs={route.sbs} size="md" />
            Review
          </span>
        }
        title={brief.title}
        body="Reviewer feedback attaches to claims and cited body spans so comments stay close to the evidence."
        action={
          <span className="inline-flex items-center gap-3">
            <ReviewerStack
              reviewers={[
                { initials: "MT", state: "approved" },
                { initials: "JA", state: "reviewing" },
                { initials: "SL", state: "requested-changes" },
              ]}
            />
            <CommentBadge count={5} />
          </span>
        }
      />
      <div className="grid grid-cols-[1fr_320px] gap-5 max-lg:grid-cols-1">
        <StudioPanel>
          <p className="text-[14px] leading-7 text-[var(--bp-color-ink-70)]">
            On weekdays in March 2026, M15 SBS buses average 4.2 mph northbound on the Madison
            Avenue segment. The reviewer thread asks whether the congestion pricing caveat should be
            promoted before the intervention claim.
          </p>
        </StudioPanel>
        <StudioPanel>
          <div className="mb-3 text-[13px] font-semibold">Active comments</div>
          <Timeline
            events={[
              {
                date: "MT",
                title: "Tighten caveat",
                detail: "Move attribution caveat above recommendation.",
                tone: "bad",
              },
              {
                date: "JA",
                title: "Check source line",
                detail: "Confirm row count in speed extract.",
                tone: "accent",
              },
            ]}
          />
        </StudioPanel>
      </div>
    </StudioPage>
  );
}

export function BriefHistoryPage({ briefId }: { briefId: string }) {
  const brief = getStudioBrief(briefId);
  if (!brief) return <NotFoundPage />;

  const route = getStudioRoute(brief.routeSlug);
  if (!route) return <NotFoundPage />;

  return (
    <StudioPage>
      <StudioHero
        label={
          <span className="inline-flex items-center gap-2">
            <RouteBadge route={route.label} sbs={route.sbs} size="md" />
            History
          </span>
        }
        title="Version history"
        body="Diffs should show how evidence changed, not just that text changed."
      />
      <div className="grid grid-cols-[260px_1fr] gap-5 max-lg:grid-cols-1">
        <StudioPanel>
          <Timeline
            events={[
              { date: "v0.4", title: "Reviewer caveat applied", tone: "good" },
              { date: "v0.3", title: "Evidence added", tone: "accent" },
              { date: "v0.2", title: "AI draft generated", tone: "accent" },
            ]}
          />
        </StudioPanel>
        <StudioPanel>
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <DiffColumn
              title="Before"
              body="M15 SBS buses are noticeably slower than the rest of the route."
            />
            <DiffColumn
              title="After"
              body="M15 SBS buses average 4.2 mph northbound on weekdays, with attribution caveats attached."
            />
          </div>
        </StudioPanel>
      </div>
    </StudioPage>
  );
}

function DiffColumn({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-paper)] p-4">
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {title}
      </div>
      <p className="m-0 text-[13px] leading-6 text-[var(--bp-color-ink-70)]">{body}</p>
    </div>
  );
}
