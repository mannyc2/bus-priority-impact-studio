import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/methods")({
  beforeLoad: () => {
    throw redirect({ to: "/docs/$page", params: { page: "methodology" }, replace: true });
  },
});
