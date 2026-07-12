// docs-pages.jsx
// All page components, markdown strings, and the routing registry.
// Depends on: window.CodeBlock, window.CodeTabs (from system.jsx)

const { CodeBlock, CodeTabs } = window;
const MONO = "'SF Mono', ui-monospace, Menlo, Consolas, monospace";
const B3   = '```'; // triple backtick for markdown fences

// ── Prose helpers ──────────────────────────────────────────────────────

function Eyebrow({ children }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,20,15,.38)', marginBottom: 7 }}>{children}</div>;
}
function H1({ children }) {
  return <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.025em', margin: '0 0 14px', lineHeight: 1.2 }}>{children}</h1>;
}
function H2({ children }) {
  return <h2 style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em', margin: '40px 0 10px', lineHeight: 1.3 }}>{children}</h2>;
}
function H3({ children }) {
  return <h3 style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.005em', margin: '28px 0 8px' }}>{children}</h3>;
}
function P({ children }) {
  return <p style={{ margin: '0 0 13px', color: 'rgba(22,20,15,.78)', lineHeight: 1.65 }}>{children}</p>;
}
function IC({ children }) {
  return <code style={{ fontFamily: MONO, fontSize: '0.875em', background: '#ece7db', padding: '1px 5px', borderRadius: 3, color: '#16140f' }}>{children}</code>;
}

// ── API primitives ─────────────────────────────────────────────────────

function Endpoint({ method, path, desc }) {
  const colors = {
    get:    ['oklch(0.94 0.04 155)', 'oklch(0.42 0.12 155)'],
    post:   ['oklch(0.94 0.04 252)', 'oklch(0.42 0.13 252)'],
    patch:  ['oklch(0.95 0.05 70)',  'oklch(0.50 0.13 65)' ],
    delete: ['oklch(0.94 0.05 28)',  'oklch(0.48 0.15 28)' ],
  };
  const [bg, fg] = colors[method.toLowerCase()] || ['#ece7db','#16140f'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'oklch(0.99 0.007 75)', border: '1px solid rgba(22,20,15,.12)', borderRadius: 4, padding: '10px 14px', margin: '22px 0 14px', fontFamily: MONO, fontSize: 12.5 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 3, flexShrink: 0, background: bg, color: fg, textTransform: 'uppercase' }}>{method}</span>
      <span style={{ color: '#16140f', letterSpacing: '-0.01em' }}>{path}</span>
      {desc && <span style={{ color: 'rgba(22,20,15,.42)', fontSize: 11.5, marginLeft: 'auto', fontFamily: 'inherit' }}>{desc}</span>}
    </div>
  );
}

function Params({ rows }) {
  const th = { textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(22,20,15,.38)', borderBottom: '1px solid rgba(22,20,15,.11)' };
  const td = { padding: '8px 10px', borderBottom: '1px solid rgba(22,20,15,.07)', verticalAlign: 'top' };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0 18px' }}>
      <thead>
        <tr>{['Parameter','Type','','Description'].map((h,i) => <th key={i} style={th}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ ...td, fontFamily: MONO, fontSize: 12, color: '#16140f', whiteSpace: 'nowrap' }}>{r.name}</td>
            <td style={{ ...td, fontFamily: MONO, fontSize: 11, color: 'rgba(22,20,15,.45)', whiteSpace: 'nowrap' }}>{r.type}</td>
            <td style={{ ...td, fontSize: 10.5, fontWeight: 600, color: r.req ? 'oklch(0.48 0.15 28)' : 'rgba(22,20,15,.35)', whiteSpace: 'nowrap' }}>{r.req ? 'required' : 'optional'}</td>
            <td style={{ ...td, color: 'rgba(22,20,15,.65)', fontSize: 13, lineHeight: 1.5 }}>{r.desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Callout({ warn, children }) {
  return (
    <div style={{ background: warn ? 'oklch(0.96 0.04 75)' : 'oklch(0.955 0.035 252)', borderLeft: `3px solid ${warn ? 'oklch(0.65 0.12 70)' : 'oklch(0.42 0.13 252)'}`, borderRadius: '0 4px 4px 0', padding: '11px 15px', margin: '18px 0', fontSize: 13.5, color: 'rgba(22,20,15,.72)', lineHeight: 1.55 }}>{children}</div>
  );
}

function Step({ n, title, children }) {
  return (
    <li style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
      <div style={{ flexShrink: 0, width: 24, height: 24, minWidth: 24, background: 'oklch(0.42 0.13 252)', color: 'white', borderRadius: '50%', fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>{title}</h4>
        {children}
      </div>
    </li>
  );
}

function CmdTable({ rows }) {
  const td = { padding: '8px 10px', borderBottom: '1px solid rgba(22,20,15,.07)', verticalAlign: 'top', fontSize: 13 };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0 18px' }}>
      <tbody>
        {rows.map(([cmd, desc], i) => (
          <tr key={i}>
            <td style={{ ...td, fontFamily: MONO, fontSize: 12, color: '#16140f', whiteSpace: 'nowrap', paddingRight: 24 }}>{cmd}</td>
            <td style={{ ...td, color: 'rgba(22,20,15,.62)', lineHeight: 1.5 }}>{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ══ Pages ════════════════════════════════════════════════════════════

// ── Overview ──────────────────────────────────────────────────────────
function OverviewPage() {
  return (
    <article>
      <H1>BPI Studio API</H1>
      <P>The BPI Studio API gives developers and coding agents programmatic access to the same pipeline that powers the Studio UI — route performance data, AI-surfaced findings, and brief authoring. Everything you can do in the interface, you can do via REST or CLI.</P>
      <P>This is how we dogfood the product internally, and how you can integrate it into your own workflows, tooling, or autonomous agents.</P>

      <H3>Base URL</H3>
      <CodeBlock noHeader>https://api.bpi.studio/v1</CodeBlock>

      <H3>Response format</H3>
      <P>All responses are JSON. Timestamps are ISO 8601 UTC. Route IDs match MTA convention — <IC>M15-SBS</IC>, <IC>Bx12</IC>, <IC>Q44</IC>, etc.</P>

      <H3>Errors</H3>
      <P>All errors return a consistent shape with a machine-readable <IC>code</IC> and a human-readable <IC>message</IC>.</P>
      <CodeBlock label="error shape">
{`{
  "error": {
    "code": "route_not_found",
    "message": "No route with id 'M99' was found."
  }
}`}
      </CodeBlock>
    </article>
  );
}

const MARKDOWN_OVERVIEW = `---
page: overview
prev: null
next: authentication
pages: overview | authentication | quickstart | cli | routes | findings | briefs | data-credits | changelog
index: https://api.bpi.studio/llms.txt
---

# BPI Studio API — Overview

The BPI Studio API gives developers and coding agents programmatic access to route performance data, AI-surfaced findings, and brief authoring.

**Base URL:** \`https://api.bpi.studio/v1\`

All responses are JSON. Timestamps are ISO 8601 UTC. Route IDs match MTA convention (M15-SBS, Bx12, Q44, etc.).

## Errors

${B3}json
{
  "error": {
    "code": "route_not_found",
    "message": "No route with id 'M99' was found."
  }
}
${B3}

---
Next: [Authentication](#authentication)
Index: https://api.bpi.studio/llms.txt
`;

// ── Authentication ─────────────────────────────────────────────────────
function AuthPage() {
  return (
    <article>
      <H1>Authentication</H1>
      <P>All API requests require a Bearer token passed in the <IC>Authorization</IC> header.</P>
      <CodeBlock label="request header">
{`Authorization: Bearer bpi_sk_live_••••••••••••••••`}
      </CodeBlock>

      <Callout>
        <strong>Getting a key —</strong> API keys aren't self-serve yet. Contact the team to request access. Keys are scoped per organization.
      </Callout>

      <H3>Rate limiting</H3>
      <P>1,000 requests per hour per key. Every response includes <IC>X-RateLimit-Remaining</IC> and <IC>X-RateLimit-Reset</IC> headers so you can pace your requests.</P>
      <CodeBlock label="rate limit headers">
{`X-RateLimit-Limit:     1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset:     1747490400`}
      </CodeBlock>

      <H3>Errors</H3>
      <P>Unauthorized requests return HTTP <IC>401</IC> with code <IC>unauthorized</IC>. Exceeded rate limit returns HTTP <IC>429</IC> with code <IC>rate_limit_exceeded</IC>.</P>
    </article>
  );
}

const MARKDOWN_AUTH = `---
page: authentication
prev: overview
next: quickstart
pages: overview | authentication | quickstart | cli | routes | findings | briefs | data-credits | changelog
index: https://api.bpi.studio/llms.txt
---

# Authentication

All API requests require a Bearer token in the \`Authorization\` header.

${B3}
Authorization: Bearer bpi_sk_live_••••••••••••••••
${B3}

API keys are not yet self-serve. Contact the team to request access.

## Rate limits

1,000 requests per hour per key. Monitor usage via response headers:

- \`X-RateLimit-Remaining\` — requests left in current window
- \`X-RateLimit-Reset\` — Unix timestamp when window resets

Exceeded limit returns HTTP 429 with code \`rate_limit_exceeded\`.

---
Prev: [Overview](#overview) · Next: [Quickstart](#quickstart)
`;

// ── Quickstart ─────────────────────────────────────────────────────────
function QuickstartPage() {
  return (
    <article>
      <H1>Quickstart</H1>
      <P>From zero to a published brief in four steps.</P>

      <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0' }}>
        <Step n={1} title="Set your API key">
          <P>Store it as an environment variable — never hardcode it.</P>
          <CodeBlock lang="bash">{`export BPI_API_KEY=bpi_sk_live_••••••••••••••••`}</CodeBlock>
        </Step>

        <Step n={2} title="Fetch a route">
          <P>Look up the M15-SBS and inspect its current performance summary.</P>
          <CodeTabs tabs={[
            { lang: 'curl', children: `curl https://api.bpi.studio/v1/routes/M15-SBS \\\n  -H "Authorization: Bearer $BPI_API_KEY"` },
            { lang: 'typescript', children: `const res = await fetch("https://api.bpi.studio/v1/routes/M15-SBS", {\n  headers: { Authorization: \`Bearer \${process.env.BPI_API_KEY}\` },\n});\nconst route = await res.json();` },
            { lang: 'python', children: `import httpx, os\n\nroute = httpx.get(\n    "https://api.bpi.studio/v1/routes/M15-SBS",\n    headers={"Authorization": f"Bearer {os.environ['BPI_API_KEY']}"},\n).json()` },
          ]} />
        </Step>

        <Step n={3} title="Create a brief">
          <P>Pass one or more claims to the composer. The API assembles evidence and returns a draft with citations.</P>
          <CodeTabs tabs={[
            { lang: 'curl', children: `curl -X POST https://api.bpi.studio/v1/briefs \\\n  -H "Authorization: Bearer $BPI_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "route_id": "M15-SBS",\n    "claims": [{\n      "text": "Speed on 96th–42nd St declined 18% week-over-week",\n      "segment_id": "M15-SBS-12"\n    }]\n  }'` },
            { lang: 'typescript', children: `const draft = await fetch("https://api.bpi.studio/v1/briefs", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.BPI_API_KEY}\`,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({\n    route_id: "M15-SBS",\n    claims: [{ text: "Speed declined 18% WoW", segment_id: "M15-SBS-12" }],\n  }),\n}).then(r => r.json());` },
            { lang: 'python', children: `draft = httpx.post(\n    "https://api.bpi.studio/v1/briefs",\n    headers={"Authorization": f"Bearer {os.environ['BPI_API_KEY']}"},\n    json={\n        "route_id": "M15-SBS",\n        "claims": [{"text": "Speed declined 18% WoW", "segment_id": "M15-SBS-12"}],\n    },\n).json()` },
          ]} />
        </Step>

        <Step n={4} title="Poll for completion">
          <P>Brief generation is async. Poll until <IC>status</IC> is <IC>"ready"</IC>.</P>
          <CodeBlock lang="bash">{`# status: "queued" → "composing" → "ready" | "failed"\ncurl https://api.bpi.studio/v1/briefs/brf_01hwx… \\\n  -H "Authorization: Bearer $BPI_API_KEY"`}</CodeBlock>
        </Step>
      </ul>
    </article>
  );
}

const MARKDOWN_QS = `---
page: quickstart
prev: authentication
next: cli
pages: overview | authentication | quickstart | cli | routes | findings | briefs | data-credits | changelog
index: https://api.bpi.studio/llms.txt
---

# Quickstart

## Step 1 — Set your API key

${B3}bash
export BPI_API_KEY=bpi_sk_live_••••••••••••••••
${B3}

## Step 2 — Fetch a route

${B3}bash
curl https://api.bpi.studio/v1/routes/M15-SBS \\
  -H "Authorization: Bearer $BPI_API_KEY"
${B3}

## Step 3 — Create a brief

${B3}bash
curl -X POST https://api.bpi.studio/v1/briefs \\
  -H "Authorization: Bearer $BPI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "route_id": "M15-SBS",
    "claims": [{ "text": "Speed declined 18% WoW", "segment_id": "M15-SBS-12" }]
  }'
${B3}

## Step 4 — Poll for completion

Brief generation is async. Poll \`GET /v1/briefs/{id}\` until \`status\` is \`"ready"\`.

Status lifecycle: \`queued\` → \`composing\` → \`ready\` | \`failed\`

---
Prev: [Authentication](#authentication) · Next: [CLI Reference](#cli)
`;

// ── CLI ────────────────────────────────────────────────────────────────
function CliPage() {
  return (
    <article>
      <H1>CLI Reference</H1>
      <P>The <IC>bpi</IC> CLI wraps the REST API in a command-line interface that ships as a self-contained static binary — no Node, Python, or runtime required.</P>

      <H2>Installation</H2>
      <CodeTabs tabs={[
        { lang: 'npm',     children: `# Run without installing\nnpx @bpi/cli\n\n# Install globally\nnpm install -g @bpi/cli` },
        { lang: 'pip',     children: `pip install bpi-cli` },
        { lang: 'brew',    children: `brew install bpi-studio/tap/bpi` },
      ]} />

      <Callout warn>
        <strong>Technical preview.</strong> Commands and flags may change before v1.0. All commands support <IC>--json</IC> for machine-readable output.
      </Callout>

      <H2>Authentication</H2>
      <CodeBlock lang="bash">{`bpi auth login    # opens browser, saves token to ~/.bpi/credentials\nbpi auth token    # print the active token`}</CodeBlock>

      <H2>Commands</H2>
      <CmdTable rows={[
        ['bpi routes list',          <span>List routes. Flags: <IC>--borough</IC>, <IC>--status degraded</IC>, <IC>--json</IC></span>],
        ['bpi routes get <id>',      'Get route with performance summary and AI diagnosis'],
        ['bpi findings list',        <span>List findings. Flags: <IC>--route &lt;id&gt;</IC>, <IC>--limit</IC></span>],
        ['bpi findings get <id>',    'Get a finding with its full reasoning trail'],
        ['bpi brief create',         <span>Create a brief. Flags: <IC>--route</IC>, <IC>--claim</IC> (repeatable), <IC>--segment</IC></span>],
        ['bpi brief get <id>',       'Get brief status and content'],
        ['bpi brief publish <id>',   'Publish a brief and get a shareable URL'],
      ]} />

      <H3>Agent workflow example</H3>
      <CodeBlock lang="bash">
{`# Find degraded Manhattan routes, pick the worst
bpi routes list --borough manhattan --status degraded --json \\
  | jq -r 'sort_by(.perf.week_over_week_delta) | .[0].id'

# Generate a brief for it
bpi brief create \\
  --route M15-SBS \\
  --segment "96th to 42nd" \\
  --claim "Speed declined 18% week-over-week" \\
  --json`}
      </CodeBlock>
    </article>
  );
}

const MARKDOWN_CLI = `---
page: cli
prev: quickstart
next: routes
pages: overview | authentication | quickstart | cli | routes | findings | briefs | data-credits | changelog
index: https://api.bpi.studio/llms.txt
---

# CLI Reference

Self-contained static binary — no runtime required.

## Installation

${B3}bash
# npm (run without installing)
npx @bpi/cli

# pip
pip install bpi-cli

# Homebrew
brew install bpi-studio/tap/bpi
${B3}

## Authentication

${B3}bash
bpi auth login    # saves token to ~/.bpi/credentials
bpi auth token    # print the active token
${B3}

## Commands

| Command | Description |
|---|---|
| \`bpi routes list\` | List routes. Flags: \`--borough\`, \`--status degraded\`, \`--json\` |
| \`bpi routes get <id>\` | Get route with performance summary |
| \`bpi findings list\` | List findings. Flags: \`--route <id>\`, \`--limit\` |
| \`bpi findings get <id>\` | Get finding with reasoning trail |
| \`bpi brief create\` | Create brief. Flags: \`--route\`, \`--claim\` (repeatable), \`--segment\` |
| \`bpi brief get <id>\` | Get brief status and content |
| \`bpi brief publish <id>\` | Publish brief, get shareable URL |

All commands support \`--json\` for machine-readable output.

---
Prev: [Quickstart](#quickstart) · Next: [Routes API](#routes)
`;

// ── Routes ─────────────────────────────────────────────────────────────
function RoutesPage() {
  return (
    <article>
      <H1>Routes</H1>
      <P>Route objects represent a single MTA bus route with real-time performance stats, an AI diagnosis, and a segment-level breakdown.</P>

      <Endpoint method="GET" path="/v1/routes" desc="List all routes" />
      <Params rows={[
        { name: 'borough', type: 'string',  req: false, desc: <span><IC>manhattan</IC> · <IC>brooklyn</IC> · <IC>bronx</IC> · <IC>queens</IC> · <IC>si</IC></span> },
        { name: 'status',  type: 'string',  req: false, desc: <span><IC>degraded</IC> | <IC>normal</IC> | <IC>all</IC> (default)</span> },
        { name: 'limit',   type: 'integer', req: false, desc: 'Max results. Default 50, max 200.' },
        { name: 'cursor',  type: 'string',  req: false, desc: <span>Pagination cursor from previous response's <IC>next_cursor</IC></span> },
      ]} />

      <Endpoint method="GET" path="/v1/routes/{route_id}" desc="Get a single route" />
      <CodeBlock label="response shape">
{`{
  "id": "M15-SBS",
  "display_name": "M15 Select Bus Service",
  "borough": "manhattan",
  "type": "sbs",              // local | sbs | express
  "status": "degraded",
  "perf": {
    "avg_speed_mph": 6.2,
    "schedule_adherence_pct": 61,
    "week_over_week_delta": -0.18
  },
  "diagnosis": {
    "summary": "Likely signal timing at 34th St intersection…",
    "confidence": 0.87
  },
  "slow_segments": [ /* Segment[] ordered by severity */ ],
  "updated_at": "2026-05-17T04:00:00Z"
}`}
      </CodeBlock>

      <Endpoint method="GET" path="/v1/routes/{route_id}/segments" desc="Segment-level breakdown" />
      <P>Each stop-to-stop segment includes travel time distribution, speed over 8 weeks, severity score, and a flag if a bus lane is present.</P>
    </article>
  );
}

const MARKDOWN_ROUTES = `---
page: routes
prev: cli
next: findings
pages: overview | authentication | quickstart | cli | routes | findings | briefs | data-credits | changelog
index: https://api.bpi.studio/llms.txt
---

# Routes API

Route objects represent a single MTA bus route with performance stats, AI diagnosis, and segment breakdown.

## GET /v1/routes

Query params: \`borough\`, \`status\` (degraded|normal|all), \`limit\` (default 50, max 200), \`cursor\`.

## GET /v1/routes/{route_id}

${B3}json
{
  "id": "M15-SBS",
  "display_name": "M15 Select Bus Service",
  "borough": "manhattan",
  "type": "sbs",
  "status": "degraded",
  "perf": {
    "avg_speed_mph": 6.2,
    "schedule_adherence_pct": 61,
    "week_over_week_delta": -0.18
  },
  "diagnosis": { "summary": "...", "confidence": 0.87 },
  "slow_segments": [],
  "updated_at": "2026-05-17T04:00:00Z"
}
${B3}

## GET /v1/routes/{route_id}/segments

Stop-to-stop breakdown with travel time distribution, speed trends (8 weeks), severity score, bus lane flag.

---
Prev: [CLI Reference](#cli) · Next: [Findings API](#findings)
`;

// ── Findings ───────────────────────────────────────────────────────────
function FindingsPage() {
  return (
    <article>
      <H1>Findings</H1>
      <P>Findings are AI-surfaced patterns detected across all routes — unusual slowdowns, peer comparisons, multi-week trends. Each includes a reasoning trail you can inspect or cite directly in a brief. This is not a chatbot; findings are data, not conversation.</P>

      <Endpoint method="GET" path="/v1/findings" desc="List findings" />
      <Params rows={[
        { name: 'route_id', type: 'string',  req: false, desc: 'Filter to a single route' },
        { name: 'type',     type: 'string',  req: false, desc: <span><IC>anomaly</IC> | <IC>trend</IC> | <IC>peer_comparison</IC></span> },
        { name: 'limit',    type: 'integer', req: false, desc: 'Default 20, max 100' },
      ]} />

      <Endpoint method="GET" path="/v1/findings/{finding_id}" desc="Finding detail + reasoning trail" />
      <P>The <IC>reasoning_steps</IC> field is the AI's ordered logical chain — each step cites a data source and states a conclusion. This is the same trail shown in the Studio's Finding detail view.</P>
      <CodeBlock label="reasoning_steps shape">
{`"reasoning_steps": [
  {
    "step": 1,
    "observation": "Avg speed on M15-SBS dropped from 7.4 to 6.2 mph, week of May 12",
    "source": "MTA GTFS-RT",
    "ref": "segment M15-SBS-12, Mon–Fri 8–10am"
  },
  …
]`}
      </CodeBlock>
    </article>
  );
}

const MARKDOWN_FINDINGS = `---
page: findings
prev: routes
next: briefs
pages: overview | authentication | quickstart | cli | routes | findings | briefs | data-credits | changelog
index: https://api.bpi.studio/llms.txt
---

# Findings API

AI-surfaced patterns across all routes. Each finding includes a reasoning trail with cited data sources.

## GET /v1/findings

Query params: \`route_id\`, \`type\` (anomaly|trend|peer_comparison), \`limit\` (default 20, max 100).

## GET /v1/findings/{finding_id}

${B3}json
{
  "id": "fnd_...",
  "type": "anomaly",
  "route_id": "M15-SBS",
  "headline": "18% speed drop on 96th–42nd corridor",
  "reasoning_steps": [
    {
      "step": 1,
      "observation": "Avg speed dropped from 7.4 to 6.2 mph, week of May 12",
      "source": "MTA GTFS-RT",
      "ref": "segment M15-SBS-12, Mon–Fri 8–10am"
    }
  ]
}
${B3}

---
Prev: [Routes API](#routes) · Next: [Briefs API](#briefs)
`;

// ── Briefs ─────────────────────────────────────────────────────────────
function BriefsPage() {
  return (
    <article>
      <H1>Briefs</H1>
      <P>Briefs are the primary output — cited policy documents assembled from annotated claims and route evidence. Generation is async: submit claims, poll until ready, retrieve the Markdown narrative.</P>

      <Endpoint method="POST" path="/v1/briefs" desc="Create a brief" />
      <Params rows={[
        { name: 'route_id', type: 'string',   req: true,  desc: <span>MTA route ID — e.g. <IC>M15-SBS</IC></span> },
        { name: 'claims',   type: 'Claim[]',  req: true,  desc: <span>One or more claims. Each: <IC>{'{ text, segment_id? }'}</IC></span> },
        { name: 'title',    type: 'string',   req: false, desc: 'Override the auto-generated title' },
        { name: 'audience', type: 'string',   req: false, desc: <span><IC>internal</IC> (default) | <IC>public</IC> — affects tone and citation density</span> },
      ]} />

      <Callout>
        <strong>Async flow —</strong> <IC>POST /v1/briefs</IC> returns immediately with a <IC>brief_id</IC> and <IC>status: "queued"</IC>. Generation typically takes 15–45 seconds. Poll <IC>GET /v1/briefs/{'{id}'}</IC> until <IC>status</IC> is <IC>"ready"</IC>.
      </Callout>

      <Endpoint method="GET" path="/v1/briefs/{brief_id}" desc="Get brief" />
      <CodeBlock label="response shape (status: ready)">
{`{
  "id": "brf_01hwx…",
  "status": "ready",        // queued | composing | ready | failed
  "route_id": "M15-SBS",
  "title": "M15 SBS Speed Degradation — May 2026",
  "narrative": "…",         // full Markdown document
  "claims": [
    {
      "id": "clm_…",
      "text": "…",
      "citations": [{ "source": "GTFS-RT", "ref": "…" }],
      "confidence": 0.91
    }
  ],
  "version": 1,
  "created_at": "2026-05-17T14:32:11Z"
}`}
      </CodeBlock>

      <Endpoint method="GET" path="/v1/briefs/{brief_id}/versions" desc="Version history" />
      <P>Returns versions newest-first. Each entry includes a <IC>diff</IC> with changed claims.</P>

      <Endpoint method="POST" path="/v1/briefs/{brief_id}/publish" desc="Publish a brief" />
      <P>Marks the current version as published and returns a <IC>share_url</IC>. Publishing is permanent per version; you can still create new versions afterward.</P>
    </article>
  );
}

const MARKDOWN_BRIEFS = `---
page: briefs
prev: findings
next: data-credits
pages: overview | authentication | quickstart | cli | routes | findings | briefs | data-credits | changelog
index: https://api.bpi.studio/llms.txt
---

# Briefs API

Cited policy documents assembled from annotated claims. Generation is async.

## POST /v1/briefs

Body fields:
- \`route_id\` (required) — MTA route ID
- \`claims\` (required) — array of \`{ text, segment_id? }\`
- \`title\` (optional) — override auto-generated title
- \`audience\` (optional) — \`internal\` (default) | \`public\`

Returns immediately with \`{ "id": "brf_...", "status": "queued" }\`.

## GET /v1/briefs/{brief_id}

${B3}json
{
  "id": "brf_01hwx…",
  "status": "ready",
  "route_id": "M15-SBS",
  "title": "M15 SBS Speed Degradation — May 2026",
  "narrative": "…",
  "claims": [{ "id": "clm_…", "text": "…", "citations": [], "confidence": 0.91 }],
  "version": 1,
  "created_at": "2026-05-17T14:32:11Z"
}
${B3}

## GET /v1/briefs/{brief_id}/versions

Version history, newest-first. Each entry includes a \`diff\` of changed claims.

## POST /v1/briefs/{brief_id}/publish

Returns \`{ "share_url": "…" }\`. Permanent per version.

---
Prev: [Findings API](#findings) · Next: [Data & Credits](#data-credits)
`;

// ── Data & Credits ─────────────────────────────────────────────────────
function CreditsPage() {
  const Row = ({ name, meta, desc }) => (
    <tr>
      <td style={{ padding: '11px 0', borderBottom: '1px solid rgba(22,20,15,.09)', paddingRight: 28, verticalAlign: 'top', width: 200 }}>
        <div style={{ fontWeight: 600, color: '#16140f', fontSize: 14 }}>{name}</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(22,20,15,.42)', marginTop: 2 }}>{meta}</div>
      </td>
      <td style={{ padding: '11px 0', borderBottom: '1px solid rgba(22,20,15,.09)', verticalAlign: 'top', color: 'rgba(22,20,15,.62)', fontSize: 13.5, lineHeight: 1.55 }}>{desc}</td>
    </tr>
  );
  return (
    <article>
      <H1>Data &amp; Credits</H1>
      <Callout warn><strong>TODO —</strong> Full attribution table and license details are being finalized. The sources below are confirmed; exact terms are under review.</Callout>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <tbody>
          <Row name="MTA GTFS-RT"     meta="Real-time · 30s cadence" desc="Vehicle positions and trip updates. Primary source for segment-level speed and schedule adherence calculations. Provided under the MTA Developer Data license." />
          <Row name="MTA BusTime API" meta="Historical"              desc="Stop-level arrival and departure times. Used for historical trend analysis and week-over-week comparisons." />
          <Row name="OpenStreetMap"   meta="Geodata · ODbL"          desc="Street network geometry and stop locations. © OpenStreetMap contributors, licensed under the Open Database License." />
          <Row name="NYC DOT"         meta="Reference · Open data"   desc="Bus lane locations and signal priority corridors. Used as context for AI diagnosis and brief generation." />
        </tbody>
      </table>
    </article>
  );
}

const MARKDOWN_CREDITS = `---
page: data-credits
prev: briefs
next: changelog
pages: overview | authentication | quickstart | cli | routes | findings | briefs | data-credits | changelog
index: https://api.bpi.studio/llms.txt
---

# Data & Credits

> TODO: Full attribution table and license details are being finalized.

| Source | Type | Notes |
|---|---|---|
| MTA GTFS-RT | Real-time, 30s cadence | Vehicle positions and trip updates. MTA Developer Data license. |
| MTA BusTime API | Historical | Stop-level arrival/departure times. |
| OpenStreetMap | Geodata | Street network, stop locations. © contributors, ODbL. |
| NYC DOT | Reference | Bus lane locations and signal priority corridors. |

---
Prev: [Briefs API](#briefs) · Next: [Changelog](#changelog)
`;

// ── Changelog ──────────────────────────────────────────────────────────
function ChangelogPage() {
  const Tag = ({ t, children }) => {
    const colors = { new: ['oklch(0.94 0.04 155)','oklch(0.42 0.12 155)'], fix: ['oklch(0.95 0.05 70)','oklch(0.50 0.13 65)'], break: ['oklch(0.94 0.05 28)','oklch(0.48 0.15 28)'] };
    const [bg, fg] = colors[t] || ['#ece7db','rgba(22,20,15,.5)'];
    return <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', padding: '1.5px 6px', borderRadius: 2, background: bg, color: fg, textTransform: 'uppercase', flexShrink: 0 }}>{children}</span>;
  };
  const items = [
    ['new', <span><IC>GET /v1/routes</IC> and <IC>GET /v1/routes/{'{id}'}</IC></span>],
    ['new', <span><IC>GET /v1/routes/{'{id}'}/segments</IC> — segment-level breakdown</span>],
    ['new', <span><IC>GET /v1/findings</IC> + <IC>/v1/findings/{'{id}'}</IC> with reasoning trail</span>],
    ['new', <span><IC>POST /v1/briefs</IC> — async brief generation from claims</span>],
    ['new', <span><IC>GET /v1/briefs/{'{id}'}</IC> + version history + publish flow</span>],
    ['new', <span>CLI technical preview — <IC>npx @bpi/cli</IC> · npm · pip · Homebrew</span>],
  ];
  return (
    <article>
      <H1>Changelog</H1>
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.015em' }}>v0.1.0</span>
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: 'rgba(22,20,15,.45)' }}>2026-05-17</span>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 3, background: '#ece7db', color: 'rgba(22,20,15,.52)' }}>Initial release</span>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map(([t, desc], i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(22,20,15,.07)', fontSize: 13.5, color: 'rgba(22,20,15,.72)' }}>
              <Tag t={t}>{t}</Tag>{desc}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

const MARKDOWN_CHANGELOG = `---
page: changelog
prev: data-credits
next: null
pages: overview | authentication | quickstart | cli | routes | findings | briefs | data-credits | changelog
index: https://api.bpi.studio/llms.txt
---

# Changelog

## v0.1.0 — 2026-05-17 (Initial release)

- **new** \`GET /v1/routes\` and \`GET /v1/routes/{id}\`
- **new** \`GET /v1/routes/{id}/segments\` — segment-level breakdown
- **new** \`GET /v1/findings\` + \`/v1/findings/{id}\` with reasoning trail
- **new** \`POST /v1/briefs\` — async brief generation from claims
- **new** \`GET /v1/briefs/{id}\` + version history + publish flow
- **new** CLI technical preview — \`npx @bpi/cli\` · npm · pip · Homebrew

---
Prev: [Data & Credits](#data-credits)
Index: https://api.bpi.studio/llms.txt
`;

// ══ Registry ══════════════════════════════════════════════════════════

const PAGE_ORDER = ['overview','authentication','quickstart','cli','routes','findings','briefs','data-credits','changelog'];

const PAGE_SECTIONS = {
  'overview':       'Introduction',
  'authentication': 'Introduction',
  'quickstart':     'Get started',
  'cli':            'Get started',
  'routes':         'API Reference',
  'findings':       'API Reference',
  'briefs':         'API Reference',
  'data-credits':   'Resources',
  'changelog':      'Resources',
};

const PAGE_TITLES = {
  'overview':       'Overview',
  'authentication': 'Authentication',
  'quickstart':     'Quickstart',
  'cli':            'CLI Reference',
  'routes':         'Routes',
  'findings':       'Findings',
  'briefs':         'Briefs',
  'data-credits':   'Data & Credits',
  'changelog':      'Changelog',
};

const PAGES = {
  'overview':       OverviewPage,
  'authentication': AuthPage,
  'quickstart':     QuickstartPage,
  'cli':            CliPage,
  'routes':         RoutesPage,
  'findings':       FindingsPage,
  'briefs':         BriefsPage,
  'data-credits':   CreditsPage,
  'changelog':      ChangelogPage,
};

const MARKDOWN = {
  'overview':       MARKDOWN_OVERVIEW,
  'authentication': MARKDOWN_AUTH,
  'quickstart':     MARKDOWN_QS,
  'cli':            MARKDOWN_CLI,
  'routes':         MARKDOWN_ROUTES,
  'findings':       MARKDOWN_FINDINGS,
  'briefs':         MARKDOWN_BRIEFS,
  'data-credits':   MARKDOWN_CREDITS,
  'changelog':      MARKDOWN_CHANGELOG,
};

Object.assign(window, { PAGE_ORDER, PAGE_TITLES, PAGE_SECTIONS, PAGES, MARKDOWN });
