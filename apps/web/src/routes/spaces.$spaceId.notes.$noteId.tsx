import { createFileRoute } from "@tanstack/react-router";
import { ItemPageScreen } from "@/components/ItemPage/ItemPage.tsx";
import { preloadItemPage } from "@/components/ItemPage/preloadItemPage.ts";

export const Route = createFileRoute("/spaces/$spaceId/notes/$noteId")({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    await preloadItemPage(await context.spaceDbPromise, params.noteId);
  },
});

function RouteComponent() {
  const { noteId } = Route.useParams();
  return <ItemPageScreen itemId={noteId} />;
}
