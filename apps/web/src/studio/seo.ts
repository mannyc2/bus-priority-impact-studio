const SITE_NAME = "Bus Priority Impact Studio";
const DEFAULT_DESCRIPTION =
  "Build evidence-backed NYC bus priority route pages, findings, and cited briefs from public transit data.";

export type StudioSeoMetadata = {
  title: string;
  description: string;
  canonicalPath: string;
  noindex?: boolean;
};

export type PublicStudioRoute = {
  path: string;
  label: string;
  expectedTitleText: string;
};

export const PUBLIC_STUDIO_ROUTES: readonly PublicStudioRoute[] = [
  { path: "/", label: "Home", expectedTitleText: "Bus Priority Impact Studio" },
  { path: "/routes", label: "Routes home", expectedTitleText: "Routes" },
  { path: "/search?q=manhattan+ace", label: "Search", expectedTitleText: "Search" },
  { path: "/routes/m15-sbs", label: "Route detail", expectedTitleText: "M15" },
  { path: "/routes/m15-sbs/ladder", label: "Route ladder", expectedTitleText: "M15" },
  { path: "/compare", label: "Compare", expectedTitleText: "Compare" },
  { path: "/findings", label: "Findings", expectedTitleText: "Findings" },
  {
    path: "/findings/m15-full-treatment-still-declining",
    label: "Finding detail",
    expectedTitleText: "Full treatment",
  },
  { path: "/briefs", label: "Briefs", expectedTitleText: "Briefs" },
  {
    path: "/briefs/m15-madison-corridor",
    label: "Brief reading",
    expectedTitleText: "Madison",
  },
  {
    path: "/briefs/m15-madison-corridor/evidence",
    label: "Brief evidence",
    expectedTitleText: "Evidence",
  },
  { path: "/docs", label: "Docs", expectedTitleText: "Docs" },
] as const;

const routeTitles = new Map([
  ["m15-sbs", "M15 SBS"],
  ["bx12-sbs", "Bx12 SBS"],
  ["m101", "M101"],
  ["b41", "B41"],
  ["b46-sbs", "B46 SBS"],
  ["q58", "Q58"],
  ["m14a-sbs", "M14A SBS"],
  ["m14d-sbs", "M14D SBS"],
]);

const findingTitles = new Map([
  ["m15-full-treatment-still-declining", "Full treatment stack, still declining"],
  ["b41-counter-pattern", "Speed declining alongside ridership"],
  ["bx12-ace-unchanged-violations", "ACE active with unchanged violations"],
  ["m101-lane-ends-slowness-begins", "Bus lane ends where slowness begins"],
  ["b46-split-corridor", "Split-corridor risk"],
  ["q58-three-year-decline", "Three-year decline"],
]);

const briefTitles = new Map([
  ["m15-madison-corridor", "The Madison corridor problem"],
  ["bx12-positive-control", "Bx12 SBS as positive control"],
]);

export function getStudioSeoMetadata(input: URL | string): StudioSeoMetadata | null {
  const url =
    typeof input === "string" ? new URL(input, "https://buspriorityimpact.studio") : input;
  const pathname = normalizePathname(url.pathname);

  if (pathname === "/") {
    return metadata(
      "Bus Priority Impact Studio",
      "Track every NYC bus route the city's speed-up program has touched — route by route, in plain numbers, from public MTA and NYC DOT data.",
      "/",
    );
  }

  if (pathname === "/routes") {
    return metadata(
      "Routes",
      "Search NYC bus routes and open evidence-backed route pages in Bus Priority Impact Studio.",
      "/routes",
    );
  }

  if (pathname === "/search") {
    const query = url.searchParams.get("q")?.trim() || "routes";
    return metadata(
      `Search: ${query}`,
      `Search Studio routes, findings, briefs, and methods for ${query}.`,
      `/search?q=${encodeURIComponent(query)}`,
    );
  }

  const routeDetailMatch = pathname.match(/^\/routes\/([^/]+)$/);
  if (routeDetailMatch) {
    const slug = routeDetailMatch[1] ?? "";
    const title = routeTitles.get(slug) ?? humanizeSlug(slug);
    return metadata(
      `${title} Route Detail`,
      `Review bus priority evidence, rider impact, slow segments, and intervention context for ${title}.`,
      pathname,
    );
  }

  const routeLadderMatch = pathname.match(/^\/routes\/([^/]+)\/ladder$/);
  if (routeLadderMatch) {
    const slug = routeLadderMatch[1] ?? "";
    const title = routeTitles.get(slug) ?? humanizeSlug(slug);
    return metadata(
      `${title} Route Ladder`,
      `Scan slow segments, rider-hour impact, and treatment coverage along the ${title} route spine.`,
      pathname,
    );
  }

  if (pathname === "/compare") {
    return metadata(
      "Compare Routes",
      "Compare route speed, rider-hour delay, lane coverage, and peer treatment context.",
      canonicalWithSearch(pathname, url, ["a", "b"]),
    );
  }

  if (pathname === "/findings") {
    return metadata(
      "Findings",
      "Review precomputed route findings with confidence, caveats, and evidence handoffs.",
      pathname,
    );
  }

  const findingMatch = pathname.match(/^\/findings\/([^/]+)$/);
  if (findingMatch) {
    const id = findingMatch[1] ?? "";
    const title = findingTitles.get(id) ?? humanizeSlug(id);
    return metadata(
      title,
      `Open the reasoning trail, route evidence, and caveats for the ${title} finding.`,
      pathname,
    );
  }

  if (pathname === "/briefs") {
    return metadata(
      "Briefs",
      "Read cited route evidence briefs with claims, caveats, and source-backed findings.",
      pathname,
    );
  }

  if (pathname === "/briefs/new") {
    return metadata(
      "New Brief",
      "Compose a cited route evidence brief from Studio route or finding context.",
      pathname,
      true,
    );
  }

  const briefMatch = pathname.match(/^\/briefs\/([^/]+)(?:\/(evidence|edit|review|history))?$/);
  if (briefMatch) {
    const id = briefMatch[1] ?? "";
    const section = briefMatch[2];
    const title = briefTitles.get(id) ?? humanizeSlug(id);
    const sectionTitle = section === undefined ? title : `${title} ${humanizeSlug(section)}`;

    return metadata(
      sectionTitle,
      briefDescription(title, section),
      pathname,
      section === "edit" || section === "review" || section === "history",
    );
  }

  if (pathname === "/docs") {
    return metadata(
      "Docs",
      "Read the Studio API quickstart, endpoint reference, CLI preview, changelog, and data credits.",
      pathname,
    );
  }

  if (pathname === "/system") {
    return metadata("Not Found", DEFAULT_DESCRIPTION, pathname, true);
  }

  return null;
}

export function injectSeoIntoHtml(
  html: string,
  metadata: StudioSeoMetadata,
  origin: string,
): string {
  const head = renderSeoHead(metadata, origin);
  if (html.includes("</head>")) {
    return html.replace("</head>", `${head}\n  </head>`);
  }

  return `${head}\n${html}`;
}

function metadata(
  title: string,
  description: string,
  canonicalPath: string,
  noindex?: boolean,
): StudioSeoMetadata {
  return {
    title: fullTitle(title),
    description,
    canonicalPath,
    ...(noindex ? { noindex } : {}),
  };
}

function fullTitle(title: string): string {
  return title === SITE_NAME ? SITE_NAME : `${title} | ${SITE_NAME}`;
}

function renderSeoHead(metadata: StudioSeoMetadata, origin: string): string {
  const canonicalUrl = new URL(metadata.canonicalPath, origin).toString();
  const robots = metadata.noindex ? `<meta name="robots" content="noindex,nofollow" />\n    ` : "";

  return `    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}" />
    <meta property="og:title" content="${escapeHtml(metadata.title)}" />
    <meta property="og:description" content="${escapeHtml(metadata.description)}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary" />
    ${robots}<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`;
}

function normalizePathname(pathname: string): string {
  if (pathname === "") return "/";
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function canonicalWithSearch(pathname: string, url: URL, keys: readonly string[]): string {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value !== null && value.trim().length > 0) {
      params.set(key, value);
    }
  }

  const search = params.toString();
  return search.length > 0 ? `${pathname}?${search}` : pathname;
}

function briefDescription(title: string, section: string | undefined): string {
  if (section === "evidence") {
    return `Inspect the source evidence, computation notes, and caveats behind ${title}.`;
  }

  if (section === "edit") {
    return `Edit claims, evidence, and caveats for the ${title} route brief.`;
  }

  if (section === "review") {
    return `Review comments and evidence changes for the ${title} route brief.`;
  }

  if (section === "history") {
    return `View the version history and evidence diffs for the ${title} route brief.`;
  }

  return `Read the cited claims, caveats, and route evidence for ${title}.`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
