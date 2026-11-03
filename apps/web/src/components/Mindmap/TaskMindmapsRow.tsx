import { Link } from "@tanstack/react-router";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { mindmapsOfTask } from "@will-be-done/slices/space";
import { Network } from "lucide-react";
import { DetailRow } from "@/components/ItemDetails/shared.tsx";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { mindmapTitle } from "./useCreateMindmap.ts";

export function TaskMindmapsRow({ taskId }: { taskId: string }) {
  const { spaceId } = Route.useParams();
  const { data: mindmaps = [] } = useAsyncSelector({
    selector: mindmapsOfTask,
    args: { taskId },
  });
  if (mindmaps.length === 0) return null;

  return (
    <DetailRow icon={<Network className="h-3 w-3 shrink-0" />} label="Mindmaps">
      <span className="flex flex-wrap gap-x-2">
        {mindmaps.map((mindmap) => (
          <Link
            key={mindmap.id}
            to="/spaces/$spaceId/mindmaps/$mindmapId"
            params={{ spaceId, mindmapId: mindmap.id }}
            search={{ projectId: "inbox" }}
            className="truncate hover:underline"
          >
            {mindmapTitle(mindmap.title)}
          </Link>
        ))}
      </span>
    </DetailRow>
  );
}
