"use client";

import * as React from "react";
import type { TooltipValueType } from "recharts";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const;

const INITIAL_DIMENSION = { width: 320, height: 200 } as const;
type TooltipNameType = number | string;

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>;

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
  initialDimension?: {
    width: number;
    height: number;
  };
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        // Tarbell: mono axis ticks + ruled grid/cursor pulled from --bp-color tokens.
        className={cn(
          "flex aspect-video justify-center text-[11px] [&_.recharts-cartesian-axis-tick_text]:fill-[var(--bp-color-ink-55)] [&_.recharts-cartesian-axis-tick_text]:font-mono [&_.recharts-cartesian-axis-tick_text]:text-[10px] [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-[var(--bp-color-rule)] [&_.recharts-curve.recharts-tooltip-cursor]:stroke-[var(--bp-color-ink-20)] [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-[var(--bp-color-rule)] [&_.recharts-radial-bar-background-sector]:fill-[var(--bp-color-ink-06)] [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-[var(--bp-color-ink-06)] [&_.recharts-reference-line_[stroke='#ccc']]:stroke-[var(--bp-color-rule)] [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension}>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, config]) => config.theme ?? config.color);

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      // Scoped per-chart color tokens (--color-KEY) — shadcn-standard pattern.
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ?? itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .join("\n")}
}
`,
          )
          .join("\n"),
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

// Tooltip standard across charts:
// - Cartesian charts use <ChartTooltip content={<ChartTooltipContent .../>} />.
//   The swatch color resolves from item.payload.fill → item.color → config color,
//   so line/area charts get the series stroke and bar charts get the bar's fill.
// - Band/per-datum bar charts (HourBars, HourExposure) must put the resolved
//   color on each datum as `fill` (not only on <Cell>), so the swatch matches.
// - Line/area charts pass `hideLabel` when the x value is a bare index; bar
//   charts pass a `labelFormatter` to render the category as the header.
// - Rich multi-stat tooltips (CorridorProfile) use a custom content component
//   but reuse the same container styling and the gap-4 label↔value rhythm.
function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    nameKey?: string;
    labelKey?: string;
  } & Omit<
    RechartsPrimitive.DefaultTooltipContentProps<TooltipValueType, TooltipNameType>,
    "accessibilityLayer"
  >) {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null;
    }

    const [item] = payload;
    const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value =
      !labelKey && typeof label === "string" ? (config[label]?.label ?? label) : itemConfig?.label;

    if (labelFormatter) {
      return (
        <div className={cn("font-semibold", labelClassName)}>{labelFormatter(value, payload)}</div>
      );
    }

    if (!value) {
      return null;
    }

    return <div className={cn("font-semibold", labelClassName)}>{value}</div>;
  }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]);

  if (!active || !payload?.length) {
    return null;
  }

  const nestLabel = payload.length === 1 && indicator !== "dot";

  return (
    <div
      className={cn(
        "grid min-w-[8rem] items-start gap-1.5 rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card-raised)] px-2.5 py-1.5 text-[11px] shadow-[var(--bp-shadow-lg)]",
        className,
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload
          .filter((item) => item.type !== "none")
          .map((item, index) => {
            const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`;
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const indicatorColor = color ?? item.payload?.fill ?? item.color ?? itemConfig?.color;

            return (
              <div
                key={index}
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-[var(--bp-color-ink-55)]",
                  indicator === "dot" && "items-center",
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                            {
                              "h-2.5 w-2.5": indicator === "dot",
                              "w-1": indicator === "line",
                              "w-0 border-[1.5px] border-dashed bg-transparent":
                                indicator === "dashed",
                              "my-0.5": nestLabel && indicator === "dashed",
                            },
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        // gap-4 guarantees a minimum name↔value gap so the value
                        // never collides with a long series name (matches the
                        // CorridorProfile Stat row). The tooltip grows past its
                        // min-width when needed rather than jamming the two.
                        "flex flex-1 justify-between gap-4 leading-none",
                        nestLabel ? "items-end" : "items-center",
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-[var(--bp-color-ink-55)]">
                          {itemConfig?.label ?? item.name}
                        </span>
                      </div>
                      {item.value != null && (
                        <span className="font-mono font-semibold text-[var(--bp-color-ink)] tabular-nums">
                          {typeof item.value === "number"
                            ? item.value.toLocaleString()
                            : String(item.value)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

// An explicit legend entry, for encodings that aren't series (threshold color
// bands, reference lines). `shape` picks the swatch. Used via the `items` prop.
export type ChartLegendItem = {
  label: React.ReactNode;
  color?: string;
  shape?: "square" | "dot" | "line" | "dashed";
};

// A threshold band: a legend entry plus the predicate that assigns a datum to
// it. Define a chart's bands once, then drive both its marks (<Cell fill> via
// `bandColor`) and its legend (ChartLegendContent `items`) from the same array,
// so the legend key can never drift from the mark colors.
export type ChartBand = Omit<ChartLegendItem, "color"> & {
  color: string;
  test: (value: number) => boolean;
};

// Resolve a datum's color from its band scale. Bands are tested in order, so
// list them most-specific first with a catch-all (`test: () => true`) last.
export function bandColor(bands: readonly ChartBand[], value: number): string {
  const band = bands.find((b) => b.test(value)) ?? bands.at(-1);
  return band?.color ?? "transparent";
}

function LegendSwatch({
  shape = "square",
  color,
}: {
  shape?: ChartLegendItem["shape"];
  color?: string | undefined;
}) {
  if (shape === "dot") {
    return <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />;
  }
  if (shape === "line" || shape === "dashed") {
    return (
      <span
        className={cn(
          "inline-block h-0 w-4 shrink-0 border-t-[1.5px]",
          shape === "dashed" && "border-dashed",
        )}
        style={{ borderColor: color }}
      />
    );
  }
  return <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} />;
}

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
  items,
}: React.ComponentProps<"div"> & {
  hideIcon?: boolean;
  nameKey?: string;
  // Explicit entries for non-series legends. When set, these are rendered
  // instead of the Recharts series `payload`, and no ChartContainer is needed.
  items?: readonly ChartLegendItem[];
} & Partial<RechartsPrimitive.DefaultLegendContentProps>) {
  const config = React.useContext(ChartContext)?.config ?? {};

  const wrap = (children: React.ReactNode) => (
    <div
      className={cn(
        "flex items-center justify-center gap-4 text-[11px] text-[var(--bp-color-ink-70)]",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {children}
    </div>
  );

  if (items?.length) {
    return wrap(
      items.map((item, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <LegendSwatch shape={item.shape} color={item.color} />
          {item.label}
        </div>
      )),
    );
  }

  if (!payload?.length) {
    return null;
  }

  return wrap(
    payload
      .filter((item) => item.type !== "none")
      .map((item, index) => {
        const key = `${nameKey ?? item.dataKey ?? "value"}`;
        const itemConfig = getPayloadConfigFromPayload(config, item, key);

        return (
          <div
            key={index}
            className={cn(
              "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-[var(--bp-color-ink-55)]",
            )}
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <LegendSwatch color={item.color} />
            )}
            {itemConfig?.label ?? item.value}
          </div>
        );
      }),
  );
}

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const payloadPayload =
    "payload" in payload && typeof payload.payload === "object" && payload.payload !== null
      ? payload.payload
      : undefined;

  let configLabelKey: string = key;

  if (key in payload && typeof payload[key as keyof typeof payload] === "string") {
    configLabelKey = payload[key as keyof typeof payload] as string;
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[key as keyof typeof payloadPayload] as string;
  }

  return configLabelKey in config ? config[configLabelKey] : config[key];
}

export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
};
