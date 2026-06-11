// Tier 2 discovery step, extracted from the former _shared.ts monolith during
// the per-step decomposition. Crawls seed pages for linked source documents,
// classifies candidates, and writes the discovery artifact + discovered
// backlog. Imports shared types, HTML/backlog/path helpers, and CLI helpers
// from the core module; the core module never imports back here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { writeJson } from "../../../lib/json.ts";
import {
  captureManifestPath,
  DEFAULT_BACKLOG_PATH,
  discoveredBacklogPath,
  discoveryPath,
  latestDocsRunId,
  parseCliOptions,
  readBacklog,
  shortHash,
  stripHtmlToText,
  type CliOption,
  type DiscoverCliArgs,
  type DiscoverTier2DocsArgs,
  type DiscoveryClassification,
  type ExpectedContentType,
  type OcrHint,
  type Tier2Backlog,
  type Tier2BacklogSource,
  type Tier2CaptureManifest,
  type Tier2CapturedSource,
  type Tier2DiscoveredSource,
  type Tier2DiscoveryArtifact,
  type Tier2ExcludedDiscoveryLink,
} from "./_shared.ts";

function stripHtmlInline(html: string): string {
  return stripHtmlToText(html).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\dA-Za-z]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return slug.length === 0 ? "source" : slug.slice(0, 96).replace(/_+$/g, "");
}

function normalizeDiscoveredUrl(href: string, baseUrl: string): string | null {
  const trimmedHref = decodeHtmlEntities(href);
  if (
    trimmedHref.length === 0 ||
    trimmedHref.startsWith("#") ||
    trimmedHref.startsWith("mailto:") ||
    trimmedHref.startsWith("tel:") ||
    trimmedHref.startsWith("javascript:")
  ) {
    return null;
  }

  try {
    const url = new URL(trimmedHref, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.hostname === "www1.nyc.gov") {
      url.hostname = "www.nyc.gov";
    }
    if (
      url.protocol === "http:" &&
      (url.hostname === "nyc.gov" ||
        url.hostname === "www.nyc.gov" ||
        url.hostname.endsWith(".mta.info") ||
        url.hostname === "mta.info")
    ) {
      url.protocol = "https:";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extractHtmlLinks(
  html: string,
  source: Tier2CapturedSource,
): {
  href: string;
  normalizedUrl: string | null;
  anchorText: string;
}[] {
  const links: {
    href: string;
    normalizedUrl: string | null;
    anchorText: string;
  }[] = [];
  const anchorRegex = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match = anchorRegex.exec(html);
  while (match !== null) {
    const href = match[2] ?? "";
    const anchorText = stripHtmlInline(match[3] ?? "");
    links.push({
      href,
      normalizedUrl: normalizeDiscoveredUrl(href, source.finalUrl),
      anchorText,
    });
    match = anchorRegex.exec(html);
  }
  return links;
}

function isIgnoredAssetUrl(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return /\.(css|js|jpg|jpeg|png|gif|svg|ico|webp|zip|csv|xlsx?)$/i.test(path);
}

function classifyDiscoveryCandidate(input: {
  url: string;
  anchorText: string;
}): DiscoveryClassification {
  const parsed = new URL(input.url);
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const text = input.anchorText.toLowerCase();
  const combined = `${path} ${text}`;

  if (isIgnoredAssetUrl(parsed)) {
    return { include: false, reason: "ignored_asset" };
  }

  const isNycDot =
    host === "www.nyc.gov" ||
    host === "nyc.gov" ||
    (host === "www1.nyc.gov" && path.includes("/html/dot/"));
  const isMta = host === "www.mta.info" || host === "mta.info" || host.endsWith(".mta.info");
  const isSocrata = host === "data.ny.gov" || host === "data.cityofnewyork.us";
  const isLinkedMonitoringReport =
    host === "www.tylin.com" && path.endsWith(".pdf") && combined.includes("14");

  if (!isNycDot && !isMta && !isSocrata && !isLinkedMonitoringReport) {
    return { include: false, reason: "outside_official_scope" };
  }

  let expectedContentType: ExpectedContentType = "unknown";
  let ocrHint: OcrHint = "possible";
  if (path.endsWith(".pdf")) {
    expectedContentType = "pdf";
    ocrHint = "required";
  } else if (path.endsWith(".json") || path.includes("/api/views/")) {
    expectedContentType = "json";
    ocrHint = "not_needed";
  } else if (path.endsWith(".shtml") || isMta || isNycDot) {
    expectedContentType = "html";
    ocrHint = "not_needed";
  }

  let publisher = "NYC DOT";
  if (isMta) {
    publisher = host === "capitaldashboard.mta.info" ? "MTA Capital Dashboard" : "MTA";
  } else if (host === "data.ny.gov") {
    publisher = "MTA Open Data";
  } else if (host === "data.cityofnewyork.us") {
    publisher = "NYC Open Data";
  } else if (isLinkedMonitoringReport) {
    publisher = "NYC DOT linked external report";
  }

  let sourceGroup = "bus_priority_document";
  if (combined.includes("automated-camera") || combined.includes("ace")) {
    sourceGroup = "ace_able";
  } else if (combined.includes("signal-priority") || combined.includes("tsp")) {
    sourceGroup = "transit_signal_priority";
  } else if (combined.includes("busway")) {
    sourceGroup = "busway";
  } else if (combined.includes("better-bus") || combined.includes("betterbuses")) {
    sourceGroup = "better_buses";
  } else if (combined.includes("redesign")) {
    sourceGroup = "route_redesign";
  } else if (combined.includes("capital")) {
    sourceGroup = "capital_projects";
  } else if (
    combined.includes("sbs") ||
    combined.includes("select bus") ||
    path.includes("/routes/")
  ) {
    sourceGroup = "select_bus_service";
  } else if (path.includes("/api/views/") || combined.includes("dataset")) {
    sourceGroup = "dataset_dictionary";
  }

  const pathIsRelevantNyc =
    path.includes("/html/brt/html/") ||
    path.includes("/html/dot/html/pr") ||
    path.includes("/html/dot/downloads/pdf/") ||
    path.includes("/html/brt/downloads/pdf/") ||
    path.includes("/34busway") ||
    path.includes("/tremontbusway");
  const pathIsRelevantMta =
    path.includes("/agency/new-york-city-transit/automated-camera-enforcement") ||
    path.includes("/press-release/") ||
    path.includes("/article/") ||
    path.includes("/document/") ||
    host === "capitaldashboard.mta.info";
  const pathIsRelevantSocrata = path.includes("/api/views/") || path.includes("/transportation/");

  if (
    !pathIsRelevantNyc &&
    !pathIsRelevantMta &&
    !pathIsRelevantSocrata &&
    !isLinkedMonitoringReport
  ) {
    return { include: false, reason: "outside_tier2_path_scope" };
  }

  if (
    path.includes("/home/") ||
    path.includes("/involved/") ||
    path.includes("/contact") ||
    path.includes("/privacy") ||
    path.includes("/accessibility")
  ) {
    return { include: false, reason: "navigation_or_policy_page" };
  }

  const intendedUseByGroup: Record<string, string[]> = {
    ace_able: ["ace_scope_context", "intervention_seed", "source_card"],
    transit_signal_priority: ["tsp_candidate", "route_link_candidate", "source_gap_candidate"],
    busway: ["busway_launch_candidate", "corridor_link_candidate", "route_link_candidate"],
    better_buses: ["bus_priority_project_context", "tsp_candidate", "stop_consolidation_candidate"],
    route_redesign: ["route_redesign_service_change", "route_alias_candidate", "source_card"],
    capital_projects: ["capital_project_milestone", "project_id_candidate", "source_card"],
    select_bus_service: ["sbs_launch_context", "route_link_candidate", "source_card"],
    dataset_dictionary: ["source_dictionary", "field_caveat", "validation_schema"],
    bus_priority_document: ["bus_priority_project_context", "source_gap_candidate", "source_card"],
  };

  return {
    include: true,
    reason: "tier2_candidate",
    sourceGroup,
    expectedContentType,
    ocrHint,
    publisher,
    intendedUse: intendedUseByGroup[sourceGroup] ?? [
      "bus_priority_project_context",
      "source_gap_candidate",
      "source_card",
    ],
  };
}

function titleFromUrl(url: string): string {
  const parsed = new URL(url);
  const pathname = decodeURIComponent(parsed.pathname);
  const basename = pathname.split("/").filter(Boolean).at(-1) ?? parsed.hostname;
  const stem = basename.replace(/\.(shtml|html|pdf|json)$/i, "");
  return stem
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferDocumentDate(url: string, anchorText: string): string | null {
  const combined = `${decodeURIComponent(new URL(url).pathname)} ${anchorText}`;
  const monthMap: Record<string, string> = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
  };
  const monthMatch = combined.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[-_ ]?(\d{4})\b/i,
  );
  if (monthMatch?.[1] !== undefined && monthMatch[2] !== undefined) {
    const month = monthMap[monthMatch[1].toLowerCase()];
    if (month !== undefined) {
      return `${monthMatch[2]}-${month}`;
    }
  }

  const yearMatch = combined.match(/\b(20\d{2})\b/);
  return yearMatch?.[1] ?? null;
}

function sourceIdForDiscovery(input: {
  url: string;
  sourceGroup: string;
  existingIds: Set<string>;
}): string {
  const parsed = new URL(input.url);
  const pathParts = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part).replace(/\.(shtml|html|pdf|json)$/i, ""));
  const stem =
    pathParts.length >= 2 &&
    ["routes", "other", "about", "busways", "betterbuses"].includes(pathParts.at(-2) ?? "")
      ? pathParts.slice(-2).join("_")
      : (pathParts.at(-1) ?? parsed.hostname);
  const prefix = parsed.hostname.includes("mta")
    ? "mta"
    : parsed.hostname.includes("data.cityofnewyork")
      ? "nyc_open_data"
      : parsed.hostname.includes("data.ny")
        ? "mta_open_data"
        : parsed.hostname.includes("tylin")
          ? "nyc_dot_linked"
          : "nyc_dot";
  const type = parsed.pathname.toLowerCase().endsWith(".pdf") ? "pdf" : "page";
  const baseId = slugify(`${prefix}_${input.sourceGroup}_${type}_${stem}`);
  if (!input.existingIds.has(baseId)) {
    input.existingIds.add(baseId);
    return baseId;
  }

  const hashedId = `${baseId}_${shortHash(input.url)}`;
  input.existingIds.add(hashedId);
  return hashedId;
}

function parseDiscoverCliArgs(args: string[]): DiscoverCliArgs {
  const options: CliOption<DiscoverCliArgs>[] = [
    {
      flags: ["--capture-manifest"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.captureManifestPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--backlog"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.backlogPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--merged-backlog"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.mergedBacklogPath = fromCliPath(value);
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

function backlogSourceFromDiscovered(source: Tier2DiscoveredSource): Tier2BacklogSource {
  const backlogSource: Tier2BacklogSource = {
    sourceId: source.sourceId,
    url: source.url,
    title: source.title,
    publisher: source.publisher,
    sourceGroup: source.sourceGroup,
    intendedUse: source.intendedUse,
    priority: source.priority,
    expectedContentType: source.expectedContentType,
    ocrHint: source.ocrHint,
    termsNote: source.termsNote,
    notes: source.notes,
  };
  if (source.documentDate !== undefined) {
    backlogSource.documentDate = source.documentDate;
  }
  return backlogSource;
}

function buildDiscoveredSource(input: {
  url: string;
  href: string;
  anchorText: string;
  discoveredFromSource: Tier2CapturedSource;
  classification: Extract<DiscoveryClassification, { include: true }>;
  existingIds: Set<string>;
  priority: number;
}): Tier2DiscoveredSource {
  const title = input.anchorText.length > 0 ? input.anchorText : titleFromUrl(input.url);
  const source: Tier2BacklogSource = {
    sourceId: sourceIdForDiscovery({
      url: input.url,
      sourceGroup: input.classification.sourceGroup ?? "bus_priority_document",
      existingIds: input.existingIds,
    }),
    url: input.url,
    title,
    publisher: input.classification.publisher ?? "Unknown",
    sourceGroup: input.classification.sourceGroup ?? "bus_priority_document",
    intendedUse: input.classification.intendedUse ?? ["source_card"],
    priority: input.priority,
    expectedContentType: input.classification.expectedContentType ?? "unknown",
    ocrHint: input.classification.ocrHint ?? "possible",
    termsNote:
      input.classification.expectedContentType === "pdf"
        ? "Discovered official or officially linked PDF; OCR/text output must stay in ignored artifacts until reviewed."
        : "Discovered official public page or metadata endpoint; use short excerpts and source links in public artifacts.",
    notes: `Discovered from ${input.discoveredFromSource.sourceId}.`,
  };
  const documentDate = inferDocumentDate(input.url, title);
  if (documentDate !== null) {
    source.documentDate = documentDate;
  }

  return {
    ...source,
    discovery: {
      href: input.href,
      anchorText: title,
      discoveredFromSourceId: input.discoveredFromSource.sourceId,
      discoveredFromUrl: input.discoveredFromSource.finalUrl,
    },
  };
}

export async function discoverTier2Docs(
  args: DiscoverTier2DocsArgs,
): Promise<Tier2DiscoveryArtifact> {
  const manifest = (await Bun.file(args.captureManifestPath).json()) as Tier2CaptureManifest;
  const backlogPath = args.backlogPath ?? manifest.backlogPath ?? DEFAULT_BACKLOG_PATH;
  const backlog = await readBacklog(backlogPath);
  const existingUrls = new Set(
    backlog.sources.map((source) => normalizeDiscoveredUrl(source.url, source.url) ?? source.url),
  );
  const existingIds = new Set(backlog.sources.map((source) => source.sourceId));
  const candidateUrls = new Set<string>();
  const discoveredSources: Tier2DiscoveredSource[] = [];
  const excludedLinks: Tier2ExcludedDiscoveryLink[] = [];
  let extractedLinkCount = 0;
  let candidateLinkCount = 0;
  let skippedExistingCount = 0;
  let priority = Math.max(...backlog.sources.map((source) => source.priority), 0) + 1;

  const capturedHtmlSources = manifest.sources.filter(
    (source) =>
      source.captureStatus === "captured" &&
      source.detectedContentType === "html" &&
      source.rawArtifactKey !== null,
  );

  for (const source of capturedHtmlSources) {
    if (source.rawArtifactKey === null) {
      continue;
    }
    const html = await Bun.file(join(manifest.runArtifactRoot, source.rawArtifactKey)).text();
    const links = extractHtmlLinks(html, source);
    extractedLinkCount += links.length;

    for (const link of links) {
      if (link.normalizedUrl === null) {
        excludedLinks.push({
          href: link.href,
          normalizedUrl: null,
          anchorText: link.anchorText,
          discoveredFromSourceId: source.sourceId,
          reason: "unparseable_or_non_http_link",
        });
        continue;
      }

      const classification = classifyDiscoveryCandidate({
        url: link.normalizedUrl,
        anchorText: link.anchorText,
      });
      if (!classification.include) {
        excludedLinks.push({
          href: link.href,
          normalizedUrl: link.normalizedUrl,
          anchorText: link.anchorText,
          discoveredFromSourceId: source.sourceId,
          reason: classification.reason,
        });
        continue;
      }

      candidateLinkCount += 1;
      if (existingUrls.has(link.normalizedUrl) || candidateUrls.has(link.normalizedUrl)) {
        skippedExistingCount += 1;
        continue;
      }

      candidateUrls.add(link.normalizedUrl);
      discoveredSources.push(
        buildDiscoveredSource({
          url: link.normalizedUrl,
          href: link.href,
          anchorText: link.anchorText,
          discoveredFromSource: source,
          classification,
          existingIds,
          priority,
        }),
      );
      priority += 1;
    }
  }

  const mergedBacklog: Tier2Backlog = {
    version: 1,
    updatedAt: (args.generatedAt ?? new Date().toISOString()).slice(0, 10),
    sources: [
      ...backlog.sources,
      ...discoveredSources.map((source) => backlogSourceFromDiscovered(source)),
    ].toSorted(
      (left, right) =>
        left.priority - right.priority || left.sourceId.localeCompare(right.sourceId),
    ),
  };

  const artifact: Tier2DiscoveryArtifact = {
    version: 1,
    runId: manifest.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    captureManifestPath: args.captureManifestPath,
    backlogPath,
    mergedBacklogPath: args.mergedBacklogPath ?? null,
    summary: {
      inputBacklogSourceCount: backlog.sources.length,
      capturedHtmlSourceCount: capturedHtmlSources.length,
      extractedLinkCount,
      candidateLinkCount,
      newSourceCount: discoveredSources.length,
      skippedExistingCount,
      excludedLinkCount: excludedLinks.length,
      mergedBacklogSourceCount: mergedBacklog.sources.length,
    },
    sources: discoveredSources,
    excludedLinks,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }
  if (args.mergedBacklogPath !== undefined) {
    await mkdir(dirname(args.mergedBacklogPath), { recursive: true });
    await writeJson(args.mergedBacklogPath, mergedBacklog);
  }

  return artifact;
}

async function resolveDiscoverPaths(args: DiscoverCliArgs): Promise<{
  captureManifestPath: string;
  outputPath: string;
  mergedBacklogPath: string;
}> {
  if (args.captureManifestPath !== undefined) {
    return {
      captureManifestPath: args.captureManifestPath,
      outputPath: args.outputPath ?? join(dirname(args.captureManifestPath), "discovery.json"),
      mergedBacklogPath:
        args.mergedBacklogPath ??
        join(dirname(args.captureManifestPath), "discovered-backlog.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --capture-manifest.");
  }

  return {
    captureManifestPath: captureManifestPath(artifactRoot, runId),
    outputPath: args.outputPath ?? discoveryPath(artifactRoot, runId),
    mergedBacklogPath: args.mergedBacklogPath ?? discoveredBacklogPath(artifactRoot, runId),
  };
}

export async function discoverTier2DocsFromCli(args: string[]): Promise<Tier2DiscoveryArtifact> {
  const parsed = parseDiscoverCliArgs(args);
  const paths = await resolveDiscoverPaths(parsed);
  return discoverTier2Docs({
    ...paths,
    ...(parsed.backlogPath !== undefined ? { backlogPath: parsed.backlogPath } : {}),
  });
}
