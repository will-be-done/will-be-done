import { createFileRoute } from "@tanstack/react-router";
import { useAppSelector } from "@/hooks/stateHooks.ts";
import { Layout } from "@/components/Layout/Layout";
import { ProjectsSidebarContent } from "@/features/project/components/Sidebar/ProjectsSidebarContent";
import { ProjectItemsList } from "@/features/project/components/ProjectItemsList/ProjectItemsList";
import { allProjectsSlice } from "@/store/slices/allProjectsSlice.ts";
import { Project, projectsSlice } from "@/store/slices/projectsSlice.ts";

export const Route = createFileRoute("/projects/$projectId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();

  const project = useAppSelector((state) => {
    if (projectId == "inbox") {
      return allProjectsSlice.inbox(state);
    }

    return projectsSlice.byId(state, projectId);
  });

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <Layout sidebarContent={<ProjectsSidebarContent />}>
      <ProjectItemsList project={project} />
    </Layout>
  );
}
