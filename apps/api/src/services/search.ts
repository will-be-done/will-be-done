import { selectAsync } from "@will-be-done/hyperdb";
import { searchSpace as searchSpaceSelector } from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { toPublicNote, type PublicNote } from "./items";
import { toPublicNode, type PublicMindmapNode } from "./mindmaps";
import { getTaskSchedules, toPublicTask, type PublicTask } from "./tasks";

export async function searchSpace({
  spaceId,
  userId,
  query,
  limit,
}: {
  spaceId: string;
  userId: string;
  query: string;
  limit: number;
}): Promise<(PublicTask | PublicNote | PublicMindmapNode)[]> {
  const db = await getSpaceDatabase(spaceId, userId);
  const hits = await selectAsync(db, {
    selector: searchSpaceSelector,
    args: { query, limit },
  });
  const schedules = await getTaskSchedules(
    db,
    hits.flatMap((hit) => (hit.type === "task" ? [hit.task.id] : [])),
  );
  return hits.map((hit) =>
    hit.type === "task"
      ? toPublicTask(hit.task, schedules.get(hit.task.id) ?? null)
      : hit.type === "note"
        ? toPublicNote(hit.note)
        : toPublicNode({ node: hit.node }, hit.node.parentId),
  );
}
