import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/spaces/$spaceId/projects/")({
  loader: (opts) => {
    const { spaceId } = opts.params;

    throw redirect({
      to: `/spaces/$spaceId/projects/$projectId`,
      params: {
        spaceId,
        projectId: "inbox",
      },
    });
  },
});
