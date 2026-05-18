type StrengthSize = "sm" | "md" | "lg";

export function StrengthBars({
  strength = 0,
  max = 5,
  size = "sm",
}: {
  strength?: number;
  max?: number;
  size?: StrengthSize;
}) {
  const tone =
    strength >= 4
      ? "var(--bp-color-good)"
      : strength >= 3
        ? "var(--bp-color-accent)"
        : strength >= 2
          ? "var(--bp-color-warn)"
          : "var(--bp-color-bad)";
  const dimensions =
    size === "lg"
      ? { pip: 14, h: 4, gap: 2.5 }
      : size === "md"
        ? { pip: 10, h: 3, gap: 2 }
        : { pip: 7, h: 3, gap: 1.5 };
  return (
    <div className="inline-flex items-center" style={{ gap: dimensions.gap }}>
      {Array.from({ length: max }, (_, index) => (
        <div
          key={index}
          className="rounded-[1px]"
          style={{
            background: index < strength ? tone : "var(--bp-color-ink-10)",
            height: dimensions.h,
            width: dimensions.pip,
          }}
        />
      ))}
    </div>
  );
}
