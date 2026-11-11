import { createFileRoute } from "@tanstack/react-router";
import { ItemPageScreen } from "@/components/ItemPage/ItemPage.tsx";
import { preloadItemPage } from "@/components/ItemPage/preloadItemPage.ts";

export const Route = createFileRoute("/spaces/$spaceId/tasks/$taskId")({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    await preloadItemPage(await context.spaceDbPromise, params.taskId);
  },
});

function RouteComponent() {
  const { taskId } = Route.useParams();
  return <ItemPageScreen itemId={taskId} />;
}
