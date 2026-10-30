import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { authUtils, isDemoMode } from "@/lib/auth";
import { promptDialog } from "@/components/ui/prompt-dialog-service";
import { StandalonePage } from "@/components/Layout/StandalonePage";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AppLogo } from "@/components/Layout/AppLogo";
import {
  Pencil,
  Plus,
  Trash2,
  LogOut,
  CircleUserRound,
  Settings2,
} from "lucide-react";
import { initDbStore } from "@/store/load";
import { type SubscribableDB } from "@will-be-done/hyperdb";
import { DBProvider } from "@will-be-done/hyperdb/react";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  listSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
} from "@will-be-done/slices/user";
import { userDBConfig } from "@/store/configs";
import { captureWebAnalytics } from "@/lib/analytics";

export const Route = createFileRoute("/spaces/")({
  component: SpacePage,
  beforeLoad: () => {
    if (isDemoMode()) {
      throw redirect({
        to: "/spaces/$spaceId/dates",
        params: { spaceId: "demo" },
      });
    }

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
  const trpc = useTRPC();
  const authConfig = useQuery(trpc.getAuthConfig.queryOptions());
  const showAccount =
    authConfig.data?.emailEnabled ||
    authConfig.data?.googleEnabled ||
    authConfig.data?.oidcName;

  const { data: spaces = [] } = useAsyncSelector({
    selector: listSpaces,
    args: {},
  });
  const dispatch = useAsyncDispatch();

  useEffect(() => {
    authUtils.setSpaceNames(
      spaces.map((s) => ({ spaceId: s.id, name: s.name })),
    );
  }, [spaces]);

  const handleSignOut = () => {
    authUtils.signOut();
    void navigate({ to: "/login" });
  };

  const handleCreateSpace = async () => {
    const name = await promptDialog("Enter space name:");
    if (!name?.trim()) return;

    const space = await dispatch(createSpace({ name: name }));
    captureWebAnalytics({
      name: "space_created",
      properties: { creation_method: "web" },
    });
    authUtils.setSpaceNames([{ spaceId: space.id, name: space.name }]);
  };

  const handleUpdateSpace = async (
    spaceId: string,
    currentName: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const name = await promptDialog("Enter new space name:", currentName);
    if (name?.trim() && name !== currentName) {
      await dispatch(updateSpace({ id: spaceId, name: name }));
      authUtils.setSpaceNames([{ spaceId, name }]);
    }
  };

  const handleDeleteSpace = async (
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

    await dispatch(deleteSpace({ id: spaceId }));
    captureWebAnalytics({
      name: "space_deleted",
      properties: { deletion_method: "web" },
    });
  };

  return (
    <StandalonePage>
      {/* Header */}
      <div className="mb-8 space-y-5 sm:mb-10 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:space-y-0">
        <div className="flex min-w-0 items-center gap-3">
          <AppLogo size={36} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Your Spaces
            </h1>
            <p className="text-[13px] text-slate-400">
              Select a space to continue or create a new one
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            onClick={() => void handleCreateSpace()}
            className="group flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-blue-500 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 hover:shadow-blue-500/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400 sm:flex-none"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Space
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Account menu"
                title="Account menu"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white/[0.05] text-slate-300 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400 data-[state=open]:bg-white/[0.08] data-[state=open]:text-white"
              >
                <CircleUserRound className="h-5 w-5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="min-w-52 rounded-xl bg-[#15151f] ring-white/10"
            >
              {showAccount && (
                <>
                  <DropdownMenuItem
                    asChild
                    className="min-h-11 gap-3 rounded-lg px-3"
                  >
                    <Link to="/account">
                      <Settings2
                        aria-hidden="true"
                        className="text-slate-400"
                      />
                      Account settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/[0.08]" />
                </>
              )}
              <DropdownMenuItem
                onSelect={handleSignOut}
                className="min-h-11 gap-3 rounded-lg px-3"
              >
                <LogOut aria-hidden="true" className="text-slate-400" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Spaces grid */}
      {spaces.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => (
            <Link
              to="/spaces/$spaceId/dates"
              params={{
                spaceId: space.id,
              }}
              key={space.id}
              data-space-card
              className="group relative overflow-hidden rounded-lg bg-white/[0.03] p-5 ring-1 ring-white/[0.06] transition-all hover:bg-white/[0.05] hover:ring-white/[0.1]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[15px] font-medium text-white">
                    {space.name}
                  </span>
                </div>
                <div className="relative z-10 flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) =>
                      void handleUpdateSpace(space.id, space.name, e)
                    }
                    className="cursor-pointer rounded-md p-1 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-blue-400"
                    aria-label="Edit space"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) =>
                      void handleDeleteSpace(space.id, space.name, e)
                    }
                    className="cursor-pointer rounded-md p-1 mr-1.5 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-red-400"
                    aria-label="Delete space"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {/* Subtle arrow indicator */}
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 transition-all group-hover:translate-x-2 group-hover:text-slate-400">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg bg-white/[0.02] py-16 ring-1 ring-white/[0.04]">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10">
            <svg
              className="h-7 w-7 text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-medium text-white">No spaces yet</h3>
          <p className="mb-6 text-[14px] text-slate-400">
            Create your first space to start organizing your tasks
          </p>
          <button
            onClick={() => void handleCreateSpace()}
            className="group flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 hover:shadow-blue-500/30"
          >
            <Plus className="h-4 w-4" />
            Create your first space
          </button>
        </div>
      )}
    </StandalonePage>
  );
}

function SpacePage() {
  const newStore = Route.useLoaderData();

  return (
    <DBProvider value={newStore as SubscribableDB}>
      <SpacePageComponent />
    </DBProvider>
  );
}
