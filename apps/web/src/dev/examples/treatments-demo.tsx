import { MapThumb } from "@/components/MapThumb";
import { SectionHeader } from "@/components/SectionHeader";
import { TreatmentRow } from "@/components/TreatmentRow";

export function TreatmentsDemo() {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <SectionHeader title="Treatments" sub="Tiny status boards instead of chip piles." />
      <div className="flex flex-col gap-4">
        <TreatmentRow lane="yes" ace tsp />
        <TreatmentRow lane="partial" ace={false} tsp={false} align="flex-start" />
        <MapThumb width={180} height={104} label="Madison Av segment" />
      </div>
    </div>
  );
}
