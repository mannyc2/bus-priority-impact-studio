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

type ParamRow = { name: string; type: string; req?: boolean; desc: string };
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

function CreditsPage() {
  return (
    <article>
      <H1>Data & Credits</H1>
      <Callout warn>Full attribution table and license details are being finalized.</Callout>
      <Params
        rows={[
          {
            name: "MTA GTFS-RT",
            type: "real-time",
            desc: "Vehicle positions and trip updates. MTA Developer Data license.",
          },
          {
            name: "MTA BusTime API",
            type: "historical",
            desc: "Stop-level arrival/departure times.",
          },
          {
            name: "OpenStreetMap",
            type: "geo",
            desc: "Street network, stop locations. © contributors, ODbL.",
          },
          {
            name: "NYC DOT",
            type: "reference",
            desc: "Bus lane locations and signal priority corridors.",
          },
          {
            name: "MTA ACE",
            type: "program record",
            desc: "Camera enforcement coverage and violations.",
          },
        ]}
      />
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
  "data-credits": buildMarkdown("data-credits", "briefs", "changelog"),
  changelog: buildMarkdown("changelog", "data-credits", null),
};

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
