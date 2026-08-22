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
  setTaskTimeBlock,
} from "@will-be-done/slices/space";
import { CheckboxComp, ChecklistItems } from "@/components/Checklist/Checklist";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel.tsx";
import { RepeatModal } from "@/components/RepeatModal/RepeatModal.tsx";
import {
  TimePicker,
  formatClockMinutes,
} from "@/components/TimePicker/TimePicker.tsx";
import { TaskDatePicker } from "@/components/Task/TaskDatePicker.tsx";
import { PlannedDurationPicker } from "@/components/Task/PlannedDurationPicker.tsx";
import { useDescriptionEditing, useTitleEditing } from "./hooks.ts";
import {
  EditableTitle,
  DetailRow,
  ProjectDetailRow,
  SectionDetailRow,
  EditableDescription,
} from "./shared.tsx";
import { useOpenProject } from "@/hooks/useOpenProject.ts";

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

  const handleRepeatConfirm = useCallback(
    (ruleString: string, options?: { startsAtMinutes?: number }) => {
      setIsRepeatModalOpen(false);
      const startsAtMinutes = options?.startsAtMinutes;
      if (task.templateId) {
        void dispatch(
          updateTemplate({
            id: task.templateId,
            template: {
              repeatRule: ruleString,
              startsAtMinutes,
              ...(startsAtMinutes != null &&
              template?.durationMinutes == null &&
              task.durationMinutes == null
                ? { durationMinutes: 30 }
                : task.durationMinutes != null
                  ? { durationMinutes: task.durationMinutes }
                  : {}),
            },
          }),
        );
      } else {
        void (async () => {
          const created = await dispatch(
            createTaskTemplateFromTask({
              task: task,
              now: Date.now(),
              data: {
                repeatRule: ruleString,
                ...(startsAtMinutes == null ? {} : { startsAtMinutes }),
                ...(task.durationMinutes != null
                  ? { durationMinutes: task.durationMinutes }
                  : startsAtMinutes != null
                    ? { durationMinutes: 30 }
                    : {}),
              },
            }),
          );

          useFocusStore
            .getState()
            .focusByKey(buildFocusKey(created.id, created.type));
          onItemIdChange?.(created.id);
        })();
      }
    },
    [task, template, dispatch, onItemIdChange],
  );

  if (!project) return null;

  return (
    <div className="px-3 py-3 space-y-3">
      <EditableTitle
        icon={
          <CheckboxComp
            checked={task.state === "done"}
            onChange={() => void dispatch(toggleTaskState({ taskId: taskId }))}
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

        <DetailRow icon={<Clock className="h-3 w-3 shrink-0" />} label="Start">
          <TimePicker
            value={
              task.startsAt != null
                ? new Date(task.startsAt).getHours() * 60 +
                  new Date(task.startsAt).getMinutes()
                : null
            }
            onChange={(nextMinutes) => {
              const day =
                scheduleDate != null
                  ? new Date(scheduleDate)
                  : task.startsAt != null
                    ? new Date(task.startsAt)
                    : new Date();
              day.setHours(
                Math.floor(nextMinutes / 60),
                nextMinutes % 60,
                0,
                0,
              );
              void dispatch(
                setTaskTimeBlock({
                  id: taskId,
                  startsAt: day.getTime(),
                }),
              );
            }}
            onClear={() =>
              void dispatch(
                setTaskTimeBlock({
                  id: taskId,
                  startsAt: null,
                }),
              )
            }
          >
            <button
              type="button"
              className="cursor-pointer rounded px-1 -mx-1 text-xs tabular-nums hover:bg-task-panel-hover transition-colors"
            >
              {task.startsAt != null
                ? format(new Date(task.startsAt), "HH:mm")
                : "Add a time"}
            </button>
          </TimePicker>
        </DetailRow>

        <DetailRow
          icon={<Clock className="h-3 w-3 shrink-0" />}
          label="Duration"
        >
          <PlannedDurationPicker
            showIcon={false}
            align="start"
            value={task.durationMinutes}
            onChange={(minutes) =>
              void dispatch(
                setTaskTimeBlock({
                  id: taskId,
                  durationMinutes: minutes ?? null,
                }),
              )
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
              <span className="italic">
                {ruleText || "custom"}
                {template?.startsAtMinutes != null &&
                  ` at ${formatClockMinutes(template.startsAtMinutes)}`}
              </span>
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
          initialStartsAtMinutes={
            template?.startsAtMinutes ??
            (task.startsAt != null
              ? new Date(task.startsAt).getHours() * 60 +
                new Date(task.startsAt).getMinutes()
              : undefined)
          }
          onConfirm={handleRepeatConfirm}
          onCancel={() => setIsRepeatModalOpen(false)}
        />
      )}
    </div>
  );
}
