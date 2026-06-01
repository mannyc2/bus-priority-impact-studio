import { Cite } from "@/components/Cite";
import { type Direction, DirIndicator } from "@/components/DirIndicator";
import { RouteBadge } from "@/components/RouteBadge";
import { Spark } from "@/components/Spark";
import { attrBool, attrStr, type DirectiveProps, parseNums, proseText, toneColor } from "./shared.js";

const DIRECTIONS = new Set(["NB", "SB", "EB", "WB"]);
function asDirection(value: unknown): Direction | undefined {
  const text = attrStr(value);
  return text && DIRECTIONS.has(text) ? (text as Direction) : undefined;
}

function severityColor(mph: number | undefined): string {
  if (mph === undefined || !Number.isFinite(mph)) return "var(--bp-color-ink-40)";
  if (mph < 5) return "var(--bp-color-bad)";
  if (mph < 6) return "var(--bp-color-warn)";
  return "var(--bp-color-ink-40)";
}

/** `:route[M15]{sbs=true value=53 unit=% tone=warn cite=12}` — a route badge that
 * can carry an inline metric, set in a quiet pill so it sits in running prose. */
export function InlineRoute(props: DirectiveProps) {
  const value = attrStr(props.value);
  const unit = attrStr(props.unit);
  const cite = attrStr(props.cite);
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-[3px] bg-[var(--bp-color-ink-06)] px-1.5 py-px align-baseline leading-tight">
      <RouteBadge route={proseText(props.children) || "?"} sbs={attrBool(props.sbs)} size="sm" />
      {value !== undefined ? (
        <>
          <span
            className="font-mono text-[0.86em] font-semibold tabular-nums"
            style={{ color: toneColor(props.tone) }}
          >
            {value}
          </span>
          {unit ? <span className="text-[0.72em] text-[var(--bp-color-ink-55)]">{unit}</span> : null}
        </>
      ) : null}
      {cite ? <Cite n={cite} /> : null}
    </span>
  );
}

/** `:segment[Madison Av 28→58]{dir=NB mph=5.2 spark=5.2,4.9,4.8 cite=4}` — a
 * segment reference that carries its direction, mini sparkline, and speed. */
export function InlineSegment(props: DirectiveProps) {
  const dir = asDirection(props.dir);
  const spark = parseNums(props.spark);
  const mphText = attrStr(props.mph);
  const mph = mphText ? Number(mphText) : undefined;
  const color = severityColor(mph);
  const cite = attrStr(props.cite);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-paper-deep)] px-1.5 align-middle font-mono text-[0.86em] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
      {dir ? <DirIndicator dir={dir} /> : null}
      <span className="font-medium text-[var(--bp-color-ink)]">{proseText(props.children)}</span>
      {spark ? <Spark data={spark} width={36} height={12} color={color} /> : null}
      {mph !== undefined && Number.isFinite(mph) ? (
        <span className="font-bold tabular-nums" style={{ color }}>
          {mph.toFixed(1)}
        </span>
      ) : null}
      {cite ? <Cite n={cite} /> : null}
    </span>
  );
}

/** `:metric[53]{unit=% delta=-1.2 dunit=mph tone=warn cite=12}` — a toned number
 * with its unit and optional delta. Ties the figure to its scale; never a bar. */
export function InlineMetric(props: DirectiveProps) {
  const value = proseText(props.children) || attrStr(props.value) || "";
  const unit = attrStr(props.unit);
  const delta = attrStr(props.delta);
  const dunit = attrStr(props.dunit);
  const cite = attrStr(props.cite);
  const deltaColor = !delta
    ? "var(--bp-color-ink-55)"
    : delta.startsWith("+")
      ? "var(--bp-color-good)"
      : delta.startsWith("-") || delta.startsWith("−")
        ? "var(--bp-color-bad)"
        : "var(--bp-color-ink-70)";
  return (
    <span className="inline-flex items-baseline gap-1 align-baseline">
      <span
        className="font-mono text-[1em] font-semibold tabular-nums"
        style={{ color: toneColor(props.tone) }}
      >
        {value}
      </span>
      {unit ? (
        <span className="text-[0.74em] font-medium text-[var(--bp-color-ink-55)]">{unit}</span>
      ) : null}
      {delta ? (
        <span
          className="ml-0.5 font-mono text-[0.78em] font-semibold tabular-nums"
          style={{ color: deltaColor }}
        >
          {delta}
          {dunit ? <span className="ml-px text-[var(--bp-color-ink-40)]">{dunit}</span> : null}
        </span>
      ) : null}
      {cite ? <Cite n={cite} /> : null}
    </span>
  );
}

/** `:source[EV-1041]{src="MTA bus speeds" retrieved=2026-03}` — a citation chip;
 * hover reveals the dataset and retrieval date. */
export function InlineSource(props: DirectiveProps) {
  const id = proseText(props.children) || attrStr(props.id) || "SRC";
  const src = attrStr(props.src);
  const retrieved = attrStr(props.retrieved);
  const title = src ? `${src}${retrieved ? ` · ${retrieved}` : ""}` : id;
  return (
    <span
      title={title}
      className="inline-flex cursor-help items-baseline rounded-[2px] bg-[var(--bp-color-accent-bg)] px-1.5 align-baseline font-mono text-[0.72em] font-bold tracking-[0.04em] text-[var(--bp-color-accent)]"
    >
      {id}
    </span>
  );
}

/** `:tag[painted-only]{tone=warn}` — a small toned glossary/annotation tag. */
export function InlineTag(props: DirectiveProps) {
  const tone = attrStr(props.tone);
  const palette =
    tone === "warn"
      ? "bg-[var(--bp-color-warn-bg)] text-[var(--bp-color-warn)]"
      : tone === "good"
        ? "bg-[var(--bp-color-good-bg)] text-[var(--bp-color-good)]"
        : "bg-[var(--bp-color-ink-06)] text-[var(--bp-color-ink-70)]";
  return (
    <span
      className={`inline-flex items-baseline rounded-[2px] px-1.5 align-baseline text-[0.82em] font-semibold ${palette}`}
    >
      {proseText(props.children)}
    </span>
  );
}
