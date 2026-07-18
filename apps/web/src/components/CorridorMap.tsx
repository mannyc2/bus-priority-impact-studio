import type { StudioRouteDetailResponse, StudioSegment } from "@/studio/api-contract";

const M15_ORDER = [
  "first-86-96-nb",
  "second-60-42-sb",
  "madison-28-58-nb",
  "first-14-34-sb",
  "second-23-14-sb",
] as const;

export function CorridorMap({
  route,
  segments,
  highlightId,
  mode = "full",
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
  highlightId?: string | undefined;
  mode?: "full" | "mini";
}) {
  const ordered = orderCorridorSegments(route.slug, segments);
  if (mode === "mini") return <CorridorMapMini segments={ordered} highlightId={highlightId} />;
  return <CorridorMapFull route={route} segments={ordered} highlightId={highlightId} />;
}

function CorridorMapFull({
  route,
  segments,
  highlightId,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
  highlightId?: string | undefined;
}) {
  if (segments.length === 0) {
    return (
      <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 text-[12.5px] text-[var(--bp-color-ink-55)]">
        No visible timepoint segments are available for this route.
      </div>
    );
  }

  const width = 1040;
  const height = 208;
  const padL = 58;
  const padR = 92;
  const trackLeft = padL;
  const trackRight = width - padR;
  const trackW = trackRight - trackLeft;
  const segW = segments.length > 0 ? trackW / segments.length : trackW;
  const profileTop = 92;
  const profileBottom = 188;
  const minSpeed = Math.min(...segments.map((segment) => segment.speedMph), route.weightedAvgSpeed);
  const scheduledSpeeds = [
    ...segments.flatMap((segment) => (segment.scheduledMph === null ? [] : [segment.scheduledMph])),
    ...(route.scheduledMph === null ? [] : [route.scheduledMph]),
  ];
  const maxSpeed = Math.max(
    ...segments.map((segment) => segment.speedMph),
    ...scheduledSpeeds,
    route.weightedAvgSpeed,
  );
  const lo = Math.max(0, Math.floor(minSpeed - 1));
  const hi = Math.ceil(maxSpeed + 1);
  const yOf = (mph: number) =>
    profileBottom - ((mph - lo) / Math.max(1, hi - lo)) * (profileBottom - profileTop);
  const xOf = (index: number) => trackLeft + index * segW;
  const xMid = (index: number) => xOf(index) + segW / 2;
  const speedStair = stairPath(
    segments.map((segment) => segment.speedMph),
    xOf,
    yOf,
  );
  const scheduledValues = segments.every((segment) => segment.scheduledMph !== null)
    ? segments.map((segment) => segment.scheduledMph as number)
    : null;
  const scheduledStair = scheduledValues === null ? null : stairPath(scheduledValues, xOf, yOf);
  const area = `${speedStair} L${xOf(segments.length).toFixed(1)},${profileBottom} L${xOf(0).toFixed(1)},${profileBottom} Z`;
  const worstIndex = Math.max(
    0,
    segments.findIndex((segment) => segment.id === highlightId || segment.flagged),
  );
  const lastSegment = segments[segments.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full font-sans"
      role="img"
      aria-label={`${route.label} corridor speed profile`}
    >
      <defs>
        <linearGradient id={`corridor-area-${route.slug}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--bp-color-ink)" stopOpacity="0.09" />
          <stop offset="100%" stopColor="var(--bp-color-ink)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <text
        x={padL}
        y={20}
        fontSize="10"
        fontFamily="var(--font-mono)"
        fontWeight="700"
        letterSpacing="0.1em"
        fill="var(--bp-color-ink-55)"
      >
        CORRIDOR · VISIBLE TIMEPOINT SEGMENTS
      </text>
      <Legend x={padL} y={38} showScheduled={scheduledStair !== null} />
      <text
        x={padL}
        y={74}
        fontSize="9"
        fontFamily="var(--font-mono)"
        fontWeight="700"
        letterSpacing="0.08em"
        fill="var(--bp-color-ink-40)"
      >
        START · {shortTerminus(route.termini.north)}
      </text>
      <text
        x={trackRight}
        y={74}
        textAnchor="end"
        fontSize="9"
        fontFamily="var(--font-mono)"
        fontWeight="700"
        letterSpacing="0.08em"
        fill="var(--bp-color-ink-40)"
      >
        {shortTerminus(route.termini.south)} · END
      </text>

      {segments.map((segment, index) =>
        segment.speedMph < 6.5 ? (
          <rect
            key={`shade-${segment.id}`}
            x={xOf(index)}
            y={profileTop}
            width={segW}
            height={profileBottom - profileTop}
            fill={segment.speedMph < 5 ? "var(--bp-color-bad)" : "var(--bp-color-warn)"}
            opacity={segment.speedMph < 5 ? 0.1 : 0.055}
          />
        ) : null,
      )}

      <path d={area} fill={`url(#corridor-area-${route.slug})`} />
      {scheduledStair === null ? null : (
        <path
          d={scheduledStair}
          fill="none"
          stroke="var(--bp-color-ink-40)"
          strokeWidth="1.3"
          strokeDasharray="4 3"
          opacity="0.85"
        />
      )}
      {segments.slice(0, -1).map((segment, index) => (
        <line
          key={`step-${segment.id}`}
          x1={xOf(index + 1)}
          x2={xOf(index + 1)}
          y1={yOf(segment.speedMph)}
          y2={yOf(segments[index + 1]?.speedMph ?? segment.speedMph)}
          stroke="var(--bp-color-ink)"
          strokeOpacity="0.2"
          strokeWidth="2"
        />
      ))}
      {segments.map((segment, index) => {
        const highlighted = index === worstIndex || segment.id === highlightId;
        return (
          <line
            key={`run-${segment.id}`}
            x1={xOf(index) + 2}
            x2={xOf(index + 1) - 2}
            y1={yOf(segment.speedMph)}
            y2={yOf(segment.speedMph)}
            stroke={speedColor(segment.speedMph)}
            strokeWidth={highlighted ? 6.5 : 5}
            strokeLinecap="round"
          />
        );
      })}
      {segments.map((segment, index) => {
        const y = yOf(segment.speedMph);
        const highlighted = index === worstIndex || segment.id === highlightId;
        return (
          <g key={`label-${segment.id}`}>
            <circle
              cx={xOf(index)}
              cy={nodeY(segments, index, yOf)}
              r={index === 0 ? 4 : 3}
              fill={index === 0 ? "var(--bp-color-ink)" : "var(--bp-color-card)"}
              stroke="var(--bp-color-ink)"
              strokeWidth={index === 0 ? 0 : 1.4}
            />
            <text
              x={xMid(index)}
              y={y - 10}
              textAnchor="middle"
              fontSize={highlighted ? "12" : "10.5"}
              fontWeight={highlighted ? "700" : "600"}
              fill={speedColor(segment.speedMph)}
            >
              {segment.speedMph.toFixed(1)}
            </text>
            <text
              x={xMid(index)}
              y={profileBottom + 18}
              textAnchor="middle"
              fontSize="10"
              fontWeight={highlighted ? "700" : "500"}
              fill={highlighted ? "var(--bp-color-ink)" : "var(--bp-color-ink-55)"}
            >
              {shortStop(segment.from)}
            </text>
          </g>
        );
      })}
      <circle
        cx={xOf(segments.length)}
        cy={nodeY(segments, segments.length, yOf)}
        r="4"
        fill="var(--bp-color-ink)"
      />
      {lastSegment ? (
        <text
          x={trackRight}
          y={profileBottom + 18}
          textAnchor="end"
          fontSize="10"
          fontWeight="500"
          fill="var(--bp-color-ink-55)"
        >
          {shortStop(lastSegment.to)}
        </text>
      ) : null}
      {segments[worstIndex] ? (
        <g transform={`translate(${xMid(worstIndex)}, ${profileTop - 3})`}>
          <rect x="-44" y="-15" width="88" height="15" rx="2" fill="var(--bp-color-bad)" />
          <text
            x="0"
            y="-4"
            textAnchor="middle"
            fontSize="8.5"
            fontFamily="var(--font-mono)"
            fontWeight="700"
            letterSpacing="0.08em"
            fill="var(--bp-color-paper)"
          >
            WORST SEGMENT
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function CorridorMapMini({
  segments,
  highlightId,
}: {
  segments: readonly StudioSegment[];
  highlightId?: string | undefined;
}) {
  const width = 150;
  const height = 22;
  const padX = 4;
  const trackW = width - padX * 2;
  const segW = segments.length ? trackW / segments.length : trackW;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-[22px] w-[150px]"
      role="img"
      aria-label="Segment location on corridor"
    >
      <rect x={padX} y="6" width={trackW} height="10" rx="2" fill="var(--bp-color-ink-06)" />
      {segments.map((segment, index) => {
        const highlighted = !highlightId || segment.id === highlightId;
        return (
          <rect
            key={segment.id}
            x={padX + index * segW + 0.5}
            y="6"
            width={Math.max(1, segW - 1)}
            height="10"
            rx="1"
            fill={speedColor(segment.speedMph)}
            opacity={highlighted ? 1 : 0.25}
          />
        );
      })}
      {highlightId ? (
        <rect
          x={
            padX +
            Math.max(
              0,
              segments.findIndex((segment) => segment.id === highlightId),
            ) *
              segW -
            0.5
          }
          y="4"
          width={segW + 1}
          height="14"
          rx="2"
          fill="none"
          stroke="var(--bp-color-accent)"
          strokeWidth="1.5"
        />
      ) : null}
      <circle cx={padX} cy="11" r="2.5" fill="var(--bp-color-ink)" />
      <circle cx={padX + trackW} cy="11" r="2.5" fill="var(--bp-color-ink)" />
    </svg>
  );
}

function Legend({ x, y, showScheduled }: { x: number; y: number; showScheduled: boolean }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx="4" cy="4" r="4" fill="var(--bp-color-good)" />
      <text x="14" y="7.5" fontSize="10" fill="var(--bp-color-ink-70)">
        &gt; 6.5
      </text>
      <circle cx="64" cy="4" r="4" fill="var(--bp-color-warn)" />
      <text x="74" y="7.5" fontSize="10" fill="var(--bp-color-ink-70)">
        5-6.5
      </text>
      <circle cx="126" cy="4" r="4" fill="var(--bp-color-bad)" />
      <text x="136" y="7.5" fontSize="10" fill="var(--bp-color-ink-70)">
        &lt; 5 mph
      </text>
      {showScheduled ? (
        <>
          <line
            x1="210"
            x2="238"
            y1="4"
            y2="4"
            stroke="var(--bp-color-ink-40)"
            strokeWidth="1.4"
            strokeDasharray="4 3"
          />
          <text x="244" y="7.5" fontSize="10" fill="var(--bp-color-ink-70)">
            scheduled
          </text>
        </>
      ) : null}
    </g>
  );
}

export function orderCorridorSegments(routeSlug: string, segments: readonly StudioSegment[]) {
  if (routeSlug === "m15-sbs") {
    const rank = new Map<string, number>(M15_ORDER.map((id, index) => [id, index]));
    return [...segments].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
  }
  return [...segments];
}

function stairPath(
  values: readonly number[],
  xOf: (index: number) => number,
  yOf: (v: number) => number,
) {
  if (values.length === 0) return "";
  let d = `M${xOf(0).toFixed(1)},${yOf(values[0] ?? 0).toFixed(1)}`;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    d += ` L${xOf(index + 1).toFixed(1)},${yOf(value).toFixed(1)}`;
    const next = values[index + 1];
    if (next !== undefined) d += ` L${xOf(index + 1).toFixed(1)},${yOf(next).toFixed(1)}`;
  }
  return d;
}

function nodeY(segments: readonly StudioSegment[], index: number, yOf: (mph: number) => number) {
  if (segments.length === 0) return 0;
  if (index === 0) return yOf(segments[0]?.speedMph ?? 0);
  if (index >= segments.length) return yOf(segments[segments.length - 1]?.speedMph ?? 0);
  return (yOf(segments[index - 1]?.speedMph ?? 0) + yOf(segments[index]?.speedMph ?? 0)) / 2;
}

function speedColor(mph: number) {
  if (mph < 5) return "var(--bp-color-bad)";
  if (mph < 6.5) return "var(--bp-color-warn)";
  return "var(--bp-color-good)";
}

function shortStop(label: string) {
  return label
    .replace(/^East /i, "E ")
    .replace(/^West /i, "W ")
    .replace(/ Avenue/gi, " Av");
}

function shortTerminus(label: string) {
  return label.split(" - ")[0]?.replace("East ", "E ") ?? label;
}
