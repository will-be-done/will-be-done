import { createFileRoute } from "@tanstack/react-router";
import { preloadSelectorAsync } from "@will-be-done/hyperdb";
import { mindmapsOrdered } from "@will-be-done/slices/space";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { MindmapList } from "@/components/Mindmap/MindmapList.tsx";

export const Route = createFileRoute("/spaces/$spaceId/mindmaps/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const db = await context.spaceDbPromise;
    await preloadSelectorAsync(db, { selector: mindmapsOrdered, args: {} });
  },
});

function RouteComponent() {
  return (
    <GlobalLayout>
      <MindmapList />
    </GlobalLayout>
  );
}
