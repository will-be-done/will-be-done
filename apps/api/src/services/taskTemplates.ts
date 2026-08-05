import {
  asyncDispatch,
  createAction,
  selectAsync,
  upsert,
} from "@will-be-done/hyperdb";
import {
  createTaskFromTemplate,
  createTaskTemplate,
  createTaskTemplateFromTask,
  deleteTemplates,
  taskById,
  taskTemplateById,
  taskTemplatesTable,
  updateTemplate,
  type TaskTemplate,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ResourceNotFoundError } from "./errors";
import { resolveOrderToken, type Placement } from "./placement";
import { toPublicTaskTemplate, type PublicTaskTemplate } from "./items";
import { itemsInSection, requireSection } from "./sectionQueries";
import { toPublicTask, type PublicTask } from "./tasks";

export interface TaskTemplateUpdates {
  title?: string;
  content?: string | null;
  nature?: "red" | "green" | "unknown" | null;
  repeatRule?: string;
  repeatRuleDtStart?: number;
}

const action = createAction();
const replaceTaskTemplate = action({
  name: "replaceApiTaskTemplate",
  args: { template: taskTemplatesTable.v() },
  handler: function* ({ template }) {
    yield* upsert(taskTemplatesTable, [template]);
  },
});

async function applyUpdates(
  db: Awaited<ReturnType<typeof getSpaceDatabase>>,
  current: TaskTemplate,
  updates: TaskTemplateUpdates,
): Promise<TaskTemplate> {
  const next: TaskTemplate = {
    ...current,
    ...(updates.title === undefined ? {} : { title: updates.title }),
    ...(typeof updates.content === "string"
      ? { content: updates.content }
      : {}),
    ...(typeof updates.nature === "string" ? { nature: updates.nature } : {}),
    ...(updates.repeatRule === undefined
      ? {}
      : { repeatRule: updates.repeatRule }),
    ...(updates.repeatRuleDtStart === undefined
      ? {}
      : { repeatRuleDtStart: updates.repeatRuleDtStart }),
  };
  if (updates.content === null) delete next.content;
  if (updates.nature === null) delete next.nature;

  await asyncDispatch(db, replaceTaskTemplate({ template: next }));
  return next;
}

export async function getTaskTemplate({
  spaceId,
  templateId,
  userId,
}: {
  spaceId: string;
  templateId: string;
  userId: string;
}): Promise<PublicTaskTemplate> {
  const db = await getSpaceDatabase(spaceId, userId);
  const template = await selectAsync(db, {
    selector: taskTemplateById,
    args: { id: templateId },
  });
  if (!template) throw new ResourceNotFoundError("Task template");
  return toPublicTaskTemplate(template);
}

export async function createSectionTaskTemplate({
  spaceId,
  sectionId,
  userId,
  title,
  content,
  nature,
  repeatRule,
  repeatRuleDtStart,
  placement = { kind: "last" },
}: {
  spaceId: string;
  sectionId: string;
  userId: string;
  title: string;
  content?: string | null;
  nature?: "red" | "green" | "unknown" | null;
  repeatRule?: string;
  repeatRuleDtStart?: number;
  placement?: Placement;
}): Promise<PublicTaskTemplate> {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireSection(db, sectionId);
  const now = Date.now();
  const template = await asyncDispatch(
    db,
    createTaskTemplate({
      now,
      template: {
        title,
        projectSectionId: sectionId,
        orderToken: resolveOrderToken({
          entities: await itemsInSection(db, sectionId),
          placement,
        }),
        ...(typeof content === "string" ? { content } : {}),
        ...(typeof nature === "string" ? { nature } : {}),
        ...(repeatRule === undefined ? {} : { repeatRule }),
        repeatRuleDtStart: repeatRuleDtStart ?? now,
      },
    }),
  );
  return toPublicTaskTemplate(template);
}

export async function updateTaskTemplate({
  spaceId,
  templateId,
  userId,
  updates,
}: {
  spaceId: string;
  templateId: string;
  userId: string;
  updates: TaskTemplateUpdates;
}): Promise<PublicTaskTemplate> {
  const db = await getSpaceDatabase(spaceId, userId);
  const current = await selectAsync(db, {
    selector: taskTemplateById,
    args: { id: templateId },
  });
  if (!current) throw new ResourceNotFoundError("Task template");
  return toPublicTaskTemplate(await applyUpdates(db, current, updates));
}

export async function moveTaskTemplate({
  spaceId,
  templateId,
  userId,
  projectSectionId,
  placement,
}: {
  spaceId: string;
  templateId: string;
  userId: string;
  projectSectionId: string;
  placement: Placement;
}): Promise<PublicTaskTemplate> {
  const db = await getSpaceDatabase(spaceId, userId);
  const current = await selectAsync(db, {
    selector: taskTemplateById,
    args: { id: templateId },
  });
  if (!current) throw new ResourceNotFoundError("Task template");
  await requireSection(db, projectSectionId);

  const updated = await asyncDispatch(
    db,
    updateTemplate({
      id: templateId,
      template: {
        projectSectionId,
        orderToken: resolveOrderToken({
          entities: await itemsInSection(db, projectSectionId, templateId),
          placement,
        }),
      },
    }),
  );
  return toPublicTaskTemplate(updated);
}

export async function deleteTaskTemplate({
  spaceId,
  templateId,
  userId,
}: {
  spaceId: string;
  templateId: string;
  userId: string;
}): Promise<void> {
  const db = await getSpaceDatabase(spaceId, userId);
  const template = await selectAsync(db, {
    selector: taskTemplateById,
    args: { id: templateId },
  });
  if (!template) throw new ResourceNotFoundError("Task template");
  await asyncDispatch(db, deleteTemplates({ taskTemplateIds: [templateId] }));
}

export async function convertTaskToTemplate({
  spaceId,
  taskId,
  userId,
  updates,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
  updates: TaskTemplateUpdates;
}): Promise<PublicTaskTemplate> {
  const db = await getSpaceDatabase(spaceId, userId);
  const task = await selectAsync(db, {
    selector: taskById,
    args: { id: taskId },
  });
  if (!task) throw new ResourceNotFoundError("Task");

  const now = Date.now();
  let template = await asyncDispatch(
    db,
    createTaskTemplateFromTask({
      task,
      now,
      data: {
        ...(task.nature === undefined ? {} : { nature: task.nature }),
        ...(updates.title === undefined ? {} : { title: updates.title }),
        ...(typeof updates.content === "string"
          ? { content: updates.content }
          : {}),
        ...(typeof updates.nature === "string"
          ? { nature: updates.nature }
          : {}),
        ...(updates.repeatRule === undefined
          ? {}
          : { repeatRule: updates.repeatRule }),
        repeatRuleDtStart: updates.repeatRuleDtStart ?? now,
      },
    }),
  );

  if (updates.content === null || updates.nature === null) {
    template = await applyUpdates(db, template, {
      ...(updates.content === null ? { content: null } : {}),
      ...(updates.nature === null ? { nature: null } : {}),
    });
  }
  return toPublicTaskTemplate(template);
}

export async function convertTaskTemplateToTask({
  spaceId,
  templateId,
  userId,
}: {
  spaceId: string;
  templateId: string;
  userId: string;
}): Promise<PublicTask> {
  const db = await getSpaceDatabase(spaceId, userId);
  const template = await selectAsync(db, {
    selector: taskTemplateById,
    args: { id: templateId },
  });
  if (!template) throw new ResourceNotFoundError("Task template");

  const task = await asyncDispatch(
    db,
    createTaskFromTemplate({ taskTemplate: template }),
  );
  return toPublicTask(task, null);
}
