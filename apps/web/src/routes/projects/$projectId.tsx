import { createFileRoute } from "@tanstack/react-router";
import { useAppSelector } from "@/hooks/stateHooks.ts";
import { Layout } from "@/components/Layout/Layout";
import { ProjectsSidebarContent } from "@/features/project/components/Sidebar/ProjectsSidebarContent";
import { ProjectItemsList } from "@/features/project/components/ProjectItemsList/ProjectItemsList";
import { allProjectsSlice } from "@/store/slices/allProjectsSlice.ts";
import { Project, projectsSlice } from "@/store/slices/projectsSlice.ts";
import { useDB, useSyncSelector } from "@will-be-done/hyperdb";
import { allProjectsSlice2, projectsSlice2 } from "@will-be-done/slices";

export const Route = createFileRoute("/projects/$projectId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();

  const db = useDB();

  const project = useSyncSelector(
    function* () {
      if (projectId == "inbox") {
        return yield* allProjectsSlice2.inbox();
      }

      return yield* projectsSlice2.byId(projectId);
    },
    [projectId],
  );

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <Layout sidebarContent={<ProjectsSidebarContent />}>
      <ProjectItemsList project={project} />
    </Layout>
  );
}
