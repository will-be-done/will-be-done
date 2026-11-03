import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { preloadSelectorAsync } from "@will-be-done/hyperdb";
import {
  doneProjectSectionItemsForDisplay,
  inboxProjectId as getInboxProjectId,
  mindmapsOrdered,
  mindmapTree,
  projectSectionItemsForDisplayChildren,
  projectSectionsByProjectId,
} from "@will-be-done/slices/space";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { MindmapPage } from "@/components/Mindmap/MindmapPage.tsx";
import { selectedProject } from "@/components/ProjectView/selectors.ts";

const searchParams = z.object({
  projectId: z.string().default("inbox"),
});

export const Route = createFileRoute("/spaces/$spaceId/mindmaps/$mindmapId")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParams),
  loaderDeps: ({ search }) => ({ projectId: search.projectId }),
  loader: async ({ context, deps, params }) => {
    const db = await context.spaceDbPromise;
    const inboxProjectId = await preloadSelectorAsync(db, {
      selector: getInboxProjectId,
      args: {},
    });
    const [project] = await Promise.all([
      preloadSelectorAsync(db, {
        selector: selectedProject,
        args: {
          selectedProjectId:
            deps.projectId === "inbox" ? inboxProjectId : deps.projectId,
        },
      }),
      preloadSelectorAsync(db, {
        selector: mindmapTree,
        args: { mindmapId: params.mindmapId },
      }),
      preloadSelectorAsync(db, { selector: mindmapsOrdered, args: {} }),
    ]);
    const sections = await preloadSelectorAsync(db, {
      selector: projectSectionsByProjectId,
      args: { projectId: project.id },
    });
    await Promise.all(
      sections.flatMap((section) => [
        preloadSelectorAsync(db, {
          selector: projectSectionItemsForDisplayChildren,
          args: { projectSectionId: section.id },
        }),
        preloadSelectorAsync(db, {
          selector: doneProjectSectionItemsForDisplay,
          args: { projectSectionId: section.id, limited: true },
        }),
      ]),
    );
  },
});

function RouteComponent() {
  const { mindmapId } = Route.useParams();
  const { projectId } = Route.useSearch();

  return (
    <GlobalLayout>
      <MindmapPage mindmapId={mindmapId} projectId={projectId} />
    </GlobalLayout>
  );
}
