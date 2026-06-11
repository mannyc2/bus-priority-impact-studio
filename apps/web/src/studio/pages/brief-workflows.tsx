import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ChartFrame } from "@/components/ChartFrame";
import { DraftBriefProvider } from "@/components/brief/DraftBriefContext.js";
import { BriefComposer } from "@/components/brief/composer/BriefComposer.js";
import { ReviewBriefProvider } from "@/components/brief/ReviewBriefContext.js";
import { BriefReview } from "@/components/brief/review/BriefReview.js";
import { Heatmap } from "@/components/Heatmap";
import { RouteBadge } from "@/components/RouteBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type {
  StudioBriefEvidenceResponse,
  StudioBriefHistoryResponse,
  StudioBriefResponse,
} from "../api-contract.js";
import { StudioPage, StudioPanel } from "../page.js";
import { NotFoundPage } from "./not-found.js";

export function BriefEvidencePage({ data }: { data: StudioBriefEvidenceResponse | null }) {
  if (data === null) return <NotFoundPage />;
  const { heading } = data;

  return (
    <StudioPage>
      <header className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--bp-color-rule)] pb-4 max-md:flex-col">
        <div className="flex items-center gap-3">
          <RouteBadge route={heading.routeLabel} sbs={heading.routeSbs} size="md" />
          <span className="text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
            {heading.title} - Evidence
          </span>
        </div>
        <Link
          to="/briefs/$briefId"
          params={{ briefId: heading.id }}
          viewTransition
          className="text-[12px] font-medium text-[var(--bp-color-accent)] no-underline"
        >
          Back to brief &rarr;
        </Link>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-5 max-lg:grid-cols-1">
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
          <div className="text-[12.5px] font-semibold">Computation</div>
          <p className="mt-2 text-[12px] leading-[1.55] text-[var(--bp-color-ink-70)]">
            Rider-hours lost is computed by applying scheduled-vs-observed travel time delta to
            hourly ridership, then summing across weekdays.
          </p>
          <Alert variant="warn" className="mt-4">
            <AlertDescription>
              Single-month windows are useful for briefs but not causal proof.
            </AlertDescription>
          </Alert>
        </StudioPanel>
      </div>
    </StudioPage>
  );
}

export function BriefComposerPage({
  data,
  mode = "edit",
}: {
  data: StudioBriefResponse | null;
  mode?: "new" | "edit";
}) {
  if (data === null) return <NotFoundPage />;
  return (
    <DraftBriefProvider data={data} mode={mode}>
      <BriefComposer />
    </DraftBriefProvider>
  );
}

export function BriefReviewPage({ data }: { data: StudioBriefResponse | null }) {
  if (data === null) return <NotFoundPage />;
  return (
    <ReviewBriefProvider data={data}>
      <BriefReview />
    </ReviewBriefProvider>
  );
}

export function BriefHistoryPage({ data }: { data: StudioBriefHistoryResponse | null }) {
  if (data === null) return <NotFoundPage />;
  const { heading } = data;

  const versions = data.versions;
  const [activeB, setActiveB] = useState<string>(versions[0]?.v ?? "v0.4");
  const versionA = versions[1]?.v ?? "v0.3";

  return (
    <StudioPage>
      <BriefHeadingBar
        heading={heading}
        chip="IN REVIEW"
        chipTone="warn"
        hint="last edit 2 hours ago"
      >
        <Link
          to="/briefs/$briefId/edit"
          params={{ briefId: heading.id }}
          viewTransition
          className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 text-[12.5px] font-medium text-[var(--bp-color-paper)] no-underline"
        >
          Open in composer
          <ArrowRight size={14} />
        </Link>
      </BriefHeadingBar>
      <div className="mb-5 flex items-center gap-3 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
          Comparing
        </div>
        <VersionChip v={versionA} />
        <ChevronRight size={14} className="text-[var(--bp-color-ink-40)]" />
        <VersionChip v={activeB} highlighted />
        <span className="ml-auto text-[11px] text-[var(--bp-color-ink-55)]">
          +4 evidence - +1 caveat - 2 claims edited
        </span>
      </div>
      <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-5 max-lg:grid-cols-1">
        <aside>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Versions
          </div>
          <ol className="relative mt-3 m-0 list-none space-y-3 p-0">
            <div
              aria-hidden
              className="absolute left-[7px] top-0 h-full w-px bg-[var(--bp-color-ink-20)]"
            />
            {versions.map((v) => {
              const active = v.v === activeB;
              return (
                <li key={v.v} className="relative flex items-start gap-3">
                  <span
                    className="relative z-10 h-[14px] w-[14px] rounded-full border-[2px] border-[var(--bp-color-paper)]"
                    style={{
                      background: active ? "var(--bp-color-accent)" : "var(--bp-color-ink-20)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setActiveB(v.v)}
                    className={
                      active
                        ? "flex-1 rounded-[3px] bg-[var(--bp-color-paper-deep)] p-2 text-left"
                        : "flex-1 rounded-[3px] bg-transparent p-2 text-left hover:bg-[var(--bp-color-paper-deep)]"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] font-semibold tabular-nums">
                        {v.v}
                      </span>
                      <span className="text-[10.5px] text-[var(--bp-color-ink-55)]">{v.date}</span>
                    </div>
                    <div className="text-[11.5px] text-[var(--bp-color-ink-55)]">{v.author}</div>
                    <p className="mt-1 m-0 text-[11.5px] leading-[1.4] text-[var(--bp-color-ink-70)]">
                      {v.summary}
                    </p>
                    <div className="mt-2 font-mono text-[10px] tabular-nums text-[var(--bp-color-ink-55)]">
                      {v.claimsCount} claims - {v.citesCount} cites - {v.caveatsCount} caveats
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
        <div className="space-y-4">
          <p className="m-0 text-[12px] text-[var(--bp-color-ink-55)]">
            Differences between {versionA} and {activeB}. Showing only claims that changed.
          </p>
          <DiffClaim
            n={2}
            title="A single corridor accounts for 43% of measured delay"
            before="A single corridor on the M15 SBS route is responsible for a large share of measured delay."
            after="A 1.5-mile stretch of Madison Avenue (E 28 St -> E 58 St, NB) accounts for 43% of the M15 SBS's total measured rider-hour delay."
            evidenceAdded={[
              "18,420 RH/day - Madison segment (computed)",
              "Hour-by-hour speed figure",
              "M1 pilot windowing",
            ]}
            caveatsAdded={['"Speed" includes rider experience']}
          />
          <DiffClaim
            n={4}
            title="Treatment gap on Madison Av"
            before="There is a treatment gap on Madison Avenue."
            after="DOT bus-lane geometry confirms a painted-only segment on Madison Av between E 28 - E 38 St, with no ACE backstop."
            evidenceAdded={["DOT bus-lane geometry - Madison Av"]}
            flag="Strength dropped from 3 → 2 (weak)"
          />
        </div>
      </div>
    </StudioPage>
  );
}

function VersionChip({ v, highlighted }: { v: string; highlighted?: boolean }) {
  return (
    <span
      className={
        highlighted
          ? "rounded-[3px] bg-[var(--bp-color-ink)] px-2 py-1 font-mono text-[11.5px] font-semibold tabular-nums text-[var(--bp-color-paper)]"
          : "rounded-[3px] bg-[var(--bp-color-paper-deep)] px-2 py-1 font-mono text-[11.5px] font-semibold tabular-nums text-[var(--bp-color-ink-70)]"
      }
    >
      {v}
    </span>
  );
}

function DiffClaim({
  n,
  title,
  before,
  after,
  evidenceAdded,
  caveatsAdded,
  flag,
}: {
  n: number;
  title: string;
  before: string;
  after: string;
  evidenceAdded?: readonly string[];
  caveatsAdded?: readonly string[];
  flag?: string;
}) {
  return (
    <article className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-semibold tabular-nums text-[var(--bp-color-ink-55)]">
            {String(n).padStart(2, "0")}
          </span>
          <span className="text-[14px] font-semibold">{title}</span>
        </div>
        <Badge variant="warn">EDITED</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <div className="rounded-[3px] bg-[var(--bp-color-paper)] p-3">
          <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Before
          </div>
          <p className="mt-2 m-0 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-55)] line-through">
            {before}
          </p>
        </div>
        <div className="rounded-[3px] bg-[var(--bp-color-paper)] p-3">
          <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            After
          </div>
          <p className="mt-2 m-0 text-[12.5px] leading-[1.55]">
            <ins
              className="bg-[var(--bp-color-good-bg)] no-underline"
              style={{ color: "var(--bp-color-ink)" }}
            >
              {after}
            </ins>
          </p>
        </div>
      </div>
      {evidenceAdded && evidenceAdded.length > 0 ? (
        <div className="mt-3 text-[11.5px]">
          <span className="font-semibold">Evidence added ({evidenceAdded.length}):</span>
          <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
            {evidenceAdded.map((e, i) => (
              <li key={i} className="text-[var(--bp-color-ink-70)]">
                + {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {caveatsAdded && caveatsAdded.length > 0 ? (
        <div className="mt-2 text-[11.5px]">
          <span className="font-semibold">Caveats added:</span>
          <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
            {caveatsAdded.map((c, i) => (
              <li key={i} className="text-[var(--bp-color-ink-70)]">
                + {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {flag ? (
        <div className="mt-3 rounded-[3px] bg-[var(--bp-color-warn-bg)] p-2 text-[11.5px] text-[var(--bp-color-warn)]">
          {flag}
        </div>
      ) : null}
    </article>
  );
}

function BriefHeadingBar({
  heading,
  chip,
  chipTone = "neutral",
  hint,
  children,
}: {
  heading: StudioBriefHistoryResponse["heading"];
  chip: string;
  chipTone?: "neutral" | "warn" | "bad" | "accent";
  hint: string;
  children: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-center justify-between gap-4 border-b border-[var(--bp-color-rule)] pb-4 max-md:flex-col max-md:items-start">
      <div className="flex min-w-0 items-center gap-3">
        <RouteBadge route={heading.routeLabel} sbs={heading.routeSbs} size="md" />
        <span className="truncate text-[15px] font-semibold leading-tight">{heading.title}</span>
        <Badge variant={chipTone}>{chip}</Badge>
        <span className="font-mono text-[11.5px] tabular-nums text-[var(--bp-color-ink-55)]">
          {heading.version}
        </span>
        <span className="text-[11.5px] text-[var(--bp-color-ink-55)] max-md:hidden">{hint}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </header>
  );
}
