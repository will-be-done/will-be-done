import { useState, useCallback } from "react";
import { CalendarDays, StickyNote } from "lucide-react";
import { format } from "date-fns";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  moveNoteToProject,
  projectSectionsByProjectId,
  projectOfProjectSectionOrDefault,
  type Note,
  updateNote,
} from "@will-be-done/slices/space";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel.tsx";
import { useNoteConversion } from "@/components/Task/useNoteConversion.ts";
import {
  EditableTitle,
  DetailRow,
  ProjectDetailRow,
  SectionDetailRow,
  EditableDescription,
} from "./shared.tsx";
import { SquareCheckboxIcon } from "@/components/ui/icons.tsx";
import { useOpenProject } from "@/hooks/useOpenProject.ts";
import { ItemMindmapsRow } from "@/components/Mindmap/ItemMindmapsRow.tsx";
import { DetailsAction, ItemDetailsLayout } from "./layout.tsx";
import { ItemAttachments } from "@/components/Attachments/ItemAttachments.tsx";

export function NoteBody({
  note,
  isEditingTitle,
  setIsEditingTitle,
  isEditingDescription,
  setIsEditingDescription,
  onItemIdChange,
}: {
  note: Note;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
  isEditingDescription: boolean;
  setIsEditingDescription: (v: boolean) => void;
  onItemIdChange?: (itemId: string) => void;
}) {
  const dispatch = useAsyncDispatch();
  const noteId = note.id;
  const openProject = useOpenProject();
  const noteConversion = useNoteConversion(onItemIdChange);

  const { data: project } = useAsyncSelector({
    selector: projectOfProjectSectionOrDefault,
    args: { projectSectionId: note.projectSectionId },
  });
  const { data: projectSections = [] } = useAsyncSelector({
    selector: projectSectionsByProjectId,
    args: { projectId: project?.id ?? "" },
    enabled: !!project,
    defaultValue: [],
  });

  const [isMoveProjectModalOpen, setIsMoveProjectModalOpen] = useState(false);

  const saveTitleDoc = useCallback(
    (titleDoc: string) =>
      void dispatch(updateNote({ id: noteId, note: { titleDoc } })),
    [dispatch, noteId],
  );
  const saveContentDoc = useCallback(
    (contentDoc: string) =>
      void dispatch(updateNote({ id: noteId, note: { contentDoc } })),
    [dispatch, noteId],
  );

  if (!project) return null;

  return (
    <ItemDetailsLayout
      title={
        <EditableTitle
          key={note.id}
          icon={
            <StickyNote
              className="h-4 w-4 text-content shrink-0 mt-0.5"
              strokeWidth={2.5}
            />
          }
          isEditing={isEditingTitle}
          title={note.title}
          titleDoc={note.titleDoc}
          onSave={saveTitleDoc}
          setIsEditingTitle={setIsEditingTitle}
          attachmentParent={{ parentType: "note", parentId: noteId }}
        />
      }
      properties={
        <>
          <ProjectDetailRow
            project={project}
            onOpenClick={() => openProject(project.id)}
            onEditClick={() => setIsMoveProjectModalOpen(true)}
          />

          <SectionDetailRow
            projectSectionId={note.projectSectionId}
            projectSections={projectSections}
            onChange={(projectSectionId) =>
              void dispatch(
                updateNote({ id: noteId, note: { projectSectionId } }),
              )
            }
          />

          <ItemMindmapsRow itemId={noteId} />

          <DetailRow
            icon={<CalendarDays className="h-3 w-3 shrink-0" />}
            label="Created"
          >
            {format(new Date(note.createdAt), "MMM d, yyyy, h:mm a")}
          </DetailRow>
        </>
      }
      description={
        <EditableDescription
          key={note.id}
          isEditing={isEditingDescription}
          content={note.content ?? ""}
          contentDoc={note.contentDoc}
          onSave={saveContentDoc}
          setIsEditingDescription={setIsEditingDescription}
          attachmentParent={{ parentType: "note", parentId: noteId }}
        />
      }
      attachments={
        <ItemAttachments
          parentType="note"
          parentId={noteId}
          coverAttachmentId={note.coverAttachmentId}
        />
      }
      actions={
        <DetailsAction
          icon={<SquareCheckboxIcon className="h-3 w-3" />}
          onClick={() => void noteConversion.toTask(noteId)}
        >
          Convert to task
        </DetailsAction>
      }
    >
      {isMoveProjectModalOpen && (
        <MoveModal
          setIsOpen={setIsMoveProjectModalOpen}
          handleMove={(projectId) => {
            void dispatch(moveNoteToProject({ noteId, projectId }));
            setIsMoveProjectModalOpen(false);
          }}
          exceptProjectId={project.id}
        />
      )}
    </ItemDetailsLayout>
  );
}
