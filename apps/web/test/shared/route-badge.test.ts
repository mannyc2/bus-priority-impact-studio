import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteBadge } from "../../src/components/RouteBadge";

function render(route: string, sbs: boolean) {
  return renderToStaticMarkup(createElement(RouteBadge, { route, sbs }));
}

describe("RouteBadge normalization", () => {
  test("does not manufacture an SBS suffix from the service-classification flag", () => {
    const html = render("M86", true);
    expect(html).toContain(">M86</span>");
    expect(html).not.toContain("M86-SBS");
  });

  test("preserves a space-separated source label verbatim", () => {
    const html = render("M86 SBS", true);
    expect(html).toContain("M86 SBS");
    expect(html).not.toContain("M86-SBS");
  });

  test("preserves a hyphenated source label verbatim", () => {
    expect(render("M86-SBS", false)).toContain("M86-SBS");
  });

  test("preserves a plus-SBS source label verbatim", () => {
    const html = render("M86 +SBS", false);
    expect(html).toContain("M86 +SBS");
    expect(html).not.toContain("M86-SBS");
  });

  test("renders a source-backed display label verbatim without SBS synthesis", () => {
    const html = renderToStaticMarkup(
      createElement(RouteBadge, { route: "B44+", sbs: true, displayLabel: "B44 Select" }),
    );
    expect(html).toContain("B44 Select");
    expect(html).not.toContain("B44-SBS");
    expect(html).toContain("min-width:62px");
  });

  test("leaves a plain route untouched", () => {
    const html = render("B41", false);
    expect(html).toContain("B41");
    expect(html).not.toContain("-SBS");
  });

  test("renders the roundel on a single line", () => {
    expect(render("M86 SBS", true)).toContain("whitespace-nowrap");
  });
});
