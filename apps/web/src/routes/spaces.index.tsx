import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { authUtils } from "@/lib/auth";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { initDbStore } from "@/store/load";
import {
  DBProvider,
  useDispatch,
  useSyncSelector,
} from "@will-be-done/hyperdb";
import { spaceSlice } from "@will-be-done/slices/user";
import { userDBConfig } from "@/store/configs";

export const Route = createFileRoute("/spaces/")({
  component: SpacePage,
  beforeLoad: () => {
    if (!authUtils.isAuthenticated() || !authUtils.getUserId()) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    const userId = authUtils.getUserId();

    if (!userId) {
      throw redirect({ to: "/login" });
    }

    return initDbStore(userDBConfig(userId));
  },
});

function SpacePageComponent() {
  const navigate = useNavigate();

  const spaces = useSyncSelector(() => spaceSlice.listSpaces(), []);
  const dispatch = useDispatch();

  const handleSignOut = () => {
    authUtils.signOut();
    void navigate({ to: "/login" });
  };

  const handleCreateSpace = () => {
    const name = window.prompt("Enter space name:");
    if (!name?.trim()) return;

    dispatch(spaceSlice.createSpace(name));
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
      dispatch(spaceSlice.updateSpace(spaceId, name));
    }
  };

  const handleDeleteSpace = (
    spaceId: string,
    spaceName: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const ok = window.confirm(
      `Are you sure you want to delete space "${spaceName}"? This action cannot be undone.`,
    );

    if (!ok) return;

    dispatch(spaceSlice.deleteSpace(spaceId));
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

        <div className="grid grid-cols-4 gap-4">
          {spaces.map((space) => (
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
                    onClick={(e) => handleUpdateSpace(space.id, space.name, e)}
                    className="text-content-tinted hover:text-accent transition-colors cursor-pointer"
                    aria-label="Edit space"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteSpace(space.id, space.name, e)}
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

        {spaces.length === 0 && (
          <div className="text-center text-content-tinted py-12">
            No spaces yet. Create your first space to get started.
          </div>
        )}
      </div>
    </div>
  );
}

function SpacePage() {
  const newStore = Route.useLoaderData();

  return (
    <DBProvider value={newStore}>
      <SpacePageComponent />
    </DBProvider>
  );
}
