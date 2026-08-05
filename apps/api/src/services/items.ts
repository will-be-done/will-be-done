import { selectSync } from "@will-be-done/hyperdb";
import {
  projectSectionById,
  projectSectionItems,
  projectSectionTasksByState,
  type TaskTemplate,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ResourceNotFoundError } from "./errors";
import { getTaskScheduledDates, toPublicTask, type PublicTask } from "./tasks";

export interface PublicTaskTemplate {
  type: "template";
  id: string;
  title: string;
  content?: string;
  projectSectionId: string;
  nature: "red" | "green" | "unknown";
  repeatRule: string;
  repeatRuleDtStart: number;
  createdAt: number;
  lastGeneratedAt: number;
}

export type PublicItem = PublicTask | PublicTaskTemplate;

export function toPublicTaskTemplate(
  template: TaskTemplate,
): PublicTaskTemplate {
  return {
    type: "template",
    id: template.id,
    title: template.title,
    ...(template.content === undefined ? {} : { content: template.content }),
    projectSectionId: template.projectSectionId,
    nature: template.nature ?? "unknown",
    repeatRule: template.repeatRule,
    repeatRuleDtStart: template.repeatRuleDtStart,
    createdAt: template.createdAt,
    lastGeneratedAt: template.lastGeneratedAt,
  };
}

export function listSectionItems({
  spaceId,
  sectionId,
  userId,
  taskState = "todo",
}: {
  spaceId: string;
  sectionId: string;
  userId: string;
  taskState?: "todo" | "done";
}): PublicItem[] {
  const db = getSpaceDatabase(spaceId, userId);

  const section = selectSync(db, {
    selector: projectSectionById,
    args: { id: sectionId },
  });
  if (!section) throw new ResourceNotFoundError("Project section");

  if (taskState === "done") {
    const tasks = selectSync(db, {
      selector: projectSectionTasksByState,
      args: { projectSectionId: sectionId, state: "done" },
    });
    const scheduledDates = getTaskScheduledDates(
      db,
      tasks.map((task) => task.id),
    );
    return tasks.map((task) =>
      toPublicTask(db, task, scheduledDates.get(task.id) ?? null),
    );
  }

  const items = selectSync(db, {
    selector: projectSectionItems,
    args: { projectSectionId: sectionId },
  });
  const scheduledDates = getTaskScheduledDates(
    db,
    items.flatMap((item) => (item.type === "task" ? [item.id] : [])),
  );
  return items.map((item) =>
    item.type === "task"
      ? toPublicTask(db, item, scheduledDates.get(item.id) ?? null)
      : toPublicTaskTemplate(item),
  );
}
