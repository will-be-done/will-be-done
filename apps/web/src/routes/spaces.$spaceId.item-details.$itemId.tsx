import { createFileRoute, redirect } from "@tanstack/react-router";
import { noteType, taskTemplateType } from "@will-be-done/slices/space";
import { preloadItemPage } from "@/components/ItemPage/preloadItemPage.ts";

// The old mobile details URL; items now have their own pages.
export const Route = createFileRoute("/spaces/$spaceId/item-details/$itemId")({
  loader: async ({ context, params: { spaceId, itemId } }) => {
    const item = await preloadItemPage(await context.spaceDbPromise, itemId);
    if (item?.type === noteType) {
      throw redirect({
        to: "/spaces/$spaceId/notes/$noteId",
        params: { spaceId, noteId: itemId },
        replace: true,
      });
    }
    if (item?.type === taskTemplateType) {
      throw redirect({
        to: "/spaces/$spaceId/templates/$templateId",
        params: { spaceId, templateId: itemId },
        replace: true,
      });
    }
    throw redirect({
      to: "/spaces/$spaceId/tasks/$taskId",
      params: { spaceId, taskId: itemId },
      replace: true,
    });
  },
});
