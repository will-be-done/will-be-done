import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { richTextMarkdownToPlainText } from "@will-be-done/slices/common";
import {
  createMindmap,
  type Mindmap,
  mindmapType,
} from "@will-be-done/slices/space";
import { uuidv7 } from "uuidv7";
import { create } from "zustand";
import { Route } from "@/routes/spaces.$spaceId.tsx";

// Maps opened before their create commits. A new map is empty, so its page
// draws it right away instead of waiting or reporting it deleted.
export const useCreatingMindmaps = create<{
  mindmaps: ReadonlyMap<string, Mindmap>;
}>(() => ({ mindmaps: new Map() }));

const setCreating = (id: string, mindmap: Mindmap | null) =>
  useCreatingMindmaps.setState(({ mindmaps }) => {
    const next = new Map(mindmaps);
    if (mindmap) next.set(id, mindmap);
    else next.delete(id);
    return { mindmaps: next };
  });

// The next map's ID is picked ahead so hovering the create control can preload
// its route; the router otherwise keeps the old page until the loader is done.
export const useCreateMindmap = () => {
  const dispatch = useAsyncDispatch();
  const router = useRouter();
  const { spaceId } = Route.useParams();
  const [nextId, setNextId] = useState(uuidv7);
  const target = {
    to: "/spaces/$spaceId/mindmaps/$mindmapId",
    params: { spaceId, mindmapId: nextId },
    search: { projectId: "inbox" },
  } as const;

  return {
    preload: () => void router.preloadRoute(target),
    createAndOpen: () => {
      setNextId(uuidv7());
      setCreating(nextId, {
        type: mindmapType,
        id: nextId,
        title: "",
        orderToken: "",
        createdAt: Date.now(),
      });
      void dispatch(createMindmap({ id: nextId })).finally(() =>
        setCreating(nextId, null),
      );
      void router.navigate(target);
    },
  };
};

export const mindmapTitle = (title: string) =>
  richTextMarkdownToPlainText(title, "title") || "Untitled mindmap";
