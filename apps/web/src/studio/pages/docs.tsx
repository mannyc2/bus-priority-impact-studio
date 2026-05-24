import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Rail } from "@/components/Rail";
import { StudioPage } from "../page.js";
import { NotFoundPage } from "./not-found.js";

const MONO = "var(--bp-font-mono)";

export const DOCS_PAGE_ORDER = [
  "overview",
  "authentication",
  "quickstart",
  "cli",
  "routes",
  "findings",
  "briefs",
  "data-credits",
  "changelog",
] as const;
export type DocsPageId = (typeof DOCS_PAGE_ORDER)[number];

const DOCS_PAGE_TITLES: Record<DocsPageId, string> = {
  overview: "Overview",
  authentication: "Authentication",
  quickstart: "Quickstart",
  cli: "CLI Reference",
  routes: "Routes",
  findings: "Findings",
  briefs: "Briefs",
  "data-credits": "Data & Credits",
  changelog: "Changelog",
};

const DOCS_PAGE_SECTIONS: Record<DocsPageId, string> = {
  overview: "Introduction",
  authentication: "Introduction",
  quickstart: "Get started",
  cli: "Get started",
  routes: "API Reference",
  findings: "API Reference",
  briefs: "API Reference",
  "data-credits": "Resources",
  changelog: "Resources",
};

const NAV_GROUPS: { label: string; pages: DocsPageId[] }[] = [
  { label: "Introduction", pages: ["overview", "authentication"] },
  { label: "Get started", pages: ["quickstart", "cli"] },
  { label: "API Reference", pages: ["routes", "findings", "briefs"] },
  { label: "Resources", pages: ["data-credits", "changelog"] },
];

export function isDocsPage(value: string): value is DocsPageId {
  return (DOCS_PAGE_ORDER as readonly string[]).includes(value);
}

export function DocsPage({ page }: { page: string }) {
  if (!isDocsPage(page)) return <NotFoundPage />;
  const PageComponent = PAGE_COMPONENTS[page];
  const markdown = PAGE_MARKDOWN[page];
  const idx = DOCS_PAGE_ORDER.indexOf(page);
  const prev = idx > 0 ? (DOCS_PAGE_ORDER[idx - 1] ?? null) : null;
  const next = idx < DOCS_PAGE_ORDER.length - 1 ? (DOCS_PAGE_ORDER[idx + 1] ?? null) : null;

  return (
    <StudioPage flush>
      <div className="grid h-full min-h-0 grid-cols-[228px_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1">
        <Rail edge="left" className="gap-6 py-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-1 px-[18px] text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
                {group.label}
              </div>
              {group.pages.map((p) => {
                const active = p === page;
                return (
                  <Link
                    key={p}
                    to="/docs/$page"
                    params={{ page: p }}
                    className={
                      active
                        ? "block border-l-2 border-[var(--bp-color-accent)] bg-[var(--bp-color-accent-bg)] px-[18px] py-[5px] text-[13px] font-medium text-[var(--bp-color-accent)] no-underline"
                        : "block border-l-2 border-transparent px-[18px] py-[5px] text-[13px] text-[var(--bp-color-ink-55)] no-underline hover:bg-[var(--bp-color-ink-06)] hover:text-[var(--bp-color-ink)]"
                    }
                  >
                    {DOCS_PAGE_TITLES[p]}
                  </Link>
                );
              })}
            </div>
          ))}
        </Rail>
        <div className="overflow-auto">
          <div className="mx-auto max-w-[760px] px-[60px] py-[52px] pb-[100px] max-md:px-6">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--bp-color-ink-40)]">
                {DOCS_PAGE_SECTIONS[page]}
              </div>
              <CopyMarkdownButton markdown={markdown} />
            </div>
            <PageComponent />
            <PageNav prev={prev} next={next} />
          </div>
        </div>
      </div>
    </StudioPage>
  );
}

function PageNav({ prev, next }: { prev: DocsPageId | null; next: DocsPageId | null }) {
  if (!prev && !next) return null;
  return (
    <nav className="mt-16 flex items-center justify-between gap-3 border-t border-[var(--bp-color-rule)] pt-6">
      {prev ? (
        <Link
          to="/docs/$page"
          params={{ page: prev }}
          className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] px-3 py-1.5 text-[13.5px] font-medium text-[var(--bp-color-ink-70)] no-underline hover:bg-[var(--bp-color-ink-06)] hover:text-[var(--bp-color-ink)]"
        >
          <ArrowLeft size={14} />
          {DOCS_PAGE_TITLES[prev]}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          to="/docs/$page"
          params={{ page: next }}
          className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] px-3 py-1.5 text-[13.5px] font-medium text-[var(--bp-color-ink-70)] no-underline hover:bg-[var(--bp-color-ink-06)] hover:text-[var(--bp-color-ink)]"
        >
          {DOCS_PAGE_TITLES[next]}
          <ArrowRight size={14} />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={
        copied
          ? "inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-accent)] px-2.5 py-1 text-[12px] font-medium text-[var(--bp-color-accent)]"
          : "inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] bg-transparent px-2.5 py-1 text-[12px] font-medium text-[var(--bp-color-ink-55)] hover:border-[var(--bp-color-ink)] hover:bg-[var(--bp-color-ink-06)] hover:text-[var(--bp-color-ink)]"
      }
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy markdown"}
    </button>
  );
}

// ── Prose primitives ─────────────────────────────────────────────

function H1({ children }: { children: ReactNode }) {
  return (
    <h1 className="m-0 mb-3.5 text-[28px] font-semibold leading-[1.2] tracking-[-0.025em]">
      {children}
    </h1>
  );
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="m-0 mb-2.5 mt-10 text-[19px] font-semibold leading-[1.3] tracking-[-0.015em]">
      {children}
    </h2>
  );
}

function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="m-0 mb-2 mt-7 text-[14.5px] font-semibold tracking-[-0.005em]">{children}</h3>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mb-3 text-[14.5px] leading-[1.65] text-[var(--bp-color-ink-70)]">
      {children}
    </p>
  );
}

function IC({ children }: { children: ReactNode }) {
  return (
    <code
      className="rounded-[3px] bg-[var(--bp-color-paper-deep)] px-[5px] py-[1px] text-[0.875em] text-[var(--bp-color-ink)]"
      style={{ fontFamily: MONO }}
    >
      {children}
    </code>
  );
}

function Endpoint({ method, path, desc }: { method: string; path: string; desc?: string }) {
  const colors: Record<string, [string, string]> = {
    get: ["var(--bp-color-good-bg)", "var(--bp-color-good)"],
    post: ["var(--bp-color-accent-bg)", "var(--bp-color-accent)"],
    patch: ["var(--bp-color-warn-bg)", "var(--bp-color-warn)"],
    delete: ["var(--bp-color-bad-bg)", "var(--bp-color-bad)"],
  };
  const [bg, fg] = colors[method.toLowerCase()] ?? [
    "var(--bp-color-paper-deep)",
    "var(--bp-color-ink)",
  ];
  return (
    <div
      className="my-5 mb-3.5 flex items-center gap-2.5 rounded-[4px] bg-[var(--bp-color-card)] px-3.5 py-2.5 text-[12.5px] shadow-[0_0_0_1px_var(--bp-color-rule)]"
      style={{ fontFamily: MONO }}
    >
      <span
        className="shrink-0 rounded-[3px] px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.06em]"
        style={{ background: bg, color: fg }}
      >
        {method}
      </span>
      <span className="tracking-[-0.01em]">{path}</span>
      {desc ? (
        <span
          className="ml-auto text-[11.5px] text-[var(--bp-color-ink-40)]"
          style={{ fontFamily: "var(--bp-font-body)" }}
        >
          {desc}
        </span>
      ) : null}
    </div>
  );
}

type ParamRow = { name: string; type: string; req?: boolean; desc: ReactNode };
function Params({ rows }: { rows: readonly ParamRow[] }) {
  return (
    <table className="my-3 w-full border-collapse text-left">
      <thead>
        <tr>
          {["Parameter", "Type", "", "Description"].map((h) => (
            <th
              key={h}
              className="border-b border-[var(--bp-color-rule)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td
              className="border-b border-[var(--bp-color-rule)] px-2.5 py-2 align-top text-[12px] text-[var(--bp-color-ink)] whitespace-nowrap"
              style={{ fontFamily: MONO }}
            >
              {r.name}
            </td>
            <td
              className="border-b border-[var(--bp-color-rule)] px-2.5 py-2 align-top text-[11px] text-[var(--bp-color-ink-40)] whitespace-nowrap"
              style={{ fontFamily: MONO }}
            >
              {r.type}
            </td>
            <td
              className="border-b border-[var(--bp-color-rule)] px-2.5 py-2 align-top text-[10.5px] font-semibold whitespace-nowrap"
              style={{ color: r.req ? "var(--bp-color-bad)" : "var(--bp-color-ink-40)" }}
            >
              {r.req ? "required" : "optional"}
            </td>
            <td className="border-b border-[var(--bp-color-rule)] px-2.5 py-2 align-top text-[13px] leading-[1.5] text-[var(--bp-color-ink-70)]">
              {r.desc}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Callout({ warn, children }: { warn?: boolean; children: ReactNode }) {
  return (
    <div
      className="my-5 rounded-r-[4px] px-4 py-3 text-[13.5px] leading-[1.55] text-[var(--bp-color-ink-70)]"
      style={{
        background: warn ? "var(--bp-color-warn-bg)" : "var(--bp-color-accent-bg)",
        borderLeft: `3px solid ${warn ? "var(--bp-color-warn)" : "var(--bp-color-accent)"}`,
      }}
    >
      {children}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="mb-7 flex gap-4">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bp-color-accent)] text-[11.5px] font-bold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="m-0 mb-1.5 text-[14px] font-semibold">{title}</h4>
        {children}
      </div>
    </li>
  );
}

function CmdTable({ rows }: { rows: readonly [string, string][] }) {
  return (
    <table className="my-3 w-full border-collapse">
      <tbody>
        {rows.map(([cmd, desc], i) => (
          <tr key={i}>
            <td
              className="border-b border-[var(--bp-color-rule)] px-2.5 py-2 pr-6 align-top text-[12px] text-[var(--bp-color-ink)] whitespace-nowrap"
              style={{ fontFamily: MONO }}
            >
              {cmd}
            </td>
            <td className="border-b border-[var(--bp-color-rule)] px-2.5 py-2 align-top text-[13px] leading-[1.5] text-[var(--bp-color-ink-70)]">
              {desc}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CodeBlock({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <div className="my-3 overflow-hidden rounded-[4px] bg-[var(--bp-color-ink)] text-[var(--bp-color-paper)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      {label ? (
        <div className="flex items-center justify-between border-b border-[oklch(0.30_0.01_75)] px-3.5 py-1.5 text-[10.5px] font-medium text-[oklch(0.70_0.01_75)]">
          <span style={{ fontFamily: MONO }}>{label}</span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 text-[10.5px] text-[oklch(0.70_0.01_75)] hover:text-white"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}
      <pre
        className="m-0 overflow-auto p-3.5 text-[12.5px] leading-[1.58]"
        style={{ fontFamily: MONO }}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

// ── Pages ───────────────────────────────────────────────────────

function OverviewPage() {
  return (
    <article>
      <H1>BPI Studio API</H1>
      <P>
        The BPI Studio API gives developers and coding agents programmatic access to the same
        pipeline that powers the Studio UI - route performance data, AI-surfaced findings, and brief
        authoring. Everything you can do in the interface, you can do via REST or CLI.
      </P>
      <P>
        This is how we dogfood the product internally, and how you can integrate it into your own
        workflows, tooling, or autonomous agents.
      </P>
      <H3>Base URL</H3>
      <CodeBlock>https://api.bpi.studio/api/v1/studio</CodeBlock>
      <H3>Response format</H3>
      <P>
        All responses are JSON. Timestamps are ISO 8601 UTC. Route IDs match MTA convention -{" "}
        <IC>M15-SBS</IC>, <IC>Bx12</IC>, <IC>Q44</IC>, etc.
      </P>
      <H3>Errors</H3>
      <P>
        All errors return a consistent shape with a machine-readable <IC>code</IC> and a
        human-readable <IC>message</IC>.
      </P>
      <CodeBlock label="error shape">{`{
  "error": {
    "code": "route_not_found",
    "message": "No route with id 'M99' was found."
  }
}`}</CodeBlock>
    </article>
  );
}

function AuthPage() {
  return (
    <article>
      <H1>Authentication</H1>
      <P>
        All requests are authenticated with a bearer token. Generate one in the Studio settings or
        via <IC>POST /v1/tokens</IC>.
      </P>
      <CodeBlock label="bash">{`curl https://api.bpi.studio/api/v1/studio/routes \\
  -H "Authorization: Bearer $BPI_API_KEY"`}</CodeBlock>
      <Callout warn>
        Keep keys server-side. The CLI reads <IC>BPI_API_KEY</IC> from the environment; never check
        a key into source control.
      </Callout>
      <H2>Key scopes</H2>
      <Params
        rows={[
          { name: "read:routes", type: "scope", desc: "List routes, segments, and trends." },
          { name: "read:findings", type: "scope", desc: "Read AI-surfaced findings + reasoning." },
          { name: "write:briefs", type: "scope", req: true, desc: "Create and edit briefs." },
        ]}
      />
      <H2>Rate limits</H2>
      <P>
        500 requests per minute per key. Long-running brief generation runs in the background; poll{" "}
        <IC>GET /v1/briefs/{"{id}"}</IC> to track status.
      </P>
    </article>
  );
}

function QuickstartPage() {
  return (
    <article>
      <H1>Quickstart</H1>
      <P>Five steps from zero to a cited route brief.</P>
      <ol className="m-0 list-none p-0">
        <Step n={1} title="Install the CLI">
          <CodeBlock label="bash">npm install -g @bpi/cli</CodeBlock>
        </Step>
        <Step n={2} title="Authenticate">
          <CodeBlock label="bash">export BPI_API_KEY=bpi_sk_live_••••••••••••••••</CodeBlock>
        </Step>
        <Step n={3} title="List routes">
          <CodeBlock label="bash">bpi routes list --borough Manhattan --json</CodeBlock>
        </Step>
        <Step n={4} title="Open a route">
          <CodeBlock label="bash">bpi routes get M15-SBS --segments --json</CodeBlock>
        </Step>
        <Step n={5} title="Generate a brief">
          <CodeBlock label="bash">
            bpi briefs new m15-madison-corridor --from-finding m15-treatment-anomaly
          </CodeBlock>
        </Step>
      </ol>
      <Callout>
        Briefs are generated asynchronously. The CLI polls automatically. To use REST,{" "}
        <IC>POST /v1/briefs</IC> returns a job id; poll <IC>GET /v1/briefs/{"{id}"}</IC> until{" "}
        <IC>status = "published"</IC>.
      </Callout>
    </article>
  );
}

function CliPage() {
  return (
    <article>
      <H1>CLI Reference</H1>
      <P>
        The CLI is a thin wrapper around the REST API. JSON output by default. Pretty-printed tables
        with <IC>--pretty</IC>.
      </P>
      <H2>Distribution</H2>
      <CmdTable
        rows={[
          ["npx @bpi/cli", "Run without install"],
          ["npm install -g @bpi/cli", "Node 18+ via npm"],
          ["pipx install bpi-cli", "Python 3.10+ via pipx"],
          ["brew install bpi/tap/bpi", "macOS via Homebrew"],
        ]}
      />
      <H2>Common commands</H2>
      <CmdTable
        rows={[
          ["bpi routes list", "List all routes"],
          ["bpi routes get <id>", "Route detail + segments"],
          ["bpi findings list", "AI-surfaced findings"],
          ["bpi findings get <id>", "Reasoning trail for a finding"],
          ["bpi briefs list", "Briefs you can read or edit"],
          ["bpi briefs new <slug>", "Start a brief from a route or finding"],
          ["bpi briefs publish <id>", "Mark a brief as published"],
        ]}
      />
      <H3>Output format</H3>
      <P>
        All commands accept <IC>--json</IC> (default), <IC>--pretty</IC>, and <IC>--csv</IC>. The
        JSON shape matches the REST response exactly.
      </P>
    </article>
  );
}

function RoutesPage() {
  return (
    <article>
      <H1>Routes</H1>
      <P>
        Route performance data, segment-level breakdowns, and trend windows. Same data the Studio UI
        consumes.
      </P>
      <Endpoint method="get" path="/v1/routes" desc="List all routes" />
      <Params
        rows={[
          { name: "borough", type: "string", desc: "Filter by borough (e.g. 'Manhattan')." },
          { name: "sbs_only", type: "boolean", desc: "Only Select Bus Service routes." },
          { name: "limit", type: "number", desc: "Max routes (default 50, max 200)." },
        ]}
      />
      <Endpoint method="get" path="/v1/routes/{id}" desc="Route detail" />
      <Endpoint
        method="get"
        path="/v1/routes/{id}/segments"
        desc="Segment-level rider-hour breakdown"
      />
      <H2>Sample response</H2>
      <CodeBlock label="GET /v1/routes/M15-SBS">{`{
  "slug": "m15-sbs",
  "label": "M15",
  "sbs": true,
  "weightedAvgSpeed": 6.74,
  "riderHoursLost": 4310,
  "laneCoverage": 72,
  "aceStatus": "active",
  "aceSince": "Nov 2019",
  "termini": { "north": "E 125 St", "south": "South Ferry" }
}`}</CodeBlock>
    </article>
  );
}

function FindingsPage() {
  return (
    <article>
      <H1>Findings</H1>
      <P>
        Findings are AI-surfaced anomalies, treatment gaps, and emerging risks. Each finding ships
        with a 5-step reasoning trail.
      </P>
      <Endpoint method="get" path="/v1/findings" desc="List findings" />
      <Params
        rows={[
          { name: "category", type: "enum", desc: "anomaly | treatment-gap | emerging-risk" },
          { name: "route_slug", type: "string", desc: "Findings for a specific route." },
          { name: "confidence", type: "enum", desc: "high | moderate" },
        ]}
      />
      <Endpoint method="get" path="/v1/findings/{id}" desc="Finding detail + reasoning trail" />
      <Callout>
        Findings are evidence, not action. Treat them as the start of a brief, not the conclusion.
      </Callout>
    </article>
  );
}

function BriefsPage() {
  return (
    <article>
      <H1>Briefs</H1>
      <P>
        Briefs are the publishable artefact: claims, evidence, caveats, and citations bundled into a
        reviewable document.
      </P>
      <Endpoint method="get" path="/v1/briefs" desc="List briefs" />
      <Endpoint method="get" path="/v1/briefs/{id}" desc="Brief detail" />
      <Endpoint method="post" path="/v1/briefs" desc="Generate a brief from claims" />
      <Endpoint method="patch" path="/v1/briefs/{id}" desc="Edit claims, evidence, or caveats" />
      <Endpoint method="post" path="/v1/briefs/{id}/publish" desc="Mark brief as published" />
      <H2>Generation flow</H2>
      <P>
        <IC>POST /v1/briefs</IC> returns immediately with a job id. The pipeline drafts claims from
        the chosen route or finding, attaches evidence and caveats, and emits a brief object with a
        version pointer. Poll the brief endpoint until <IC>status = "draft"</IC> or{" "}
        <IC>"published"</IC>.
      </P>
      <Callout warn>
        Brief generation can take 30-90 seconds for complex routes. Use the CLI&apos;s built-in
        polling or implement an exponential backoff against the brief endpoint.
      </Callout>
    </article>
  );
}

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-[var(--bp-color-accent)] underline decoration-[var(--bp-color-accent-40)] underline-offset-[3px] hover:text-[var(--bp-color-accent-strong)]"
    >
      {children}
    </a>
  );
}

type ReleaseFact = {
  label: string;
  value: string;
  detail: string;
};

const releaseFacts: readonly ReleaseFact[] = [
  {
    label: "Release month",
    value: "2026-03",
    detail: "Latest complete public speed month in the deployed observed release.",
  },
  {
    label: "Route coverage",
    value: "350 public routes",
    detail: "381 catalog routes are loaded; Studio publishes the public-visible route set.",
  },
  {
    label: "Route artifacts",
    value: "1,629 audited refs",
    detail: "Route/corridor briefs, evidence, map, and evaluation artifacts passed publish checks.",
  },
  {
    label: "Findings",
    value: "202 reviewed",
    detail: "Includes 200 promoted detector findings with immutable review/audit provenance.",
  },
  {
    label: "Observed reliability",
    value: "2.57M March samples",
    detail: "346 observed routes from the recovered Bus Observatory March run.",
  },
  {
    label: "Source ledger",
    value: "0 open source actions",
    detail:
      "12 source families audited: 9 historical-ready, 2 context-only, 1 current-signal-only.",
  },
];

function ReleaseFactList() {
  return (
    <dl className="my-5 grid grid-cols-2 gap-x-5 gap-y-4 max-sm:grid-cols-1">
      {releaseFacts.map((fact) => (
        <div key={fact.label} className="border-t border-[var(--bp-color-rule)] pt-3">
          <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
            {fact.label}
          </dt>
          <dd className="m-0 mt-1 text-[17px] font-semibold tracking-[-0.01em] text-[var(--bp-color-ink)]">
            {fact.value}
          </dd>
          <dd className="m-0 mt-1 text-[12.5px] leading-[1.45] text-[var(--bp-color-ink-55)]">
            {fact.detail}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type CreditRow = {
  source: ReactNode;
  role: string;
  coverage: string;
  use: ReactNode;
};

function CreditTable({ rows }: { rows: readonly CreditRow[] }) {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr>
            {["Source", "Role", "Release coverage", "Use in Studio"].map((heading) => (
              <th
                key={heading}
                className="border-b border-[var(--bp-color-rule)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="border-b border-[var(--bp-color-rule)] px-2.5 py-2.5 align-top text-[13px] leading-[1.45] text-[var(--bp-color-ink)]">
                {row.source}
              </td>
              <td
                className="border-b border-[var(--bp-color-rule)] px-2.5 py-2.5 align-top text-[11px] text-[var(--bp-color-ink-55)]"
                style={{ fontFamily: MONO }}
              >
                {row.role}
              </td>
              <td className="border-b border-[var(--bp-color-rule)] px-2.5 py-2.5 align-top text-[12.5px] leading-[1.45] text-[var(--bp-color-ink-70)]">
                {row.coverage}
              </td>
              <td className="border-b border-[var(--bp-color-rule)] px-2.5 py-2.5 align-top text-[12.5px] leading-[1.45] text-[var(--bp-color-ink-70)]">
                {row.use}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const primaryCreditRows: readonly CreditRow[] = [
  {
    source: (
      <>
        <SourceLink href="https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-2023-2024/58t6-89vi">
          MTA Bus Route Segment Speeds 2023-2024
        </SourceLink>{" "}
        and{" "}
        <SourceLink href="https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-Beginning-2025/kufs-yh3x">
          Beginning 2025
        </SourceLink>
      </>
    ),
    role: "primary",
    coverage: "2023-04 through 2026-03 route-month trends.",
    use: "Canonical public monthly speed, trip, hotspot, and peer-speed evidence.",
  },
  {
    source: (
      <>
        <SourceLink href="https://data.ny.gov/Transportation/MTA-Current-Bus-Routes/h2wf-afav">
          MTA Current Bus Routes
        </SourceLink>
        ,{" "}
        <SourceLink href="https://data.ny.gov/Transportation/MTA-Current-Bus-Stops/ai5j-txmn">
          Current Bus Stops
        </SourceLink>
        , and{" "}
        <SourceLink href="https://data.ny.gov/Transportation/MTA-Bus-Schedules-2026/4fnn-qsea">
          Bus Schedules 2026
        </SourceLink>
      </>
    ),
    role: "primary",
    coverage: "381 active catalog routes plus schedule/timepoint rows for release matching.",
    use: "Route shapes, stop/timepoint matching, scheduled service baselines, and route pages.",
  },
  {
    source: (
      <>
        <SourceLink href="https://data.ny.gov/Transportation/MTA-Bus-Hourly-Ridership-2020-2024/kv7t-n8in">
          MTA Bus Hourly Ridership 2020-2024
        </SourceLink>{" "}
        and{" "}
        <SourceLink href="https://data.ny.gov/Transportation/MTA-Bus-Hourly-Ridership-Beginning-2025/gxb3-akrn">
          Beginning 2025
        </SourceLink>
      </>
    ),
    role: "primary",
    coverage: "Historical and current ridership inputs joined into route/month evidence.",
    use: "Rider exposure, route ranking, passenger-load controls, and brief context.",
  },
  {
    source: (
      <>
        <SourceLink href="https://api.busobservatory.org/nyct">Bus Observatory</SourceLink>{" "}
        recovered GTFS-RT archive,{" "}
        <SourceLink href="https://www.mta.info/developers">MTA Bus Time GTFS-RT</SourceLink>, and{" "}
        <SourceLink href="https://data.ny.gov/Transportation/MTA-Bus-Wait-Assessment-Beginning-2020/v4z4-2h6n">
          MTA Bus Wait Assessment
        </SourceLink>
      </>
    ),
    role: "primary",
    coverage:
      "Observed reliability summaries cover 2023-04 through 2026-05; March release uses recovered third-party GTFS-RT provenance.",
    use: "Long gaps, bunching, expected wait, weather/control splits, and reliability detectors.",
  },
  {
    source: (
      <>
        <SourceLink href="https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforced-Routes-Beginning/ki2b-sg5y">
          ACE/ABLE route rollout
        </SourceLink>
        ,{" "}
        <SourceLink href="https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforcement-Violations-Be/kh8p-hcbm">
          ACE violations
        </SourceLink>
        , and{" "}
        <SourceLink href="https://data.cityofnewyork.us/Transportation/Bus-Lanes-Local-Streets/ycrg-ses3">
          NYC DOT bus lanes
        </SourceLink>
      </>
    ),
    role: "primary",
    coverage: "ACE summaries from 2023-04 through 2026-04; bus-lane geometry in release context.",
    use: "Intervention history, treatment-gap findings, before/after reviews, and caveats.",
  },
];

const contextCreditRows: readonly CreditRow[] = [
  {
    source: (
      <>
        <SourceLink href="https://data.cityofnewyork.us/Transportation/Street-Construction-Permits/tqtj-sjs8">
          NYC DOT Street Construction Permits
        </SourceLink>{" "}
        and Street Opening Permit rows
      </>
    ),
    role: "primary/context",
    coverage: "2,028,951 rows; 2018-05 through 2026-05; 96.3% geocoded.",
    use: "Permit-context findings and manual review evidence. Not a causal slowdown claim by itself.",
  },
  {
    source: (
      <>
        <SourceLink href="https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-present/erm2-nwe9">
          NYC 311 current requests
        </SourceLink>{" "}
        and{" "}
        <SourceLink href="https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-2019/76ig-c548">
          historical requests
        </SourceLink>
      </>
    ),
    role: "manual primary",
    coverage:
      "2,560,438 filtered rows; 2023-present target window plus retained 2019 baseline slice.",
    use: "Complaint context for parking, blocked streets, signals, street conditions, and detector review packets.",
  },
  {
    source: (
      <SourceLink href="https://data.cityofnewyork.us/Public-Safety/Motor-Vehicle-Collisions-Crashes/h9gi-nx95">
        NYPD Motor Vehicle Collisions
      </SourceLink>
    ),
    role: "manual primary",
    coverage: "277,606 rows; 2023-04 through 2026-04; 95.9% geocoded.",
    use: "Crash/disruption and safety context near route hotspots and reliability findings.",
  },
  {
    source: (
      <>
        NYC Parking Violations FY2023-FY2026, including{" "}
        <SourceLink href="https://data.cityofnewyork.us/City-Government/Parking-Violations-Issued-Fiscal-Year-2026/pvqr-7yc4">
          current FY2026
        </SourceLink>
      </>
    ),
    role: "context only",
    coverage: "5,753,409 bus-relevant rows; raw-complete for 2023-04 through 2026-03.",
    use: "Curb-pressure context only. Physical-ID geocoding remains low, so parking is not detector-grade evidence.",
  },
  {
    source: (
      <>
        <SourceLink href="https://data.cityofnewyork.us/Transportation/Automated-Traffic-Volume-Counts/7ym2-wayt">
          NYC DOT Automated Traffic Volume Counts
        </SourceLink>{" "}
        and{" "}
        <SourceLink href="https://data.cityofnewyork.us/Transportation/Real-Time-Traffic-Speed-Data/i4gi-tjb9">
          Real-Time Traffic Speed Data
        </SourceLink>
      </>
    ),
    role: "context/current",
    coverage:
      "Traffic volume is release-context-only; DOT realtime speeds are a May 2026 current snapshot.",
    use: "Traffic appendices and caveats. They do not promote route findings automatically.",
  },
  {
    source: (
      <>
        <SourceLink href="https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/">
          NOAA GHCN-Daily
        </SourceLink>
        ,{" "}
        <SourceLink href="https://api.census.gov/data/2024/acs/acs5/profile">
          Census ACS 5-year profile
        </SourceLink>
        , and{" "}
        <SourceLink href="https://data.cityofnewyork.us/City-Government/Centerline/inkn-q76z">
          NYC Centerline / LION
        </SourceLink>
      </>
    ),
    role: "context",
    coverage: "Weather covers 2023-01 through 2026-05; ACS/LION provide route context and joins.",
    use: "Weather controls, equity-priority context, borough/route joins, and source-coverage caveats.",
  },
];

function CreditsPage() {
  return (
    <article>
      <H1>Data & Credits</H1>
      <P>
        The current public Studio release is a March 2026 observed release backed by generated D1
        serving tables and R2 artifacts. The historical corpus is complete for the product&apos;s
        target 2023-04 through latest-complete-speed-month window, with source-specific caveats
        below.
      </P>
      <ReleaseFactList />
      <Callout>
        &quot;Complete&quot; means release-ready for the evidence role assigned to each source, not
        that every public dataset is allowed to become detector-grade proof. Parking violations and
        traffic-volume counts are intentionally context-only; DOT realtime traffic speeds are a
        current-condition appendix.
      </Callout>

      <H2>Primary Release Evidence</H2>
      <P>
        These sources can support route performance, reliability, intervention, or reviewed detector
        claims when the route-level evidence packet passes the matching QA checks.
      </P>
      <CreditTable rows={primaryCreditRows} />

      <H2>Context Sources</H2>
      <P>
        These sources explain, caveat, or prioritize route findings. They are valuable, but several
        are deliberately held below automatic detector-grade status because joins, timing, or
        causality are weaker than the route performance sources.
      </P>
      <CreditTable rows={contextCreditRows} />

      <H2>Use Rules</H2>
      <Params
        rows={[
          {
            name: "Release claims",
            type: "rule",
            desc: "Use March 2026 public monthly speed, schedule, ridership, route, and observed-reliability evidence as the canonical deployed release.",
          },
          {
            name: "Realtime claims",
            type: "rule",
            desc: "May 2026 GTFS-RT is labeled current signal because matching public monthly speed rows are not available yet.",
          },
          {
            name: "Causality",
            type: "rule",
            desc: "Context sources such as permits, 311, parking, collisions, weather, and traffic do not prove causes by themselves.",
          },
          {
            name: "Parking",
            type: "rule",
            desc: "Parking violations remain release-context-only until candidate fanout, match weights, and low physical-ID geocoding are reviewed for detector promotion.",
          },
          {
            name: "Equity",
            type: "rule",
            desc: "ACS context is used for prioritization and transparency, not as a performance metric or agency grade.",
          },
        ]}
      />

      <H2>Terms</H2>
      <P>
        MTA datasets and Bus Time feeds are credited to the Metropolitan Transportation Authority
        and should be used with the{" "}
        <SourceLink href="https://www.mta.info/developers/terms-and-conditions">
          MTA data-feed terms
        </SourceLink>
        . NYC Open Data datasets are credited to their publishing agencies, including NYC DOT, NYPD,
        NYC 311, and NYC Department of Finance. NOAA GHCN-Daily and U.S. Census ACS data are public
        federal datasets. Bus Observatory-derived March reliability is labeled third-party recovered
        provenance throughout the API and UI.
      </P>
    </article>
  );
}

function ChangelogPage() {
  type ItemKind = "new" | "fix" | "break";
  const colors: Record<ItemKind, [string, string]> = {
    new: ["var(--bp-color-good-bg)", "var(--bp-color-good)"],
    fix: ["var(--bp-color-warn-bg)", "var(--bp-color-warn)"],
    break: ["var(--bp-color-bad-bg)", "var(--bp-color-bad)"],
  };
  function Tag({ t, children }: { t: ItemKind; children: ReactNode }) {
    const [bg, fg] = colors[t];
    return (
      <span
        className="shrink-0 rounded-[2px] px-1.5 py-[1.5px] text-[10px] font-bold uppercase tracking-[0.05em]"
        style={{ background: bg, color: fg, fontFamily: MONO }}
      >
        {children}
      </span>
    );
  }
  const items: { t: ItemKind; desc: ReactNode }[] = [
    {
      t: "new",
      desc: (
        <span>
          <IC>GET /v1/routes</IC> and <IC>GET /v1/routes/{"{id}"}</IC>
        </span>
      ),
    },
    {
      t: "new",
      desc: (
        <span>
          <IC>GET /v1/routes/{"{id}"}/segments</IC> - segment-level breakdown
        </span>
      ),
    },
    {
      t: "new",
      desc: (
        <span>
          <IC>GET /v1/findings</IC> + <IC>/v1/findings/{"{id}"}</IC> with reasoning trail
        </span>
      ),
    },
    {
      t: "new",
      desc: (
        <span>
          <IC>POST /v1/briefs</IC> - async brief generation from claims
        </span>
      ),
    },
    {
      t: "new",
      desc: (
        <span>
          <IC>GET /v1/briefs/{"{id}"}</IC> + version history + publish flow
        </span>
      ),
    },
    {
      t: "new",
      desc: (
        <span>
          CLI technical preview - <IC>npx @bpi/cli</IC> &middot; npm &middot; pip &middot; Homebrew
        </span>
      ),
    },
  ];
  return (
    <article>
      <H1>Changelog</H1>
      <div className="mb-10">
        <div className="mb-3 flex items-center gap-3">
          <span className="text-[16px] font-semibold tracking-[-0.015em]">v0.1.0</span>
          <span
            className="text-[12.5px] text-[var(--bp-color-ink-40)]"
            style={{ fontFamily: MONO }}
          >
            2026-05-17
          </span>
          <span
            className="rounded-[3px] px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-[0.06em]"
            style={{
              background: "var(--bp-color-paper-deep)",
              color: "var(--bp-color-ink-55)",
              fontFamily: MONO,
            }}
          >
            Initial release
          </span>
        </div>
        <ul className="m-0 list-none p-0">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-baseline gap-2.5 border-b border-[var(--bp-color-rule)] py-1.5 text-[13.5px] text-[var(--bp-color-ink-70)]"
            >
              <Tag t={item.t}>{item.t}</Tag>
              {item.desc}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

const PAGE_COMPONENTS: Record<DocsPageId, () => ReactNode> = {
  overview: OverviewPage,
  authentication: AuthPage,
  quickstart: QuickstartPage,
  cli: CliPage,
  routes: RoutesPage,
  findings: FindingsPage,
  briefs: BriefsPage,
  "data-credits": CreditsPage,
  changelog: ChangelogPage,
};

const PAGE_MARKDOWN: Record<DocsPageId, string> = {
  overview: buildMarkdown("overview", null, "authentication"),
  authentication: buildMarkdown("authentication", "overview", "quickstart"),
  quickstart: buildMarkdown("quickstart", "authentication", "cli"),
  cli: buildMarkdown("cli", "quickstart", "routes"),
  routes: buildMarkdown("routes", "cli", "findings"),
  findings: buildMarkdown("findings", "routes", "briefs"),
  briefs: buildMarkdown("briefs", "findings", "data-credits"),
  "data-credits": buildDataCreditsMarkdown(),
  changelog: buildMarkdown("changelog", "data-credits", null),
};

function buildDataCreditsMarkdown(): string {
  return [
    "---",
    "page: data-credits",
    "prev: briefs",
    "next: changelog",
    `pages: ${DOCS_PAGE_ORDER.join(" | ")}`,
    "index: https://api.bpi.studio/llms.txt",
    "---",
    "",
    "# BPI Studio API - Data & Credits",
    "",
    "Current public release: March 2026 observed release.",
    "",
    "- 350 public routes from 381 loaded catalog routes.",
    "- 1,629 audited route/corridor/evidence/map artifact references.",
    "- 202 reviewed findings, including 200 promoted detector findings.",
    "- 2,571,297 March observed-reliability samples across 346 observed routes.",
    "- Source ledger: 12 source families; 9 historical-ready, 2 context-only, 1 current-signal-only, 0 open source actions.",
    "",
    "Complete means release-ready for the evidence role assigned to each source, not that every dataset is detector-grade proof.",
    "",
    "Primary evidence sources: MTA Bus Route Segment Speeds, MTA Current Bus Routes and Stops, MTA Bus Schedules, MTA Bus Hourly Ridership, Bus Observatory recovered GTFS-RT, MTA Bus Time GTFS-RT, MTA Bus Wait Assessment, ACE/ABLE route rollout, ACE violations, and NYC DOT bus lanes.",
    "",
    "Context sources: NYC DOT street permits, NYC 311 service requests, NYPD collisions, NYC parking violations, NYC DOT traffic volume counts, NYC DOT realtime traffic speeds, NOAA GHCN-Daily weather, Census ACS 5-year profile data, and NYC Centerline/LION.",
    "",
    "Use rules: March 2026 monthly public evidence is the canonical release layer; May 2026 GTFS-RT is current signal only until public monthly speed rows exist; context sources do not prove causality by themselves; parking remains context-only until match fanout and low physical-ID geocoding are promoted by review.",
    "",
    "Terms: MTA datasets and Bus Time feeds are governed by MTA data-feed terms. NYC Open Data datasets are credited to their publishing agencies. NOAA GHCN-Daily and U.S. Census ACS are public federal datasets. Bus Observatory-derived March reliability is labeled third-party recovered provenance.",
    "",
    "---",
    "Prev: [Briefs](/docs/briefs)",
    "Next: [Changelog](/docs/changelog)",
    "Index: https://api.bpi.studio/llms.txt",
  ].join("\n");
}

function buildMarkdown(page: DocsPageId, prev: DocsPageId | null, next: DocsPageId | null): string {
  const allPages = DOCS_PAGE_ORDER.join(" | ");
  const title = DOCS_PAGE_TITLES[page];
  return [
    "---",
    `page: ${page}`,
    `prev: ${prev ?? "null"}`,
    `next: ${next ?? "null"}`,
    `pages: ${allPages}`,
    "index: https://api.bpi.studio/llms.txt",
    "---",
    "",
    `# BPI Studio API - ${title}`,
    "",
    "See the rendered docs page in the Studio UI for the full content.",
    "",
    "---",
    prev ? `Prev: [${DOCS_PAGE_TITLES[prev]}](/docs/${prev})` : "",
    next ? `Next: [${DOCS_PAGE_TITLES[next]}](/docs/${next})` : "",
    "Index: https://api.bpi.studio/llms.txt",
  ]
    .filter(Boolean)
    .join("\n");
}
