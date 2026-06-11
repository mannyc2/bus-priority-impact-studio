# bp-sandbox

Read-only Bun/TypeScript + bash Docker sandbox for Bus Priority Studio
findings-agent codemode runs.

The agent's TypeScript is piped over stdin, written to `/tmp/codemode/main.ts`,
and executed with Bun. The runtime creates temporary workspace symlinks so
agent code can import `@bp/analytics`, `@bp/analytics/registry`, and
`@bp/domain` while keeping the repo bind-mounted read-only. Bash remains
available for deterministic file slicing with `rg`, `jq`, and core shell tools.

## Build

```bash
bun run sandbox:build      # builds bp-sandbox:<short-sha> and bp-sandbox:latest
# or directly:
./tools/sandbox/build.sh
```

The build script tags the image with both `:latest` and the current 12-char
git SHA so downstream tools can pin to a known revision.

## When to rebuild

| Change | Rebuild needed? |
|---|---|
| `Dockerfile` | yes |
| Corpus artifacts under `data/` | no - bind-mounted read-only |
| `packages/analytics/**` or `packages/domain/**` | no - bind-mounted read-only |
| Codemode skill text | no - inlined by the host harness |

## What lives in the image

- Bun 1.3.13 on Debian.
- `ripgrep` and `jq`.
- The base image's non-root UID 1000 user, with `/home/agent` mounted as tmpfs
  at runtime.

## What does NOT live in the image

- The corpus (`data/`) - bind-mounted read-only at runtime.
- `packages/analytics` and `packages/domain` - bind-mounted read-only at runtime.
- Python, pandas, duckdb, or pyarrow.
- Network access - disabled at runtime with `--network=none`.

## Runtime invocation

Driven by `tools/pipeline-v2/src/lib/sandbox.ts`. The runtime flags applied to
every `docker run`:

- `--network=none`
- `--read-only`
- `--cap-drop=ALL --security-opt=no-new-privileges`
- `--memory=<N>m --memory-swap=<N>m --cpus=1 --pids-limit=64`
- `--tmpfs /tmp:rw,size=64m --tmpfs /home/agent:rw,size=8m`
- `--user 1000:1000`
- Per-call wall-time enforced by the host (`SIGKILL` from `sandbox.ts`)

The sandbox mounts `/work/data/artifacts`, `/work/data/raw`, `/work/data/local`,
and `/work/knowledge` read-only. It also mounts the analytics/domain packages
and root `node_modules` read-only under `/work/repo` so TypeScript evidence code
uses the same deterministic analytics kernel as the pipeline.
