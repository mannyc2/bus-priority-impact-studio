import { colors } from "../lib/tokens.js";

export function ScoreRing({
  score = 0,
  size = 64,
  strokeWidth = 5,
  color,
}: {
  score?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const r = size / 2 - strokeWidth / 2 - 2;
  const circumference = 2 * Math.PI * r;
  const resolvedColor =
    color ?? (score >= 70 ? colors.good : score >= 45 ? colors.warm : colors.hot);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg
        role="img"
        aria-label={`Route score ${score} out of 100`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <title>{`Route score ${score} out of 100`}</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f0f0f0"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="bp-score-ring__label">
        <div
          style={{
            fontSize: size * 0.31,
            fontWeight: 800,
            color: resolvedColor,
            lineHeight: 1,
          }}
        >
          {score}
        </div>
        <div
          style={{
            fontSize: size * 0.12,
            fontWeight: 600,
            color: "#888",
            marginTop: 1,
          }}
        >
          / 100
        </div>
      </div>
    </div>
  );
}
