import { useState, useCallback } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import {
  projectCategoriesSlice,
  cardsTasksSlice,
  cardsTaskTemplatesSlice,
  type TaskTemplate,
} from "@will-be-done/slices/space";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel.tsx";
import { RepeatModal } from "@/components/RepeatModal/RepeatModal.tsx";
import { useTitleEditing } from "./hooks.ts";
import {
  EditableTitle,
  DetailRow,
  ProjectDetailRow,
  CategoryDetailRow,
} from "./shared.tsx";
import { SquareCheckboxIcon } from "@/components/ui/icons.tsx";

export function TemplateBody({
  template,
  isEditingTitle,
  setIsEditingTitle,
}: {
  template: TaskTemplate;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
}) {
  const dispatch = useDispatch();
  const templateId = template.id;

  const project = useSyncSelector(
    () =>
      projectCategoriesSlice.projectOfCategoryOrDefault(
        template.projectCategoryId,
      ),
    [template.projectCategoryId],
  );
  const projectCategories = useSyncSelector(
    () => projectCategoriesSlice.byProjectId(project.id),
    [project.id],
  );
  const ruleText = useSyncSelector(
    () => cardsTaskTemplatesSlice.ruleText(templateId),
    [templateId],
  );

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
        dispatch(
          cardsTaskTemplatesSlice.updateTemplate(templateId, {
            title: trimmed,
          }),
        ),
      [dispatch, templateId],
    ),
  });

  const handleConvertToTask = useCallback(() => {
    const task = dispatch(cardsTasksSlice.createFromTemplate(template));
    useFocusStore.getState().focusByKey(buildFocusKey(task.id, task.type));
  }, [template, dispatch]);

  const handleRepeatConfirm = useCallback(
    (ruleString: string) => {
      setIsRepeatModalOpen(false);
      dispatch(
        cardsTaskTemplatesSlice.updateTemplate(templateId, {
          repeatRule: ruleString,
        }),
      );
    },
    [dispatch, templateId],
  );

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
        title={template.title}
        setTitleDraft={setTitleDraft}
        handleTitleKeyDown={handleTitleKeyDown}
        textareaRef={textareaRef}
        saveTitle={saveTitle}
        setIsEditingTitle={setIsEditingTitle}
      />

      <div className="space-y-2 text-xs">
        <ProjectDetailRow
          project={project}
          onEditClick={() => setIsMoveProjectModalOpen(true)}
        />

        <CategoryDetailRow
          projectCategoryId={template.projectCategoryId}
          projectCategories={projectCategories}
          onChange={(categoryId) =>
            dispatch(
              cardsTaskTemplatesSlice.updateTemplate(templateId, {
                projectCategoryId: categoryId,
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
            dispatch(
              cardsTaskTemplatesSlice.moveTemplateToProject(
                templateId,
                projectId,
              ),
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
