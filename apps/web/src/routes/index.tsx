import { authUtils } from "@/lib/auth";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: () => {
    const isAuthed = authUtils.isAuthenticated();

    if (!isAuthed) {
      throw redirect({ to: "/login" });
    }

    const lastUsedVaultId = authUtils.getLastUsedVaultId();
    if (lastUsedVaultId) {
      throw redirect({
        to: "/app/$vaultId/timeline",
        params: {
          vaultId: lastUsedVaultId,
        },
      });
    }

    throw redirect({
      to: "/vault",
    });
  },
});
