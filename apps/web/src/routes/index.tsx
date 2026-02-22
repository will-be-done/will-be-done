import { LandingPage } from "@/components/Landing/Landing";
import { authUtils } from "@/lib/auth";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: () => {
    const isAuthed = authUtils.isAuthenticated();

    if (!isAuthed) {
      if (
        window.location.host === "will-be-done.app" ||
        window.location.host === "localhost:5173"
      ) {
        return;
      }

      throw redirect({ to: "/login" });
    }

    const lastUsedSpaceId = authUtils.getLastUsedSpaceId();
    if (lastUsedSpaceId) {
      throw redirect({
        to: "/spaces/$spaceId/dates",
        params: {
          spaceId: lastUsedSpaceId,
        },
      });
    }

    throw redirect({
      to: "/spaces",
    });
  },
  component: LandingPage,
});
