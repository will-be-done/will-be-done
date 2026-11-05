import { Link } from "@tanstack/react-router";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { mindmapsOfItem } from "@will-be-done/slices/space";
import { Network } from "lucide-react";
import { DetailRow } from "@/components/ItemDetails/shared.tsx";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { mindmapTitle } from "./useCreateMindmap.ts";

// The mindmaps a task or note appears on.
export function ItemMindmapsRow({ itemId }: { itemId: string }) {
  const { spaceId } = Route.useParams();
  const { data: mindmaps = [] } = useAsyncSelector({
    selector: mindmapsOfItem,
    args: { id: itemId },
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
