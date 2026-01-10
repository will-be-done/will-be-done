import { Link } from "@tanstack/react-router";

export const NavBar = ({ spaceId }: { spaceId: string }) => {
  return (
    <div className="flex items-center px-2 h-6 text-content-tinted gap-3 text-xs text-primary bg-panel rounded-br-lg">
      <Link
        className="[&.active]:text-accent"
        to="/spaces/$spaceId/projects"
        params={{
          spaceId,
        }}
      >
        projects
      </Link>
      <Link
        className="[&.active]:text-accent"
        to="/spaces/$spaceId/timeline"
        params={{ spaceId }}
      >
        timeline
      </Link>
    </div>
  );
};
