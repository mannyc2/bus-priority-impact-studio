import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionCard } from "../../src/components/SectionCard";

describe("SectionCard", () => {
  test("renders the title inside the card section", () => {
    const html = renderToStaticMarkup(
      createElement(SectionCard, { title: "Slow segments" }, "body-content"),
    );
    expect(html).toContain("<section");
    expect(html).toContain(">Slow segments</h2>");
    expect(html).toContain("body-content");
  });

  test("renders the sub line when provided", () => {
    const html = renderToStaticMarkup(
      createElement(SectionCard, { title: "T", sub: "36 months of data" }, "x"),
    );
    expect(html).toContain("36 months of data");
  });

  test("renders the right slot when provided", () => {
    const html = renderToStaticMarkup(
      createElement(SectionCard, { title: "T", right: "RIGHT-SLOT" }, "x"),
    );
    expect(html).toContain("RIGHT-SLOT");
  });
});
