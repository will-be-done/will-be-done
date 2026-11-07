import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  createAction,
  DB,
  execSync,
  insert,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "@will-be-done/slices/traits";
import { spacesTable, spacesTableType } from "@will-be-done/slices/user";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import {
  addToStash,
  checklistItemsTable,
  createInboxIfNotExists,
  dailyListByDate,
  dailyListsTable,
  dailyEntriesByDailyListId,
  projectSectionsTable,
  projectsTable,
  projectSectionType,
  projectType,
  inboxProjectSectionId,
  dailyEntriesTable,
  rebuildScheduledTodoTasks,
  scheduledTodoTasksTable,
  stashEntryByTaskId,
  stashEntriesTable,
  tasksTable,
  taskTemplatesTable,
  notesTable,
  taskTemplateType,
  taskType,
  trashedTasksTable,
  mindmapNodesTable,
  type Project,
  type ProjectSection,
  type Task,
  type TaskTemplate,
} from "@will-be-done/slices/space";
import { dbsTable, getDbByIdOrCreate } from "../slices/dbSlice";
import {
  createProjectSection,
  deleteProjectSection,
  listProjectSections,
  moveProjectSection,
  updateProjectSection,
  getProjectSection,
} from "./sections";
import { listSectionItems } from "./items";
import { Databases } from "./databases";
import { ConflictError, ResourceNotFoundError } from "./errors";
import {
  createSectionTask,
  deleteTask,
  getTask,
  moveTask,
  updateTask,
} from "./tasks";
import {
  createSpaceProject,
  deleteSpaceProject,
  listSpaceProjects,
  moveSpaceProject,
  updateSpaceProject,
  getSpaceProject,
} from "./projects";
import { clearTaskSchedule, scheduleTask } from "./scheduling";
import { listDailyListItems, listDailyListsInRange } from "./dailyLists";
import {
  convertTaskTemplateToTask,
  convertTaskToTemplate,
  createSectionTaskTemplate,
  deleteTaskTemplate,
  getTaskTemplate,
  moveTaskTemplate,
  updateTaskTemplate,
} from "./taskTemplates";
import {
  createChecklistItem,
  deleteChecklistItem,
  getChecklistItem,
  listChecklistItems,
  moveChecklistItem,
  updateChecklistItem,
} from "./checklistItems";
import { listSpaceTasks } from "./taskQueries";
import { listScheduledTasks } from "./scheduledTasks";
import {
  createStashTask,
  listStashTasks,
  putTaskInStash,
  removeTaskFromStash,
} from "./stash";

const action = createAction();
const orderA = generateJitteredKeyBetween(null, null);
const orderB = generateJitteredKeyBetween(orderA, null);
const orderC = generateJitteredKeyBetween(orderB, null);
const orderD = generateJitteredKeyBetween(orderC, null);
const orderE = generateJitteredKeyBetween(orderD, null);
const seedInboxProject = action({
  name: "seedApiInboxProject",
  args: {},
  handler: function* () {
    yield* insert(projectsTable, [
      {
        type: projectType,
        id: "inbox-project",
        title: "Inbox",
        icon: "",
        isInbox: true,
        orderToken: orderB,
        createdAt: 100,
      },
    ]);
    yield* insert(projectSectionsTable, [
      {
        type: projectSectionType,
        id: "inbox-section",
        projectId: "inbox-project",
        title: "Inbox",
        orderToken: orderA,
        createdAt: 100,
      },
    ]);
  },
});
const seedMissingScheduledTask = action({
  name: "seedApiMissingScheduledTask",
  args: {},
  handler: function* () {
    yield* insert(scheduledTodoTasksTable, [
      {
        id: "task-b",
        scheduledAt: new Date(2026, 7, 1).getTime(),
        projectSectionId: "section-1",
      },
    ]);
  },
});
const seedSpaceMembership = action({
  name: "seedApiSectionTaskTestSpaceMembership",
  args: {},
  handler: function* () {
    yield* insert(spacesTable, [
      {
        id: "space-1",
        type: spacesTableType,
        name: "Space",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  },
});
const seedDomain = action({
  name: "seedApiDomain",
  args: {},
  handler: function* () {
    const projects: Project[] = [
      {
        type: projectType,
        id: "project-1",
        title: "Project",
        icon: "",
        isInbox: false,
        orderToken: orderA,
        createdAt: 100,
      },
    ];
    const sections: ProjectSection[] = [
      {
        type: projectSectionType,
        id: "section-1",
        projectId: "project-1",
        title: "First",
        orderToken: orderA,
        createdAt: 101,
      },
      {
        type: projectSectionType,
        id: "section-2",
        projectId: "project-1",
        title: "Second",
        orderToken: orderB,
        createdAt: 102,
      },
    ];
    const tasks: Task[] = [
      {
        type: taskType,
        id: "task-a",
        title: "A",
        state: "todo",
        projectSectionId: "section-1",
        orderToken: orderA,
        lastToggledAt: 100,
        nature: "unknown",
        createdAt: 100,
        templateId: null,
        templateDate: null,
      },
      {
        type: taskType,
        id: "task-c",
        title: "C",
        state: "todo",
        projectSectionId: "section-1",
        orderToken: orderC,
        lastToggledAt: 100,
        nature: "green",
        createdAt: 100,
        templateId: null,
        templateDate: null,
      },
      {
        type: taskType,
        id: "done-old",
        title: "Done old",
        state: "done",
        projectSectionId: "section-1",
        orderToken: orderD,
        lastToggledAt: 200,
        nature: "unknown",
        createdAt: 100,
        templateId: null,
        templateDate: null,
      },
      {
        type: taskType,
        id: "done-new",
        title: "Done new",
        state: "done",
        projectSectionId: "section-1",
        orderToken: orderE,
        lastToggledAt: 300,
        nature: "unknown",
        createdAt: 100,
        templateId: null,
        templateDate: null,
      },
    ];
    const templates: TaskTemplate[] = [
      {
        type: taskTemplateType,
        id: "template-b",
        title: "Template B",
        projectSectionId: "section-1",
        orderToken: orderB,
        repeatRule: "FREQ=DAILY",
        repeatRuleDtStart: 100,
        createdAt: 100,
        lastGeneratedAt: 100,
        nature: "red",
      },
    ];

    yield* insert(projectsTable, projects);
    yield* insert(projectSectionsTable, sections);
    yield* insert(tasksTable, tasks);
    yield* insert(taskTemplatesTable, templates);
  },
});

function setUpDatabases() {
  const mainDB = new DB(new BptreeInmemDriver());
  const userDB = new DB(new BptreeInmemDriver());
  const spaceDB = new DB(new BptreeInmemDriver(), {
    traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
  });
  execSync(mainDB.loadTables([dbsTable]));
  syncDispatch(
    mainDB,
    getDbByIdOrCreate({
      id: "space-1",
      type: "space",
      userId: "user-1",
    }),
  );
  execSync(userDB.loadTables([spacesTable]));
  syncDispatch(userDB, seedSpaceMembership({}));
  execSync(
    spaceDB.loadTables([
      projectsTable,
      projectSectionsTable,
      tasksTable,
      taskTemplatesTable,
      notesTable,
      checklistItemsTable,
      dailyListsTable,
      dailyEntriesTable,
      scheduledTodoTasksTable,
      stashEntriesTable,
      trashedTasksTable,
      mindmapNodesTable,
    ]),
  );
  syncDispatch(spaceDB, seedDomain({}));

  const layer = Layer.succeed(Databases, {
    main: Effect.succeed(mainDB),
    user: () => Effect.succeed(userDB),
    space: () => Effect.succeed(spaceDB),
  });
  const run = <A, E>(effect: Effect.Effect<A, E, Databases>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer)));
  return { spaceDB, run };
}

describe("section and task services", () => {
  test("lists project sections in display order without order tokens", async () => {
    const { run } = setUpDatabases();

    expect(
      await run(
        listProjectSections({
          spaceId: "space-1",
          projectId: "project-1",
          userId: "user-1",
        }),
      ),
    ).toEqual([
      {
        id: "section-1",
        projectId: "project-1",
        title: "First",
        createdAt: 101,
      },
      {
        id: "section-2",
        projectId: "project-1",
        title: "Second",
        createdAt: 102,
      },
    ]);

    expect(
      run(
        listProjectSections({
          spaceId: "space-1",
          projectId: "missing",
          userId: "user-1",
        }),
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  test("gets individual projects and sections", async () => {
    const { run } = setUpDatabases();

    expect(
      await run(
        getSpaceProject({
          spaceId: "space-1",
          projectId: "project-1",
          userId: "user-1",
        }),
      ),
    ).toMatchObject({ id: "project-1", title: "Project" });
    expect(
      await run(
        getProjectSection({
          spaceId: "space-1",
          sectionId: "section-2",
          userId: "user-1",
        }),
      ),
    ).toMatchObject({ id: "section-2", projectId: "project-1" });
  });

  test("lists todo tasks and templates as items, or done tasks only", async () => {
    const { run } = setUpDatabases();

    expect(
      (
        await run(
          listSectionItems({
            spaceId: "space-1",
            sectionId: "section-1",
            userId: "user-1",
          }),
        )
      ).map((item) => [item.type, item.id]),
    ).toEqual([
      ["task", "task-a"],
      ["template", "template-b"],
      ["task", "task-c"],
    ]);

    expect(
      (
        await run(
          listSectionItems({
            spaceId: "space-1",
            sectionId: "section-1",
            userId: "user-1",
            taskState: "done",
          }),
        )
      ).map((item) => [item.type, item.id]),
    ).toEqual([
      ["task", "done-new"],
      ["task", "done-old"],
    ]);
  });

  test("creates and moves tasks using ID-based placement", async () => {
    const { run } = setUpDatabases();

    const created = await run(
      createSectionTask({
        spaceId: "space-1",
        sectionId: "section-1",
        userId: "user-1",
        title: "B",
        placement: { kind: "after", anchorId: "task-a" },
      }),
    );
    expect(created).not.toHaveProperty("orderToken");
    expect(
      (
        await run(
          listSectionItems({
            spaceId: "space-1",
            sectionId: "section-1",
            userId: "user-1",
          }),
        )
      )
        .filter((item) => item.type === "task")
        .map((item) => item.title),
    ).toEqual(["A", "B", "C"]);

    const moved = await run(
      moveTask({
        spaceId: "space-1",
        taskId: created.id,
        userId: "user-1",
        projectSectionId: "section-2",
        placement: { kind: "first" },
      }),
    );
    expect(moved.projectSectionId).toBe("section-2");
    expect(
      (
        await run(
          listSectionItems({
            spaceId: "space-1",
            sectionId: "section-2",
            userId: "user-1",
          }),
        )
      ).map((item) => item.id),
    ).toEqual([created.id]);
  });

  test("rejects anchors outside the destination section", async () => {
    const { run } = setUpDatabases();

    expect(
      run(
        createSectionTask({
          spaceId: "space-1",
          sectionId: "section-2",
          userId: "user-1",
          title: "Invalid",
          placement: { kind: "after", anchorId: "task-a" },
        }),
      ),
    ).rejects.toThrow(ConflictError);
  });

  test("updates task state and deletes the task", async () => {
    const { run } = setUpDatabases();

    const updated = await run(
      updateTask({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
        updates: { state: "done", title: "Finished" },
      }),
    );
    expect(updated).toMatchObject({ state: "done", title: "Finished" });

    await run(
      updateTask({
        spaceId: "space-1",
        taskId: "task-c",
        userId: "user-1",
        updates: { content: "Description", nature: "red" },
      }),
    );
    const cleared = await run(
      updateTask({
        spaceId: "space-1",
        taskId: "task-c",
        userId: "user-1",
        updates: { content: null, nature: null },
      }),
    );
    expect(cleared).not.toHaveProperty("content");
    expect(cleared.nature).toBe("unknown");

    await run(
      deleteTask({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
      }),
    );
    expect(
      run(
        getTask({
          spaceId: "space-1",
          taskId: "task-a",
          userId: "user-1",
        }),
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  test("creates, updates, repositions, and deletes projects", async () => {
    const { run } = setUpDatabases();

    const created = await run(
      createSpaceProject({
        spaceId: "space-1",
        userId: "user-1",
        title: "New project",
        placement: { kind: "first" },
      }),
    );
    expect(
      (
        await run(listSpaceProjects({ spaceId: "space-1", userId: "user-1" }))
      )[0].id,
    ).toBe(created.id);

    const updated = await run(
      updateSpaceProject({
        spaceId: "space-1",
        projectId: created.id,
        userId: "user-1",
        updates: { title: "Renamed" },
      }),
    );
    expect(updated.title).toBe("Renamed");
    await run(
      moveSpaceProject({
        spaceId: "space-1",
        projectId: created.id,
        userId: "user-1",
        placement: { kind: "last" },
      }),
    );
    expect(
      (
        await run(listSpaceProjects({ spaceId: "space-1", userId: "user-1" }))
      ).at(-1)?.id,
    ).toBe(created.id);

    await run(
      deleteSpaceProject({
        spaceId: "space-1",
        projectId: created.id,
        userId: "user-1",
      }),
    );
    expect(
      (
        await run(listSpaceProjects({ spaceId: "space-1", userId: "user-1" }))
      ).some((project) => project.id === created.id),
    ).toBe(false);
  });

  test("creates, updates, repositions, and deletes sections", async () => {
    const { run } = setUpDatabases();

    const created = await run(
      createProjectSection({
        spaceId: "space-1",
        projectId: "project-1",
        userId: "user-1",
        title: "Middle",
        placement: { kind: "before", anchorId: "section-2" },
      }),
    );
    expect(
      (
        await run(
          listProjectSections({
            spaceId: "space-1",
            projectId: "project-1",
            userId: "user-1",
          }),
        )
      ).map((section) => section.id),
    ).toEqual(["section-1", created.id, "section-2"]);

    const updated = await run(
      updateProjectSection({
        spaceId: "space-1",
        sectionId: created.id,
        userId: "user-1",
        updates: { title: "First now" },
      }),
    );
    expect(updated.title).toBe("First now");
    const destination = await run(
      createSpaceProject({
        spaceId: "space-1",
        userId: "user-1",
        title: "Destination",
      }),
    );
    await run(
      moveProjectSection({
        spaceId: "space-1",
        sectionId: created.id,
        userId: "user-1",
        projectId: destination.id,
        placement: { kind: "first" },
      }),
    );
    expect(
      (
        await run(
          listProjectSections({
            spaceId: "space-1",
            projectId: destination.id,
            userId: "user-1",
          }),
        )
      )[0].id,
    ).toBe(created.id);

    await run(
      deleteProjectSection({
        spaceId: "space-1",
        sectionId: created.id,
        userId: "user-1",
      }),
    );
    expect(
      (
        await run(
          listProjectSections({
            spaceId: "space-1",
            projectId: "project-1",
            userId: "user-1",
          }),
        )
      ).some((section) => section.id === created.id),
    ).toBe(false);
    await run(
      deleteSpaceProject({
        spaceId: "space-1",
        projectId: destination.id,
        userId: "user-1",
      }),
    );
  });

  test("rejects creating, moving, or deleting inbox sections", async () => {
    const { spaceDB, run } = setUpDatabases();
    syncDispatch(spaceDB, seedInboxProject({}));

    expect(
      run(
        createProjectSection({
          spaceId: "space-1",
          projectId: "inbox-project",
          userId: "user-1",
          title: "Invalid",
        }),
      ),
    ).rejects.toThrow(ConflictError);

    expect(
      run(
        moveProjectSection({
          spaceId: "space-1",
          sectionId: "section-1",
          userId: "user-1",
          projectId: "inbox-project",
          placement: { kind: "last" },
        }),
      ),
    ).rejects.toThrow(ConflictError);

    expect(
      run(
        moveProjectSection({
          spaceId: "space-1",
          sectionId: "inbox-section",
          userId: "user-1",
          projectId: "project-1",
          placement: { kind: "last" },
        }),
      ),
    ).rejects.toThrow(ConflictError);

    expect(
      run(
        deleteProjectSection({
          spaceId: "space-1",
          sectionId: "inbox-section",
          userId: "user-1",
        }),
      ),
    ).rejects.toThrow(ConflictError);
  });

  test("schedules, positions, and reschedules a task", async () => {
    const { spaceDB, run } = setUpDatabases();

    await run(
      scheduleTask({
        spaceId: "space-1",
        taskId: "task-c",
        userId: "user-1",
        date: "2026-07-22",
      }),
    );
    const scheduled = await run(
      scheduleTask({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
        date: "2026-07-22",
        placement: { kind: "before", anchorId: "task-c" },
      }),
    );
    expect(scheduled).toMatchObject({
      task: { id: "task-a", scheduledDate: "2026-07-22" },
      date: "2026-07-22",
      previousDate: null,
    });
    expect(
      (
        await run(
          getTask({
            spaceId: "space-1",
            taskId: "task-a",
            userId: "user-1",
          }),
        )
      ).scheduledDate,
    ).toBe("2026-07-22");

    const firstList = selectSync(spaceDB, {
      selector: dailyListByDate,
      args: { date: "2026-07-22" },
    });
    expect(firstList).toBeDefined();
    expect(
      selectSync(spaceDB, {
        selector: dailyEntriesByDailyListId,
        args: { dailyListId: firstList!.id },
      }).map((entry) => entry.taskId),
    ).toEqual(["task-a", "task-c"]);
    expect(
      (
        await run(
          listDailyListItems({
            spaceId: "space-1",
            userId: "user-1",
            date: "2026-07-22",
          }),
        )
      ).map((item) => item.id),
    ).toEqual(["task-a", "task-c"]);

    await run(
      scheduleTask({
        spaceId: "space-1",
        taskId: "done-new",
        userId: "user-1",
        date: "2026-07-22",
      }),
    );
    expect(
      (
        await run(
          listDailyListItems({
            spaceId: "space-1",
            userId: "user-1",
            date: "2026-07-22",
            state: "done",
          }),
        )
      ).map((item) => item.id),
    ).toEqual(["done-new"]);
    expect(
      await run(
        listDailyListItems({
          spaceId: "space-1",
          userId: "user-1",
          date: "2026-07-24",
        }),
      ),
    ).toEqual([]);

    const rescheduled = await run(
      scheduleTask({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
        date: "2026-07-23",
      }),
    );
    expect(rescheduled.previousDate).toBe("2026-07-22");
    expect(
      selectSync(spaceDB, {
        selector: dailyEntriesByDailyListId,
        args: { dailyListId: firstList!.id },
      }).map((entry) => entry.taskId),
    ).toEqual(["task-c", "done-new"]);

    const clearedDate = await run(
      clearTaskSchedule({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
      }),
    );
    const alreadyClearDate = await run(
      clearTaskSchedule({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
      }),
    );
    expect(clearedDate).toBe("2026-07-23");
    expect(alreadyClearDate).toBeNull();
    expect(
      (
        await run(
          getTask({
            spaceId: "space-1",
            taskId: "task-a",
            userId: "user-1",
          }),
        )
      ).scheduledDate,
    ).toBeNull();
  });

  test("paginates tasks and lists daily-list ranges", async () => {
    const { run } = setUpDatabases();
    await run(
      scheduleTask({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
        date: "2026-08-01",
      }),
    );
    await run(
      scheduleTask({
        spaceId: "space-1",
        taskId: "task-c",
        userId: "user-1",
        date: "2026-08-05",
      }),
    );

    const firstPage = await run(
      listSpaceTasks({
        spaceId: "space-1",
        userId: "user-1",
        limit: 1,
      }),
    );
    expect(firstPage.tasks).toHaveLength(1);
    expect(firstPage.tasks[0]).toMatchObject({
      id: "task-c",
      scheduledDate: "2026-08-05",
    });
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await run(
      listSpaceTasks({
        spaceId: "space-1",
        userId: "user-1",
        cursor: firstPage.nextCursor!,
        limit: 1,
      }),
    );
    expect(secondPage.tasks[0]).toMatchObject({
      id: "task-a",
      scheduledDate: "2026-08-01",
    });

    const firstDailyListsPage = await run(
      listDailyListsInRange({
        spaceId: "space-1",
        userId: "user-1",
        from: "2026-08-01",
        to: "2026-08-05",
        limit: 1,
      }),
    );
    expect(firstDailyListsPage.dailyLists.map(({ date }) => date)).toEqual([
      "2026-08-01",
    ]);
    expect(firstDailyListsPage.dailyLists[0].items.map(({ id }) => id)).toEqual(
      ["task-a"],
    );
    expect(firstDailyListsPage.nextCursor).not.toBeNull();

    const secondDailyListsPage = await run(
      listDailyListsInRange({
        spaceId: "space-1",
        userId: "user-1",
        from: "2026-08-01",
        to: "2026-08-05",
        cursor: firstDailyListsPage.nextCursor!,
        limit: 1,
      }),
    );
    expect(secondDailyListsPage.dailyLists.map(({ date }) => date)).toEqual([
      "2026-08-05",
    ]);
    expect(secondDailyListsPage.nextCursor).toBeNull();

    expect(
      (
        await run(
          listSectionItems({
            spaceId: "space-1",
            sectionId: "section-1",
            userId: "user-1",
          }),
        )
      )
        .filter((item) => item.type === "task")
        .map((task) => [task.id, task.scheduledDate]),
    ).toEqual([
      ["task-a", "2026-08-01"],
      ["task-c", "2026-08-05"],
    ]);
  });

  test("lists overdue and upcoming tasks from the scheduled index", async () => {
    const { spaceDB, run } = setUpDatabases();
    await run(
      scheduleTask({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
        date: "2026-08-01",
      }),
    );
    await run(
      scheduleTask({
        spaceId: "space-1",
        taskId: "task-c",
        userId: "user-1",
        date: "2026-08-05",
      }),
    );
    syncDispatch(spaceDB, rebuildScheduledTodoTasks({}));

    const firstOverduePage = await run(
      listScheduledTasks({
        spaceId: "space-1",
        userId: "user-1",
        scope: "overdue",
        relativeTo: "2026-08-06",
        limit: 1,
      }),
    );
    expect(firstOverduePage.tasks.map((task) => task.id)).toEqual(["task-a"]);
    expect(firstOverduePage.nextCursor).not.toBeNull();
    expect(
      (
        await run(
          listScheduledTasks({
            spaceId: "space-1",
            userId: "user-1",
            scope: "overdue",
            relativeTo: "2026-08-06",
            cursor: firstOverduePage.nextCursor!,
            limit: 1,
          }),
        )
      ).tasks.map((task) => task.id),
    ).toEqual(["task-c"]);
    expect(
      (
        await run(
          listScheduledTasks({
            spaceId: "space-1",
            userId: "user-1",
            scope: "upcoming",
            relativeTo: "2026-08-03",
            to: "2026-08-06",
            limit: 50,
          }),
        )
      ).tasks.map((task) => task.id),
    ).toEqual(["task-c"]);
  });

  test("keeps live scheduled tasks reachable across a same-date missing task", async () => {
    const { spaceDB, run } = setUpDatabases();
    for (const taskId of ["task-a", "task-c"]) {
      await run(
        scheduleTask({
          spaceId: "space-1",
          taskId,
          userId: "user-1",
          date: "2026-08-01",
        }),
      );
    }
    syncDispatch(spaceDB, rebuildScheduledTodoTasks({}));
    syncDispatch(spaceDB, seedMissingScheduledTask({}));

    const reachedTaskIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await run(
        listScheduledTasks({
          spaceId: "space-1",
          userId: "user-1",
          scope: "overdue",
          relativeTo: "2026-08-02",
          cursor,
          limit: 1,
        }),
      );
      reachedTaskIds.push(...page.tasks.map((task) => task.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(reachedTaskIds).toEqual(["task-a", "task-c"]);
  });

  test("lists, adds, repositions, and removes stash tasks", async () => {
    const { spaceDB, run } = setUpDatabases();
    await run(
      scheduleTask({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
        date: "2026-08-05",
      }),
    );

    expect(
      (
        await run(
          putTaskInStash({
            spaceId: "space-1",
            taskId: "task-a",
            userId: "user-1",
          }),
        )
      ).scheduledDate,
    ).toBe("2026-08-05");
    await run(
      putTaskInStash({
        spaceId: "space-1",
        taskId: "task-c",
        userId: "user-1",
      }),
    );
    expect(
      (await run(listStashTasks({ spaceId: "space-1", userId: "user-1" }))).map(
        (task) => task.id,
      ),
    ).toEqual(["task-c", "task-a"]);

    await run(
      putTaskInStash({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
      }),
    );
    expect(
      (await run(listStashTasks({ spaceId: "space-1", userId: "user-1" }))).map(
        (task) => task.id,
      ),
    ).toEqual(["task-c", "task-a"]);

    await run(
      putTaskInStash({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
        placement: { kind: "first" },
      }),
    );
    expect(
      (await run(listStashTasks({ spaceId: "space-1", userId: "user-1" }))).map(
        (task) => task.id,
      ),
    ).toEqual(["task-a", "task-c"]);

    await run(
      putTaskInStash({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
        placement: { kind: "after", anchorId: "task-c" },
      }),
    );
    expect(
      (await run(listStashTasks({ spaceId: "space-1", userId: "user-1" }))).map(
        (task) => task.id,
      ),
    ).toEqual(["task-c", "task-a"]);

    const originalEntry = selectSync(spaceDB, {
      selector: stashEntryByTaskId,
      args: { taskId: "task-a" },
    });
    await run(
      removeTaskFromStash({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
      }),
    );
    await run(
      putTaskInStash({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
        placement: { kind: "after", anchorId: "task-c" },
      }),
    );
    const replacementEntry = selectSync(spaceDB, {
      selector: stashEntryByTaskId,
      args: { taskId: "task-a" },
    });
    expect(replacementEntry?.id).not.toBe(originalEntry?.id);
    expect(
      (await run(listStashTasks({ spaceId: "space-1", userId: "user-1" }))).map(
        (task) => task.id,
      ),
    ).toEqual(["task-c", "task-a"]);

    expect(
      run(
        putTaskInStash({
          spaceId: "space-1",
          taskId: "task-a",
          userId: "user-1",
          placement: { kind: "after", anchorId: "missing" },
        }),
      ),
    ).rejects.toThrow(ConflictError);
    expect(
      run(
        putTaskInStash({
          spaceId: "space-1",
          taskId: "done-old",
          userId: "user-1",
        }),
      ),
    ).rejects.toThrow(ConflictError);

    syncDispatch(
      spaceDB,
      addToStash({ taskId: "done-old", position: "append" }),
    );
    syncDispatch(
      spaceDB,
      addToStash({ taskId: "done-new", position: "append" }),
    );
    expect(
      (
        await run(
          listStashTasks({
            spaceId: "space-1",
            userId: "user-1",
            state: "done",
          }),
        )
      ).map((task) => task.id),
    ).toEqual(["done-new", "done-old"]);

    await run(
      removeTaskFromStash({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
      }),
    );
    expect(
      await run(
        getTask({
          spaceId: "space-1",
          taskId: "task-a",
          userId: "user-1",
        }),
      ),
    ).toMatchObject({ id: "task-a", scheduledDate: "2026-08-05" });
    expect(
      run(
        removeTaskFromStash({
          spaceId: "space-1",
          taskId: "task-a",
          userId: "user-1",
        }),
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  test("creates a stash task in the inbox", async () => {
    const { spaceDB, run } = setUpDatabases();
    syncDispatch(spaceDB, createInboxIfNotExists({}));
    const expectedSectionId = selectSync(spaceDB, {
      selector: inboxProjectSectionId,
      args: {},
    });

    const task = await run(
      createStashTask({
        spaceId: "space-1",
        userId: "user-1",
        title: "Stashed",
        content: "Details",
        nature: "red",
      }),
    );

    expect(task).toMatchObject({
      title: "Stashed",
      content: "Details",
      nature: "red",
      projectSectionId: expectedSectionId,
      scheduledDate: null,
    });
    expect(
      (await run(listStashTasks({ spaceId: "space-1", userId: "user-1" }))).map(
        (item) => item.id,
      ),
    ).toEqual([task.id]);
  });

  test("creates, updates, moves, and deletes task templates", async () => {
    const { run } = setUpDatabases();

    const created = await run(
      createSectionTaskTemplate({
        spaceId: "space-1",
        sectionId: "section-1",
        userId: "user-1",
        title: "Recurring",
        repeatRule: "FREQ=WEEKLY;INTERVAL=1",
        content: "Notes",
        nature: "green",
        placement: { kind: "after", anchorId: "task-a" },
      }),
    );
    expect(
      (
        await run(
          listSectionItems({
            spaceId: "space-1",
            sectionId: "section-1",
            userId: "user-1",
          }),
        )
      ).map((item) => item.id),
    ).toEqual(["task-a", created.id, "template-b", "task-c"]);

    const updated = await run(
      updateTaskTemplate({
        spaceId: "space-1",
        templateId: created.id,
        userId: "user-1",
        updates: { title: "Renamed", content: null, nature: null },
      }),
    );
    expect(updated.title).toBe("Renamed");
    expect(updated).not.toHaveProperty("content");
    expect(updated.nature).toBe("unknown");

    expect(
      (
        await run(
          moveTaskTemplate({
            spaceId: "space-1",
            templateId: created.id,
            userId: "user-1",
            projectSectionId: "section-2",
            placement: { kind: "first" },
          }),
        )
      ).projectSectionId,
    ).toBe("section-2");
    expect(
      (
        await run(
          getTaskTemplate({
            spaceId: "space-1",
            templateId: created.id,
            userId: "user-1",
          }),
        )
      ).id,
    ).toBe(created.id);

    await run(
      deleteTaskTemplate({
        spaceId: "space-1",
        templateId: created.id,
        userId: "user-1",
      }),
    );
    expect(
      run(
        getTaskTemplate({
          spaceId: "space-1",
          templateId: created.id,
          userId: "user-1",
        }),
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  test("converts between tasks and templates", async () => {
    const { run } = setUpDatabases();

    const template = await run(
      convertTaskToTemplate({
        spaceId: "space-1",
        taskId: "task-a",
        userId: "user-1",
        updates: { repeatRule: "FREQ=DAILY;INTERVAL=1" },
      }),
    );
    expect(template.title).toBe("A");
    expect(
      run(
        getTask({
          spaceId: "space-1",
          taskId: "task-a",
          userId: "user-1",
        }),
      ),
    ).rejects.toThrow(ResourceNotFoundError);

    const task = await run(
      convertTaskTemplateToTask({
        spaceId: "space-1",
        templateId: template.id,
        userId: "user-1",
      }),
    );
    expect(task).toMatchObject({ title: "A", scheduledDate: null });
    expect(
      run(
        getTaskTemplate({
          spaceId: "space-1",
          templateId: template.id,
          userId: "user-1",
        }),
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  test("manages and repositions checklist items for tasks and templates", async () => {
    const { run } = setUpDatabases();

    const first = await run(
      createChecklistItem({
        spaceId: "space-1",
        userId: "user-1",
        parentType: "task",
        parentId: "task-a",
        content: "First",
      }),
    );
    const second = await run(
      createChecklistItem({
        spaceId: "space-1",
        userId: "user-1",
        parentType: "task",
        parentId: "task-a",
        content: "Second",
      }),
    );

    await run(
      moveChecklistItem({
        spaceId: "space-1",
        userId: "user-1",
        checklistItemId: second.id,
        parentType: "task",
        parentId: "task-a",
        placement: { kind: "before", anchorId: first.id },
      }),
    );
    expect(
      (
        await run(
          listChecklistItems({
            spaceId: "space-1",
            userId: "user-1",
            parentType: "task",
            parentId: "task-a",
          }),
        )
      ).map((item) => item.id),
    ).toEqual([second.id, first.id]);

    const updated = await run(
      updateChecklistItem({
        spaceId: "space-1",
        userId: "user-1",
        checklistItemId: first.id,
        updates: { content: "Finished", state: "done" },
      }),
    );
    expect(updated).toMatchObject({ content: "Finished", state: "done" });
    expect(updated.checkedAt).not.toBeNull();

    const reset = await run(
      updateChecklistItem({
        spaceId: "space-1",
        userId: "user-1",
        checklistItemId: first.id,
        updates: { state: "todo" },
      }),
    );
    expect(reset).toMatchObject({ state: "todo", checkedAt: null });

    await run(
      moveChecklistItem({
        spaceId: "space-1",
        userId: "user-1",
        checklistItemId: first.id,
        parentType: "template",
        parentId: "template-b",
        placement: { kind: "last" },
      }),
    );
    expect(
      (
        await run(
          listChecklistItems({
            spaceId: "space-1",
            userId: "user-1",
            parentType: "template",
            parentId: "template-b",
          }),
        )
      ).map((item) => item.id),
    ).toEqual([first.id]);
    expect(
      (
        await run(
          getChecklistItem({
            spaceId: "space-1",
            userId: "user-1",
            checklistItemId: first.id,
          }),
        )
      ).parentType,
    ).toBe("template");

    await run(
      deleteChecklistItem({
        spaceId: "space-1",
        userId: "user-1",
        checklistItemId: first.id,
      }),
    );
    expect(
      run(
        getChecklistItem({
          spaceId: "space-1",
          userId: "user-1",
          checklistItemId: first.id,
        }),
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });
});
