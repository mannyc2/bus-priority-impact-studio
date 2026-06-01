import { isValidElement, type ReactNode } from "react";

/** The directive attributes the brief primitives read off their props. Named keys
 * (not an index signature) so components can dot-access them under
 * `noPropertyAccessFromIndexSignature`. */
type DirectiveAttr =
  | "value"
  | "unit"
  | "cite"
  | "sbs"
  | "tone"
  | "dir"
  | "spark"
  | "mph"
  | "delta"
  | "dunit"
  | "id"
  | "src"
  | "retrieved"
  // Block embeds: the `ref` attribute is remapped to `blockref` in the transform
  // (React reserves the `ref` prop, so it would never reach the component).
  | "blockref";

/** Props a directive component receives from react-markdown: its label children
 * plus the directive's attributes (always strings when present). */
export type DirectiveProps = { children?: ReactNode } & Partial<Record<DirectiveAttr, unknown>>;

/** A directive attribute as a non-empty string, or undefined. */
export function attrStr(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** A directive attribute read as a boolean (`key=true|yes|1`). */
export function attrBool(value: unknown): boolean {
  const text = attrStr(value);
  return value === true || text === "true" || text === "yes" || text === "1";
}

/** Flatten a directive's label children into a plain string. */
export function proseText(children: ReactNode): string {
  if (children === null || children === undefined || children === false || children === true) {
    return "";
  }
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(proseText).join("");
  if (isValidElement(children)) {
    return proseText((children.props as { children?: ReactNode }).children);
  }
  return "";
}

const TONE_COLOR: Record<string, string> = {
  ink: "var(--bp-color-ink-70)",
  good: "var(--bp-color-good)",
  warn: "var(--bp-color-warn)",
  bad: "var(--bp-color-bad)",
};

/** Map a `tone` attribute to a token color (defaults to ink). */
export function toneColor(tone: unknown): string {
  return TONE_COLOR[attrStr(tone) ?? "ink"] ?? "var(--bp-color-ink-70)";
}

/** Parse a comma-separated numeric attribute (e.g. a sparkline series). */
export function parseNums(value: unknown): number[] | undefined {
  const text = attrStr(value);
  if (!text) return undefined;
  const nums = text
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((num) => Number.isFinite(num));
  return nums.length > 0 ? nums : undefined;
}
