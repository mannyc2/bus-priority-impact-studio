import { Search } from "lucide-react";
import type { RefObject } from "react";
import type { NetworkView } from "@/components/route/network-map-model";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const TOGGLE_ITEM_CLASS =
  "h-8 rounded-[3px] px-3 text-[12px] font-semibold text-[var(--bp-color-ink-55)] data-[state=on]:bg-[var(--bp-color-ink)] data-[state=on]:text-[var(--bp-color-card)] aria-pressed:bg-[var(--bp-color-ink)] aria-pressed:text-[var(--bp-color-card)]";

/**
 * A one-option toggle group is not a control, it is a label that looks like a
 * button. When coverage leaves a lens with a single choice, the group does not
 * render at all and the legend keeps saying which view is on screen.
 */
function SingleToggle<TValue extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: TValue;
  options: ReadonlyArray<{ label: string; value: TValue }>;
  onChange: (value: TValue) => void;
}) {
  if (options.length < 2) return null;
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const candidate = Array.isArray(next) ? next[0] : next;
        if (typeof candidate === "string" && candidate !== "") onChange(candidate as TValue);
      }}
      spacing={0}
      className="rounded-[3px] bg-[var(--bp-color-card)]/95 p-1 shadow-[0_1px_6px_rgba(0,0,0,0.15)]"
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} className={TOGGLE_ITEM_CLASS}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function BusLaneSwitch({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      aria-label="Show NYC DOT bus-lane source geometry"
      className={`relative h-[14px] w-6 rounded-full border-0 p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-[var(--bp-color-accent)]" : "bg-[var(--bp-color-ink-20)]"
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-px size-3 rounded-full bg-white transition-transform motion-reduce:transition-none ${
          checked ? "translate-x-[11px]" : "translate-x-px"
        }`}
      />
    </button>
  );
}

export function NetworkMapControls({
  view,
  delayEligible,
  amEligible,
  pmEligible,
  lanesVisible,
  lanesAvailable,
  routeCount,
  coverage,
  verifiedRouteCount,
  browseExpanded,
  desktopBrowseButtonRef,
  mobileBrowseButtonRef,
  onViewChange,
  onLanesChange,
  onBrowse,
  onOpenDataNotes,
}: {
  view: NetworkView;
  delayEligible: boolean;
  amEligible: boolean;
  pmEligible: boolean;
  lanesVisible: boolean;
  lanesAvailable: boolean;
  routeCount: number;
  /** Coverage window of the served release, or null when it is unavailable. */
  coverage: string | null;
  verifiedRouteCount: number;
  browseExpanded: boolean;
  desktopBrowseButtonRef?: RefObject<HTMLButtonElement | null>;
  mobileBrowseButtonRef?: RefObject<HTMLButtonElement | null>;
  onViewChange: (view: NetworkView) => void;
  onLanesChange: (visible: boolean) => void;
  onBrowse: () => void;
  onOpenDataNotes: () => void;
}) {
  return (
    <>
      <div className="absolute left-4 top-4 z-10 flex flex-col items-start gap-2 max-md:hidden">
        <Button
          ref={desktopBrowseButtonRef}
          type="button"
          size="md"
          aria-haspopup="dialog"
          aria-expanded={browseExpanded}
          onClick={onBrowse}
          className="border-0 bg-[var(--bp-color-card)]/95 shadow-[0_1px_6px_rgba(0,0,0,0.15)]"
        >
          <Search data-icon="inline-start" aria-hidden />
          Find a route
        </Button>
        <SingleToggle
          label="Metric lens"
          value={view.lens}
          onChange={(lens) =>
            onViewChange({ ...view, lens, compare: lens === "speed" ? view.compare : false })
          }
          options={
            delayEligible
              ? [
                  { label: "Speed", value: "speed" as const },
                  { label: "Rider delay", value: "delay" as const },
                ]
              : [{ label: "Speed", value: "speed" as const }]
          }
        />
        {view.lens === "speed" ? (
          <SingleToggle
            label="Time period"
            value={view.period}
            onChange={(period) =>
              onViewChange({ ...view, period, compare: period === "all" ? false : view.compare })
            }
            options={[
              { label: "All day", value: "all" as const },
              ...(amEligible ? [{ label: "AM peak", value: "am" as const }] : []),
              ...(pmEligible ? [{ label: "PM peak", value: "pm" as const }] : []),
            ]}
          />
        ) : null}
        {view.lens === "speed" && view.period !== "all" ? (
          <SingleToggle
            label="Comparison"
            value={view.compare ? "compare" : "absolute"}
            onChange={(value) => onViewChange({ ...view, compare: value === "compare" })}
            options={[
              { label: "Absolute", value: "absolute" },
              { label: "Vs all day", value: "compare" },
            ]}
          />
        ) : null}
        {/* Coverage and provenance live here now that the title band is gone.
            They ride with the controls rather than with the legend, because the
            legend is allowed to render nothing when it has nothing to say. */}
        <div className="flex max-w-[280px] flex-col gap-1 rounded-[3px] bg-[var(--bp-color-card)]/95 px-2.5 py-2 shadow-[0_1px_6px_rgba(0,0,0,0.15)]">
          <span className="text-[11px] leading-[1.45] text-[var(--bp-color-ink-55)]">
            {coverage === null ? "Release coverage unavailable." : `Data through ${coverage}.`}{" "}
            Local, Limited &amp; SBS. {verifiedRouteCount}/{routeCount} verified routes.
          </span>
          <button
            type="button"
            onClick={onOpenDataNotes}
            className="self-start text-[11px] font-semibold text-[var(--bp-color-accent)] underline decoration-dotted underline-offset-2"
          >
            Data notes
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-[3px] bg-[var(--bp-color-card)]/95 p-1 shadow-[0_1px_6px_rgba(0,0,0,0.15)]">
          <div
            className={`flex min-h-7 items-center gap-2 px-2 text-[11.5px] font-semibold ${
              lanesAvailable
                ? "cursor-pointer text-[var(--bp-color-ink-70)]"
                : "text-[var(--bp-color-ink-40)]"
            }`}
            title={
              lanesAvailable
                ? "NYC DOT source geometry; not legal operating-hour or route coverage."
                : "Current bus-lane geometry is unavailable for this release."
            }
          >
            DOT bus lanes
            <BusLaneSwitch
              checked={lanesVisible}
              disabled={!lanesAvailable}
              onCheckedChange={onLanesChange}
            />
          </div>
        </div>
      </div>
      <div className="absolute inset-x-3 top-3 z-10 hidden items-center justify-between gap-2 max-md:flex">
        <Button
          ref={mobileBrowseButtonRef}
          type="button"
          size="md"
          aria-haspopup="dialog"
          aria-expanded={browseExpanded}
          onClick={onBrowse}
          className="border-0 bg-[var(--bp-color-card)]/95 shadow-[0_1px_6px_rgba(0,0,0,0.15)]"
        >
          <Search data-icon="inline-start" aria-hidden />
          Browse all {routeCount} routes
        </Button>
      </div>
    </>
  );
}

export function NetworkMapMobileOptions({
  view,
  delayEligible,
  amEligible,
  pmEligible,
  lanesVisible,
  lanesAvailable,
  onViewChange,
  onLanesChange,
}: {
  view: NetworkView;
  delayEligible: boolean;
  amEligible: boolean;
  pmEligible: boolean;
  lanesVisible: boolean;
  lanesAvailable: boolean;
  onViewChange: (view: NetworkView) => void;
  onLanesChange: (visible: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--bp-color-rule)] p-3 md:hidden">
      <SingleToggle
        label="Metric lens"
        value={view.lens}
        onChange={(lens) =>
          onViewChange({ ...view, lens, compare: lens === "speed" ? view.compare : false })
        }
        options={
          delayEligible
            ? [
                { label: "Speed", value: "speed" as const },
                { label: "Rider delay", value: "delay" as const },
              ]
            : [{ label: "Speed", value: "speed" as const }]
        }
      />
      {view.lens === "speed" ? (
        <SingleToggle
          label="Time period"
          value={view.period}
          onChange={(period) =>
            onViewChange({ ...view, period, compare: period === "all" ? false : view.compare })
          }
          options={[
            { label: "All day", value: "all" as const },
            ...(amEligible ? [{ label: "AM", value: "am" as const }] : []),
            ...(pmEligible ? [{ label: "PM", value: "pm" as const }] : []),
          ]}
        />
      ) : null}
      {view.lens === "speed" && view.period !== "all" ? (
        <SingleToggle
          label="Comparison"
          value={view.compare ? "compare" : "absolute"}
          onChange={(value) => onViewChange({ ...view, compare: value === "compare" })}
          options={[
            { label: "Absolute", value: "absolute" },
            { label: "Vs all day", value: "compare" },
          ]}
        />
      ) : null}
      <div
        className={`ml-auto flex min-h-9 items-center gap-2 px-1 text-[11.5px] font-semibold ${
          lanesAvailable ? "text-[var(--bp-color-ink-70)]" : "text-[var(--bp-color-ink-40)]"
        }`}
      >
        DOT lanes
        <BusLaneSwitch
          checked={lanesVisible}
          disabled={!lanesAvailable}
          onCheckedChange={onLanesChange}
        />
      </div>
    </div>
  );
}
