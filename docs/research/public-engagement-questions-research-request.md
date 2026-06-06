# Research Request: What high-engagement questions about NYC buses can our data answer — and which surfaces should we build first?

**Audience:** an external product/data researcher (human or model) who can do open web research on NYC transit media, advocacy, civic-data, and audience behavior.

**Deliverable we want from you:** a *ranked, evidence-backed map* from **real questions people ask about NYC buses/transit** → **the data products we can honestly serve** → **which website surfaces deserve to be built first**. Plus a blunt critique of the surface plan we already wrote (summarized in §4): which parts chase real demand, which are analyst vanity, and which high-engagement question we are *not* planning to answer. Be opinionated and be willing to tell us our plan is built from the wrong end.

**What you have:** this brief quotes our data inventory and current plan inline. You do **not** need our codebase. **Web research is expected** — study how NYC bus data is actually consumed, framed, shared, and campaigned on today (§7).

---

## 1. TL;DR

We have a deep local corpus of NYC MTA bus data and a detailed, careful plan for the public website surfaces that expose it (`/routes`, route detail, `/compare`). The plan is **directionally correct but built inside-out** — it starts from "what data do we have and how do we serve it honestly," and assembles surfaces from that.

We want you to work the **demand side**. What questions do NYC bus riders, advocates, journalists, elected offices, and transit-data people actually ask? Which framings get *engagement* — shared, cited, screenshotted, campaigned on, linked? Therefore: which of our data products and surfaces should we build first, what framing should they use, and what are we missing?

**Two audiences matter at once, and you must weigh both:**

- **The public / civic ecosystem** — riders, advocates, reporters, electeds. Engagement = clicks, shares, citations, campaign use.
- **MTA / NYCT / NYC DOT hiring managers.** This is also a software/data-analysis **portfolio piece** built to land the author a job in NYC transit data/software (see §2). For this audience "engagement" means: *does this read as someone who understands our metrics, our data, our priorities, and can build a credible, honest product?*

The most valuable answer threads both: surfaces that the public would actually use **and** that demonstrate domain credibility to the MTA.

---

## 2. What the project is

**Bus Priority Impact Studio** — a public-data research product about **New York City MTA bus reliability**. It ingests NYC/MTA open data, computes per-route/per-month speed, reliability, ridership, and intervention "findings," routes them through review, and serves provenance-rich results to a public web app.

It is explicitly **also a portfolio piece**: the author is using it to apply for data/software roles at the MTA and adjacent NYC transit orgs. So credibility, honesty about data limits, and fluency with real transit metrics (EWT, bunching, Customer Journey Time, Bus Wait Assessment, ACE, the Better Buses agenda) are features, not garnish.

The natural unit is a **route** (sometimes route × segment × daypart, or route × month). Everything heavy is precomputed offline; the public site only reads compact projections.

## 3. The data we can *honestly* serve

This is the supply side you must map demand against. **Only map a question to data if we can answer it honestly** — our entire credibility play (and the portfolio value) depends on *not* overclaiming. Each row notes the claim posture that constrains framing.

| Data family | Grain | Can we serve it? | Honesty constraint you must respect |
|---|---|---|---|
| Route identity, SBS flag, corridor, miles, stops, termini | route | **Yes** | Endpoint labels are shape endpoints, borough is partly heuristic. |
| Observed average speed | route-month, segment-month/hour | **Yes** | "Observed speed," not weighted unless stated. |
| Scheduled-vs-observed speed gap | route-slice, segment-window | **Yes (public routes)** | Scope is observed timepoint-pair slices, not full stop-to-stop truth. |
| Speed trend over time | route-month series | **Yes** | Show coverage window + source-month status. |
| Speed percentile vs peers | route-month | **Yes** | Descriptive, not causal; always show peer universe. |
| Slow segments + worst-hour bins | timepoint segment, hour | **Yes** | Observed MTA timepoint segments, not every stop pair. |
| Observed reliability: EWT, bunching, long gaps, headway | route-month/run | **Yes** | Preserve provenance (`third_party_recovered` vs `official_self_collected`); don't claim route reliability on thin samples. |
| Monthly + average-day ridership | route-month | **Yes** | "Average calendar-day boardings," derived from monthly totals. |
| Boardings by hour | route-hour | **Yes** | Route-level, **not** stop-level. |
| Rider-hours of delay / delay exposure | segment-window/hour | **Yes** | "Delay exposure," not stop/segment boardings or passenger load. |
| Stop-level & segment-level boardings / loads | stop, segment | **No — source gap** | Keep null with reason codes. A real wish-list item. |
| ACE/ABLE coverage + implementation dates | route, date | **Yes** | Route-level coverage real; per-segment enforcement geography not yet. |
| ACE violations | route-month | **Yes (route-month)** | Segment attribution null. |
| DOT bus-lane overlap, lane type/hours | route, segment | **Yes (method caveat)** | Route-shape overlap, **not** audited regulatory lane-miles. |
| TSP status | route, segment | **Yes (dated 2017 snapshot)** | Don't present a 2017 snapshot as currently installed. |
| Intervention registry + before/after evaluations | route/event/window | **Yes** | Descriptive or peer-adjusted, **not causal** unless a strict gate passes. |
| 311, parking violations, permits/openings, collisions, weather, traffic, equity/ACS | event/route-touch, context | **Context only** (mostly pipeline-available) | Associational context with join caveats; never auto-causal; must be date-windowed. |
| Findings (reviewed + candidate) | finding/route | **Yes** | Distinguish reviewed/promoted from raw detector candidates. |
| Source-gap / "we checked and found nothing" coverage | route/source/month | **Yes (planned)** | "Silence is auditable" is a deliberate product value (see §6). |
| Generated route briefs | route/brief | **Yes** | Most are generated, not editorially reviewed; show status. |

**The honest-data posture is itself a strategic asset.** "We will not tell you a bus lane caused a speedup unless the evidence clears a gate" and "we show you the routes we checked and found *nothing* wrong on" are unusual in civic-data products. Part of your job is to judge whether these honesty moves are *engagement assets* (credibility, MTA appeal, anti-clickbait trust) or *engagement drags* (hedged, unsharable), and for which audience.

## 4. The plan we want you to pressure-test

We already wrote a surface plan (`knowledge/wiki/engineering/website_surface_data_plan.md`). **Treat it as a hypothesis, not a spec.** Its core proposals:

**`/routes` would become a multi-section network-triage page, not one list.** Proposed sections (it suggests showing ~6 by default):

> Needs Attention · Worsening Fast · High Rider Impact · Reliability Watch · Slowest Corridors · Treatment Gaps · Evidence Ready · Recently Changed · Peer Outliers · Sparse/Partial Data

**Route detail would become tabbed:** Overview · Slow Segments · Reliability · Riders · Timeline · Interventions · Evidence & Data Notes.

**`/compare`** would compare two routes across speed, rider-hours, reliability, treatments, history, **and** peer-cohort percentile (so a pair isn't over-read in isolation).

The plan's own open questions we'd like your demand research to inform:
- How many `/routes` sections before the page is too busy? Which 4–6 lead?
- Should reliability be a first-class tab immediately?
- What's the first peer-cohort definition for compare (borough/family, ridership decile, length, SBS/local)?
- Which context signals (311, permits, weather) are allowed on public pages as context vs. held back?

We suspect this plan is **analyst-shaped**: it indexes the corpus thoroughly but may over-invest in surfaces that reviewers-of-data love and ordinary riders/reporters never touch. Tell us if that's true.

## 5. Audiences and their questions (seed taxonomy — validate, refine, and *rank*)

Starting hypotheses for who asks what. **Correct it, add audiences/questions we missed, and rank questions by engagement potential per audience** with evidence.

1. **Everyday riders.** "Why is my bus always late / bunched? Is the B41 getting worse? When is it least reliable — should I leave earlier? Is *my* route one of the bad ones?" Personal, emotional, local. Highest volume, lowest tolerance for jargon.
2. **Advocates / advocacy orgs** (Riders Alliance, TransitCenter, Open Plans, Straphangers, Bus Turnaround Coalition). "Which routes most need bus lanes / ACE? Is ACE actually speeding buses? Worst corridors? Is the city delivering its bus-lane-mileage promises?" Want ammunition: rankings, accountability, before/after.
3. **Journalists** (Streetsblog NYC, amNY, Gothamist/WNYC, The City, Hell Gate, NYT Metro). "What's the slowest bus in NYC? Which route got worse this year? Did the new bus lane work?" Want superlatives, ranked lists, clean before/after, a defensible number to quote.
4. **Elected offices / community boards / borough presidents.** "How are the buses in *my* district/borough? Which constituent routes are worst?" Geographic slicing, local pride/blame.
5. **Transit-data people / urbanists / r/nyc, r/NYCbus, transit Twitter.** Methodology, peer-city comparisons, downloadable data, "actually the EWT denominator is…" Small but amplifying; they decide whether the product is *credible* or gets dunked on.
6. **MTA / NYCT / NYC DOT staff + hiring managers.** "Does this person know our metrics and constraints? Is the analysis honest? Would this embarrass us or help us?" The portfolio audience — evaluates rigor, honesty, and transit fluency over flash.

For each: what's the *single highest-engagement question* we could answer for them with the §3 data?

## 6. High-engagement framings (validate or refute each)

Hypotheses about *what makes a transit-data artifact get used*. Tell us which hold for NYC buses, with examples:

- **Rankings / superlatives** — "slowest bus," "most unreliable," "biggest decline." Cheap, shareable, but invite methodology attacks.
- **Personal lookup** — "find my route," the everyday hook that drives return visits.
- **Before/after intervention stories** — "did the bus lane / ACE work?" High value, high risk if we overclaim causality (which we won't — see §3).
- **"Is it getting worse?" trend framing** — decline is more shareable than steady-state.
- **Accountability framing** — "MTA/DOT promised X, delivered Y." Advocacy gold; politically loaded.
- **Rider-hours-lost** — translating "slow" into *human cost*. Possibly our most distinctive, MTA-credible metric. Does this framing land or confuse?
- **Honest negative space** — "we checked these routes and found no major issue," "this dip is unexplained, here's the data." Anti-clickbait credibility. Asset or drag, and for whom?

## 7. Comparable products to study (and find more)

Ground your read in what already exists. At minimum assess these and how their data is framed/received:

- **busturnaround.nyc** (Bus Turnaround Coalition route report cards) — the closest comparable; what worked, what's stale, what we'd do differently.
- **MTA's own dashboards** — Bus speeds / Customer Journey Time Performance / Bus Wait Assessment on dashboard.mta.info and mta.info open-data. What does the MTA *already* publish, and where's the gap we fill?
- **NYC Comptroller** NYC-bus / service dashboards.
- **TransitCenter / TransitMatters**-style civic transit-data work and report cards.
- **Streetsblog NYC / The City / Gothamist** bus coverage — what bus stories actually get written and shared, and what data they cite.
- City-comparison points if useful (e.g. how Chicago/SF/Boston civic bus dashboards frame the same metrics).

For each: what question does it answer, who engages with it, and what does it *not* do that we could.

## 8. What we want from you (in roughly this order)

1. **A ranked demand inventory.** The questions NYC audiences actually ask about buses, ranked by engagement potential, each tagged with: audience(s), engagement evidence (what gets shared/cited/campaigned), and a verdict on whether our §3 data can answer it **honestly** (yes / partial-with-caveat / no — source gap).

2. **A demand → data → surface map.** For the high-demand answerable questions, which data family feeds it and which website surface (a `/routes` section, a route-detail tab, compare, a finding, a brief) should carry it. Flag where the surface plan already covers it vs. where we'd need something new.

3. **A blunt critique of the §4 plan.** Which of the 10 `/routes` sections and 7 route-detail tabs map to real demand, which are analyst vanity, and what high-engagement question the plan currently ignores. Answer the plan's open questions (default sections, reliability-as-tab, first peer cohort, context exposure) from a demand standpoint.

4. **The "first five."** The smallest set of surfaces/data products that would actually get used, shared, or cited — the engagement MVP. One concrete ordered list with rationale, not a roadmap.

5. **The signature hook.** The *one* distinctive thing that should make this product memorable and credible to both audiences (candidates: rider-hours-lost as the headline currency; honest negative space / "checked and found nothing"; "did the intervention work, honestly"). Pick one, argue it, say how to lead with it.

6. **Engagement traps to resist.** Where chasing engagement would damage credibility or the MTA-portfolio read (clickbait rankings that collapse under methodology scrutiny, false causality, vanity metrics, context data dressed up as findings).

## 9. Constraints (respect these)

- **NYC MTA buses specifically.** Not subways, not national transit, not generic "transit engagement." NYC bus riders, NYC media, NYC advocacy, NYC/MTA institutions.
- **Honest-data posture is non-negotiable.** Never recommend a framing we can't support with §3 data and its claim postures. "We can't honestly answer that, but here's the adjacent question we can" is a valid and valuable output.
- **Dual audience.** Every major recommendation should note whether it serves public engagement, MTA-portfolio credibility, or both — and call out where the two conflict.
- **Single maintainer, portfolio scale.** Recommend what one person can build and stand behind, not what a newsroom data team or the MTA itself would staff. Bias to a few sharp, defensible surfaces over a sprawling dashboard.
- We are **not** asking for visual/UI design, copywriting, or engineering architecture here — only *which questions to answer and which surfaces deserve to exist*.

## 10. Suggested output format

- **Executive take** (½ page): the demand-side thesis, and the single biggest correction to our inside-out plan.
- **Ranked demand inventory** (table): question · audience · engagement evidence · answerable? (Y/partial/no).
- **Demand → data → surface map** (table).
- **Plan critique**: keep / cut / reframe per section and tab, plus answers to the open questions.
- **The first five** (ordered list).
- **Signature hook** (1–2 paragraphs).
- **Traps to resist** (bulleted).
- **Sources** with links, so we can verify engagement claims.

Cite sources for engagement and landscape claims; we will fact-check them. Where evidence is thin, say "weak signal" rather than asserting.

## See also

- `knowledge/wiki/engineering/website_surface_data_plan.md` — the plan under test (§4).
- `knowledge/wiki/data/public_facing_data_catalog.md` — the full supply-side catalog (§3 is a digest).
- `knowledge/wiki/engineering/website_data_expansion_plan.md` — data-fetch companion.
- `docs/research/analytics-architecture-research-request.md` — sibling request; same format, different question.
