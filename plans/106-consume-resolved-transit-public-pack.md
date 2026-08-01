# Plan 106: Cut the site over to the reviewed resolved-transit public pack

> **Executor instructions**: Read this plan completely before changing code.
> Follow the steps in order, run every listed verification, and stop on every
> STOP condition. Do not substitute Plan 052 campaign or intermediate operator
> files for the final public pack; only the five pinned build-time conformance
> files are allowed. When the work is complete, update this plan's row in
> `plans/README.md` and append the durable implementation facts to
> `knowledge/log.md`.
>
> **Verified producer handoff (2026-08-01)**: the external dependency is
> satisfied. `mta-wiki` Plans 053-056 are complete, the Plan 056 Tracker diff
> is independently accepted, and the final non-prerelease GitHub Release is
> `resolved-pack-v1-production`. This plan pins its exact tag, archive,
> manifest, public-resource, and conformance-ledger hashes below.
>
> **Activation dependency**: Plan 098 in this repository must be `DONE` before
> any new logical artifact key can be activated. External publication and the
> producer `LATEST` promotion are complete. The Plan 057 Tracker pin and
> deployment are approved but technically STOP-blocked until Plans 098 and 106
> clear; this implementation plan performs neither operation.
>
> **Target-branch preflight**:
>
> ```sh
> git merge-base --is-ancestor 5dd08062 HEAD
> git status --short
> ```
>
> The first command must exit 0. The second must be clean before implementation
> begins. This plan was refreshed against `origin/main@5dd08062`; the audit
> checkout remained on `292d2bd0`, 62 commits behind, with unrelated dirty and
> untracked work. Do not implement in that checkout.

## Status

- **State**: TODO — producer handoff verified; executable now on a fresh branch
  from current `origin/main`; activation remains blocked on Plan 098
- **Priority**: P0
- **Effort**: XL
- **Risk**: HIGH (public identity, wording, release activation, and two user
  surfaces change together)
- **Depends on**: final `resolved-pack-v1-production` release and Plan 056
  acceptance receipt (SATISFIED); local Plan 098 for activation only (HARD);
  Plan 057 Tracker pin/deploy after both downstream plans complete (HARD)
- **Category**: architecture / correctness
- **Planned at**: `origin/main@5dd08062`, refreshed 2026-08-01

## Outcome

The site consumes the versioned, hash-pinned, strictly decoded final producer
pack. `/interventions` and route history use the same producer identities,
components, routes, treatment families, dates, actions, extents, placements,
and citations. Exactly 65 accepted ACE episodes remain explicitly
Tracker-owned enrichments; studies, proposals, findings, network-buildout
presentation, and editorial copy remain separately traceable Tracker data.

The accepted cutover composition is exact: 222 episodes, 188 route artifacts,
and 268 episode-route memberships. It consists of all 157 producer episodes
plus 65 Tracker enrichment-only episodes. The ledger maps 131 legacy episodes
to producer identity, drops eight justified legacy exclusions, and adds 26
producer episodes absent from the old Tracker projection.

The final public current-footprint file is intentionally empty. The pack has
95 placements with `last_confirmed_active` and nine with `unknown`, but zero
`confirmed_active`; neither state authorizes the site to say an intervention
is currently active.

## Producer progression from Plan 052 to the final release

Plan 052 closed the operational-episode **identity** frontier at commit
`f29cc5e3ee27dd4411405693e3474af4fb2c217e` in `mta-wiki`:

- all 766 candidates and 1,366 observations have terminal outcomes;
- 157 episodes and 343 exact applications project across 170 route display
  rows;
- all 577 public keys resolve;
- the candidate and observation partitions are deterministic and independently
  reviewed.

Plans 053-056 have now closed those remaining producer contracts:

- component actions: 104 `add`, 109 `modify`, 117 `remove`, seven `resume`,
  one `retain`, and five reviewed `unknown`;
- component extents: 34 `route_wide`, eight `bounded_segment`, 163
  `service_pattern`, and 138 reviewed `unknown`;
- 104 stable placements, of which 95 are `last_confirmed_active` and nine are
  `unknown` at `2026-07-27`;
- 447 history rows: 343 component applications and 104 placement transitions;
- 157 episodes, 343 components, 170 exact public route keys representing 167
  GTFS routes, ten treatment families, 54 sources, and zero confirmed-current
  footprint rows;
- a 230-row accepted Tracker ledger: 131 producer matches, 65 Tracker
  enrichment-only rows, eight exclusions, and 26 producer additions.

Campaign and intermediate operator paths still are not supported site inputs:

```text
data/operational-episode-resolution/campaigns/plan-052/**
data/resolved-transit/public-display/**
```

The supported release inputs are the 11 consumer-safe resources under
`resolved-pack/public/` plus the five exact
`resolved-pack/operator/tracker-conformance/` files listed below. The latter
are build-time reconciliation inputs only; their reviewer, decision, receipt,
hash, and legacy Tracker fields must never enter a public artifact.

## Pinned final producer handoff

### Release envelope

| Field | Required value |
|---|---|
| GitHub Release | `https://github.com/mannyc2/mta-wiki/releases/tag/resolved-pack-v1-production` |
| Release id | `resolved-pack-v1-production` |
| As-of date | `2026-07-27` |
| Tag object | `eeb1a6ccc4d6b7ffcbfe2730c84e2d74eac67b84` |
| Tag target | `159b8e79c8feeb3a658d7f57790020b88df17edb` |
| Generator commit | `ae1fb7704f0d878075d41fc38ebac83d4665b44f` |
| Build id | `6f904a0a4965f279aa91be738fe469f41d8a7bad078a43cef42c28ebb435717e` |
| Release `manifest.json` SHA-256 | `b4ebf56d6db88ae0c75d97ac2091ab15c97e2e8e72b1fee738db921d5d001617` |
| Archive SHA-256 | `5df8c07e182711aa5ba231137a6d1fa51fcf04ad02bad8ff4e4e6f9b0250582f` |
| Full-tree partition SHA-256 | `a491a78e3c2cb80b4c5916dc63b90e8957fbc087053ced786784461c4627260d` |
| Public fingerprint | `78c72dc79db465d64b39011c4246596d714c1eecd82e5d2a870209acf949bdce` |
| Final publication receipt | `resolved-pack-v1-production-final-publication:1e46fe4a4f9299b6e73e5598813c1744299b810a08ab81ab6ce28ccb971025df` |
| Successor handoff | `resolved-pack-v1-production-successor-handoff:4cdf5b48b45c28db0f4f2bb712c50d70d0349f451ed088dc9bcdbd7039d4323c` |

The importer receives an explicitly downloaded/extracted release root. Unit
tests remain offline. Downloading is an operator acquisition step, not an
implicit network side effect of schema decoding or a public request.

### Consumer-safe public resources

| Release-relative path | Bytes | SHA-256 |
|---|---:|---|
| `resolved-pack/public/manifest.json` | 802 | `9cf2be5cc61d74414b6720c4f3ac83d2092e3b8b40302dd941fd20c48b8e5d97` |
| `resolved-pack/public/public_intervention_episodes.jsonl` | 92,104 | `428a18e5a436f29a51b6d3c8d95b4d7314c2d29e57749f7cb5260079644ee275` |
| `resolved-pack/public/public_intervention_components.jsonl` | 216,835 | `facbfddc2053ba01fce817b21ae798c7947bfaca862e46932c9ce1673ac7c1e1` |
| `resolved-pack/public/public_intervention_placements.jsonl` | 37,692 | `dc03cb0023b05219402aecf73c6393dec252b7df01e7061bd6d6356bc69c52ef` |
| `resolved-pack/public/public_routes.jsonl` | 18,609 | `a35880cde4395fffaff877dd61d401e5d4edbb5f72a2f7daff74905df4338690` |
| `resolved-pack/public/public_treatment_families.jsonl` | 996 | `4231ed413140c76b67289f18de5f1973ee1659315100f3c212ee2c91e367752b` |
| `resolved-pack/public/public_route_intervention_index.jsonl` | 83,823 | `8337dbba5c2971781f68e38deecfa013e418c57c36b05528d1a8bb385ca2e9ba` |
| `resolved-pack/public/public_intervention_history.jsonl` | 149,329 | `b123c3c9b985e6371cb58485828c8a488390d2e45e4a7105c3e29ab02513a9aa` |
| `resolved-pack/public/public_current_footprint.jsonl` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `resolved-pack/public/public_network_summary.json` | 541 | `81299264db9b209fa62e10b034b4296f82c6c3f259f4652c4bd8b6f1ea1d7cff` |
| `resolved-pack/public/public_sources.jsonl` | 13,133 | `7ccb23251ab61641d35a303bd143504db3d13e1e30da6749b00162070e8e6161` |

The public manifest contract id is `resolved-transit-public-pack-v1`; its
resource order and roles are exact. The outer `resolved-pack/manifest.json`
reports `public_resource_count: 11` because the public manifest itself is one
of the 11 resources.

### Build-only Tracker conformance inputs

| Release-relative path | SHA-256 |
|---|---|
| `resolved-pack/operator/tracker-conformance/accepted-diff-ledger.jsonl` | `c5a29a4f404767fd79f6a05c9aeea604ca8bc40c9c293716b781edee15d394a0` |
| `resolved-pack/operator/tracker-conformance/accepted-ledger-receipt.json` | `09259101de7632d787877bd856e5dc315b5848044bb86581a0b8f3d9c9d5172d` |
| `resolved-pack/operator/tracker-conformance/summary.json` | `dddb6f68c338f3530902932e58c80907f2a66338a6309c42c4d6bc43335784ab` |
| `resolved-pack/operator/tracker-conformance/tracker-baseline.jsonl` | `0bb7e1e84f31ff5e1dbd0f6e4cc17d71f52f522c96c41ef9912dbc941e05543a` |
| `resolved-pack/operator/tracker-conformance/tracker-route-surface.jsonl` | `b248baa6eb1c80d9bacdfae1411cff5e2b323bfafd567df2d26240b8235ebc8b` |

The acceptance receipt id is
`plan-056-tracker-diff-acceptance:23fb25861fa011cf5637f53064e5ea13af248eb2f0a1004313b7d1826529b554`.
It binds all 230 decisions; applying those dispositions deterministically
recomputes the final 222/188/268 composition.

## Current site state at the refreshed planning baseline

At `origin/main@5dd08062`, the public-intervention files below are byte-identical
to the original `820cd18c` audit baseline. The current builder is still a
parallel reconstruction rather than a producer-pack consumer:

- `tools/pipeline-v2/src/commands/studio/public-intervention-episodes.ts`
  hard-pins `operational-occurrences-v3-v1-rc25.json` and
  `route-evidence-v1-rc25.json`, then also reads the legacy corpus, studies,
  selected dossiers, and the local ACE registry.
- `tools/pipeline-v2/src/lib/public-intervention-episodes.ts` locally reconciles
  eight records, locally mints or attaches ACE episodes, derives titles and
  route roles from treatment family, stamps lifecycle as `in_place`, and emits
  204 episodes over 179 routes.
- `tools/pipeline-v2/src/inputs/public-episode-reconciliations.ts` is a second
  authority for identity decisions already owned upstream.
- `packages/domain/src/studio/public-intervention-episodes.ts` requires
  presentation claims such as route `role`, `phase`, and `lifecycle` that the
  final producer pack does not carry and its empty current footprint does not
  authorize.
- `apps/web/src/components/interventions/PublicChangeEntry.tsx` turns those
  route roles into “New service”, “Changed”, “Affected”, and “Kept running”.
- `apps/web/src/routes/interventions.tsx` and route detail load separate global
  and per-route R2 resources, so identity equality must be enforced during the
  build rather than assumed in the browser.

The accepted Plan 056 ledger has now made the replacement deterministic:

- the current black-box baseline is 204 episodes, 179 route artifacts, and 243
  episode-route memberships;
- 131 legacy episodes switch to exact producer identity;
- 65 legacy ACE episodes remain Tracker-owned enrichment-only episodes, using
  the exact existing `tracker_episode_id`, `origin_ids`, dates, and route keys
  recorded in the ledger rather than being re-minted;
- eight legacy episodes are dropped for an accepted reason;
- 26 producer episodes are added;
- the final candidate is exactly 222 episodes, 188 exact route artifacts, and
  268 episode-route memberships.

This plan consumes those accepted dispositions. It does not re-adjudicate
them, re-run identity matching, or derive a new target count.

## Authority and ownership boundary

| Data or behavior | Authority after cutover | Rule |
|---|---|---|
| Producer episode identity and aliases | `mta-wiki` public pack | Never mint, merge, hash, or rewrite in Tracker |
| 65 ACE enrichment episode identities | accepted Plan 056 ledger + Tracker ACE event | Retain exact ledger id; never re-mint or present as producer truth |
| Applications, action, extent, applicability | `mta-wiki` public pack | Preserve reviewed unknowns and caveats |
| Routes and exact public route keys | `mta-wiki` public pack | Preserve exact suffixes such as `B44+` |
| Dates and date precision | `mta-wiki` public pack | Do not infer a more precise date |
| Treatment families and source citations | `mta-wiki` public pack | Strict join; no label-based identity |
| Placement and current footprint | `mta-wiki` Plans 054-055 public resources | Render only when explicitly present |
| Studies, findings, proposals, editorial copy | Tracker | Enrichment only; carry Tracker lineage |
| Network build-out presentation | Tracker | Keep separately labelled; do not claim producer derivation or make it a second identity set |
| Release identity and resource hashes | strict pack manifest + local atomic release manifest | Both must be pinned and verified |
| Build-only Tracker disposition | accepted Plan 056 operator ledger | Consume locally; never serialize operator fields publicly |
| Producer publication and `LATEST` | final Plan 057 release | Already complete; verify exact pins rather than republish |
| Tracker pin and deployment | owner-gated Plan 057 + local Plan 098 | Approved but technically blocked; never implicit in a build command |

## Target data flow

```text
final resolved-pack-v1-production archive
        + strict 11-resource public pack
        + accepted build-only Tracker conformance ledger
        + exact release/resource hashes
                         |
                         v
pipeline-v2 strict import and normalization
                         |
          +--------------+--------------+
          |                             |
          v                             v
65 ledger-authorized ACE episodes  conformance/audit report
+ Tracker enrichment joins         (exactly 222/188/268)
(studies, findings, proposals)
          |
          v
candidate global + per-route artifacts
          |
          v
Plan 098 atomic release manifest candidate
          |
          v
Plan 057 approved Tracker pin and deployment
          |
          +--> /interventions
          +--> /routes/<exact-slug>?tab=history
```

## Contract requirements

The Plan 056 schema is final. Mirror its exact closed fields and unions from
the tagged generator commit's
`packages/pipeline/src/consumer/public-contract.ts`; do not invent aliases or
normalize away distinctions. The importer strictly decodes and cross-checks:

- `manifest.json` with contract id `resolved-transit-public-pack-v1`, exact
  schema version, as-of date, resource order, names, and roles;
- `public_intervention_episodes.jsonl` with exact `occurrence:*` identity,
  display name, onset value/precision, route/component/family keys, aliases,
  sources, and `historical_episode` classification;
- `public_intervention_components.jsonl` with exact route and GTFS identities,
  treatment labels, applicability, action/action label, extent, details,
  caveats, and source refs;
- `public_intervention_placements.jsonl`, including founding component, scope,
  `state_as_of`, and as-of date;
- route and treatment-family dictionaries;
- the route-component index;
- the tagged component-application and placement-transition history union;
- the confirmed-current footprint, which is empty in this release;
- the reconciled network summary;
- the source dictionary and URL/status invariant;
- the five pinned build-only conformance resources.

The local normalized contract must preserve:

1. producer intervention id, public route key, component id, treatment-family
   id, source id, and all explicit aliases;
2. date value plus precision, not just a display string;
3. application action, extent, applicability, and the reason/caveat for every
   reviewed unknown;
4. placement and current state only when the corresponding reviewed resource
   supplies them;
5. release id, tag target, generator, build id, as-of value, outer manifest,
   archive, public fingerprint, every resource SHA-256, and accepted
   conformance receipt/ledger hashes;
6. lineage for every Tracker enrichment and the accepted disposition of every
   one of the 204 legacy Tracker episodes plus all 26 producer additions;
7. the exact target composition of 222 episodes, 188 route artifacts, and 268
   episode-route memberships.

The decoder must reject excess properties, duplicate ids, dangling references,
count mismatches, hash mismatches, route-index/history/footprint multiset
mismatches, a conformance ledger for a different pack or baseline, and
internal/operator ids in public fields. It must preserve the three exact
producer public-key duplicates by GTFS identity: `M34+`, `Q52+`, and `Q53+`
each have two distinct producer route keys.

## Commands the executor will need

| Purpose | Command | Expected on success |
|---|---|---|
| Domain contract | `bun --filter @bp/domain test` | exit 0 |
| Focused importer/builder | `bun test tools/pipeline-v2/test/resolved-transit-public-pack.test.ts tools/pipeline-v2/test/public-intervention-episodes.test.ts --timeout 5000` | all pass |
| Final pinned candidate | `scripts/with-repo-env.sh -- bun --filter @bp/pipeline-v2 cli -- studio public-intervention-episodes --release-root data/raw/mta-wiki/releases/resolved-pack-v1-production --json` | 222 episodes, 188 route artifacts, 268 memberships; no stable-key writes |
| Public projection UI contract | `bun test packages/domain/test/public-intervention-episodes.test.ts apps/web/test/shared/public-episode-projection.test.ts --timeout 5000` | all pass |
| Pipeline suite | `bun --filter @bp/pipeline-v2 test` | exit 0 |
| Web suite | `bun run test:web` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Architecture | `bun run check:architecture` | exit 0 |
| Web release build/budgets | `bun run check:web-release` | exit 0 |
| Full repository gate | `bun run check` | exit 0 |

All tests are fixture-backed. Live network access is neither required nor
allowed as a substitute for a pinned pack fixture.

## Scope

**Expected in scope**:

- `packages/domain/src/studio/public-intervention-episodes.ts`
- `packages/domain/src/studio/resolved-transit-public-pack.ts` (new strict
  producer/conformance boundary)
- `packages/domain/package.json` (focused
  `./studio/resolved-transit-public-pack` subpath; never `export *`)
- `packages/domain/test/public-intervention-episodes.test.ts`
- a new domain test for the strict pack schema
- `tools/pipeline-v2/src/commands/studio/public-intervention-episodes.ts`
- `tools/pipeline-v2/src/lib/public-intervention-episodes.ts`
- `tools/pipeline-v2/src/inputs/public-episode-reconciliations.ts` (delete after
  the accepted ledger replaces it)
- `tools/pipeline-v2/src/lib/resolved-transit-public-pack.ts` (new importer and
  cross-resource validator)
- `tools/pipeline-v2/src/lib/resolved-transit-release-pin.ts` (new exact final
  release envelope and resource pins)
- `tools/pipeline-v2/test/cli/registry.test.ts` only if the existing command's
  option contract gains a focused assertion; do not create a second command
- `tools/pipeline-v2/test/public-intervention-episodes.test.ts`
- a new fixture-backed importer/conformance test
- `apps/web/src/components/interventions/PublicChangeEntry.tsx`
- the `/interventions` and route-history projection/view modules that consume
  the public episode contract
- `apps/web/test/shared/public-episode-projection.test.ts`
- the data-product registry entry and small synthetic contract fixtures
  required to build the candidate deterministically; do not commit the release
  archive or full operator ledger
- `knowledge/log.md` (append only)
- `plans/README.md` (status only)

**Out of scope**:

- changing any file in the `mta-wiki` repository;
- changing, republishing, or superseding the final producer release;
- consuming any operator resource outside the five pinned Tracker-conformance
  files, or emitting any of those operator rows publicly;
- guessing action, extent, placement, lifecycle, or current footprint from a
  treatment-family label, title, route membership, or date;
- changing study estimators, findings, or proposal semantics;
- redesigning the UI beyond the copy/fields required for honest producer data;
- implementing local Plan 098 inside this plan;
- publishing to R2, mutating either repository's `LATEST`, pinning Tracker, or
  deploying; pushing or opening a PR still requires separate authorization;
- retaining a silent legacy fallback after atomic activation. Before
  activation the old release remains whole; after activation the new release
  is whole.

## Git workflow

- Branch: `codex/106-resolved-transit-public-pack`, cut from a commit containing
  `5dd08062` or a later reviewed `origin/main` descendant.
- Keep commits reviewable by boundary: strict contract/importer; projection and
  conformance; UI; release candidate/docs.
- Do not commit generated bulk data. Pin the producer release and hashes, and
  keep only the smallest complete contract fixtures required by tests.
- Do not push, publish, pin, or deploy unless the owner separately authorizes
  the relevant operation.

## Steps

### Step 0: Re-verify the pinned handoff in a clean current-main checkout

Before editing product code:

1. Start from a clean branch containing `5dd08062`; do not reuse the dirty
   `ops/gen18-artifact-publication` checkout.
2. Acquire the final GitHub Release archive into a gitignored local source
   directory and verify its 12,453,103 bytes and archive SHA-256 before
   extraction.
3. Verify the extracted top-level `manifest.json` SHA-256, release id,
   manifest version 7, production profile, as-of date, generator commit, build
   id, and every outer-manifest file hash against the pinned values above.
4. Verify the public manifest has contract id
   `resolved-transit-public-pack-v1` and its exact ten leaf-resource entries in
   order; verify the wrapper's `public_resource_count: 11` and the public leaf
   counts 157/343/104/170/10/343/447/0/54.
5. Verify the five conformance files and acceptance receipt, then independently
   recompute the 131/65/8/26 decision partition and 222/188/268 target.
6. Create only a small synthetic complete-pack fixture for unit tests. The
   full release remains an operator-acquired, hash-pinned input for the
   candidate command and clean-clone instructions.

**STOP if** a pin differs, the GitHub asset is unavailable, the exact release
tree does not verify, any of the 204 legacy episodes is unclassified, the
target is not exactly 222/188/268, or the target checkout is dirty/stale.

### Step 1: Define the strict producer-pack boundary

Create Effect Schema decoders for the exact Plan 056 public resources. Keep the
schema in `packages/domain`; it must be pure and import no local package.

Requirements:

- model ids and release/hash values with existing project branded-string
  conventions where available;
- model dates with their precision discriminator;
- model reviewed unknown action/extent as data, including caveat/reason, not as
  parse failure;
- reject unknown object keys and unsafe numeric values;
- export only explicit named values and separate `export type` statements;
- add valid-minimal, full, mutation, duplicate-id, dangling-reference, and
  excess-property tests.

**Verify**:

```sh
bun --filter @bp/domain test
bun run check:architecture
```

Expected: both exit 0.

### Step 2: Add a hash-pinned, deterministic importer

Add a pipeline-v2 importer used by the existing
`studio public-intervention-episodes` command. The command keeps the existing
`--db` option, adds required `--release-root` and optional `--validate-only`
options, and uses `resolved-transit-release-pin.ts` for the expected hashes;
hashes are not operator-overridable flags. It must:

1. resolve the input beneath the configured input root and reject path escape;
2. verify raw bytes against the manifest before decoding;
3. strictly decode all required resources;
4. enforce unique ids and all foreign-key joins;
5. recompute manifest counts, route indexes, history membership, current
   footprint membership, and network-summary counts from leaf resources;
6. verify the accepted conformance ledger targets the same pack and accounts
   for every legacy Tracker episode;
7. derive `candidateId` from canonical producer, conformance, ACE, study,
   proposal/editorial, and builder/schema inputs without wall-clock or local
   path fields, then write under
   `data/artifacts/studio/v2/candidates/<candidateId>/` without mutating stable
   logical keys;
8. produce byte-identical output on replay.

The command help must call the input the **published
`resolved-pack-v1-production` producer release** and distinguish it from the
unpublished Tracker serving candidate this command creates.

**Verify**:

```sh
bun test tools/pipeline-v2/test/resolved-transit-public-pack.test.ts --timeout 5000
bun --filter @bp/pipeline-v2 cli -- --help
```

Expected: tests pass; help shows `--db`, required `--release-root`, and
`--validate-only`; JSON output includes the derived candidate id, verified
producer and ledger hashes, and exact counts.

### Step 3: Replace the parallel identity reconstruction

Refactor the public-intervention builder so the normalized public pack is the
only authority for producer-owned facts and the accepted ledger is the only
authority for the producer/Tracker composition:

- remove rc25 operational-occurrence and route-evidence hard pins from this
  command;
- remove the local eight-record reconciliation table as an authority;
- remove local ACE matching/minting as an identity source. For each of the 65
  `enrichment_only` rows, retain the ledger's exact `tracker_episode_id`,
  `origin_ids`, date, route ids, and route keys; join the referenced local ACE
  event and fail closed on any mismatch;
- do not derive titles, action verbs, route roles, or lifecycle from treatment
  family;
- construct both global and per-route resources from the same normalized union:
  157 producer episodes using exact `occurrence:*` ids plus 65 tagged Tracker
  enrichment episodes using the accepted existing `ep_*` ids;
- apply all 131 `use_producer_identity`, eight `drop_legacy_episode`, 65
  `enrichment_only`, and 26 `add_producer_episode` rows exactly once;
- retain studies and findings only through the accepted ledger mapping from
  legacy origin ids to producer identity. Keep proposals and editorial
  metadata separately Tracker-owned;
- emit a lineage record for every enrichment and a rejected/unmatched report
  rather than silently dropping or locally minting identity;
- retain network-buildout presentation as Tracker-owned, as Plan 056 permits.
  Do not relabel the existing series as producer-derived or make its counts a
  second episode identity surface.

Delete `public-episode-reconciliations.ts` and its imports once the accepted
ledger has replaced its identity decisions. The release pin and typed
conformance importer replace it; do not hand-copy the 230 ledger rows into a
new source constant.

**Verify**:

```sh
bun test tools/pipeline-v2/test/public-intervention-episodes.test.ts --timeout 5000
rg -n "v1-rc25|public-episode-reconciliations|lifecycle: .in_place.|TITLE_BY_KIND|episodeIdFor" tools/pipeline-v2/src/commands/studio/public-intervention-episodes.ts tools/pipeline-v2/src/lib/public-intervention-episodes.ts tools/pipeline-v2/src/inputs
```

Expected: tests pass; the grep has no matches in the cutover builder or legacy
input directory.

### Step 4: Make the site contract honest about reviewed semantics

Version the public episode artifact if its shape changes. Prefer adding a v2
contract and atomic cutover over making old v1 readers accept ambiguous mixed
shapes.

Replace the v1 release envelope's locally fabricated `publishedAt`, hard-coded
`coverageEnd`, and source-derived release id. The candidate v2 envelope carries
`candidateId`, producer release/tag/manifest/as-of provenance, per-enrichment
input hashes/coverage, and schema/builder versions. Plan 098 alone creates the
Tracker `releaseId`, `publishedAt`, and `activatedAt` values when the candidate
is activated.

The web-facing model must:

- be a tagged authority union: producer episodes use the exact producer
  intervention id; the 65 Tracker enrichment episodes use their exact accepted
  Tracker id and cannot carry producer-owned component/placement fields;
- expose route membership without a fabricated role when the producer has not
  reviewed one;
- expose each component's treatment-family label, action, extent,
  applicability, caveat/reason, and citations;
- carry date precision;
- omit or explicitly mark unknown lifecycle/current state unless the Plan 055
  current-footprint resource confirms it;
- keep Tracker-owned build-out, proposals, studies, and findings in separate
  fields with Tracker lineage;
- keep global and per-route episodes structurally identical.

For this pinned release, `public_current_footprint.jsonl` is empty. Therefore
the candidate renders no producer episode as currently active. A placement
state of `last_confirmed_active` is historical evidence as of `2026-07-27`, not
an alias for `confirmed_active`.

Do not translate `action: unknown` into an affirmative verb. Neutral copy such
as “Recorded change” or the reviewed treatment-family label is acceptable;
“added”, “opened”, “began”, “new service”, and “kept running” require explicit
support from the reviewed producer action/extent or the separately typed ACE
event contract.

**Verify**:

```sh
bun test packages/domain/test/public-intervention-episodes.test.ts tools/pipeline-v2/test/public-intervention-episodes.test.ts --timeout 5000
```

Expected: tests pass, including fixtures for unknown action, unknown extent,
no placement, no current footprint, exact suffixed route identity, and
confirmed current footprint.

### Step 5: Cut both readers to one identity and copy model

Update `/interventions` and route history together:

1. render the same authority-tagged episode id and reviewed date on both
   surfaces;
2. make producer route links use the exact public route key, including the two
   distinct keys for each duplicated `M34+`, `Q52+`, and `Q53+` GTFS identity;
3. render action-aware neutral text and show reviewed uncertainty rather than
   hiding it;
4. show source citations from the producer source resource;
5. render placement history where useful, but render no current producer
   status because this release has zero confirmed-current rows;
6. preserve Tracker study/finding/proposal sections as separately labelled
   enrichments;
7. keep lazy loading and existing bundle budgets;
8. preserve old deep-link compatibility only at the release boundary. Do not
   fetch old and new truth sources and merge them in the browser.

Add a projection invariant that every per-route episode is byte-equivalent in
shared fields to the same episode in the global artifact.

**Verify**:

```sh
bun test apps/web/test/shared/public-episode-projection.test.ts --timeout 5000
bun run test:web
bun run check:web-release
```

Expected: all exit 0.

### Step 6: Lock the conformance and regression tests

Add fixture-backed tests for all of these invariants:

- exact producer episode, component, route, family, source, index, history, and
  footprint multisets survive import;
- public leaf counts are exactly 157 episodes, 343 components, 104 placements,
  170 route keys, ten families, 343 index rows, 447 history rows, zero current
  footprint rows, and 54 sources;
- component semantics are exactly 104 add / 109 modify / 117 remove / seven
  resume / one retain / five unknown and 34 route-wide / eight bounded-segment
  / 163 service-pattern / 138 unknown extents;
- every legacy 204-episode row has exactly one accepted ledger disposition and
  all 26 producer-addition rows are applied exactly once;
- the resulting candidate is exactly 222 episodes, 188 route artifacts, and
  268 episode-route memberships;
- no unclassified local mint or silent exclusion exists;
- unknown action/extent never produces an affirmative verb or route role;
- `last_confirmed_active`, `unknown`, and an empty current footprint never
  produce “in place”, “currently active”, or current-map claims;
- global and per-route ids and shared fields agree;
- the candidate envelope contains no Tracker release id, `publishedAt`,
  `activatedAt`, implicit current time, or local path, and its candidate id
  changes when any semantic producer/Tracker input changes;
- no internal/operator id reaches a public artifact;
- malformed, excess-property, dangling-reference, count, hash, and cross-pack
  mutations fail closed;
- two clean builds are byte-identical.

Do not retain the old Plan 052 unknown-action/unknown-extent assertions as a
production fixture. A small final-contract synthetic fixture is the unit-test
input; the exact published release is exercised by the candidate command and
its recorded verification receipt.

**Verify**:

```sh
bun --filter @bp/domain test
bun --filter @bp/pipeline-v2 test
bun run test:web
bun run check:types
bun run check:architecture
```

Expected: all exit 0.

### Step 7: Build a release candidate without activating it

From the repo root, with the verified release extracted at the standard
gitignored source path, run:

```sh
scripts/with-repo-env.sh -- bun --filter @bp/pipeline-v2 cli -- \
  studio public-intervention-episodes \
  --release-root data/raw/mta-wiki/releases/resolved-pack-v1-production \
  --json
```

Produce candidate-scoped artifacts and a candidate artifact-map handoff.
Record:

- producer commit/release/as-of and manifest hash;
- conformance-ledger hash;
- normalized artifact hash;
- global and per-route resource hashes;
- exact episode/component/route/source counts;
- Tracker enrichment counts by type;
- exact 222/188/268 candidate composition and 131/65/8/26 disposition
  partition;
- zero unexplained conformance rows;
- verification command results.

Expected command output: `episodeCount: 222`, `routeArtifactCount: 188`,
`episodeRouteMembershipCount: 268`, `producerEpisodeCount: 157`,
`trackerEnrichmentEpisodeCount: 65`, zero unexplained dispositions, and the
derived candidate id/paths. It must not report a Tracker release id or
publication timestamp.

Do **not** upload to stable logical keys, mutate `LATEST`, pin Tracker, or
deploy. Produce a closed list of every new logical key, schema id, content hash,
media type, and route-key expansion that Plan 098 must stage, activate, and
roll back atomically. Plan 098 is still TODO, so do not pretend its mechanism
already exists or weaken this candidate to fit the Plan 097 recovery path.

**Verify**:

```sh
bun run check
git status --short
```

Expected: the full gate exits 0; only intended source, test, small fixture,
plan-status, and append-only knowledge-log changes remain. Generated bulk
artifacts are ignored or outside the commit.

### Step 8: Hand off the separately authorized activation

After code review and candidate verification, prepare an operator handoff that
names the candidate hashes and the exact remaining technical operations:

1. implement and verify local Plan 098 atomic serving support for the complete
   logical-key set;
2. stage the Plan 106 candidate without changing the active release;
3. re-run the already accepted 222/188/268 conformance receipt against the
   staged bytes;
4. perform the already owner-approved Tracker pin only after Plans 098 and 106
   are complete;
5. activate through Plan 098's compare-and-swap pointer;
6. perform the already owner-approved deployment;
7. verify both `/interventions` and representative exact-suffix route history;
8. retain and test the previous atomic release id for rollback.

This plan is `DONE` when the code and candidate handoff are complete and all
gates pass. It does not wait for or imply activation. Record activation under
Plan 098 and the owner-authorized Plan 057 receipt.

## STOP conditions

Stop and report instead of improvising if any of the following occurs:

1. the input differs from the pinned final release envelope or any release,
   public-resource, acceptance, or conformance hash above;
2. the public input is a Plan 052 campaign/intermediate path, or an operator
   path other than the five pinned build-only conformance files;
3. the manifest, a resource hash, or the accepted conformance-ledger hash is
   missing or mismatched;
4. any of the current 204 Tracker episodes lacks exactly one accepted
   conformance disposition, any of the 26 additions is missing, or the target
   is not exactly 222/188/268;
5. implementation would infer action, extent, placement, lifecycle, current
   footprint, or route role;
6. a producer identity would be minted, merged, or rewritten locally;
7. global and per-route artifacts disagree on shared episode identity/content;
8. an internal/operator id would become public;
9. a new logical artifact key would be served without Plan 098 atomic release
   coverage;
10. Tracker pin or deployment would occur before both technical prerequisite
    plans are complete, even though owner approval is already recorded;
11. the target branch does not contain `5dd08062`, or the worktree is dirty;
12. any required verification fails.

## Exit criteria

- The strict final public pack is the sole authority for all producer-owned
  episode/application/route/source facts; the accepted ledger and ACE event
  contract are the sole authority for the 65 Tracker enrichment episodes.
- Every legacy Tracker episode and producer addition has its accepted
  disposition, yielding exactly 222 episodes, 188 route artifacts, and 268
  memberships.
- Tracker-owned enrichments remain separate, joined, and traceable.
- Five unknown actions, 138 unknown extents, 95 last-confirmed-active
  placements, nine unknown placements, and zero confirmed-current rows render
  honestly.
- `/interventions` and route history share the exact accepted producer and
  Tracker-enrichment identities and content.
- All domain, pipeline, web, architecture, type, release-budget, determinism,
  and full repository gates pass.
- Candidate hashes and the remaining owner-gated activation steps are recorded.
- No Tracker `LATEST` mutation, pin, deployment, or implicit release activation
  occurred under this plan; the already published producer release was only
  acquired and verified.
