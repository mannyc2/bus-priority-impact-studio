import { createContext, type ReactNode, use, useMemo, useState } from "react";
import {
  addStudioBriefDraftClaim,
  deleteStudioBriefDraftClaim,
  fetchStudioBrief,
  generateStudioBriefDraft,
  updateStudioBriefDraft,
  updateStudioBriefDraftClaim,
} from "@/studio/api-client.js";
import type {
  StudioBriefDraftClaimCreateRequest,
  StudioBriefDraftClaimPatchRequest,
  StudioBriefDraftPatchRequest,
  StudioBriefGenerationJobResponse,
  StudioBriefResponse,
} from "@/studio/api-contract.js";

type DraftMode = "new" | "edit";

type DraftBriefState = {
  attached: ReadonlySet<string>;
  attachedCaveats: ReadonlySet<string>;
  activeClaimN: number;
  generationJob: StudioBriefGenerationJobResponse | null;
  pendingCaveatId: string | null;
  pendingEvidenceId: string | null;
  pendingAction: string | null;
  writeError: string | null;
};

type DraftBriefActions = {
  toggleEvidence: (id: string) => void;
  toggleCaveat: (id: string) => void;
  setActiveClaimN: (n: number) => void;
  saveMetadata: (input: StudioBriefDraftPatchRequest) => void;
  saveClaim: (claimN: number, input: StudioBriefDraftClaimPatchRequest) => void;
  addClaim: (input: StudioBriefDraftClaimCreateRequest) => void;
  deleteClaim: (claimN: number) => void;
  regenerateDraft: () => void;
  clearWriteError: () => void;
};

type DraftBriefMeta = {
  mode: DraftMode;
  brief: StudioBriefResponse["brief"];
  route: StudioBriefResponse["route"];
};

type DraftBriefContextValue = {
  state: DraftBriefState;
  actions: DraftBriefActions;
  meta: DraftBriefMeta;
};

const DraftBriefContext = createContext<DraftBriefContextValue | null>(null);

export function DraftBriefProvider({
  data,
  mode,
  children,
}: {
  data: StudioBriefResponse;
  mode: DraftMode;
  children: ReactNode;
}) {
  const { route } = data;
  const [brief, setBrief] = useState(data.brief);
  const [generationJob, setGenerationJob] = useState<StudioBriefGenerationJobResponse | null>(null);
  const [activeClaimN, setActiveClaimN] = useState<number>(
    brief.claims.find((c) => c.state === "editing")?.n ?? brief.claims[0]?.n ?? 1,
  );
  const [pendingCaveatId, setPendingCaveatId] = useState<string | null>(null);
  const [pendingEvidenceId, setPendingEvidenceId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const activeClaim = brief.claims.find((claim) => claim.n === activeClaimN) ?? brief.claims[0];
  const attached = useMemo(
    () => new Set(activeClaim?.evidenceIds ?? []),
    [activeClaim?.evidenceIds],
  );
  const attachedCaveats = useMemo(
    () => new Set(activeClaim?.caveatIds ?? []),
    [activeClaim?.caveatIds],
  );

  async function refreshBrief() {
    const refreshed = await fetchStudioBrief(brief.id);
    if (refreshed !== null) setBrief(refreshed.brief);
  }

  async function runWrite(action: string, task: () => Promise<void>) {
    setPendingAction(action);
    setWriteError(null);
    try {
      await task();
      await refreshBrief();
    } catch (caught) {
      setWriteError(caught instanceof Error ? caught.message : "Draft write failed.");
    } finally {
      setPendingAction(null);
    }
  }

  function toggleEvidence(id: string) {
    if (activeClaim === undefined) return;
    const next = new Set(activeClaim.evidenceIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPendingEvidenceId(id);
    void runWrite(`evidence:${id}`, async () => {
      await updateStudioBriefDraftClaim(brief.id, activeClaim.n, {
        evidenceIds: [...next],
      });
      setPendingEvidenceId(null);
    }).finally(() => setPendingEvidenceId(null));
  }

  function toggleCaveat(id: string) {
    if (activeClaim === undefined) return;
    const next = new Set(activeClaim.caveatIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPendingCaveatId(id);
    void runWrite(`caveat:${id}`, async () => {
      await updateStudioBriefDraftClaim(brief.id, activeClaim.n, {
        caveatIds: [...next],
      });
      setPendingCaveatId(null);
    }).finally(() => setPendingCaveatId(null));
  }

  function saveMetadata(input: StudioBriefDraftPatchRequest) {
    void runWrite("metadata", async () => {
      await updateStudioBriefDraft(brief.id, input);
    });
  }

  function saveClaim(claimN: number, input: StudioBriefDraftClaimPatchRequest) {
    void runWrite(`claim:${claimN}`, async () => {
      await updateStudioBriefDraftClaim(brief.id, claimN, input);
    });
  }

  function addClaim(input: StudioBriefDraftClaimCreateRequest) {
    void runWrite("add-claim", async () => {
      const response = await addStudioBriefDraftClaim(brief.id, input);
      setActiveClaimN(response.claim.n);
    });
  }

  function deleteClaim(claimN: number) {
    void runWrite(`delete-claim:${claimN}`, async () => {
      await deleteStudioBriefDraftClaim(brief.id, claimN);
      setActiveClaimN(Math.max(1, claimN - 1));
    });
  }

  function regenerateDraft() {
    void runWrite("generate", async () => {
      const response = await generateStudioBriefDraft(brief.id, {});
      setGenerationJob(response);
      if (response.status === "failed") {
        throw new Error(response.error ?? "Studio draft generation failed.");
      }
      setActiveClaimN(response.draft.claims[0]?.n ?? 1);
    });
  }

  const value = useMemo<DraftBriefContextValue>(
    () => ({
      state: {
        attached,
        attachedCaveats,
        activeClaimN,
        generationJob,
        pendingCaveatId,
        pendingEvidenceId,
        pendingAction,
        writeError,
      },
      actions: {
        toggleEvidence,
        toggleCaveat,
        setActiveClaimN,
        saveMetadata,
        saveClaim,
        addClaim,
        deleteClaim,
        regenerateDraft,
        clearWriteError: () => setWriteError(null),
      },
      meta: { mode, brief, route },
    }),
    [
      attached,
      attachedCaveats,
      activeClaimN,
      generationJob,
      pendingCaveatId,
      pendingEvidenceId,
      pendingAction,
      writeError,
      mode,
      brief,
      route,
    ],
  );

  return <DraftBriefContext value={value}>{children}</DraftBriefContext>;
}

export function useDraftBrief(): DraftBriefContextValue {
  const value = use(DraftBriefContext);
  if (value === null) {
    throw new Error("useDraftBrief must be used within a DraftBriefProvider");
  }
  return value;
}
