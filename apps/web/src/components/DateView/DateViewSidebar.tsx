import { useSyncSelector, useDispatch } from "@will-be-done/hyperdb";
import { projectsAllSlice, projectsSlice } from "@will-be-done/slices/space";
import { SidebarProjectItem } from "./SidebarProjectItem.tsx";
import { Sidebar, SidebarHeader, SidebarRail } from "@/components/ui/sidebar.tsx";
import { Link, useRouterState } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { format } from "date-fns";
import { useCurrentDate } from "@/components/DaysBoard/hooks.tsx";
import { cn } from "@/lib/utils.ts";

const CalendarIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 15 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
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

const TodayNavItem = () => {
  const spaceId = Route.useParams().spaceId;
  const today = useCurrentDate();
  const dateStr = format(today, "yyyy-MM-dd");
  const weekday = format(today, "EEE");
  const dayNum = format(today, "d");

  const isActive = useRouterState({
    select: (s) =>
      s.matches.some(
        (m) => (m.params as Record<string, string>).date != null,
      ),
  });

  return (
    <Link
      to="/spaces/$spaceId/dates/$date"
      params={{ spaceId, date: dateStr }}
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

  const notDoneCount = useSyncSelector(
    () => projectsSlice.notDoneTasksCountExceptDailiesCount(inboxId, []),
    [inboxId],
  );

  const isActive = useRouterState({
    select: (s) =>
      s.matches.some(
        (m) =>
          (m.params as Record<string, string>).projectId === inboxId,
      ),
  });

  return (
    <Link
      to="/spaces/$spaceId/projects/$projectId"
      params={{ spaceId, projectId: inboxId }}
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

export const DateViewSidebar = () => {
  const dispatch = useDispatch();
  const inbox = useSyncSelector(() => projectsAllSlice.inbox(), []);
  const projectIdsWithoutInbox = useSyncSelector(
    () => projectsAllSlice.childrenIdsWithoutInbox(),
    [],
  );

  const handleAddProjectClick = () => {
    const title = prompt("Enter project title");
    if (title) {
      dispatch(projectsSlice.create({ title }, "append"));
    }
  };

  return (
    <Sidebar
      side="left"
      collapsible="offcanvas"
      className="border-r-0 [&_[data-slot=sidebar-inner]]:bg-surface-elevated [&_[data-slot=sidebar-inner]]:ring-1 [&_[data-slot=sidebar-inner]]:ring-ring"
    >
      <SidebarRail />
      <SidebarHeader className="px-2 pt-3 pb-0 gap-0">
        {/* Today + Inbox side by side */}
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
          onClick={handleAddProjectClick}
          className="cursor-pointer text-[12px] text-content-tinted/60 hover:text-accent transition-colors"
        >
          + Add Project
        </button>
      </div>
    </Sidebar>
  );
};
