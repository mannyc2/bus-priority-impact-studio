// Shared route-mention and numeric-quote pattern helpers used by BOTH the OCR
// markdown-candidates step (`_ocr-candidates.ts`) and the intervention-records
// step (`_intervention-records.ts`). Extracted from the former _shared.ts
// monolith during the per-step decomposition.
//
// Runtime-leaf relative to the step modules: it only depends on `escapeRegExp`
// from the core module (`_shared.ts`), which never imports back here.
import { escapeRegExp } from "./_shared.ts";

export const ROUTE_MENTION_PATTERN = /^(?:B|BM|BX|BXM|M|Q|QM|S|SIM|X)\d+[A-Z]?$/;
const ROUTE_MENTION_WITH_SUFFIX_PATTERN =
  /\s*(?:\+|SBS|LTD|LIMITED|LOCAL|SELECTBUSSERVICE|SELECT)$\s*/i;
const SUBWAY_ONLY_ROUTE_MENTION_PATTERN = /^[ACEBDFGJLMNQRSWZ]$/;

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

function normalizeRouteMentionToken(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/[.\-_]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(ROUTE_MENTION_WITH_SUFFIX_PATTERN, "");
  if (normalized.length === 0 || SUBWAY_ONLY_ROUTE_MENTION_PATTERN.test(normalized)) {
    return null;
  }
  return ROUTE_MENTION_PATTERN.test(normalized) ? normalized : null;
}

export function expandRouteMention(value: string): string[] {
  const compact = value.trim().replace(/\s+/g, "");
  if (!compact.includes("/")) {
    const normalized = normalizeRouteMentionToken(value);
    return normalized === null ? [] : [normalized];
  }

  const parts = compact.split("/").filter((part) => part.length > 0);
  const first = normalizeRouteMentionToken(parts[0] ?? "");
  if (first === null) return [];
  const base = /^([A-Z]+)(\d+)([A-Z]?)$/.exec(first);
  const expanded = [first];

  for (const part of parts.slice(1)) {
    const direct = normalizeRouteMentionToken(part);
    if (direct !== null) {
      expanded.push(direct);
      continue;
    }
    if (base !== null && /^[A-Z]$/i.test(part)) {
      const [, prefix, number] = base;
      expanded.push(`${prefix}${number}${part.toUpperCase()}`);
      continue;
    }
    if (base !== null && /^\d+[A-Z]?$/i.test(part)) {
      const [, prefix] = base;
      expanded.push(`${prefix}${part.toUpperCase()}`);
    }
  }

  return expanded.filter((routeId) => ROUTE_MENTION_PATTERN.test(routeId));
}

function normalizeNumericText(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(value).replace(/0+$/, "").replace(/\.$/, "");
}

function numericQuoteVariants(value: number): string[] {
  const absolute = Math.abs(value);
  const variants = new Set<string>([
    normalizeNumericText(value),
    normalizeNumericText(absolute),
    absolute.toLocaleString("en-US"),
  ]);
  if (absolute >= 1_000_000) {
    const millions = absolute / 1_000_000;
    variants.add(`${normalizeNumericText(millions)} million`);
  }
  if (absolute >= 1_000 && absolute < 1_000_000) {
    const thousands = absolute / 1_000;
    variants.add(`${normalizeNumericText(thousands)} thousand`);
  }
  for (const [word, number] of Object.entries(NUMBER_WORDS)) {
    if (absolute === number) variants.add(word);
  }
  return [...variants].filter((variant) => variant.length > 0);
}

export function quoteSupportsNumericValue(quote: string, value: number): boolean {
  const normalizedQuote = quote.toLowerCase().replace(/,/g, "");
  return numericQuoteVariants(value).some((variant) => {
    const normalizedVariant = variant.toLowerCase().replace(/,/g, "");
    const trailingBoundary = Number.isInteger(value)
      ? "(?!\\.\\d)(?=$|[^0-9a-z])"
      : "(?=$|[^0-9a-z])";
    return new RegExp(
      `(^|[^0-9a-z.])\\$?\\s*${escapeRegExp(normalizedVariant)}${trailingBoundary}`,
    ).test(normalizedQuote);
  });
}
