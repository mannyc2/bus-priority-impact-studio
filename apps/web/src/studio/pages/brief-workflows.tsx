import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { ChartFrame } from "@/components/ChartFrame";
import { ClaimList } from "@/components/ClaimList";
import { CommentBadge } from "@/components/CommentBadge";
import { Heatmap } from "@/components/Heatmap";
import { ReviewerStack } from "@/components/Reviewers";
import { RouteBadge } from "@/components/RouteBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ClaimEvidence as ClaimEvidenceType,
  StudioBrief,
  StudioBriefEvidenceResponse,
  StudioBriefHistoryResponse,
  StudioBriefResponse,
  StudioComment,
  StudioCommentReply,
} from "../api-contract.js";
import { StudioPage, StudioPanel } from "../page.js";
import { NotFoundPage } from "./not-found.js";

export function BriefEvidencePage({ data }: { data: StudioBriefEvidenceResponse | null }) {
  if (data === null) return <NotFoundPage />;
  const { heading } = data;

  return (
    <StudioPage>
      <header className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--bp-color-rule)] pb-4 max-md:flex-col">
        <div className="flex items-center gap-3">
          <RouteBadge route={heading.routeLabel} sbs={heading.routeSbs} size="md" />
          <span className="text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
            {heading.title} - Evidence
          </span>
        </div>
        <Link
          to="/briefs/$briefId"
          params={{ briefId: heading.id }}
          viewTransition
          className="text-[12px] font-medium text-[var(--bp-color-accent)] no-underline"
        >
          Back to brief &rarr;
        </Link>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-5 max-lg:grid-cols-1">
        <ChartFrame title="Speed by hour and day" source="MTA segment speeds">
          <Heatmap
            rows={["Mon", "Tue", "Wed", "Thu", "Fri"]}
            cols={["6", "7", "8", "9", "16", "17", "18", "19"]}
            values={[
              [6.2, 5.8, 5.1, 4.8, 4.4, 4.2, 4.5, 5.1],
              [6.0, 5.7, 5.2, 4.9, 4.1, 4.0, 4.6, 5.0],
              [6.1, 5.9, 5.0, 4.7, 4.2, 4.1, 4.4, 4.9],
              [6.3, 5.8, 5.3, 5.0, 4.3, 4.2, 4.7, 5.2],
              [6.4, 6.0, 5.5, 5.1, 4.8, 4.6, 5.0, 5.4],
            ]}
            min={4}
            max={7}
          />
        </ChartFrame>
        <StudioPanel>
          <div className="text-[12.5px] font-semibold">Computation</div>
          <p className="mt-2 text-[12px] leading-[1.55] text-[var(--bp-color-ink-70)]">
            Rider-hours lost is computed by applying scheduled-vs-observed travel time delta to
            hourly ridership, then summing across weekdays.
          </p>
          <Alert variant="warn" className="mt-4">
            <AlertDescription>
              Single-month windows are useful for briefs but not causal proof.
            </AlertDescription>
          </Alert>
        </StudioPanel>
      </div>
    </StudioPage>
  );
}

export function BriefComposerPage({ data }: { data: StudioBriefResponse | null }) {
  if (data === null) return <NotFoundPage />;
  const { brief, route } = data;

  const initialAttached = useMemo(
    () => new Set(brief.claims.flatMap((c) => c.evidenceIds)),
    [brief.claims],
  );
  const [attached, setAttached] = useState<Set<string>>(initialAttached);
  const [activeClaim, setActiveClaim] = useState<number>(
    brief.claims.find((c) => c.state === "editing")?.n ?? brief.claims[0]?.n ?? 1,
  );

  const claim = brief.claims.find((c) => c.n === activeClaim) ?? brief.claims[0];
  if (!claim) return <NotFoundPage />;

  const attachedEvidence = brief.evidence.filter((e) => attached.has(e.id));
  const appliedCaveats = brief.caveats.filter((_, i) => claim.caveatIds.length > i);

  function toggleEvidence(id: string) {
    setAttached((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <StudioPage>
      <BriefTitleBar brief={brief} route={route} chip="DRAFT" hint="auto-saved just now">
        <Link
          to="/briefs/$briefId/review"
          params={{ briefId: brief.id }}
          viewTransition
          className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 text-[12.5px] font-medium text-[var(--bp-color-paper)] no-underline"
        >
          Send for review
          <ArrowRight size={14} />
        </Link>
      </BriefTitleBar>
      <div className="grid grid-cols-[240px_minmax(0,1fr)_360px] gap-5 max-xl:grid-cols-[200px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside>
          <StudioPanel>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
              Outline
            </div>
            <div className="mt-3">
              <ClaimList
                density="compact"
                claims={brief.claims.map((c) => ({
                  n: c.n,
                  title: c.title,
                  strength: c.strength,
                  evidence: c.evidenceIds.length,
                  caveats: c.caveatIds.length,
                  editing: c.n === activeClaim,
                  weak: c.state === "weak",
                }))}
                onSelect={(picked) => setActiveClaim(picked.n)}
              />
            </div>
            <div className="mt-3 text-[11px] text-[var(--bp-color-ink-55)]">
              Avg strength{" "}
              {(brief.claims.reduce((s, c) => s + c.strength, 0) / brief.claims.length).toFixed(1)}{" "}
              / 5 - {brief.evidence.length} evidence - {brief.caveats.length} caveats
            </div>
          </StudioPanel>
        </aside>
        <div className="space-y-4">
          <div className="rounded-[3px] bg-[var(--bp-color-paper)] p-5 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-accent)]">
              Claim {String(claim.n).padStart(2, "0")} of {brief.claims.length}
            </div>
            <div className="mt-3 text-[20px] font-semibold leading-[1.3] tracking-[-0.01em]">
              {claim.body ? renderWithHighlight(claim.body) : claim.title}
            </div>
            <div className="mt-3 flex items-center gap-3 text-[10.5px] text-[var(--bp-color-ink-55)]">
              <span>
                {claim.body?.split(/\s+/).length ?? claim.title.split(/\s+/).length} words
              </span>
              <span>&middot;</span>
              <span>{claim.evidenceIds.length} inline citations</span>
              <span>&middot;</span>
              <span>no normative language</span>
            </div>
          </div>
          <StudioPanel>
            <div className="flex items-center justify-between">
              <div className="text-[12.5px] font-semibold">
                Evidence attached ({attachedEvidence.length})
              </div>
              <span className="text-[11px] text-[var(--bp-color-accent)]">
                + from inspector &rarr;
              </span>
            </div>
            <ul className="mt-3 m-0 list-none space-y-2 p-0">
              {attachedEvidence.length === 0 ? (
                <li className="text-[11.5px] text-[var(--bp-color-ink-55)]">
                  No evidence attached. Pick items from the inspector on the right.
                </li>
              ) : (
                attachedEvidence.map((ev) => (
                  <EvidenceItem
                    key={ev.id}
                    ev={ev}
                    attached
                    onToggle={() => toggleEvidence(ev.id)}
                  />
                ))
              )}
            </ul>
          </StudioPanel>
          <StudioPanel>
            <div className="flex items-center justify-between">
              <div className="text-[12.5px] font-semibold">
                Caveats applied ({appliedCaveats.length})
              </div>
              <span className="text-[11px] text-[var(--bp-color-accent)]">
                + from library &rarr;
              </span>
            </div>
            <ul className="mt-3 m-0 list-none space-y-2 p-0">
              {appliedCaveats.map((c, i) => (
                <li
                  key={i}
                  className="rounded-[3px] bg-[var(--bp-color-warn-bg)] p-2.5 text-[11.5px]"
                >
                  <div className="font-semibold">{c.title}</div>
                  <div className="mt-1 text-[var(--bp-color-ink-70)]">{c.body}</div>
                </li>
              ))}
            </ul>
          </StudioPanel>
          <StudioPanel>
            <div className="flex items-center justify-between">
              <div
                className="text-[12.5px] font-semibold"
                style={{ color: "var(--bp-color-good)" }}
              >
                Strength - {claim.strength} of 5 - defensible
              </div>
            </div>
            <p className="mt-2 text-[12px] leading-[1.5] text-[var(--bp-color-ink-70)]">
              {attachedEvidence.length} primary sources - {appliedCaveats.length} caveats
              acknowledged - no contradicting data found. Add a multi-month baseline to reach 5/5.
            </p>
          </StudioPanel>
        </div>
        <aside className="max-xl:hidden">
          <EvidenceInspector
            evidence={brief.evidence}
            caveats={brief.caveats}
            attached={attached}
            onToggle={toggleEvidence}
          />
        </aside>
      </div>
    </StudioPage>
  );
}

function EvidenceInspector({
  evidence,
  caveats,
  attached,
  onToggle,
}: {
  evidence: readonly ClaimEvidenceType[];
  caveats: readonly { title: string; body: string }[];
  attached: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const matches = (text: string) => text.toLowerCase().includes(filter.toLowerCase());
  const numbers = evidence.filter((e) => e.kind === "number" && matches(e.title));
  const charts = evidence.filter((e) => e.kind === "chart" && matches(e.title));
  const sources = evidence.filter((e) => e.kind === "source" && matches(e.title));
  const filteredCaveats = caveats.filter((c) => matches(c.title));

  return (
    <StudioPanel>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        Evidence inspector
      </div>
      <input
        type="text"
        placeholder="Filter evidence..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mt-3 w-full rounded-[3px] border border-[var(--bp-color-ink-20)] bg-[var(--bp-color-card-raised)] px-2 py-1.5 text-[12px] text-[var(--bp-color-ink)] focus:border-[var(--bp-color-ink)] focus:outline-none"
      />
      <Tabs defaultValue="numbers" className="mt-3 gap-0">
        <TabsList
          variant="line"
          className="h-auto justify-start border-b border-[var(--bp-color-rule)]"
        >
          <TabsTrigger value="numbers" className="px-2 py-1.5 text-[11.5px]">
            Numbers ({numbers.length})
          </TabsTrigger>
          <TabsTrigger value="charts" className="px-2 py-1.5 text-[11.5px]">
            Charts ({charts.length})
          </TabsTrigger>
          <TabsTrigger value="sources" className="px-2 py-1.5 text-[11.5px]">
            Sources ({sources.length})
          </TabsTrigger>
          <TabsTrigger value="caveats" className="px-2 py-1.5 text-[11.5px]">
            Caveats ({filteredCaveats.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="numbers" className="mt-3">
          <ul className="m-0 list-none space-y-2 p-0">
            {numbers.map((ev) => (
              <EvidenceItem
                key={ev.id}
                ev={ev}
                attached={attached.has(ev.id)}
                onToggle={() => onToggle(ev.id)}
              />
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="charts" className="mt-3">
          <ul className="m-0 list-none space-y-2 p-0">
            {charts.map((ev) => (
              <EvidenceItem
                key={ev.id}
                ev={ev}
                attached={attached.has(ev.id)}
                onToggle={() => onToggle(ev.id)}
              />
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="sources" className="mt-3">
          <ul className="m-0 list-none space-y-2 p-0">
            {sources.map((ev) => (
              <EvidenceItem
                key={ev.id}
                ev={ev}
                attached={attached.has(ev.id)}
                onToggle={() => onToggle(ev.id)}
              />
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="caveats" className="mt-3">
          <ul className="m-0 list-none space-y-2 p-0">
            {filteredCaveats.map((c, i) => (
              <li key={i} className="rounded-[3px] bg-[var(--bp-color-warn-bg)] p-2 text-[11.5px]">
                <div className="font-semibold">{c.title}</div>
                <div className="mt-1 text-[var(--bp-color-ink-70)]">{c.body}</div>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </StudioPanel>
  );
}

function EvidenceItem({
  ev,
  attached,
  onToggle,
}: {
  ev: ClaimEvidenceType;
  attached: boolean;
  onToggle: () => void;
}) {
  const glyph = ev.kind === "number" ? "#" : ev.kind === "chart" ? "▤" : "¶";
  return (
    <li className="flex items-start gap-2 rounded-[3px] bg-[var(--bp-color-paper)] p-2 text-[11.5px]">
      <span className="mt-0.5 shrink-0 font-mono text-[10px] font-bold text-[var(--bp-color-accent)]">
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{ev.title}</div>
        <div className="mt-0.5 text-[var(--bp-color-ink-55)]">{ev.detail}</div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={
          attached
            ? "shrink-0 rounded-[3px] bg-[var(--bp-color-good)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em] text-white"
            : "shrink-0 rounded-[3px] bg-transparent px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em] text-[var(--bp-color-accent)] ring-1 ring-[var(--bp-color-accent)] ring-inset"
        }
      >
        {attached ? "Attached" : "+ Attach"}
      </button>
    </li>
  );
}

export function BriefReviewPage({ data }: { data: StudioBriefResponse | null }) {
  if (data === null) return <NotFoundPage />;
  const { brief, route } = data;

  const [localComments, setLocalComments] = useState<StudioComment[]>(data.comments);
  const [composer, setComposer] = useState("");
  const [selectedClaimN, setSelectedClaimN] = useState<number>(
    localComments[0]?.claimN ?? brief.claims[0]?.n ?? 1,
  );

  const claim = brief.claims.find((c) => c.n === selectedClaimN) ?? brief.claims[0];
  if (!claim) return <NotFoundPage />;

  const threadsForClaim = localComments.filter((c) => c.claimN === selectedClaimN);
  const unresolved = threadsForClaim.filter((c) => !c.resolved);
  const requestedAuthor = threadsForClaim.find((c) => c.kind === "change-requested");

  function addComment(kind: StudioComment["kind"]) {
    const trimmed = composer.trim();
    if (!trimmed) return;
    setLocalComments((c) => [
      ...c,
      {
        id: `local-${Date.now()}`,
        briefId: brief.id,
        claimN: selectedClaimN,
        kind,
        author: "You",
        initials: "YO",
        ago: "just now",
        on: "current claim",
        body: trimmed,
      },
    ]);
    setComposer("");
  }

  return (
    <StudioPage>
      <BriefTitleBar
        brief={brief}
        route={route}
        chip="IN REVIEW"
        chipTone="warn"
        hint="sent 2 days ago"
      >
        <ReviewerStack
          reviewers={[
            { initials: "JL", state: "reviewing" },
            { initials: "SR", state: "approved" },
            { initials: "CP", state: "requested-changes" },
          ]}
        />
        <CommentBadge count={localComments.filter((c) => !c.resolved).length} />
        {requestedAuthor ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-bad)] px-3.5 text-[12.5px] font-medium text-white">
            Resolve {requestedAuthor.author}&apos;s changes
            <ArrowRight size={14} />
          </span>
        ) : null}
      </BriefTitleBar>
      <div className="grid grid-cols-[240px_minmax(0,1fr)_360px] gap-5 max-xl:grid-cols-[200px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside>
          <StudioPanel>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
              Outline
            </div>
            <div className="mt-1 text-[10.5px] text-[var(--bp-color-ink-55)]">
              Comment counts shown
            </div>
            <ul className="mt-3 m-0 list-none space-y-1.5 p-0">
              {brief.claims.map((c) => {
                const count = localComments.filter((x) => x.claimN === c.n).length;
                const active = c.n === selectedClaimN;
                return (
                  <li key={c.n}>
                    <button
                      type="button"
                      onClick={() => setSelectedClaimN(c.n)}
                      className={
                        active
                          ? "flex w-full items-center justify-between gap-2 rounded-[3px] bg-[var(--bp-color-paper-deep)] px-2 py-1.5 text-left text-[12px]"
                          : "flex w-full items-center justify-between gap-2 rounded-[3px] bg-transparent px-2 py-1.5 text-left text-[12px] hover:bg-[var(--bp-color-paper-deep)]"
                      }
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-[10.5px] tabular-nums text-[var(--bp-color-ink-40)]">
                          {String(c.n).padStart(2, "0")}
                        </span>{" "}
                        <span>{c.title}</span>
                      </span>
                      {count > 0 ? <CommentBadge count={count} /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </StudioPanel>
        </aside>
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="warn">CLAIM {String(claim.n).padStart(2, "0")} - IN REVIEW</Badge>
          </div>
          <div className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
            <div className="text-[18px] font-semibold leading-[1.4] tracking-[-0.005em]">
              {claim.body ? renderWithHighlight(claim.body) : claim.title}
            </div>
            <p className="mt-4 text-[14px] leading-[1.7] text-[var(--bp-color-ink-70)]">
              On the 1.5 miles of Madison Avenue between East 28th and East 58th Streets, M15 SBS
              buses average 4.2 mph northbound on weekdays, approximately 43% of the route&apos;s
              total measured rider-hour delay. The corridor shows a clear{" "}
              <CommentedSpan label="treatment gap">treatment gap</CommentedSpan> - bus lane coverage
              ends on the southern third, and ACE enforcement does not extend to{" "}
              <CommentedSpan label="Madison Avenue">Madison Avenue</CommentedSpan> at all.
            </p>
          </div>
        </div>
        <aside>
          <StudioPanel>
            <div className="flex items-center justify-between">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
                Comments on claim {String(claim.n).padStart(2, "0")}
              </div>
              <span className="text-[10.5px] text-[var(--bp-color-bad)]">
                {unresolved.length} unresolved
              </span>
            </div>
            <ul className="mt-3 m-0 list-none space-y-3 p-0">
              {threadsForClaim.map((thread) => (
                <CommentThreadCard key={thread.id} thread={thread} />
              ))}
            </ul>
            <div className="mt-4 border-t border-[var(--bp-color-rule)] pt-3">
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="Add a comment on this claim..."
                rows={3}
                className="w-full rounded-[3px] border border-[var(--bp-color-ink-20)] bg-[var(--bp-color-card-raised)] p-2 text-[12px] text-[var(--bp-color-ink)] focus:border-[var(--bp-color-ink)] focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-[11px] text-[var(--bp-color-ink-55)]"
                  onClick={() => setComposer((c) => `${c}@`)}
                >
                  @ mention
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => addComment("change-requested")}
                    className="rounded-[3px] border border-[var(--bp-color-ink-20)] px-2.5 py-1 text-[11px] font-medium"
                  >
                    Request change
                  </button>
                  <button
                    type="button"
                    onClick={() => addComment("comment")}
                    className="rounded-[3px] bg-[var(--bp-color-ink)] px-2.5 py-1 text-[11px] font-medium text-[var(--bp-color-paper)]"
                  >
                    Comment
                  </button>
                </div>
              </div>
            </div>
          </StudioPanel>
        </aside>
      </div>
    </StudioPage>
  );
}

function CommentThreadCard({ thread }: { thread: StudioComment }) {
  return (
    <li
      className={
        thread.resolved
          ? "rounded-[3px] bg-[var(--bp-color-paper-deep)] p-3 text-[11.5px] opacity-60"
          : "rounded-[3px] bg-[var(--bp-color-paper)] p-3 text-[11.5px] shadow-[0_0_0_1px_var(--bp-color-rule)]"
      }
    >
      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.06em]">
        <span
          className="rounded-[2px] px-1.5 py-0.5 text-[9.5px] tracking-[0.04em]"
          style={{
            color:
              thread.kind === "change-requested" ? "var(--bp-color-bad)" : "var(--bp-color-ink-55)",
            background:
              thread.kind === "change-requested"
                ? "var(--bp-color-bad-bg)"
                : "var(--bp-color-ink-06)",
          }}
        >
          {thread.kind === "change-requested" ? "Change requested" : "Comment"}
        </span>
        <span className="text-[var(--bp-color-ink-70)]">{thread.author}</span>
        <span className="text-[var(--bp-color-ink-40)]">{thread.ago}</span>
        {thread.on ? (
          <span className="text-[var(--bp-color-accent)]">on &ldquo;{thread.on}&rdquo;</span>
        ) : null}
      </div>
      <p className="mt-2 m-0 text-[12px] leading-[1.55] text-[var(--bp-color-ink)]">
        {thread.body}
      </p>
      {thread.replies?.map((r, i) => (
        <CommentReplyRow key={i} reply={r} />
      ))}
    </li>
  );
}

function CommentReplyRow({ reply }: { reply: StudioCommentReply }) {
  return (
    <div className="mt-2 flex items-start gap-2 border-l-2 border-[var(--bp-color-ink-20)] pl-2">
      <span className="font-mono text-[10.5px] font-semibold text-[var(--bp-color-ink-55)]">
        {reply.initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] text-[var(--bp-color-ink-55)]">
          {reply.author} - {reply.ago}
        </div>
        <p className="mt-0.5 m-0 text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-70)]">
          {reply.body}
        </p>
      </div>
    </div>
  );
}

function CommentedSpan({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span
      className="cursor-pointer underline decoration-dashed underline-offset-2"
      style={{ color: "var(--bp-color-accent)", textDecorationColor: "var(--bp-color-accent)" }}
      title={`Comment thread: ${label}`}
    >
      {children}
    </span>
  );
}

export function BriefHistoryPage({ data }: { data: StudioBriefHistoryResponse | null }) {
  if (data === null) return <NotFoundPage />;
  const { heading } = data;

  const versions = data.versions;
  const [activeB, setActiveB] = useState<string>(versions[0]?.v ?? "v0.4");
  const versionA = versions[1]?.v ?? "v0.3";

  return (
    <StudioPage>
      <BriefHeadingBar
        heading={heading}
        chip="IN REVIEW"
        chipTone="warn"
        hint="last edit 2 hours ago"
      >
        <Link
          to="/briefs/$briefId/edit"
          params={{ briefId: heading.id }}
          viewTransition
          className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 text-[12.5px] font-medium text-[var(--bp-color-paper)] no-underline"
        >
          Open in composer
          <ArrowRight size={14} />
        </Link>
      </BriefHeadingBar>
      <div className="mb-5 flex items-center gap-3 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
          Comparing
        </div>
        <VersionChip v={versionA} />
        <ChevronRight size={14} className="text-[var(--bp-color-ink-40)]" />
        <VersionChip v={activeB} highlighted />
        <span className="ml-auto text-[11px] text-[var(--bp-color-ink-55)]">
          +4 evidence - +1 caveat - 2 claims edited
        </span>
      </div>
      <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-5 max-lg:grid-cols-1">
        <aside>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Versions
          </div>
          <ol className="relative mt-3 m-0 list-none space-y-3 p-0">
            <div
              aria-hidden
              className="absolute left-[7px] top-0 h-full w-px bg-[var(--bp-color-ink-20)]"
            />
            {versions.map((v) => {
              const active = v.v === activeB;
              return (
                <li key={v.v} className="relative flex items-start gap-3">
                  <span
                    className="relative z-10 h-[14px] w-[14px] rounded-full border-[2px] border-[var(--bp-color-paper)]"
                    style={{
                      background: active ? "var(--bp-color-accent)" : "var(--bp-color-ink-20)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setActiveB(v.v)}
                    className={
                      active
                        ? "flex-1 rounded-[3px] bg-[var(--bp-color-paper-deep)] p-2 text-left"
                        : "flex-1 rounded-[3px] bg-transparent p-2 text-left hover:bg-[var(--bp-color-paper-deep)]"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] font-semibold tabular-nums">
                        {v.v}
                      </span>
                      <span className="text-[10.5px] text-[var(--bp-color-ink-55)]">{v.date}</span>
                    </div>
                    <div className="text-[11.5px] text-[var(--bp-color-ink-55)]">{v.author}</div>
                    <p className="mt-1 m-0 text-[11.5px] leading-[1.4] text-[var(--bp-color-ink-70)]">
                      {v.summary}
                    </p>
                    <div className="mt-2 font-mono text-[10px] tabular-nums text-[var(--bp-color-ink-55)]">
                      {v.claimsCount} claims - {v.citesCount} cites - {v.caveatsCount} caveats
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
        <div className="space-y-4">
          <p className="m-0 text-[12px] text-[var(--bp-color-ink-55)]">
            Differences between {versionA} and {activeB}. Showing only claims that changed.
          </p>
          <DiffClaim
            n={2}
            title="A single corridor accounts for 43% of measured delay"
            before="A single corridor on the M15 SBS route is responsible for a large share of measured delay."
            after="A 1.5-mile stretch of Madison Avenue (E 28 St -> E 58 St, NB) accounts for 43% of the M15 SBS's total measured rider-hour delay."
            evidenceAdded={[
              "18,420 RH/day - Madison segment (computed)",
              "Hour-by-hour speed figure",
              "M1 pilot windowing",
            ]}
            caveatsAdded={['"Speed" includes rider experience']}
          />
          <DiffClaim
            n={4}
            title="Treatment gap on Madison Av"
            before="There is a treatment gap on Madison Avenue."
            after="DOT bus-lane geometry confirms a painted-only segment on Madison Av between E 28 - E 38 St, with no ACE backstop."
            evidenceAdded={["DOT bus-lane geometry - Madison Av"]}
            flag="Strength dropped from 3 → 2 (weak)"
          />
        </div>
      </div>
    </StudioPage>
  );
}

function VersionChip({ v, highlighted }: { v: string; highlighted?: boolean }) {
  return (
    <span
      className={
        highlighted
          ? "rounded-[3px] bg-[var(--bp-color-ink)] px-2 py-1 font-mono text-[11.5px] font-semibold tabular-nums text-[var(--bp-color-paper)]"
          : "rounded-[3px] bg-[var(--bp-color-paper-deep)] px-2 py-1 font-mono text-[11.5px] font-semibold tabular-nums text-[var(--bp-color-ink-70)]"
      }
    >
      {v}
    </span>
  );
}

function DiffClaim({
  n,
  title,
  before,
  after,
  evidenceAdded,
  caveatsAdded,
  flag,
}: {
  n: number;
  title: string;
  before: string;
  after: string;
  evidenceAdded?: readonly string[];
  caveatsAdded?: readonly string[];
  flag?: string;
}) {
  return (
    <article className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-semibold tabular-nums text-[var(--bp-color-ink-55)]">
            {String(n).padStart(2, "0")}
          </span>
          <span className="text-[14px] font-semibold">{title}</span>
        </div>
        <Badge variant="warn">EDITED</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <div className="rounded-[3px] bg-[var(--bp-color-paper)] p-3">
          <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Before
          </div>
          <p className="mt-2 m-0 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-55)] line-through">
            {before}
          </p>
        </div>
        <div className="rounded-[3px] bg-[var(--bp-color-paper)] p-3">
          <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            After
          </div>
          <p className="mt-2 m-0 text-[12.5px] leading-[1.55]">
            <ins
              className="bg-[var(--bp-color-good-bg)] no-underline"
              style={{ color: "var(--bp-color-ink)" }}
            >
              {after}
            </ins>
          </p>
        </div>
      </div>
      {evidenceAdded && evidenceAdded.length > 0 ? (
        <div className="mt-3 text-[11.5px]">
          <span className="font-semibold">Evidence added ({evidenceAdded.length}):</span>
          <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
            {evidenceAdded.map((e, i) => (
              <li key={i} className="text-[var(--bp-color-ink-70)]">
                + {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {caveatsAdded && caveatsAdded.length > 0 ? (
        <div className="mt-2 text-[11.5px]">
          <span className="font-semibold">Caveats added:</span>
          <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
            {caveatsAdded.map((c, i) => (
              <li key={i} className="text-[var(--bp-color-ink-70)]">
                + {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {flag ? (
        <div className="mt-3 rounded-[3px] bg-[var(--bp-color-warn-bg)] p-2 text-[11.5px] text-[var(--bp-color-warn)]">
          {flag}
        </div>
      ) : null}
    </article>
  );
}

function BriefHeadingBar({
  heading,
  chip,
  chipTone = "neutral",
  hint,
  children,
}: {
  heading: StudioBriefHistoryResponse["heading"];
  chip: string;
  chipTone?: "neutral" | "warn" | "bad" | "accent";
  hint: string;
  children: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-center justify-between gap-4 border-b border-[var(--bp-color-rule)] pb-4 max-md:flex-col max-md:items-start">
      <div className="flex min-w-0 items-center gap-3">
        <RouteBadge route={heading.routeLabel} sbs={heading.routeSbs} size="md" />
        <span className="truncate text-[15px] font-semibold leading-tight">{heading.title}</span>
        <Badge variant={chipTone}>{chip}</Badge>
        <span className="font-mono text-[11.5px] tabular-nums text-[var(--bp-color-ink-55)]">
          {heading.version}
        </span>
        <span className="text-[11.5px] text-[var(--bp-color-ink-55)] max-md:hidden">{hint}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </header>
  );
}

function BriefTitleBar({
  brief,
  route,
  chip,
  chipTone = "neutral",
  hint,
  children,
}: {
  brief: StudioBrief;
  route: StudioBriefResponse["route"];
  chip: string;
  chipTone?: "neutral" | "warn" | "bad" | "accent";
  hint: string;
  children: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-center justify-between gap-4 border-b border-[var(--bp-color-rule)] pb-4 max-md:flex-col max-md:items-start">
      <div className="flex min-w-0 items-center gap-3">
        <RouteBadge route={route.label} sbs={route.sbs} size="md" />
        <span className="truncate text-[15px] font-semibold leading-tight">{brief.title}</span>
        <Badge variant={chipTone}>{chip}</Badge>
        <span className="font-mono text-[11.5px] tabular-nums text-[var(--bp-color-ink-55)]">
          {brief.version}
        </span>
        <span className="text-[11.5px] text-[var(--bp-color-ink-55)] max-md:hidden">{hint}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </header>
  );
}

function renderWithHighlight(text: string): ReactNode {
  return text.split(/(\d+%)/).map((part, i) =>
    /^\d+%$/.test(part) ? (
      <mark
        key={i}
        className="bg-[var(--bp-color-warn-bg)] px-0.5"
        style={{ color: "var(--bp-color-warn)" }}
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
