import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Rail } from "@/components/Rail";
import { StudioPage } from "../page.js";
import { DOCS_PAGE_ORDER, type DocsPageId, isDocsPage } from "./docs-pages.js";
import { NotFoundPage } from "./not-found.js";

const MONO = "var(--bp-font-mono)";

const DOCS_PAGE_TITLES: Record<DocsPageId, string> = {
  overview: "Overview",
  authentication: "Authentication",
  quickstart: "Quickstart",
  cli: "CLI Reference",
  routes: "Routes",
  findings: "Findings",
  briefs: "Briefs",
  "data-credits": "Data & Credits",
  methodology: "Methodology",
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
  methodology: "Resources",
  changelog: "Resources",
};

const NAV_GROUPS: { label: string; pages: DocsPageId[] }[] = [
  { label: "Introduction", pages: ["overview", "authentication"] },
  { label: "Get started", pages: ["quickstart", "cli"] },
  { label: "API Reference", pages: ["routes", "findings", "briefs"] },
  { label: "Resources", pages: ["data-credits", "methodology", "changelog"] },
];

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
        Public Studio read endpoints are anonymous. Draft authoring endpoints use the signed-in
        Studio session cookie from magic-link auth and require an operator role in the draft
        workspace.
      </P>
      <CodeBlock label="bash">{`curl https://api.bpi.studio/api/v1/studio/briefs/m15-madison-corridor/draft \\
  -X PATCH \\
  -H "Cookie: bp_session=$BP_SESSION" \\
  -H "Idempotency-Key: draft-title-1" \\
  -H "Content-Type: application/json" \\
  --data '{"title":"Madison corridor draft"}'`}</CodeBlock>
      <Callout warn>
        Draft mutation requests must include <IC>Idempotency-Key</IC>. Use one stable key for one
        user or agent action so retries cannot duplicate claims or history events.
      </Callout>
      <H2>Key scopes</H2>
      <Params
        rows={[
          { name: "read:briefs", type: "scope", desc: "Read live draft overlays for a workspace." },
          {
            name: "write:briefs",
            type: "scope",
            req: true,
            desc: "Edit draft metadata and claims.",
          },
          { name: "review:briefs", type: "scope", desc: "Request review and add review notes." },
          {
            name: "publish:briefs",
            type: "scope",
            desc: "Mark, retract, and export publish candidates.",
          },
          { name: "admin:identities", type: "scope", desc: "Manage Studio operator roles." },
        ]}
      />
      <H2>Generation</H2>
      <P>
        Generation requests are recorded as jobs and queued through the Cloudflare Think authoring
        agent when Workers AI bindings are configured. The REST handler returns immediately; model
        output lands as a proposal that still needs operator approval.
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
        <Step n={2} title="Sign in to Studio">
          <CodeBlock label="bash">export BP_SESSION=your_magic_link_session_cookie</CodeBlock>
        </Step>
        <Step n={3} title="List routes">
          <CodeBlock label="bash">bpi routes list --borough Manhattan --json</CodeBlock>
        </Step>
        <Step n={4} title="Open a route">
          <CodeBlock label="bash">bpi routes get M15-SBS --segments --json</CodeBlock>
        </Step>
        <Step n={5} title="Start an existing-brief draft">
          <CodeBlock label="bash">
            {`curl https://api.bpi.studio/api/v1/studio/briefs/m15-madison-corridor/draft \\
  -X PATCH \\
  -H "Cookie: bp_session=$BP_SESSION" \\
  -H "Idempotency-Key: quickstart-draft-1" \\
  -H "Content-Type: application/json" \\
  --data '{"title":"Madison corridor draft"}'`}
          </CodeBlock>
        </Step>
      </ol>
      <Callout>
        Draft authoring currently starts from an existing published brief. New-brief creation,
        evidence minting, and the out-of-band AI runner are separate follow-up surfaces.
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
          ["bpi briefs draft <id>", "Start or update an existing brief draft"],
          ["bpi briefs publish-candidate <id>", "Mark a draft as a publish candidate"],
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
      <H2>Public reads</H2>
      <Endpoint method="get" path="/api/v1/studio/briefs" desc="List briefs" />
      <Endpoint method="get" path="/api/v1/studio/briefs/{id}" desc="Brief detail" />
      <Endpoint method="get" path="/api/v1/studio/briefs/{id}/evidence" desc="Evidence catalog" />
      <Endpoint
        method="get"
        path="/api/v1/studio/briefs/{id}/history"
        desc="Release history projection"
      />
      <H2>Draft authoring</H2>
      <P>
        Draft endpoints are live D1 writes for signed-in Studio operators. All draft mutations
        require
        <IC>Idempotency-Key</IC>; public brief reads remain anonymous and only overlay draft status
        for operators with <IC>read:briefs</IC> in the draft workspace.
      </P>
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs"
        desc="Create a draft brief from a route, finding, or source brief"
      />
      <Endpoint method="patch" path="/api/v1/studio/briefs/{id}/draft" desc="Edit draft metadata" />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/generate"
        desc="Queue an AI generation run"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/agent-runs"
        desc="Start an authoring agent run"
      />
      <Endpoint
        method="get"
        path="/api/v1/studio/briefs/{id}/draft/agent-runs/{runId}"
        desc="Fetch an authoring agent run"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/agent-runs/{runId}/propose-edit"
        desc="Validate and store structured agent edits"
      />
      <Endpoint
        method="get"
        path="/api/v1/studio/briefs/{id}/draft/proposals/{proposalId}"
        desc="Fetch an agent proposal"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/proposals/{proposalId}/apply"
        desc="Apply approved proposal operations"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/proposals/{proposalId}/reject"
        desc="Reject an agent proposal"
      />
      <Endpoint
        method="get"
        path="/api/v1/studio/briefs/{id}/draft/versions"
        desc="List draft version milestones"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/versions/{versionId}/restore"
        desc="Restore a draft version snapshot"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/claims"
        desc="Add a draft claim"
      />
      <Endpoint
        method="patch"
        path="/api/v1/studio/briefs/{id}/draft/claims/{claimN}"
        desc="Edit a draft claim"
      />
      <Endpoint
        method="delete"
        path="/api/v1/studio/briefs/{id}/draft/claims/{claimN}"
        desc="Delete and renumber a draft claim"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/blocks"
        desc="Add a typed primitive block"
      />
      <Endpoint
        method="patch"
        path="/api/v1/studio/briefs/{id}/draft/blocks/{blockId}"
        desc="Edit a typed primitive block"
      />
      <Endpoint
        method="delete"
        path="/api/v1/studio/briefs/{id}/draft/blocks/{blockId}"
        desc="Delete a typed primitive block"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/refs/resolve"
        desc="Resolve content-graph refs"
      />
      <Endpoint
        method="get"
        path="/api/v1/studio/briefs/{id}/draft/refs"
        desc="List persisted content-graph refs"
      />
      <Endpoint
        method="put"
        path="/api/v1/studio/briefs/{id}/draft/refs"
        desc="Replace persisted content-graph refs"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/attach"
        desc="Attach a captured Studio object as a typed block"
      />
      <Endpoint
        method="get"
        path="/api/v1/studio/briefs/{id}/draft/comments"
        desc="List draft-private review threads"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/comments"
        desc="Create an anchored comment, change request, or suggestion"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/comments/{commentId}/replies"
        desc="Reply to a review thread"
      />
      <Endpoint
        method="patch"
        path="/api/v1/studio/briefs/{id}/draft/comments/{commentId}"
        desc="Resolve, dismiss, reopen, or edit a review thread"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/comments/{commentId}/accept-suggestion"
        desc="Apply a body-markdown suggestion"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/validate"
        desc="Refresh deterministic validation"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/review"
        desc="Request review"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/verdict"
        desc="Approve or request changes"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/publish"
        desc="Mark as publish candidate"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/retract"
        desc="Retract a publish candidate"
      />
      <Endpoint
        method="post"
        path="/api/v1/studio/briefs/{id}/draft/promotion-receipt"
        desc="Record an offline public promotion"
      />
      <Endpoint
        method="get"
        path="/api/v1/studio/briefs/{id}/draft/publish-candidate-export"
        desc="Fetch release-review payload"
      />
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
    value: "0 blocking metadata gaps",
    detail: "12 source families audited; source-productization actions remain tracked separately.",
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

      <H2>Derived Artifacts</H2>
      <P>
        On top of these sources, the Studio publishes its own generated route-slice artifacts -
        route/month/segment evidence rows carrying the evidence references and quality flags that
        power route detail, findings, briefs, and the public projections. They are a derived layer,
        not a separate source: every row resolves back to the primary and context datasets above.
        The metric definitions and publication caveats applied to them live on{" "}
        <Link
          to="/docs/$page"
          params={{ page: "methodology" }}
          className="font-medium text-[var(--bp-color-accent)] underline decoration-[var(--bp-color-accent-40)] underline-offset-[3px] hover:text-[var(--bp-color-accent-strong)]"
        >
          Methodology
        </Link>
        .
      </P>

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

function MethodologyPage() {
  const metrics = [
    {
      name: "Observed long-gap share",
      expr: "long-gap samples / observed headway samples",
      note: "Used as the lead metric for reviewed B25 and BX41 reliability findings.",
    },
    {
      name: "Weighted average route speed",
      expr: "route speed weighted by segment evidence and exposure",
      note: "Published as route-speed evidence, not as an isolated rider-pain score.",
    },
    {
      name: "DOT permit route touches",
      expr: "context events joined through direct route IDs or route-LION physical IDs",
      note: "Supports context/prioritization claims only unless exact hotspot overlap is verified.",
    },
    {
      name: "Ridership exposure",
      expr: "ridership assigned to segment or route evidence rows",
      note: "Used to prefer findings where many riders are exposed to the observed condition.",
    },
  ];
  const caveats = [
    {
      name: "Context is not causality",
      body: "Permit, collision, 311, parking, and ACE touches identify nearby operational context. They do not prove the context caused a speed or reliability outcome.",
    },
    {
      name: "Single-month speed release",
      body: "March 2026 speed/hotspot evidence is strong for publication, but speed trend claims need additional monthly route-slice summaries.",
    },
    {
      name: "Recovered reliability provenance",
      body: "Bus Observatory reliability rows are third-party recovered observations. They are useful for trends, but should remain labeled separately from official self-collected GTFS-RT runs.",
    },
    {
      name: "Physical overlap varies by source",
      body: "Route-touch joins may prove route-corridor overlap before they prove exact hotspot-segment overlap. Published claims should name the verified grain.",
    },
  ];
  return (
    <article>
      <H1>Methodology</H1>
      <P>
        Every public finding should trace back to a dataset, a computed metric, and a caveat. This
        page defines the metrics behind Studio findings and the limits on how far each claim can be
        pushed. For the datasets and source credits those metrics are computed from, see{" "}
        <Link
          to="/docs/$page"
          params={{ page: "data-credits" }}
          className="font-medium text-[var(--bp-color-accent)] underline decoration-[var(--bp-color-accent-40)] underline-offset-[3px] hover:text-[var(--bp-color-accent-strong)]"
        >
          Data &amp; Credits
        </Link>
        .
      </P>
      <Callout>
        <strong>Publication rule:</strong> a public finding should name the evidence grain it
        actually verifies. Route-corridor context is not the same as exact hotspot-segment overlap.
      </Callout>

      <H2>Metrics</H2>
      {metrics.map((m) => (
        <div key={m.name}>
          <H3>{m.name}</H3>
          <P>
            <IC>{m.expr}</IC>
          </P>
          <P>{m.note}</P>
        </div>
      ))}

      <H2>Caveats</H2>
      {caveats.map((c) => (
        <div key={c.name}>
          <H3>{c.name}</H3>
          <P>{c.body}</P>
        </div>
      ))}
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
          <IC>/api/v1/studio/briefs/{"{id}"}/draft*</IC> - live draft authoring endpoints
        </span>
      ),
    },
    {
      t: "new",
      desc: (
        <span>
          <IC>GET /api/v1/studio/briefs/{"{id}"}</IC> + draft status overlay for operators
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
  methodology: MethodologyPage,
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
  methodology: buildMethodologyMarkdown(),
  changelog: buildMarkdown("changelog", "methodology", null),
};

function buildDataCreditsMarkdown(): string {
  return [
    "---",
    "page: data-credits",
    "prev: briefs",
    "next: methodology",
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
    "- Source ledger: 12 source families; 9 historical-ready, 2 context-only, 1 current-signal-only, 0 blocking metadata gaps. Source-productization actions remain tracked separately.",
    "",
    "Complete means release-ready for the evidence role assigned to each source, not that every dataset is detector-grade proof or that detector quality is fully calibrated.",
    "",
    "Primary evidence sources: MTA Bus Route Segment Speeds, MTA Current Bus Routes and Stops, MTA Bus Schedules, MTA Bus Hourly Ridership, Bus Observatory recovered GTFS-RT, MTA Bus Time GTFS-RT, MTA Bus Wait Assessment, ACE/ABLE route rollout, ACE violations, and NYC DOT bus lanes.",
    "",
    "Context sources: NYC DOT street permits, NYC 311 service requests, NYPD collisions, NYC parking violations, NYC DOT traffic volume counts, NYC DOT realtime traffic speeds, NOAA GHCN-Daily weather, Census ACS 5-year profile data, and NYC Centerline/LION.",
    "",
    "Derived artifacts: the Studio publishes its own generated route-slice artifacts (route/month/segment evidence rows with evidence references and quality flags) as a derived layer over the sources above. Metric definitions and publication caveats for them live on Methodology (/docs/methodology).",
    "",
    "Use rules: March 2026 monthly public evidence is the canonical release layer; May 2026 GTFS-RT is current signal only until public monthly speed rows exist; context sources do not prove causality by themselves; parking remains context-only until match fanout and low physical-ID geocoding are promoted by review.",
    "",
    "Terms: MTA datasets and Bus Time feeds are governed by MTA data-feed terms. NYC Open Data datasets are credited to their publishing agencies. NOAA GHCN-Daily and U.S. Census ACS are public federal datasets. Bus Observatory-derived March reliability is labeled third-party recovered provenance.",
    "",
    "---",
    "Prev: [Briefs](/docs/briefs)",
    "Next: [Methodology](/docs/methodology)",
    "Index: https://api.bpi.studio/llms.txt",
  ].join("\n");
}

function buildMethodologyMarkdown(): string {
  return [
    "---",
    "page: methodology",
    "prev: data-credits",
    "next: changelog",
    `pages: ${DOCS_PAGE_ORDER.join(" | ")}`,
    "index: https://api.bpi.studio/llms.txt",
    "---",
    "",
    "# BPI Studio API - Methodology",
    "",
    "Every public finding traces back to a dataset, a computed metric, and a caveat. Dataset and source credits live on the Data & Credits page (/docs/data-credits).",
    "",
    "Publication rule: a public finding should name the evidence grain it actually verifies. Route-corridor context is not the same as exact hotspot-segment overlap.",
    "",
    "## Metrics",
    "",
    "- Observed long-gap share: long-gap samples / observed headway samples. Used as the lead metric for reviewed B25 and BX41 reliability findings.",
    "- Weighted average route speed: route speed weighted by segment evidence and exposure. Published as route-speed evidence, not as an isolated rider-pain score.",
    "- DOT permit route touches: context events joined through direct route IDs or route-LION physical IDs. Supports context/prioritization claims only unless exact hotspot overlap is verified.",
    "- Ridership exposure: ridership assigned to segment or route evidence rows. Used to prefer findings where many riders are exposed to the observed condition.",
    "",
    "## Caveats",
    "",
    "- Context is not causality: permit, collision, 311, parking, and ACE touches identify nearby operational context. They do not prove the context caused a speed or reliability outcome.",
    "- Single-month speed release: March 2026 speed/hotspot evidence is strong for publication, but speed trend claims need additional monthly route-slice summaries.",
    "- Recovered reliability provenance: Bus Observatory reliability rows are third-party recovered observations and should remain labeled separately from official self-collected GTFS-RT runs.",
    "- Physical overlap varies by source: route-touch joins may prove route-corridor overlap before they prove exact hotspot-segment overlap. Published claims should name the verified grain.",
    "",
    "---",
    "Prev: [Data & Credits](/docs/data-credits)",
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
