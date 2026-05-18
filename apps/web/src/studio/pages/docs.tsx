import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";

const sections = [
  "Quickstart",
  "API reference",
  "CLI preview",
  "Agent notes",
  "Data credits",
  "Changelog",
] as const;

export function DocsPage() {
  return (
    <StudioPage>
      <StudioHero
        label="Docs"
        title="Build route briefs with the Studio API"
        body="The API and future CLI are designed for humans and coding agents: predictable commands, JSON everywhere, and contracts generated from TypeScript schemas."
        action={
          <Link
            to="/methods"
            viewTransition
            className="inline-flex h-9 items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] px-3.5 text-[12.5px] font-medium no-underline"
          >
            Data sources
            <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="grid grid-cols-[240px_1fr] gap-7 max-lg:grid-cols-1">
        <StudioPanel>
          <nav className="space-y-1" aria-label="Docs sections">
            {sections.map((section) => (
              <a
                key={section}
                href={`#${section.toLowerCase().replaceAll(" ", "-")}`}
                className="block rounded-[3px] px-2 py-1.5 text-[12.5px] text-[var(--bp-color-ink-70)] no-underline hover:bg-[var(--bp-color-ink-06)]"
              >
                {section}
              </a>
            ))}
          </nav>
        </StudioPanel>
        <article className="space-y-5">
          <DocsSection title="Quickstart">
            <p>Start with a route, inspect the evidence, then generate a draft brief.</p>
            <CodeBlock
              code={
                "curl /api/v1/studio/routes/m15-sbs\ncurl /api/v1/studio/briefs/m15-madison-corridor"
              }
            />
          </DocsSection>
          <DocsSection title="API reference">
            <Endpoint
              method="GET"
              path="/api/v1/studio/routes"
              body="List route cards for search and the home attention ranking."
            />
            <Endpoint
              method="GET"
              path="/api/v1/studio/routes/:routeId"
              body="Fetch route detail, diagnosis, KPIs, segments, and intervention evidence."
            />
            <Endpoint
              method="POST"
              path="/api/v1/studio/briefs/:briefId/generate"
              body="Run staged draft generation from attached claims and evidence."
            />
          </DocsSection>
          <DocsSection title="CLI preview">
            <p>The CLI should be generated from the same TypeScript contracts as the API docs.</p>
            <CodeBlock
              code={
                "bpi routes get M15+ --json\nbpi findings list --json\nbpi briefs generate m15-madison-corridor --json"
              }
            />
          </DocsSection>
          <DocsSection title="Agent notes">
            <ul className="m-0 space-y-2 pl-5">
              <li>
                Use <code>get</code>, never <code>info</code>.
              </li>
              <li>
                Always support <code>--json</code>.
              </li>
              <li>Make local vs remote execution explicit before mutating a draft.</li>
            </ul>
          </DocsSection>
          <DocsSection title="Data credits">
            <p>
              TODO: MTA Open Data, MTA GTFS, MTA Bus Time, NYC DOT bus lanes, and project wiki
              methodology notes.
            </p>
          </DocsSection>
          <DocsSection title="Changelog">
            <p>
              2026-05-18: hard cutover planning started. The route-first site, schema-first API, and
              future CLI now share one implementation plan.
            </p>
          </DocsSection>
        </article>
      </div>
    </StudioPage>
  );
}

function DocsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      id={title.toLowerCase().replaceAll(" ", "-")}
      className="rounded-[3px] bg-[var(--bp-color-card)] p-6 text-[13px] leading-6 shadow-[0_0_0_1px_var(--bp-color-rule)]"
    >
      <div className="mb-3 flex items-center gap-2">
        <h2 className="m-0 text-[20px] font-semibold tracking-[0]">{title}</h2>
        <Badge variant="neutral">draft</Badge>
      </div>
      {children}
    </section>
  );
}

function Endpoint({ method, path, body }: { method: string; path: string; body: string }) {
  return (
    <div className="mb-2 rounded-[3px] bg-[var(--bp-color-paper)] p-3">
      <div className="font-mono text-[11px] font-bold">
        {method} {path}
      </div>
      <div className="mt-1 text-[12px] text-[var(--bp-color-ink-70)]">{body}</div>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-auto rounded-[3px] bg-[var(--bp-color-ink)] p-4 text-[12px] leading-5 text-[var(--bp-color-paper)]">
      <code>{code}</code>
    </pre>
  );
}
