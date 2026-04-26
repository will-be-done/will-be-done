import { createFileRoute } from "@tanstack/react-router";
import { ProjectDetailView } from "@/components/ProjectView/ProjectDetailView.tsx";

export const Route = createFileRoute(
  "/spaces/$spaceId/_withSidebar/projects/$projectId",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();

  return <ProjectDetailView projectId={projectId} />;
}
