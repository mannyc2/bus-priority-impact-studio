import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WikiCitationEvidence } from "../../src/components/route/WikiEvidence";
import { citationEntries, SourceNote } from "../../src/components/SourceNote";

const evidence: WikiCitationEvidence = {
  citations: [
    {
      key: "k1",
      sourceId: "src1",
      sourceTitle: "NYC DOT Bus Priority Report",
      publisher: "NYC DOT",
      publishedDate: "2024",
      pageNumber: 12,
      sourceUrl: "https://example.com/report",
    },
  ],
};

describe("citationEntries", () => {
  test("dedupes duplicate citation keys to a single entry", () => {
    const entries = citationEntries(evidence, ["k1", "k1"]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toContain("NYC DOT Bus Priority Report");
  });

  test("drops unresolvable keys", () => {
    expect(citationEntries(null, ["x"])).toEqual([]);
    expect(citationEntries(evidence, ["missing"])).toEqual([]);
  });

  test("carries sourceUrl through as href", () => {
    expect(citationEntries(evidence, ["k1"])[0]?.href).toBe("https://example.com/report");
  });
});

describe("SourceNote", () => {
  test("renders nothing when there are no entries", () => {
    expect(renderToStaticMarkup(createElement(SourceNote, { entries: [] }))).toBe("");
  });

  test("labels the trigger with the deduped entry count", () => {
    const entries = citationEntries(evidence, ["k1", "k1"]);
    const html = renderToStaticMarkup(createElement(SourceNote, { entries }));
    expect(html).toContain("Sources (1)");
  });
});
