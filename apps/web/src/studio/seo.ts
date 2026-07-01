import { routeTitles } from "./seo-manifest.gen.js";

const SITE_NAME = "Bus Priority Impact Studio";
const DEFAULT_DESCRIPTION =
  "Explore NYC bus route performance, slow segments, intervention timelines, and public-data methods in one route-first studio.";

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
  { path: "/", label: "Routes", expectedTitleText: "Bus Priority Impact Studio" },
  { path: "/routes/m15-sbs", label: "Route detail", expectedTitleText: "M15" },
  { path: "/map", label: "Map", expectedTitleText: "Network Map" },
  { path: "/interventions", label: "Interventions", expectedTitleText: "Interventions" },
  { path: "/methods", label: "Methods", expectedTitleText: "Methods" },
] as const;

export function getStudioSeoMetadata(input: URL | string): StudioSeoMetadata | null {
  const url =
    typeof input === "string" ? new URL(input, "https://buspriorityimpact.studio") : input;
  const pathname = normalizePathname(url.pathname);

  if (pathname === "/") {
    return metadata(
      "Bus Priority Impact Studio",
      "Track NYC bus route performance, slow segments, intervention timelines, and methods from public MTA and NYC DOT data.",
      "/",
    );
  }

  if (pathname === "/map") {
    return metadata(
      "Network Map",
      "Scan the route network for slow segments, priority corridors, and coverage gaps across the public bus-priority evidence set.",
      pathname,
    );
  }

  if (pathname === "/interventions") {
    return metadata(
      "Interventions",
      "Review bus-lane, ACE, and service-change timelines with before and after route context where public data supports it.",
      pathname,
    );
  }

  if (pathname === "/methods") {
    return metadata(
      "Methods",
      "Read how Bus Priority Impact Studio assembles route speeds, treatment records, coverage caveats, and serving projections.",
      pathname,
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
