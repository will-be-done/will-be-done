import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { authUtils } from "@/lib/auth";
import { trpc } from "@/lib/trpc";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { queryClient } from "@/lib/query";

export const Route = createFileRoute("/vault")({
  component: VaultPage,
  beforeLoad: () => {
    if (!authUtils.isAuthenticated() || !authUtils.getUserId()) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    await queryClient.prefetchQuery(trpc.listVaults.queryOptions());
  },
});

function VaultPage() {
  const navigate = useNavigate();

  const vaultsQuery = useSuspenseQuery(trpc.listVaults.queryOptions());

  const createVaultMutation = useMutation(
    trpc.createVault.mutationOptions({
      onSuccess: () => {
        void vaultsQuery.refetch();
      },
    }),
  );

  const updateVaultMutation = useMutation(
    trpc.updateVault.mutationOptions({
      onSuccess: () => {
        void vaultsQuery.refetch();
      },
    }),
  );

  const deleteVaultMutation = useMutation(
    trpc.deleteVault.mutationOptions({
      onSuccess: () => {
        void vaultsQuery.refetch();
      },
    }),
  );

  const handleCreateVault = () => {
    const name = window.prompt("Enter vault name:");
    if (name?.trim()) {
      createVaultMutation.mutate({ name: name.trim() });
    }
  };

  const handleUpdateVault = (
    vaultId: string,
    currentName: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const name = window.prompt("Enter new vault name:", currentName);
    if (name?.trim() && name !== currentName) {
      updateVaultMutation.mutate({ id: vaultId, name: name.trim() });
    }
  };

  const handleDeleteVault = (
    vaultId: string,
    vaultName: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      window.confirm(
        `Are you sure you want to delete vault "${vaultName}"? This action cannot be undone.`,
      )
    ) {
      deleteVaultMutation.mutate({ id: vaultId });
    }
  };

  const handleSignOut = () => {
    authUtils.signOut();
    void navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Vaults</h1>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleCreateVault}
              className="flex items-center gap-2 bg-panel hover:bg-panel-selected text-content px-4 py-2 rounded-lg cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              New Vault
            </Button>

            <Button
              onClick={handleSignOut}
              className="bg-panel hover:bg-panel-selected text-content px-4 py-2 rounded-lg cursor-pointer"
            >
              Sign Out
            </Button>
          </div>
        </div>

        {vaultsQuery.isLoading && (
          <div className="text-content-tinted">Loading vaults...</div>
        )}

        {vaultsQuery.error && (
          <div className="text-notice">
            Error loading vaults:{" "}
            {vaultsQuery.error instanceof Error
              ? vaultsQuery.error.message
              : "Unknown error"}
          </div>
        )}

        {vaultsQuery.data && (
          <div className="grid grid-cols-4 gap-4">
            {vaultsQuery.data.map((vault) => (
              <Link
                to="/app/$vaultId/timeline"
                params={{
                  vaultId: vault.id,
                }}
                key={vault.id}
                className="bg-panel rounded-lg shadow-lg border cursor-pointer"
                style={{ height: "60px" }}
              >
                <div className="h-full flex items-center justify-between px-3">
                  <span className="text-content font-medium truncate">
                    {vault.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) =>
                        handleUpdateVault(vault.id, vault.name, e)
                      }
                      className="text-content-tinted hover:text-accent transition-colors cursor-pointer"
                      aria-label="Edit vault"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) =>
                        handleDeleteVault(vault.id, vault.name, e)
                      }
                      className="text-content-tinted hover:text-notice transition-colors cursor-pointer"
                      aria-label="Delete vault"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {vaultsQuery.data && vaultsQuery.data.length === 0 && (
          <div className="text-center text-content-tinted py-12">
            No vaults yet. Create your first vault to get started.
          </div>
        )}
      </div>
    </div>
  );
}
