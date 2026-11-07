import { upsert, type HyperDB } from "@will-be-done/hyperdb";
import { Clock, Effect } from "effect";
import { action } from "../builders";
import {
  createTaskFromTemplate,
  createTaskTemplate,
  createTaskTemplateFromTask,
  deleteTemplates,
  syncItemRichText,
  taskTemplateById,
  taskTemplatesTable,
  updateTemplate,
  type TaskTemplate,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ResourceNotFoundError } from "./errors";
import { dispatch, select } from "./hyperdb";
import { resolveOrderToken, type Placement } from "./placement";
import { toPublicTaskTemplate } from "./items";
import { itemsInSection, requireSection } from "./sectionQueries";
import { requireTask, toPublicTask } from "./tasks";

export interface TaskTemplateUpdates {
  title?: string;
  content?: string | null;
  nature?: "red" | "green" | "unknown" | null;
  repeatRule?: string;
  repeatRuleDtStart?: number;
  time?: string | null;
  durationMinutes?: number | null;
}

const replaceTaskTemplate = action({
  name: "replaceApiTaskTemplate",
  args: { template: taskTemplatesTable.v() },
  handler: function* ({ template }) {
    yield* upsert(taskTemplatesTable, [template]);
  },
});

const requireTemplate = Effect.fnUntraced(function* (
  db: HyperDB,
  templateId: string,
) {
  const template = yield* select(db, {
    selector: taskTemplateById,
    args: { id: templateId },
  });
  if (!template) {
    return yield* new ResourceNotFoundError({ resource: "Task template" });
  }
  return template;
});

const applyUpdates = Effect.fnUntraced(function* (
  db: HyperDB,
  current: TaskTemplate,
  updates: TaskTemplateUpdates,
) {
  const proposed: TaskTemplate = {
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
    ...(updates.time === undefined ? {} : { time: updates.time }),
    ...(updates.durationMinutes === undefined
      ? {}
      : { durationMinutes: updates.durationMinutes }),
  };
  if (updates.content === null) delete proposed.content;
  if (updates.nature === null) delete proposed.nature;
  const next = syncItemRichText(current, proposed);

  yield* dispatch(db, replaceTaskTemplate({ template: next }));
  return next;
});

export const getTaskTemplate = Effect.fn("getTaskTemplate")(function* ({
  spaceId,
  templateId,
  userId,
}: {
  spaceId: string;
  templateId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const template = yield* requireTemplate(db, templateId);
  return toPublicTaskTemplate(template);
});

export const createSectionTaskTemplate = Effect.fn("createSectionTaskTemplate")(
  function* ({
    spaceId,
    sectionId,
    userId,
    title,
    content,
    nature,
    repeatRule,
    repeatRuleDtStart,
    time,
    durationMinutes,
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
    time?: string | null;
    durationMinutes?: number | null;
    placement?: Placement;
  }) {
    const db = yield* getSpaceDatabase(spaceId, userId);
    yield* requireSection(db, sectionId);
    const now = yield* Clock.currentTimeMillis;
    const template = yield* dispatch(
      db,
      createTaskTemplate({
        now,
        template: {
          title,
          projectSectionId: sectionId,
          orderToken: yield* resolveOrderToken({
            entities: yield* itemsInSection(db, sectionId),
            placement,
          }),
          ...(typeof content === "string" ? { content } : {}),
          ...(typeof nature === "string" ? { nature } : {}),
          ...(repeatRule === undefined ? {} : { repeatRule }),
          repeatRuleDtStart: repeatRuleDtStart ?? now,
          ...(time == null ? {} : { time }),
          ...(durationMinutes == null ? {} : { durationMinutes }),
        },
      }),
    );
    return toPublicTaskTemplate(template);
  },
);

export const updateTaskTemplate = Effect.fn("updateTaskTemplate")(function* ({
  spaceId,
  templateId,
  userId,
  updates,
}: {
  spaceId: string;
  templateId: string;
  userId: string;
  updates: TaskTemplateUpdates;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const current = yield* requireTemplate(db, templateId);
  return toPublicTaskTemplate(yield* applyUpdates(db, current, updates));
});

export const moveTaskTemplate = Effect.fn("moveTaskTemplate")(function* ({
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
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireTemplate(db, templateId);
  yield* requireSection(db, projectSectionId);

  const updated = yield* dispatch(
    db,
    updateTemplate({
      id: templateId,
      template: {
        projectSectionId,
        orderToken: yield* resolveOrderToken({
          entities: yield* itemsInSection(db, projectSectionId, templateId),
          placement,
        }),
      },
    }),
  );
  return toPublicTaskTemplate(updated);
});

export const deleteTaskTemplate = Effect.fn("deleteTaskTemplate")(function* ({
  spaceId,
  templateId,
  userId,
}: {
  spaceId: string;
  templateId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireTemplate(db, templateId);
  yield* dispatch(db, deleteTemplates({ taskTemplateIds: [templateId] }));
});

export const convertTaskToTemplate = Effect.fn("convertTaskToTemplate")(
  function* ({
    spaceId,
    taskId,
    userId,
    updates,
  }: {
    spaceId: string;
    taskId: string;
    userId: string;
    updates: TaskTemplateUpdates;
  }) {
    const db = yield* getSpaceDatabase(spaceId, userId);
    const task = yield* requireTask(db, taskId);

    const now = yield* Clock.currentTimeMillis;
    let template = yield* dispatch(
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
          ...(updates.time === undefined ? {} : { time: updates.time }),
          ...(updates.durationMinutes === undefined
            ? {}
            : { durationMinutes: updates.durationMinutes }),
        },
      }),
    );

    if (updates.content === null || updates.nature === null) {
      template = yield* applyUpdates(db, template, {
        ...(updates.content === null ? { content: null } : {}),
        ...(updates.nature === null ? { nature: null } : {}),
      });
    }
    return toPublicTaskTemplate(template);
  },
);

export const convertTaskTemplateToTask = Effect.fn("convertTaskTemplateToTask")(
  function* ({
    spaceId,
    templateId,
    userId,
  }: {
    spaceId: string;
    templateId: string;
    userId: string;
  }) {
    const db = yield* getSpaceDatabase(spaceId, userId);
    const template = yield* requireTemplate(db, templateId);

    const task = yield* dispatch(
      db,
      createTaskFromTemplate({ taskTemplate: template }),
    );
    return toPublicTask(task, null);
  },
);
