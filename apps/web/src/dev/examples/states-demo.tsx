import { EmptyState } from "@/components/EmptyState";
import { KPISkeleton } from "@/components/KPI";
import { SectionHeader } from "@/components/SectionHeader";
import { Timeline } from "@/components/Timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { demoTimeline } from "@/fixtures/demo-snippets";

export function StatesDemo() {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <SectionHeader title="States" sub="Loading, caveats, empty states, and navigation tabs." />
      <div className="flex flex-col gap-4">
        <Tabs defaultValue="claims">
          <TabsList variant="line">
            <TabsTrigger value="outline">Outline</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="claims">Claims</TabsTrigger>
          </TabsList>
          <TabsContent value="outline" className="pt-3 text-[12px] text-[var(--bp-color-ink-70)]">
            Outline view goes here.
          </TabsContent>
          <TabsContent value="sources" className="pt-3 text-[12px] text-[var(--bp-color-ink-70)]">
            Source list goes here.
          </TabsContent>
          <TabsContent value="claims" className="pt-3 text-[12px] text-[var(--bp-color-ink-70)]">
            Claim list goes here.
          </TabsContent>
        </Tabs>
        <Alert variant="warn">
          <AlertTitle variant="warn">Publication lag</AlertTitle>
          <AlertDescription>
            March 2026 is the current complete public baseline; realtime samples are labeled
            separately.
          </AlertDescription>
        </Alert>
        <KPISkeleton />
        <Timeline events={demoTimeline} />
        <EmptyState
          title="No matching segments"
          body="Try a broader borough or route family filter."
          primary="Reset filters"
          tone="warn"
        />
      </div>
    </div>
  );
}
