/**
 * Temporary reviewed reconciliation decisions — the explicit exception table.
 *
 * A public episode may only exist because a reviewer decided it exists. There
 * are exactly two kinds of reviewed decision:
 *
 *   1. a producer-approved operational occurrence (`REVIEWED_OCCURRENCES`), and
 *   2. an entry in this table.
 *
 * Every entry names the exact source record ids it covers. Nothing here is
 * derived from title text, date proximity or treatment family: where a reviewer
 * could not confirm that two records describe one real-world change, the record
 * goes in `unresolved` and is withheld from the public projection rather than
 * merged. This table is deliberately bounded to the six review routes; it is a
 * demonstration of the mechanism, not a corpus-wide pass.
 *
 * Reviewed 2026-07-27 against the coherent route-evidence and operational
 * occurrence release `v1-rc25`; every decision repeats the immutable manifest
 * pin and the builder rejects it as stale when either input changes.
 */

export type ReviewedRouteRole = "introduced" | "changed" | "affected" | "continued";

export type ReviewedPhase = "launched" | "changed" | "switched_on" | "warning_period";

export type ReviewedDatePrecision = "day" | "month" | "season" | "year" | "range";

export type ReviewedRouteRelation = {
  routeId: string;
  role: ReviewedRouteRole;
  /** Records that establish this exact route's relationship to the change. */
  recordIds: readonly string[];
};

export type ReviewedRecordNote = { recordId: string; note: string };

export type ReviewedReconciliation = {
  decisionId: string;
  /** Stable across a later handoff from this table to an upstream occurrence. */
  publicEpisodeId: string;
  reviewer: string;
  reviewedOn: string;
  validForOccurrenceRelease: {
    releaseId: string;
    manifestSha256: string;
  };
  replacementState: "active" | "shadowed_by_upstream" | "stale" | "conflicted";
  reviewerNote: string;
  /**
   * When set, this decision extends the episode that occurrence already
   * defines rather than minting a second identity for the same change.
   */
  attachesToOccurrenceId: string | null;
  title: string;
  summary: string;
  phase: ReviewedPhase;
  lifecycle: "in_place" | "ended";
  kindKeys: readonly string[];
  date: { value: string; precision: ReviewedDatePrecision; end: string | null };
  routes: readonly ReviewedRouteRelation[];
  componentRecordIds: readonly string[];
  citedSourceIds: readonly string[];
  caveat: string | null;
  studyEventKey: string | null;
  includedRecordIds: readonly string[];
  supportingRecordIds: readonly string[];
  excludedRecords: readonly ReviewedRecordNote[];
  unresolvedRecords: readonly ReviewedRecordNote[];
};

/**
 * Records reviewed as describing a citywide programme rather than a change on
 * the route they are projected onto. The camera-enforcement programme records
 * below appear byte-identical on M15-SBS, B44-SBS and Bx38 — one of them even
 * carries M15 in its own identifier while sitting on the Bx38 bundle. None of
 * them may become a change on any of those routes.
 */
export const PROGRAMME_SCOPED_RECORD_IDS: readonly string[] = [
  "event_able-established-2019",
  "event_ace-expansion-manhattan-apr2025",
  "event_ace-implementation-may-2024",
  "event_m15-sbs-ace-launch-oct2019",
  "event_meeting-doc-186616-ace-routes-activated-sep15-2025",
  "event_tremont-ace-cameras-operative",
];

/**
 * Occurrence-derived episodes whose composed title or phase would misstate the
 * change. Each override is a reviewed correction, not a copy preference.
 */
export const REVIEWED_EPISODE_OVERRIDES: readonly {
  occurrenceId: string;
  title?: string;
  summary?: string;
  phase?: ReviewedPhase;
  caveat?: string;
  reviewerNote: string;
}[] = [
  {
    occurrenceId: "occurrence:1ed365a241353614f72f025e",
    title: "Camera enforcement warning period began on B60, B68 and M57",
    summary:
      "Cameras started watching the bus lanes on all three routes, issuing warnings for blocked lanes, blocked stops and double parking.",
    phase: "warning_period",
    caveat:
      "During a warning period drivers receive notices instead of fines. Enforcement starts after it ends.",
    reviewerNote:
      "The source describes a 60-day warning period. Composing this as an enforcement start would overstate it.",
  },
  {
    occurrenceId: "occurrence:09a7c0cfcac97e1a2651695b",
    title: "Camera enforcement began on Bx20, Bx3 and Bx7",
    summary:
      "Cameras began enforcing the bus lanes all three routes run in, after a 60-day warning period.",
    caveat: "The same activation also covered the Q6, which is listed separately in the source.",
    reviewerNote:
      "The source names four routes; the approved occurrence carries three. The fourth is disclosed rather than added.",
  },
];

export const REVIEWED_RECONCILIATIONS: readonly ReviewedReconciliation[] = [
  {
    decisionId: "reconciliation:m15-first-and-second-avenues-sbs-launch",
    publicEpisodeId: "ep_933f51855246bc5c",
    reviewer: "Bus Priority Impact Studio review",
    reviewedOn: "2026-07-27",
    validForOccurrenceRelease: {
      releaseId: "v1-rc25",
      manifestSha256: "77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f",
    },
    replacementState: "active",
    reviewerNote:
      "Eleven route-evidence records assert the same M15-SBS launch: five at exact-day precision and six restating October 2010. The approved occurrence already fixes the date and the fare component, so this decision attaches the remaining records to that episode instead of creating a second one. The November records are a distinct later phase and are excluded.",
    attachesToOccurrenceId: "occurrence:b45f5df36b98c638d8052c7a",
    title: "Select Bus Service began on the M15",
    summary:
      "Select Bus Service started on First and Second Avenues, with fares paid at the kerb before boarding instead of on the bus.",
    phase: "launched",
    lifecycle: "in_place",
    kindKeys: ["select_bus_service", "fares"],
    date: { value: "2010-10-10", precision: "day", end: null },
    routes: [
      {
        routeId: "M15+",
        role: "introduced",
        recordIds: ["event_m15-sbs-launch-2010-10-10"],
      },
    ],
    componentRecordIds: ["treatment_off-board-fare-collection-m15-sbs"],
    citedSourceIds: ["201111_1st2nd_progress_report", "2011_05_02_brt_1st2nd_cb6"],
    caveat: null,
    studyEventKey: null,
    includedRecordIds: ["event_m15-sbs-launch-2010-10-10"],
    supportingRecordIds: [
      "event_first-second-ave-sbs-start",
      "event_m15-sbs-launch",
      "event_m15-sbs-launch-2010-10-10_2",
      "event_m15-sbs-launch-20101010",
      "event_m15-sbs-launch-oct-10-2010",
      "event_m15-sbs-launch-oct-10-2010_2",
      "event_m15-sbs-launch-october-2010",
      "event_sbs-launch-october-2010",
      "event_service-launch-october-2010",
    ],
    excludedRecords: [
      {
        recordId: "event_bus-shelters-fare-machines-sep-2010",
        note: "September 2010 installation work that preceded the launch, not the launch itself.",
      },
      {
        recordId: "event_phase1-sbs-implementation-2010-11",
        note: "A November 2010 phase distinct from the October launch.",
      },
      {
        recordId: "event_phase1-sbs-service-begins-nov2010",
        note: "A November 2010 phase distinct from the October launch.",
      },
      {
        recordId: "event_video-enforcement-nov-2010",
        note: "Announces future camera enforcement; it is not a dated change.",
      },
    ],
    unresolvedRecords: [],
  },
  {
    decisionId: "reconciliation:bx41-webster-avenue-roadway-work",
    publicEpisodeId: "ep_41ca59de5c7252b2",
    reviewer: "Bus Priority Impact Studio review",
    reviewedOn: "2026-07-27",
    validForOccurrenceRelease: {
      releaseId: "v1-rc25",
      manifestSha256: "77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f",
    },
    replacementState: "active",
    reviewerNote:
      "The community-board records date the Webster Avenue roadway work to late March through May 2013 and describe it as one programme of lane, median and turn work. It is dated as an interval because the source states one.",
    attachesToOccurrenceId: null,
    title: "Webster Avenue rebuilt for buses",
    summary:
      "Offset bus lanes, red lane paint, new medians and banned left turns were built along Webster Avenue ahead of Select Bus Service.",
    phase: "changed",
    lifecycle: "in_place",
    kindKeys: ["bus_lane", "street_design"],
    date: { value: "2013-03-20", precision: "range", end: "2013-05-31" },
    routes: [
      {
        routeId: "BX41",
        role: "changed",
        recordIds: ["event_2014-03-05-phase1-roadway"],
      },
    ],
    componentRecordIds: [
      "treatment_2013-03-sbs-webster-offset-bus-lanes",
      "treatment_red-bus-lane-paint-webster-2013",
      "treatment_medians-2013",
      "treatment_2013-03-sbs-webster-banned-left-turns",
    ],
    citedSourceIds: [
      "2013_02_sbs_webster_bx_cb4",
      "2013_03_sbs_webster_bx_cb7",
      "2014_03_05_brt_webster_cb4",
      "2014_04_10_brt_webster_cb7",
    ],
    caveat: null,
    studyEventKey: null,
    includedRecordIds: ["event_2014-03-05-phase1-roadway"],
    supportingRecordIds: [
      "event_2013-03-sbs-webster-2013-construction",
      "event_2013-implementation-late-march-to-may",
      "event_phase1-roadway-improvements-2014-03-11",
      "event_phase1-spring-2013-improvements",
      "event_webster-sbs-2013-implementation-late-march-may",
    ],
    excludedRecords: [],
    unresolvedRecords: [],
  },
  {
    decisionId: "reconciliation:bx41-webster-avenue-sbs-launch",
    publicEpisodeId: "ep_9928ea3de4beb5cc",
    reviewer: "Bus Priority Impact Studio review",
    reviewedOn: "2026-07-27",
    validForOccurrenceRelease: {
      releaseId: "v1-rc25",
      manifestSha256: "77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f",
    },
    replacementState: "active",
    reviewerNote:
      "Fourteen records assert the Bx41 Select Bus Service launch: seven at 30 June 2013 and seven restating June 2013. Two of them carry 2014 dates inside their own identifiers while normalising to June 2013, which is source noise rather than a second change. The exact day is the better-attested onset.",
    attachesToOccurrenceId: null,
    title: "Select Bus Service began on the Bx41",
    summary:
      "Select Bus Service started along Webster Avenue, with fare machines at the kerb and rebuilt boarding islands at the busiest stops.",
    phase: "launched",
    lifecycle: "in_place",
    kindKeys: ["select_bus_service", "fares", "stops"],
    date: { value: "2013-06-30", precision: "day", end: null },
    routes: [
      {
        routeId: "BX41",
        role: "introduced",
        recordIds: ["event_bx41-sbs-launch-2013-06-30"],
      },
    ],
    componentRecordIds: [
      "treatment_2013-03-sbs-webster-offboard-fare",
      "treatment_2013-03-sbs-webster-bus-bulbs",
    ],
    citedSourceIds: ["2013_03_sbs_webster_bx_cb7", "2014_03_01_brt_webster_sbs_newsletter"],
    caveat: null,
    studyEventKey: null,
    includedRecordIds: ["event_bx41-sbs-launch-2013-06-30"],
    supportingRecordIds: [
      "event_2013-03-sbs-webster-start-of-service",
      "event_2013-june-implementation-fare-machines-bus-stops",
      "event_2014-03-05-bx41-sbs-launch",
      "event_bx41-sbs-launch-2013-06-30_2",
      "event_bx41-sbs-launch-2013-06-30_3",
      "event_bx41-sbs-launch-2013-06-30_4",
      "event_bx41-sbs-launch-20130630",
      "event_bx41-sbs-launch-2014-03-11",
      "event_bx41-sbs-start-service-2013",
      "event_sbs-start-of-service-2013-06-webster",
      "event_sbs-start-of-service-june-2013",
      "event_start-of-service-webster-sbs-june-2013",
      "event_webster-sbs-start-of-service-2013",
    ],
    excludedRecords: [],
    unresolvedRecords: [],
  },
  {
    decisionId: "reconciliation:bx41-webster-avenue-signal-priority",
    publicEpisodeId: "ep_6ab9779258c26ec0",
    reviewer: "Bus Priority Impact Studio review",
    reviewedOn: "2026-07-27",
    validForOccurrenceRelease: {
      releaseId: "v1-rc25",
      manifestSha256: "77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f",
    },
    replacementState: "active",
    reviewerNote:
      "Four records place signal priority on Webster Avenue in summer 2014, a year after the launch. It is a separate change and keeps its own season-long interval.",
    attachesToOccurrenceId: null,
    title: "Traffic signals began holding green for Bx41 buses",
    summary:
      "Signal priority was installed along Webster Avenue, letting approaching buses hold a green light.",
    phase: "changed",
    lifecycle: "in_place",
    kindKeys: ["signal_priority"],
    date: { value: "2014-summer", precision: "season", end: null },
    routes: [
      {
        routeId: "BX41",
        role: "changed",
        recordIds: ["event_tsp-summer-2014"],
      },
    ],
    componentRecordIds: ["treatment_2013-03-sbs-webster-tsp"],
    citedSourceIds: ["2014_03_05_brt_webster_cb4", "2014_03_20_brt_webste_cb5"],
    caveat: null,
    studyEventKey: null,
    includedRecordIds: ["event_tsp-summer-2014"],
    supportingRecordIds: [
      "event_2014-03-05-tsp",
      "event_summer-2014-transit-signal-priority",
      "event_tsp-summer-2014-2014-03-11",
    ],
    excludedRecords: [],
    unresolvedRecords: [],
  },
  {
    decisionId: "reconciliation:bx41-webster-avenue-pedestrian-islands",
    publicEpisodeId: "ep_6a2738f5ca577d6c",
    reviewer: "Bus Priority Impact Studio review",
    reviewedOn: "2026-07-27",
    validForOccurrenceRelease: {
      releaseId: "v1-rc25",
      manifestSha256: "77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f",
    },
    replacementState: "active",
    reviewerNote:
      "A single dated record, kept as its own change because nothing ties it to the 2013 programme.",
    attachesToOccurrenceId: null,
    title: "Pedestrian islands added on Webster Avenue",
    summary: "Crossing islands were built on Webster Avenue at Bx41 stops.",
    phase: "changed",
    lifecycle: "in_place",
    kindKeys: ["street_design"],
    date: { value: "2020-spring", precision: "season", end: null },
    routes: [
      {
        routeId: "BX41",
        role: "changed",
        recordIds: ["event_webster-pedestrian-island-spring2020"],
      },
    ],
    componentRecordIds: ["treatment_2014-03-05-ped-safety-islands"],
    citedSourceIds: ["bx_cb5_projects_dec032019"],
    caveat: null,
    studyEventKey: null,
    includedRecordIds: ["event_webster-pedestrian-island-spring2020"],
    supportingRecordIds: [],
    excludedRecords: [],
    unresolvedRecords: [],
  },
  {
    decisionId: "reconciliation:b44-nostrand-and-rogers-sbs-launch",
    publicEpisodeId: "ep_8f3213eb58e91ddc",
    reviewer: "Bus Priority Impact Studio review",
    reviewedOn: "2026-07-27",
    validForOccurrenceRelease: {
      releaseId: "v1-rc25",
      manifestSha256: "77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f",
    },
    replacementState: "active",
    reviewerNote:
      "The launch records sit only on B44-SBS; the B44 local bundle does not carry them, which is the exact-identity contract working. The local route is related to the same change because a typed record documents local stops kept on the same block as the new SBS stops. The 2012 and summer-2013 records are earlier target dates for this launch, but nothing in the source confirms they restate it rather than record a schedule that slipped, so they are withheld rather than merged.",
    attachesToOccurrenceId: null,
    title: "Select Bus Service began on the B44",
    summary:
      "Select Bus Service started on Nostrand and Rogers Avenues alongside the existing local route, with offset bus lanes, kerbside fare machines and rebuilt boarding islands.",
    phase: "launched",
    lifecycle: "in_place",
    kindKeys: ["select_bus_service", "bus_lane", "fares", "stops"],
    date: { value: "2013-11-17", precision: "day", end: null },
    routes: [
      {
        routeId: "B44+",
        role: "introduced",
        recordIds: ["event_b44-sbs-launch-2013", "event_nostrand-rogers-sbs-start"],
      },
      {
        routeId: "B44",
        role: "continued",
        recordIds: ["treatment_local-bus-stops-same-block-201011"],
      },
    ],
    componentRecordIds: [
      "treatment_bus-lanes-b44-sbs-2016",
      "treatment_off-board-fare_2",
      "treatment_bus-bulbs_4",
      "treatment_reroute-rogers-ave",
    ],
    citedSourceIds: [
      "b44_sbs_progress_report_2016",
      "brt_nostrand_progress_report_june2016",
      "brt_route_index",
    ],
    caveat: null,
    studyEventKey: null,
    includedRecordIds: ["event_b44-sbs-launch-2013"],
    supportingRecordIds: [
      "event_b44-sbs-launch",
      "event_b44-sbs-launch_2",
      "event_nostrand-rogers-sbs-start",
    ],
    excludedRecords: [
      {
        recordId: "event_nostrand-rogers-sbs-identified-2008",
        note: "Records that the corridor was chosen for the programme, five years before anything changed.",
      },
    ],
    unresolvedRecords: [
      {
        recordId: "event_sbs-implementation-2012",
        note: "An earlier implementation year for the same corridor; cannot be confirmed as a restatement of the 2013 launch.",
      },
      {
        recordId: "event_sbs-implementation-2012_2",
        note: "An earlier implementation year for the same corridor; cannot be confirmed as a restatement of the 2013 launch.",
      },
      {
        recordId: "event_sbs-implementation-2012-nostrand",
        note: "A winter 2012 implementation target; cannot be confirmed as a restatement of the 2013 launch.",
      },
      {
        recordId: "event_service-start-late-2012",
        note: "A late-2012 service-start date for the same corridor; may be a superseded target or a separate phase.",
      },
      {
        recordId: "event_start-service-late2012",
        note: "A late-2012 service-start date for the same corridor; may be a superseded target or a separate phase.",
      },
      {
        recordId: "event_nostrand-sbs-service-start-201011",
        note: "A winter 2012 service-start date for the same corridor; may be a superseded target or a separate phase.",
      },
      {
        recordId: "event_start-of-sbs-service-winter-2012",
        note: "A winter 2012 service-start date for the same corridor; may be a superseded target or a separate phase.",
      },
      {
        recordId: "event_start-sbs-service-2012",
        note: "A winter 2012 service-start date for the same corridor; may be a superseded target or a separate phase.",
      },
      {
        recordId: "event_start-sbs-service-2012-winter",
        note: "A winter 2012 service-start date for the same corridor; may be a superseded target or a separate phase.",
      },
      {
        recordId: "event_sbs-start-of-service-nostrand-2013",
        note: "A summer 2013 service-start target that the November launch appears to supersede, unconfirmed.",
      },
    ],
  },
  {
    decisionId: "reconciliation:q52-woodhaven-bus-lanes",
    publicEpisodeId: "ep_6a99bf008663f03c",
    reviewer: "Bus Priority Impact Studio review",
    reviewedOn: "2026-07-27",
    validForOccurrenceRelease: {
      releaseId: "v1-rc25",
      manifestSha256: "77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f",
    },
    replacementState: "active",
    reviewerNote:
      "Three records report the same August 2015 bus-lane installation on Woodhaven Boulevard, two years before Select Bus Service reached the corridor.",
    attachesToOccurrenceId: null,
    title: "Bus lanes installed on Woodhaven Boulevard",
    summary:
      "Bus-only lanes were installed on Woodhaven Boulevard between Dry Harbor Road and Metropolitan Avenue.",
    phase: "changed",
    lifecycle: "in_place",
    kindKeys: ["bus_lane"],
    date: { value: "2015-08", precision: "month", end: null },
    routes: [
      {
        routeId: "Q52+",
        role: "changed",
        recordIds: ["event_bus-lanes-installed-aug-2015"],
      },
    ],
    componentRecordIds: [],
    citedSourceIds: ["brt_woodhaven_cb9_sept2016"],
    caveat: null,
    studyEventKey: null,
    includedRecordIds: ["event_bus-lanes-installed-aug-2015"],
    supportingRecordIds: [
      "event_bus-lanes-installed-aug2015",
      "event_bus-lanes-installed-aug2015_3",
    ],
    excludedRecords: [],
    unresolvedRecords: [],
  },
  {
    decisionId: "reconciliation:q52-q53-woodhaven-and-cross-bay-sbs-launch",
    publicEpisodeId: "ep_e8977fb40ea03a12",
    reviewer: "Bus Priority Impact Studio review",
    reviewedOn: "2026-07-27",
    validForOccurrenceRelease: {
      releaseId: "v1-rc25",
      manifestSha256: "77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f",
    },
    replacementState: "active",
    reviewerNote:
      "One launch, two exact services. The Q52-SBS bundle carries both dated records; Q53-SBS is related through the same records because the source names both routes. The 2017 year-precision and autumn-2017 records are proposals and targets for this launch, so they are excluded rather than drawn as extra changes.",
    attachesToOccurrenceId: null,
    title: "Select Bus Service began on the Q52 and Q53",
    summary:
      "Select Bus Service started along Woodhaven and Cross Bay Boulevards, with bus lanes for most of the corridor and fares paid before boarding.",
    phase: "launched",
    lifecycle: "in_place",
    kindKeys: ["select_bus_service", "bus_lane", "fares"],
    date: { value: "2017-11-12", precision: "day", end: null },
    routes: [
      {
        routeId: "Q52+",
        role: "introduced",
        recordIds: ["event_q52-q53-sbs-launch-nov2017_2"],
      },
      {
        routeId: "Q53+",
        role: "introduced",
        recordIds: ["event_q52-q53-sbs-launch-nov2017_2"],
      },
    ],
    componentRecordIds: [
      "treatment_bus-lanes-woodhaven-cross-bay-2017",
      "treatment_fare-payment-woodhaven-2016",
    ],
    citedSourceIds: ["brt_woodhaven_after_fall2018", "brt_woodhaven_implementation_update_2017"],
    caveat: null,
    studyEventKey: null,
    includedRecordIds: ["event_q52-q53-sbs-launch-nov2017_2"],
    supportingRecordIds: ["event_sbs-launch-nov12-2017"],
    excludedRecords: [
      {
        recordId: "event_implementation-2017",
        note: "A planned implementation year, not a dated change.",
      },
      {
        recordId: "event_phase1-short-term-improvements-2017",
        note: "A planned first phase, not a dated change.",
      },
      {
        recordId: "event_sbs-launch-2017",
        note: "A proposed 2017 launch year, superseded by the dated launch.",
      },
      {
        recordId: "event_sbs-launch-2017_2",
        note: "A proposed 2017 launch year, superseded by the dated launch.",
      },
      {
        recordId: "event_sbs-service-launch-2017",
        note: "A proposed 2017 launch year, superseded by the dated launch.",
      },
      {
        recordId: "event_sbs-service-starts-woodhaven-2017",
        note: "A proposed 2017 launch year, superseded by the dated launch.",
      },
      {
        recordId: "event_fall-2017-sbs-launch-cb14-2017",
        note: "An autumn 2017 launch target, superseded by the dated launch.",
      },
      {
        recordId: "event_sbs-launch-fall2017",
        note: "An autumn 2017 launch target, superseded by the dated launch.",
      },
    ],
    unresolvedRecords: [],
  },
  {
    decisionId: "reconciliation:bx38-camera-enforcement",
    publicEpisodeId: "ep_d1d067af62b8697a",
    reviewer: "Bus Priority Impact Studio review",
    reviewedOn: "2026-07-27",
    validForOccurrenceRelease: {
      releaseId: "v1-rc25",
      manifestSha256: "77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f",
    },
    replacementState: "active",
    reviewerNote:
      "The Bx38 activation is a deterministic registry row, and the published study for this route is joined to it on that exact registry event id. The route's own evidence bundle carries only citywide programme records, none of which may stand in for the activation.",
    attachesToOccurrenceId: null,
    title: "Camera enforcement began on the Bx38",
    summary:
      "Cameras began enforcing the bus lanes the Bx38 runs in, first from fixed locations and then from the buses themselves.",
    phase: "switched_on",
    lifecycle: "in_place",
    kindKeys: ["camera_enforcement"],
    date: { value: "2024-09-16", precision: "day", end: null },
    routes: [
      {
        routeId: "BX38",
        role: "affected",
        recordIds: ["ace:BX38:ACE:2024-09-16"],
      },
    ],
    componentRecordIds: [],
    citedSourceIds: ["mta_ace_routes"],
    caveat: null,
    studyEventKey: "study-event-6afced32d375c2933f5344f9",
    includedRecordIds: ["ace:BX38:ACE:2024-09-16"],
    supportingRecordIds: [],
    excludedRecords: [],
    unresolvedRecords: [],
  },
];
