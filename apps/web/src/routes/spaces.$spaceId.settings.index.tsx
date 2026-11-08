import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/spaces/$spaceId/settings/")({
  loader: ({ params }) => {
    throw redirect({ to: "/spaces/$spaceId/settings/general", params });
  },
});
