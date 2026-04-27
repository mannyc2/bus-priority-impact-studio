import { colors } from "../lib/tokens.js";

export function ComparisonBar({
  actual,
  reference,
  max = 12,
  label,
  actualColor,
  refColor = colors.accent,
  height = 6,
}: {
  actual: number;
  reference: number;
  max?: number;
  label?: boolean;
  actualColor?: string;
  refColor?: string;
  height?: number;
}) {
  const actualPct = (Math.abs(actual) / max) * 100;
  const refPct = (reference / max) * 100;
  const isBehind = actual < reference;
  const resolvedColor =
    actualColor ??
    (isBehind ? (actual < reference * 0.65 ? colors.hot : colors.warm) : colors.good);

  return (
    <div className="bp-comparison-bar">
      {label && (
        <div className="bp-comparison-bar__label" style={{ color: resolvedColor }}>
          {actual} mph
        </div>
      )}
      <div className="bp-comparison-bar__track" style={{ height, borderRadius: height / 2 }}>
        <div
          className="bp-comparison-bar__fill"
          style={{
            width: `${Math.min(actualPct, 100)}%`,
            height: "100%",
            borderRadius: height / 2,
            background: resolvedColor,
          }}
        />
        <div
          className="bp-comparison-bar__marker"
          style={{
            left: `${Math.min(refPct, 100)}%`,
            background: refColor,
          }}
        />
      </div>
    </div>
  );
}
