import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceIndexSection } from "../../src/components/route/DataNotesSection";
import type { RouteSectionRegistry } from "../../src/components/route/section-registry";

const sectionRegistry = {
  presentations: {},
} as Pick<RouteSectionRegistry, "presentations">;

describe("DataNotesSection evidence header", () => {
  test("keeps hidden-section notices visible even when there are no insight rows", () => {
    const markup = renderToStaticMarkup(
      createElement(EvidenceIndexSection, {
        rows: [],
        routeSlug: "b48",
        sectionRegistry,
        hiddenSectionCount: 1,
        onNavigate: () => undefined,
      }),
    );

    expect(markup).toContain("1 notice");
    expect(markup).toContain("Checked surfaces appear below.");
  });
});
