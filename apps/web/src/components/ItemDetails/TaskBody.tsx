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
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import {
  createTaskTemplateFromTask,
  dailyEntryDateOfTask,
  deleteTemplates,
  moveTaskToProject,
  projectSectionsByProjectId,
  projectOfProjectSectionOrDefault,
  type Task,
  taskTemplateById,
  taskTemplateRuleText,
  toggleTaskState,
  updateTask,
  updateTemplate,
} from "@will-be-done/slices/space";
import { CheckboxComp, ChecklistItems } from "@/components/Checklist/Checklist";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel.tsx";
import { RepeatModal } from "@/components/RepeatModal/RepeatModal.tsx";
import { TaskDatePicker } from "@/components/Task/TaskDatePicker.tsx";
import { useDescriptionEditing, useTitleEditing } from "./hooks.ts";
import {
  EditableTitle,
  DetailRow,
  ProjectDetailRow,
  SectionDetailRow,
  EditableDescription,
} from "./shared.tsx";
import { useOpenProject } from "@/hooks/useOpenProject.ts";
import { captureWebAnalytics } from "@/lib/analytics";

export function TaskBody({
  task,
  isEditingTitle,
  setIsEditingTitle,
  isEditingDescription,
  setIsEditingDescription,
  onItemIdChange,
}: {
  task: Task;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
  isEditingDescription: boolean;
  setIsEditingDescription: (v: boolean) => void;
  onItemIdChange?: (itemId: string) => void;
}) {
  const dispatch = useAsyncDispatch();
  const taskId = task.id;
  const openProject = useOpenProject();

  const { data: project } = useAsyncSelector({
    selector: projectOfProjectSectionOrDefault,
    args: { projectSectionId: task.projectSectionId },
  });
  const { data: projectSections = [] } = useAsyncSelector({
    selector: projectSectionsByProjectId,
    args: { projectId: project?.id ?? "" },
    enabled: !!project,
    defaultValue: [],
  });
  const { data: scheduleDate } = useAsyncSelector({
    selector: dailyEntryDateOfTask,
    args: { taskId: taskId },
  });

  const taskTemplateId = task.templateId ?? null;
  const { data: template } = useAsyncSelector({
    selector: taskTemplateById,
    args: { id: taskTemplateId ?? "" },
    enabled: !!taskTemplateId,
    defaultValue: undefined,
  });
  const { data: ruleText = "" } = useAsyncSelector({
    selector: taskTemplateRuleText,
    args: { id: taskTemplateId ?? "" },
    enabled: !!taskTemplateId,
    defaultValue: "",
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
    title: task.title,
    setIsEditingTitle,
    onSave: useCallback(
      (trimmed: string) =>
        void dispatch(updateTask({ id: taskId, task: { title: trimmed } })),
      [dispatch, taskId],
    ),
  });

  const {
    editingDescription,
    setDescriptionDraft,
    saveDescription,
    handleDescriptionKeyDown,
    textareaRef: descriptionTextareaRef,
  } = useDescriptionEditing({
    description: task.content ?? "",
    isEditingDescription,
    setIsEditingDescription,
    onSave: useCallback(
      (content: string) =>
        void dispatch(updateTask({ id: taskId, task: { content } })),
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
      void dispatch(deleteTemplates({ taskTemplateIds: [task.templateId] }));
    }
  }, [task.templateId, dispatch]);

  const handleToggleState = useCallback(() => {
    void (async () => {
      await dispatch(toggleTaskState({ taskId }));
      captureWebAnalytics({
        name: task.state === "todo" ? "task_completed" : "task_reopened",
        properties: {
          age_hours: Math.max(
            0,
            Math.round(((Date.now() - task.createdAt) / 3_600_000) * 10) / 10,
          ),
        },
      });
    })();
  }, [dispatch, task.createdAt, task.state, taskId]);

  const handleRepeatConfirm = useCallback(
    (ruleString: string) => {
      setIsRepeatModalOpen(false);
      if (task.templateId) {
        void dispatch(
          updateTemplate({
            id: task.templateId,
            template: {
              repeatRule: ruleString,
            },
          }),
        );
      } else {
        void (async () => {
          const template = await dispatch(
            createTaskTemplateFromTask({
              task: task,
              now: Date.now(),
              data: {
                repeatRule: ruleString,
              },
            }),
          );
          captureWebAnalytics({
            name: "task_template_created",
            properties: {
              creation_method: "web",
              source: "task_conversion",
            },
          });

          useFocusStore
            .getState()
            .focusByKey(buildFocusKey(template.id, template.type));
          onItemIdChange?.(template.id);
        })();
      }
    },
    [task, dispatch, onItemIdChange],
  );

  if (!project) return null;

  return (
    <div className="px-3 py-3 space-y-3">
      <EditableTitle
        icon={
          <CheckboxComp
            checked={task.state === "done"}
            onChange={handleToggleState}
          />
        }
        isEditing={isEditingTitle}
        editingTitle={editingTitle}
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
          onOpenClick={() => openProject(project.id)}
          onEditClick={() => setIsMoveProjectModalOpen(true)}
        />

        <SectionDetailRow
          projectSectionId={task.projectSectionId}
          projectSections={projectSections}
          onChange={(projectSectionId) =>
            void dispatch(
              updateTask({
                id: taskId,
                task: {
                  projectSectionId: projectSectionId,
                },
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

        <ChecklistItems
          hasChecklistItems={undefined}
          parentId={taskId}
          parentType={task.type}
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
            void dispatch(
              moveTaskToProject({ taskId: taskId, projectId: projectId }),
            );
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
