import { LandingPage } from "@/components/Landing/Landing";
import { authUtils, isDemoMode } from "@/lib/auth";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: () => {
    if (isDemoMode()) {
      throw redirect({
        to: "/spaces/$spaceId/dates",
        params: { spaceId: "demo" },
      });
    }

    const isAuthed = authUtils.isAuthenticated();

    if (!isAuthed) {
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
});
