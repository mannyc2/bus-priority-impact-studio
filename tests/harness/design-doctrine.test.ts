import { describe, expect, test } from "bun:test";

// Design doctrine (operator verdicts 2026-06-12 and 2026-07-06):
// 1. No interpunct metadata chains in UI source — write natural language.
// 2. No kicker eyebrows (small uppercase label over a heading).
// 3. Banned phrases that keep regressing.
// The allowlist is a RATCHET: it freezes violations that existed when this
// check landed. Gen-6 plans 051-059 delete them. Adding a file is forbidden;
// removing entries as files are cleaned is required (stale entries fail).

const SRC_ROOT = "apps/web/src";

const INTERPUNCT = /·|&middot;/; // the raw char AND the HTML entity (RPubSlowCard uses &middot;)
const KICKER_CLASS =
  /uppercase[^"'`]*tracking-\[0\.1[246]em\]|tracking-\[0\.1[246]em\][^"'`]*uppercase/;
const BANNED_PHRASES = [
  /civic data project/i,
  /feed generated/i,
  /data as of/i,
  /how we know this/i,
  /how to use this site/i,
  /in focus this month/i,
];

// Ratchet allowlist (paths relative to apps/web/src). Filled by the Step 2
// empty-allowlist pass so the frozen set is exact-by-construction. Each gen-6
// page plan removes its files as it lands; the stale-entry guard forces it.
const ALLOWLIST: Record<"interpunct" | "kicker" | "phrase", readonly string[]> = {
  interpunct: [
    "components/CorridorMap.tsx", // 054
    "components/CorridorProfile.chart.tsx", // 055
    "components/InterventionTimeline.tsx", // 057
    "components/TreatmentBadge.tsx", // 054/057
    "components/route/RouteGeoMap.tsx", // 054/060
    "components/route/RouteMapLibre.map.tsx", // 055
    "components/route/RoutePublicAtoms.tsx", // 055 (RPubSlowCard &middot;)
    "components/route/reliability-summary.ts", // 056
  ],
  kicker: [
    "components/route/RouteMapSection.tsx", // 053/055
    "components/route/RoutePublicAtoms.tsx", // 055 (RPubSlowCard slow-segment kicker)
    "studio/pages/network-map.tsx", // 059
  ],
  phrase: [],
};

type SrcFile = { rel: string; text: string };

async function readSrcFiles(): Promise<SrcFile[]> {
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  const files: SrcFile[] = [];
  for await (const rel of glob.scan({ cwd: SRC_ROOT, onlyFiles: true })) {
    const guarded = `/${rel}`;
    if (guarded.includes("/dev/") || guarded.includes("/worker/")) continue;
    if (rel.endsWith(".gen.ts")) continue;
    files.push({ rel, text: await Bun.file(`${SRC_ROOT}/${rel}`).text() });
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

// Interpunct is checked per line so a `design-doctrine-allow` comment can
// exempt a future legitimate typographic use (none exists today).
function violatesInterpunct(text: string): boolean {
  return text
    .split("\n")
    .some((line) => INTERPUNCT.test(line) && !line.includes("design-doctrine-allow"));
}

function collect(files: SrcFile[], predicate: (text: string) => boolean): string[] {
  return files.filter((file) => predicate(file.text)).map((file) => file.rel);
}

function audit(violators: string[], allowlist: readonly string[]) {
  const violatorSet = new Set(violators);
  const notAllowed = violators.filter((rel) => !allowlist.includes(rel));
  const stale = allowlist.filter((rel) => !violatorSet.has(rel));
  return { notAllowed, stale };
}

describe("design doctrine", () => {
  test("no un-allowlisted interpunct metadata chains", async () => {
    const files = await readSrcFiles();
    const { notAllowed, stale } = audit(collect(files, violatesInterpunct), ALLOWLIST.interpunct);
    expect(
      notAllowed,
      "files use interpunct metadata chains — write natural language or move meta into SourceNote",
    ).toEqual([]);
    expect(stale, "stale interpunct allowlist entries — remove them").toEqual([]);
  });

  test("no un-allowlisted kicker eyebrows", async () => {
    const files = await readSrcFiles();
    const { notAllowed, stale } = audit(
      collect(files, (text) => KICKER_CLASS.test(text)),
      ALLOWLIST.kicker,
    );
    expect(
      notAllowed,
      "files use a kicker eyebrow (uppercase + tracking 0.12-0.16em over a heading)",
    ).toEqual([]);
    expect(stale, "stale kicker allowlist entries — remove them").toEqual([]);
  });

  test("no un-allowlisted banned phrases", async () => {
    const files = await readSrcFiles();
    const { notAllowed, stale } = audit(
      collect(files, (text) => BANNED_PHRASES.some((re) => re.test(text))),
      ALLOWLIST.phrase,
    );
    expect(notAllowed, "files contain a banned doctrine phrase").toEqual([]);
    expect(stale, "stale phrase allowlist entries — remove them").toEqual([]);
  });

  test("KICKER_CLASS flags eyebrows but not functional small-caps labels", () => {
    expect(KICKER_CLASS.test("text-[11px] font-semibold uppercase tracking-[0.12em]")).toBe(true);
    expect(KICKER_CLASS.test("tracking-[0.16em] uppercase")).toBe(true);
    expect(KICKER_CLASS.test("font-bold uppercase tracking-[0.08em]")).toBe(false);
    expect(KICKER_CLASS.test("tracking-[0.1em] uppercase")).toBe(false);
  });

  test("BANNED_PHRASES match prose forms but not identifiers", () => {
    const matches = (text: string) => BANNED_PHRASES.some((re) => re.test(text));
    expect(matches("route feed generated")).toBe(true);
    expect(matches("Data as of Jun 2026")).toBe(true);
    expect(matches("generatedAt")).toBe(false);
  });
});
