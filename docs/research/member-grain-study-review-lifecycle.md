# Member-grain study review lifecycle

## Purpose

The study pipeline has two independent immutable boundaries:

1. the **candidate universe** says which exact source facts may be reviewed;
2. the **review cut** says which outcome, spine, scope, engine, and policy
   snapshot was used to make estimator-admission decisions.

Keeping them separate lets a later complete outcome month create a new review
cut without rewriting producer history, while a producer member-extent change
creates a new candidate universe even when stable study-event IDs do not move.

## Versioned artifacts

| Artifact | Identity or role | Authorizing? |
|---|---|---|
| `bp.studio.mta_wiki_member_extents.v1` | Strict import of one release-addressed producer member-extent manifest and its full occurrence × route × treatment-member denominator; records both the containing release and the companion's source occurrence release | No |
| `bp.studio.study_event_candidates.v4` | `candidate-set-v4:*`; binds registry rows, exact available route universe, producer release/occurrence/relationship lineage, full member rows, and `memberExtentLineage` manifest/projection receipts | No; `awaiting_review_cut` |
| `bp.studio.study_physical_scope_bindings.v2` | Exact candidate + occurrence + analysis route + producer route record + treatment member + extent ID geometry/spine binding | No; supplies one review input |
| `bp.studio.study_events.v5` | `study-review-cut-v1:*`; binds candidate universe plus analysis month, outcome snapshot, full spine manifest, scope binding receipt, engine, and review policy | Only with a complete matching v5 receipt |
| `bp.studio.study_event_approvals.v5` | Exactly one evidence-conservative estimator-admission decision per candidate, bound to both IDs | Estimator admission only |

The producer's forecast-realized overlay is deliberately absent from every
schema and digest above. It cannot create candidates, satisfy a gate, or
authorize a receipt.

## Monthly lifecycle

1. Import an explicitly named producer release and its addressed member-extent
   manifest by exact SHA-256. Verify the manifest and every listed companion
   file from the immutable release copy. Record the companion's source
   occurrence release separately; require its occurrence input pin to match
   the containing release's exact occurrence bytes. Do not follow a mutable
   `LATEST` pointer.
2. Build the complete candidate-set v4 artifact. Identical inputs produce
   identical JSON bytes and IDs. Any producer release, occurrence payload,
   relationship proof, member manifest/projection, member row, registry row,
   or route-universe change changes the universe.
3. Build or migrate physical-scope bindings. A legacy v1 binding may be carried
   only at the same analysis month and only when it resolves exactly one
   bounded member whose producer component IDs equal the previously reviewed
   physical-scope IDs. Route-only or ambiguous migration fails.
4. Snapshot review inputs. A new outcome month, outcome logical hash, spine
   manifest/route artifact, member-scope receipt, engine, or policy creates a
   different review-cut ID while leaving older cuts immutable.
5. Prepare the complete non-authorizing worksheet and compare every candidate
   with the prior cut. Transfer a decision only after all admission-relevant
   facts are exactly unchanged; otherwise review it afresh.
6. Create one v5 receipt with exactly one decision per candidate. Missing,
   duplicate, extra, stale-set, or stale-cut decisions are rejected.

## Scope semantics

- `route_wide`: admits the scope gate without manufacturing geometry.
- exact `mta_ace_routes` registry evidence remains independently route-wide,
  including for registry-only candidates; an unresolved producer companion
  row neither upgrades nor revokes that separate source fact.
- `bounded_segment`: satisfies bounded-scope identity only. It also requires
  one exact v2 geometry-to-spine binding per treatment member.
- `unresolved`: fails the member-extent gate with the producer missing roles.
- `stop_set`, `mixed`, or heterogeneous member scopes: fail closed until a
  separately versioned estimator contract supports them.

Onset, first/independent phase, pattern/spine readiness, calendar, overlap,
controls, estimator diagnostics, claim tier, anchor, and publication remain
independent. A positive member extent changes none of those gates.

## Compatibility

The v3 candidate-set and v4 May review artifacts remain valid historical
documents and continue to strict-decode byte-for-byte. Their receipts cannot
authorize a candidate-set v4/study-events v5 cut. Existing commands keep their
legacy behavior unless `--member-extent-import` is supplied.

The member-grain command sequence is:

```sh
bun --filter @bp/pipeline-v2 cli -- studio import-mta-wiki-member-extents \
  --occurrence-import <exact-occurrence-import.json> \
  --mta-wiki-root <producer-root> \
  --member-extent-manifest <repo-relative-manifest.json> \
  --member-extent-manifest-sha256 <sha256> \
  --output <isolated-member-import.json>

bun --filter @bp/pipeline-v2 cli -- study merge-events \
  --db <read-only-or-scratch.sqlite> \
  --wiki-import <exact-occurrence-import.json> \
  --member-extent-import <isolated-member-import.json> \
  --output <candidate-set-v4.json>

bun --filter @bp/pipeline-v2 cli -- study migrate-member-scope-bindings \
  --prior <immutable-v1-scope-bindings.json> \
  --candidate-set <candidate-set-v4.json> \
  --output <member-scope-bindings-v2.json>

# Snapshot review inputs with the v2 scope file, then rebuild merge-events
# with --review-inputs and, only after complete review, a fresh v5 --approval.
```
