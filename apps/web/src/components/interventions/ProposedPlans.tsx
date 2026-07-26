import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  ProposedPlanGroup,
  ProposedPlans as ProposedPlansModel,
} from "@/studio/network-change-record";

/** Plans shown before the tail collapses behind a count. */
export const PROPOSED_PLANS_LEAD = 4;

export function ProposedPlans({ proposed }: { proposed: ProposedPlansModel }) {
  const [showAll, setShowAll] = useState(false);
  const lead = proposed.plans.slice(0, PROPOSED_PLANS_LEAD);
  const tail = proposed.plans.slice(PROPOSED_PLANS_LEAD);
  const tailChanges = tail.reduce((sum, plan) => sum + plan.changeCount, 0);
  const visible = showAll ? proposed.plans : lead;

  if (proposed.plans.length === 0) return null;

  return (
    <section
      aria-labelledby="proposed-plans-title"
      className="mt-5 overflow-hidden rounded-[4px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)]"
    >
      <div className="border-b border-[var(--bp-color-rule)] px-[17px] py-[15px]">
        <h2
          id="proposed-plans-title"
          className="m-0 text-[16.5px] font-semibold tracking-[-0.015em]"
        >
          What is proposed
        </h2>
        <p className="mb-0 mt-1 max-w-[82ch] text-[12.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
          Changes named in a published plan but not yet recorded as built, grouped by the plan that
          proposed them.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px bg-[var(--bp-color-rule)] max-md:grid-cols-1">
        {visible.map((plan) => (
          <PlanCard key={plan.sourceId} plan={plan} />
        ))}
      </div>

      {tail.length === 0 ? null : (
        <div className="flex flex-wrap items-center justify-between gap-[18px] border-t border-[var(--bp-color-rule)] px-[17px] py-3 text-[12.5px] text-[var(--bp-color-ink-55)]">
          <span>
            {showAll
              ? `All ${proposed.plans.length} source plans hold ${proposed.totalChanges} proposed changes.`
              : `${tail.length} more source plans hold ${tailChanges} further proposed ${tailChanges === 1 ? "change" : "changes"}.`}
          </span>
          <Button type="button" variant="ghost" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show fewer plans" : "Show all plans"}
          </Button>
        </div>
      )}
    </section>
  );
}

function PlanCard({ plan }: { plan: ProposedPlanGroup }) {
  return (
    <article className="bg-[var(--bp-color-card)] px-4 pb-4 pt-[15px]">
      <h3 className="m-0 text-[13.5px] font-semibold leading-[1.3]">{plan.label}</h3>
      <div className="mt-2 flex gap-4 text-[11.5px] text-[var(--bp-color-ink-55)]">
        <span>
          <b className="block text-[16px] font-semibold tabular-nums text-[var(--bp-color-ink)]">
            {plan.changeCount}
          </b>
          {plan.changeCount === 1 ? "change" : "changes"}
        </span>
        <span>
          <b className="block text-[16px] font-semibold tabular-nums text-[var(--bp-color-ink)]">
            {plan.routeCount}
          </b>
          {plan.routeCount === 1 ? "route" : "routes"}
        </span>
      </div>
      {plan.mix.length === 0 ? null : (
        <>
          <div
            role="img"
            aria-label={`Treatment mix: ${plan.mix.map((slice) => `${slice.label} ${slice.count}`).join(", ")}`}
            className="mt-[11px] flex h-2 overflow-hidden rounded-[1px] bg-[var(--bp-color-ink-06)]"
          >
            {plan.mix.map((slice) => (
              <span
                key={slice.label}
                className="block h-full"
                style={{ width: `${slice.sharePercent}%`, backgroundColor: slice.color }}
              />
            ))}
          </div>
          <div className="mt-[7px] flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-[var(--bp-color-ink-55)]">
            {plan.mix.map((slice) => (
              <span key={slice.label} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-[1px]"
                  style={{ backgroundColor: slice.color }}
                />
                {`${slice.label} ${slice.count}`}
              </span>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
