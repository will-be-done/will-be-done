import { useState, useCallback } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import {
  createTaskFromTemplate,
  moveTemplateToProject,
  projectSectionsByProjectId,
  projectOfProjectSectionOrDefault,
  type TaskTemplate,
  taskTemplateRuleText,
  updateTemplate,
} from "@will-be-done/slices/space";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel.tsx";
import { RepeatModal } from "@/components/RepeatModal/RepeatModal.tsx";
import { useDescriptionEditing, useTitleEditing } from "./hooks.ts";
import {
  EditableTitle,
  DetailRow,
  ProjectDetailRow,
  SectionDetailRow,
  EditableDescription,
} from "./shared.tsx";
import { SquareCheckboxIcon } from "@/components/ui/icons.tsx";
import { ChecklistItems } from "@/components/Checklist/Checklist";
import { useOpenProject } from "@/hooks/useOpenProject.ts";

export function TemplateBody({
  template,
  isEditingTitle,
  setIsEditingTitle,
  isEditingDescription,
  setIsEditingDescription,
  onCardIdChange,
}: {
  template: TaskTemplate;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
  isEditingDescription: boolean;
  setIsEditingDescription: (v: boolean) => void;
  onCardIdChange?: (cardId: string) => void;
}) {
  const dispatch = useAsyncDispatch();
  const templateId = template.id;
  const openProject = useOpenProject();

  const { data: project } = useAsyncSelector({
    selector: projectOfProjectSectionOrDefault,
    args: { projectSectionId: template.projectSectionId },
  });
  const { data: projectSections = [] } = useAsyncSelector({
    selector: projectSectionsByProjectId,
    args: { projectId: project?.id ?? "" },
    enabled: !!project,
    defaultValue: [],
  });
  const { data: ruleText = "" } = useAsyncSelector({
    selector: taskTemplateRuleText,
    args: { id: templateId },
  });

  const [isMoveProjectModalOpen, setIsMoveProjectModalOpen] = useState(false);
  const [isRepeatModalOpen, setIsRepeatModalOpen] = useState(false);

  const {
    editingTitle,
    setTitleDraft,
    saveTitle,
    handleTitleKeyDown,
    textareaRef,
  } = useTitleEditing({
    title: template.title,
    setIsEditingTitle,
    onSave: useCallback(
      (trimmed: string) =>
        void dispatch(
          updateTemplate({
            id: templateId,
            template: {
              title: trimmed,
            },
          }),
        ),
      [dispatch, templateId],
    ),
  });

  const {
    editingDescription,
    setDescriptionDraft,
    saveDescription,
    handleDescriptionKeyDown,
    textareaRef: descriptionTextareaRef,
  } = useDescriptionEditing({
    description: template.content ?? "",
    isEditingDescription,
    setIsEditingDescription,
    onSave: useCallback(
      (content: string) =>
        void dispatch(
          updateTemplate({ id: templateId, template: { content } }),
        ),
      [dispatch, templateId],
    ),
  });

  const handleConvertToTask = useCallback(() => {
    void (async () => {
      const task = await dispatch(
        createTaskFromTemplate({ taskTemplate: template }),
      );
      useFocusStore.getState().focusByKey(buildFocusKey(task.id, task.type));
      onCardIdChange?.(task.id);
    })();
  }, [template, dispatch, onCardIdChange]);

  const handleRepeatConfirm = useCallback(
    (ruleString: string) => {
      setIsRepeatModalOpen(false);
      void dispatch(
        updateTemplate({
          id: templateId,
          template: {
            repeatRule: ruleString,
          },
        }),
      );
    },
    [dispatch, templateId],
  );

  if (!project) return null;

  return (
    <div className="px-3 py-3 space-y-3">
      <EditableTitle
        icon={
          <RefreshCw
            className="h-4 w-4 text-content shrink-0 mt-0.5"
            strokeWidth={2.5}
          />
        }
        isEditing={isEditingTitle}
        editingTitle={editingTitle}
        setTitleDraft={setTitleDraft}
        handleTitleKeyDown={handleTitleKeyDown}
        textareaRef={textareaRef}
        saveTitle={saveTitle}
        setIsEditingTitle={setIsEditingTitle}
      />

      <div className="space-y-2 text-xs">
        <ProjectDetailRow
          project={project}
          onOpenClick={() => openProject(project.id)}
          onEditClick={() => setIsMoveProjectModalOpen(true)}
        />

        <SectionDetailRow
          projectSectionId={template.projectSectionId}
          projectSections={projectSections}
          onChange={(projectSectionId) =>
            void dispatch(
              updateTemplate({
                id: templateId,
                template: {
                  projectSectionId: projectSectionId,
                },
              }),
            )
          }
        />

        <DetailRow
          icon={<RefreshCw className="h-3 w-3 shrink-0" />}
          label="Repeat"
        >
          <button
            className="cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors text-left italic"
            onClick={() => setIsRepeatModalOpen(true)}
          >
            {ruleText || "custom"}
          </button>
        </DetailRow>

        <DetailRow
          icon={<CalendarDays className="h-3 w-3 shrink-0" />}
          label="Created"
        >
          {format(new Date(template.createdAt), "MMM d, yyyy, h:mm a")}
        </DetailRow>

        <ChecklistItems
          hasChecklistItems={undefined}
          parentId={templateId}
          parentType={template.type}
          editTrigger="always"
          showAddItem
          className="border-task-panel-divider"
        />

        <div className="pt-1">
          <EditableDescription
            editingDescription={editingDescription}
            setDescriptionDraft={setDescriptionDraft}
            handleDescriptionKeyDown={handleDescriptionKeyDown}
            textareaRef={descriptionTextareaRef}
            saveDescription={saveDescription}
            setIsEditingDescription={setIsEditingDescription}
          />
        </div>
      </div>

      <button
        onClick={handleConvertToTask}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-content-tinted border border-border hover:bg-task-panel-hover hover:text-content transition-colors cursor-pointer"
      >
        <SquareCheckboxIcon className="h-3 w-3" />
        Convert to task
      </button>

      {isMoveProjectModalOpen && (
        <MoveModal
          setIsOpen={setIsMoveProjectModalOpen}
          handleMove={(projectId) => {
            void dispatch(
              moveTemplateToProject({
                templateId: templateId,
                projectId: projectId,
              }),
            );
            setIsMoveProjectModalOpen(false);
          }}
          exceptProjectId={project.id}
        />
      )}

      {isRepeatModalOpen && (
        <RepeatModal
          initialRule={template.repeatRule}
          onConfirm={handleRepeatConfirm}
          onCancel={() => setIsRepeatModalOpen(false)}
        />
      )}
    </div>
  );
}
