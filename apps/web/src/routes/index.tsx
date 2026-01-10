import { authUtils } from "@/lib/auth";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: () => {
    const isAuthed = authUtils.isAuthenticated();

    if (!isAuthed) {
      throw redirect({ to: "/login" });
    }

    const lastUsedSpaceId = authUtils.getLastUsedSpaceId();
    if (lastUsedSpaceId) {
      throw redirect({
        to: "/spaces/$spaceId/timeline",
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
