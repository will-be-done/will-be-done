import { Link } from "@tanstack/react-router";

export const NavBar = ({ vaultId }: { vaultId: string }) => {
  return (
    <div className="flex items-center px-2 h-6 text-content-tinted gap-3 text-xs text-primary bg-panel rounded-br-lg">
      <Link
        className="[&.active]:text-accent"
        to="/app/$vaultId/projects"
        params={{
          vaultId,
        }}
      >
        projects
      </Link>
      <Link
        className="[&.active]:text-accent"
        to="/app/$vaultId/timeline"
        params={{ vaultId }}
      >
        timeline
      </Link>
    </div>
  );
};
