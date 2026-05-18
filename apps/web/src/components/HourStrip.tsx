export function HourStrip({
  hours,
  width = 168,
  height = 14,
}: {
  hours: readonly number[];
  width?: number;
  height?: number;
}) {
  const cellWidth = width / 24;
  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      {hours.slice(0, 24).map((value, index) => {
        const color =
          value > 0.72
            ? "var(--bp-color-bad)"
            : value > 0.48
              ? "var(--bp-color-warn)"
              : value > 0.2
                ? "var(--bp-color-good)"
                : "var(--bp-color-ink-10)";
        return (
          <rect
            key={`${index}-${value}`}
            x={index * cellWidth}
            y="0"
            width={Math.max(1, cellWidth - 1)}
            height={height}
            rx="1.5"
            fill={color}
          />
        );
      })}
    </svg>
  );
}
