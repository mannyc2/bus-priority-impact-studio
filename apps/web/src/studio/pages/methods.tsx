import { Chip } from "../../design-system/primitives.js";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";

const datasets = [
  {
    name: "Bus segment speeds",
    publisher: "MTA Open Data",
    grain: "route x direction x timepoint pair x hour",
    cadence: "monthly",
  },
  {
    name: "Hourly ridership",
    publisher: "MTA Open Data",
    grain: "stop x hour",
    cadence: "weekly",
  },
  {
    name: "Schedule timepoints",
    publisher: "MTA GTFS",
    grain: "route x trip x timepoint pair",
    cadence: "GTFS publish",
  },
  {
    name: "ACE program and violations",
    publisher: "MTA Open Data",
    grain: "route x segment x date",
    cadence: "monthly",
  },
  {
    name: "Local-street bus lanes",
    publisher: "NYC DOT",
    grain: "lane segment",
    cadence: "quarterly",
  },
  {
    name: "Route shapes and stops",
    publisher: "MTA GTFS",
    grain: "shape / stop",
    cadence: "GTFS publish",
  },
] as const;

export function MethodsPage() {
  return (
    <StudioPage>
      <StudioHero
        label="Methods"
        title="Where the numbers come from"
        body="Every metric the studio shows is derived from public datasets catalogued here, with the caveats kept close to computed claims."
      />
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        {datasets.map((dataset) => (
          <StudioPanel key={dataset.name}>
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="text-[16px] font-semibold">{dataset.name}</div>
                <div className="mt-1 font-mono text-[11px] text-[var(--bp-color-ink-55)]">
                  {dataset.publisher}
                </div>
              </div>
              <Chip tone="neutral">{dataset.cadence}</Chip>
            </div>
            <div className="mt-4 rounded-[3px] bg-[var(--bp-color-paper)] p-3 font-mono text-[11px] text-[var(--bp-color-ink-70)]">
              grain: {dataset.grain}
            </div>
          </StudioPanel>
        ))}
      </div>
    </StudioPage>
  );
}
