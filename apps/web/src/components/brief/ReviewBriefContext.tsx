import { createContext, type ReactNode, use, useMemo, useState } from "react";
import {
  fetchStudioBrief,
  fetchStudioBriefPublishCandidateExport,
  publishStudioBriefDraftCandidate,
  requestStudioBriefDraftReview,
  retractStudioBriefDraftCandidate,
  validateStudioBriefDraft,
} from "@/studio/api-client.js";
import type {
  StudioActorMeResponse,
  StudioBriefDraftValidation,
  StudioBriefPublishCandidateExportResponse,
  StudioBriefResponse,
  StudioComment,
} from "@/studio/api-contract.js";

type PublishCandidateExportSummary = Pick<
  StudioBriefPublishCandidateExportResponse,
  "artifactKey" | "candidateId" | "generatedAt" | "publishedAt" | "version"
>;

type ReviewBriefState = {
  actorProfile: StudioActorMeResponse | null;
  comments: readonly StudioComment[];
  selectedClaimN: number;
  composerDraft: string;
  pendingAction: "export" | "publish" | "retract" | "review" | "validate" | null;
  publishCandidateExport: PublishCandidateExportSummary | null;
  validation: StudioBriefDraftValidation | null;
  writeError: string | null;
};

type ReviewBriefActions = {
  setSelectedClaimN: (n: number) => void;
  setComposerDraft: (text: string) => void;
  setActorProfile: (profile: StudioActorMeResponse | null) => void;
  publishCandidate: () => void;
  exportCandidate: () => void;
  retractCandidate: () => void;
  requestReview: () => void;
  validate: () => void;
  clearWriteError: () => void;
};

type ReviewBriefMeta = {
  brief: StudioBriefResponse["brief"];
  draftPublishedAt: StudioBriefResponse["draftPublishedAt"];
  draftStatus: StudioBriefResponse["draftStatus"];
  route: StudioBriefResponse["route"];
};

type ReviewBriefContextValue = {
  state: ReviewBriefState;
  actions: ReviewBriefActions;
  meta: ReviewBriefMeta;
};

const ReviewBriefContext = createContext<ReviewBriefContextValue | null>(null);

export function ReviewBriefProvider({
  data,
  children,
}: {
  data: StudioBriefResponse & { comments: readonly StudioComment[] };
  children: ReactNode;
}) {
  const [brief, setBrief] = useState(data.brief);
  const [actorProfile, setActorProfile] = useState<StudioActorMeResponse | null>(null);
  const [draftStatus, setDraftStatus] = useState(data.draftStatus);
  const [draftPublishedAt, setDraftPublishedAt] = useState(data.draftPublishedAt);
  const [route, setRoute] = useState(data.route);
  const [comments, setComments] = useState<readonly StudioComment[]>(data.comments);
  const [selectedClaimN, setSelectedClaimN] = useState<number>(
    data.comments[0]?.claimN ?? brief.claims[0]?.n ?? 1,
  );
  const [composerDraft, setComposerDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<ReviewBriefState["pendingAction"]>(null);
  const [publishCandidateExport, setPublishCandidateExport] =
    useState<PublishCandidateExportSummary | null>(null);
  const [validation, setValidation] = useState<StudioBriefDraftValidation | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  async function refresh() {
    const refreshed = await fetchStudioBrief(brief.id);
    if (refreshed === null) return;
    setBrief(refreshed.brief);
    setDraftStatus(refreshed.draftStatus);
    setDraftPublishedAt(refreshed.draftPublishedAt);
    setRoute(refreshed.route);
    setComments(refreshed.comments);
  }

  async function runAction(
    action: Exclude<ReviewBriefState["pendingAction"], null>,
    task: () => Promise<void>,
  ) {
    setPendingAction(action);
    setWriteError(null);
    try {
      await task();
      await refresh();
    } catch (caught) {
      setWriteError(caught instanceof Error ? caught.message : "Draft write failed.");
    } finally {
      setPendingAction(null);
    }
  }

  const value = useMemo<ReviewBriefContextValue>(
    () => ({
      state: {
        actorProfile,
        comments,
        selectedClaimN,
        composerDraft,
        pendingAction,
        publishCandidateExport,
        validation,
        writeError,
      },
      actions: {
        setSelectedClaimN,
        setComposerDraft,
        setActorProfile,
        publishCandidate: () => {
          setPublishCandidateExport(null);
          void runAction("publish", async () => {
            await publishStudioBriefDraftCandidate(brief.id, {});
          });
        },
        exportCandidate: () => {
          void runAction("export", async () => {
            const exported = await fetchStudioBriefPublishCandidateExport(brief.id);
            setPublishCandidateExport({
              artifactKey: exported.artifactKey,
              candidateId: exported.candidateId,
              generatedAt: exported.generatedAt,
              publishedAt: exported.publishedAt,
              version: exported.version,
            });
          });
        },
        retractCandidate: () => {
          void runAction("retract", async () => {
            await retractStudioBriefDraftCandidate(brief.id, {});
            setPublishCandidateExport(null);
          });
        },
        requestReview: () => {
          const message = composerDraft.trim() || "Review requested.";
          void runAction("review", async () => {
            await requestStudioBriefDraftReview(brief.id, {
              message,
            });
            setComposerDraft("");
          });
        },
        validate: () => {
          void runAction("validate", async () => {
            const response = await validateStudioBriefDraft(brief.id);
            setValidation(response.validation);
          });
        },
        clearWriteError: () => setWriteError(null),
      },
      meta: { brief, draftPublishedAt, draftStatus, route },
    }),
    [
      actorProfile,
      comments,
      selectedClaimN,
      composerDraft,
      pendingAction,
      publishCandidateExport,
      validation,
      writeError,
      brief,
      draftStatus,
      draftPublishedAt,
      route,
    ],
  );

  return <ReviewBriefContext value={value}>{children}</ReviewBriefContext>;
}

export function useReviewBrief(): ReviewBriefContextValue {
  const value = use(ReviewBriefContext);
  if (value === null) {
    throw new Error("useReviewBrief must be used within a ReviewBriefProvider");
  }
  return value;
}
