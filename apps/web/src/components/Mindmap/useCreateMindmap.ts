import { useNavigate } from "@tanstack/react-router";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { richTextMarkdownToPlainText } from "@will-be-done/slices/common";
import { createMindmap } from "@will-be-done/slices/space";
import { Route } from "@/routes/spaces.$spaceId.tsx";

export const useCreateMindmap = () => {
  const dispatch = useAsyncDispatch();
  const navigate = useNavigate();
  const { spaceId } = Route.useParams();

  return async () => {
    const mindmap = await dispatch(createMindmap({}));
    await navigate({
      to: "/spaces/$spaceId/mindmaps/$mindmapId",
      params: { spaceId, mindmapId: mindmap.id },
      search: { projectId: "inbox" },
    });
  };
};

export const mindmapTitle = (title: string) =>
  richTextMarkdownToPlainText(title, "title") || "Untitled mindmap";
