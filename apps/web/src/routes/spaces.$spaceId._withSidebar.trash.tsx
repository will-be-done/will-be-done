import { createFileRoute } from "@tanstack/react-router";
import { preloadSelectorAsync } from "@will-be-done/hyperdb";
import { trashedTasks } from "@will-be-done/slices/space";
import { TrashView } from "@/components/Trash/TrashView.tsx";

export const Route = createFileRoute("/spaces/$spaceId/_withSidebar/trash")({
  component: TrashView,
  loader: async ({ context }) => {
    const db = await context.spaceDbPromise;
    await preloadSelectorAsync(db, { selector: trashedTasks, args: {} });
  },
});
