import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  noteType,
  taskTemplateType,
  type Item,
} from "@will-be-done/slices/space";
import { Route as SpaceRoute } from "@/routes/spaces.$spaceId.tsx";

type ItemRef = Pick<Item, "id" | "type">;

export function itemPageLocation(spaceId: string, item: ItemRef) {
  if (item.type === noteType) {
    return {
      to: "/spaces/$spaceId/notes/$noteId",
      params: { spaceId, noteId: item.id },
    } as const;
  }
  if (item.type === taskTemplateType) {
    return {
      to: "/spaces/$spaceId/templates/$templateId",
      params: { spaceId, templateId: item.id },
    } as const;
  }
  return {
    to: "/spaces/$spaceId/tasks/$taskId",
    params: { spaceId, taskId: item.id },
  } as const;
}

export function useOpenItemPage() {
  const navigate = useNavigate();
  const { spaceId } = SpaceRoute.useParams();

  return useCallback(
    (item: ItemRef, options: { replace?: boolean } = {}) => {
      void navigate({ ...itemPageLocation(spaceId, item), ...options });
    },
    [navigate, spaceId],
  );
}
