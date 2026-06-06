// Recurring MTA board/committee meeting discovery.
//
// MTA publishes one meeting page per month at
// `…/transparency/board-and-committee-meetings/<month>-<year>`, which aggregates
// every committee's book (as `/document/<id>` PDFs) plus the YouTube recording of
// the meeting. This module turns those pages into backlog source entries — the
// *available* universe — without downloading anything. Documents register as
// pdf sources; the meeting video registers in the media lane (transcription
// deferred). It is the expansion counterpart to the source-coverage inventory.

export const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

export const MTA_MEETING_BASE = "https://www.mta.info/transparency/board-and-committee-meetings";
export const MTA_DOCUMENT_BASE = "https://www.mta.info/document";

// Browser header set that gets past MTA's bot protection (plain UA-only requests
// 403). Verified against www.mta.info meeting pages and document PDFs.
export const MTA_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

export type MeetingMonth = { year: number; month: number; slug: string; meetingMonth: string };

export function enumerateMeetingMonths(fromMonth: string, toMonth: string): MeetingMonth[] {
  const parse = (value: string): { year: number; month: number } => {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match || match[1] === undefined || match[2] === undefined) {
      throw new Error(`Invalid month "${value}", expected YYYY-MM.`);
    }
    return { year: Number(match[1]), month: Number(match[2]) };
  };
  const from = parse(fromMonth);
  const to = parse(toMonth);
  const months: MeetingMonth[] = [];
  let y = from.year;
  let m = from.month;
  while (y < to.year || (y === to.year && m <= to.month)) {
    const monthName = MONTH_NAMES[m - 1] ?? "";
    months.push({
      year: y,
      month: m,
      slug: `${monthName}-${y}`,
      meetingMonth: `${y}-${String(m).padStart(2, "0")}`,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export type MeetingPageParse = {
  documents: Array<{ documentId: string; url: string; title: string }>;
  videos: Array<{ videoKey: string; url: string }>;
};

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const VIDEO_KEY_PATTERNS = [
  /youtube\.com\/live\/([A-Za-z0-9_-]{6,})/g,
  /youtube\.com\/watch\?v=([A-Za-z0-9_-]{6,})/g,
  /youtu\.be\/([A-Za-z0-9_-]{6,})/g,
];

export function parseMeetingPage(html: string): MeetingPageParse {
  // Documents: anchor tags pointing at /document/<id>, keep the visible title.
  const documentsById = new Map<string, { documentId: string; url: string; title: string }>();
  const anchorRe = /<a\b[^>]*href="([^"]*\/document\/(\d+))[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(anchorRe)) {
    const documentId = match[2];
    if (documentId === undefined) continue;
    const title = decodeEntities((match[3] ?? "").replace(/<[^>]+>/g, ""));
    if (!documentsById.has(documentId)) {
      documentsById.set(documentId, {
        documentId,
        url: `${MTA_DOCUMENT_BASE}/${documentId}`,
        title: title.length > 0 ? title : `Document ${documentId}`,
      });
    }
  }

  // Videos: YouTube recordings (skip the bare channel link `user/mtainfo`).
  const videosByKey = new Map<string, { videoKey: string; url: string }>();
  for (const pattern of VIDEO_KEY_PATTERNS) {
    for (const match of html.matchAll(pattern)) {
      const videoKey = match[1];
      const whole = match[0];
      if (videoKey === undefined || whole === undefined) continue;
      const url = whole.startsWith("http") ? whole : `https://${whole}`;
      if (!videosByKey.has(videoKey)) videosByKey.set(videoKey, { videoKey, url });
    }
  }

  return {
    documents: [...documentsById.values()],
    videos: [...videosByKey.values()],
  };
}

export type MeetingBacklogSource = {
  sourceId: string;
  url: string;
  title: string;
  publisher: "MTA";
  sourceGroup: "mta_board_meeting";
  intendedUse: string[];
  priority: number;
  expectedContentType: "pdf" | "youtube";
  ocrHint: "required" | "not_needed";
  meetingMonth: string;
  discoveredFrom: string;
};

export type MeetingDiscoveryResult = {
  sources: MeetingBacklogSource[];
  summary: {
    monthsRequested: number;
    monthsWithMeeting: number;
    monthsEmpty: number;
    monthsFailed: number;
    documentSources: number;
    videoSources: number;
    newSources: number;
    duplicateSources: number;
  };
  months: Array<{
    meetingMonth: string;
    slug: string;
    url: string;
    status: "ok" | "empty" | "failed";
    httpStatus: number | null;
    documents: number;
    videos: number;
  }>;
};

export type FetchedMeetingPage = {
  month: MeetingMonth;
  url: string;
  httpStatus: number | null;
  html: string | null;
};

// Pure builder: turn fetched pages into deduped backlog entries. Network lives in
// the command; this stays testable from fixtures.
export function buildMeetingDiscovery(args: {
  pages: FetchedMeetingPage[];
  knownUrls?: Iterable<string>;
}): MeetingDiscoveryResult {
  const known = new Set<string>();
  for (const url of args.knownUrls ?? []) known.add(url.replace(/\/+$/, ""));
  const seen = new Set<string>();

  const sources: MeetingBacklogSource[] = [];
  const months: MeetingDiscoveryResult["months"] = [];
  let monthsWithMeeting = 0;
  let monthsEmpty = 0;
  let monthsFailed = 0;
  let documentSources = 0;
  let videoSources = 0;
  let duplicateSources = 0;

  for (const page of args.pages) {
    if (page.html === null) {
      monthsFailed += 1;
      months.push({
        meetingMonth: page.month.meetingMonth,
        slug: page.month.slug,
        url: page.url,
        status: "failed",
        httpStatus: page.httpStatus,
        documents: 0,
        videos: 0,
      });
      continue;
    }

    const parsed = parseMeetingPage(page.html);
    if (parsed.documents.length === 0 && parsed.videos.length === 0) {
      monthsEmpty += 1;
      months.push({
        meetingMonth: page.month.meetingMonth,
        slug: page.month.slug,
        url: page.url,
        status: "empty",
        httpStatus: page.httpStatus,
        documents: 0,
        videos: 0,
      });
      continue;
    }

    monthsWithMeeting += 1;
    months.push({
      meetingMonth: page.month.meetingMonth,
      slug: page.month.slug,
      url: page.url,
      status: "ok",
      httpStatus: page.httpStatus,
      documents: parsed.documents.length,
      videos: parsed.videos.length,
    });

    const register = (source: MeetingBacklogSource): void => {
      const key = source.url.replace(/\/+$/, "");
      if (seen.has(key)) return;
      seen.add(key);
      if (known.has(key)) {
        duplicateSources += 1;
        return;
      }
      sources.push(source);
      if (source.expectedContentType === "pdf") documentSources += 1;
      else videoSources += 1;
    };

    for (const doc of parsed.documents) {
      register({
        sourceId: `mta_meeting_doc_${doc.documentId}`,
        url: doc.url,
        title: doc.title,
        publisher: "MTA",
        sourceGroup: "mta_board_meeting",
        intendedUse: ["meeting_material", "intervention_seed", "source_card"],
        priority: 3,
        expectedContentType: "pdf",
        ocrHint: "required",
        meetingMonth: page.month.meetingMonth,
        discoveredFrom: page.url,
      });
    }
    for (const video of parsed.videos) {
      register({
        sourceId: `mta_meeting_video_${video.videoKey}`,
        url: video.url,
        title: `MTA board/committee meeting recording (${page.month.meetingMonth})`,
        publisher: "MTA",
        sourceGroup: "mta_board_meeting",
        intendedUse: ["meeting_recording", "transcription_deferred"],
        priority: 4,
        expectedContentType: "youtube",
        ocrHint: "not_needed",
        meetingMonth: page.month.meetingMonth,
        discoveredFrom: page.url,
      });
    }
  }

  return {
    sources,
    summary: {
      monthsRequested: args.pages.length,
      monthsWithMeeting,
      monthsEmpty,
      monthsFailed,
      documentSources,
      videoSources,
      newSources: sources.length,
      duplicateSources,
    },
    months,
  };
}
