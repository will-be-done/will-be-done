import { Link } from "@tanstack/react-router";

export const NavBar = ({ spaceId }: { spaceId: string }) => {
  return (
    <div className="flex items-center px-3 h-8 text-content-tinted gap-4 text-[13px] bg-surface-elevated ring-1 ring-ring rounded-br-lg">
      <Link
        className="transition-colors hover:text-primary [&.active]:text-accent"
        to="/spaces/$spaceId/projects"
        params={{
          spaceId,
        }}
      >
        projects
      </Link>
      <Link
        className="transition-colors hover:text-primary [&.active]:text-accent"
        to="/spaces/$spaceId/timeline"
        params={{ spaceId }}
      >
        timeline
      </Link>
    </div>
  );
};
