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

export const Route = createFileRoute("/spaces/")({
  component: SpacePage,
  beforeLoad: () => {
    if (!authUtils.isAuthenticated() || !authUtils.getUserId()) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    await queryClient.prefetchQuery(trpc.listSpaces.queryOptions());
  },
});

function SpacePage() {
  const navigate = useNavigate();

  const spacesQuery = useSuspenseQuery(trpc.listSpaces.queryOptions());

  const createSpaceMutation = useMutation(
    trpc.createSpace.mutationOptions({
      onSuccess: () => {
        void spacesQuery.refetch();
      },
    }),
  );

  const updateSpaceMutation = useMutation(
    trpc.updateSpace.mutationOptions({
      onSuccess: () => {
        void spacesQuery.refetch();
      },
    }),
  );

  const deleteSpaceMutation = useMutation(
    trpc.deleteSpace.mutationOptions({
      onSuccess: () => {
        void spacesQuery.refetch();
      },
    }),
  );

  const handleCreateSpace = () => {
    const name = window.prompt("Enter space name:");
    if (name?.trim()) {
      createSpaceMutation.mutate({ name: name.trim() });
    }
  };

  const handleUpdateSpace = (
    spaceId: string,
    currentName: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const name = window.prompt("Enter new space name:", currentName);
    if (name?.trim() && name !== currentName) {
      updateSpaceMutation.mutate({ id: spaceId, name: name.trim() });
    }
  };

  const handleDeleteSpace = (
    spaceId: string,
    spaceName: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      window.confirm(
        `Are you sure you want to delete space "${spaceName}"? This action cannot be undone.`,
      )
    ) {
      deleteSpaceMutation.mutate({ id: spaceId });
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
          <h1 className="text-3xl font-bold text-primary">Spaces</h1>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleCreateSpace}
              className="flex items-center gap-2 bg-panel hover:bg-panel-selected text-content px-4 py-2 rounded-lg cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              New Space
            </Button>

            <Button
              onClick={handleSignOut}
              className="bg-panel hover:bg-panel-selected text-content px-4 py-2 rounded-lg cursor-pointer"
            >
              Sign Out
            </Button>
          </div>
        </div>

        {spacesQuery.isLoading && (
          <div className="text-content-tinted">Loading spaces...</div>
        )}

        {spacesQuery.error && (
          <div className="text-notice">
            Error loading spaces:{" "}
            {spacesQuery.error instanceof Error
              ? spacesQuery.error.message
              : "Unknown error"}
          </div>
        )}

        {spacesQuery.data && (
          <div className="grid grid-cols-4 gap-4">
            {spacesQuery.data.map((space) => (
              <Link
                to="/spaces/$spaceId/timeline"
                params={{
                  spaceId: space.id,
                }}
                key={space.id}
                className="bg-panel rounded-lg shadow-lg border cursor-pointer"
                style={{ height: "60px" }}
              >
                <div className="h-full flex items-center justify-between px-3">
                  <span className="text-content font-medium truncate">
                    {space.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) =>
                        handleUpdateSpace(space.id, space.name, e)
                      }
                      className="text-content-tinted hover:text-accent transition-colors cursor-pointer"
                      aria-label="Edit space"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) =>
                        handleDeleteSpace(space.id, space.name, e)
                      }
                      className="text-content-tinted hover:text-notice transition-colors cursor-pointer"
                      aria-label="Delete space"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {spacesQuery.data && spacesQuery.data.length === 0 && (
          <div className="text-center text-content-tinted py-12">
            No spaces yet. Create your first space to get started.
          </div>
        )}
      </div>
    </div>
  );
}
