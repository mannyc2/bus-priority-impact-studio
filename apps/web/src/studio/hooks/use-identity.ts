import { useEffect, useState } from "react";
import type { IdentityAnonymousMeResponse, IdentityMeResponse } from "../api-contract.js";

export type IdentityMeData = IdentityMeResponse | IdentityAnonymousMeResponse;

export type IdentityMeState =
  | { status: "loading" }
  | { status: "ready"; data: IdentityMeData }
  | { status: "error"; error: string };

export function useIdentity(): IdentityMeState {
  const [state, setState] = useState<IdentityMeState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    fetch("/api/v1/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as IdentityMeData;
      })
      .then((data) => {
        if (!active) return;
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({ status: "error", error: error instanceof Error ? error.message : "Unknown" });
      });
    return () => {
      active = false;
    };
  }, []);
  return state;
}

export function isSignedIn(data: IdentityMeData): data is IdentityMeResponse {
  return data.identity !== null;
}
