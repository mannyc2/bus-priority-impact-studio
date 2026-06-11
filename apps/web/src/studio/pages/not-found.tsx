import { Link } from "@tanstack/react-router";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { StudioPage, StudioPanel } from "../page.js";

export function NotFoundPage() {
  return (
    <StudioPage>
      <StudioPanel>
        <ErrorState
          title="Page not found"
          body="We could not find that Studio page. Search for a route or return to the route list."
          action={
            <Button size="sm" variant="secondary" render={<Link to="/" viewTransition />}>
              Back to routes
            </Button>
          }
        />
      </StudioPanel>
    </StudioPage>
  );
}
