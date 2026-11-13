import { createFileRoute } from "@tanstack/react-router";
import { ItemPageScreen } from "@/components/ItemPage/ItemPage.tsx";
import { preloadItemPage } from "@/components/ItemPage/preloadItemPage.ts";

export const Route = createFileRoute("/spaces/$spaceId/templates/$templateId")({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    await preloadItemPage(await context.spaceDbPromise, params.templateId);
  },
});

function RouteComponent() {
  const { templateId } = Route.useParams();
  return <ItemPageScreen itemId={templateId} />;
}
