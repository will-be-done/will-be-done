import { useState, useCallback } from "react";
import {
  Calendar,
  CalendarDays,
  Clock,
  RefreshCw,
  Repeat2,
  StickyNote,
} from "lucide-react";
import { format } from "date-fns";
import { uuidv7 } from "uuidv7";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { useUndoToast } from "@/store/undo";
import {
  createTaskTemplateFromTask,
  dailyEntryByTaskId,
  dailyEntryDateOfTask,
  deleteTemplates,
  moveTaskToProject,
  projectSectionsByProjectId,
  projectOfProjectSectionOrDefault,
  setDailyEntryTime,
  type Task,
  taskTemplateById,
  taskTemplateRuleText,
  toggleTaskState,
  updateTask,
  updateTemplate,
  taskTemplateType,
} from "@will-be-done/slices/space";
import { CheckboxComp, ChecklistItems } from "@/components/Checklist/Checklist";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel.tsx";
import { RepeatModal } from "@/components/RepeatModal/RepeatModal.tsx";
import { TaskDatePicker } from "@/components/Task/TaskDatePicker.tsx";
import {
  EditableTitle,
  DetailRow,
  detailValueClass,
  ProjectDetailRow,
  SectionDetailRow,
  EditableDescription,
  TimeDetailRow,
  DurationDetailRow,
} from "./shared.tsx";
import { useOpenProject } from "@/hooks/useOpenProject.ts";
import { ItemMindmapsRow } from "@/components/Mindmap/ItemMindmapsRow.tsx";
import { captureWebAnalytics } from "@/lib/analytics";
import {
  type ReplaceItem,
  runDirectly,
  useNoteConversion,
} from "@/components/Task/useNoteConversion.ts";
import { DetailsAction, ItemDetailsLayout } from "./layout.tsx";
import { ItemAttachments } from "@/components/Attachments/ItemAttachments.tsx";

export function TaskBody({
  task,
  isEditingTitle,
  setIsEditingTitle,
  isEditingDescription,
  setIsEditingDescription,
  replaceItem = runDirectly,
}: {
  task: Task;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
  isEditingDescription: boolean;
  setIsEditingDescription: (v: boolean) => void;
  replaceItem?: ReplaceItem;
}) {
  const dispatch = useAsyncDispatch();
  const withUndo = useUndoToast();
  const taskId = task.id;
  const openProject = useOpenProject();
  const noteConversion = useNoteConversion(replaceItem);

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
  const { data: dailyEntry } = useAsyncSelector({
    selector: dailyEntryByTaskId,
    args: { taskId },
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

  const saveTitleDoc = useCallback(
    (titleDoc: string) =>
      void dispatch(updateTask({ id: taskId, task: { titleDoc } })),
    [dispatch, taskId],
  );
  const saveContentDoc = useCallback(
    (contentDoc: string) =>
      void dispatch(updateTask({ id: taskId, task: { contentDoc } })),
    [dispatch, taskId],
  );

  const { templateId } = task;
  const handleRemoveRepeat = useCallback(() => {
    if (!templateId) return;
    void withUndo(() =>
      dispatch(deleteTemplates({ taskTemplateIds: [templateId] })),
    );
  }, [templateId, dispatch, withUndo]);

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
        const id = uuidv7();
        replaceItem({ id, type: taskTemplateType }, async () => {
          const template = await dispatch(
            createTaskTemplateFromTask({
              id,
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
        });
      }
    },
    [task, dispatch, replaceItem],
  );

  if (!project) return null;

  return (
    <ItemDetailsLayout
      title={
        <EditableTitle
          key={task.id}
          icon={
            <CheckboxComp
              checked={task.state === "done"}
              onChange={handleToggleState}
            />
          }
          isEditing={isEditingTitle}
          title={task.title}
          titleDoc={task.titleDoc}
          titleClassName={
            task.state === "done"
              ? "line-through text-content-tinted"
              : "text-content"
          }
          onSave={saveTitleDoc}
          setIsEditingTitle={setIsEditingTitle}
          attachmentParent={{ parentType: "task", parentId: taskId }}
        />
      }
      properties={
        <>
          <ProjectDetailRow
            project={project}
            onChangeClick={() => setIsMoveProjectModalOpen(true)}
            onShowClick={() => openProject(project.id, task)}
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
                <button type="button" className={detailValueClass}>
                  {scheduleDate ? (
                    format(scheduleDate, "MMM d, yyyy")
                  ) : (
                    <span className="text-content-tinted">No date</span>
                  )}
                </button>
              }
            />
          </DetailRow>

          {scheduleDate && (
            <TimeDetailRow
              time={dailyEntry?.time ?? null}
              onChange={(time) =>
                void dispatch(setDailyEntryTime({ taskId, time }))
              }
            />
          )}

          <DurationDetailRow
            durationMinutes={task.durationMinutes ?? null}
            onChange={(durationMinutes) =>
              void dispatch(
                updateTask({ id: taskId, task: { durationMinutes } }),
              )
            }
          />

          {taskTemplateId && (
            <DetailRow
              icon={<RefreshCw className="h-3 w-3 shrink-0" />}
              label="Repeat"
            >
              <button
                type="button"
                title="Edit repeat"
                className={detailValueClass}
                onClick={() => setIsRepeatModalOpen(true)}
              >
                <span className="truncate">{ruleText || "Custom"}</span>
              </button>
            </DetailRow>
          )}

          <ItemMindmapsRow itemId={taskId} />

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
        </>
      }
      checklist={
        <ChecklistItems
          hasChecklistItems={undefined}
          parent={task}
          editTrigger="click"
          showAddItem
          className="border-task-panel-divider"
        />
      }
      description={
        <EditableDescription
          key={task.id}
          isEditing={isEditingDescription}
          content={task.content ?? ""}
          contentDoc={task.contentDoc}
          onSave={saveContentDoc}
          setIsEditingDescription={setIsEditingDescription}
          attachmentParent={{ parentType: "task", parentId: taskId }}
        />
      }
      attachments={
        <ItemAttachments
          parentType="task"
          parentId={taskId}
          coverAttachmentId={task.coverAttachmentId}
        />
      }
      actions={
        <>
          {taskTemplateId ? (
            <DetailsAction
              icon={<Repeat2 className="h-3 w-3" />}
              onClick={handleRemoveRepeat}
            >
              Stop repeating
            </DetailsAction>
          ) : (
            <DetailsAction
              icon={<RefreshCw className="h-3 w-3" />}
              onClick={() => setIsRepeatModalOpen(true)}
            >
              Make repeating
            </DetailsAction>
          )}
          <DetailsAction
            icon={<StickyNote className="h-3 w-3" />}
            onClick={() => noteConversion.toNote(taskId)}
          >
            Convert to note
          </DetailsAction>
        </>
      }
    >
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
    </ItemDetailsLayout>
  );
}
