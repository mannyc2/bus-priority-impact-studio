import type { SourceCoverageLedgerEntry } from "../audit/source-coverage.ts";
import type {
  StudioDocsSource,
  StudioFinding,
  StudioMethodDataset,
  StudioRouteArtifactRef,
} from "@bp/domain";
import type { StudioBrief, StudioRoute } from "./_release-types.ts";

function formatMonthRange(months: readonly string[]): string {
  if (months.length === 0) return "month unavailable";
  const first = months[0] ?? "month unavailable";
  const last = months.at(-1) ?? first;
  return first === last ? first : `${first} to ${last}`;
}

function generatedBriefSummary(route: StudioRoute): string {
  return `${route.label} has ${route.speedMph.toFixed(
    1,
  )} mph observed speed, ${route.riderHoursLost.toLocaleString(
    "en-US",
  )} route-slice delay exposure, and ${route.laneCoverage}% route-shape lane overlap in this Studio serving release.`;
}

type SourceDisplayMeta = {
  name: string;
  publisher: string;
  rowLabel: string;
  grain: string;
  cadence: string;
  description: string;
  schemaKeys: string[];
  method: string;
  sourceRefCount: number;
  use: string;
  sourceLinks: StudioDocsSource["sourceLinks"];
  periodFallback?: string;
};

const sourceDisplayMeta: Record<string, SourceDisplayMeta> = {
  route_month_trends: {
    name: "MTA route speed and ridership summaries",
    publisher: "MTA",
    rowLabel: "route-month rows",
    grain: "Route/month",
    cadence: "Monthly",
    description:
      "Route/month speed, ridership, and transfer trend rows generated from MTA public source data.",
    schemaKeys: ["route_id", "month", "average_speed_mph", "ridership", "has_speed_trend"],
    method: "route-month-trends",
    sourceRefCount: 4,
    use: "Canonical public monthly speed, ridership, transfer, and peer-speed trend evidence.",
    sourceLinks: [
      {
        label: "MTA Bus Route Segment Speeds 2023-2024",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-2023-2024/58t6-89vi",
      },
      {
        label: "MTA Bus Route Segment Speeds Beginning 2025",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-Beginning-2025/kufs-yh3x",
      },
      {
        label: "MTA Bus Hourly Ridership Beginning 2025",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Hourly-Ridership-Beginning-2025/gxb3-akrn",
      },
    ],
  },
  dot_street_permits: {
    name: "NYC DOT street permits",
    publisher: "NYC DOT",
    rowLabel: "permit rows",
    grain: "Street permit",
    cadence: "Open Data refresh",
    description: "Street construction and opening permit rows used for route-context evidence.",
    schemaKeys: ["permit_number", "issued_work_start_date", "physical_id", "permit_kind"],
    method: "context-event-route-touches",
    sourceRefCount: 2,
    use: "Permit-context findings and manual review evidence; not a causal slowdown claim by itself.",
    sourceLinks: [
      {
        label: "NYC DOT Street Construction Permits",
        url: "https://data.cityofnewyork.us/Transportation/Street-Construction-Permits/tqtj-sjs8",
      },
    ],
  },
  nypd_collisions: {
    name: "NYPD motor vehicle collisions",
    publisher: "NYPD",
    rowLabel: "collision rows",
    grain: "Crash record",
    cadence: "Open Data refresh",
    description: "Crash and disruption context near route hotspots and reliability findings.",
    schemaKeys: ["collision_id", "crash_date", "physical_id", "persons_injured"],
    method: "collision-context",
    sourceRefCount: 1,
    use: "Safety/disruption context for reviewed route findings.",
    sourceLinks: [
      {
        label: "NYPD Motor Vehicle Collisions",
        url: "https://data.cityofnewyork.us/Public-Safety/Motor-Vehicle-Collisions-Crashes/h9gi-nx95",
      },
    ],
  },
  ace_violation_summaries: {
    name: "ACE violation summaries",
    publisher: "MTA",
    rowLabel: "route/month/type rows",
    grain: "Route/month",
    cadence: "Monthly",
    description: "Automated Camera Enforcement program coverage and violation summary rows.",
    schemaKeys: ["route_id", "month", "violation_type", "violation_status", "violation_count"],
    method: "ace-context",
    sourceRefCount: 6,
    use: "Intervention context, treatment-gap findings, before/after reviews, and caveats.",
    sourceLinks: [
      {
        label: "ACE violations",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforcement-Violations-Be/kh8p-hcbm",
      },
    ],
  },
  dot_bus_lanes: {
    name: "NYC DOT bus lane inventory",
    publisher: "NYC DOT",
    rowLabel: "lane rows",
    grain: "Lane segment geometry",
    cadence: "Open Data refresh",
    description:
      "Bus-lane geometry inventory used for route-shape and segment-level lane-overlap evidence.",
    schemaKeys: ["segment_id", "street", "borough", "lane_type", "open_date"],
    method: "lane-overlap",
    sourceRefCount: 1,
    use: "Route and segment lane-overlap evidence; historical treatment timing remains caveated by source open-date coverage.",
    periodFallback: "Current inventory snapshot",
    sourceLinks: [
      {
        label: "NYC DOT Bus Lanes",
        url: "https://data.cityofnewyork.us/Transportation/Bus-Lanes/7juu-44ku",
      },
    ],
  },
  observed_reliability: {
    name: "Observed reliability summaries",
    publisher: "Bus Observatory / MTA Bus Time",
    rowLabel: "route reliability rows",
    grain: "Route/month",
    cadence: "Monthly",
    description:
      "Recovered and collected GTFS-RT reliability summaries for long-gap and bunching evidence.",
    schemaKeys: ["route_id", "month", "sample_count", "observed_long_gap_share"],
    method: "observed-reliability",
    sourceRefCount: 5,
    use: "Long gaps, bunching, expected wait, weather/control splits, and reliability detectors.",
    sourceLinks: [
      { label: "Bus Observatory", url: "https://api.busobservatory.org/nyct" },
      { label: "MTA Bus Time GTFS-RT", url: "https://www.mta.info/developers" },
    ],
  },
  bus_wait_assessment: {
    name: "MTA bus wait assessment",
    publisher: "MTA",
    rowLabel: "wait assessment rows",
    grain: "Route/month/period",
    cadence: "Monthly",
    description: "MTA wait-assessment rows used to cross-check observed reliability evidence.",
    schemaKeys: ["route_id", "month", "period", "wait_assessment"],
    method: "wait-assessment-cross-check",
    sourceRefCount: 1,
    use: "Reliability validation and caveats.",
    sourceLinks: [
      {
        label: "MTA Bus Wait Assessment",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Wait-Assessment-Beginning-2020/v4z4-2h6n",
      },
    ],
  },
  "311_service_requests": {
    name: "NYC 311 service requests",
    publisher: "NYC 311",
    rowLabel: "service request rows",
    grain: "Complaint/request",
    cadence: "Open Data refresh",
    description: "Complaint context for parking, blocked streets, signals, and street conditions.",
    schemaKeys: ["unique_key", "created_date", "complaint_type", "physical_id"],
    method: "service-request-context",
    sourceRefCount: 2,
    use: "Manual primary context for detector review packets; route joins carry caveats.",
    sourceLinks: [
      {
        label: "NYC 311 current requests",
        url: "https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-present/erm2-nwe9",
      },
      {
        label: "NYC 311 historical requests",
        url: "https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-2019/76ig-c548",
      },
    ],
  },
  parking_violations: {
    name: "NYC parking violations",
    publisher: "NYC Department of Finance",
    rowLabel: "bus-relevant violation rows",
    grain: "Violation",
    cadence: "Fiscal-year datasets",
    description: "Curb-pressure context from bus-lane, bus-stop, and camera-adjacent violations.",
    schemaKeys: ["summons_number", "issue_date", "violation_code", "physical_id"],
    method: "parking-context",
    sourceRefCount: 4,
    use: "Context only until candidate fanout, match weights, and low physical-ID geocoding are reviewed.",
    sourceLinks: [
      {
        label: "NYC Parking Violations FY2026",
        url: "https://data.cityofnewyork.us/City-Government/Parking-Violations-Issued-Fiscal-Year-2026/pvqr-7yc4",
      },
    ],
  },
  dot_traffic_volume_counts: {
    name: "NYC DOT traffic volume counts",
    publisher: "NYC DOT",
    rowLabel: "traffic volume rows",
    grain: "Street segment/hour",
    cadence: "Sampled release context",
    description: "Traffic-volume context used in route appendices and detector caveats.",
    schemaKeys: ["request_id", "segment_id", "sampled_at", "volume"],
    method: "traffic-volume-context",
    sourceRefCount: 1,
    use: "Traffic appendices and caveats; not automatic finding promotion.",
    sourceLinks: [
      {
        label: "NYC DOT Automated Traffic Volume Counts",
        url: "https://data.cityofnewyork.us/Transportation/Automated-Traffic-Volume-Counts/7ym2-wayt",
      },
    ],
  },
  dot_traffic_speeds: {
    name: "NYC DOT realtime traffic speeds",
    publisher: "NYC DOT",
    rowLabel: "traffic speed rows",
    grain: "Link/current snapshot",
    cadence: "Current signal",
    description: "Realtime traffic-speed rows used only as current-condition context.",
    schemaKeys: ["link_id", "sampled_at", "speed", "travel_time"],
    method: "current-traffic-speed-context",
    sourceRefCount: 1,
    use: "Current signal appendices; not historical release evidence.",
    sourceLinks: [
      {
        label: "NYC DOT Real-Time Traffic Speed Data",
        url: "https://data.cityofnewyork.us/Transportation/Real-Time-Traffic-Speed-Data/i4gi-tjb9",
      },
    ],
  },
  weather_observations: {
    name: "NOAA weather observations",
    publisher: "NOAA",
    rowLabel: "daily weather rows",
    grain: "Station/day",
    cadence: "Daily",
    description: "Weather controls for reliability splits and finding caveats.",
    schemaKeys: ["station_id", "date", "prcp_mm", "snow_mm", "awnd_ms"],
    method: "weather-control-context",
    sourceRefCount: 1,
    use: "Weather controls and caveats for reliability evidence.",
    sourceLinks: [
      {
        label: "NOAA GHCN-Daily",
        url: "https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/",
      },
    ],
  },
  equity_context: {
    name: "Equity and route context",
    publisher: "U.S. Census / NYC DCP",
    rowLabel: "route equity rows",
    grain: "Route/month",
    cadence: "Release",
    description: "ACS and geography-derived route context used for prioritization and caveats.",
    schemaKeys: ["route_id", "month", "no_vehicle_household_share", "poverty_rate"],
    method: "route-equity-context",
    sourceRefCount: 2,
    use: "Equity-priority context, borough/route joins, and source-coverage caveats.",
    sourceLinks: [
      {
        label: "Census ACS 5-year profile",
        url: "https://api.census.gov/data/2024/acs/acs5/profile",
      },
      {
        label: "NYC Centerline / LION",
        url: "https://data.cityofnewyork.us/City-Government/Centerline/inkn-q76z",
      },
    ],
  },
  nyc_dot_tsp_status_2017: {
    name: "NYC DOT TSP status report",
    publisher: "NYC DOT",
    rowLabel: "route status rows",
    grain: "Route/corridor snapshot",
    cadence: "Snapshot",
    description:
      "Captured Transit Signal Priority status snapshot used to distinguish installed, candidate, and unknown TSP source status.",
    schemaKeys: ["route_id", "tsp_status", "corridor", "source_date", "source_url"],
    method: "tsp-source-status",
    sourceRefCount: 1,
    use: "TSP route and segment source-status evidence with stale-source caveats.",
    sourceLinks: [
      {
        label: "NYC DOT Transit Signal Priority status report",
        url: "https://www.nyc.gov/html/dot/html/pr2017/pr17-055.shtml",
      },
    ],
  },
  generated_route_slice_artifacts: {
    name: "Generated route-slice artifacts",
    publisher: "Bus Priority Impact Studio",
    rowLabel: "artifact refs",
    grain: "Route/month/segment",
    cadence: "Release",
    description:
      "Precomputed route artifacts that power route detail, briefs, findings, segment rows, and public Studio projections.",
    schemaKeys: ["route_id", "month", "segment_id", "evidence_ref", "quality"],
    method: "studio-release",
    sourceRefCount: 12,
    use: "Generated serving projections, route briefs, segment evidence, and public docs examples.",
    sourceLinks: [],
  },
};

export function sourceHrefForSourceLink(
  sourceId: string,
  preferredLabelIncludes?: string,
): string {
  const links = sourceDisplayMeta[sourceId]?.sourceLinks ?? [];
  const selected =
    preferredLabelIncludes === undefined
      ? links[0]
      : (links.find((link) => link.label.includes(preferredLabelIncludes)) ?? links[0]);
  if (selected === undefined) {
    throw new Error(`Missing Studio source link for ${sourceId}.`);
  }
  return selected.url;
}

function artifactApiPath(key: string): string {
  return `/api/v1/artifacts/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function sourceMeta(sourceId: string): SourceDisplayMeta {
  const meta = sourceDisplayMeta[sourceId];
  if (meta === undefined) {
    throw new Error(`Missing Studio docs source metadata for ${sourceId}.`);
  }
  return meta;
}

function sourcePeriod(entry: SourceCoverageLedgerEntry, meta: SourceDisplayMeta): string {
  const { min, max } = entry.range;
  if (min === null || max === null) {
    return entry.rowCount > 0
      ? (meta.periodFallback ?? "No dated local rows")
      : "No dated local rows";
  }
  return min === max ? min : `${min} through ${max}`;
}

function roundedRate(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(4));
}

export function docsSourceFromLedgerEntry(entry: SourceCoverageLedgerEntry): StudioDocsSource {
  const meta = sourceMeta(entry.sourceId);

  return {
    sourceId: entry.sourceId,
    name: meta.name,
    publisher: meta.publisher,
    role: entry.role,
    decision: entry.decision,
    detectorEligibility: entry.evidence.detectorEligibility,
    rowCount: entry.rowCount,
    rowLabel: meta.rowLabel,
    period: sourcePeriod(entry, meta),
    monthCount: entry.range.monthCount,
    geocodeRate: roundedRate(entry.geocode.geocodeRate),
    joinRate: roundedRate(entry.join.joinRate),
    primaryEvidenceAllowed: entry.evidence.primaryEvidenceAllowed,
    automaticPromotionAllowed: entry.evidence.automaticPromotionAllowed,
    readinessStatus: entry.readiness.status,
    readinessReasons: entry.readiness.reasons,
    sourceLinks: meta.sourceLinks,
    use: meta.use,
  };
}

export function docsSourceFromGeneratedReleaseSource(input: {
  sourceId: string;
  rowCount: number;
  period: string;
  monthCount: number | null;
  role: StudioDocsSource["role"];
  decision: StudioDocsSource["decision"];
  detectorEligibility: StudioDocsSource["detectorEligibility"];
  primaryEvidenceAllowed: boolean;
  automaticPromotionAllowed: boolean;
  readinessStatus: StudioDocsSource["readinessStatus"];
  readinessReasons: string[];
}): StudioDocsSource {
  const meta = sourceMeta(input.sourceId);
  return {
    sourceId: input.sourceId,
    name: meta.name,
    publisher: meta.publisher,
    role: input.role,
    decision: input.decision,
    detectorEligibility: input.detectorEligibility,
    rowCount: input.rowCount,
    rowLabel: meta.rowLabel,
    period: input.period,
    monthCount: input.monthCount,
    geocodeRate: null,
    joinRate: null,
    primaryEvidenceAllowed: input.primaryEvidenceAllowed,
    automaticPromotionAllowed: input.automaticPromotionAllowed,
    readinessStatus: input.readinessStatus,
    readinessReasons: input.readinessReasons,
    sourceLinks: meta.sourceLinks,
    use: meta.use,
  };
}

export function methodDatasetsFromDocsSources(
  sources: readonly StudioDocsSource[],
): StudioMethodDataset[] {
  return sources.map((source) => {
    const meta = sourceMeta(source.sourceId);
    return {
      sourceId: source.sourceId,
      name: source.name,
      publisher: source.publisher,
      grain: meta.grain,
      cadence: meta.cadence,
      description: meta.description,
      rowCount: source.rowCount,
      rowLabel: source.rowLabel,
      period: source.period,
      schemaKeys: meta.schemaKeys,
      method: meta.method,
      sourceRefCount: meta.sourceRefCount,
    };
  });
}

export function docsSections(month: string) {
  return [
    {
      title: "Quickstart",
      body: [
        "Use the RESTful Studio API for route-first product data.",
        "D1 rows and R2 object keys are private serving details behind the Worker.",
      ],
      code: `fetch("/api/v1/studio/routes").then((res) => res.json())`,
    },
    {
      title: "Interventions and treatments",
      body: [
        "An intervention is a curated, source-backed change or proposed change to bus service, street priority, enforcement, boarding/fare policy, signal priority, stops, busways, or capital infrastructure. It must identify what changed, where, when or with what date status, which route/corridor it affects, and which source span supports it.",
        "The current manual registry has 30 curated intervention records. The Tier 2 document corpus has 939 generated evidence rows, but those are discovery/backlink rows until manually promoted; they are not 939 interventions.",
        "Treatments are as-of state snapshots, such as DOT bus-lane overlap, ACE route-month coverage, or TSP source status. Use /data/treatments for treatment state and /data/interventions for curated intervention records.",
      ],
    },
    {
      title: "Release data",
      body: [
        `The current generated Studio release is backed by the ${month} D1 serving export and route/brief artifacts.`,
        "Missing sections are represented with quality caveats rather than frontend fallbacks.",
      ],
    },
  ];
}

export function buildBrief(
  route: StudioRoute,
  finding: StudioFinding | undefined,
  generatedAt: string,
  routeArtifacts: readonly StudioRouteArtifactRef[],
): StudioBrief {
  const summary = generatedBriefSummary(route);
  const routeBriefArtifact = routeArtifacts.find((artifact) => artifact.name === "brief.json");
  const canonical =
    route.slug === "m15-sbs"
      ? {
          id: "m15-madison-corridor",
          title: "The Madison corridor problem",
          dek: "A generated evidence-ref brief on M15 SBS treatment context, slow segments, and route-slice delay exposure.",
        }
      : route.slug === "bx12-sbs"
        ? {
            id: "bx12-treatment-benchmark",
            title: "Bx12 SBS treatment benchmark",
            dek: "A route brief using Bx12 SBS as descriptive treatment context.",
          }
        : null;
  const tspDetail =
    route.tspStatus === "unknown"
      ? "No positive TSP evidence was found in the ingested 2017 NYC DOT TSP status report."
      : `${route.tspStatus === "installed" ? "Installed" : "Candidate"} TSP evidence from ${route.tspSource}${route.tspSourceDate === null ? "" : ` (${route.tspSourceDate})`}${route.tspCorridor === null ? "" : ` for ${route.tspCorridor}`}.`;
  const evidence: StudioBrief["evidence"] = [
    {
      id: "speed",
      kind: "number",
      title: "Observed speed",
      detail: `${route.speedMph.toFixed(1)} mph from D1 serving summaries.`,
      sourceRefId: "d1:route_brief_summary:average_speed_mph",
      sourceLabel: "D1 route_brief_summary.average_speed_mph",
      sourceHref: sourceHrefForSourceLink("route_month_trends", "Beginning 2025"),
    },
    {
      id: "rider_delay",
      kind: "number",
      title: "Route-slice delay exposure",
      detail: `${route.riderHoursLost.toLocaleString("en-US")} hours of passenger delay from route-slice observed-vs-scheduled travel time and ridership exposure.`,
      sourceRefId: "artifact:route_brief_input:schedule_ridership_exposure",
      sourceLabel: "Route brief input schedule/ridership exposure",
      sourceHref: sourceHrefForSourceLink("route_month_trends", "Hourly Ridership"),
      ...(routeBriefArtifact === undefined
        ? {}
        : {
            sourceArtifactKey: routeBriefArtifact.key,
            sourceArtifactHref: artifactApiPath(routeBriefArtifact.key),
            sourceArtifactSha256: routeBriefArtifact.sha256,
          }),
    },
    {
      id: "speed_trend",
      kind: "chart",
      title: "Observed speed values",
      detail: `${route.spark.length.toLocaleString("en-US")}-point observed-speed value set (${formatMonthRange(route.sparkMonths)}) ending at ${route.speedMph.toFixed(1)} mph: ${route.spark.join(" -> ")}.`,
      sourceRefId: "d1:route_month_trend:average_speed_mph",
      sourceLabel: "D1 route_month_trend.average_speed_mph",
      sourceHref: sourceHrefForSourceLink("route_month_trends", "Beginning 2025"),
    },
    {
      id: "lane_overlap",
      kind: "number",
      title: "DOT route-shape lane overlap",
      detail: `${route.laneCoverage}% route-shape lane overlap from current MTA route geometry joined to NYC DOT bus-lane geometry.`,
      sourceRefId: "source:nyc_dot_bus_lanes_geometry",
      sourceLabel: "NYC DOT bus-lane geometry",
      sourceHref: sourceHrefForSourceLink("dot_bus_lanes"),
    },
    {
      id: "tsp_status",
      kind: "source",
      title: "TSP source status",
      detail: tspDetail,
      sourceRefId: route.tspSource,
      sourceLabel:
        route.tspSource === "nyc_dot_tsp_status_2017"
          ? "NYC DOT 2017 TSP status report"
          : "No matched ingested TSP source",
      ...(route.tspSourceUrl === null ? {} : { sourceHref: route.tspSourceUrl }),
    },
    {
      id: "review_caveat",
      kind: "caveat",
      title: "Generated brief caveat",
      detail:
        canonical !== null
          ? "This canonical brief is generated from public serving projections and should be reviewed before external use."
          : "This route brief is generated from public serving projections and is not editorially reviewed.",
      sourceRefId: "policy:generated_brief_review_gate",
      sourceLabel: "Generated brief review gate",
    },
  ];
  const caveats: StudioBrief["caveats"] = [
    {
      id: "generated",
      title: "Generated route brief",
      body:
        canonical !== null
          ? "This canonical brief is generated from public serving projections and should be reviewed before external use."
          : "This route brief is generated from public serving projections and is not editorially reviewed.",
    },
  ];

  return {
    id: canonical?.id ?? `brief-${route.slug}`,
    routeSlug: route.slug,
    title: canonical?.title ?? `${route.label} ${route.corridor} reliability brief`,
    status: "Generated",
    version: "v1",
    generated: generatedAt,
    authors: ["Studio release builder"],
    evidenceRefCount: evidence.length,
    summary,
    dek:
      canonical?.dek ??
      `A source-backed route brief for ${route.label}, generated from the current serving release.`,
    kpis: [
      {
        label: "Observed speed",
        value: route.speedMph.toFixed(1),
        unit: "mph",
        sub: "D1 serving summary",
        tone: route.speedPercentile <= 40 ? "warn" : "neutral",
      },
      {
        label: "Route-slice delay exposure",
        value: route.riderHoursLost.toLocaleString("en-US"),
        sub: "Route-slice artifact",
        tone: route.riderHoursLost > 10_000 ? "bad" : "neutral",
      },
      {
        label: "Lane overlap",
        value: `${route.laneCoverage}`,
        unit: "%",
        sub: "Matched bus-lane rows",
        tone: route.laneCoverage > 50 ? "good" : "warn",
      },
    ],
    sections: [
      {
        title: "What changed",
        body: [
          summary,
          finding?.body ??
            "The route has a generated serving projection, but no finding crossed the publication threshold.",
        ],
      },
      {
        title: "Evidence",
        body: [
          "The route brief combines D1 serving metrics with route-slice artifacts generated by the Bun pipeline.",
          "Public API consumers should use /api/v1/studio/* resources rather than D1 rows or R2 object keys.",
        ],
      },
    ],
    claims: [
      {
        n: 1,
        title: `${route.label} averaged ${route.speedMph.toFixed(1)} mph in the serving release`,
        strength: route.speedPercentile <= 40 ? 82 : 64,
        evidenceIds: ["speed", "rider_delay", "speed_trend"],
        caveatIds: ["generated"],
        state: "active",
      },
      {
        n: 2,
        title: `${route.label} has ${route.laneCoverage}% route-shape lane overlap`,
        strength: 70,
        evidenceIds: ["lane_overlap", "tsp_status"],
        caveatIds: ["generated"],
        state: "active",
      },
    ],
    evidence,
    caveats,
  };
}

export function assertGeneratedBriefReferenceIntegrity(briefs: readonly StudioBrief[]): void {
  const errors: string[] = [];
  for (const brief of briefs) {
    const evidenceIds = new Set<string>();
    const caveatIds = new Set<string>();
    for (const evidence of brief.evidence) {
      if (evidenceIds.has(evidence.id)) {
        errors.push(`${brief.id} has duplicate evidence ID ${evidence.id}.`);
      }
      evidenceIds.add(evidence.id);
      if (evidence.kind !== "caveat" && evidence.sourceRefId === undefined) {
        errors.push(`${brief.id} evidence ${evidence.id} is missing sourceRefId.`);
      }
      if (evidence.kind !== "caveat" && evidence.sourceLabel === undefined) {
        errors.push(`${brief.id} evidence ${evidence.id} is missing sourceLabel.`);
      }
    }
    for (const caveat of brief.caveats) {
      if (caveatIds.has(caveat.id)) {
        errors.push(`${brief.id} has duplicate caveat ID ${caveat.id}.`);
      }
      caveatIds.add(caveat.id);
    }
    if (brief.evidenceRefCount !== brief.evidence.length) {
      errors.push(
        `${brief.id} evidenceRefCount ${brief.evidenceRefCount} does not match ${brief.evidence.length} evidence rows.`,
      );
    }
    for (const claim of brief.claims) {
      for (const evidenceId of claim.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) {
          errors.push(`${brief.id} claim ${claim.n} references missing evidence ID ${evidenceId}.`);
        }
      }
      for (const caveatId of claim.caveatIds) {
        if (!caveatIds.has(caveatId)) {
          errors.push(`${brief.id} claim ${claim.n} references missing caveat ID ${caveatId}.`);
        }
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`Generated Studio brief references failed validation:\n${errors.join("\n")}`);
  }
}
