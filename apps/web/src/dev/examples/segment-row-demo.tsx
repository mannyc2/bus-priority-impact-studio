import { AiAttribution } from "@/components/AiAttribution";
import { SectionHeader } from "@/components/SectionHeader";
import { SegmentRow, SegmentRowHeader } from "@/components/SegmentRow";
import { Button } from "@/components/ui/button";
import { demoSegment } from "@/fixtures/demo-snippets";

export function SegmentRowDemo() {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <SectionHeader
        title="Route ladder row"
        sub="The canonical segment row for route detail, hotspot triage, and brief evidence."
        right={<Button variant="secondary">Open route</Button>}
      />
      <SegmentRowHeader />
      <SegmentRow {...demoSegment} flag="top" hasNote />
      <AiAttribution
        action={
          <Button variant="accent" size="sm">
            Explain
          </Button>
        }
      >
        No violation reduction despite ACE active on adjacent blocks; the painted-only lane may be
        structurally unenforceable here.
      </AiAttribution>
    </div>
  );
}
