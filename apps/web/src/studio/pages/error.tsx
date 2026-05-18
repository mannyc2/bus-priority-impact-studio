import { useRouter } from "@tanstack/react-router";
import { ErrorState } from "@/components/ErrorState";
import { StudioApiContractError, StudioApiError } from "../api-client.js";
import { StudioPage, StudioPanel } from "../page.js";

export function StudioRouteErrorPage({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  const detail = errorMessage(error);

  return (
    <StudioPage>
      <StudioPanel>
        <ErrorState
          title={detail.title}
          body={
            <span>
              {detail.body}
              {detail.meta ? (
                <span className="mt-2 block font-mono text-[11px] text-[var(--bp-color-ink-55)]">
                  {detail.meta}
                </span>
              ) : null}
            </span>
          }
          retry="Retry"
          onRetry={() => {
            reset();
            void router.invalidate();
          }}
        />
      </StudioPanel>
    </StudioPage>
  );
}

function errorMessage(error: unknown): { title: string; body: string; meta?: string } {
  if (error instanceof StudioApiError) {
    if (error.status === 503) {
      return {
        title: "Studio release is unavailable",
        body: "The API could not find the serving projection for this page. The route is valid, but the current release is incomplete.",
        meta: `${error.status} ${error.code} ${error.path}`,
      };
    }

    if (error.status >= 500) {
      return {
        title: "Studio API failed",
        body: "The Worker returned an unexpected server error while loading this page.",
        meta: `${error.status} ${error.code} ${error.path}`,
      };
    }

    return {
      title: "Could not load this Studio page",
      body: error.message,
      meta: `${error.status} ${error.code} ${error.path}`,
    };
  }

  if (error instanceof StudioApiContractError) {
    return {
      title: "Studio API contract mismatch",
      body: "The API responded, but the payload did not match the page contract.",
      meta: error.path,
    };
  }

  if (error instanceof Error) {
    return {
      title: "Could not load this Studio page",
      body: error.message,
    };
  }

  return {
    title: "Could not load this Studio page",
    body: "An unknown error interrupted the page load.",
  };
}
