import { Pause, Play } from "lucide-react";
import { useEffect, useMemo } from "react";
import { formatMapHour } from "@/components/route/maplibre-style";

const PEAK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [7, 9],
  [16, 19],
];

export function usePrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function TimeScrubber({
  hour,
  setHour,
  playing,
  setPlaying,
  accent = "var(--bp-color-ink)",
}: {
  hour: number;
  setHour: (hour: number) => void;
  playing: boolean;
  setPlaying: (playing: boolean | ((current: boolean) => boolean)) => void;
  accent?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const min = 5;
  const max = 23;
  const pct = ((hour - min) / (max - min)) * 100;
  const pillPct = Math.max(7, Math.min(93, pct));
  const xPct = (value: number) => `${((value - min) / (max - min)) * 100}%`;
  const labels = useMemo(
    () =>
      [
        [6, "6a"],
        [9, "9a"],
        [12, "12p"],
        [15, "3p"],
        [18, "6p"],
        [21, "9p"],
      ] as const,
    [],
  );

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => {
      setHour(hour >= max ? min : hour + 1);
    }, 850);
    return () => window.clearInterval(timer);
  }, [hour, max, min, playing, reducedMotion, setHour]);

  useEffect(() => {
    if (reducedMotion && playing) setPlaying(false);
  }, [playing, reducedMotion, setPlaying]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <button
        type="button"
        onClick={() => setPlaying((current) => !current)}
        aria-label={playing ? "Pause" : "Play"}
        className="grid size-10 shrink-0 place-items-center rounded-full border-0 bg-[var(--bp-color-ink)] text-[var(--bp-color-paper)] transition-shadow"
        style={{
          boxShadow: playing ? `0 0 0 3px color-mix(in oklch, ${accent} 18%, transparent)` : "none",
        }}
      >
        {playing ? (
          <Pause size={16} fill="currentColor" aria-hidden />
        ) : (
          <Play size={16} fill="currentColor" aria-hidden />
        )}
      </button>
      <div className="relative h-[46px] min-w-0 flex-1">
        <div
          className="pointer-events-none absolute top-0 rounded-[4px] bg-[var(--bp-color-ink)] px-2 py-[3px] font-mono text-[11px] font-bold tracking-[0.02em] text-[var(--bp-color-paper)] transition-[left] duration-100"
          style={{ left: `${pillPct}%`, transform: "translateX(-50%)" }}
        >
          {formatMapHour(hour)}
        </div>
        <div className="absolute inset-x-0 top-[26px] h-[7px]">
          <div className="absolute inset-0 rounded-full bg-[var(--bp-color-ink-10)]" />
          {PEAK_RANGES.map(([start, end]) => (
            <div
              key={`${start}-${end}`}
              className="absolute inset-y-0 rounded-[2px] bg-[var(--bp-color-warn)] opacity-30"
              style={{ left: xPct(start), width: `calc(${xPct(end)} - ${xPct(start)})` }}
            />
          ))}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--bp-color-ink)] transition-[width] duration-100"
            style={{ width: `${pct}%` }}
          />
          {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((tick) => (
            <div
              key={tick}
              className="absolute top-[9px] w-px bg-[var(--bp-color-ink-20)]"
              style={{
                left: xPct(tick),
                height: tick % 3 === min % 3 ? 5 : 3,
                transform: "translateX(-0.5px)",
              }}
            />
          ))}
          <div
            className="pointer-events-none absolute top-1/2 size-4 rounded-full bg-[var(--bp-color-card)] shadow-[0_0_0_2.5px_var(--bp-color-ink),0_1px_3px_rgba(22,20,15,.25)] transition-[left] duration-100"
            style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
          />
        </div>
        <div className="absolute inset-x-0 top-9 h-3">
          {labels.map(([tick, label]) => (
            <span
              key={tick}
              className="absolute font-mono text-[9px] text-[var(--bp-color-ink-40)]"
              style={{ left: xPct(tick), transform: "translateX(-50%)" }}
            >
              {label}
            </span>
          ))}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={hour}
          aria-label="Hour of day"
          aria-valuetext={formatMapHour(hour)}
          onChange={(event) => {
            setPlaying(false);
            setHour(Number(event.currentTarget.value));
          }}
          className="absolute inset-x-0 top-5 h-5 w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
