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
import { useAsyncDispatch, useAsyncSelector } from "@will-be-done/hyperdb";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import {
  projectCategoriesSlice,
  dailyListsProjectionsSlice,
  cardsTasksSlice,
  cardsTaskTemplatesSlice,
  type Task,
  type Project,
  type ProjectCategory,
  type TaskTemplate,
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
  const taskId = task.id;

  const projectResult = useAsyncSelector(
    () =>
      projectCategoriesSlice.projectOfCategoryOrDefault(task.projectCategoryId),
    [task.projectCategoryId],
  );
  const projectId = projectResult.data?.id ?? "";
  const projectCategoriesResult = useAsyncSelector(
    () => projectCategoriesSlice.byProjectId(projectId),
    [projectId],
  );
  const scheduleDateResult = useAsyncSelector(
    () => dailyListsProjectionsSlice.getDateOfTask(taskId),
    [taskId],
  );
  const taskTemplateId = task.templateId ?? null;
  const templateResult = useAsyncSelector(
    () => cardsTaskTemplatesSlice.byId(taskTemplateId ?? ""),
    [taskTemplateId],
  );
  const ruleTextResult = useAsyncSelector(
    () => cardsTaskTemplatesSlice.ruleText(taskTemplateId ?? ""),
    [taskTemplateId],
  );

  if (projectResult.isPending || projectCategoriesResult.isPending || scheduleDateResult.isPending || templateResult.isPending || ruleTextResult.isPending) return null;

  return (
    <TaskBodyComp
      task={task}
      isEditingTitle={isEditingTitle}
      setIsEditingTitle={setIsEditingTitle}
      project={projectResult.data!}
      projectCategories={projectCategoriesResult.data!}
      scheduleDate={scheduleDateResult.data}
      template={templateResult.data}
      ruleText={ruleTextResult.data}
    />
  );
}

function TaskBodyComp({
  task,
  isEditingTitle,
  setIsEditingTitle,
  project,
  projectCategories,
  scheduleDate,
  template,
  ruleText,
}: {
  task: Task;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
  project: Project;
  projectCategories: ProjectCategory[];
  scheduleDate: Date | undefined;
  template: TaskTemplate | undefined;
  ruleText: string | undefined;
}) {
  const dispatch = useAsyncDispatch();
  const taskId = task.id;
  const taskTemplateId = task.templateId ?? null;

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
        void dispatch(cardsTasksSlice.updateTask(taskId, { title: trimmed })),
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
      void dispatch(cardsTaskTemplatesSlice.deleteTemplates([task.templateId]));
    }
  }, [task.templateId, dispatch]);

  const handleRepeatConfirm = useCallback(
    (ruleString: string) => {
      setIsRepeatModalOpen(false);
      if (task.templateId) {
        void dispatch(
          cardsTaskTemplatesSlice.updateTemplate(task.templateId, {
            repeatRule: ruleString,
          }),
        );
      } else {
        void dispatch(
          cardsTaskTemplatesSlice.createFromTask(task, {
            repeatRule: ruleString,
          }),
        ).then((tmpl) => {
          console.log("template created", tmpl);

          useFocusStore
            .getState()
            .focusByKey(buildFocusKey(tmpl.id, tmpl.type));
        });
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
            onChange={() => void dispatch(cardsTasksSlice.toggleState(taskId))}
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
            void dispatch(
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
            void dispatch(cardsTasksSlice.moveToProject(taskId, projectId));
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
