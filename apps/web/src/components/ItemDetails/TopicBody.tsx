import { useCallback } from "react";
import { Network } from "lucide-react";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import {
  type MindmapNode,
  mindmapNodeType,
  updateMindmapNode,
} from "@will-be-done/slices/space";
import { ItemAttachments } from "@/components/Attachments/ItemAttachments.tsx";
import { EditableDescription, EditableTitle } from "./shared.tsx";
import { ItemDetailsLayout } from "./layout.tsx";

export function TopicBody({
  node,
  isEditingTitle,
  setIsEditingTitle,
  isEditingDescription,
  setIsEditingDescription,
}: {
  node: MindmapNode;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
  isEditingDescription: boolean;
  setIsEditingDescription: (v: boolean) => void;
}) {
  const dispatch = useAsyncDispatch();
  const nodeId = node.id;
  const saveTitleDoc = useCallback(
    (titleDoc: string) =>
      void dispatch(updateMindmapNode({ id: nodeId, node: { titleDoc } })),
    [dispatch, nodeId],
  );
  const saveContentDoc = useCallback(
    (contentDoc: string) =>
      void dispatch(updateMindmapNode({ id: nodeId, node: { contentDoc } })),
    [dispatch, nodeId],
  );
  const attachmentParent = {
    parentType: mindmapNodeType,
    parentId: nodeId,
  } as const;

  return (
    <ItemDetailsLayout
      title={
        <EditableTitle
          key={nodeId}
          icon={
            <Network
              className="h-4 w-4 text-content shrink-0 mt-0.5"
              strokeWidth={2.5}
            />
          }
          isEditing={isEditingTitle}
          title={node.title}
          titleDoc={node.titleDoc}
          onSave={saveTitleDoc}
          setIsEditingTitle={setIsEditingTitle}
          attachmentParent={attachmentParent}
        />
      }
      properties={null}
      description={
        <EditableDescription
          key={nodeId}
          isEditing={isEditingDescription}
          content={node.content ?? ""}
          contentDoc={node.contentDoc}
          onSave={saveContentDoc}
          setIsEditingDescription={setIsEditingDescription}
          attachmentParent={attachmentParent}
        />
      }
      attachments={
        <ItemAttachments
          {...attachmentParent}
          coverAttachmentId={node.coverAttachmentId}
        />
      }
      actions={null}
    />
  );
}
