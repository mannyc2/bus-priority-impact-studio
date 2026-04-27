import { colors } from "../lib/tokens.js";

export function StatCard({
  label,
  value,
  sub,
  bad,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  bad?: boolean;
  color?: string;
}) {
  const resolvedColor = color ?? (bad ? colors.hot : colors.good);
  return (
    <div className="bp-stat-card">
      <div className="bp-stat-card__value" style={{ color: resolvedColor }}>
        {value}
      </div>
      <div className="bp-stat-card__label">{label}</div>
      {sub && (
        <div className="bp-stat-card__sub" style={{ color: resolvedColor }}>
          {sub}
        </div>
      )}
    </div>
  );
}
