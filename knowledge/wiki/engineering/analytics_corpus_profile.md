---
title: Analytics Corpus Profile
type: engineering
status: active
last_updated: 2026-05-30
owner: packages/analytics
source_count: 0
tags: [analytics, corpus, detectors, calibration, historical-baselines]
---

# Analytics Corpus Profile

## Purpose

The detector system should not treat the public release month as the whole analytical universe.
The release month is the serving snapshot. The historical corpus is the detector-learning substrate.

This split matters because much of the local data goes back far beyond one month. A detector that
uses only the current release month can describe current conditions, but it cannot distinguish
normal seasonality, persistent degradation, rare spikes, weak sources, or threshold drift. The
historical corpus should drive baselines, calibration, review queues, false-positive analysis, and
new detector ideas.

## Rule

Use two windows:

| Window | Purpose | Claim posture |
|---|---|---|
| Release month | Public serving snapshot, current route cards, current candidate evidence | Descriptive current-state claims |
| Historical detector window | Baselines, trend context, threshold fitting, positive/negative examples, Ralph detector ideation | Internal analysis, calibration, and review support |

Do not make a public current-state claim from historical data alone. Do use historical data to know
whether the current-state claim is unusual, persistent, seasonal, fragile, or unsupported.

## Architecture Doctrine

The analytics architecture should treat time as a first-class axis. A detector should not begin by
asking only "what happened in the release month?" It should begin by asking:

1. What is the declared universe of comparable historical observations?
2. Which parts of that universe are complete enough to learn from?
3. What baseline does that history support for this detector and scope?
4. What does the release-month observation mean against that baseline?
5. What evidence, counter-evidence, and missing-data state should be attached?

That doctrine creates three separate products from the same corpus:

| Product | Stored where | Used for | Published directly? |
|---|---|---|---|
| Native historical corpus | Local SQLite and source snapshots | Feature materialization, baselines, threshold fitting, backtests, Ralph ideation | No |
| Release snapshot | D1/R2 serving projection | Public route cards, maps, briefs, current reviewed findings | Yes |
| Calibration and review corpus | Local/R2 artifacts keyed by detector version | Score vectors, gold sets, reviewer outcomes, false-positive registers | No, except summaries |

The release snapshot is a frozen answer for users. The native historical corpus is the laboratory.
The calibration/review corpus is the memory that lets the laboratory improve without losing
determinism.

## Canonical Windows

Every detector or feature materializer should name which window it is using. Avoid ad hoc "last N
months" logic inside detector code.

| Window | Default | Primary use | Notes |
|---|---:|---|---|
| `releaseMonth` | selected public month | Current evidence and serving projection | The only month that can support current-state public wording. |
| `historicalWindow` | 2023-04 through release month for the current corpus | Detector baselines, score vectors, threshold fitting | Expands as new complete public months arrive. |
| `lookback12` | trailing 12 months ending at release month | Stable route-history comparisons | Good first default for persistence and seasonality-light trends. |
| `lookback36` | trailing 36 months where available | Robust distribution and rare-event calibration | Preferred when fine-grain sources are complete. |
| `seasonalPeerWindow` | same month in prior years plus adjacent months | Seasonality checks | Useful before flagging degradation as novel. |
| `prePostInterventionWindow` | detector-specific, usually 3-12 months pre/post | Intervention association | Must carry pre-trend, control, and placebo caveats. |
| `currentSignalWindow` | latest self-collected GTFS-RT pull | Recent operations appendix | Not a replacement for public monthly aggregates. |

The pipeline may materialize multiple windows for the same detector. The detector output must stamp
the window name, start/end months, coverage, and baseline version.

## Feature Layers

Backfilling the release-only surfaces is valuable because it promotes three native-grain sources
from "current evidence only" to "historical baseline substrate":

| Layer | Tables / artifacts | Detector value after backfill |
|---|---|---|
| Native fine-grain history | `local_route_segment_speed`, `local_route_hourly_ridership`, `local_route_intervention_comparison` | Enables segment-daypart baselines, route-hour exposure, and repeated intervention-window panels instead of one-month evidence. |
| Derived feature history | future `route_metric_history`, `segment_daypart_history`, `route_hourly_profile`, `intervention_panel` artifacts | Gives `@bp/analytics` typed feature rows without DB knowledge. |
| Baseline snapshots | future baseline artifacts keyed by release month and detector version | Makes detector runs reproducible even if source history later grows. |
| Score vectors | future per-detector historical score distributions | Supports percentile thresholds, near-miss analysis, drift checks, and Ralph idea generation. |
| Review memory | reviewer decisions, gold sets, false-positive register | Lets calibration tune for confirmed-rate and root-cause errors rather than vibes. |

The pure package boundary stays intact: `tools/pipeline-v2` reads SQLite and writes artifacts;
`packages/analytics` consumes typed arrays and returns deterministic outputs.

## Detector Baseline Policy

Once the fine-grain backfill passes coverage gates, detector families should use history this way:

| Detector family | Historical input | Release-month output | Default baseline stance |
|---|---|---|---|
| Headway/EWT and bunching | Historical stop/direction/hour headways where available, Bus Wait Assessment as long coarse context | Current excess wait, bunch/gap share, missing-data state | Schedule first, then own-route history for persistence and threshold calibration. |
| Segment speed/pace | Historical segment-month/day/hour speed rows | Current slow segment and delay concentration candidates | Own-route free-flow plus same-segment history; peer/fleet percentiles only as secondary context. |
| Travel-time variability | Historical route-direction/daypart run-time or speed-derived pace distributions | Current variability and buffer-index candidates | Own-route rolling distribution with sample gates. |
| Schedule mismatch | Historical observed-vs-scheduled travel time when schedule versions are known | Current schedule-review candidate | Schedule baseline is primary; history distinguishes recurring mismatch from incident noise. |
| Degradation trend | Monthly metric history across 12-36 months | Associational worsening or improvement trend | Own-route history, seasonal guards, route-version break handling. |
| Context correlation | Historical performance plus joined context volumes | Review candidate with explicit association language | Context never becomes cause; history only checks coincidence and counter-evidence. |
| Intervention association | Repeated pre/post panels across release months and treatment dates | Candidate association packet | Controlled comparison if possible; causal language blocked until methodology review. |
| Positive deviance | Multi-period peer groups and residuals | Routes worth studying, not proof of best practice | Peer residual plus persistence and reciprocal-metric checks. |
| Source quality | Historical coverage/freshness by source and scope | Missing-data authority for every detector | Coverage rows gate detector scoring and public language. |

Detector code should not silently fall back from history to release-only mode. If the required
historical window is unavailable, emit a typed missing-data or lower-claim-strength state.

## Backfill Gates

The three current release-only groups are being backfilled for 2023-04 through 2026-03:

- route segment speeds;
- route hourly ridership;
- intervention comparisons.

Operational monitoring, restart, and failed-surface resume commands are documented in
[[wiki/engineering/analytics_backfill_runbook|Analytics Backfill Runbook]].

The post-backfill gate is:

```sh
bun --filter @bp/pipeline-v2 cli -- audit analytics-backfill-coverage \
  --start-year 2023 --start-month 4 \
  --end-year 2026 --end-month 3
```

The audit writes:

```text
data/artifacts/analytics-backfill-coverage/2023-04_to_2026-03/coverage.json
```

It checks each surface for missing months, low absolute row/route counts, and suspicious drops
relative to the observed monthly median. The backfill is not architecturally "done" until this
audit has no unexplained missing or thin months, and then
`audit analytics-corpus-profile` is rerun so the historical-readiness statuses reflect the new
corpus.

If a month remains thin for a real source reason, document it as a source-quality caveat. Do not
hide it by loosening thresholds without a note.

## Implemented Surface

`@bp/analytics/corpus` exports `summarizeCorpusProfile`, a pure helper over preloaded source
observations. It summarizes each source family by first/last month, route count, row/sample totals,
release-month availability, historical-month count, requested-window coverage, and status:

- `historical_ready`
- `historical_ready_missing_release`
- `release_only`
- `sparse_history`
- `outside_window_only`

`tools/pipeline-v2 audit analytics-corpus-profile` reads the local SQLite corpus without running
migrations and writes:

```text
data/artifacts/analytics-corpus-profile/{releaseMonth}/profile.json
```

The command currently profiles:

- route monthly speed trends;
- route monthly ridership trends;
- route hourly ridership;
- route segment speeds;
- observed reliability summaries;
- observed headway samples;
- Bus Wait Assessment;
- intervention comparisons;
- context events;
- route-touched context events.

## First Profile

Command:

```sh
bun --filter @bp/pipeline-v2 cli -- audit analytics-corpus-profile --year 2026 --month 3
```

Result for the current local corpus:

| Metric | Value |
|---|---:|
| Requested historical window | 2023-04 through 2026-03 |
| Requested window months | 36 |
| Profiled source groups | 10 |
| Profiled source families | 5 |
| Profiled routes | 410 |
| Profiled rows / samples | 144,807,234 |
| Historical-ready source groups | 7 |
| Release-only source groups | 3 |

Historical-ready groups include route monthly speed/ridership trends, observed reliability summaries,
observed headway samples, Bus Wait Assessment, and context route-touch evidence. Release-only groups
include route segment speeds, route hourly ridership, and intervention comparisons for the March
2026 release snapshot.

This tells us where the immediate detector leverage is:

- speed/ridership route-month baselines should use the full 36-month window;
- observed reliability and headway detectors can use recovered historical distributions for
  threshold calibration and false-positive analysis;
- route hourly ridership and segment speed should remain release-month evidence until the
  fine-grain backfill coverage audit passes;
- intervention event-study work should not pretend to have a full historical treatment panel until
  intervention comparisons are produced across more windows and their coverage audit passes.

## Ralph Inputs

Ralph should receive the corpus profile before proposing detector changes. The prompt bundle should
include:

- detector registry/specs;
- corpus profile source summaries;
- analytics backfill coverage status;
- declared feature-window policy;
- score vectors and threshold sensitivity summaries;
- known false-positive root causes;
- reviewer confirmed/rejected examples;
- source coverage and missing-data states.

Ralph may propose new detectors, alternate thresholds, or feature backfills, but deterministic
pipeline runs must decide whether those ideas survive. A useful Ralph proposal should say which
historical window it needs, which feature grain it consumes, which baseline family it uses, what
counter-evidence would suppress it, and how it would be backtested.

## Next Work

1. Let the 2023-04 through 2026-03 fine-grain backfill finish, then run
   `audit analytics-backfill-coverage`.
2. Rerun `audit analytics-corpus-profile` and verify that route segment speeds, hourly ridership,
   and intervention comparisons no longer show as release-only.
3. Use [[wiki/engineering/analytics_detector_calibration|Analytics Detector Calibration]] as the
   policy source for baseline windows, seasonality rules, minimum-history gates, and validation
   expectations.
4. Materialize `segment_daypart_history`, `route_hourly_profile`, `route_metric_history`, and
   `intervention_panel` artifacts from local SQLite into typed arrays consumed by `@bp/analytics`.
5. Add baseline snapshot artifacts keyed by release month, detector id, detector version, and
   window name.
6. Produce score-vector artifacts per detector over `lookback12` and `lookback36`.
7. Attach reviewer outcomes to detector versions so calibration has true labels.
8. Make the Ralph loop consume profile + backfill coverage + score vectors + false-positive
   registers rather than raw source tables alone.
