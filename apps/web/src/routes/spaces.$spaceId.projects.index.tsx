import { createFileRoute, redirect } from "@tanstack/react-router";
import { inboxId } from "@will-be-done/slices";

export const Route = createFileRoute("/spaces/$spaceId/projects/")({
  loader: (opts) => {
    const { spaceId } = opts.params;

    throw redirect({
      to: `/spaces/$spaceId/projects/$projectId`,
      params: {
        spaceId,
        projectId: inboxId,
      },
    });
  },
});
