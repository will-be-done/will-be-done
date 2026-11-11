import { useCallback, useState } from "react";
import { useItemDetailsEditRequest } from "@/components/ItemDetails/ItemDetailsStore.ts";

export function useItemDetailsEditing(itemId: string | null) {
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const titleFieldKey = itemId ? `${itemId}:title` : null;
  const descriptionFieldKey = itemId ? `${itemId}:description` : null;
  const editRequest = useItemDetailsEditRequest((s) => s.request);
  const isDescriptionEditRequested =
    !!itemId &&
    editRequest?.itemId === itemId &&
    editRequest.field === "description";
  const isEditingTitle = editingFieldKey === titleFieldKey;
  const isEditingDescription =
    editingFieldKey === descriptionFieldKey || isDescriptionEditRequested;
  const isEditingAnyField =
    !!itemId &&
    (editingFieldKey?.startsWith(`${itemId}:`) === true ||
      isDescriptionEditRequested);

  const setIsEditingTitle = useCallback(
    (v: boolean) => setEditingFieldKey(v && itemId ? `${itemId}:title` : null),
    [itemId],
  );
  const setIsEditingDescription = useCallback(
    (v: boolean) => {
      if (!v) {
        useItemDetailsEditRequest.getState().clearRequest();
      }

      setEditingFieldKey(v && itemId ? `${itemId}:description` : null);
    },
    [itemId],
  );

  return {
    isEditingTitle,
    setIsEditingTitle,
    isEditingDescription,
    setIsEditingDescription,
    isEditingAnyField,
  };
}
