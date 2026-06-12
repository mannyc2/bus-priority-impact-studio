import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import { useMemo } from "react";
import { geoSpeedColor, routeGeoMapModel } from "@/components/route/route-geo-map";

const SIZES = {
  full: { width: 1040, height: 420, padding: 44 },
  mini: { width: 380, height: 240, padding: 16 },
} as const;

/**
 * The geographic route map: real street geometry from the precomputed
 * route-segment GeoJSON artifact, segments colored by observed speed, the
 * slowest stretch called out. Plain SVG — no map library, no tiles.
 */
export function RouteGeoMap({
  collection,
  highlightId,
  variant = "full",
}: {
  collection: Pick<MapRouteSegmentFeatureCollection, "features">;
  highlightId?: string | undefined;
  variant?: "full" | "mini";
}) {
  const { width: WIDTH, height: HEIGHT, padding: PADDING } = SIZES[variant];
  const mini = variant === "mini";
  const model = useMemo(
    () => routeGeoMapModel(collection, { width: WIDTH, height: HEIGHT, padding: PADDING }),
    [collection, WIDTH, HEIGHT, PADDING],
  );

  if (model === null) {
    return (
      <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 text-[12.5px] text-[var(--bp-color-ink-55)]">
        No route geometry is available for this route yet.
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label="Geographic map of the route, segments colored by observed speed"
      className="block"
    >
      {/* slowest-stretch glow under everything */}
      {model.slowest !== null ? (
        <circle
          cx={model.slowest.x}
          cy={model.slowest.y}
          r={mini ? 18 : 30}
          fill="var(--bp-color-bad)"
          opacity={0.1}
        />
      ) : null}

      {/* route casing */}
      {model.segments.map((segment) => (
        <path
          key={`casing:${segment.id}`}
          d={segment.d}
          fill="none"
          stroke="var(--bp-color-paper)"
          strokeWidth={mini ? 6 : 9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* segments colored by speed */}
      {model.segments.map((segment) => (
        <path
          key={segment.id}
          d={segment.d}
          fill="none"
          stroke={geoSpeedColor(segment.speedMph)}
          strokeWidth={(segment.id === highlightId || segment.slowest ? 6 : 4) * (mini ? 0.75 : 1)}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>
            {[
              [segment.startStopName, segment.endStopName].filter(Boolean).join(" → "),
              segment.speedMph === null
                ? "no speed published"
                : `${segment.speedMph.toFixed(1)} mph`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </title>
        </path>
      ))}

      {/* termini */}
      {model.termini.map((terminus) => (
        <g key={terminus.label}>
          <circle
            cx={terminus.x}
            cy={terminus.y}
            r={mini ? 3.5 : 5}
            fill="var(--bp-color-paper)"
            stroke="var(--bp-color-ink)"
            strokeWidth={2}
          />
          {mini ? null : (
          <text
            x={terminus.x + (terminus.x > WIDTH / 2 ? -10 : 10)}
            y={terminus.y + 4}
            textAnchor={terminus.x > WIDTH / 2 ? "end" : "start"}
            className="fill-[var(--bp-color-ink)] font-mono text-[11px] font-bold"
          >
            {terminus.label}
          </text>
          )}
        </g>
      ))}

      {/* slowest-stretch callout */}
      {model.slowest !== null && !mini ? (
        <text
          x={model.slowest.x + (model.slowest.x > WIDTH / 2 ? -14 : 14)}
          y={model.slowest.y - 12}
          textAnchor={model.slowest.x > WIDTH / 2 ? "end" : "start"}
          className="fill-[var(--bp-color-bad)] font-mono text-[10.5px] font-bold"
        >
          {`${model.slowest.speedMph.toFixed(1)} mph · ${model.slowest.label}`}
        </text>
      ) : null}

      {/* legend */}
      {mini ? null : (
      <g transform={`translate(${PADDING - 24}, ${HEIGHT - 16})`}>
        {(
          [
            ["under 5 mph", "var(--bp-color-bad)"],
            ["5–6.5 mph", "var(--bp-color-warn)"],
            ["over 6.5 mph", "var(--bp-color-good)"],
          ] as const
        ).map(([label, color], index) => (
          <g key={label} transform={`translate(${index * 120}, 0)`}>
            <line
              x1={0}
              y1={-4}
              x2={18}
              y2={-4}
              stroke={color}
              strokeWidth={4}
              strokeLinecap="round"
            />
            <text x={24} y={0} className="fill-[var(--bp-color-ink-55)] font-mono text-[10px]">
              {label}
            </text>
          </g>
        ))}
      </g>
      )}
    </svg>
  );
}
