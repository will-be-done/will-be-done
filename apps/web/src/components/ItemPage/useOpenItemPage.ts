import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { noteType, taskTemplateType } from "@will-be-done/slices/space";
import { Route as SpaceRoute } from "@/routes/spaces.$spaceId.tsx";

type ItemRef = { id: string; type: string };

export function useOpenItemPage() {
  const navigate = useNavigate();
  const { spaceId } = SpaceRoute.useParams();

  return useCallback(
    (item: ItemRef, options: { replace?: boolean } = {}) => {
      if (item.type === noteType) {
        void navigate({
          to: "/spaces/$spaceId/notes/$noteId",
          params: { spaceId, noteId: item.id },
          ...options,
        });
      } else if (item.type === taskTemplateType) {
        void navigate({
          to: "/spaces/$spaceId/templates/$templateId",
          params: { spaceId, templateId: item.id },
          ...options,
        });
      } else {
        void navigate({
          to: "/spaces/$spaceId/tasks/$taskId",
          params: { spaceId, taskId: item.id },
          ...options,
        });
      }
    },
    [navigate, spaceId],
  );
}
