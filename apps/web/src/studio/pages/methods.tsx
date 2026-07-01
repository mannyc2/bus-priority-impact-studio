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
