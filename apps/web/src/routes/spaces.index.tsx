import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { authUtils } from "@/lib/auth";
import { Pencil, Plus, Trash2, LogOut } from "lucide-react";
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

const logoPath =
  "M40.4835 111.929C39.5895 111.929 38.7321 111.575 38.0999 110.945C37.4678 110.316 37.1126 109.462 37.1126 108.571V41.4286C37.1126 40.5382 37.4678 39.6843 38.0999 39.0547C38.7321 38.4251 39.5895 38.0714 40.4835 38.0714H102.845C104.186 38.0714 105.472 37.5409 106.42 36.5965C107.368 35.6521 107.901 34.3713 107.901 33.0357C107.901 31.7002 107.368 30.4193 106.42 29.4749C105.472 28.5305 104.186 28 102.845 28H40.4835C36.9074 28 33.4779 29.4148 30.9492 31.9331C28.4206 34.4515 27 37.8671 27 41.4286V108.571C27 112.133 28.4206 115.549 30.9492 118.067C33.4779 120.585 36.9074 122 40.4835 122H107.901C111.477 122 114.907 120.585 117.435 118.067C119.964 115.549 121.384 112.133 121.384 108.571V86.75C121.384 85.4144 120.852 84.1336 119.903 83.1892C118.955 82.2448 117.669 81.7143 116.328 81.7143C114.987 81.7143 113.701 82.2448 112.753 83.1892C111.804 84.1336 111.272 85.4144 111.272 86.75V108.571C111.272 109.462 110.917 110.316 110.284 110.945C109.652 111.575 108.795 111.929 107.901 111.929H40.4835ZM126.643 52.7086C127.536 51.754 128.022 50.4914 127.999 49.1868C127.976 47.8822 127.445 46.6375 126.519 45.7148C125.593 44.7922 124.343 44.2637 123.033 44.2407C121.723 44.2177 120.455 44.7019 119.497 45.5914L82.0261 82.9027L69.3988 69.9039C68.9381 69.4244 68.3868 69.0404 67.7766 68.7739C67.1664 68.5074 66.5093 68.3636 65.843 68.3508C65.1768 68.3381 64.5147 68.4566 63.8946 68.6995C63.2746 68.9425 62.7088 69.3051 62.23 69.7666C61.7511 70.228 61.3685 70.7791 61.1042 71.3883C60.84 71.9975 60.6992 72.6527 60.69 73.3163C60.6808 73.9798 60.8034 74.6386 61.0508 75.2548C61.2981 75.871 61.6653 76.4325 62.1312 76.9069L78.3316 93.5851C78.7978 94.0666 79.3555 94.4508 79.9724 94.7152C80.5892 94.9797 81.2528 95.1191 81.9243 95.1254C82.5959 95.1316 83.2619 95.0046 83.8836 94.7517C84.5053 94.4987 85.0702 94.125 85.5453 93.6523L126.643 52.7086Z";

function Logo({ size = 32 }: { size?: number }) {
  const id = `logo_spaces_${size}`;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-[13%] bg-blue-500/30 blur-md"
        style={{ transform: "scale(1.15)" }}
      />
      <svg
        width={size}
        height={size}
        viewBox="0 0 150 150"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative"
      >
        <rect width="150" height="150" rx="19" fill={`url(#paint0_${id})`} />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d={logoPath}
          fill={`url(#paint1_${id})`}
        />
        <defs>
          <linearGradient
            id={`paint0_${id}`}
            x1="9"
            y1="5.5"
            x2="150"
            y2="150"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#3b82f6" />
            <stop offset="1" stopColor="#1e40af" />
          </linearGradient>
          <linearGradient
            id={`paint1_${id}`}
            x1="27"
            y1="28"
            x2="118.5"
            y2="120.5"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#93c5fd" />
            <stop offset="1" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

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
    <div className="relative min-h-screen bg-[#0a0a0f] text-slate-100 antialiased">
      {/* Gradient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-[400px] left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-blue-600/8 blur-[120px]" />
        <div className="absolute -bottom-[200px] -right-[200px] h-[600px] w-[600px] rounded-full bg-indigo-500/6 blur-[100px]" />
      </div>

      {/* Noise texture overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative px-6 py-8">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <div className="mb-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo size={36} />
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Your Spaces
                </h1>
                <p className="text-[13px] text-slate-400">
                  Select a space to continue or create a new one
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCreateSpace}
                className="group flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 hover:shadow-blue-500/30"
              >
                <Plus className="h-4 w-4" />
                New Space
              </button>
              <button
                onClick={handleSignOut}
                className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/[0.05] px-4 py-2.5 text-[13px] font-medium text-slate-300 ring-1 ring-white/[0.08] transition-all hover:bg-white/[0.08] hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>

          {/* Spaces grid */}
          {spaces.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {spaces.map((space) => (
                <Link
                  to="/spaces/$spaceId/timeline"
                  params={{
                    spaceId: space.id,
                  }}
                  key={space.id}
                  className="group relative overflow-hidden rounded-lg bg-white/[0.03] p-5 ring-1 ring-white/[0.06] transition-all hover:bg-white/[0.05] hover:ring-white/[0.1]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-[15px] font-medium text-white">
                        {space.name}
                      </span>
                    </div>
                    <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) =>
                          handleUpdateSpace(space.id, space.name, e)
                        }
                        className="cursor-pointer rounded-md p-1 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-blue-400"
                        aria-label="Edit space"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) =>
                          handleDeleteSpace(space.id, space.name, e)
                        }
                        className="cursor-pointer rounded-md p-1 mr-1.5 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-red-400"
                        aria-label="Delete space"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {/* Subtle arrow indicator */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 transition-all group-hover:translate-x-2 group-hover:text-slate-400">
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
              <h3 className="mb-2 text-lg font-medium text-white">
                No spaces yet
              </h3>
              <p className="mb-6 text-[14px] text-slate-400">
                Create your first space to start organizing your tasks
              </p>
              <button
                onClick={handleCreateSpace}
                className="group flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 hover:shadow-blue-500/30"
              >
                <Plus className="h-4 w-4" />
                Create your first space
              </button>
            </div>
          )}
        </div>
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
