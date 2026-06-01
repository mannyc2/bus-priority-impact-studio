import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { BriefProse } from "@/components/brief/prose/BriefProse.js";
import { MapThumb } from "@/components/MapThumb";
import { Rail, RailRule } from "@/components/Rail";
import { RouteBadge } from "@/components/RouteBadge";
import { StrengthBars } from "@/components/StrengthBars";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { StudioBriefResponse, StudioBriefsResponse } from "../api-contract.js";
import { StudioHero, StudioPage } from "../page.js";
import { NotFoundPage } from "./not-found.js";

export function BriefsGalleryPage({ data }: { data: StudioBriefsResponse }) {
  return (
    <StudioPage>
      <StudioHero
        label="Briefs"
        title="Cited route evidence briefs"
        body="Briefs are the output: claim-driven, caveated, and backed by the same route, segment, and source objects that power the rest of the studio."
        action={
          <Link
            to="/briefs/new"
            viewTransition
            className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 text-[12.5px] font-medium text-[var(--bp-color-paper)] no-underline"
          >
            New brief
            <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        {data.briefs.map(({ brief, route }) => (
          <Link
            key={brief.id}
            to="/briefs/$briefId"
            params={{ briefId: brief.id }}
            viewTransition
            className="block rounded-[3px] bg-[var(--bp-color-card)] p-5 text-[var(--bp-color-ink)] no-underline shadow-[0_0_0_1px_var(--bp-color-rule)]"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
              <Badge variant={brief.status === "Published" ? "good" : "warn"}>{brief.status}</Badge>
            </div>
            <div className="text-[18px] font-semibold tracking-[-0.005em]">{brief.title}</div>
            <p className="mt-2 text-[13px] leading-[1.55] text-[var(--bp-color-ink-70)]">
              {brief.summary}
            </p>
            <div className="mt-3 flex items-center gap-3 text-[11px] text-[var(--bp-color-ink-55)]">
              <span>{brief.authors.join(" - ")}</span>
              <span>&middot;</span>
              <span className="font-mono tabular-nums">{brief.citationCount} citations</span>
              <span>&middot;</span>
              <span>{brief.generated}</span>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-[var(--bp-color-accent)]">
              Read brief
              <ArrowRight size={13} />
            </div>
          </Link>
        ))}
      </div>
    </StudioPage>
  );
}

type RailMode = "outline" | "claims";

export function BriefReadingPage({ data }: { data: StudioBriefResponse | null }) {
  if (data === null) return <NotFoundPage />;
  const { brief, route } = data;

  const [mode, setMode] = useState<RailMode>("outline");
  const [enabledClaims, setEnabledClaims] = useState<readonly number[]>(
    brief.claims.map((c) => c.n),
  );

  const strengthMeter = useMemo(() => {
    const totalWeight = brief.claims.reduce((sum, c) => sum + c.strength, 0) || 1;
    const enabledWeight = brief.claims
      .filter((c) => enabledClaims.includes(c.n))
      .reduce((sum, c) => sum + c.strength, 0);
    return Math.round((enabledWeight / totalWeight) * 100);
  }, [brief.claims, enabledClaims]);

  function toggleClaim(n: number) {
    setEnabledClaims((current) =>
      current.includes(n) ? current.filter((x) => x !== n) : [...current, n],
    );
  }

  return (
    <StudioPage flush>
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] overflow-hidden max-lg:grid-cols-1">
        <article className="overflow-auto p-7 max-sm:p-4">
          <div className="mb-4 flex items-center gap-3">
            <RouteBadge route={route.label} sbs={route.sbs} size="lg" />
            <Badge variant={brief.status === "Published" ? "good" : "warn"}>{brief.status}</Badge>
            <span className="font-mono text-[11.5px] tabular-nums text-[var(--bp-color-ink-55)]">
              {brief.version}
            </span>
            <span className="text-[11.5px] text-[var(--bp-color-ink-55)]">
              generated {brief.generated}
            </span>
          </div>
          <h1 className="m-0 text-[32px] font-semibold leading-[1.05] tracking-[-0.02em] max-sm:text-[24px]">
            {brief.title}
          </h1>
          <p className="mt-4 max-w-[760px] text-[14.5px] leading-[1.6] text-[var(--bp-color-ink-70)]">
            {brief.dek}
          </p>
          <section className="mt-6 grid grid-cols-3 gap-3 max-md:grid-cols-1">
            {brief.kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]"
              >
                <div className="text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]">
                  {kpi.label}
                </div>
                <div
                  className="mt-2 font-mono text-[24px] font-semibold tabular-nums leading-none"
                  style={{ color: toneToColor(kpi.tone) }}
                >
                  {kpi.value}
                  {kpi.unit ? (
                    <span className="ml-1 text-[11px] text-[var(--bp-color-ink-55)] tracking-[0.03em]">
                      {kpi.unit}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-[11px] text-[var(--bp-color-ink-55)]">{kpi.sub}</div>
              </div>
            ))}
          </section>
          {brief.sections.map((section, i) => (
            <section key={`${section.title}-${i}`} className="mt-8">
              <h2 className="m-0 text-[20px] font-semibold tracking-[-0.015em]">{section.title}</h2>
              {section.sub ? (
                <div className="mt-1 font-mono text-[11.5px] text-[var(--bp-color-ink-55)]">
                  {section.sub}
                </div>
              ) : null}
              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_240px] gap-5 max-lg:grid-cols-1">
                <BriefProse
                  markdown={section.body.join("\n\n")}
                  blocks={brief.blocks}
                  className="text-[14.5px] text-[var(--bp-color-ink)]"
                />
                {section.figure ? (
                  <MapThumb label={section.figure.label} width={240} height={160} />
                ) : null}
              </div>
              {section.callout ? (
                <Alert variant={section.callout.variant} className="mt-4">
                  <AlertTitle variant={section.callout.variant}>{section.callout.title}</AlertTitle>
                  <AlertDescription>{section.callout.body}</AlertDescription>
                </Alert>
              ) : null}
            </section>
          ))}
        </article>
        <Rail edge="right" className="gap-4 p-[22px]">
          <div className="flex gap-1 rounded-[3px] bg-[var(--bp-color-paper-deep)] p-1 text-[11.5px]">
            <button
              type="button"
              onClick={() => setMode("outline")}
              className={
                mode === "outline"
                  ? "flex-1 rounded-[3px] bg-[var(--bp-color-card)] py-1.5 font-medium shadow-[0_0_0_1px_var(--bp-color-rule)]"
                  : "flex-1 rounded-[3px] py-1.5 text-[var(--bp-color-ink-55)]"
              }
            >
              Outline &amp; sources
            </button>
            <button
              type="button"
              onClick={() => setMode("claims")}
              className={
                mode === "claims"
                  ? "flex-1 rounded-[3px] bg-[var(--bp-color-card)] py-1.5 font-medium shadow-[0_0_0_1px_var(--bp-color-rule)]"
                  : "flex-1 rounded-[3px] py-1.5 text-[var(--bp-color-ink-55)]"
              }
            >
              Claims &amp; strength
            </button>
          </div>
          {mode === "outline" ? (
            <>
              <section>
                <div className="mb-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
                  Outline
                </div>
                <ol className="m-0 list-none space-y-2 p-0 text-[12.5px]">
                  {brief.sections.map((s, i) => (
                    <li key={`${s.title}-${i}`} className="flex items-center gap-2">
                      <span className="font-mono text-[10.5px] tabular-nums text-[var(--bp-color-ink-40)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{s.title}</span>
                    </li>
                  ))}
                </ol>
              </section>
              <RailRule />
              <section>
                <div className="mb-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
                  Sources ({brief.citationCount})
                </div>
                <ul className="m-0 list-none space-y-1.5 p-0 text-[11.5px]">
                  {brief.evidence.slice(0, 6).map((ev, i) => (
                    <li key={ev.id} className="flex items-start gap-2">
                      <span className="font-mono tabular-nums text-[var(--bp-color-accent)]">
                        [{i + 1}]
                      </span>
                      <span className="text-[var(--bp-color-ink-70)]">{ev.title}</span>
                    </li>
                  ))}
                </ul>
                {brief.evidence.length > 6 ? (
                  <div className="mt-2 text-[11px] text-[var(--bp-color-ink-55)]">
                    + {brief.evidence.length - 6} more&hellip;
                  </div>
                ) : null}
              </section>
              <Link
                to="/briefs/$briefId/evidence"
                params={{ briefId: brief.id }}
                viewTransition
                className="flex items-center justify-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] py-2 text-[12.5px] font-medium text-[var(--bp-color-paper)] no-underline"
              >
                Export as PDF brief
                <ArrowRight size={13} />
              </Link>
            </>
          ) : (
            <>
              <section>
                <div className="mb-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
                  Strength meter
                </div>
                <div className="h-2 w-full rounded-[2px] bg-[var(--bp-color-paper-deep)]">
                  <div
                    className="h-full rounded-[2px]"
                    style={{
                      width: `${strengthMeter}%`,
                      background:
                        strengthMeter >= 75
                          ? "var(--bp-color-good)"
                          : strengthMeter >= 50
                            ? "var(--bp-color-warn)"
                            : "var(--bp-color-bad)",
                    }}
                  />
                </div>
                <div className="mt-2 text-[12px] text-[var(--bp-color-ink-70)]">
                  {strengthMeter >= 75
                    ? "Defensible - all major claims supported"
                    : strengthMeter >= 50
                      ? "Reviewable - key claims missing"
                      : "Thin - missing core evidence"}
                </div>
              </section>
              <RailRule />
              <section>
                <div className="mb-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
                  Toggle claims to include
                </div>
                <ul className="m-0 list-none space-y-2 p-0">
                  {brief.claims.map((claim) => {
                    const enabled = enabledClaims.includes(claim.n);
                    return (
                      <li key={claim.n}>
                        <button
                          type="button"
                          onClick={() => toggleClaim(claim.n)}
                          className="flex w-full items-start gap-2 text-left text-[11.5px]"
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            readOnly
                            className="mt-0.5 h-3 w-3 accent-[var(--bp-color-accent)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={
                                enabled ? "" : "text-[var(--bp-color-ink-40)] line-through"
                              }
                            >
                              {claim.title}
                            </span>
                            <span className="mt-0.5 flex items-center gap-2 text-[var(--bp-color-ink-55)]">
                              <StrengthBars strength={claim.strength} size="sm" />
                              <span className="font-mono tabular-nums">
                                {claim.evidenceIds.length} cites
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}
        </Rail>
      </div>
    </StudioPage>
  );
}

function toneToColor(tone: string): string {
  if (tone === "good") return "var(--bp-color-good)";
  if (tone === "warn") return "var(--bp-color-warn)";
  if (tone === "bad") return "var(--bp-color-bad)";
  return "var(--bp-color-ink)";
}
