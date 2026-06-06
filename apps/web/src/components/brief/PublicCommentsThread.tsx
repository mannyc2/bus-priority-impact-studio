import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { PublicCommentResponse } from "../../studio/api-contract.js";
import { isSignedIn, useIdentity } from "../../studio/hooks/use-identity.js";

export function PublicCommentsThread({ briefId }: { briefId: string }) {
  const identityState = useIdentity();
  const [comments, setComments] = useState<PublicCommentResponse[] | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load(): Promise<void> {
    const response = await fetch(`/api/v1/briefs/${encodeURIComponent(briefId)}/public-comments`, {
      credentials: "same-origin",
    });
    if (!response.ok) return;
    const data = (await response.json()) as { comments: PublicCommentResponse[] };
    setComments(data.comments);
  }

  useEffect(() => {
    void load();
  }, [briefId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (body.trim().length === 0) return;
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/v1/briefs/${encodeURIComponent(briefId)}/public-comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ body }),
        },
      );
      if (response.ok) {
        setBody("");
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="border-t border-[var(--bp-color-rule)] pt-4">
      <h2 className="mb-2 text-[14px] font-semibold">Public comments</h2>
      {comments === null ? (
        <p className="text-[12px] text-[var(--bp-color-muted)]">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-[12px] text-[var(--bp-color-muted)]">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.commentId} className="text-[13px]">
              <div className="text-[11px] text-[var(--bp-color-muted)]">
                {comment.displayName ?? "Anonymous"} · {comment.createdAt.slice(0, 10)}
              </div>
              <div>{comment.body}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        {identityState.status === "ready" && isSignedIn(identityState.data) ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Leave a comment"
              rows={3}
              className="rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-3 py-2 text-[13px]"
            />
            <button
              type="submit"
              disabled={submitting || body.trim().length === 0}
              className="self-start rounded-[3px] bg-[var(--bp-color-ink)] px-3 py-1.5 text-[12px] text-white disabled:opacity-50"
            >
              {submitting ? "Posting…" : "Post comment"}
            </button>
          </form>
        ) : (
          <p className="text-[12px] text-[var(--bp-color-muted)]">
            <Link to="/signin" className="text-[var(--bp-color-link)] underline">
              Sign in
            </Link>{" "}
            to leave a comment.
          </p>
        )}
      </div>
    </section>
  );
}
