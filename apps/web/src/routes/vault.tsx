import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { authUtils } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/vault")({
  component: VaultPage,
  beforeLoad: () => {
    if (!authUtils.isAuthenticated() || !authUtils.getUserId()) {
      throw redirect({ to: "/login" });
    }
  },
});

function VaultPage() {
  const trpc = useTRPC();
  const [editingVaultId, setEditingVaultId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newVaultName, setNewVaultName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const vaultsQuery = useQuery(trpc.listVaults.queryOptions());

  const createVaultMutation = useMutation(
    trpc.createVault.mutationOptions({
      onSuccess: () => {
        setNewVaultName("");
        setIsCreating(false);
        void vaultsQuery.refetch();
      },
    }),
  );

  const updateVaultMutation = useMutation(
    trpc.updateVault.mutationOptions({
      onSuccess: () => {
        setEditingVaultId(null);
        setEditingName("");
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

  const handleCreateVault = (e: React.FormEvent) => {
    e.preventDefault();
    if (newVaultName.trim()) {
      createVaultMutation.mutate({ name: newVaultName });
    }
  };

  const handleUpdateVault = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingVaultId && editingName.trim()) {
      updateVaultMutation.mutate({ id: editingVaultId, name: editingName });
    }
  };

  const startEditing = (vaultId: string, currentName: string) => {
    setEditingVaultId(vaultId);
    setEditingName(currentName);
  };

  const cancelEditing = () => {
    setEditingVaultId(null);
    setEditingName("");
  };

  const handleDeleteVault = (vaultId: string, vaultName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (window.confirm(`Are you sure you want to delete vault "${vaultName}"? This action cannot be undone.`)) {
      deleteVaultMutation.mutate({ id: vaultId });
    }
  };

  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Vaults</h1>
          <Button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 bg-panel hover:bg-panel-selected text-content px-4 py-2 rounded-lg"
          >
            <Plus className="h-4 w-4" />
            New Vault
          </Button>
        </div>

        {isCreating && (
          <div className="mb-6 p-4 bg-panel rounded-lg border border-panel-selected">
            <form onSubmit={handleCreateVault} className="flex gap-2">
              <input
                type="text"
                value={newVaultName}
                onChange={(e) => setNewVaultName(e.target.value)}
                placeholder="Vault name"
                autoFocus
                className="flex-1 px-3 py-2 bg-surface text-content rounded border border-input focus:outline-none focus:border-accent"
              />
              <Button
                type="submit"
                disabled={createVaultMutation.isPending}
                className="bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded"
              >
                {createVaultMutation.isPending ? "Creating..." : "Create"}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewVaultName("");
                }}
                className="bg-panel-tinted hover:bg-panel-selected text-content px-4 py-2 rounded"
              >
                Cancel
              </Button>
            </form>
          </div>
        )}

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
                className="bg-panel rounded-lg shadow-lg border border-panel-selected cursor-pointer"
                style={{ height: "60px" }}
              >
                {editingVaultId === vault.id ? (
                  <form
                    onSubmit={handleUpdateVault}
                    className="h-full flex items-center gap-2 px-3"
                  >
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                      className="flex-1 px-2 py-1 bg-surface text-content rounded border border-input focus:outline-none focus:border-accent text-sm"
                    />
                    <button
                      type="submit"
                      disabled={updateVaultMutation.isPending}
                      className="text-accent hover:text-accent/80 text-xs px-2"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="text-content-tinted hover:text-content text-xs px-2"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="h-full flex items-center justify-between px-3">
                    <span className="text-content font-medium truncate">
                      {vault.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startEditing(vault.id, vault.name);
                        }}
                        className="text-content-tinted hover:text-accent transition-colors"
                        aria-label="Edit vault"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteVault(vault.id, vault.name, e)}
                        className="text-content-tinted hover:text-notice transition-colors"
                        aria-label="Delete vault"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}

        {vaultsQuery.data && vaultsQuery.data.length === 0 && !isCreating && (
          <div className="text-center text-content-tinted py-12">
            No vaults yet. Create your first vault to get started.
          </div>
        )}
      </div>
    </div>
  );
}
