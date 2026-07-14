# rc19 Codex review workspace

All files here are non-authorizing review material. They are not approval receipts and do not
authorize `study run`, publication, D1/R2 writes, or promotion of MTA Wiki `v1-rc19`.

The top-level batch files bind the superseded discovery set
`candidate-set-v2:1810cf792be7e2346b335fb5`. Reviewing that set exposed a v2 consumer defect:
12 exact registry/Wiki representations were emitted as 24 candidates and 12 false conflicts.
Those files are retained as an audit trail only and must not be converted into a receipt.

The current review universe is under `corrected/` and binds
`candidate-set-v2:24080902f508b55a0033df32` (489 candidates, candidate artifact SHA-256
`42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`). The corrected
merger exact-deduplicates 12 pairs while retaining both provenances and leaves zero conflict
groups. The [corrected review summary](./corrected/README.md) records the final 489-row
reconciliation and operator boundary. Any later candidate, spine, Wiki-release, or input-hash
change requires another set and another review.
