import { describe, expect, it } from "vitest";
import {
  createAction,
  DB,
  execSync,
  insert,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  appCanDrop,
  taskCanDrop,
  taskTemplateCanDrop,
  projectCanDrop,
  projectSectionCanDrop,
  appHandleDrop,
  canDropModel,
  getDropModelData,
  defaultTask,
  defaultTaskTemplate,
  defaultDailyEntry,
  defaultStashEntry,
  defaultProject,
  defaultProjectSection,
  defaultDailyList,
  defaultChecklistItem,
  taskById,
  updateTask,
  updateDailyEntry,
  dailyEntryByTaskId,
  stashEntryByTaskId,
  tasksTable,
  taskTemplatesTable,
  dailyEntriesTable,
  stashEntriesTable,
  projectsTable,
  projectSectionsTable,
  dailyListsTable,
  checklistItemsTable,
  type AnyModel,
  type DropModelData,
  type Task,
} from "./index";

function task(id: string, state: Task["state"] = "todo"): Task {
  return {
    ...defaultTask,
    id,
    state,
    projectSectionId: `${id.startsWith("source-") ? "source" : "target"}-section`,
    orderToken: id,
  };
}

function models(prefix: string): AnyModel[] {
  return [
    task(`${prefix}todo`),
    task(`${prefix}done`, "done"),
    {
      ...defaultTaskTemplate,
      id: `${prefix}template`,
      projectSectionId: `${prefix}section`,
    },
    {
      ...defaultDailyEntry,
      id: `${prefix}daily-todo`,
      taskId: `${prefix}todo`,
      dailyListId: `${prefix}dailyList`,
    },
    {
      ...defaultDailyEntry,
      id: `${prefix}daily-done`,
      taskId: `${prefix}done`,
      dailyListId: `${prefix}dailyList`,
    },
    {
      ...defaultStashEntry,
      id: `${prefix}stash-todo`,
      taskId: `${prefix}todo`,
    },
    {
      ...defaultStashEntry,
      id: `${prefix}stash-done`,
      taskId: `${prefix}done`,
    },
    { ...defaultProject, id: `${prefix}project` },
    { ...defaultProjectSection, id: `${prefix}section`, projectId: "project" },
    {
      ...defaultDailyList,
      id: `${prefix}dailyList`,
      date: prefix === "source-" ? "01-10-2026" : "02-10-2026",
    },
    {
      ...defaultChecklistItem,
      id: `${prefix}checklist`,
      parentId: `${prefix}todo`,
    },
  ];
}

const sources = models("source-");
const targets = models("target-");
const rows = [...sources, ...targets];
const tasks = rows.filter((model): model is Task => model.type === "task");

function dropData(model: AnyModel): DropModelData {
  const underlyingTask =
    model.type === "dailyEntry" || model.type === "stashEntry"
      ? tasks.find((task) => task.id === model.taskId)
      : undefined;
  const taskId = model.type === "task" ? model.id : underlyingTask?.id;
  const dailyEntry = rows.find(
    (row) => row.type === "dailyEntry" && row.taskId === taskId,
  );
  return getDropModelData(
    model,
    underlyingTask,
    dailyEntry?.type === "dailyEntry" ? dailyEntry.dailyListId : undefined,
  )!;
}

function createDB() {
  const db = new DB(new BptreeInmemDriver());
  execSync(
    db.loadTables([
      tasksTable,
      taskTemplatesTable,
      dailyEntriesTable,
      stashEntriesTable,
      projectsTable,
      projectSectionsTable,
      dailyListsTable,
      checklistItemsTable,
    ]),
  );
  const seed = createAction()({
    name: "seedDropRules",
    args: {},
    handler: function* () {
      yield* insert(tasksTable, tasks);
      yield* insert(
        taskTemplatesTable,
        rows.filter((model) => model.type === "template"),
      );
      yield* insert(
        dailyEntriesTable,
        rows.filter((model) => model.type === "dailyEntry"),
      );
      yield* insert(
        stashEntriesTable,
        rows.filter((model) => model.type === "stashEntry"),
      );
      yield* insert(
        projectsTable,
        rows.filter((model) => model.type === "project"),
      );
      yield* insert(
        projectSectionsTable,
        rows.filter((model) => model.type === "projectSection"),
      );
      yield* insert(
        dailyListsTable,
        rows.filter((model) => model.type === "dailyList"),
      );
      yield* insert(
        checklistItemsTable,
        rows.filter((model) => model.type === "checklistItem"),
      );
    },
  });
  syncDispatch(db, seed({}));
  return db;
}

const todoSources = ["todo", "daily-todo", "stash-todo"];
const projectSources = [
  "todo",
  "done",
  "template",
  "daily-todo",
  "stash-todo",
  "stash-done",
];
const cases: [string, string[]][] = [
  ["todo", [...todoSources, "template", "checklist"]],
  ["done", []],
  ["template", [...todoSources, "template", "checklist"]],
  ["daily-todo", todoSources],
  ["daily-done", []],
  ["stash-todo", todoSources],
  ["stash-done", []],
  ["project", [...projectSources, "project"]],
  ["section", projectSources],
  ["dailyList", todoSources],
  ["checklist", ["checklist"]],
];

describe("drop eligibility", () => {
  it.each([
    ["dailyList", todoSources],
    [
      "projectSection",
      [...projectSources.filter((name) => name !== "project")],
    ],
  ] as const)(
    "rejects each appearance in its existing %s container",
    (modelType, names) => {
      const db = createDB();
      const target = sources.find((model) => model.type === modelType)!;
      for (const name of names) {
        const source = sources.find((model) => model.id === `source-${name}`)!;
        expect(canDropModel(dropData(source), dropData(target)), name).toBe(
          false,
        );
        expect(
          selectSync(db, {
            selector: appCanDrop,
            args: {
              id: target.id,
              modelType,
              dropId: source.id,
              dropModelType: source.type,
            },
          }),
          name,
        ).toBe(false);
      }
    },
  );

  it.each(["dailyList", "projectSection"] as const)(
    "revalidates membership in %s before removing a stash entry",
    (modelType) => {
      const db = createDB();
      const source = sources[5];
      const target = targets.find((model) => model.type === modelType)!;
      expect(canDropModel(dropData(source), dropData(target))).toBe(true);
      if (modelType === "projectSection") {
        syncDispatch(
          db,
          updateTask({
            id: "source-todo",
            task: { projectSectionId: target.id },
          }),
        );
      } else {
        syncDispatch(
          db,
          updateDailyEntry({
            id: "source-daily-todo",
            entry: { dailyListId: target.id },
          }),
        );
      }
      const beforeTask = selectSync(db, {
        selector: taskById,
        args: { id: "source-todo" },
      });
      const beforeDailyEntry = selectSync(db, {
        selector: dailyEntryByTaskId,
        args: { taskId: "source-todo" },
      });
      const beforeStashEntry = selectSync(db, {
        selector: stashEntryByTaskId,
        args: { taskId: "source-todo" },
      });
      syncDispatch(
        db,
        appHandleDrop({
          id: target.id,
          modelType,
          dropId: source.id,
          dropModelType: source.type,
          edge: "top",
        }),
      );
      expect(
        selectSync(db, { selector: taskById, args: { id: "source-todo" } }),
      ).toEqual(beforeTask);
      expect(
        selectSync(db, {
          selector: dailyEntryByTaskId,
          args: { taskId: "source-todo" },
        }),
      ).toEqual(beforeDailyEntry);
      expect(
        selectSync(db, {
          selector: stashEntryByTaskId,
          args: { taskId: "source-todo" },
        }),
      ).toEqual(beforeStashEntry);
    },
  );

  it.each(cases)(
    "accepts the supported sources for %s in both UI metadata and DB selectors",
    (name, allowed) => {
      const db = createDB();
      const target = targets.find((model) => model.id === `target-${name}`)!;
      for (const source of sources) {
        const expected = allowed.includes(source.id.slice("source-".length));
        expect(
          canDropModel(dropData(source), dropData(target)),
          source.id,
        ).toBe(expected);
        expect(
          selectSync(db, {
            selector: appCanDrop,
            args: {
              id: target.id,
              modelType: target.type,
              dropId: source.id,
              dropModelType: source.type,
            },
          }),
          source.id,
        ).toBe(expected);
      }
    },
  );

  it("keeps stash unwrapping in the app action rather than advertising it in raw item handlers", () => {
    const db = createDB();
    const source = dropData(sources[5]);
    const drop = { dropId: source.modelId, dropModelType: source.modelType };
    expect(
      selectSync(db, {
        selector: taskCanDrop,
        args: { taskId: "target-todo", ...drop },
      }),
    ).toBe(false);
    expect(
      selectSync(db, {
        selector: taskTemplateCanDrop,
        args: { taskTemplateId: "target-template", ...drop },
      }),
    ).toBe(false);
    expect(
      selectSync(db, {
        selector: projectCanDrop,
        args: {
          projectId: "target-project",
          dropItemId: source.modelId,
          dropModelType: source.modelType,
        },
      }),
    ).toBe(false);
    expect(
      selectSync(db, {
        selector: projectSectionCanDrop,
        args: { _projectSectionId: "target-section", ...drop },
      }),
    ).toBe(false);
    expect(
      selectSync(db, {
        selector: appCanDrop,
        args: { id: "target-todo", modelType: "task", ...drop },
      }),
    ).toBe(true);
  });

  it("accepts only todo tasks and entries in the virtual stash", () => {
    const db = createDB();
    const target: DropModelData = { modelId: "stash", modelType: "stash" };
    for (const source of sources) {
      const expected = todoSources.includes(source.id.slice("source-".length));
      expect(canDropModel(dropData(source), target), source.id).toBe(expected);
      expect(
        selectSync(db, {
          selector: appCanDrop,
          args: {
            id: target.modelId,
            modelType: target.modelType,
            dropId: source.id,
            dropModelType: source.type,
          },
        }),
        source.id,
      ).toBe(expected);
    }
  });

  it("rejects self drops, including another appearance of the same task", () => {
    const target = dropData(sources[0]);
    expect(canDropModel(target, target)).toBe(false);
    expect(canDropModel(dropData(sources[3]), target)).toBe(false);
    expect(canDropModel(dropData(sources[5]), target)).toBe(false);
    const checklist = dropData(sources[10]);
    expect(canDropModel(checklist, checklist)).toBe(false);
  });

  it("restricts a checklist container to checklist items", () => {
    const target: DropModelData = {
      ...getDropModelData(task("target-todo")),
      role: "checklist",
    };
    expect(canDropModel(dropData(sources[0]), target)).toBe(false);
    expect(canDropModel(dropData(sources[10]), target)).toBe(true);
    expect(
      canDropModel(dropData(sources[10]), {
        ...getDropModelData(task("target-done", "done")),
        role: "checklist",
      }),
    ).toBe(false);
  });

  it("rejects missing rows and entries whose underlying task is missing", () => {
    const db = createDB();
    const entry = { ...defaultDailyEntry, id: "orphan", taskId: "missing" };
    expect(getDropModelData(entry)).toBeUndefined();
    const seed = createAction()({
      name: "seedOrphanEntry",
      args: {},
      handler: function* () {
        yield* insert(dailyEntriesTable, [entry]);
      },
    });
    syncDispatch(db, seed({}));
    for (const [id, modelType, dropId, dropModelType] of [
      ["target-todo", "task", "orphan", "dailyEntry"],
      ["orphan", "dailyEntry", "source-todo", "task"],
      ["missing", "task", "source-todo", "task"],
      ["target-todo", "task", "missing", "task"],
    ] as const) {
      expect(
        selectSync(db, {
          selector: appCanDrop,
          args: { id, modelType, dropId, dropModelType },
        }),
      ).toBe(false);
    }
  });

  it.each(["source-todo", "target-todo"])(
    "revalidates when %s becomes done during a drag and preserves the stash entry",
    (changedTaskId) => {
      const db = createDB();
      const source = dropData(sources[5]);
      const target = dropData(targets[0]);
      expect(canDropModel(source, target)).toBe(true);
      syncDispatch(
        db,
        updateTask({ id: changedTaskId, task: { state: "done" } }),
      );
      const beforeSource = selectSync(db, {
        selector: taskById,
        args: { id: "source-todo" },
      });
      const beforeTarget = selectSync(db, {
        selector: taskById,
        args: { id: "target-todo" },
      });
      const beforeEntry = selectSync(db, {
        selector: stashEntryByTaskId,
        args: { taskId: "source-todo" },
      });

      syncDispatch(
        db,
        appHandleDrop({
          id: target.modelId,
          modelType: target.modelType,
          dropId: source.modelId,
          dropModelType: source.modelType,
          edge: "top",
        }),
      );

      expect(
        selectSync(db, { selector: taskById, args: { id: "source-todo" } }),
      ).toEqual(beforeSource);
      expect(
        selectSync(db, { selector: taskById, args: { id: "target-todo" } }),
      ).toEqual(beforeTarget);
      expect(
        selectSync(db, {
          selector: stashEntryByTaskId,
          args: { taskId: "source-todo" },
        }),
      ).toEqual(beforeEntry);
    },
  );
});
