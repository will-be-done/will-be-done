import { describe, expect, it } from "vitest";
import {
  DB,
  execSync,
  runSelector,
  syncDispatch,
  BptreeInmemDriver,
} from "@will-be-done/hyperdb-lib";

import { dbIdTrait } from "../traits";
import { addToDailyList } from "./dailyListsProjections";
import { addToStash } from "./stashProjections";
import { createDailyList } from "./dailyLists";
import {
  createProject as createProjectAction,
  notDoneTasksCountExceptDailiesAndStashCount,
  notDoneTasksCountExceptDailiesCount,
  overdueTasksCountExceptDailiesAndStashCount,
  overdueTasksCountExceptDailiesCount,
} from "./projects";
import {
  createProjectCategoryTask,
  projectCategoriesByProjectId,
} from "./projectsCategories";
import { tasksTable, type Task } from "./cardsTasks";
import { taskTemplatesTable } from "./cardsTaskTemplates";
import { dailyListsTable, type DailyList } from "./dailyLists";
import { taskProjectionsTable } from "./dailyListsProjections";
import {
  projectCategoriesTable,
  type ProjectCategory,
} from "./projectsCategories";
import { projectsTable, type Project } from "./projects";
import { stashProjectionsTable } from "./stashProjections";

function createDB() {
  const driver = new BptreeInmemDriver();
  const spaceId = "a0000000-0000-4000-8000-000000000001";
  const db = new DB(driver, [], [dbIdTrait("space", spaceId)]);

  execSync(
    db.loadTables([
      dailyListsTable,
      projectCategoriesTable,
      projectsTable,
      stashProjectionsTable,
      taskProjectionsTable,
      taskTemplatesTable,
      tasksTable,
    ]),
  );

  return db;
}

function createProject(db: DB) {
  const project = syncDispatch(
    db,
    createProjectAction(
      {
        id: "project-1",
        title: "Project",
      },
      "append",
    ),
  ) as Project;

  const category = runSelector<ProjectCategory>(
    db,
    function* () {
      return (yield* projectCategoriesByProjectId(project.id))[0];
    },
    [],
  );

  return { project, category };
}

function createTask(db: DB, categoryId: string, id: string) {
  return syncDispatch(
    db,
    createProjectCategoryTask(categoryId, "append", { id }),
  ) as Task;
}

describe("project stash-aware timeline counts", () => {
  it("excludes stashed tasks from the stash-aware not-done count only", () => {
    const db = createDB();
    const { project, category } = createProject(db);

    createTask(db, category.id, "visible-task");
    const stashedTask = createTask(db, category.id, "stashed-task");
    const dailyTask = createTask(db, category.id, "daily-task");

    const dailyList = syncDispatch(
      db,
      createDailyList({ date: "2026-04-19" }),
    ) as DailyList;
    syncDispatch(
      db,
      addToDailyList(
        dailyTask.id,
        dailyList.id,
        "append",
      ),
    );
    syncDispatch(db, addToStash(stashedTask.id, "append"));

    const existingCount = runSelector<number>(
      db,
      function* () {
        return yield* notDoneTasksCountExceptDailiesCount(
          project.id,
          [dailyList.id],
        );
      },
      [],
    );
    const stashAwareCount = runSelector<number>(
      db,
      function* () {
        return yield* notDoneTasksCountExceptDailiesAndStashCount(
          project.id,
          [dailyList.id],
        );
      },
      [],
    );

    expect(existingCount).toBe(2);
    expect(stashAwareCount).toBe(1);
  });

  it("excludes stashed tasks from the stash-aware overdue count only", () => {
    const db = createDB();
    const { project, category } = createProject(db);

    const overdueTask = createTask(db, category.id, "overdue-task");
    const stashedOverdueTask = createTask(
      db,
      category.id,
      "stashed-overdue-task",
    );
    const excludedDailyTask = createTask(db, category.id, "excluded-daily-task");

    const overdueList = syncDispatch(
      db,
      createDailyList({ date: "2026-04-17" }),
    ) as DailyList;
    const stashedOverdueList = syncDispatch(
      db,
      createDailyList({ date: "2026-04-18" }),
    ) as DailyList;
    const excludedList = syncDispatch(
      db,
      createDailyList({ date: "2026-04-16" }),
    ) as DailyList;

    syncDispatch(
      db,
      addToDailyList(
        overdueTask.id,
        overdueList.id,
        "append",
      ),
    );
    syncDispatch(
      db,
      addToDailyList(
        stashedOverdueTask.id,
        stashedOverdueList.id,
        "append",
      ),
    );
    syncDispatch(
      db,
      addToDailyList(
        excludedDailyTask.id,
        excludedList.id,
        "append",
      ),
    );
    syncDispatch(
      db,
      addToStash(stashedOverdueTask.id, "append"),
    );

    const currentDate = new Date("2026-04-19T12:00:00Z");
    const existingCount = runSelector<number>(
      db,
      function* () {
        return yield* overdueTasksCountExceptDailiesCount(
          project.id,
          [excludedList.id],
          currentDate,
        );
      },
      [],
    );
    const stashAwareCount = runSelector<number>(
      db,
      function* () {
        return yield* overdueTasksCountExceptDailiesAndStashCount(
          project.id,
          [excludedList.id],
          currentDate,
        );
      },
      [],
    );

    expect(existingCount).toBe(2);
    expect(stashAwareCount).toBe(1);
  });
});
