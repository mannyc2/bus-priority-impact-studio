import { colors } from "../lib/tokens.js";

export function SpeedBar({
  pct,
  color = colors.warm,
  label,
  value,
}: {
  pct: number;
  color?: string;
  label?: string;
  value?: string;
}) {
  return (
    <div className="bp-speed-bar">
      {label && <span className="bp-speed-bar__label">{label}</span>}
      <div className="bp-speed-bar__track">
        <div className="bp-speed-bar__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      {value && (
        <span className="bp-speed-bar__value" style={{ color }}>
          {value}
        </span>
      )}
    </div>
  );
}
