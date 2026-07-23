import { createFileRoute } from "@tanstack/react-router";
import { ProjectDetailView } from "@/components/ProjectView/ProjectDetailView.tsx";
import { preloadSelectorAsync } from "@will-be-done/hyperdb";
import {
  doneProjectSectionCardsForDisplay,
  projectByIdOrDefault,
  projectSectionsByProjectId,
  projectSectionCardsForDisplayChildren,
} from "@will-be-done/slices/space";

export const Route = createFileRoute(
  "/spaces/$spaceId/_withSidebar/projects/$projectId",
)({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const db = await context.spaceDbPromise;
    const promises: Promise<unknown>[] = [];
    const appendPromise = (promise: Promise<unknown>) => {
      promises.push(promise);
    };

    const sections = await preloadSelectorAsync(db, {
      selector: projectSectionsByProjectId,
      args: { projectId: params.projectId },
    });

    appendPromise(
      preloadSelectorAsync(db, {
        selector: projectByIdOrDefault,
        args: { id: params.projectId },
      }),
    );

    for (const section of sections) {
      appendPromise(
        preloadSelectorAsync(db, {
          selector: projectSectionCardsForDisplayChildren,
          args: { projectSectionId: section.id },
        }),
      );
    }

    for (const section of sections) {
      appendPromise(
        preloadSelectorAsync(db, {
          selector: doneProjectSectionCardsForDisplay,
          args: { projectSectionId: section.id, limited: true },
        }),
      );
    }

    await Promise.all(promises);
  },
});

function RouteComponent() {
  const { projectId } = Route.useParams();

  return <ProjectDetailView projectId={projectId} />;
}
