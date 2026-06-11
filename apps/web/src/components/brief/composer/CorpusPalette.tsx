import { Search } from "lucide-react";
import type { ReactNode } from "react";
import type { ClaimEvidence } from "@/studio/api-contract.js";

// Shared corpus sample — the Madison-corridor speed trend, matching the brief.
const MADISON_SPARK = [7.6, 7.4, 7.1, 6.9, 6.8, 6.7, 6.4, 6.2, 6.1, 5.9, 5.8, 5.6, 5.4, 5.2];

const FRAME = { w: 96, h: 50 };

function ThumbFrame({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[4px]"
      style={{
        width: FRAME.w,
        height: FRAME.h,
        background: dark ? "var(--bp-color-ink)" : "var(--bp-color-card)",
        boxShadow: `inset 0 0 0 1px ${dark ? "rgba(244,241,234,.14)" : "var(--bp-color-rule)"}`,
      }}
    >
      {children}
    </div>
  );
}

/** Segment card → mini observed-vs-scheduled speed trend. */
function PreviewSegment() {
  const d = MADISON_SPARK;
  const W = 84;
  const H = 38;
  const padX = 5;
  const padT = 6;
  const padB = 7;
  const lo = 4.9;
  const hi = 7.8;
  const sched = 7.4;
  const x = (i: number) => padX + i * ((W - 2 * padX) / (d.length - 1));
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const line = d.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(d.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  return (
    <ThumbFrame>
      <svg width={W} height={H} className="block" aria-hidden="true">
        <line
          x1={padX}
          x2={W - padX}
          y1={y(sched)}
          y2={y(sched)}
          stroke="var(--bp-color-ink-40)"
          strokeDasharray="3 2.5"
          strokeWidth="1"
        />
        <path d={area} fill="var(--bp-color-bad)" opacity="0.12" />
        <path
          d={line}
          fill="none"
          stroke="var(--bp-color-bad)"
          strokeWidth="1.7"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={x(d.length - 1)} cy={y(d[d.length - 1] as number)} r="2.4" fill="var(--bp-color-bad)" />
      </svg>
    </ThumbFrame>
  );
}

/** Hour pattern → 24-bar day profile, peaks marked. */
function PreviewHourPattern() {
  const spd = [
    8.1, 8.2, 8.3, 8.4, 8.2, 7.6, 6.8, 5.4, 4.9, 5.5, 5.9, 6.0, 5.8, 5.6, 5.4, 5.2, 4.8, 4.2, 4.6,
    5.8, 6.5, 7.0, 7.5, 7.8,
  ];
  const W = 84;
  const H = 36;
  const padB = 4;
  const padT = 4;
  const lo = 4;
  const hi = 8.6;
  const bw = (W - 4) / 24;
  const h = (v: number) => Math.max(2, ((v - lo) / (hi - lo)) * (H - padB - padT));
  return (
    <ThumbFrame>
      <svg width={W} height={H} className="block" aria-hidden="true">
        {spd.map((v, i) => {
          const peak = (i >= 7 && i <= 9) || (i >= 16 && i <= 19);
          const bh = h(v);
          return (
            <rect
              key={i}
              x={2 + i * bw + 0.4}
              width={bw - 0.8}
              y={H - padB - bh}
              height={bh}
              rx="0.6"
              fill={peak ? "var(--bp-color-bad)" : "var(--bp-color-ink-20)"}
            />
          );
        })}
      </svg>
    </ThumbFrame>
  );
}

/** Before / after → two bars on a shared axis + a delta tick. */
function PreviewBeforeAfter() {
  return (
    <ThumbFrame>
      <div className="flex w-[76px] flex-col gap-[7px]">
        <div className="relative h-[9px] rounded-[2px] bg-[var(--bp-color-ink-06)]">
          <div className="absolute inset-0 w-[58%] rounded-[2px] bg-[var(--bp-color-ink-40)]" />
        </div>
        <div className="relative h-[9px] rounded-[2px] bg-[var(--bp-color-ink-06)]">
          <div className="absolute inset-0 w-[82%] rounded-[2px] bg-[var(--bp-color-good)]" />
          <div className="absolute -top-0.5 -bottom-0.5 left-[58%] w-[1.5px] bg-[var(--bp-color-ink)]" />
        </div>
      </div>
    </ThumbFrame>
  );
}

/** Trace number (lineage) → a derivation flow ending in the result. */
function PreviewLineage() {
  const W = 84;
  const H = 36;
  const cy = 18;
  const resX = 73;
  return (
    <ThumbFrame>
      <svg width={W} height={H} className="block" aria-hidden="true">
        <line x1={9} x2={resX} y1={cy} y2={cy} stroke="var(--bp-color-ink-20)" strokeWidth="1.2" />
        <circle cx={9} cy={cy} r="6.5" fill="var(--bp-color-ink)" />
        <text
          x={9}
          y={cy + 3.4}
          fontSize="8.5"
          fontStyle="italic"
          fontWeight="700"
          fill="var(--bp-color-paper)"
          textAnchor="middle"
        >
          ƒ
        </text>
        {[31, 53].map((nx) => (
          <rect
            key={nx}
            x={nx - 4}
            y={cy - 4}
            width="8"
            height="8"
            rx="1.5"
            fill="var(--bp-color-accent-bg)"
            stroke="var(--bp-color-accent)"
            strokeWidth="1"
          />
        ))}
        <rect x={resX - 9} y={cy - 7} width="18" height="14" rx="3" fill="var(--bp-color-accent)" />
        <text x={resX} y={cy + 3.2} fontSize="7.5" fontWeight="700" fill="#fff" textAnchor="middle">
          43%
        </text>
      </svg>
    </ThumbFrame>
  );
}

/** Source / finding → dark chip with ◆ and a confidence micro-bar. */
function PreviewFinding() {
  return (
    <ThumbFrame dark>
      <div className="flex h-full w-full flex-col justify-between p-[9px]">
        <div className="flex items-center gap-[5px]">
          <span className="text-[9px] leading-none text-[var(--bp-color-accent)]">◆</span>
          <div className="h-[2.5px] w-[30px] rounded-[2px] bg-[rgba(244,241,234,.5)]" />
        </div>
        <div className="h-[2.5px] w-[44px] rounded-[2px] bg-[rgba(244,241,234,.22)]" />
        <div className="flex items-center gap-[5px]">
          <div className="h-[3.5px] flex-1 overflow-hidden rounded-[2px] bg-[rgba(244,241,234,.14)]">
            <div className="h-full w-[82%] bg-[var(--bp-color-good)]" />
          </div>
          <span className="font-mono text-[7.5px] font-bold text-[var(--bp-color-paper)]">82</span>
        </div>
      </div>
    </ThumbFrame>
  );
}

/** Projection → ascending scenario bars approaching a target line. */
function PreviewProjection() {
  const bars = [
    { v: 0.46, c: "var(--bp-color-ink-40)" },
    { v: 0.6, c: "var(--bp-color-warn)" },
    { v: 0.74, c: "var(--bp-color-warn)" },
    { v: 0.95, c: "var(--bp-color-good)" },
  ];
  return (
    <ThumbFrame>
      <div className="relative flex h-[30px] w-[76px] items-end gap-[5px]">
        {bars.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[1.5px]"
            style={{ height: `${b.v * 100}%`, background: b.c }}
          />
        ))}
        <div className="absolute -top-0.5 -bottom-0.5 right-0 w-[1.5px] bg-[var(--bp-color-accent)]" />
      </div>
    </ThumbFrame>
  );
}

const PREVIEW_BY_KIND: Record<ClaimEvidence["kind"], readonly (() => ReactNode)[]> = {
  chart: [PreviewSegment, PreviewHourPattern, PreviewBeforeAfter, PreviewProjection],
  number: [PreviewLineage],
  source: [PreviewFinding],
  caveat: [PreviewProjection],
};

const KIND_LABEL: Record<ClaimEvidence["kind"], string> = {
  chart: "FIGURE",
  number: "TRACE NUMBER",
  source: "SOURCE",
  caveat: "CAVEAT",
};

function previewFor(evidence: ClaimEvidence, index: number): ReactNode {
  const choices = PREVIEW_BY_KIND[evidence.kind];
  const Preview = choices[index % choices.length] as () => ReactNode;
  return <Preview />;
}

export type CorpusOption = {
  evidence: ClaimEvidence;
  best: boolean;
};

/**
 * The unified "insert from the corpus" surface. AI pre-selects its best match
 * (◆ BEST MATCH); ⏎ takes it, type to filter, esc keeps writing. Every row is a
 * crafted preview of the real figure it will stream in — no evidence shelf.
 */
export function CorpusPalette({
  query,
  options,
  width = 560,
  onPick,
}: {
  query: string;
  options: readonly CorpusOption[];
  width?: number;
  onPick: (evidenceId: string) => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-[8px] bg-[var(--bp-color-card-raised)] shadow-[0_22px_56px_rgba(22,20,15,.26),inset_0_0_0_1px_var(--bp-color-rule)]"
      style={{ width }}
      role="listbox"
      aria-label="Insert from the corpus"
    >
      <div className="flex items-center gap-[11px] px-[18px] py-3.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
        <Search size={16} className="text-[var(--bp-color-accent)]" />
        <span className="text-[14.5px] font-medium text-[var(--bp-color-ink)]">{query || " "}</span>
        <span className="inline-block h-[1.05em] w-0.5 animate-pulse rounded-[1px] bg-[var(--bp-color-accent)]" />
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] tracking-[0.04em] text-[var(--bp-color-ink-40)]">
          insert from the corpus
        </span>
      </div>

      <div className="py-1.5">
        {options.length === 0 ? (
          <div className="px-[18px] py-3 text-[12.5px] text-[var(--bp-color-ink-55)]">
            Everything in the corpus for this claim is already on the page.
          </div>
        ) : (
          options.map((option, index) => {
            const sel = option.best;
            return (
              <button
                key={option.evidence.id}
                type="button"
                onClick={() => onPick(option.evidence.id)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-[18px] py-2.5 text-left transition-colors hover:bg-[var(--bp-color-ink-06)]"
                style={
                  sel
                    ? {
                        background: "var(--bp-color-accent-bg)",
                        boxShadow: "inset 2px 0 0 var(--bp-color-accent)",
                      }
                    : undefined
                }
              >
                <span className="min-w-0">
                  <span className="mb-1 flex items-center gap-2">
                    <span
                      className="font-mono text-[9px] font-bold tracking-[0.08em]"
                      style={{ color: sel ? "var(--bp-color-accent)" : "var(--bp-color-ink-55)" }}
                    >
                      {KIND_LABEL[option.evidence.kind]}
                    </span>
                    {sel ? (
                      <span className="rounded-[2px] border border-[var(--bp-color-accent)] bg-[var(--bp-color-card)] px-[5px] py-px font-mono text-[8px] font-bold tracking-[0.08em] text-[var(--bp-color-accent)]">
                        ◆ BEST MATCH
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[13.5px] font-semibold leading-[1.3] tracking-[-0.005em] text-[var(--bp-color-ink)]">
                    {option.evidence.title}
                  </span>
                  <span className="mt-[3px] block truncate font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
                    {option.evidence.detail}
                  </span>
                </span>
                {previewFor(option.evidence, index)}
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-3.5 bg-[var(--bp-color-paper-deep)] px-[18px] py-2.5 font-mono text-[10px] text-[var(--bp-color-ink-55)] shadow-[inset_0_1px_0_var(--bp-color-rule)]">
        <span>
          <b className="text-[var(--bp-color-ink-70)]">⏎</b> take the match
        </span>
        <span>
          <b className="text-[var(--bp-color-ink-70)]">↑↓</b> pick another
        </span>
        <span>
          <b className="text-[var(--bp-color-ink-70)]">type</b> to filter
        </span>
        <span>
          <b className="text-[var(--bp-color-ink-70)]">esc</b> keep writing
        </span>
      </div>
    </div>
  );
}
