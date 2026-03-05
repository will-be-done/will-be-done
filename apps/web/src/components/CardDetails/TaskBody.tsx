import { useState, useCallback } from "react";
import {
  Calendar,
  CalendarDays,
  Clock,
  RefreshCw,
  Pencil,
  X as XIcon,
} from "lucide-react";
import { format } from "date-fns";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import {
  projectCategoriesSlice,
  dailyListsProjectionsSlice,
  cardsTasksSlice,
  cardsTaskTemplatesSlice,
  type Task,
} from "@will-be-done/slices/space";
import { CheckboxComp } from "@/components/Task/Task.tsx";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel.tsx";
import { RepeatModal } from "@/components/RepeatModal/RepeatModal.tsx";
import { TaskDatePicker } from "@/components/Task/TaskDatePicker.tsx";
import { useTitleEditing } from "./hooks.ts";
import {
  EditableTitle,
  DetailRow,
  ProjectDetailRow,
  CategoryDetailRow,
} from "./shared.tsx";

export function TaskBody({
  task,
  isEditingTitle,
  setIsEditingTitle,
}: {
  task: Task;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
}) {
  const dispatch = useDispatch();
  const taskId = task.id;

  const project = useSyncSelector(
    () =>
      projectCategoriesSlice.projectOfCategoryOrDefault(task.projectCategoryId),
    [task.projectCategoryId],
  );
  const projectCategories = useSyncSelector(
    () => projectCategoriesSlice.byProjectId(project.id),
    [project.id],
  );
  const scheduleDate = useSyncSelector(
    () => dailyListsProjectionsSlice.getDateOfTask(taskId),
    [taskId],
  );

  const taskTemplateId = task.templateId ?? null;
  const template = useSyncSelector(
    () => cardsTaskTemplatesSlice.byId(taskTemplateId ?? ""),
    [taskTemplateId],
  );
  const ruleText = useSyncSelector(
    () => cardsTaskTemplatesSlice.ruleText(taskTemplateId ?? ""),
    [taskTemplateId],
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
    title: task.title,
    setIsEditingTitle,
    onSave: useCallback(
      (trimmed: string) =>
        dispatch(cardsTasksSlice.updateTask(taskId, { title: trimmed })),
      [dispatch, taskId],
    ),
  });

  const handleRemoveRepeat = useCallback(() => {
    if (!task.templateId) return;
    if (
      window.confirm(
        "Remove repeat template? This will unlink all generated tasks.",
      )
    ) {
      dispatch(cardsTaskTemplatesSlice.deleteTemplates([task.templateId]));
    }
  }, [task.templateId, dispatch]);

  const handleRepeatConfirm = useCallback(
    (ruleString: string) => {
      setIsRepeatModalOpen(false);
      if (task.templateId) {
        dispatch(
          cardsTaskTemplatesSlice.updateTemplate(task.templateId, {
            repeatRule: ruleString,
          }),
        );
      } else {
        const template = dispatch(
          cardsTaskTemplatesSlice.createFromTask(task, {
            repeatRule: ruleString,
          }),
        );

        console.log("template created", template);

        useFocusStore
          .getState()
          .focusByKey(buildFocusKey(template.id, template.type));
      }
    },
    [task, dispatch],
  );

  return (
    <div className="px-3 py-3 space-y-3">
      <EditableTitle
        icon={
          <CheckboxComp
            checked={task.state === "done"}
            onChange={() => dispatch(cardsTasksSlice.toggleState(taskId))}
          />
        }
        isEditing={isEditingTitle}
        editingTitle={editingTitle}
        title={task.title}
        titleClassName={
          task.state === "done"
            ? "line-through text-content-tinted"
            : "text-content"
        }
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
          projectCategoryId={task.projectCategoryId}
          projectCategories={projectCategories}
          onChange={(categoryId) =>
            dispatch(
              cardsTasksSlice.updateTask(taskId, {
                projectCategoryId: categoryId,
              }),
            )
          }
        />

        <DetailRow
          icon={<Calendar className="h-3 w-3 shrink-0" />}
          label="Scheduled"
        >
          <TaskDatePicker
            taskId={taskId}
            currentDate={scheduleDate}
            trigger={
              <button className="cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors text-left">
                {scheduleDate ? (
                  format(scheduleDate, "MMM d, yyyy")
                ) : (
                  <span className="italic">No date</span>
                )}
              </button>
            }
          />
        </DetailRow>

        <DetailRow
          icon={<CalendarDays className="h-3 w-3 shrink-0" />}
          label="Created"
        >
          {format(new Date(task.createdAt), "MMM d, yyyy, h:mm a")}
        </DetailRow>

        {!!task.lastToggledAt && (
          <DetailRow
            icon={<Clock className="h-3 w-3 shrink-0" />}
            label="Last toggled"
          >
            {format(new Date(task.lastToggledAt), "MMM d, yyyy, h:mm a")}
          </DetailRow>
        )}

        {taskTemplateId && (
          <DetailRow
            icon={<RefreshCw className="h-3 w-3 shrink-0" />}
            label="Repeat"
          >
            <span className="flex items-center gap-1">
              <span className="italic">{ruleText || "custom"}</span>
              <button
                onClick={() => setIsRepeatModalOpen(true)}
                title="Edit repeat"
                className="cursor-pointer text-content-tinted hover:text-content transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={handleRemoveRepeat}
                title="Remove repeat"
                className="cursor-pointer text-content-tinted hover:text-content transition-colors"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          </DetailRow>
        )}
      </div>

      {!taskTemplateId && (
        <button
          onClick={() => setIsRepeatModalOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-content-tinted border border-border hover:bg-task-panel-hover hover:text-content transition-colors cursor-pointer"
        >
          <RefreshCw className="h-3 w-3" />
          Make repeating
        </button>
      )}

      {isMoveProjectModalOpen && (
        <MoveModal
          setIsOpen={setIsMoveProjectModalOpen}
          handleMove={(projectId) => {
            dispatch(cardsTasksSlice.moveToProject(taskId, projectId));
            setIsMoveProjectModalOpen(false);
          }}
          exceptProjectId={project.id}
        />
      )}

      {isRepeatModalOpen && (
        <RepeatModal
          initialRule={template?.repeatRule}
          onConfirm={handleRepeatConfirm}
          onCancel={() => setIsRepeatModalOpen(false)}
        />
      )}
    </div>
  );
}
