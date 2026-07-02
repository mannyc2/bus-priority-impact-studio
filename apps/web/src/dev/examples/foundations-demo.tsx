import { Cite } from "@/components/Cite";
import { RouteBadge } from "@/components/RouteBadge";
import { SearchField } from "@/components/SearchField";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";

export function FoundationsDemo() {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <SectionHeader title="Foundations" sub="Brand, color, type, chips, and route identity." />
      <div className="flex flex-wrap items-center gap-2">
        <RouteBadge route="M15" size="lg" sbs />
        <RouteBadge route="Bx12" size="lg" sbs />
        <RouteBadge route="Q44" size="lg" sbs />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge>All boroughs</Badge>
        <Badge variant="accent">ACE</Badge>
        <Badge variant="good">LANE</Badge>
        <Badge variant="warn">LANE: PARTIAL</Badge>
        <Badge variant="bad">NO LANE</Badge>
      </div>
      <div className="mt-4">
        <SearchField placeholder="Search routes, segments, evidence..." shortcut="/" />
      </div>
      <p className="mt-4 text-[13px] leading-normal text-[var(--bp-color-ink-70)]">
        Inline claims carry citation numbers
        <Cite n={2} /> and keep color reserved for evidence state, not decoration.
      </p>
    </div>
  );
}
