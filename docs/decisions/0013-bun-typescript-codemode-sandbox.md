# 0013 - Bun/TypeScript codemode sandbox with analytics access

Status: Retired 2026-07-04 — agent-corpus research experiments ended; tooling deleted (plan 037).
Date: 2026-05-31.

## Context

ADR 0010 allowed a Python-only Docker sandbox because the findings agent needed
tabular corpus slicing before the analytics package had a stable detector
kernel. That premise no longer holds. The 2026-05-30 analytics refactor made
`packages/analytics` the deterministic source of truth for detector contracts,
registry metadata, scoring helpers, calibration summaries, and review gates.

Keeping Python as the agent's primary execution environment now creates the
wrong incentives: agents would reimplement analytics logic beside the kernel,
cite pandas snippets as evidence, and drift away from the TypeScript-only MVP
architecture. The better boundary is: the model may author a frozen
TypeScript procedure, but the harness executes it in a locked-down sandbox and
validation recomputes the cited stdout.

## Decision

The codemode sandbox is Bun/TypeScript-first:

- The active sandbox tools are `ts_exec` and `bash_exec`.
- `code_execution` evidence refs accept `language: "typescript"` and
  `language: "bash"` only.
- The Docker image contains Bun, `ripgrep`, and `jq`; it does not install
  Python, pandas, duckdb, or pyarrow.
- The runtime bind-mounts `packages/analytics`, `packages/domain`, root
  `node_modules`, `data/artifacts`, `data/raw`, `data/local`, and `knowledge`
  read-only.
- `ts_exec` runs code from `/tmp/codemode/main.ts` and creates temporary
  workspace symlinks so imports such as `@bp/analytics/registry` resolve.
- Ralph/codemode workspaces may mount `/work/.ralph` read-write, but cited
  `code_execution` validation never mounts that workspace.

This keeps LLM work outside the analytics kernel. `packages/analytics` still
must not import prompt, model, sandbox, filesystem, network, Worker, or agent
loop code. The agent can inspect the registry and compose analytics helpers
from the sandbox; the detector of record remains deterministic TypeScript run
by the harness.

## Pioneer Model Default

Deep codemode runs for this refactor use `--provider pioneer --model gpt-5.5`.
Pioneer is treated as an OpenAI-compatible provider configured by:

- `PIONEER_API_KEY`
- optional `PIONEER_BASE_URL` override; defaults to `https://api.pioneer.ai/v1`

The harness still supports OpenRouter and DeepSeek for explicit runs, but the
default findings codemode path is Pioneer/GPT-5.5.

## Consequences

Positive:

- Agent-authored computations run in the same language and package graph as the
  deterministic analytics kernel.
- Detector proposals can import registry metadata, claim tiers, calibration
  helpers, and evidence schemas directly instead of translating them through a
  Python helper library.
- The sandbox image is smaller and aligns with the Bun-first project rule.
- Validation is stricter: stale Python `code_execution` refs fail schema
  validation instead of silently creating a second language surface.

Tradeoffs:

- Agents lose pandas ergonomics for ad hoc table work. For codemode evidence,
  that is acceptable because analytics helpers and generated artifacts now
  carry the reusable tabular logic.
- Existing Python examples and old codemode artifacts are historical only.
  Future evidence refs must be TypeScript or deterministic bash.
- Pioneer cannot run without explicit `PIONEER_API_KEY`; dry runs remain
  available without credentials.

## Migration Tasks

- Keep ADR 0010 as historical context, but mark it superseded.
- Replace prompt and skill references to `python_exec`/`bp_corpus` with
  `ts_exec`/analytics imports.
- Update sandbox tests to verify Bun execution and analytics registry imports.
- Update code-execution validation tests to re-run TypeScript citations.
- Keep the analytics package boundary testable: no agent, sandbox, model, or
  filesystem imports may enter `packages/analytics`.
