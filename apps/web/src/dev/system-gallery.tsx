import type { ReactNode } from "react";
import { ChartsDemo } from "@/dev/examples/charts-demo";
import { CorridorDemo } from "@/dev/examples/corridor-demo";
import { CorridorProfileDemo } from "@/dev/examples/corridor-profile-demo";
import { FoundationsDemo } from "@/dev/examples/foundations-demo";
import { MetricsDemo } from "@/dev/examples/metrics-demo";
import { SegmentRowDemo } from "@/dev/examples/segment-row-demo";
import { StatesDemo } from "@/dev/examples/states-demo";
import { StudioBarDemo } from "@/dev/examples/studio-bar-demo";
import { TreatmentsDemo } from "@/dev/examples/treatments-demo";

const sections = [
  { id: "brand", label: "Brand" },
  { id: "foundations", label: "Foundations" },
  { id: "metrics", label: "Metrics" },
  { id: "treatments", label: "Treatments" },
  { id: "segments", label: "Segment row" },
  { id: "charts", label: "Charts" },
  { id: "corridor", label: "The corridor" },
  { id: "states", label: "States" },
  { id: "patterns", label: "Patterns" },
] as const;

export function SystemGallery() {
  return (
    <div className="bg-[var(--bp-color-paper)] px-6 py-8 text-[var(--bp-color-ink)]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-8">
        <header className="border-b border-[var(--bp-color-rule)] pb-7">
          <div className="text-[11px] font-semibold text-[var(--bp-color-ink-55)]">
            Bus Priority Impact Studio
          </div>
          <div className="mt-2 flex items-end justify-between gap-6 max-md:flex-col max-md:items-start">
            <div>
              <h1 className="m-0 text-[36px] font-semibold leading-tight tracking-[-0.02em]">
                Design system{" "}
                <span className="font-medium text-[var(--bp-color-ink-40)]">v0.1</span>
              </h1>
              <p className="mt-2 max-w-[720px] text-[13.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
                Civic, evidence-heavy, and intentionally small: a few tokens, a few primitives, and
                reusable composites for route evidence, interventions, and methodology.
              </p>
            </div>
            <div className="rounded-[3px] bg-[var(--bp-color-card)] px-3 py-2 font-mono text-[11px] text-[var(--bp-color-ink-55)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
              dev-only gallery
            </div>
          </div>
          <nav className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px]">
            {sections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-[var(--bp-color-ink-70)] no-underline hover:text-[var(--bp-color-ink)]"
              >
                <span className="mr-1.5 font-mono text-[var(--bp-color-ink-40)]">
                  {String(index).padStart(2, "0")}
                </span>
                {section.label}
              </a>
            ))}
          </nav>
        </header>

        <GallerySection id="brand" kicker="00" title="Brand mark and app chrome">
          <StudioBarDemo />
        </GallerySection>

        <GallerySection
          id="foundations"
          kicker="01"
          title="Foundations"
          sub="Identity, color, type, route badges, chips, citations, comments, and search fields."
        >
          <FoundationsDemo />
        </GallerySection>

        <div className="grid gap-8 xl:grid-cols-2">
          <GallerySection id="metrics" kicker="02" title="Metrics">
            <MetricsDemo />
          </GallerySection>
          <GallerySection id="treatments" kicker="03" title="Treatment signals">
            <TreatmentsDemo />
          </GallerySection>
        </div>

        <GallerySection id="segments" kicker="04" title="Segment row">
          <SegmentRowDemo />
        </GallerySection>

        <GallerySection id="charts" kicker="05" title="Data visualization primitives">
          <ChartsDemo />
        </GallerySection>

        <GallerySection
          id="corridor"
          kicker="06"
          title="The corridor"
          sub="Two views of one corridor: the spatial speed profile (route Overview) reads geography left→right, and the temporal trend reads before/after a treatment. Both feed from Tier 2 evidence."
        >
          <div className="flex flex-col gap-6">
            <CorridorProfileDemo />
            <CorridorDemo />
          </div>
        </GallerySection>

        <GallerySection id="states" kicker="07" title="States">
          <StatesDemo />
        </GallerySection>

        <GallerySection
          id="patterns"
          kicker="08"
          title="Composite rules"
          sub="The gallery intentionally keeps these as product constraints, not theme controls."
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <PatternCard
              title="Use evidence-first composites"
              body="Route pages should expose evidence objects directly rather than restating conclusions in separate UI surfaces."
            />
            <PatternCard
              title="Keep state chrome in context"
              body="Loading and empty states preserve headers, tabs, filters, and table shape so the user can tell what is missing and what is still available."
            />
            <PatternCard
              title="Avoid score-only language"
              body="Derived metrics are acceptable when the inputs, units, and provenance are visible near the claim."
            />
            <PatternCard
              title="No runtime tweaks panel"
              body="The prototype tuning panel remains outside production until there is a real operator workflow for adjusting tokens or thresholds."
            />
          </div>
        </GallerySection>
      </div>
    </div>
  );
}

function GallerySection({
  id,
  kicker,
  title,
  sub,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-3">
        <div className="text-[11px] font-semibold text-[var(--bp-color-ink-55)]">
          <span className="mr-2 font-mono text-[var(--bp-color-ink-40)]">{kicker}</span>
          {id}
        </div>
        <h2 className="m-0 mt-1 text-[22px] font-semibold leading-tight tracking-[-0.01em]">
          {title}
        </h2>
        {sub ? (
          <p className="mt-1 max-w-[720px] text-[13px] leading-[1.55] text-[var(--bp-color-ink-70)]">
            {sub}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function PatternCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="text-[13.5px] font-semibold">{title}</div>
      <p className="mt-2 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">{body}</p>
    </div>
  );
}
