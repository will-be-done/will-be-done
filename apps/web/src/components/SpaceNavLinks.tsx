import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils.ts";

const linkClass = (isActive: boolean) =>
  cn(
    "px-2.5 py-1 rounded text-[12px] font-medium transition-colors",
    isActive
      ? "text-accent bg-accent/10"
      : "text-content-tinted/55 hover:text-content/80 hover:bg-white/[0.05]",
  );

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

  return (
    <>
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
    </>
  );
};
