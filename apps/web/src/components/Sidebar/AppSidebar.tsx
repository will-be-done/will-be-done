import { useState } from "react";
import { useSyncSelector, useDispatch } from "@will-be-done/hyperdb";
import {
  backupSlice,
  projectsAllSlice,
  projectsSlice,
} from "@will-be-done/slices/space";
import { SidebarProjectItem } from "./SidebarProjectItem.tsx";
import { SpaceBlock } from "./SpaceBlock.tsx";
import {
  Sidebar,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { Link, useRouterState } from "@tanstack/react-router";
import { SpaceNavLinks } from "@/components/SpaceNavLinks.tsx";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { format } from "date-fns";
import { useCurrentDate } from "@/components/DaysBoard/hooks.tsx";
import { cn } from "@/lib/utils.ts";
import { promptDialog } from "@/components/ui/prompt-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog.tsx";
import { generateTestBackup } from "@/lib/generateTestData.ts";

const CalendarIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 15 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="flex-shrink-0"
  >
    <rect
      x="1"
      y="2.5"
      width="13"
      height="11"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <path
      d="M1 6.5h13"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <path
      d="M4.5 1v3M10.5 1v3"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const InboxIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 15 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="flex-shrink-0"
  >
    <rect
      x="1.5"
      y="1.5"
      width="12"
      height="12"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <path
      d="M1.5 9.5h4a2 2 0 004 0h4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const useCloseMobileOnNav = () => {
  const { isMobile, setOpenMobile } = useSidebar();
  return isMobile ? () => setOpenMobile(false) : undefined;
};

const TodayNavItem = () => {
  const spaceId = Route.useParams().spaceId;
  const today = useCurrentDate();
  const dateStr = format(today, "yyyy-MM-dd");
  const weekday = format(today, "EEE");
  const dayNum = format(today, "d");
  const closeMobile = useCloseMobileOnNav();

  const isActive = useRouterState({
    select: (s) =>
      s.matches.some((m) => (m.params as Record<string, string>).date != null),
  });

  return (
    <Link
      to="/spaces/$spaceId/dates/$date"
      params={{ spaceId, date: dateStr }}
      onClick={closeMobile}
      className={cn(
        "flex items-center gap-2 px-2.5 py-2 rounded-lg ring-1 transition-colors min-h-[40px]",
        isActive
          ? "bg-accent/10 ring-accent/30 text-accent"
          : "ring-ring/40 text-content-tinted hover:text-content hover:bg-surface hover:ring-ring",
      )}
    >
      <CalendarIcon />
      <div className="flex flex-col min-w-0">
        <span className="text-[13px] font-medium leading-tight">Today</span>
        <span className="text-[10px] leading-tight opacity-50 tabular-nums">
          {weekday} {dayNum}
        </span>
      </div>
    </Link>
  );
};

const InboxNavItem = ({ inboxId }: { inboxId: string }) => {
  const spaceId = Route.useParams().spaceId;
  const closeMobile = useCloseMobileOnNav();

  const notDoneCount = useSyncSelector(
    () => projectsSlice.notDoneTasksCountExceptDailiesCount(inboxId, []),
    [inboxId],
  );

  const isActive = useRouterState({
    select: (s) =>
      s.matches.some(
        (m) =>
          (m.params as Record<string, string>).projectId === inboxId ||
          (m.params as Record<string, string>).projectId === "inbox",
      ),
  });

  return (
    <Link
      to="/spaces/$spaceId/projects/$projectId"
      params={{ spaceId, projectId: inboxId }}
      onClick={closeMobile}
      className={cn(
        "flex items-center gap-2 px-2.5 py-2 rounded-lg ring-1 transition-colors min-h-[40px]",
        isActive
          ? "bg-accent/10 ring-accent/30 text-accent"
          : "ring-ring/40 text-content-tinted hover:text-content hover:bg-surface hover:ring-ring",
      )}
    >
      <InboxIcon />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[13px] font-medium leading-tight">Inbox</span>
        {notDoneCount > 0 && (
          <span className="text-[10px] leading-tight opacity-50 tabular-nums">
            {notDoneCount}
          </span>
        )}
      </div>
    </Link>
  );
};

const NavStrip = () => {
  const spaceId = Route.useParams().spaceId;

  return (
    <div className="hidden sm:flex desktop-macos:flex -ml-2 mb-3 [app-region:drag] ">
      <SpaceNavLinks spaceId={spaceId} />
    </div>
  );
};

export const AppSidebar = () => {
  const dispatch = useDispatch();
  const inbox = useSyncSelector(() => projectsAllSlice.inbox(), []);
  const projectIdsWithoutInbox = useSyncSelector(
    () => projectsAllSlice.childrenIdsWithoutInbox(),
    [],
  );

  const handleAddProjectClick = async () => {
    const title = await promptDialog("Enter project title");
    if (title) {
      dispatch(projectsSlice.create({ title }, "append"));
    }
  };

  return (
    <Sidebar
      side="left"
      collapsible="offcanvas"
      className="[&_[data-slot=sidebar-container]]:border-r-0 [&_[data-slot=sidebar-inner]]:bg-surface-elevated [&_[data-slot=sidebar-inner]]:ring-1 [&_[data-slot=sidebar-inner]]:ring-ring"
    >
      <SidebarRail />
      <SidebarHeader className="px-2 pt-3 md:pt-0 desktop-macos:pt-0 pb-0 gap-0">
        <NavStrip />
        {/* Today + Inbox */}
        <div className="grid grid-cols-2 gap-1.5">
          <TodayNavItem />
          <InboxNavItem inboxId={inbox.id} />
        </div>

        {/* Divider + Projects label */}
        <div className="px-1 pt-3 pb-2">
          <div className="h-px bg-ring/40" />
          <span className="block text-[10px] uppercase tracking-widest text-subheader font-semibold mt-3 px-2">
            Projects
          </span>
        </div>
      </SidebarHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 flex flex-col">
        {projectIdsWithoutInbox.map((id) => (
          <SidebarProjectItem key={id} projectId={id} />
        ))}
      </div>

      <div className="flex items-center justify-center pb-3 pt-2 border-t border-ring/40">
        <button
          type="button"
          onClick={() => void handleAddProjectClick()}
          className="cursor-pointer text-[12px] text-content-tinted/60 hover:text-accent transition-colors"
        >
          + Add Project
        </button>
      </div>

      {import.meta.env.DEV && <GenerateTestDataButton />}

      <SpaceBlock />
    </Sidebar>
  );
};

const GenerateTestDataButton = () => {
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState("5");
  const [categories, setCategories] = useState("3");
  const [done, setDone] = useState("10");
  const [todo, setTodo] = useState("10");

  const handleGenerate = () => {
    const n = parseInt(projects, 10) || 0;
    const m = parseInt(categories, 10) || 0;
    const k = parseInt(done, 10) || 0;
    const l = parseInt(todo, 10) || 0;

    const backup = generateTestBackup(n, m, k, l);
    dispatch(backupSlice.loadBackup(backup));
    setOpen(false);
  };

  const inputClass =
    "w-full rounded-md border border-ring bg-surface px-3 py-2 text-sm text-content placeholder:text-content-tinted/50 outline-none transition-shadow focus:ring-2 focus:ring-accent/40 focus:border-accent/60";

  return (
    <>
      <div className="flex items-center justify-center pb-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer text-[11px] text-content-tinted/40 hover:text-accent transition-colors"
        >
          [DEV] Generate Test Data
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover backdrop-blur-xl ring-1 ring-ring border-none sm:max-w-sm gap-5 [&>button]:text-content-tinted">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-content">
              Generate Test Data
            </DialogTitle>
            <DialogDescription className="text-[13px] text-content-tinted">
              This will replace all existing data in this space.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleGenerate();
            }}
            className="flex flex-col gap-3"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-content-tinted">Projects</span>
              <input
                type="number"
                min="0"
                value={projects}
                onChange={(e) => setProjects(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-content-tinted">
                Categories per project
              </span>
              <input
                type="number"
                min="0"
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-content-tinted">
                Done tasks per category
              </span>
              <input
                type="number"
                min="0"
                value={done}
                onChange={(e) => setDone(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-content-tinted">
                Todo tasks per category
              </span>
              <input
                type="number"
                min="0"
                value={todo}
                onChange={(e) => setTodo(e.target.value)}
                className={inputClass}
              />
            </label>

            <DialogFooter className="mt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-md px-3.5 py-1.5 text-[13px] font-medium text-content-tinted transition-colors hover:text-content hover:bg-white/[0.05]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="cursor-pointer rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-accent/85"
              >
                Generate
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
