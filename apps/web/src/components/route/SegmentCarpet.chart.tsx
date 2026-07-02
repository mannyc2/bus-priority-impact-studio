import { speedToColor } from "@/components/route/maplibre-style";
import type { SegmentCarpetCell, SegmentCarpetModel } from "@/components/route/segment-carpet-data";

export function SegmentCarpetChart({ model }: { model: SegmentCarpetModel }) {
  const left = 172;
  const top = 42;
  const rowHeight = 24;
  const cellWidth = 18;
  const gap = 2;
  const bottom = 36;
  const width = Math.max(760, left + model.months.length * cellWidth + 52);
  const height = top + model.rows.length * rowHeight + bottom;

  return (
    <div className="max-h-[390px] overflow-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="Multiyear segment speed carpet"
        className="block font-sans"
      >
        <title>Monthly segment speed history</title>
        <rect width={width} height={height} fill="transparent" />
        <MonthAxis months={model.months} left={left} cellWidth={cellWidth} top={top} />
        {model.rows.map((row, rowIndex) => {
          const y = top + rowIndex * rowHeight;
          const flagged = row.detailSegment?.flagged ?? false;
          return (
            <g key={row.segmentId}>
              {flagged ? (
                <rect
                  x={0}
                  y={y - 1}
                  width={width}
                  height={rowHeight}
                  fill="var(--bp-color-bad)"
                  opacity="0.055"
                />
              ) : null}
              <text
                x={0}
                y={y + 14}
                fontSize="11"
                fontWeight={flagged ? "700" : "500"}
                fill={flagged ? "var(--bp-color-ink)" : "var(--bp-color-ink-70)"}
              >
                {shortLabel(row.label)}
              </text>
              <text
                x={left - 18}
                y={y + 14}
                textAnchor="end"
                fontSize="10"
                fontFamily="var(--font-mono)"
                fontWeight="700"
                fill="var(--bp-color-ink-40)"
              >
                {row.averageSpeedMph === null ? "--" : row.averageSpeedMph.toFixed(1)}
              </text>
              {row.cells.map((cell, cellIndex) => (
                <SpeedCell
                  key={`${row.segmentId}-${cell.month}`}
                  cell={cell}
                  label={row.label}
                  x={left + cellIndex * cellWidth}
                  y={y}
                  width={cellWidth - gap}
                  height={rowHeight - 5}
                />
              ))}
            </g>
          );
        })}
        <Legend x={left} y={height - 20} />
      </svg>
    </div>
  );
}

function MonthAxis({
  months,
  left,
  cellWidth,
  top,
}: {
  months: readonly string[];
  left: number;
  cellWidth: number;
  top: number;
}) {
  return (
    <g>
      <text
        x={0}
        y={14}
        fontSize="10"
        fontFamily="var(--font-mono)"
        fontWeight="700"
        letterSpacing="0.08em"
        fill="var(--bp-color-ink-40)"
      >
        SEGMENT
      </text>
      <text
        x={left - 18}
        y={14}
        textAnchor="end"
        fontSize="10"
        fontFamily="var(--font-mono)"
        fontWeight="700"
        letterSpacing="0.08em"
        fill="var(--bp-color-ink-40)"
      >
        AVG
      </text>
      {months.map((month, index) => {
        const show = index === 0 || month.endsWith("-01") || index === months.length - 1;
        const x = left + index * cellWidth + (cellWidth - 2) / 2;
        return (
          <g key={month}>
            {show ? (
              <>
                <line
                  x1={x}
                  x2={x}
                  y1={top - 18}
                  y2={top + 1}
                  stroke="var(--bp-color-ink-20)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={14}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                  fontWeight="700"
                  fill="var(--bp-color-ink-55)"
                >
                  {monthLabel(month)}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function SpeedCell({
  cell,
  label,
  x,
  y,
  width,
  height,
}: {
  cell: SegmentCarpetCell;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const empty = cell.speedMph === null;
  const fill = empty ? "var(--bp-color-ink-06)" : speedToColor(cell.speedMph);
  return (
    <rect
      x={x}
      y={y + 2}
      width={width}
      height={height}
      rx="2"
      fill={fill}
      opacity={empty ? 0.7 : 1}
      stroke={empty ? "var(--bp-color-ink-10)" : "transparent"}
      strokeWidth="1"
    >
      <title>
        {label} / {cell.month} /{" "}
        {cell.speedMph === null ? statusLabel(cell.status) : `${cell.speedMph.toFixed(1)} mph`}
      </title>
    </rect>
  );
}

function Legend({ x, y }: { x: number; y: number }) {
  const speeds = [3.3, 5.1, 6.2, 7.4, 9.5] as const;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <text
        x={0}
        y={0}
        fontSize="9"
        fontFamily="var(--font-mono)"
        fontWeight="700"
        fill="var(--bp-color-ink-40)"
      >
        SLOW
      </text>
      {speeds.map((speed, index) => (
        <rect
          key={speed}
          x={42 + index * 16}
          y={-9}
          width={14}
          height={10}
          rx="2"
          fill={speedToColor(speed)}
        />
      ))}
      <text
        x={132}
        y={0}
        fontSize="9"
        fontFamily="var(--font-mono)"
        fontWeight="700"
        fill="var(--bp-color-ink-40)"
      >
        FAST
      </text>
    </g>
  );
}

function monthLabel(month: string): string {
  return month.slice(0, 4);
}

function shortLabel(label: string): string {
  return label.length > 28 ? `${label.slice(0, 25)}...` : label;
}

function statusLabel(status: SegmentCarpetCell["status"]): string {
  if (status === "not_expected") return "no scheduled service";
  if (status === "source_missing") return "source missing";
  if (status === "missing") return "missing";
  return "unavailable";
}
