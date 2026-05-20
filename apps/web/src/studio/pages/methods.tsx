import { BookOpen, Database, FileWarning, FunctionSquare, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StudioMethodDataset, StudioMethodsResponse } from "../api-contract.js";
import { StudioPage, StudioPanel } from "../page.js";

type DatasetDetail = {
  desc: string;
  rows: string;
  period: string;
  schemaKeys: readonly string[];
  methods: string;
  citeCount: number;
};

const datasetDetails: Record<string, DatasetDetail> = {
  "MTA route speed and ridership summaries": {
    desc: "Route/month speed, ridership, and hotspot summary rows generated from MTA public source data and route-slice artifacts.",
    rows: "381 routes",
    period: "March 2026 release",
    schemaKeys: ["route_id", "month", "average_speed_mph", "hotspot_count", "ridership"],
    methods: "route-brief-summary",
    citeCount: 4,
  },
  "NYC DOT bus lane inventory": {
    desc: "Local-street bus-lane geometry and intervention context used to identify treatment coverage and gaps.",
    rows: "4,068 lane segments",
    period: "as of March 2026",
    schemaKeys: ["segment_id", "street", "from_street", "to_street", "lane_type"],
    methods: "lane-overlap",
    citeCount: 8,
  },
  "ACE violation summaries": {
    desc: "Automated Camera Enforcement program coverage and violation context, used as intervention evidence and review context.",
    rows: "18K context events",
    period: "2019-2026",
    schemaKeys: ["route_id", "event_id", "occurred_at", "program_status"],
    methods: "ace-context",
    citeCount: 6,
  },
  "Generated route-slice artifacts": {
    desc: "Precomputed route artifacts that power route detail, briefs, findings, hotspot rows, and public Studio projections.",
    rows: "1,050 artifacts",
    period: "release scoped",
    schemaKeys: ["route_id", "month", "segment_id", "evidence_ref", "quality"],
    methods: "studio-release",
    citeCount: 12,
  },
};

const qualitativeSources = [
  {
    name: "Project wiki methodology notes",
    kind: "internal",
    note: "Captures detector decisions, caveats, and source quality constraints.",
  },
  {
    name: "MTA Bus Observatory archive",
    kind: "third-party",
    note: "Recovered observed reliability summaries used for long-gap trend evidence.",
  },
  {
    name: "MTA Open Data and GTFS references",
    kind: "methodology",
    note: "Defines speed, route, stop, and schedule inputs used by generated artifacts.",
  },
  {
    name: "NYC DOT permit and bus-priority source tables",
    kind: "program",
    note: "Context-event evidence for route-touch activity and treatment coverage.",
  },
] as const;

const caveats = [
  {
    name: "Context is not causality",
    body: "Permit, collision, 311, parking, and ACE touches identify nearby operational context. They do not prove the context caused a speed or reliability outcome.",
    scope: "findings",
  },
  {
    name: "Single-month speed release",
    body: "March 2026 speed/hotspot evidence is strong for publication, but speed trend claims need additional monthly route-slice summaries.",
    scope: "speed",
  },
  {
    name: "Recovered reliability provenance",
    body: "Bus Observatory reliability rows are third-party recovered observations. They are useful for trends, but should remain labeled separately from official self-collected GTFS-RT runs.",
    scope: "reliability",
  },
  {
    name: "Physical overlap varies by source",
    body: "Route-touch joins may prove route-corridor overlap before they prove exact hotspot-segment overlap. Published claims should name the verified grain.",
    scope: "spatial joins",
  },
] as const;

const metrics = [
  {
    name: "Observed long-gap share",
    expr: "long-gap samples / observed headway samples",
    note: "Used as the lead metric for reviewed B25 and BX41 reliability findings.",
  },
  {
    name: "Weighted average route speed",
    expr: "route speed weighted by segment evidence and exposure",
    note: "Published as route-speed evidence, not as an isolated rider-pain score.",
  },
  {
    name: "DOT permit route touches",
    expr: "context events joined through direct route IDs or route-LION physical IDs",
    note: "Supports context/prioritization claims only unless exact hotspot overlap is verified.",
  },
  {
    name: "Ridership exposure",
    expr: "ridership assigned to segment or route evidence rows",
    note: "Used to prefer findings where many riders are exposed to the observed condition.",
  },
] as const;

function datasetDetail(dataset: StudioMethodDataset): DatasetDetail {
  return (
    datasetDetails[dataset.name] ?? {
      desc: `${dataset.name} is included in the current Studio release methods catalog.`,
      rows: "release scoped",
      period: "current release",
      schemaKeys: ["route_id", "month"],
      methods: dataset.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      citeCount: 1,
    }
  );
}

function SourceIcon({ kind }: { kind: string }) {
  if (kind === "program") return <ScrollText data-icon="inline-start" />;
  if (kind === "internal") return <BookOpen data-icon="inline-start" />;
  return <Database data-icon="inline-start" />;
}

export function MethodsPage({ data }: { data: StudioMethodsResponse }) {
  const datasetCount = data.datasets.length;
  const citationCount = data.datasets.reduce(
    (total, dataset) => total + datasetDetail(dataset).citeCount,
    0,
  );

  return (
    <StudioPage flush>
      <div className="flex min-h-full flex-col">
        <header className="bg-[var(--bp-color-card)] px-7 py-6 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-sm:px-4">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-accent)]">
            <Database data-icon="inline-start" />
            Data page
          </div>
          <div className="flex items-end justify-between gap-6 max-lg:flex-col max-lg:items-start">
            <div>
              <h1 className="m-0 text-[30px] font-semibold leading-[1.05] tracking-[-0.02em]">
                Where the numbers come from
              </h1>
              <p className="mt-3 max-w-[720px] text-[13.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
                Every public finding should trace back to a dataset, a computed metric, and a
                caveat. This page is the Studio&apos;s reference surface for source quality, metric
                definitions, and publication limits.
              </p>
            </div>
            <div className="grid min-w-[320px] grid-cols-3 gap-2 max-sm:min-w-0 max-sm:w-full">
              <MethodStat label="Datasets" value={datasetCount.toLocaleString("en-US")} />
              <MethodStat label="Cites" value={citationCount.toLocaleString("en-US")} />
              <MethodStat label="Caveats" value={caveats.length.toLocaleString("en-US")} />
            </div>
          </div>
        </header>

        <Tabs defaultValue="datasets" className="min-h-0 flex-1 gap-0">
          <div className="border-b border-[var(--bp-color-rule)] bg-[var(--bp-color-paper)] px-7 py-2 max-sm:px-4">
            <TabsList variant="line" className="h-auto justify-start">
              <TabsTrigger value="datasets" className="px-2.5 py-2 text-[12px]">
                Datasets
              </TabsTrigger>
              <TabsTrigger value="metrics" className="px-2.5 py-2 text-[12px]">
                Metrics
              </TabsTrigger>
              <TabsTrigger value="caveats" className="px-2.5 py-2 text-[12px]">
                Caveats
              </TabsTrigger>
              <TabsTrigger value="sources" className="px-2.5 py-2 text-[12px]">
                Sources
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="datasets" className="p-7 max-sm:p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-5 max-xl:grid-cols-1">
              <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                {data.datasets.map((dataset) => (
                  <DatasetCard key={dataset.name} dataset={dataset} />
                ))}
              </div>
              <StudioPanel>
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  <FileWarning data-icon="inline-start" />
                  Publication rule
                </div>
                <p className="mt-3 text-[12.5px] leading-[1.6] text-[var(--bp-color-ink-70)]">
                  A public finding should name the evidence grain it actually verifies. Route
                  corridor context is not the same as exact hotspot-segment overlap.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Badge variant="accent">manual review required</Badge>
                  <Badge variant="warn">causality needs separate proof</Badge>
                  <Badge variant="neutral">source rows before scores</Badge>
                </div>
              </StudioPanel>
            </div>
          </TabsContent>

          <TabsContent value="metrics" className="p-7 max-sm:p-4">
            <StudioPanel>
              <SectionLabel icon={<FunctionSquare data-icon="inline-start" />} label="Metrics" />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Expression</TableHead>
                    <TableHead>Use</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.map((metric) => (
                    <TableRow key={metric.name}>
                      <TableCell className="font-semibold whitespace-normal">
                        {metric.name}
                      </TableCell>
                      <TableCell className="font-mono text-[11.5px] whitespace-normal text-[var(--bp-color-ink-70)]">
                        {metric.expr}
                      </TableCell>
                      <TableCell className="whitespace-normal text-[12.5px] text-[var(--bp-color-ink-70)]">
                        {metric.note}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </StudioPanel>
          </TabsContent>

          <TabsContent value="caveats" className="p-7 max-sm:p-4">
            <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
              {caveats.map((caveat) => (
                <StudioPanel key={caveat.name}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[15px] font-semibold">{caveat.name}</div>
                    <Badge variant="warn">{caveat.scope}</Badge>
                  </div>
                  <p className="mt-3 text-[12.5px] leading-[1.6] text-[var(--bp-color-ink-70)]">
                    {caveat.body}
                  </p>
                </StudioPanel>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="sources" className="p-7 max-sm:p-4">
            <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
              {qualitativeSources.map((source) => (
                <StudioPanel key={source.name}>
                  <div className="flex items-center gap-2">
                    <SourceIcon kind={source.kind} />
                    <div className="text-[15px] font-semibold">{source.name}</div>
                  </div>
                  <div className="mt-2">
                    <Badge variant={source.kind === "internal" ? "accent" : "neutral"}>
                      {source.kind}
                    </Badge>
                  </div>
                  <p className="mt-3 text-[12.5px] leading-[1.6] text-[var(--bp-color-ink-70)]">
                    {source.note}
                  </p>
                </StudioPanel>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </StudioPage>
  );
}

function MethodStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-paper)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
      <div className="font-mono text-[18px] font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold">
      {icon}
      {label}
    </div>
  );
}

function DatasetCard({ dataset }: { dataset: StudioMethodDataset }) {
  const detail = datasetDetail(dataset);

  return (
    <StudioPanel>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[16px] font-semibold leading-tight">{dataset.name}</div>
          <div className="mt-1 font-mono text-[11px] text-[var(--bp-color-ink-55)]">
            {dataset.publisher}
          </div>
        </div>
        <Badge variant="neutral">{dataset.cadence}</Badge>
      </div>
      <p className="mt-4 text-[12.5px] leading-[1.6] text-[var(--bp-color-ink-70)]">
        {detail.desc}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <DatasetMini label="Rows" value={detail.rows} />
        <DatasetMini label="Period" value={detail.period} />
        <DatasetMini label="Cites" value={String(detail.citeCount)} />
      </div>
      <div className="mt-4 rounded-[3px] bg-[var(--bp-color-paper)] p-3">
        <div className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--bp-color-ink-55)]">
          {dataset.grain}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {detail.schemaKeys.map((key) => (
            <Badge key={key} variant="neutral">
              {key}
            </Badge>
          ))}
        </div>
      </div>
      <div className="mt-3 font-mono text-[11px] text-[var(--bp-color-ink-55)]">
        method: {detail.methods}
      </div>
    </StudioPanel>
  );
}

function DatasetMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[3px] bg-[var(--bp-color-ink-06)] px-2 py-2">
      <div className="truncate font-mono text-[11.5px] font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
    </div>
  );
}
