import { Fragment } from "react";

export function Heatmap({
  rows,
  cols,
  values,
  min,
  max,
  cellW = 36,
  cellH = 22,
  labelGutter = 56,
  colTickEvery = 6,
  valueFormat = (value) => value.toFixed(1),
}: {
  rows: readonly string[];
  cols: readonly string[];
  values: ReadonlyArray<readonly number[]>;
  min?: number;
  max?: number;
  cellW?: number;
  cellH?: number;
  labelGutter?: number;
  colTickEvery?: number;
  valueFormat?: (value: number) => string;
}) {
  const flat = values.flat();
  const lo = min ?? Math.min(...flat);
  const hi = max ?? Math.max(...flat);
  const range = hi - lo || 1;
  const colorAt = (value: number) => {
    const t = Math.max(0, Math.min(1, (value - lo) / range));
    return `oklch(${0.55 + t * 0.35} ${0.16 * (1 - t) + 0.02} ${28 + t * 30})`;
  };

  return (
    <div className="inline-block">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${labelGutter}px repeat(${cols.length}, ${cellW}px)`,
        }}
      >
        <div />
        {cols.map((col, index) => (
          <div
            key={col}
            className="h-4 pb-1 text-center font-mono text-[9.5px] text-[var(--bp-color-ink-55)]"
          >
            {index % colTickEvery === 0 || index === cols.length - 1 ? col : ""}
          </div>
        ))}
        {rows.map((rowLabel, rowIndex) => (
          <Fragment key={rowLabel}>
            <div
              className="flex items-center text-[10.5px] font-medium text-[var(--bp-color-ink-55)]"
              style={{ height: cellH }}
            >
              {rowLabel}
            </div>
            {cols.map((col, colIndex) => {
              const value = values[rowIndex]?.[colIndex] ?? 0;
              const t = Math.max(0, Math.min(1, (value - lo) / range));
              return (
                <div
                  key={`${rowLabel}-${col}`}
                  className="mb-0.5 mr-0.5 flex items-center justify-center rounded-[2px] font-mono text-[9px] font-medium"
                  style={{
                    background: colorAt(value),
                    color: t < 0.4 ? "white" : "var(--bp-color-ink-70)",
                    height: cellH,
                    width: cellW - 2,
                  }}
                >
                  {valueFormat(value)}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-[10px] text-[var(--bp-color-ink-55)]">
        <span>slower</span>
        <div className="h-2 w-[120px] rounded-[2px] bg-[linear-gradient(90deg,oklch(0.55_0.16_28),oklch(0.85_0.04_60),oklch(0.9_0.02_58))]" />
        <span>faster</span>
        <span className="ml-3.5 font-mono">
          {valueFormat(lo)} → {valueFormat(hi)}
        </span>
      </div>
    </div>
  );
}
