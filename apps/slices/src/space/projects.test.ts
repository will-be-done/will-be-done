import { describe, expect, it } from "vitest";
import {
  DB,
  SubscribableDB,
  createSelector,
  execSync,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import { appCanDrop, appHandleDrop } from "./app";
import { addToDailyList } from "./dailyEntries";
import { addToStash, stashEntryByTaskId } from "./stashEntries";
import { createDailyList } from "./dailyLists";
import {
  createProject as createProjectAction,
  notDoneTasksCountExceptDailiesAndStashCount,
  notDoneTasksCountExceptDailiesCount,
  overdueTasksCountExceptDailiesAndStashCount,
  overdueTasksCountExceptDailiesCount,
} from "./projects";
import {
  installProjectTaskStatsHooks,
  migrateProjectSectionTaskStats,
  migrateScheduledTodoTasks,
  projectTasksCount,
  projectsWithTaskStats,
  rebuildProjectSectionTaskStats,
  rebuildScheduledTodoTasks,
} from "./taskStats";
import {
  createProjectSection,
  createTaskInSection,
  projectSectionsByProjectId,
} from "./projectSections";
import { projectSectionItemIds } from "./projectSectionItems";
import { taskById, updateTask } from "./tasks";
import {
  DailyList,
  dailyListsTable,
  Project,
  projectSectionsTable,
  projectSectionTaskStatsTable,
  ProjectSection,
  projectsTable,
  scheduledTodoTasksTable,
  spaceMigrationsTable,
  stashEntryType,
  stashEntriesTable,
  Task,
  dailyEntriesTable,
  tasksTable,
  taskTemplatesTable,
} from "./tables";

const selector = createSelector();

function runSelector<T>(
  db: DB | SubscribableDB,
  handler: () => Generator<unknown, T, unknown>,
  _deps: unknown[],
): T {
  const testSelector = selector({
    name: "testSelector",
    args: {},
    handler,
  });
  return selectSync(db, { selector: testSelector, args: {} });
}

function createDB() {
  const driver = new BptreeInmemDriver();
  const spaceId = "a0000000-0000-4000-8000-000000000001";
  const db = new DB(driver, { traits: [dbIdTrait("space", spaceId)] });

  execSync(
    db.loadTables([
      dailyListsTable,
      projectSectionsTable,
      projectSectionTaskStatsTable,
      projectsTable,
      scheduledTodoTasksTable,
      spaceMigrationsTable,
      stashEntriesTable,
      dailyEntriesTable,
      taskTemplatesTable,
      tasksTable,
    ]),
  );

  return db;
}

function createDBWithTaskStatsHooks() {
  const db = new SubscribableDB(createDB());
  installProjectTaskStatsHooks(db);

  return db;
}

function createProject(
  db: DB | SubscribableDB,
  attrs: { id?: string; title?: string } = {},
) {
  const project = syncDispatch(
    db,
    createProjectAction({
      project: {
        id: attrs.id ?? "project-1",
        title: attrs.title ?? "Project",
      },
      position: "append",
    }),
  ) as Project;

  const section = runSelector<ProjectSection>(
    db,
    function* () {
      return (yield* projectSectionsByProjectId({
        projectId: project.id,
      }))[0];
    },
    [],
  );

  return { project, section };
}

function createTask(
  db: DB | SubscribableDB,
  projectSectionId: string,
  id: string,
) {
  return syncDispatch(
    db,
    createTaskInSection({
      projectSectionId,
      position: "append",
      taskAttrs: { id },
    }),
  ) as Task;
}

describe("project task stats cache", () => {
  it("updates cached project counts from task changes", () => {
    const db = createDBWithTaskStatsHooks();
    const { project, section } = createProject(db);

    const task = createTask(db, section.id, "cached-task");

    const insertedCount = runSelector<number>(
      db,
      function* () {
        return yield* projectTasksCount({ projectId: project.id });
      },
      [],
    );
    expect(insertedCount).toBe(1);

    syncDispatch(db, updateTask({ id: task.id, task: { state: "done" } }));

    const completedCount = runSelector<number>(
      db,
      function* () {
        return yield* projectTasksCount({ projectId: project.id });
      },
      [],
    );
    expect(completedCount).toBe(0);
  });

  it("rebuilds cached project counts from existing tasks", () => {
    const db = createDB();
    const { project, section } = createProject(db);

    createTask(db, section.id, "existing-task");
    const completedTask = createTask(db, section.id, "completed-existing-task");
    syncDispatch(
      db,
      updateTask({ id: completedTask.id, task: { state: "done" } }),
    );

    syncDispatch(db, rebuildProjectSectionTaskStats({}));

    const count = runSelector<number>(
      db,
      function* () {
        return yield* projectTasksCount({ projectId: project.id });
      },
      [],
    );
    expect(count).toBe(1);
  });

  it("migrates cached project counts once from existing tasks", () => {
    const db = createDB();
    const { project, section } = createProject(db);

    createTask(db, section.id, "migration-existing-task");
    const completedTask = createTask(
      db,
      section.id,
      "migration-completed-existing-task",
    );
    syncDispatch(
      db,
      updateTask({ id: completedTask.id, task: { state: "done" } }),
    );

    syncDispatch(db, migrateProjectSectionTaskStats({}));

    const migratedCount = runSelector<number>(
      db,
      function* () {
        return yield* projectTasksCount({ projectId: project.id });
      },
      [],
    );
    expect(migratedCount).toBe(1);

    createTask(db, section.id, "post-migration-task-without-hook");
    syncDispatch(db, migrateProjectSectionTaskStats({}));

    const countAfterSecondMigration = runSelector<number>(
      db,
      function* () {
        return yield* projectTasksCount({ projectId: project.id });
      },
      [],
    );
    expect(countAfterSecondMigration).toBe(1);
  });

  it("returns all projects with cached task counts in one selector", () => {
    const db = createDBWithTaskStatsHooks();
    const { project, section } = createProject(db);

    createTask(db, section.id, "batched-visible-task");
    const completedTask = createTask(db, section.id, "batched-completed-task");
    syncDispatch(
      db,
      updateTask({ id: completedTask.id, task: { state: "done" } }),
    );

    const projects = runSelector(
      db,
      function* () {
        return yield* projectsWithTaskStats({
          currentDate: new Date(2026, 3, 19).getTime(),
        });
      },
      [],
    );
    const projectWithStats = projects.find(
      (entry) => entry.project.id === project.id,
    );

    expect(projectWithStats?.notDoneCount).toBe(1);
  });

  it("returns overdue project counts in the bulk stats selector", () => {
    const db = createDBWithTaskStatsHooks();
    const { project, section } = createProject(db);

    const overdueTask = createTask(db, section.id, "bulk-overdue-task");
    const todayTask = createTask(db, section.id, "bulk-today-task");
    const completedOverdueTask = createTask(
      db,
      section.id,
      "bulk-completed-overdue-task",
    );
    syncDispatch(
      db,
      updateTask({ id: completedOverdueTask.id, task: { state: "done" } }),
    );

    const overdueList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-04-18" } }),
    ) as DailyList;
    const todayList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-04-19" } }),
    ) as DailyList;

    for (const [taskId, dailyListId] of [
      [overdueTask.id, overdueList.id],
      [completedOverdueTask.id, overdueList.id],
      [todayTask.id, todayList.id],
    ]) {
      syncDispatch(
        db,
        addToDailyList({
          taskId,
          dailyListId,
          position: "append",
        }),
      );
    }

    const projects = runSelector(
      db,
      function* () {
        return yield* projectsWithTaskStats({
          currentDate: new Date(2026, 3, 19).getTime(),
        });
      },
      [],
    );
    const projectWithStats = projects.find(
      (entry) => entry.project.id === project.id,
    );

    expect(projectWithStats?.notDoneCount).toBe(2);
    expect(projectWithStats?.overdueCount).toBe(1);

    syncDispatch(
      db,
      updateTask({ id: overdueTask.id, task: { state: "done" } }),
    );

    const projectsAfterDone = runSelector(
      db,
      function* () {
        return yield* projectsWithTaskStats({
          currentDate: new Date(2026, 3, 19).getTime(),
        });
      },
      [],
    );
    const projectWithStatsAfterDone = projectsAfterDone.find(
      (entry) => entry.project.id === project.id,
    );

    expect(projectWithStatsAfterDone?.notDoneCount).toBe(1);
    expect(projectWithStatsAfterDone?.overdueCount).toBe(0);
  });

  it("rebuilds scheduled todo cache from existing entries", () => {
    const db = createDB();
    const { project, section } = createProject(db);

    const overdueTask = createTask(db, section.id, "rebuild-overdue-task");
    const doneOverdueTask = createTask(
      db,
      section.id,
      "rebuild-done-overdue-task",
    );
    syncDispatch(
      db,
      updateTask({ id: doneOverdueTask.id, task: { state: "done" } }),
    );

    const overdueList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-04-18" } }),
    ) as DailyList;

    for (const taskId of [overdueTask.id, doneOverdueTask.id]) {
      syncDispatch(
        db,
        addToDailyList({
          taskId,
          dailyListId: overdueList.id,
          position: "append",
        }),
      );
    }

    syncDispatch(db, rebuildScheduledTodoTasks({}));

    const projects = runSelector(
      db,
      function* () {
        return yield* projectsWithTaskStats({
          currentDate: new Date(2026, 3, 19).getTime(),
        });
      },
      [],
    );
    const projectWithStats = projects.find(
      (entry) => entry.project.id === project.id,
    );

    expect(projectWithStats?.overdueCount).toBe(1);
  });

  it("migrates scheduled todo cache once from existing entries", () => {
    const db = createDB();
    const { project, section } = createProject(db);

    const overdueTask = createTask(db, section.id, "migration-overdue-task");
    const overdueList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-04-18" } }),
    ) as DailyList;
    syncDispatch(
      db,
      addToDailyList({
        taskId: overdueTask.id,
        dailyListId: overdueList.id,
        position: "append",
      }),
    );

    syncDispatch(db, migrateScheduledTodoTasks({}));

    const migratedProjects = runSelector(
      db,
      function* () {
        return yield* projectsWithTaskStats({
          currentDate: new Date(2026, 3, 19).getTime(),
        });
      },
      [],
    );
    const migratedProjectWithStats = migratedProjects.find(
      (entry) => entry.project.id === project.id,
    );

    expect(migratedProjectWithStats?.overdueCount).toBe(1);

    const laterTask = createTask(db, section.id, "post-migration-overdue-task");
    syncDispatch(
      db,
      addToDailyList({
        taskId: laterTask.id,
        dailyListId: overdueList.id,
        position: "append",
      }),
    );
    syncDispatch(db, migrateScheduledTodoTasks({}));

    const projectsAfterSecondMigration = runSelector(
      db,
      function* () {
        return yield* projectsWithTaskStats({
          currentDate: new Date(2026, 3, 19).getTime(),
        });
      },
      [],
    );
    const projectAfterSecondMigration = projectsAfterSecondMigration.find(
      (entry) => entry.project.id === project.id,
    );

    expect(projectAfterSecondMigration?.overdueCount).toBe(1);
  });
});

describe("moving stashed tasks through app drops", () => {
  it("treats a stash entry dropped on a project task as its task and removes it from stash", () => {
    const db = createDB();
    const { section } = createProject(db);
    const targetTask = createTask(db, section.id, "target-task");
    const stashedTask = createTask(db, section.id, "stashed-drop-on-task");

    syncDispatch(
      db,
      addToStash({
        taskId: stashedTask.id,
        position: "append",
      }),
    );
    const stashEntryId = runSelector<string>(
      db,
      function* () {
        return (yield* stashEntryByTaskId({ taskId: stashedTask.id }))!.id;
      },
      [],
    );

    const canDrop = runSelector<boolean>(
      db,
      function* () {
        return yield* appCanDrop({
          id: targetTask.id,
          modelType: targetTask.type,
          dropId: stashEntryId,
          dropModelType: stashEntryType,
        });
      },
      [],
    );
    expect(canDrop).toBe(true);

    syncDispatch(
      db,
      appHandleDrop({
        id: targetTask.id,
        modelType: targetTask.type,
        dropId: stashEntryId,
        dropModelType: stashEntryType,
        edge: "top",
      }),
    );

    const taskIds = runSelector<string[]>(
      db,
      function* () {
        return yield* projectSectionItemIds({
          projectSectionId: section.id,
        });
      },
      [],
    );
    const stashEntry = runSelector(
      db,
      function* () {
        return yield* stashEntryByTaskId({ taskId: stashedTask.id });
      },
      [],
    );

    expect(taskIds).toContain(stashedTask.id);
    expect(taskIds).toContain(targetTask.id);
    expect(taskIds.indexOf(stashedTask.id)).toBeLessThan(
      taskIds.indexOf(targetTask.id),
    );
    expect(stashEntry).toBeUndefined();
  });

  it("treats a stash entry dropped on a project section as its task and removes it from stash", () => {
    const db = createDB();
    const { project, section } = createProject(db);
    const targetSection = syncDispatch(
      db,
      createProjectSection({
        sectionDraft: {
          projectId: project.id,
          title: "Target",
        },
        position: "append",
      }),
    ) as ProjectSection;
    const stashedTask = createTask(db, section.id, "stashed-drop-task");

    syncDispatch(
      db,
      addToStash({
        taskId: stashedTask.id,
        position: "append",
      }),
    );
    const stashEntryId = runSelector<string>(
      db,
      function* () {
        return (yield* stashEntryByTaskId({ taskId: stashedTask.id }))!.id;
      },
      [],
    );

    const canDrop = runSelector<boolean>(
      db,
      function* () {
        return yield* appCanDrop({
          id: targetSection.id,
          modelType: targetSection.type,
          dropId: stashEntryId,
          dropModelType: stashEntryType,
        });
      },
      [],
    );
    expect(canDrop).toBe(true);

    syncDispatch(
      db,
      appHandleDrop({
        id: targetSection.id,
        modelType: targetSection.type,
        dropId: stashEntryId,
        dropModelType: stashEntryType,
        edge: "bottom",
      }),
    );

    const movedTask = runSelector<Task | undefined>(
      db,
      function* () {
        return yield* taskById({ id: stashedTask.id });
      },
      [],
    );
    const stashEntry = runSelector(
      db,
      function* () {
        return yield* stashEntryByTaskId({ taskId: stashedTask.id });
      },
      [],
    );

    expect(movedTask?.projectSectionId).toBe(targetSection.id);
    expect(stashEntry).toBeUndefined();
  });

  it("treats a stash entry dropped on a project as its task and removes it from stash", () => {
    const db = createDB();
    const { section } = createProject(db);
    const { project: targetProject, section: targetSection } = createProject(
      db,
      {
        id: "project-2",
        title: "Target project",
      },
    );
    const targetTask = createTask(
      db,
      targetSection.id,
      "target-project-existing-task",
    );
    const stashedTask = createTask(db, section.id, "stashed-drop-on-project");
    syncDispatch(
      db,
      updateTask({ id: stashedTask.id, task: { orderToken: "0" } }),
    );

    syncDispatch(
      db,
      addToStash({
        taskId: stashedTask.id,
        position: "append",
      }),
    );
    const stashEntryId = runSelector<string>(
      db,
      function* () {
        return (yield* stashEntryByTaskId({ taskId: stashedTask.id }))!.id;
      },
      [],
    );

    const canDrop = runSelector<boolean>(
      db,
      function* () {
        return yield* appCanDrop({
          id: targetProject.id,
          modelType: targetProject.type,
          dropId: stashEntryId,
          dropModelType: stashEntryType,
        });
      },
      [],
    );
    expect(canDrop).toBe(true);

    syncDispatch(
      db,
      appHandleDrop({
        id: targetProject.id,
        modelType: targetProject.type,
        dropId: stashEntryId,
        dropModelType: stashEntryType,
        edge: "bottom",
      }),
    );

    const movedTask = runSelector<Task | undefined>(
      db,
      function* () {
        return yield* taskById({ id: stashedTask.id });
      },
      [],
    );
    const stashEntry = runSelector(
      db,
      function* () {
        return yield* stashEntryByTaskId({ taskId: stashedTask.id });
      },
      [],
    );
    const targetTaskIds = runSelector<string[]>(
      db,
      function* () {
        return yield* projectSectionItemIds({
          projectSectionId: targetSection.id,
        });
      },
      [],
    );

    expect(movedTask?.projectSectionId).toBe(targetSection.id);
    expect(targetTaskIds).toEqual([targetTask.id, stashedTask.id]);
    expect(stashEntry).toBeUndefined();
  });
});

describe("project stash-aware timeline counts", () => {
  it("excludes stashed tasks from the stash-aware not-done count only", () => {
    const db = createDB();
    const { project, section } = createProject(db);

    createTask(db, section.id, "visible-task");
    const stashedTask = createTask(db, section.id, "stashed-task");
    const dailyTask = createTask(db, section.id, "daily-task");
    const completedTask = createTask(db, section.id, "completed-task");
    syncDispatch(
      db,
      updateTask({ id: completedTask.id, task: { state: "done" } }),
    );

    const dailyList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-04-19" } }),
    ) as DailyList;
    syncDispatch(
      db,
      addToDailyList({
        taskId: dailyTask.id,
        dailyListId: dailyList.id,
        position: "append",
      }),
    );
    syncDispatch(
      db,
      addToStash({
        taskId: stashedTask.id,
        position: "append",
      }),
    );

    const existingCount = runSelector<number>(
      db,
      function* () {
        return yield* notDoneTasksCountExceptDailiesCount({
          projectId: project.id,
          exceptDailyListIds: [dailyList.id],
        });
      },
      [],
    );
    const stashAwareCount = runSelector<number>(
      db,
      function* () {
        return yield* notDoneTasksCountExceptDailiesAndStashCount({
          projectId: project.id,
          exceptDailyListIds: [dailyList.id],
        });
      },
      [],
    );

    expect(existingCount).toBe(2);
    expect(stashAwareCount).toBe(1);
  });

  it("excludes stashed tasks from the stash-aware overdue count only", () => {
    const db = createDB();
    const { project, section } = createProject(db);

    const overdueTask = createTask(db, section.id, "overdue-task");
    const stashedOverdueTask = createTask(
      db,
      section.id,
      "stashed-overdue-task",
    );
    const excludedDailyTask = createTask(db, section.id, "excluded-daily-task");

    const overdueList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-04-17" } }),
    ) as DailyList;
    const stashedOverdueList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-04-18" } }),
    ) as DailyList;
    const excludedList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-04-16" } }),
    ) as DailyList;

    syncDispatch(
      db,
      addToDailyList({
        taskId: overdueTask.id,
        dailyListId: overdueList.id,
        position: "append",
      }),
    );
    syncDispatch(
      db,
      addToDailyList({
        taskId: stashedOverdueTask.id,
        dailyListId: stashedOverdueList.id,
        position: "append",
      }),
    );
    syncDispatch(
      db,
      addToDailyList({
        taskId: excludedDailyTask.id,
        dailyListId: excludedList.id,
        position: "append",
      }),
    );
    syncDispatch(
      db,
      addToStash({
        taskId: stashedOverdueTask.id,
        position: "append",
      }),
    );

    const currentDate = new Date("2026-04-19T12:00:00Z");
    const existingCount = runSelector<number>(
      db,
      function* () {
        return yield* overdueTasksCountExceptDailiesCount({
          projectId: project.id,
          exceptDailyListIds: [excludedList.id],
          currentDate: currentDate.getTime(),
        });
      },
      [],
    );
    const stashAwareCount = runSelector<number>(
      db,
      function* () {
        return yield* overdueTasksCountExceptDailiesAndStashCount({
          projectId: project.id,
          exceptDailyListIds: [excludedList.id],
          currentDate: currentDate.getTime(),
        });
      },
      [],
    );

    expect(existingCount).toBe(2);
    expect(stashAwareCount).toBe(1);
  });
});
