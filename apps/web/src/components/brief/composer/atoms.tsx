import { Redo2, Undo2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Spark } from "@/components/Spark";
import type { ClaimEvidence } from "@/studio/api-contract.js";

const TONE_COLOR = {
  accent: "var(--bp-color-accent)",
  warn: "var(--bp-color-warn)",
  bad: "var(--bp-color-bad)",
  good: "var(--bp-color-good)",
  ink: "var(--bp-color-ink-40)",
} as const;

export type Tone = keyof typeof TONE_COLOR;

/** Blinking text caret — the document is live, editable text. */
export function Caret() {
  return (
    <span
      aria-hidden="true"
      className="ml-px inline-block h-[1.05em] w-0.5 animate-pulse rounded-[1px] bg-[var(--bp-color-accent)] align-[-0.16em]"
    />
  );
}

/** A quiet left-gutter ◆ that pins AI activity to a block. */
export function GutterMark({ tone = "accent", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute -left-[34px] top-0.5 inline-flex items-center text-[11px] leading-none ${
        pulse ? "animate-pulse" : ""
      }`}
      style={{ color: TONE_COLOR[tone] }}
    >
      ◆
    </span>
  );
}

/** Editorial block with an optional gutter mark. */
export function Block({
  mark = false,
  markTone = "accent",
  markPulse = false,
  children,
  style,
  className,
}: {
  mark?: boolean;
  markTone?: Tone;
  markPulse?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`} style={style}>
      {mark ? <GutterMark tone={markTone} pulse={markPulse} /> : null}
      {children}
    </div>
  );
}

/** Inline metric inside prose — a number + unit, toned, never a score bar. */
export function InlineMetric({
  value,
  unit,
  tone = "warn",
}: {
  value: string;
  unit?: string;
  tone?: Tone;
}) {
  return (
    <span
      className="font-mono text-[0.95em] font-semibold tabular-nums"
      style={{ color: TONE_COLOR[tone] }}
    >
      {value}
      {unit ? <span className="ml-px text-[0.82em]">{unit}</span> : null}
    </span>
  );
}

/** A live "AI is reading the corpus" status pill for the composer bar. */
export function CorpusStatus({
  label = "reading corpus",
  count = "6 datasets",
}: {
  label?: string;
  count?: string;
}) {
  return (
    <span className="inline-flex items-center gap-[7px] rounded-[13px] bg-[var(--bp-color-accent-bg)] px-2.5 py-[5px] font-mono text-[10.5px] font-bold tracking-[0.04em] text-[var(--bp-color-accent)]">
      <span className="animate-pulse text-[11px] leading-none">◆</span>
      {label}
      <span className="font-medium text-[var(--bp-color-ink-40)]">· {count}</span>
    </span>
  );
}

/** Undo / redo control for the editing chrome. */
export function ChromeUndoRedo({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        title="Undo"
        aria-label="Undo"
        onClick={onUndo}
        disabled={!canUndo}
        className="flex size-7 items-center justify-center rounded-md text-[var(--bp-color-ink-70)] transition-colors hover:bg-[var(--bp-color-ink-06)] disabled:cursor-default disabled:text-[var(--bp-color-ink-20)] disabled:hover:bg-transparent"
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        title="Redo"
        aria-label="Redo"
        onClick={onRedo}
        disabled={!canRedo}
        className="flex size-7 items-center justify-center rounded-md text-[var(--bp-color-ink-70)] transition-colors hover:bg-[var(--bp-color-ink-06)] disabled:cursor-default disabled:text-[var(--bp-color-ink-20)] disabled:hover:bg-transparent"
      >
        <Redo2 size={16} />
      </button>
    </div>
  );
}

const EVIDENCE_KIND_LABEL: Record<ClaimEvidence["kind"], string> = {
  number: "TRACE NUMBER",
  chart: "FIGURE",
  source: "SOURCE",
  caveat: "CAVEAT",
};

const FIGURE_SPARK = [7.6, 7.2, 6.9, 6.7, 6.4, 6.1, 5.9, 5.6, 5.4, 5.2];

/**
 * A figure on the page — the evidence rendered in place, not parked in a shelf.
 * Shape follows the evidence kind; `streaming` shows the materialising shimmer
 * just after an insert.
 */
export function EvidenceFigure({
  evidence,
  streaming = false,
}: {
  evidence: ClaimEvidence;
  streaming?: boolean;
}) {
  const accent =
    evidence.kind === "caveat" ? "var(--bp-color-warn)" : "var(--bp-color-accent)";
  return (
    <figure
      className="relative m-0 overflow-hidden rounded-[5px] bg-[var(--bp-color-card)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]"
      style={streaming ? { opacity: 0.66 } : undefined}
    >
      {streaming ? (
        <div className="pointer-events-none absolute inset-0 z-[3] animate-pulse bg-[linear-gradient(100deg,transparent_40%,rgba(255,255,255,0.5)_50%,transparent_60%)]" />
      ) : null}
      <figcaption className="flex items-center gap-2 px-4 pt-3 font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        <span style={{ color: accent }}>◆</span>
        {EVIDENCE_KIND_LABEL[evidence.kind]}
      </figcaption>
      <div className="flex items-center gap-4 px-4 pb-4 pt-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-[1.35] tracking-[-0.006em] text-[var(--bp-color-ink)]">
            {evidence.title}
          </div>
          <div className="mt-1 font-mono text-[10.5px] leading-[1.4] text-[var(--bp-color-ink-55)]">
            {evidence.detail}
          </div>
        </div>
        {evidence.kind === "chart" ? (
          <Spark
            data={FIGURE_SPARK}
            width={108}
            height={40}
            color="var(--bp-color-bad)"
            baseline={7.4}
            fill
          />
        ) : null}
      </div>
    </figure>
  );
}
