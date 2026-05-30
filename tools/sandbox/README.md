# bp-sandbox

Read-only Python + bash Docker sandbox for the Bus Priority Studio
findings-agent codemode runs (see `docs/decisions/0010-python-in-sandbox.md`).

The agent's code is piped over stdin to `python3 -` or `bash -s` inside this
container. The corpus and `bp_corpus` helper library are bind-mounted at
runtime; nothing project-specific is baked into the image.

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
| `Dockerfile`                            | yes |
| `requirements.in` or `requirements.txt` | yes |
| `tools/agent-corpus-lib/**` (the lib)   | **no** — bind-mounted at runtime |
| Corpus artifacts under `data/`          | **no** — bind-mounted at runtime |
| Anything else                           | no |

## Updating Python dependencies

```bash
# 1. Edit requirements.in (loose pins, the source of truth).
# 2. Regenerate the hash-pinned lockfile:
cd tools/sandbox
uv pip compile requirements.in --generate-hashes --python-version 3.12 -o requirements.txt
# 3. Rebuild and run the pipeline-v2 sandbox tests:
bun run sandbox:build
bun test tools/pipeline-v2/test/lib/sandbox.test.ts
```

## Updating the base image

```bash
docker pull python:3.12-slim
docker inspect python:3.12-slim --format '{{index .RepoDigests 0}}'
# Paste the printed digest into the FROM line of Dockerfile.
```

## What lives in the image

- Python 3.12 (slim debian:bookworm base)
- `pandas`, `duckdb`, `pyarrow` (hash-pinned via `requirements.txt`)
- `ripgrep`, `jq` (apt)
- A non-root `agent` user (UID 1000)
- `PYTHONPATH=/work/agent-corpus-lib` so `import bp_corpus` resolves to the
  bind-mounted library

## What does NOT live in the image

- The corpus (`data/`) — bind-mounted read-only at runtime
- The `bp_corpus` Python lib (`tools/agent-corpus-lib/`) — bind-mounted r/o at runtime
- The pipeline TypeScript code — never executed inside the sandbox
- Network access — disabled at run time with `--network=none`

## Runtime invocation

Driven by `tools/pipeline-v2/src/lib/sandbox.ts`. The runtime flags applied to
every `docker run` (verified by `test/lib/sandbox.test.ts`):

- `--network=none`
- `--read-only`
- `--cap-drop=ALL --security-opt=no-new-privileges`
- `--memory=<N>m --memory-swap=<N>m --cpus=1 --pids-limit=64`
- `--tmpfs /tmp:rw,size=64m --tmpfs /home/agent:rw,size=8m`
- `--user 1000:1000`
- Per-call wall-time enforced by the host (`SIGKILL` from `sandbox.ts`)

## Image size

~470 MB uncompressed. Dominated by pandas + pyarrow wheels. Multi-stage build
would not help — the wheels are pre-built and there are no compile-time deps
to discard.
