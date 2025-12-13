import { ProjectView } from "@/components/ProjectView/ProvecjtView.tsx";
import { Layout } from "@/components/Layout/Layout";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NavBar } from "@/components/NavBar/NavBar";
import { useCallback, useMemo } from "react";

export const Route = createFileRoute("/app/$vaultId/projects/$projectId")({
  component: RouteComponent,
});

function RouteComponent() {
  const exceptDailyListIds: string[] = useMemo((): string[] => [], []);

  const { vaultId, projectId } = Route.useParams();

  const ProjectLink = useCallback(
    // eslint-disable-next-line react-x/no-nested-component-definitions
    ({
      children,
      projectId,
      className,
      ref,
    }: {
      children?: React.ReactNode;
      projectId: string;
      className?: string;
      ref?: React.Ref<HTMLAnchorElement>;
    }) => {
      return (
        <Link
          to="/app/$vaultId/projects/$projectId"
          params={{
            vaultId,
            projectId,
          }}
          className={className}
          ref={ref}
        >
          {children}
        </Link>
      );
    },
    [vaultId],
  );

  return (
    <Layout>
      <div className="absolute left-0 top-0">
        <NavBar vaultId={vaultId} />
      </div>
      <ProjectView
        exceptDailyListIds={exceptDailyListIds}
        marginTop
        selectedProjectId={projectId}
        projectLink={ProjectLink}
      />
    </Layout>
  );
}
