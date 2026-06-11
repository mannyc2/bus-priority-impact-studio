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
import { useHistory } from "./composer/use-history.js";

type PublishCandidateExportSummary = Pick<
  StudioBriefPublishCandidateExportResponse,
  "artifactKey" | "candidateId" | "generatedAt" | "publishedAt" | "version"
>;

/** Reviewer-composer mode — the two comment kinds the data model carries. */
export type ReviewComposerMode = StudioComment["kind"];

type ReviewBriefState = {
  actorProfile: StudioActorMeResponse | null;
  comments: readonly StudioComment[];
  activeCommentId: string | null;
  canUndoComments: boolean;
  canRedoComments: boolean;
  composerMode: ReviewComposerMode;
  commentDraft: string;
  selectedClaimN: number;
  reviewMessage: string;
  pendingAction: "export" | "publish" | "retract" | "review" | "validate" | null;
  publishCandidateExport: PublishCandidateExportSummary | null;
  validation: StudioBriefDraftValidation | null;
  writeError: string | null;
};

type ReviewBriefActions = {
  setActiveComment: (id: string) => void;
  setComposerMode: (mode: ReviewComposerMode) => void;
  setCommentDraft: (text: string) => void;
  addComment: () => void;
  resolveComment: (id: string) => void;
  undoComments: () => void;
  redoComments: () => void;
  setReviewMessage: (text: string) => void;
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

  // Comments live in an undo/redo history: resolving or adding a comment is a
  // reviewer action you can take back, the same model as the composer's edits.
  // The backend exposes no comment-write endpoints, so this slice is local
  // chrome — the backed review actions (validate / publish) are separate below.
  const commentHistory = useHistory<readonly StudioComment[]>(data.comments);
  const comments = commentHistory.present;
  const [activeCommentId, setActiveCommentId] = useState<string | null>(
    data.comments[0]?.id ?? null,
  );
  const [composerMode, setComposerMode] = useState<ReviewComposerMode>("comment");
  const [commentDraft, setCommentDraft] = useState("");
  const [selectedClaimN, setSelectedClaimN] = useState<number>(
    data.comments[0]?.claimN ?? brief.claims[0]?.n ?? 1,
  );

  const [reviewMessage, setReviewMessage] = useState("");
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
    // Comments are a local-history concern on this surface (no write endpoint),
    // so a lifecycle refresh deliberately leaves the reviewer's annotations be.
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
        activeCommentId,
        canUndoComments: commentHistory.canUndo,
        canRedoComments: commentHistory.canRedo,
        composerMode,
        commentDraft,
        selectedClaimN,
        reviewMessage,
        pendingAction,
        publishCandidateExport,
        validation,
        writeError,
      },
      actions: {
        setActiveComment: (id) => {
          setActiveCommentId(id);
          const target = comments.find((comment) => comment.id === id);
          if (target) setSelectedClaimN(target.claimN);
        },
        setComposerMode,
        setCommentDraft,
        addComment: () => {
          const body = commentDraft.trim();
          if (!body) return;
          const id = `local-${comments.length + 1}-${selectedClaimN}`;
          commentHistory.set((current) => [
            ...current,
            {
              id,
              briefId: brief.id,
              claimN: selectedClaimN,
              kind: composerMode,
              author: "You",
              initials: "YO",
              ago: "just now",
              on: "",
              body,
            },
          ]);
          setCommentDraft("");
          setActiveCommentId(id);
        },
        resolveComment: (id) => {
          commentHistory.set((current) =>
            current.map((comment) =>
              comment.id === id ? { ...comment, resolved: true } : comment,
            ),
          );
        },
        undoComments: commentHistory.undo,
        redoComments: commentHistory.redo,
        setReviewMessage,
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
          const message = reviewMessage.trim() || "Review requested.";
          void runAction("review", async () => {
            await requestStudioBriefDraftReview(brief.id, { message });
            setReviewMessage("");
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
      activeCommentId,
      commentHistory,
      composerMode,
      commentDraft,
      selectedClaimN,
      reviewMessage,
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
