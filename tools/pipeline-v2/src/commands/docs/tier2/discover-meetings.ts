import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { defineCommand, z } from "@liche/core";
import { readJsonIfExists, writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../../lib/paths.ts";
import {
  buildMeetingDiscovery,
  enumerateMeetingMonths,
  type FetchedMeetingPage,
  type MeetingBacklogSource,
  MTA_BROWSER_HEADERS,
  MTA_MEETING_BASE,
} from "./_discover-meetings.ts";

export {
  buildMeetingDiscovery,
  enumerateMeetingMonths,
  parseMeetingPage,
  type MeetingBacklogSource,
  type MeetingDiscoveryResult,
} from "./_discover-meetings.ts";

function display(path: string): string {
  const rel = relative(repoRoot, path);
  return rel.startsWith("..") ? path : rel;
}

async function fetchPages(
  months: ReturnType<typeof enumerateMeetingMonths>,
  concurrency: number,
): Promise<FetchedMeetingPage[]> {
  const results: FetchedMeetingPage[] = new Array(months.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < months.length) {
      const index = next++;
      const month = months[index];
      if (month === undefined) break;
      const url = `${MTA_MEETING_BASE}/${month.slug}`;
      try {
        const res = await fetch(url, { headers: MTA_BROWSER_HEADERS });
        results[index] = {
          month,
          url,
          httpStatus: res.status,
          html: res.ok ? await res.text() : null,
        };
      } catch {
        results[index] = { month, url, httpStatus: null, html: null };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, months.length) }, () => worker()));
  return results;
}

export default defineCommand({
  path: ["docs", "tier2", "discover-meetings"],
  summary:
    "Index recurring MTA board/committee meeting assets (committee book PDFs + meeting video recordings) into the available source backlog. Indexing only — no downloads.",
  input: {
    options: z.object({
      from: z.string().default("2021-01").describe("First meeting month, YYYY-MM."),
      to: z.string().default("2026-06").describe("Last meeting month, YYYY-MM."),
      concurrency: z.coerce.number().int().positive().max(8).default(4).describe("Parallel fetches."),
      existingBacklog: z
        .string()
        .optional()
        .describe("Backlog JSON to dedupe against (defaults to the augmented Tier 2 backlog)."),
      output: z.string().optional().describe("Override discovery artifact output path."),
      mergedBacklog: z
        .string()
        .optional()
        .describe("If set, write existing + discovered sources as a merged backlog for the coverage audit."),
    }),
  },
  output: z.object({
    outputPath: z.string(),
    mergedBacklogPath: z.string().nullable(),
    monthsWithMeeting: z.number(),
    documentSources: z.number(),
    videoSources: z.number(),
    newSources: z.number(),
    duplicateSources: z.number(),
  }),
  async run({ input }) {
    const artifactRoot = defaultArtifactRootPath();
    const existingBacklogPath =
      input.options.existingBacklog === undefined
        ? join(
            artifactRoot,
            "docs/tier2-ocr-preservation-20260531/tier2-full-corpus-augmented-backlog.json",
          )
        : fromCliPath(input.options.existingBacklog);
    const outputPath =
      input.options.output === undefined
        ? join(artifactRoot, "docs/mta-meeting-discovery/mta-meeting-sources.json")
        : fromCliPath(input.options.output);

    const existingDoc = await readJsonIfExists<{ sources?: Array<{ url?: string }> }>(
      existingBacklogPath,
    );
    const existingSources = existingDoc?.sources ?? [];
    const knownUrls = existingSources
      .map((s) => s.url)
      .filter((u): u is string => typeof u === "string");

    const months = enumerateMeetingMonths(input.options.from, input.options.to);
    const pages = await fetchPages(months, input.options.concurrency);
    const discovery = buildMeetingDiscovery({ pages, knownUrls });

    const artifact = {
      version: 1 as const,
      generatedAt: new Date().toISOString(),
      meetingBase: MTA_MEETING_BASE,
      range: { from: input.options.from, to: input.options.to },
      existingBacklogPath: existingDoc === null ? null : display(existingBacklogPath),
      ...discovery,
    };

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);

    let mergedBacklogPath: string | null = null;
    if (input.options.mergedBacklog !== undefined) {
      mergedBacklogPath = fromCliPath(input.options.mergedBacklog);
      const merged = {
        version: 1,
        updatedAt: artifact.generatedAt,
        mergedFrom: {
          existingBacklog: existingDoc === null ? null : display(existingBacklogPath),
          meetingDiscovery: display(outputPath),
        },
        sources: [...existingSources, ...(discovery.sources as MeetingBacklogSource[])],
      };
      await mkdir(dirname(mergedBacklogPath), { recursive: true });
      await writeJson(mergedBacklogPath, merged);
    }

    return {
      outputPath: display(outputPath),
      mergedBacklogPath: mergedBacklogPath === null ? null : display(mergedBacklogPath),
      monthsWithMeeting: discovery.summary.monthsWithMeeting,
      documentSources: discovery.summary.documentSources,
      videoSources: discovery.summary.videoSources,
      newSources: discovery.summary.newSources,
      duplicateSources: discovery.summary.duplicateSources,
    };
  },
});
