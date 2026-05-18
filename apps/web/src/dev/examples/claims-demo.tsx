import { ClaimList } from "@/components/ClaimList";
import { SectionHeader } from "@/components/SectionHeader";
import { StrengthBars } from "@/components/StrengthBars";
import { demoClaims } from "@/fixtures/demo-snippets";

export function ClaimsDemo() {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <SectionHeader title="Brief authoring" sub="Claims are explicit, scored, and reorderable." />
      <ClaimList
        claims={demoClaims}
        reorderable
        summary={
          <span>
            <StrengthBars strength={4} /> average claim strength · 6 citations · 3 caveats
          </span>
        }
      />
    </div>
  );
}
