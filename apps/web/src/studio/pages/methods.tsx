import { Badge } from "@/components/ui/badge";
import type { StudioMethodsResponse } from "../api-contract.js";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";

export function MethodsPage({ data }: { data: StudioMethodsResponse }) {
  return (
    <StudioPage>
      <StudioHero
        label="Methods"
        title="Where the numbers come from"
        body="Every metric the studio shows is derived from public datasets catalogued here, with the caveats kept close to computed claims."
      />
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        {data.datasets.map((dataset) => (
          <StudioPanel key={dataset.name}>
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="text-[16px] font-semibold">{dataset.name}</div>
                <div className="mt-1 font-mono text-[11px] text-[var(--bp-color-ink-55)]">
                  {dataset.publisher}
                </div>
              </div>
              <Badge variant="neutral">{dataset.cadence}</Badge>
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
