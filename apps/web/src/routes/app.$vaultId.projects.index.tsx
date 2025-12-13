import { createFileRoute, redirect } from "@tanstack/react-router";
import { inboxId } from "@will-be-done/slices";

export const Route = createFileRoute("/app/$vaultId/projects/")({
  loader: (opts) => {
    const { vaultId } = opts.params;

    throw redirect({
      to: `/app/$vaultId/projects/$projectId`,
      params: {
        vaultId,
        projectId: inboxId,
      },
    });
  },
});
