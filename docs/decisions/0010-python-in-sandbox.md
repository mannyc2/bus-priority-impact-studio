# 0010 - Python inside the codemode sandbox

Status: Superseded on 2026-05-31 by
`0013-bun-typescript-codemode-sandbox.md`. This ADR is retained as historical
context for why the first codemode slice used Python; new codemode work uses
Bun/TypeScript with analytics-package access.

Date: 2026-05-30

## Status

Accepted. Python 3.12 is permitted **only** inside the Docker sandbox used by `tools/pipeline-v2` for codemode-style findings-agent runs. Python remains prohibited everywhere else in the repo (apps, workers, `packages/`, other CI jobs).

## Context

The findings-propose agent needs to write code against ~76 GB of corpus artifacts (`data/artifacts/`, `data/raw/`, `data/local/`). Sliced into the prompt the corpus exceeds any practical context window. The chosen architecture (slice plan, 2026-05-30) is **codemode**: the agent writes a script that runs inside a sandboxed container with the corpus bind-mounted read-only, and only the script's printed output returns to the model.

Comparable systems (`ginlix-ai/langalpha`, reviewed before this ADR) implement the same pattern with a Docker sandbox and a Python helper library. Python earned that role for one reason: **pandas + duckdb are the strongest tools for the tabular slicing the agent has to do** (route × month × window features, joins against permit/311 NDJSON, group-by ranking).

CLAUDE.md prohibits adding Python without an ADR or a documented entry in `knowledge/wiki/engineering/package_structure.md`. This ADR is that gate.

## Decision

- A new top-level package `tools/agent-corpus-lib/` (Python) provides typed read-only accessors over the corpus. It is bind-mounted into the sandbox at `/work/agent-corpus-lib` and made importable as `bp_corpus`.
- A new `tools/sandbox/Dockerfile` (added in a later step) defines the sandbox image: Python 3.12, pandas, duckdb, ripgrep, jq, plus the helper lib. No other runtimes.
- Python **never** executes outside the sandbox image:
  - Not in `apps/web` (Workers TS).
  - Not in `packages/` (TS libraries).
  - Not in any non-sandbox CI job.
  - Not as a build step for the public site.
- Local dev for the helper lib uses `uv` (`uv venv`, `uv pip install -e ".[dev]"`, `uv run pytest`). No tox, no poetry, no Conda.

## Alternatives considered

- **TypeScript helper lib in the sandbox** (with `bun` instead of Python). Stays in-repo language. No pandas equivalent, so we'd hand-roll group-by/join/rank over arrays of rows, or pull in `duckdb-node`. Doable, but each tabular operation costs more code for us to maintain than the pandas one-liner the agent would write inside `python()`. Rejected: the maintenance cost falls on us, the ergonomic loss falls on every detector the agent writes.
- **No codemode, keep digest-only**. Agent only sees the prompt-sliced `RouteContextDigest`. Caps detector capability at what fits in a prompt; defeats the purpose of having 76 GB of corpus. Rejected.
- **Hybrid: Python + TypeScript both in the sandbox**. Maximum capability, maximum maintenance. Rejected unless a concrete TS-only need shows up.

## Consequences

### Positive

- Agent writes idiomatic pandas/duckdb for tabular work — short, readable, fast.
- Helper lib is small (estimated <500 LOC for the first three modules) because pandas does the heavy lifting.
- TS-only invariant for the runtime app is preserved by drawing the boundary at the Docker image, not at the language.
- Aligns with the reviewed reference implementation (`ginlix-ai/langalpha`).

### Negative

- New language surface in the repo. Anyone editing `tools/agent-corpus-lib/` needs Python tooling (`uv`).
- The sandbox image is now ~400 MB (alpine + python + pandas + duckdb + tooling). First build pulls dependencies; subsequent builds are cached.
- A future contributor might be tempted to "just add a little Python" elsewhere. The boundary is enforced by convention only — review must catch it. The rule: Python is permitted in `tools/agent-corpus-lib/` and `tools/sandbox/`, nowhere else.

### Knowledge wiki note

`knowledge/wiki/engineering/package_structure.md` will be updated when this slice lands to document the new package and the boundary above.
