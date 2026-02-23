import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/spaces/$spaceId/")({
  loader: (opts) => {
    throw redirect({
      to: "/spaces/$spaceId/dates",
      params: { spaceId: opts.params.spaceId },
    });
  },
});
