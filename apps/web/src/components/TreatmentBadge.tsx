import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import {
  countTreatmentStates,
  groupTreatments,
  TREATMENT_FAMILIES,
  TREATMENT_META,
  TREATMENT_STATE_META,
  type TreatmentItem,
} from "@/studio/treatment-model";

type BadgeSize = "xs" | "sm" | "md";

const BADGE_SIZES: Record<
  BadgeSize,
  { height: number; two: number; three: number; four: number; fontSize: number }
> = {
  xs: { height: 16, two: 22, three: 29, four: 38, fontSize: 9 },
  sm: { height: 18, two: 26, three: 33, four: 42, fontSize: 10 },
  md: { height: 22, two: 31, three: 39, four: 50, fontSize: 11.5 },
};

export function TreatmentBadge({
  treatment,
  size = "sm",
  tone = "ink",
}: {
  treatment: TreatmentItem;
  size?: BadgeSize;
  tone?: "ink" | "family";
}) {
  const meta = TREATMENT_META[treatment.type];
  const state = TREATMENT_STATE_META[treatment.state];
  const badgeSize = BADGE_SIZES[size];
  const width =
    meta.code.length <= 2
      ? badgeSize.two
      : meta.code.length === 3
        ? badgeSize.three
        : badgeSize.four;
  const active = state.present === true;
  const future = state.present === false;
  const familyAccent = meta.family === "enf" ? "var(--bp-color-accent)" : "var(--bp-color-ink)";
  const fill = tone === "family" ? familyAccent : "var(--bp-color-ink)";
  const style: CSSProperties = {
    width,
    height: badgeSize.height,
    borderRadius: 3,
    background: active ? fill : "transparent",
    color: active
      ? "var(--bp-color-paper)"
      : future
        ? "var(--bp-color-ink-55)"
        : "var(--bp-color-warn)",
    border: active
      ? "1px solid transparent"
      : future
        ? "1.3px dashed var(--bp-color-ink-40)"
        : "1.3px dashed var(--bp-color-warn)",
    fontSize: badgeSize.fontSize,
  };

  return (
    <span
      title={`${meta.label}, ${state.label}${treatment.note ? `, ${treatment.note}` : ""}`}
      className="inline-flex shrink-0 items-center justify-center font-mono font-bold leading-none tracking-[0.04em] tabular-nums"
      style={style}
    >
      {meta.code}
    </span>
  );
}

export function TreatmentBadgeStrip({
  treatments,
  size = "sm",
  align = "flex-end",
  showFamilyLabels = true,
}: {
  treatments: readonly TreatmentItem[];
  size?: BadgeSize;
  align?: CSSProperties["justifyContent"];
  showFamilyLabels?: boolean;
}) {
  const groups = groupTreatments(treatments);
  const visibleFamilies = TREATMENT_FAMILIES.slice(0, 3);
  const overflow = TREATMENT_FAMILIES.slice(3).reduce(
    (count, family) => count + (groups.get(family.id)?.length ?? 0),
    0,
  );

  return (
    <div className="flex items-start gap-2" style={{ justifyContent: align }}>
      {visibleFamilies.map((family) => {
        const treatment = groups.get(family.id)?.[0];
        return (
          <div key={family.id} className="flex min-w-[31px] flex-col items-center gap-1">
            {treatment ? (
              <TreatmentBadge treatment={treatment} size={size} tone="family" />
            ) : (
              <span
                className="inline-flex items-center justify-center rounded-[3px] border border-dashed border-[var(--bp-color-ink-20)] font-mono font-bold tracking-[0.04em] text-[var(--bp-color-ink-40)]"
                style={{
                  width: BADGE_SIZES[size].two,
                  height: BADGE_SIZES[size].height,
                  fontSize: BADGE_SIZES[size].fontSize,
                }}
              >
                -
              </span>
            )}
            {showFamilyLabels ? (
              <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
                {family.short}
              </span>
            ) : null}
          </div>
        );
      })}
      {overflow > 0 ? (
        <div className="flex min-w-[31px] flex-col items-center gap-1">
          <span
            className="inline-flex items-center justify-center rounded-[3px] bg-[var(--bp-color-ink-06)] px-1.5 font-mono font-bold tracking-[0.04em] text-[var(--bp-color-ink-70)]"
            style={{ height: BADGE_SIZES[size].height, fontSize: BADGE_SIZES[size].fontSize }}
            title={`${overflow} more treatments`}
          >
            +{overflow}
          </span>
          {showFamilyLabels ? (
            <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
              More
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TreatmentBadgeRow({
  treatments,
  max = 8,
}: {
  treatments: readonly TreatmentItem[];
  max?: number;
}) {
  const sorted = [...treatments].sort((a, b) => {
    const familyDelta =
      TREATMENT_FAMILIES.findIndex((family) => family.id === TREATMENT_META[a.type].family) -
      TREATMENT_FAMILIES.findIndex((family) => family.id === TREATMENT_META[b.type].family);
    if (familyDelta !== 0) return familyDelta;
    return TREATMENT_META[a.type].priority - TREATMENT_META[b.type].priority;
  });
  const visible = sorted.slice(0, max);
  const overflow = sorted.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((treatment) => (
        <TreatmentBadge key={`${treatment.type}-${treatment.state}`} treatment={treatment} />
      ))}
      {overflow > 0 ? <Badge variant="neutral">+{overflow}</Badge> : null}
    </div>
  );
}

export function TreatmentInventory({
  treatments,
  compact = false,
}: {
  treatments: readonly TreatmentItem[];
  compact?: boolean;
}) {
  const groups = groupTreatments(treatments);
  const counts = countTreatmentStates(treatments);
  const families = TREATMENT_FAMILIES.filter((family) => (groups.get(family.id)?.length ?? 0) > 0);

  if (families.length === 0) {
    return (
      <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 text-[12.5px] text-[var(--bp-color-ink-55)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
        No route-level priority treatments are available in the current serving data.
      </div>
    );
  }

  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      {families.map((family, index) => {
        const items = groups.get(family.id) ?? [];
        return (
          <div
            key={family.id}
            className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-sm:grid-cols-1"
          >
            <div className="pt-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
              {family.label}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {items.map((treatment) => (
                <TreatmentChip
                  key={`${family.id}-${treatment.type}-${treatment.state}-${index}`}
                  treatment={treatment}
                  compact={compact}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 bg-[var(--bp-color-paper-deep)] px-4 py-3 text-[11.5px] text-[var(--bp-color-ink-55)] shadow-[inset_0_1px_0_var(--bp-color-rule)]">
        <span>
          <b className="text-[var(--bp-color-good)]">{counts.inPlace}</b> in place
        </span>
        <span className="h-1 w-1 rounded-full bg-[var(--bp-color-ink-20)]" />
        <span>
          <b className="text-[var(--bp-color-warn)]">{counts.planned}</b> planned / proposed
        </span>
        {counts.gaps > 0 ? (
          <>
            <span className="h-1 w-1 rounded-full bg-[var(--bp-color-ink-20)]" />
            <span>
              <b className="text-[var(--bp-color-warn)]">{counts.gaps}</b> source gaps
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function TreatmentChip({ treatment, compact }: { treatment: TreatmentItem; compact: boolean }) {
  const meta = TREATMENT_META[treatment.type];
  const state = TREATMENT_STATE_META[treatment.state];
  const coverage =
    treatment.coverage !== undefined && treatment.coverage < 0.995
      ? `${Math.round(treatment.coverage * 100)}%`
      : null;

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <TreatmentBadge treatment={treatment} />
      <span className="text-[12.5px] font-medium text-[var(--bp-color-ink)]">{meta.label}</span>
      {coverage ? (
        <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">{coverage}</span>
      ) : null}
      {!compact && treatment.note ? (
        <span className="text-[11px] text-[var(--bp-color-ink-55)]">{treatment.note}</span>
      ) : null}
      {state.present !== true ? (
        <Badge variant={state.tone === "accent" ? "accent" : "warn"}>{state.short}</Badge>
      ) : null}
    </span>
  );
}
