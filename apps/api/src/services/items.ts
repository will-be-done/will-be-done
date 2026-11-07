import { Effect } from "effect";
import {
  projectSectionItems,
  projectSectionTasksByState,
  type Note,
  type TaskTemplate,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { select } from "./hyperdb";
import { requireSection } from "./sectionQueries";
import { getTaskSchedules, toPublicTask, type PublicTask } from "./tasks";

export interface PublicTaskTemplate {
  type: "template";
  id: string;
  title: string;
  content?: string;
  projectSectionId: string;
  nature: "red" | "green" | "unknown";
  repeatRule: string;
  repeatRuleDtStart: number;
  time: string | null;
  durationMinutes: number | null;
  createdAt: number;
  lastGeneratedAt: number;
}

export interface PublicNote {
  type: "note";
  id: string;
  title: string;
  content?: string;
  projectSectionId: string;
  createdAt: number;
}

export type PublicItem = PublicTask | PublicTaskTemplate | PublicNote;

export function toPublicNote(note: Note): PublicNote {
  return {
    type: "note",
    id: note.id,
    title: note.title,
    ...(note.content === undefined ? {} : { content: note.content }),
    projectSectionId: note.projectSectionId,
    createdAt: note.createdAt,
  };
}

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
    time: template.time ?? null,
    durationMinutes: template.durationMinutes ?? null,
    createdAt: template.createdAt,
    lastGeneratedAt: template.lastGeneratedAt,
  };
}

export const listSectionItems = Effect.fn("listSectionItems")(function* ({
  spaceId,
  sectionId,
  userId,
  taskState = "todo",
}: {
  spaceId: string;
  sectionId: string;
  userId: string;
  taskState?: "todo" | "done";
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireSection(db, sectionId);

  if (taskState === "done") {
    const tasks = yield* select(db, {
      selector: projectSectionTasksByState,
      args: { projectSectionId: sectionId, state: "done" },
    });
    const schedules = yield* getTaskSchedules(
      db,
      tasks.map((task) => task.id),
    );
    return tasks.map((task) =>
      toPublicTask(task, schedules.get(task.id) ?? null),
    );
  }

  const items = yield* select(db, {
    selector: projectSectionItems,
    args: { projectSectionId: sectionId },
  });
  const schedules = yield* getTaskSchedules(
    db,
    items.flatMap((item) => (item.type === "task" ? [item.id] : [])),
  );
  return items.map((item) => {
    if (item.type === "task") {
      return toPublicTask(item, schedules.get(item.id) ?? null);
    }
    if (item.type === "note") return toPublicNote(item);
    return toPublicTaskTemplate(item);
  });
});
