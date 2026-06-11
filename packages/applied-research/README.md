# packages/applied-research

Corpus-backed applied research workflows over the pure analytics kernel.

## Responsibilities

- Define study manifests, windows, grain policy, provenance, and research scoring primitives.
- Resolve local corpus inputs into detector-native research artifacts through explicit ports.
- Build detector run artifacts, score vectors, review-packet bundles, evaluation packets, causal
  panels, and forecasting backtests.
- Keep `tools/pipeline-v2` as a thin orchestration consumer.

## Local DB Adapter Ownership

`@bp/applied-research/local-db` is the corpus-to-panel adapter layer.

Use it for bounded SQLite/SpatiaLite reads that turn local source tables into typed research inputs:

- route/month, segment/month, segment/daypart, treatment-event, source-gap, reliability, pulse, and
  decoupling panel rows;
- data-product check evaluation over the local corpus;
- high-value raw SQL result parsers where aggregate/spatial reads cannot be expressed cleanly as
  Drizzle table rows;
- route/month/source universe probes used to explain what was searched and what was missing.

It should not redefine storage contracts, migrations, public D1 query contracts, detector math, or
CLI side effects. If a helper is "read/write this table safely," it belongs in `@bp/db/local`; if it
is "assemble a research panel/question from the corpus," it belongs here.

## Panel Spec Ownership

`@bp/applied-research/feature-resolvers` owns `PanelSpec` and `PanelManifest` contracts. Built-in
model artifacts are registered through `builtInPanelModelSpecsV1()`, and each spec must declare its
grain, entity keys, time key, measures, coverage fields, required data products, eligibility rules,
and negative meaning. Local DB panel resolvers should return typed rows plus a `PanelManifest`;
model builders can then stay fixture-testable and consume rows without opening SQLite.

## Data-Product Completeness Ownership

The data-product spine lives in `@bp/applied-research/data-products`.

`DATA_PRODUCT_MANIFEST` is the canonical registry for expected products, route/month universes,
upstream dependencies, lifecycle state, freshness policy, producer command, and downstream
consumers. Completeness checks must preserve explicit gap classes such as
`available_not_fetched`, `source_absent`, `upstream_blocked`, `derived_not_built`, and downstream
blocked states. Coverage commands, detector readiness, materialization coverage, panel specs, and
analysis dependency closure should refer back to manifest product IDs rather than inventing
parallel vocabularies.

## Rules

- Do not fetch external sources directly.
- Do not publish D1/R2 releases.
- Do not render React or import app code.
- Do not import from `tools/*` or `knowledge/*`.
- Keep pure study logic fixture-testable without opening SQLite.
- Put local DB adapters behind the `@bp/applied-research/local-db` subpath.
