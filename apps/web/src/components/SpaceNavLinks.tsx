import { Link, useRouterState } from "@tanstack/react-router";
import { HoverCard } from "radix-ui";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { mindmapsWithTitles } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import {
  RECENT_MINDMAPS_LIMIT,
  useRecentMindmaps,
} from "@/components/Mindmap/recentMindmaps.ts";
import { mindmapTitle } from "@/components/Mindmap/useCreateMindmap.ts";

const linkClass = (isActive: boolean) =>
  cn(
    "px-2 py-1 rounded text-[12px] font-medium transition-colors",
    isActive
      ? "text-accent bg-accent/10"
      : "text-content-tinted/55 hover:text-content/80 hover:bg-white/[0.05]",
  );

// Mounted only while the card is open, so other pages don't read mindmaps.
const RecentMindmapsCard = ({ spaceId }: { spaceId: string }) => {
  const recentIds = useRecentMindmaps((s) => s.idsBySpace[spaceId]);
  const { data: mindmaps = [] } = useAsyncSelector({
    selector: mindmapsWithTitles,
    args: {},
  });
  const byId = new Map(mindmaps.map((item) => [item.mindmap.id, item]));
  const recent = (recentIds ?? [])
    .flatMap((id) => byId.get(id) ?? [])
    .slice(0, RECENT_MINDMAPS_LIMIT);
  if (recent.length === 0) return null;

  return (
    <HoverCard.Content
      align="start"
      sideOffset={6}
      className="bg-popover text-content z-50 w-56 rounded-md p-1 shadow-lg ring-1 ring-ring backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-2"
    >
      <div className="px-2 py-1.5 text-xs font-medium text-content-tinted">
        Recent maps
      </div>
      {recent.map(({ mindmap, title }) => (
        <Link
          key={mindmap.id}
          to="/spaces/$spaceId/mindmaps/$mindmapId"
          params={{ spaceId, mindmapId: mindmap.id }}
          search={{ projectId: "inbox" }}
          className="block truncate rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-panel-hover focus-visible:bg-panel-hover"
          activeOptions={{ includeSearch: false }}
          activeProps={{ className: "font-medium text-accent" }}
        >
          {mindmapTitle(title)}
        </Link>
      ))}
    </HoverCard.Content>
  );
};

export const SpaceNavLinks = ({ spaceId }: { spaceId: string }) => {
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

  const isCalendarActive = useRouterState({
    select: (s) =>
      s.matches.some((m) => (m.pathname as string).includes("/calendar")),
  });

  const isMindmapsActive = useRouterState({
    select: (s) =>
      s.matches.some((m) => (m.pathname as string).includes("/mindmaps")),
  });

  return (
    <div className="flex items-center gap-1 h-8 px-1.5 ring-1 ring-ring rounded-lg desktop-macos:ml-20 desktop-macos:py-2 mt-2 [app-region:no-drag]">
      <Link
        to="/spaces/$spaceId/dates"
        params={{ spaceId }}
        className={linkClass(isProjectsActive)}
      >
        projects
      </Link>
      <Link
        to="/spaces/$spaceId/timeline"
        params={{ spaceId }}
        className={linkClass(isTimelineActive)}
      >
        timeline
      </Link>
      <Link
        to="/spaces/$spaceId/calendar"
        params={{ spaceId }}
        className={linkClass(isCalendarActive)}
      >
        calendar
      </Link>
      <HoverCard.Root openDelay={200} closeDelay={150}>
        <HoverCard.Trigger asChild>
          <Link
            to="/spaces/$spaceId/mindmaps"
            params={{ spaceId }}
            className={linkClass(isMindmapsActive)}
          >
            maps
          </Link>
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <RecentMindmapsCard spaceId={spaceId} />
        </HoverCard.Portal>
      </HoverCard.Root>
    </div>
  );
};
