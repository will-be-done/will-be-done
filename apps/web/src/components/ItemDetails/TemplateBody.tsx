import { uuidv7 } from "uuidv7";
import { useState, useCallback } from "react";
import {
  type ReplaceItem,
  runDirectly,
} from "@/components/Task/useNoteConversion.ts";
import { CalendarDays, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import {
  createTaskFromTemplate,
  isDailyOrCoarser,
  moveTemplateToProject,
  projectSectionsByProjectId,
  projectOfProjectSectionOrDefault,
  type TaskTemplate,
  taskTemplateRuleText,
  updateTemplate,
  taskType,
} from "@will-be-done/slices/space";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel.tsx";
import { RepeatModal } from "@/components/RepeatModal/RepeatModal.tsx";
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
import { SquareCheckboxIcon } from "@/components/ui/icons.tsx";
import { ChecklistItems } from "@/components/Checklist/Checklist";
import { useOpenProject } from "@/hooks/useOpenProject.ts";
import { DetailsAction, ItemDetailsLayout } from "./layout.tsx";
import { ItemAttachments } from "@/components/Attachments/ItemAttachments.tsx";

export function TemplateBody({
  template,
  isEditingTitle,
  setIsEditingTitle,
  isEditingDescription,
  setIsEditingDescription,
  replaceItem = runDirectly,
}: {
  template: TaskTemplate;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
  isEditingDescription: boolean;
  setIsEditingDescription: (v: boolean) => void;
  replaceItem?: ReplaceItem;
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

  const saveTitleDoc = useCallback(
    (titleDoc: string) =>
      void dispatch(updateTemplate({ id: templateId, template: { titleDoc } })),
    [dispatch, templateId],
  );
  const saveContentDoc = useCallback(
    (contentDoc: string) =>
      void dispatch(
        updateTemplate({ id: templateId, template: { contentDoc } }),
      ),
    [dispatch, templateId],
  );

  const handleConvertToTask = useCallback(() => {
    const id = uuidv7();
    replaceItem({ id, type: taskType }, async () => {
      const task = await dispatch(
        createTaskFromTemplate({ taskTemplate: template, id }),
      );
      useFocusStore.getState().focusByKey(buildFocusKey(task.id, task.type));
    });
  }, [template, dispatch, replaceItem]);

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
    <ItemDetailsLayout
      title={
        <EditableTitle
          key={template.id}
          icon={
            <RefreshCw
              className="h-4 w-4 text-content shrink-0 mt-0.5"
              strokeWidth={2.5}
            />
          }
          isEditing={isEditingTitle}
          title={template.title}
          titleDoc={template.titleDoc}
          onSave={saveTitleDoc}
          setIsEditingTitle={setIsEditingTitle}
          attachmentParent={{ parentType: "template", parentId: templateId }}
        />
      }
      properties={
        <>
          <ProjectDetailRow
            project={project}
            onChangeClick={() => setIsMoveProjectModalOpen(true)}
            onShowClick={() => openProject(project.id)}
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
              type="button"
              className={detailValueClass}
              onClick={() => setIsRepeatModalOpen(true)}
            >
              <span className="truncate">{ruleText || "Custom"}</span>
            </button>
          </DetailRow>

          {/* Sub-daily rules carry their own time in each occurrence. */}
          {isDailyOrCoarser(template.repeatRule) && (
            <TimeDetailRow
              time={template.time ?? null}
              onChange={(time) =>
                void dispatch(
                  updateTemplate({ id: templateId, template: { time } }),
                )
              }
            />
          )}

          <DurationDetailRow
            durationMinutes={template.durationMinutes ?? null}
            onChange={(durationMinutes) =>
              void dispatch(
                updateTemplate({
                  id: templateId,
                  template: { durationMinutes },
                }),
              )
            }
          />

          <DetailRow
            icon={<CalendarDays className="h-3 w-3 shrink-0" />}
            label="Created"
          >
            {format(new Date(template.createdAt), "MMM d, yyyy, h:mm a")}
          </DetailRow>
        </>
      }
      checklist={
        <ChecklistItems
          hasChecklistItems={undefined}
          parent={template}
          editTrigger="click"
          showAddItem
          className="border-task-panel-divider"
        />
      }
      description={
        <EditableDescription
          key={template.id}
          isEditing={isEditingDescription}
          content={template.content ?? ""}
          contentDoc={template.contentDoc}
          onSave={saveContentDoc}
          setIsEditingDescription={setIsEditingDescription}
          attachmentParent={{ parentType: "template", parentId: templateId }}
        />
      }
      attachments={
        <ItemAttachments
          parentType="template"
          parentId={templateId}
          coverAttachmentId={template.coverAttachmentId}
        />
      }
      actions={
        <>
          <DetailsAction
            icon={<SquareCheckboxIcon className="h-3 w-3" />}
            onClick={handleConvertToTask}
          >
            Convert to task
          </DetailsAction>
        </>
      }
    >
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
    </ItemDetailsLayout>
  );
}
