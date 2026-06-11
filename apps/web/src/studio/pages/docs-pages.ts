// Page identity for the docs section, kept in a tiny standalone module so the
// docs route's eager `head` can validate page ids without importing the heavy
// docs.tsx component module (which would pull every docs page into the initial
// bundle). docs.tsx and the route both import from here.

export const DOCS_PAGE_ORDER = [
  "overview",
  "authentication",
  "quickstart",
  "cli",
  "routes",
  "findings",
  "briefs",
  "data-credits",
  "methodology",
  "changelog",
] as const;

export type DocsPageId = (typeof DOCS_PAGE_ORDER)[number];

export function isDocsPage(value: string): value is DocsPageId {
  return (DOCS_PAGE_ORDER as readonly string[]).includes(value);
}
