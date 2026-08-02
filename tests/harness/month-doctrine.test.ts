import { describe, expect, test } from "bun:test";
import {
  MONTH_DOCTRINE_ALLOWLIST,
  MONTH_DOCTRINE_DISPOSITIONS,
  MONTH_DOCTRINE_RULE_IDS,
  type MonthDoctrineAllowlistEntry,
  type MonthDoctrineDisposition,
  type MonthDoctrineRuleId,
} from "./month-doctrine-allowlist.ts";

export type MonthDoctrineSourceFile = {
  file: string;
  text: string;
};

export type MonthDoctrineViolation = {
  file: string;
  rule: MonthDoctrineRuleId;
  index: number;
  line: number;
  column: number;
  match: string;
};

const EXCLUDED_SEGMENTS = new Set([
  ".repos",
  "fixtures",
  "migrations",
  "node_modules",
  "test",
  "tests",
  "vendor",
]);

const RETIRED_IDENTITY_TOKEN =
  /\b(?:baselineMonth|BASELINE_MONTH|LAST_BUILT_SPEED_MONTH|canonicalMonthlyRelease|baseline_release|partial_public_monthly_only|baseline_mismatch)\b/g;
const RELEASE_MONTH_IDENTITY = /\breleaseMonth\b/g;
const ANALYSIS_PERIOD_IDENTITY = /\banalysisPeriod\b/g;
const SERIALIZED_RELEASE_MONTH = /\brelease_month\b/g;
const IDENTITY_PHRASE = /\b(?:monthly[\s-]+release|baseline[\s-]+month|release[\s-]+month)\b/gi;

const RELEASE_MONTH_IDENTITY_FILES = new Set([
  "packages/analytics/src/evaluation/build-route-capability-manifest.ts",
  "packages/analytics/src/evaluation/build-route-dossier-summary.ts",
  "packages/analytics/src/evaluation/map-artifacts.ts",
  "packages/domain/src/studio/route-capability.ts",
  "packages/domain/src/studio/route-dossier.ts",
  "packages/studio-api/src/studio/read-handlers.ts",
  "tools/pipeline-v2/src/commands/export/d1.ts",
  "tools/pipeline-v2/src/commands/export/route-capability-manifest.ts",
  "tools/pipeline-v2/src/commands/export/route-dossier-summaries.ts",
  "tools/pipeline-v2/src/commands/map/artifacts.ts",
]);

const ANALYSIS_PERIOD_IDENTITY_FILES = new Set([
  "apps/web/src/studio/api-client.ts",
  "packages/analytics/src/evaluation/map-artifacts.ts",
  "packages/domain/src/maps/index.ts",
  "tools/pipeline-v2/src/checks/check-publish-completeness.ts",
  "tools/pipeline-v2/src/commands/export/d1.ts",
  "tools/pipeline-v2/src/commands/map/artifacts.ts",
  "tools/pipeline-v2/src/commands/publish/r2-artifacts.ts",
  "tools/pipeline-v2/src/commands/verify/d1.ts",
]);

const STUDIO_RELEASE_FILE = "tools/pipeline-v2/src/commands/studio/release.ts";
const STUDIO_RELEASE_MAP_ANALYSIS_PERIOD =
  /\b(analysisPeriod)(?=\s*:\s*(?:options\.month|null)\b)/g;

const REGISTRY_FILE = "packages/analytics/src/data-products/registry.ts";

const IDENTITY_PHRASE_FILES = new Set([
  REGISTRY_FILE,
  "packages/analytics/src/evaluation/build-route-capability-manifest.ts",
  "packages/analytics/src/evaluation/build-route-dossier-summary.ts",
  "packages/analytics/src/evaluation/map-artifacts.ts",
  "packages/domain/src/routes/index.ts",
  "packages/domain/src/studio/route-capability.ts",
  "packages/studio-api/src/studio/route-index-read-model.ts",
  "tools/pipeline-v2/src/commands/audit/map-artifacts.ts",
  "tools/pipeline-v2/src/commands/plan/source-refresh.ts",
  "tools/pipeline-v2/src/commands/publish/r2-artifacts.ts",
]);

const PUBLIC_SELECTOR_METHOD =
  /\bsearchParams\s*(?:\.\s*(?:get|getAll|has|set|append|delete)|\?\.\s*(?:get|getAll|has|set|append|delete)|\[\s*["'`](?:get|getAll|has|set|append|delete)["'`]\s*\]|\?\.\s*\[\s*["'`](?:get|getAll|has|set|append|delete)["'`]\s*\])\s*(?:\?\.\s*)?\(\s*["'`]month["'`]/g;
const PUBLIC_STATIC_MONTH_QUERY = /[?&]month\s*=/g;
const URL_SEARCH_PARAMS_OBJECT = /\bnew\s+URLSearchParams\s*\(\s*\{/g;
const PUBLICATION_MONTH_SELECTOR =
  /(?:publish(?::|\s+)serving-release[^\n]*--month|--month[^\n]*publish(?::|\s+)serving-release)/g;
const SILENT_RELEASE_DEFAULT =
  /(?:\b(?:year|month)\s*:\s*arg\s*\.\s*positiveInt\s*\(\s*\)\s*\.\s*pipe\s*\(\s*Schema\.withDecodingDefaultTypeKey\b|\bdefault\s*:\s*["'`]\d{4}-(?:0[1-9]|1[0-2])["'`])/g;

const WHOLE_MONTH_LITERAL = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const LOCAL_MONTH_PATH_SEGMENT = /(?:^|\/)\d{4}-(?:0[1-9]|1[0-2])(?:\/|$)/;
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isExcludedProductionPath(path: string): boolean {
  return normalizePath(path)
    .split("/")
    .some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function isPublicRuntimeFile(file: string): boolean {
  return file.startsWith("apps/web/src/") || file.startsWith("packages/studio-api/src/");
}

function isPublicationOperationalSurface(file: string): boolean {
  return (
    file.startsWith(".github/workflows/") ||
    file === "tools/pipeline-v2/src/commands/export/d1.ts" ||
    file === "tools/pipeline-v2/src/commands/verify/d1.ts" ||
    file.startsWith("tools/pipeline-v2/src/commands/publish/") ||
    file.startsWith("scripts/publish")
  );
}

function isPinnedIdentitySurface(file: string): boolean {
  return (
    file === "apps/web/wrangler.jsonc" ||
    file.startsWith("apps/web/src/") ||
    file.startsWith("packages/studio-api/src/") ||
    file.startsWith("packages/domain/src/routes/") ||
    file.startsWith("packages/domain/src/maps/") ||
    file === "packages/domain/src/studio/release.ts" ||
    file === "packages/analytics/src/evaluation/map-artifacts.ts" ||
    file.startsWith("tools/pipeline-v2/src/commands/map/") ||
    file === "tools/pipeline-v2/src/commands/studio/_release-types.ts" ||
    file === STUDIO_RELEASE_FILE ||
    file.startsWith("tools/pipeline-v2/src/commands/publish/") ||
    file === "tools/pipeline-v2/src/commands/verify/d1.ts" ||
    file === "tools/pipeline-v2/src/commands/export/d1.ts" ||
    file === "tools/pipeline-v2/src/checks/check-publish-completeness.ts"
  );
}

function freshGlobalRegex(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function location(text: string, index: number): { line: number; column: number } {
  const prefix = text.slice(0, index);
  const lastNewline = prefix.lastIndexOf("\n");
  return {
    line: prefix.split("\n").length,
    column: index - lastNewline,
  };
}

function addViolation(
  violations: MonthDoctrineViolation[],
  source: MonthDoctrineSourceFile,
  rule: MonthDoctrineRuleId,
  index: number,
  match: string,
): void {
  const at = location(source.text, index);
  violations.push({
    file: source.file,
    rule,
    index,
    line: at.line,
    column: at.column,
    match,
  });
}

function collectRegex(
  violations: MonthDoctrineViolation[],
  source: MonthDoctrineSourceFile,
  rule: MonthDoctrineRuleId,
  pattern: RegExp,
  captureIndex = 0,
): void {
  const regex = freshGlobalRegex(pattern);
  for (const match of source.text.matchAll(regex)) {
    const captured = match[captureIndex];
    if (captured === undefined || match.index === undefined) continue;
    const relativeIndex = captureIndex === 0 ? 0 : match[0].lastIndexOf(captured);
    addViolation(violations, source, rule, match.index + relativeIndex, captured);
  }
}

function skipTrivia(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    if (/\s/.test(text[index] as string)) {
      index += 1;
      continue;
    }
    if (text[index] === "/" && text[index + 1] === "/") {
      const newline = text.indexOf("\n", index + 2);
      index = newline < 0 ? text.length : newline + 1;
      continue;
    }
    if (text[index] === "/" && text[index + 1] === "*") {
      const close = text.indexOf("*/", index + 2);
      index = close < 0 ? text.length : close + 2;
      continue;
    }
    break;
  }
  return index;
}

function collectUrlSearchParamsObjectSelectors(
  violations: MonthDoctrineViolation[],
  source: MonthDoctrineSourceFile,
): void {
  const constructorPattern = freshGlobalRegex(URL_SEARCH_PARAMS_OBJECT);
  for (const match of source.text.matchAll(constructorPattern)) {
    if (match.index === undefined) continue;
    const openBraceIndex = match.index + match[0].lastIndexOf("{");
    let curlyDepth = 1;
    let squareDepth = 0;
    let parenthesisDepth = 0;
    let propertyStart = true;

    for (let index = openBraceIndex + 1; index < source.text.length; index += 1) {
      const char = source.text[index];
      const next = source.text[index + 1];
      if (char === "/" && next === "/") {
        const newline = source.text.indexOf("\n", index + 2);
        index = newline < 0 ? source.text.length : newline;
        continue;
      }
      if (char === "/" && next === "*") {
        const close = source.text.indexOf("*/", index + 2);
        index = close < 0 ? source.text.length : close + 1;
        continue;
      }
      if (char === "'" || char === '"' || char === "`") {
        const literal = readStringLiteral(source.text, index, char);
        if (curlyDepth === 1 && squareDepth === 0 && parenthesisDepth === 0 && propertyStart) {
          const colon = skipTrivia(source.text, literal.end);
          if (literal.value === "month" && source.text[colon] === ":") {
            addViolation(violations, source, "public-month-selector", index + 1, "month");
          }
          propertyStart = false;
        }
        index = literal.end - 1;
        continue;
      }
      if (char === "/" && looksLikeRegexStart(source.text, index)) {
        index = skipRegexLiteral(source.text, index) - 1;
        if (curlyDepth === 1 && squareDepth === 0 && parenthesisDepth === 0) {
          propertyStart = false;
        }
        continue;
      }
      if (char === "{") {
        curlyDepth += 1;
        continue;
      }
      if (char === "}") {
        curlyDepth -= 1;
        if (curlyDepth === 0) break;
        continue;
      }
      if (curlyDepth !== 1) continue;
      if (char === "[") {
        squareDepth += 1;
        propertyStart = false;
        continue;
      }
      if (char === "]") {
        squareDepth = Math.max(0, squareDepth - 1);
        continue;
      }
      if (char === "(") {
        parenthesisDepth += 1;
        propertyStart = false;
        continue;
      }
      if (char === ")") {
        parenthesisDepth = Math.max(0, parenthesisDepth - 1);
        continue;
      }
      if (squareDepth > 0 || parenthesisDepth > 0) continue;
      if (char === ",") {
        propertyStart = true;
        continue;
      }
      if (!propertyStart || /\s/.test(char as string)) continue;

      const identifier = source.text.slice(index).match(/^[A-Za-z_$][\w$]*/)?.[0];
      if (identifier !== undefined) {
        const colon = skipTrivia(source.text, index + identifier.length);
        if (identifier === "month" && source.text[colon] === ":") {
          addViolation(violations, source, "public-month-selector", index, identifier);
        }
        propertyStart = false;
        index += identifier.length - 1;
        continue;
      }
      propertyStart = false;
    }
  }
}

type StringLiteral = { index: number; value: string };

function previousSignificantCharacter(text: string, index: number): string | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/.test(text[cursor] as string)) return text[cursor] as string;
  }
  return null;
}

function looksLikeRegexStart(text: string, index: number): boolean {
  const previous = previousSignificantCharacter(text, index);
  return previous === null || "([{:;,=!?&|+-*%^~<>".includes(previous);
}

function skipRegexLiteral(text: string, start: number): number {
  let inCharacterClass = false;
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "[") inCharacterClass = true;
    if (char === "]") inCharacterClass = false;
    if (char === "/" && !inCharacterClass) {
      let cursor = index + 1;
      while (/[A-Za-z]/.test(text[cursor] ?? "")) cursor += 1;
      return cursor;
    }
    if (char === "\n") return index;
  }
  return text.length;
}

function skipTemplateExpression(text: string, start: number, literals?: StringLiteral[]): number {
  let depth = 1;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "/" && next === "/") {
      const newline = text.indexOf("\n", index + 2);
      index = newline < 0 ? text.length : newline;
      continue;
    }
    if (char === "/" && next === "*") {
      const close = text.indexOf("*/", index + 2);
      index = close < 0 ? text.length : close + 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      const literal = readStringLiteral(text, index, char, literals);
      literals?.push({ index, value: literal.value });
      index = literal.end - 1;
      continue;
    }
    if (char === "/" && looksLikeRegexStart(text, index)) {
      index = skipRegexLiteral(text, index) - 1;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return text.length;
}

function readStringLiteral(
  text: string,
  start: number,
  quote: "'" | '"' | "`",
  nestedLiterals?: StringLiteral[],
): { end: number; value: string } {
  let value = "";
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") {
      const escaped = text[index + 1];
      if (escaped !== undefined) {
        value += escaped;
        index += 1;
      }
      continue;
    }
    if (char === quote) return { end: index + 1, value };
    if (quote === "`" && char === "$" && text[index + 1] === "{") {
      value += "<expression>";
      index = skipTemplateExpression(text, index + 2, nestedLiterals) - 1;
      continue;
    }
    value += char;
  }
  return { end: text.length, value };
}

function lexStringLiterals(text: string): StringLiteral[] {
  const literals: StringLiteral[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "/" && next === "/") {
      const newline = text.indexOf("\n", index + 2);
      index = newline < 0 ? text.length : newline;
      continue;
    }
    if (char === "/" && next === "*") {
      const close = text.indexOf("*/", index + 2);
      index = close < 0 ? text.length : close + 1;
      continue;
    }
    if (char === "/" && looksLikeRegexStart(text, index)) {
      index = skipRegexLiteral(text, index) - 1;
      continue;
    }
    if (char !== "'" && char !== '"' && char !== "`") continue;
    const nestedLiterals: StringLiteral[] = [];
    const literal = readStringLiteral(text, index, char, nestedLiterals);
    literals.push({ index, value: literal.value });
    literals.push(...nestedLiterals);
    index = literal.end - 1;
  }
  return literals;
}

function collectPinnedIdentityMonths(
  violations: MonthDoctrineViolation[],
  source: MonthDoctrineSourceFile,
): void {
  for (const literal of lexStringLiterals(source.text)) {
    if (URI_SCHEME.test(literal.value)) continue;
    if (WHOLE_MONTH_LITERAL.test(literal.value) || LOCAL_MONTH_PATH_SEGMENT.test(literal.value)) {
      addViolation(violations, source, "pinned-identity-month", literal.index, literal.value);
    }
  }
}

export function collectViolations(
  sourceFiles: readonly MonthDoctrineSourceFile[],
): MonthDoctrineViolation[] {
  const violations: MonthDoctrineViolation[] = [];

  for (const rawSource of sourceFiles) {
    const source = { ...rawSource, file: normalizePath(rawSource.file) };
    if (isExcludedProductionPath(source.file)) continue;

    collectRegex(violations, source, "retired-identity-token", RETIRED_IDENTITY_TOKEN);

    if (RELEASE_MONTH_IDENTITY_FILES.has(source.file)) {
      collectRegex(violations, source, "release-month-identity", RELEASE_MONTH_IDENTITY);
    }

    if (ANALYSIS_PERIOD_IDENTITY_FILES.has(source.file)) {
      collectRegex(violations, source, "analysis-period-identity", ANALYSIS_PERIOD_IDENTITY);
    } else if (source.file === STUDIO_RELEASE_FILE) {
      collectRegex(
        violations,
        source,
        "analysis-period-identity",
        STUDIO_RELEASE_MAP_ANALYSIS_PERIOD,
        1,
      );
    }

    if (source.file === REGISTRY_FILE) {
      collectRegex(violations, source, "serialized-release-month", SERIALIZED_RELEASE_MONTH);
    }

    if (IDENTITY_PHRASE_FILES.has(source.file)) {
      collectRegex(violations, source, "identity-phrase", IDENTITY_PHRASE);
    }

    if (isPublicRuntimeFile(source.file)) {
      collectRegex(violations, source, "public-month-selector", PUBLIC_SELECTOR_METHOD);
      collectRegex(violations, source, "public-month-selector", PUBLIC_STATIC_MONTH_QUERY);
      collectUrlSearchParamsObjectSelectors(violations, source);
    }

    if (isPublicationOperationalSurface(source.file)) {
      collectRegex(violations, source, "public-month-selector", PUBLICATION_MONTH_SELECTOR);
      collectRegex(violations, source, "silent-release-default", SILENT_RELEASE_DEFAULT);
    }

    if (isPinnedIdentitySurface(source.file)) {
      collectPinnedIdentityMonths(violations, source);
    }
  }

  const unique = new Map<string, MonthDoctrineViolation>();
  for (const violation of violations) {
    unique.set(`${violation.file}\0${violation.rule}\0${violation.index}`, violation);
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.rule.localeCompare(right.rule) ||
      left.index - right.index,
  );
}

async function readGlob(pattern: string): Promise<string[]> {
  const glob = new Bun.Glob(pattern);
  const files: string[] = [];
  for await (const file of glob.scan({ cwd: process.cwd(), onlyFiles: true })) {
    const normalized = normalizePath(file);
    if (!isExcludedProductionPath(normalized)) files.push(normalized);
  }
  return files;
}

export async function readProductionFiles(): Promise<MonthDoctrineSourceFile[]> {
  const paths = new Set<string>();
  for (const pattern of [
    "packages/*/src/**/*.{ts,tsx}",
    "apps/web/src/**/*.{ts,tsx}",
    "tools/pipeline-v2/src/**/*.{ts,tsx}",
    "scripts/**/*.{sh,ts}",
    ".github/workflows/*.yml",
    "apps/web/wrangler*.jsonc",
  ]) {
    for (const file of await readGlob(pattern)) paths.add(file);
  }
  const files: MonthDoctrineSourceFile[] = [];
  for (const file of [...paths].sort((left, right) => left.localeCompare(right))) {
    files.push({ file, text: await Bun.file(file).text() });
  }
  return files;
}

const RULE_ID_SET = new Set<string>(MONTH_DOCTRINE_RULE_IDS);
const DISPOSITION_SET = new Set<string>(MONTH_DOCTRINE_DISPOSITIONS);

function pairKey(file: string, rule: string): string {
  return `${file}\0${rule}`;
}

export function auditAllowlist(
  entries: readonly MonthDoctrineAllowlistEntry[],
  violations: readonly MonthDoctrineViolation[],
  sourceFiles: readonly MonthDoctrineSourceFile[],
  options: { allowPermanent?: boolean } = {},
): string[] {
  const errors: string[] = [];
  const files = new Set(sourceFiles.map((source) => normalizePath(source.file)));
  const actualCounts = new Map<string, number>();
  for (const violation of violations) {
    const key = pairKey(violation.file, violation.rule);
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
  }

  const seen = new Set<string>();
  let previousKey: string | null = null;
  for (const rawEntry of entries as readonly Record<string, unknown>[]) {
    const fileValue = rawEntry["file"];
    const ruleValue = rawEntry["rule"];
    const dispositionValue = rawEntry["disposition"];
    const file = typeof fileValue === "string" ? normalizePath(fileValue) : "";
    const rule = typeof ruleValue === "string" ? ruleValue : "";
    const disposition = typeof dispositionValue === "string" ? dispositionValue : "";
    const count = rawEntry["count"];
    const note = rawEntry["note"];
    const key = pairKey(file, rule);

    if (!RULE_ID_SET.has(rule)) errors.push(`unknown rule for ${file}: ${rule}`);
    if (!DISPOSITION_SET.has(disposition)) {
      errors.push(`invalid disposition for ${file}/${rule}: ${disposition}`);
    }
    if (!Number.isInteger(count) || (count as number) <= 0) {
      errors.push(`count must be a positive integer for ${file}/${rule}`);
    }
    if (typeof note !== "string" || note.trim().length === 0) {
      errors.push(`note must be non-empty for ${file}/${rule}`);
    }
    if (!files.has(file)) errors.push(`allowlist file is not scanned or does not exist: ${file}`);
    if (seen.has(key)) errors.push(`duplicate allowlist pair: ${file}/${rule}`);
    seen.add(key);
    if (previousKey !== null && key.localeCompare(previousKey) < 0) {
      errors.push(`allowlist entries are not sorted: ${file}/${rule}`);
    }
    previousKey = key;
    if (disposition === "permanent-frozen-artifact" && options.allowPermanent === false) {
      errors.push(`permanent entry is forbidden at initial landing: ${file}/${rule}`);
    }

    if (typeof count === "number" && Number.isInteger(count) && count > 0) {
      const actual = actualCounts.get(key) ?? 0;
      if (actual > count) {
        errors.push(`allowlist growth for ${file}/${rule}: expected ${count}, found ${actual}`);
      } else if (actual < count) {
        errors.push(`stale allowlist for ${file}/${rule}: expected ${count}, found ${actual}`);
      }
    }
  }

  for (const [key, count] of actualCounts) {
    if (seen.has(key)) continue;
    const [file, rule] = key.split("\0");
    errors.push(`unlisted violation pair: ${file}/${rule} (${count})`);
  }

  return errors;
}

function violationsFor(
  file: string,
  text: string,
  rule?: MonthDoctrineRuleId,
): MonthDoctrineViolation[] {
  const violations = collectViolations([{ file, text }]);
  return rule === undefined
    ? violations
    : violations.filter((violation) => violation.rule === rule);
}

describe("month doctrine scanner", () => {
  test("current tree matches the exact shrink-only baseline", async () => {
    const files = await readProductionFiles();
    const violations = collectViolations(files);
    expect(auditAllowlist(MONTH_DOCTRINE_ALLOWLIST, violations, files)).toEqual([]);
  });

  test("retired tokens are exact and embedded storage names remain legal", () => {
    const retiredTokens = [
      "baselineMonth",
      "BASELINE_MONTH",
      "LAST_BUILT_SPEED_MONTH",
      "canonicalMonthlyRelease",
      "baseline_release",
      "partial_public_monthly_only",
      "baseline_mismatch",
    ];
    const violations = violationsFor(
      "apps/web/src/example.ts",
      `${retiredTokens.join(" ")} local_route_reliability_baseline_release baselineMonthValue`,
      "retired-identity-token",
    );
    expect(violations.map((violation) => violation.match)).toEqual(retiredTokens);
  });

  test("releaseMonth is scoped to active release identity surfaces", () => {
    const identitySurfaces = [
      "packages/analytics/src/evaluation/build-route-capability-manifest.ts",
      "packages/analytics/src/evaluation/build-route-dossier-summary.ts",
      "packages/analytics/src/evaluation/map-artifacts.ts",
      "packages/domain/src/studio/route-capability.ts",
      "packages/domain/src/studio/route-dossier.ts",
      "packages/studio-api/src/studio/read-handlers.ts",
      "tools/pipeline-v2/src/commands/export/d1.ts",
      "tools/pipeline-v2/src/commands/export/route-capability-manifest.ts",
      "tools/pipeline-v2/src/commands/export/route-dossier-summaries.ts",
      "tools/pipeline-v2/src/commands/map/artifacts.ts",
    ];
    expect([...RELEASE_MONTH_IDENTITY_FILES].sort()).toEqual(identitySurfaces);
    for (const file of identitySurfaces) {
      expect(
        violationsFor(file, "releaseMonth releaseMonthRowCount", "release-month-identity"),
      ).toHaveLength(1);
    }
    expect(
      violationsFor(
        "tools/pipeline-v2/src/commands/export/d1-inputs.ts",
        "const releaseMonth = sourceCoverage.endMonth",
        "release-month-identity",
      ),
    ).toEqual([]);
    expect(
      violationsFor(
        "tools/pipeline-v2/src/commands/ingest/example.ts",
        "const releaseMonth = sourceWindow.endMonth",
        "release-month-identity",
      ),
    ).toEqual([]);
  });

  test("analysisPeriod is scoped to release identity and the two map output keys", () => {
    const identitySurfaces = [
      "apps/web/src/studio/api-client.ts",
      "packages/analytics/src/evaluation/map-artifacts.ts",
      "packages/domain/src/maps/index.ts",
      "tools/pipeline-v2/src/checks/check-publish-completeness.ts",
      "tools/pipeline-v2/src/commands/export/d1.ts",
      "tools/pipeline-v2/src/commands/map/artifacts.ts",
      "tools/pipeline-v2/src/commands/publish/r2-artifacts.ts",
      "tools/pipeline-v2/src/commands/verify/d1.ts",
    ];
    expect([...ANALYSIS_PERIOD_IDENTITY_FILES].sort()).toEqual(identitySurfaces);
    for (const file of identitySurfaces) {
      expect(violationsFor(file, "analysisPeriod", "analysis-period-identity")).toHaveLength(1);
    }
    expect(
      violationsFor(
        STUDIO_RELEASE_FILE,
        "analysisPeriod: options.month, analysisPeriod: null, analysisPeriod: routeBrief.analysisPeriod",
        "analysis-period-identity",
      ),
    ).toHaveLength(2);
    for (const legalWindowFile of [
      "packages/analytics/src/interventions/route-treatment-summary.ts",
      "tools/pipeline-v2/src/commands/study/run.ts",
      "tools/pipeline-v2/src/lib/route-briefs/model.ts",
      "tools/pipeline-v2/src/commands/route/equity-context.ts",
    ]) {
      expect(violationsFor(legalWindowFile, "analysisPeriod", "analysis-period-identity")).toEqual(
        [],
      );
    }
  });

  test("serialized keys and identity phrases stay on their audited surfaces", () => {
    expect(
      violationsFor(REGISTRY_FILE, '"release_month"', "serialized-release-month"),
    ).toHaveLength(1);
    expect(
      violationsFor(
        "tools/pipeline-v2/src/commands/check/example.ts",
        'reason = "release_month_mismatch"',
        "serialized-release-month",
      ),
    ).toEqual([]);
    expect(
      violationsFor(
        REGISTRY_FILE,
        "monthly-release baseline\nmonth release-month",
        "identity-phrase",
      ),
    ).toHaveLength(3);
    expect(
      violationsFor(
        "packages/sources/src/example.ts",
        "monthly release baseline month release month",
        "identity-phrase",
      ),
    ).toEqual([]);
  });

  test("public selectors cover method, optional, bracket, static, and object variants", () => {
    const methodSelectors = [
      'url.searchParams . get ( "month" )',
      "url.searchParams.getAll('month')",
      "url.searchParams.has(`month`)",
      'url.searchParams . set ( "month", value )',
      "url.searchParams.append('month', value)",
      "url.searchParams.delete(`month`)",
      "url.searchParams ?. get ?. ( 'month' )",
      'url.searchParams [ "has" ] ( `month` )',
      "url.searchParams ?. [ 'delete' ] ?. ( \"month\" )",
    ];
    for (const selector of methodSelectors) {
      expect(
        violationsFor("packages/studio-api/src/example.ts", selector, "public-month-selector"),
      ).toHaveLength(1);
    }
    expect(
      violationsFor(
        "packages/studio-api/src/example.ts",
        'const a = "?month="; const b = "&month =";',
        "public-month-selector",
      ),
    ).toHaveLength(2);
    expect(
      violationsFor(
        "packages/studio-api/src/example.ts",
        `
          new URLSearchParams({ month: value });
          new URLSearchParams({ q, 'month': value });
          new URLSearchParams({ q, "month" /* key */ : value });
          new URLSearchParams({ q, \`month\`: value });
          new URLSearchParams({ q, /* product selector */ month: release });
        `,
        "public-month-selector",
      ),
    ).toHaveLength(5);
    expect(
      violationsFor(
        "packages/studio-api/src/example.ts",
        `
          url.searchParams.get("asOfMonth");
          new URLSearchParams({ key: "month" });
          new URLSearchParams({ filter: { month: selected } });
        `,
        "public-month-selector",
      ),
    ).toEqual([]);
  });

  test("pinned literal lexer ignores comments, URIs, dates, timestamps, and regexes", () => {
    const text = [
      '// "2025-01"',
      "/* '/2025-02/' */",
      'const whole = "2026-03";',
      "const local = 'data/exports/d1/2026-04/schema.sql';",
      "const template = `2026-05`;",
      'const url = "https://example.test/data/2026-06/file.json";',
      'const date = "2026-07-01";',
      'const timestamp = "2026-08-01T00:00:00.000Z";',
      'const pattern = /"2026-09"/;',
      'const nested = `${"2026-10"}`;',
    ].join("\n");
    expect(violationsFor(STUDIO_RELEASE_FILE, text, "pinned-identity-month")).toHaveLength(4);
    expect(
      violationsFor(
        "tools/pipeline-v2/src/commands/ingest/example.ts",
        'const sourceCoverageStart = "2026-03"',
        "pinned-identity-month",
      ),
    ).toEqual([]);
  });

  test("legal month grain and excluded path segments remain legal", () => {
    const legal =
      "month startMonth endMonth implementationMonth IsoMonth --month monthly ridership releaseMonthRowCount";
    expect(violationsFor("apps/web/src/example.ts", legal)).toEqual([]);
    expect(violationsFor("apps/web/src/tests/example.ts", "baselineMonth")).toEqual([]);
    expect(violationsFor("apps/web/src/worker/example.gen.ts", "baselineMonth")).toHaveLength(1);
    expect(violationsFor("apps/web/src/dev/example.ts", "baselineMonth")).toHaveLength(1);
  });

  test("operational publication surfaces reject release selectors and silent defaults", () => {
    expect(
      violationsFor(
        "scripts/publish-serving-release.sh",
        "bun pipeline publish serving-release --month 2026-03",
        "public-month-selector",
      ),
    ).toHaveLength(1);
    expect(
      violationsFor(
        ".github/workflows/publication.yml",
        'default: "2026-03"',
        "silent-release-default",
      ),
    ).toHaveLength(1);
    expect(
      violationsFor(
        "tools/pipeline-v2/src/commands/export/d1.ts",
        "month: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))",
        "silent-release-default",
      ),
    ).toHaveLength(1);
    expect(
      violationsFor(
        "tools/pipeline-v2/src/commands/ingest/route-segment-speeds.ts",
        "--month 2026-03 monthly chart source/2026-03/partition.json IsoMonth",
      ),
    ).toEqual([]);
  });

  test("allowlist audit rejects drift and can enforce the initial permanent-entry guard", () => {
    const file = "apps/web/src/example.ts";
    const files = [{ file, text: "baselineMonth" }];
    const violations = collectViolations(files);
    const valid: MonthDoctrineAllowlistEntry = {
      file,
      rule: "retired-identity-token",
      count: 1,
      disposition: "retire-085",
      note: "Plan 085 removes the fixture token.",
    };
    expect(auditAllowlist([valid], violations, files, { allowPermanent: false })).toEqual([]);
    expect(auditAllowlist([], violations, files).join("\n")).toContain("unlisted");
    expect(auditAllowlist([{ ...valid, count: 2 }], violations, files).join("\n")).toContain(
      "stale",
    );

    const growthFiles = [{ file: "apps/web/src/example.ts", text: "baselineMonth BASELINE_MONTH" }];
    expect(
      auditAllowlist([valid], collectViolations(growthFiles), growthFiles).join("\n"),
    ).toContain("growth");
    expect(auditAllowlist([valid, valid], violations, files).join("\n")).toContain("duplicate");
    expect(auditAllowlist([{ ...valid, note: "" }], violations, files).join("\n")).toContain(
      "note",
    );
    expect(
      auditAllowlist(
        [{ ...valid, count: 0 }] as readonly MonthDoctrineAllowlistEntry[],
        violations,
        files,
      ).join("\n"),
    ).toContain("positive integer");
    expect(
      auditAllowlist(
        [
          {
            ...valid,
            disposition: "keep-forever" as MonthDoctrineDisposition,
          },
        ],
        violations,
        files,
      ).join("\n"),
    ).toContain("invalid disposition");
    expect(
      auditAllowlist(
        [{ ...valid, rule: "unknown-rule" as MonthDoctrineRuleId }],
        violations,
        files,
      ).join("\n"),
    ).toContain("unknown rule");
    expect(
      auditAllowlist([{ ...valid, file: "apps/web/src/missing.ts" }], violations, files).join("\n"),
    ).toContain("does not exist");
    expect(
      auditAllowlist([{ ...valid, disposition: "permanent-frozen-artifact" }], violations, files),
    ).toEqual([]);
    expect(
      auditAllowlist([{ ...valid, disposition: "permanent-frozen-artifact" }], violations, files, {
        allowPermanent: false,
      }).join("\n"),
    ).toContain("forbidden at initial landing");
  });

  test("allowlist entries must be sorted by file and rule", () => {
    const files = [
      { file: "apps/web/src/a.ts", text: "baselineMonth" },
      { file: "apps/web/src/b.ts", text: "baselineMonth" },
    ];
    const entries: MonthDoctrineAllowlistEntry[] = [
      {
        file: "apps/web/src/b.ts",
        rule: "retired-identity-token",
        count: 1,
        disposition: "retire-085",
        note: "Plan 085 removes it.",
      },
      {
        file: "apps/web/src/a.ts",
        rule: "retired-identity-token",
        count: 1,
        disposition: "retire-085",
        note: "Plan 085 removes it.",
      },
    ];
    expect(auditAllowlist(entries, collectViolations(files), files).join("\n")).toContain(
      "not sorted",
    );
  });
});
