import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";
import type { StudioMethodDataset, StudioMethodsResponse, StudioQuality } from "../api-contract.js";
import { StudioHero, StudioPage } from "../page.js";

export function MethodsPage({ data }: { data: StudioMethodsResponse }) {
  return (
    <StudioPage>
      <StudioHero
        label="Methods"
        title="Sources, caveats, and what the Studio will not claim."
        body="The public app is built from precomputed route projections. Heavy joins, geospatial matching, and evidence aggregation happen in the local pipeline before release."
      />
      <section className="mb-7 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5 max-lg:grid-cols-1">
        <QualityPanel quality={data.quality} generatedAt={data.generatedAt} />
        <PrinciplesPanel />
      </section>
      <section className="mb-7">
        <SectionHeader
          title="Route-page metrics"
          sub="Every public KPI is named by grain, source, and wording rule before it appears as a claim."
        />
        <MetricCards />
      </section>
      <section>
        <SectionHeader
          title="Datasets"
          sub={`${data.datasets.length} source groups are represented in the current methods projection.`}
        />
        <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
          {data.datasets.map((dataset) => (
            <DatasetRow key={`${dataset.publisher}:${dataset.name}`} dataset={dataset} />
          ))}
        </div>
      </section>
    </StudioPage>
  );
}

export function MethodsLoadingPage() {
  return (
    <StudioPage>
      <div className="mb-6 h-[118px] max-w-[760px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
      <div className="mb-7 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5 max-lg:grid-cols-1">
        <div className="h-[220px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
        <div className="h-[220px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
      </div>
      <div className="h-[360px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
    </StudioPage>
  );
}

function QualityPanel({ quality, generatedAt }: { quality: StudioQuality; generatedAt: string }) {
  return (
    <section className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <SectionHeader
        title="Release quality"
        sub={`Generated ${formatDate(generatedAt)}.`}
        right={
          <Badge variant={quality.confidence === "high" ? "good" : "warn"}>
            {quality.confidence}
          </Badge>
        }
      />
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <QualityStat label="Layer" value={quality.releaseLayer.replaceAll("_", " ")} />
        <QualityStat label="Completeness" value={quality.completenessStatus.replaceAll("_", " ")} />
      </div>
      <div className="mt-4">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
          Caveats
        </div>
        {quality.caveats.length > 0 ? (
          <ul className="m-0 mt-2 list-none p-0 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
            {quality.caveats.map((caveat) => (
              <li
                key={caveat}
                className="py-1 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none"
              >
                {caveat}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 mt-2 text-[12.5px] text-[var(--bp-color-ink-55)]">
            No release-wide caveats are published for this projection.
          </p>
        )}
      </div>
    </section>
  );
}

function PrinciplesPanel() {
  return (
    <section className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <SectionHeader
        title="Interpretation rules"
        sub="Useful civic data, without pretending to prove more than it can."
      />
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <MethodRule
          title="Before/after is context"
          body="Intervention windows show route change around a dated event. They are not randomized causal claims."
        />
        <MethodRule
          title="Sparse still renders"
          body="Every route page shows what exists, what is missing, and which sections are checked clean or still building."
        />
        <MethodRule
          title="Route evidence first"
          body="The app favors route, segment, timeline, ridership, map, and source panels over separate finding feeds."
        />
        <MethodRule
          title="Pipeline owns aggregation"
          body="Browser pages read static projections; expensive source probing and joins stay in Bun-run pipeline jobs."
        />
      </div>
    </section>
  );
}

type MetricStatus = "use_now" | "api_work" | "pipeline" | "source_gap";

type MetricCardDefinition = {
  metric: string;
  status: MetricStatus;
  grain: string;
  source: string;
  plainEnglish: string;
  callIt: string;
  not: string;
  caveat?: string;
};

const metricStatusMeta: Record<
  MetricStatus,
  { label: string; variant: "accent" | "good" | "warn" | "bad" }
> = {
  use_now: { label: "Use now", variant: "good" },
  api_work: { label: "Needs API work", variant: "accent" },
  pipeline: { label: "Pipeline only", variant: "warn" },
  source_gap: { label: "Source gap", variant: "bad" },
};

const METRIC_CARDS: readonly MetricCardDefinition[] = [
  {
    metric: "Observed average speed",
    status: "use_now",
    grain: "route-month / segment-window",
    source: "MTA Bus Speeds joined into Studio route projections",
    plainEnglish:
      "The speed riders experience on a route or segment, including time spent stopped in traffic, at signals, and at stops.",
    callIt: "Observed speed, route speed, segment speed.",
    not: "A promise that every stop-to-stop trip moves at that speed.",
  },
  {
    metric: "Six-month route trend",
    status: "use_now",
    grain: "route-month",
    source: "Dossier speed sparkline from monthly route history",
    plainEnglish:
      "The direction of the served route speed series over the recent comparison window shown on route pages.",
    callIt: "Up or down over six months, with the percent shown when served.",
    not: "A causal effect of any single intervention.",
    caveat:
      "Trend labels are descriptive; treatment attribution stays in the intervention context.",
  },
  {
    metric: "Excess wait and observed headways",
    status: "use_now",
    grain: "route-month / GTFS-RT sample run",
    source: "Observed reliability summary with sample-count gates",
    plainEnglish:
      "Observed waits, bunching, long gaps, and excess wait render only when the realtime sample threshold clears.",
    callIt: "Observed excess wait, bunching share, long-gap share.",
    not: "A filled-in reliability score for months with insufficient samples.",
    caveat: "Low-sample months render as unavailable rather than interpolated.",
  },
  {
    metric: "Daily riders",
    status: "use_now",
    grain: "route-month / route-hour",
    source: "MTA ridership projections in the route index and route dossier",
    plainEnglish:
      "The served ridership signal used to sort routes, size rider context, and frame route-page burden.",
    callIt: "Daily riders, monthly riders where the dossier history is present.",
    not: "Stop-level boardings or segment-level passenger loads.",
  },
  {
    metric: "Rider-hour burden",
    status: "use_now",
    grain: "segment-window / route-hour",
    source: "Observed-vs-scheduled speed gap with route ridership exposure",
    plainEnglish:
      "A rider-weighted delay exposure measure that ranks where slow service costs the most passenger time.",
    callIt: "Rider-hours lost or rider-hour burden.",
    not: "A literal count of people waiting at each stop.",
    caveat:
      "The ridership denominator is route-level, so tiny segments should be read as ranking evidence.",
  },
  {
    metric: "Bus-lane coverage and treatment posture",
    status: "use_now",
    grain: "route / route-segment",
    source: "NYC DOT bus-lane GIS, MTA ACE/TSP inputs, and route treatment context",
    plainEnglish:
      "Route pages show whether a corridor already has bus priority tools and where lane overlap is present.",
    callIt: "Bus-lane coverage, ACE active, TSP partial/none.",
    not: "Audited regulatory lane mileage or a current TSP guarantee.",
    caveat:
      "Some treatment inventories are source dated; the route page carries caveats when served.",
  },
  {
    metric: "Wiki evidence provenance",
    status: "use_now",
    grain: "route evidence bundle / citation block",
    source: "MTA-wiki route evidence importer",
    plainEnglish:
      "Timeline events, projects, source gaps, and metric claims come with citation keys and source metadata.",
    callIt: "Wiki-backed route evidence with citations.",
    not: "Uncited editorial claims or generated impact statements.",
  },
];

export function MetricCards() {
  return (
    <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
      {METRIC_CARDS.map((definition) => (
        <MetricCard key={definition.metric} definition={definition} />
      ))}
    </div>
  );
}

function MetricCard({ definition }: { definition: MetricCardDefinition }) {
  const status = metricStatusMeta[definition.status];
  return (
    <article className="flex flex-col gap-4 rounded-[4px] bg-[var(--bp-color-card)] p-5 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="m-0 min-w-0 flex-1 text-[18px] font-semibold leading-tight tracking-[-0.01em]">
          {definition.metric}
        </h3>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[12px]">
        <MetricMeta label="Grain" value={definition.grain} />
        <MetricMeta label="Source" value={definition.source} />
      </div>
      <p className="m-0 text-[13px] leading-[1.65] text-[var(--bp-color-ink-70)]">
        {definition.plainEnglish}
      </p>
      <div className="grid grid-cols-2 gap-4 pt-3 shadow-[inset_0_1px_0_var(--bp-color-rule)] max-sm:grid-cols-1">
        <MetricWording label="We call it" tone="good" value={definition.callIt} />
        <MetricWording label="Not" tone="bad" value={definition.not} />
      </div>
      {definition.caveat ? (
        <div className="rounded-[3px] border-l-[3px] border-[var(--bp-color-warn)] bg-[var(--bp-color-warn-bg)] px-3 py-2 text-[12px] leading-[1.55] text-[var(--bp-color-ink-70)]">
          <span className="mr-1 font-semibold text-[var(--bp-color-warn)]">Caveat</span>
          {definition.caveat}
        </div>
      ) : null}
    </article>
  );
}

function MetricMeta({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
        {label}
      </span>
      <span className="min-w-0 text-[var(--bp-color-ink-70)]">{value}</span>
    </>
  );
}

function MetricWording({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "good" | "bad";
  value: string;
}) {
  return (
    <div>
      <div
        className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em]"
        style={{ color: tone === "good" ? "var(--bp-color-good)" : "var(--bp-color-bad)" }}
      >
        {label}
      </div>
      <div className="text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">{value}</div>
    </div>
  );
}

function DatasetRow({ dataset }: { dataset: StudioMethodDataset }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_170px_170px_150px] items-center gap-5 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-lg:grid-cols-1 max-lg:gap-1">
      <div>
        <div className="text-[13px] font-semibold">{dataset.name}</div>
        <div className="mt-0.5 text-[11.5px] text-[var(--bp-color-ink-55)]">
          {dataset.publisher}
        </div>
      </div>
      <MethodMeta label="Grain" value={dataset.grain} />
      <MethodMeta label="Cadence" value={dataset.cadence} />
      <Badge variant="neutral">{dataset.publisher}</Badge>
    </div>
  );
}

function QualityStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-3">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-semibold capitalize">{value}</div>
    </div>
  );
}

function MethodRule({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4">
      <div className="text-[13px] font-semibold">{title}</div>
      <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-[var(--bp-color-ink-70)]">{body}</p>
    </div>
  );
}

function MethodMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
        {label}
      </div>
      <div className="mt-0.5 text-[12px] text-[var(--bp-color-ink-70)]">{value}</div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
