# packages/applied-research

Corpus-backed applied research workflows over the pure analytics kernel.

## Responsibilities

- Define study manifests, windows, grain policy, provenance, and research scoring primitives.
- Resolve local corpus inputs into detector-native research artifacts through explicit ports.
- Build detector run artifacts, score vectors, review-packet bundles, evaluation packets, causal
  panels, and forecasting backtests.
- Keep `tools/pipeline-v2` as a thin orchestration consumer.

## Rules

- Do not fetch external sources directly.
- Do not publish D1/R2 releases.
- Do not render React or import app code.
- Do not import from `tools/*` or `knowledge/*`.
- Keep pure study logic fixture-testable without opening SQLite.
- Put local DB adapters behind the `@bp/applied-research/local-db` subpath.

