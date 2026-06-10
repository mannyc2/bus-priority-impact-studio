import { CircleCheck, CircleDashed, CircleOff, TriangleAlert } from "lucide-react";
import { DataAsOf } from "@/components/DataAsOf";
import type { HonestEmptyState } from "@/components/route/section-registry";

/**
 * The four honest-empty visual states (frontend §8.2). `checked_clean` is the
 * credibility feature: it asserts the detector looked and found nothing, which
 * is a claim — so it gets the affirmative styling, not the muted one.
 */
const EMPTY_COPY: Record<
  HonestEmptyState,
  { icon: typeof CircleCheck; tone: string; title: string; body: string }
> = {
  checked_clean: {
    icon: CircleCheck,
    tone: "var(--bp-color-good)",
    title: "Checked — nothing to flag",
    body: "Detectors ran against this route's data and found nothing that clears the publication bar. Silence here is a result, not a gap.",
  },
  building: {
    icon: CircleDashed,
    tone: "var(--bp-color-ink-55)",
    title: "Still building",
    body: "The pipeline that backs this section exists but has not finished for this route yet.",
  },
  insufficient_data: {
    icon: CircleOff,
    tone: "var(--bp-color-ink-55)",
    title: "Not enough data",
    body: "There is not enough underlying data on this route to say anything defensible here.",
  },
  blocked: {
    icon: TriangleAlert,
    tone: "var(--bp-color-bad, #b3261e)",
    title: "Source unavailable",
    body: "An upstream dependency for this section failed; the data exists but could not be built this release.",
  },
};

export function HonestEmptySection({
  state,
  reason,
  dataAsOf,
}: {
  state: HonestEmptyState;
  reason: string | null;
  dataAsOf: string | null;
}) {
  const copy = EMPTY_COPY[state];
  const Icon = copy.icon;
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center gap-3 py-16 text-center">
      <Icon size={28} strokeWidth={1.5} style={{ color: copy.tone }} aria-hidden />
      <div className="text-[15px] font-semibold">{copy.title}</div>
      <p className="m-0 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-55)]">{copy.body}</p>
      {reason ? (
        <p className="m-0 font-mono text-[11px] text-[var(--bp-color-ink-55)]">{reason}</p>
      ) : null}
      <DataAsOf dataAsOf={dataAsOf} />
    </div>
  );
}
