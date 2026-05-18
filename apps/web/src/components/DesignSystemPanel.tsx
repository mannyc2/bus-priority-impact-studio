import {
  AiAttribution,
  BeforeAfter,
  Caveat,
  ChartFrame,
  Chip,
  Cite,
  ClaimList,
  CommentBadge,
  CommentMarker,
  ConfidenceBar,
  EmptyState,
  Heatmap,
  HourBars,
  KPI,
  MapThumb,
  ReviewerStack,
  RouteBadge,
  SearchField,
  SectionHeader,
  SegmentRow,
  SegmentRowHeader,
  SkeletonKPI,
  Spark,
  StrengthBars,
  StudioBar,
  StudioFooter,
  StudioMark,
  Tabs,
  Timeline,
  TreatmentRow,
} from "../design-system/index.js";
import { Button } from "./ui/button.js";

const heatmapRows = ["NB", "SB"];
const heatmapCols = ["6", "9", "12", "15", "18", "21"];
const heatmapValues = [
  [6.1, 4.8, 5.2, 4.1, 5.7, 7.4],
  [7.2, 5.6, 4.9, 4.4, 6.1, 8.0],
];

const claims = [
  {
    n: 1,
    title: "Madison Av is the current rider-impact bottleneck.",
    strength: 5,
    evidence: 4,
    caveats: 1,
    active: true,
  },
  {
    n: 2,
    title: "ACE coverage does not explain the full PM-peak decline.",
    strength: 3,
    evidence: 2,
    caveats: 2,
    weak: true,
  },
];

export function DesignSystemPanel() {
  return (
    <div className="flex flex-col gap-6 bg-[var(--bp-color-paper)] text-[var(--bp-color-ink)]">
      <StudioBar active="Routes" breadcrumb="system / primitives" />

      <section className="flex flex-col gap-5 px-6 pb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <StudioMark size={32} />
              <span className="font-mono text-[11px] font-semibold text-[var(--bp-color-ink-55)]">
                Design system v0.1
              </span>
            </div>
            <h1 className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.02em]">
              Bus Priority Impact Studio
            </h1>
            <p className="mt-2 max-w-[620px] text-[13px] leading-normal text-[var(--bp-color-ink-70)]">
              A warm-paper civic interface for route evidence, hotspot ranking, intervention
              reasoning, and brief authoring.
            </p>
          </div>
          <ReviewerStack
            reviewers={[
              { initials: "JL", state: "reviewing" },
              { initials: "SR", state: "approved" },
              { initials: "CP", state: "requested-changes" },
            ]}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
            <SectionHeader
              title="Foundations"
              sub="Brand, color, type, chips, and route identity."
            />
            <div className="flex flex-wrap items-center gap-2">
              <RouteBadge route="M15" size="lg" sbs />
              <RouteBadge route="Bx12" size="lg" sbs />
              <RouteBadge route="Q44" size="lg" sbs />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip>All boroughs</Chip>
              <Chip tone="accent">ACE</Chip>
              <Chip tone="good">LANE</Chip>
              <Chip tone="warn">LANE: PARTIAL</Chip>
              <Chip tone="bad">NO LANE</Chip>
            </div>
            <div className="mt-4">
              <SearchField placeholder="Search routes, segments, evidence..." shortcut="/" />
            </div>
            <p className="mt-4 text-[13px] leading-normal text-[var(--bp-color-ink-70)]">
              Inline claims carry citation numbers
              <Cite n={2} /> and keep color reserved for evidence state, not decoration.
            </p>
            <div className="mt-3 flex items-center gap-3 text-[13px] leading-normal">
              <CommentBadge count={3} />
              <span>
                Annotate disputed spans like <CommentMarker marker="a">4.2 mph</CommentMarker>.
              </span>
            </div>
          </div>

          <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
            <SectionHeader title="Metrics" sub="Compact, source-aware metric blocks." />
            <div className="grid grid-cols-2 gap-4">
              <KPI label="Route score" value="42" tone="warn" sub="baseline release" />
              <KPI label="Observed samples" value="2.57M" tone="good" sub="recovered GTFS-RT" />
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <Spark data={[8.2, 7.4, 6.2, 4.8, 5.1, 6.6, 6.1]} baseline={6} fill />
              <BeforeAfter before={7.4} after={5.8} max={9} />
              <ConfidenceBar value={68} />
            </div>
          </div>

          <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
            <SectionHeader title="Treatments" sub="Tiny status boards instead of chip piles." />
            <div className="flex flex-col gap-4">
              <TreatmentRow lane="yes" ace tsp />
              <TreatmentRow lane="partial" ace={false} tsp={false} align="flex-start" />
              <MapThumb width={180} height={104} label="Madison Av segment" />
            </div>
          </div>
        </div>

        <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <SectionHeader
            title="Route ladder row"
            sub="The canonical segment row for route detail, hotspot triage, and brief evidence."
            right={<Button variant="secondary">Open route</Button>}
          />
          <SegmentRowHeader />
          <SegmentRow
            dir="NB"
            from="Madison Av / E 28 St"
            to="Madison Av / E 58 St"
            mph={4.2}
            sched={7.1}
            riderHours={18420}
            hours={[0.1, 0.2, 0.4, 0.7, 0.8, 0.6, 0.3, 0.2, 0.5, 0.8, 0.9, 0.5]}
            lane="partial"
            flag="top"
            hasNote
          />
          <AiAttribution
            action={
              <Button variant="accent" size="sm">
                Explain
              </Button>
            }
          >
            No violation reduction despite ACE active on adjacent blocks; the painted-only lane may
            be structurally unenforceable here.
          </AiAttribution>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <ChartFrame title="Speed by direction and hour" source="MTA Bus Speeds">
            <Heatmap rows={heatmapRows} cols={heatmapCols} values={heatmapValues} />
          </ChartFrame>
          <ChartFrame title="PM peak profile" source="March 2026 baseline">
            <HourBars
              data={[8.1, 7.8, 7.5, 7.1, 6.8, 6.1, 5.2, 4.8, 4.4, 4.9, 5.8, 6.4]}
              sched={7.1}
              width={420}
            />
          </ChartFrame>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
            <SectionHeader
              title="Brief authoring"
              sub="Claims are explicit, scored, and reorderable."
            />
            <ClaimList
              claims={claims}
              reorderable
              summary={
                <span>
                  <StrengthBars strength={4} /> average claim strength · 6 citations · 3 caveats
                </span>
              }
            />
          </div>
          <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
            <SectionHeader
              title="States"
              sub="Loading, caveats, empty states, and navigation tabs."
            />
            <div className="flex flex-col gap-4">
              <Tabs items={["Outline", "Sources", "Claims"]} active="Claims" />
              <Caveat title="Publication lag">
                March 2026 is the current complete public baseline; realtime samples are labeled
                separately.
              </Caveat>
              <SkeletonKPI />
              <Timeline
                events={[
                  { date: "2024", title: "Bus lane installed", tone: "good" },
                  { date: "2025", title: "ACE camera active", tone: "accent" },
                  { date: "2026", title: "PM-peak slowdown persists", tone: "bad" },
                ]}
              />
              <EmptyState
                title="No matching segments"
                body="Try a broader borough or route family filter."
                primary="Reset filters"
                tone="warn"
              />
            </div>
          </div>
        </div>
      </section>

      <StudioFooter sources={["MTA Bus Speeds", "GTFS-RT", "ACE program", "NYC DOT bus lanes"]} />
    </div>
  );
}
