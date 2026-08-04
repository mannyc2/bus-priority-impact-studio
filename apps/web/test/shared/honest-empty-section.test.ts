import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HonestEmptySection } from "../../src/components/route/HonestEmptySection.js";
import type { HonestEmptyState } from "../../src/components/route/section-registry.js";

function render(state: HonestEmptyState, reason: string | null = null): string {
  return renderToStaticMarkup(createElement(HonestEmptySection, { state, reason }));
}

describe("honest-empty states", () => {
  test("checked_clean makes its claim in rider words", () => {
    /* Reworded 2026-08-02: "Checked clean / Detectors ran; no publishable
       signal." was detector vocabulary on a public face. The §8.2 credibility
       claim — we looked and found nothing — has to survive the rewording. */
    const html = render("checked_clean");
    expect(html).toContain("Nothing on record");
    expect(html).toContain("We checked this release and found nothing to report for this route.");
    expect(html).not.toContain("Detectors");
    expect(html).not.toContain("publishable signal");
  });

  test("the other three states keep their designed copy verbatim", () => {
    expect(render("building")).toContain("Building");
    expect(render("building")).toContain("Pipeline still building.");
    expect(render("insufficient_data")).toContain("Thin data");
    expect(render("insufficient_data")).toContain("Data is too thin for a defensible result.");
    expect(render("blocked")).toContain("Blocked");
    expect(render("blocked")).toContain("Upstream dependency failed this release.");
  });

  test("a pipeline reason never reaches a production reader", () => {
    const reason = "speed months present, history artifact not built";
    const html = render("building", reason);
    /* Bun's test runner builds with DEV false, which is the shipped path. */
    expect(import.meta.env.DEV).toBeFalsy();
    expect(html).not.toContain(reason);
    expect(html).not.toContain("artifact");
    /* The designed state still speaks. */
    expect(html).toContain("Pipeline still building.");
  });
});
