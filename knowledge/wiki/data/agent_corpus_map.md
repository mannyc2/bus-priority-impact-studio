---
title: Agent corpus map (codemode sandbox)
type: data
status: active
last_updated: 2026-05-31
owner: codex
tags: [agent, sandbox, codemode, findings, typescript, analytics]
---

# Agent corpus map

Codemode now uses the Bun/TypeScript sandbox described in
`docs/decisions/0013-bun-typescript-codemode-sandbox.md`. The active tool pair is
`ts_exec(code)` plus `bash_exec(code)`. Python and `bp_corpus` are historical
ADR 0010 artifacts, not the current agent execution path.

The prompt source of truth is the skill at:

```text
tools/agent-codemode/skills/corpus-navigation/SKILL.md
```

## Sandbox layout

| Path | Mount | Purpose |
|---|---|---|
| `/work/data/artifacts/` | ro | Pipeline outputs: findings, route slices, briefs |
| `/work/data/raw/` | ro | Source captures: 311, permits, GTFS-RT, collisions, parking |
| `/work/data/local/` | ro | SQLite analytics DB |
| `/work/knowledge/` | ro | Wiki and raw metadata |
| `/work/repo/packages/analytics/` | ro | Deterministic analytics kernel and registry |
| `/work/repo/packages/domain/` | ro | Domain schemas and evidence contracts |
| `/tmp` | rw | Per-call scratch only |

Network is disabled, the root filesystem is read-only, and stdout/stderr are
capped by the host harness.

## TypeScript imports

`ts_exec` creates temporary workspace symlinks so sandbox code can import package
entry points:

```ts
import { listAnalyticsDetectors } from "@bp/analytics/registry";
import { jaccardOverlap, summarizeScoreVector } from "@bp/analytics/calibration";
```

## Evidence rule

`code_execution` evidence refs now accept:

- `language: "typescript"` for Bun/analytics computations.
- `language: "bash"` for small deterministic shell slices.

Validators re-run cited code in a clean sandbox and compare `sha256(stdout)`.
Cited code must not depend on `/work/.ralph`, clocks, randomness, network, or
prior temp files.
