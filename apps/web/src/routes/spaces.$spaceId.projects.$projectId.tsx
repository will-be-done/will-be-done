import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/components/Layout/Layout.tsx";
import { ProjectDetailView } from "@/components/ProjectView/ProjectDetailView.tsx";

export const Route = createFileRoute("/spaces/$spaceId/projects/$projectId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return (
    <Layout>
      <ProjectDetailView projectId={projectId} />
    </Layout>
  );
}
