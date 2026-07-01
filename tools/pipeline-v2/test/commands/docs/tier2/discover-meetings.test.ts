import { describe, expect, test } from "bun:test";
import {
  buildMeetingDiscovery,
  enumerateMeetingMonths,
  type FetchedMeetingPage,
  parseMeetingPage,
} from "../../../../src/commands/docs/tier2/_discover-meetings.ts";

const SAMPLE_HTML = `
  <html><body>
    <a href="/transparency/board-and-committee-meetings/january-2026/document/196826?download">December 2025 minutes</a>
    <a href="https://www.mta.info/document/196836">January 2026 work plan</a>
    <a href="/document/196841">Financial &amp; ridership report</a>
    <a href="/document/196841">Financial &amp; ridership report (dup id)</a>
    <a href="https://www.youtube.com/live/LX_54xQZJtQ?feature=share">Watch the meeting</a>
    <a href="https://www.youtube.com/user/mtainfo">MTA channel</a>
  </body></html>
`;

function pageFrom(html: string | null, meetingMonth = "2026-01"): FetchedMeetingPage {
  const [yearPart, monthPart] = meetingMonth.split("-");
  return {
    month: { year: Number(yearPart), month: Number(monthPart), slug: "january-2026", meetingMonth },
    url: "https://www.mta.info/transparency/board-and-committee-meetings/january-2026",
    httpStatus: html === null ? 404 : 200,
    html,
  };
}

describe("enumerateMeetingMonths", () => {
  test("walks months inclusive across a year boundary", () => {
    const months = enumerateMeetingMonths("2025-11", "2026-02");
    expect(months.map((m) => m.slug)).toEqual([
      "november-2025",
      "december-2025",
      "january-2026",
      "february-2026",
    ]);
  });
});

describe("parseMeetingPage", () => {
  test("extracts deduped document links with titles and the meeting video, skipping the channel", () => {
    const parsed = parseMeetingPage(SAMPLE_HTML);
    expect(parsed.documents.map((d) => d.documentId)).toEqual(["196826", "196836", "196841"]);
    expect(parsed.documents[2]?.title).toBe("Financial & ridership report");
    expect(parsed.documents[2]?.url).toBe("https://www.mta.info/document/196841");
    // The bare channel link (user/mtainfo) must not be treated as a recording.
    expect(parsed.videos).toHaveLength(1);
    expect(parsed.videos[0]?.videoKey).toBe("LX_54xQZJtQ");
  });
});

describe("buildMeetingDiscovery", () => {
  test("registers pdf documents and media-lane videos, deduping against known urls", () => {
    const result = buildMeetingDiscovery({
      pages: [pageFrom(SAMPLE_HTML)],
      knownUrls: ["https://www.mta.info/document/196826"], // already in backlog
    });
    expect(result.summary.monthsWithMeeting).toBe(1);
    expect(result.summary.documentSources).toBe(2); // 3 docs minus 1 known
    expect(result.summary.videoSources).toBe(1);
    expect(result.summary.duplicateSources).toBe(1);

    const video = result.sources.find((s) => s.expectedContentType === "youtube");
    expect(video?.sourceId).toBe("mta_meeting_video_LX_54xQZJtQ");
    expect(video?.sourceGroup).toBe("mta_board_meeting");
    expect(video?.intendedUse).toContain("transcription_deferred");

    const doc = result.sources.find((s) => s.expectedContentType === "pdf");
    expect(doc?.sourceId).toMatch(/^mta_meeting_doc_\d+$/);
    expect(doc?.meetingMonth).toBe("2026-01");
  });

  test("classifies empty and failed months without inventing sources", () => {
    const result = buildMeetingDiscovery({
      pages: [
        pageFrom("<html><body>no meeting this month</body></html>", "2026-08"),
        pageFrom(null, "2026-09"),
      ],
    });
    expect(result.summary.monthsEmpty).toBe(1);
    expect(result.summary.monthsFailed).toBe(1);
    expect(result.summary.newSources).toBe(0);
  });
});
