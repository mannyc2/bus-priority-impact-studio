import { gradeColor } from "../lib/tokens.js";

const routes = [
  { name: "B46", grade: "D", x1: 400, y1: 120, x2: 400, y2: 600 },
  { name: "B44", grade: "B", x1: 430, y1: 100, x2: 430, y2: 580 },
  { name: "Q58", grade: "C", x1: 460, y1: 150, x2: 460, y2: 550 },
] as const;

const crossRoutes = [
  { d: "M 350 300 L 650 300", grade: "C" },
  { d: "M 350 400 L 700 350", grade: "A" },
  { d: "M 300 250 Q 400 200 550 250 T 750 280", grade: "D" },
  { d: "M 380 500 Q 500 480 650 520", grade: "B" },
] as const;

const stops = [
  { cx: 400, cy: 200, grade: "D" },
  { cx: 400, cy: 350, grade: "D" },
  { cx: 400, cy: 480, grade: "D" },
  { cx: 430, cy: 180, grade: "B" },
  { cx: 430, cy: 380, grade: "B" },
  { cx: 460, cy: 250, grade: "C" },
  { cx: 460, cy: 400, grade: "C" },
  { cx: 550, cy: 300, grade: "C" },
  { cx: 650, cy: 350, grade: "A" },
] as const;

const labels = [
  { name: "B46", grade: "D", left: "36%", top: "32%" },
  { name: "B44", grade: "B", left: "40%", top: "28%" },
  { name: "Q58", grade: "C", left: "52%", top: "36%" },
  { name: "B46 SBS", grade: "D", left: "36%", top: "55%" },
  { name: "M14", grade: "A", left: "33%", top: "20%" },
  { name: "Bx12", grade: "C", left: "48%", top: "12%" },
] as const;

const boroughs = [
  { name: "MANHATTAN", x: "28%", y: "25%" },
  { name: "BROOKLYN", x: "55%", y: "55%" },
  { name: "QUEENS", x: "65%", y: "25%" },
  { name: "BRONX", x: "42%", y: "8%" },
] as const;

export function MapPlaceholder() {
  return (
    <div className="bp-map">
      {/* Grid texture */}
      <svg aria-hidden="true" className="bp-map__grid" focusable="false" width="100%" height="100%">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#b8c4d0" strokeWidth="0.5" />
          </pattern>
          <pattern id="gridLg" width="300" height="300" patternUnits="userSpaceOnUse">
            <path d="M 300 0 L 0 0 0 300" fill="none" stroke="#a0aeb8" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <rect width="100%" height="100%" fill="url(#gridLg)" />
      </svg>

      {/* Borough labels */}
      {boroughs.map((b) => (
        <span key={b.name} className="bp-map__borough" style={{ left: b.x, top: b.y }}>
          {b.name}
        </span>
      ))}

      {/* Route lines */}
      <svg
        aria-hidden="true"
        className="bp-map__routes"
        focusable="false"
        viewBox="0 0 1000 800"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Water shapes */}
        <ellipse cx={200} cy={500} rx={120} ry={180} fill="#d0dae4" opacity={0.4} />
        <ellipse cx={500} cy={700} rx={300} ry={80} fill="#d0dae4" opacity={0.3} />
        <path
          d="M 350 150 Q 380 300 350 500 Q 320 600 380 750"
          stroke="#c4d0dc"
          strokeWidth={40}
          fill="none"
          opacity={0.3}
        />

        {/* Vertical routes */}
        {routes.map((r) => (
          <line
            key={r.name}
            x1={r.x1}
            y1={r.y1}
            x2={r.x2}
            y2={r.y2}
            stroke={gradeColor(r.grade)}
            strokeWidth={5}
            strokeLinecap="round"
            opacity={0.8}
          />
        ))}

        {/* Cross routes */}
        {crossRoutes.map((r, i) => (
          <path
            key={i}
            d={r.d}
            stroke={gradeColor(r.grade)}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            opacity={0.6}
          />
        ))}

        {/* Stop dots */}
        {stops.map((s, i) => (
          <circle
            key={i}
            cx={s.cx}
            cy={s.cy}
            r={6}
            fill={gradeColor(s.grade)}
            stroke="#fff"
            strokeWidth={2}
          />
        ))}
      </svg>

      {/* Clickable route labels */}
      {labels.map((r) => (
        <span
          key={`${r.name}-${r.left}`}
          className="bp-map__label"
          style={{ left: r.left, top: r.top, background: gradeColor(r.grade) }}
        >
          {r.name}
        </span>
      ))}

      {/* Zoom controls */}
      <div className="bp-map__zoom">
        <button type="button" className="bp-map__zoom-btn">
          +
        </button>
        <button type="button" className="bp-map__zoom-btn">
          &minus;
        </button>
      </div>
    </div>
  );
}
