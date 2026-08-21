import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarClock,
  CalendarDays,
  ChartNoAxesGantt,
  NotebookPen,
  Timer,
} from "lucide-react";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { cn } from "@/lib/utils.ts";
import { SpaceBlock } from "@/components/Sidebar/SpaceBlock.tsx";
import { SpaceSettingsModal } from "@/components/SpaceSettings/SpaceSettingsModal.tsx";
import { useSpaceSettingsStore } from "@/components/SpaceSettings/spaceSettingsStore.ts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";

const itemClass = (isActive: boolean) =>
  cn(
    "flex size-9 items-center justify-center rounded-lg transition-colors",
    isActive
      ? "bg-panel text-accent"
      : "text-content-tinted/70 hover:bg-overlay hover:text-content",
  );

const NavIconLink = ({
  to,
  params,
  isActive,
  label,
  tooltip,
  children,
}: {
  to:
    | "/spaces/$spaceId/dates"
    | "/spaces/$spaceId/timeline"
    | "/spaces/$spaceId/pomodoro"
    | "/spaces/$spaceId/calendar"
    | "/spaces/$spaceId/daily-reports";
  params: { spaceId: string };
  isActive: boolean;
  label: string;
  tooltip: string;
  children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Link
        to={to}
        params={params}
        aria-label={label}
        aria-current={isActive ? "page" : undefined}
        className={itemClass(isActive)}
      >
        {children}
      </Link>
    </TooltipTrigger>
    <TooltipContent side="right" sideOffset={8}>
      {tooltip}
    </TooltipContent>
  </Tooltip>
);

export const SpaceNavLinks = () => {
  const { spaceId } = Route.useParams();
  const { open, spaceName, closeSettings } = useSpaceSettingsStore();

  const isProjectsActive = useRouterState({
    select: (s) =>
      s.matches.some((m) => {
        const pathname = m.pathname as string;
        return pathname.includes("/dates") || pathname.includes("/projects");
      }),
  });

  const isTimelineActive = useRouterState({
    select: (s) =>
      s.matches.some((m) => (m.pathname as string).includes("/timeline")),
  });

  const isPomodoroActive = useRouterState({
    select: (s) =>
      s.matches.some((m) => (m.pathname as string).includes("/pomodoro")),
  });

  const isCalendarActive = useRouterState({
    select: (s) =>
      s.matches.some((m) => (m.pathname as string).includes("/calendar")),
  });

  const isDailyReportsActive = useRouterState({
    select: (s) =>
      s.matches.some((m) => (m.pathname as string).includes("/daily-reports")),
  });

  return (
    <TooltipProvider delayDuration={200}>
      <nav
        aria-label="Space navigation"
        className="fixed inset-y-0 left-0 z-40 flex w-12 flex-col items-center gap-1 border-r border-ring bg-surface py-3 [app-region:no-drag] desktop-macos:pt-10"
      >
        <NavIconLink
          to="/spaces/$spaceId/dates"
          params={{ spaceId }}
          isActive={isProjectsActive}
          label="projects"
          tooltip="Projects"
        >
          <CalendarDays className="size-[18px]" strokeWidth={1.6} />
        </NavIconLink>
        <NavIconLink
          to="/spaces/$spaceId/timeline"
          params={{ spaceId }}
          isActive={isTimelineActive}
          label="timeline"
          tooltip="Timeline"
        >
          <ChartNoAxesGantt className="size-[18px]" strokeWidth={1.6} />
        </NavIconLink>
        <NavIconLink
          to="/spaces/$spaceId/pomodoro"
          params={{ spaceId }}
          isActive={isPomodoroActive}
          label="pomodoro"
          tooltip="Pomodoro"
        >
          <Timer className="size-[18px]" strokeWidth={1.6} />
        </NavIconLink>
        <NavIconLink
          to="/spaces/$spaceId/calendar"
          params={{ spaceId }}
          isActive={isCalendarActive}
          label="calendar"
          tooltip="Calendar"
        >
          <CalendarClock className="size-[18px]" strokeWidth={1.6} />
        </NavIconLink>
        <NavIconLink
          to="/spaces/$spaceId/daily-reports"
          params={{ spaceId }}
          isActive={isDailyReportsActive}
          label="daily reports"
          tooltip="Daily Reports"
        >
          <NotebookPen className="size-[18px]" strokeWidth={1.6} />
        </NavIconLink>
        <SpaceBlock />
      </nav>
      <SpaceSettingsModal
        open={open}
        onClose={closeSettings}
        spaceName={spaceName}
      />
    </TooltipProvider>
  );
};
