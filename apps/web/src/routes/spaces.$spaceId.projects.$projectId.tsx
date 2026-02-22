import { createFileRoute } from "@tanstack/react-router";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { ProjectDetailView } from "@/components/ProjectView/ProjectDetailView.tsx";
import { LayoutWithSidebar } from "@/components/Layout/LayoutWithSidebar";

export const Route = createFileRoute("/spaces/$spaceId/projects/$projectId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return (
    <GlobalLayout>
      <LayoutWithSidebar>
        <ProjectDetailView projectId={projectId} />
      </LayoutWithSidebar>
    </GlobalLayout>
  );
}
