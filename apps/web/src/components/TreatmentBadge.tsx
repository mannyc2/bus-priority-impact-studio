import { type CSSProperties, useState } from "react";

import type { RouteInterventionTreatmentRow } from "@/components/route/route-intervention-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
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
  treatments: readonly RouteInterventionTreatmentRow[];
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const visible = treatments.slice(0, max);
  const hidden = treatments.slice(max);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((row) => (
        <RouteInventoryBadge key={row.key} row={row} />
      ))}
      {hidden.length > 0 ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label={`Show ${hidden.length} more route treatments`}
                aria-expanded={open}
              />
            }
          >
            +{hidden.length} more
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
            <PopoverHeader>
              <PopoverTitle>More route treatments</PopoverTitle>
              <PopoverDescription>Every treatment hidden from the compact summary.</PopoverDescription>
            </PopoverHeader>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {hidden.map((row) => (
                <li key={row.key} className="flex items-start gap-2">
                  <RouteInventoryBadge row={row} size="xs" />
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{row.presentation.label}</span>
                    <span className="block text-muted-foreground">{row.lifecycleLabel}</span>
                  </span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

export function TreatmentInventory({
  treatments,
}: {
  treatments: readonly RouteInterventionTreatmentRow[];
}) {
  const groups = new Map<string, RouteInterventionTreatmentRow[]>();
  for (const row of treatments) {
    const rows = groups.get(row.presentation.familyLabel) ?? [];
    rows.push(row);
    groups.set(row.presentation.familyLabel, rows);
  }
  const counts = treatments.reduce(
    (result, row) => {
      if (
        row.treatment.lifecycleState === "current_confirmed" ||
        row.treatment.lifecycleState === "implemented"
      ) {
        result.inPlace += 1;
      } else if (row.treatment.lifecycleState === "historical_confirmed") {
        result.historical += 1;
      } else {
        result.planned += 1;
      }
      return result;
    },
    { inPlace: 0, historical: 0, planned: 0 },
  );

  if (treatments.length === 0) return null;

  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      {[...groups].map(([familyLabel, rows]) => {
        return (
          <div
            key={familyLabel}
            className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-sm:grid-cols-1"
          >
            <div className="pt-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
              {familyLabel}
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <RouteTreatmentChip key={row.key} row={row} />
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
        {counts.historical > 0 ? (
          <>
            <span className="h-1 w-1 rounded-full bg-[var(--bp-color-ink-20)]" />
            <span>
              <b>{counts.historical}</b> historical
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function RouteInventoryBadge({
  row,
  size = "sm",
}: {
  row: RouteInterventionTreatmentRow;
  size?: BadgeSize;
}) {
  const code = row.presentation.compactCode;
  const accessibleName = `${row.presentation.label}, ${row.lifecycleLabel}`;
  if (code === null) {
    return (
      <Badge variant="neutral" aria-label={accessibleName} title={accessibleName}>
        {row.presentation.label}
      </Badge>
    );
  }
  const badgeSize = BADGE_SIZES[size];
  const width =
    code.length <= 2 ? badgeSize.two : code.length === 3 ? badgeSize.three : badgeSize.four;
  const current =
    row.treatment.lifecycleState === "current_confirmed" ||
    row.treatment.lifecycleState === "implemented";

  return (
    <span
      aria-label={accessibleName}
      title={accessibleName}
      className="inline-flex shrink-0 items-center justify-center rounded-[3px] border font-mono font-bold leading-none tracking-[0.04em] tabular-nums"
      style={{
        width,
        height: badgeSize.height,
        fontSize: badgeSize.fontSize,
        background: current ? "var(--bp-color-ink)" : "transparent",
        color: current ? "var(--bp-color-paper)" : "var(--bp-color-ink-70)",
        borderColor: current ? "transparent" : "var(--bp-color-ink-40)",
        borderStyle: current ? "solid" : "dashed",
      }}
    >
      {code}
    </span>
  );
}

function RouteTreatmentChip({ row }: { row: RouteInterventionTreatmentRow }) {
  const showRawLabel =
    row.treatment.treatmentKind === "other_documented" && row.treatment.rawLabel !== null;
  return (
    <div
      id={row.anchorId}
      tabIndex={-1}
      className="flex min-w-0 flex-wrap items-center gap-2 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)]"
    >
      <RouteInventoryBadge row={row} />
      {row.presentation.compactCode === null ? null : (
        <span className="text-[12.5px] font-medium text-[var(--bp-color-ink)]">
          {row.presentation.label}
        </span>
      )}
      <Badge variant={lifecycleBadgeVariant(row)}>{row.lifecycleLabel}</Badge>
      {showRawLabel ? (
        <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
          {row.treatment.rawLabel}
        </span>
      ) : null}
    </div>
  );
}

function lifecycleBadgeVariant(
  row: RouteInterventionTreatmentRow,
): "accent" | "neutral" | "warn" {
  if (row.treatment.lifecycleState === "historical_confirmed") return "neutral";
  if (
    row.treatment.lifecycleState === "current_confirmed" ||
    row.treatment.lifecycleState === "implemented"
  ) {
    return "accent";
  }
  return "warn";
}
