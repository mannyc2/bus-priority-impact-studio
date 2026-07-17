Review only the 32 bus_lane candidates in
docs/research/reviews/rc19/deep-review-input.json.

Read AGENTS.md, CLAUDE.md, docs/research/reviews/rc19/00-review-rubric.md,
the candidate records, the historical receipt named by the input, and Plan
074. The MTA Wiki root /mnt/models/dev/mta-wiki-corpus-completion is strictly
read-only. Historical decisions are context, never authorization.

Most historical lane candidates came from a proximity matcher. Do not treat
street/stop proximity as exact route-onset evidence. Recompute the current
calendar conclusion from the packet rather than copying old rationales; the
old receipt contains known stale window statements. Pay special attention to
the new B67 month-precision MTA Wiki occurrence and its relationship to the
2025-10-02 proximity-derived candidate. Return exactly 32 unique
non-authorizing decisions. Use batchId deep-bus-lane. Do not edit files,
create a receipt, run studies, or weaken a gate.
