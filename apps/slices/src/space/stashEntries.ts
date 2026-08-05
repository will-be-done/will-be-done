import { shouldNeverHappen } from "../utils";
import {
  deleteRows,
  insert,
  selectFrom,
  upsert as upsertRows,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { generateKeyPositionedBetween } from "./utils";
import { registerModelSlice } from "./maps";
import { appById } from "./app";
import { createProjectTask } from "./projects";
import {
  createTaskNextToSectionItem,
  projectSectionItemsForDisplay,
  type ItemForDisplay,
} from "./projectSectionItems";
import { deleteDailyEntries } from "./dailyEntries";
import { taskById, taskByIdOrDefault } from "./tasks";
import { orderPositionArg } from "./utils";
import {
  stashEntryType,
  stashEntriesTable,
  tasksTable,
  possibleModelType,
  isStashEntry,
  type StashEntry,
  Task,
  isTask,
  isDailyEntry,
} from "./tables";

export const defaultStashEntry: StashEntry = {
  type: stashEntryType,
  id: "default-stash-entry-id",
  orderToken: "",
  createdAt: 0,
};

// Selectors and actions
export const stashEntryAllIds = selector({
  name: "stashEntryAllIds",
  args: {},
  handler: function* stashEntryAllIds() {
    const entries = yield* selectFrom(stashEntriesTable, "byIds").where(
      (q) => q,
    );
    return entries.map((p) => p.id);
  },
});

export const stashEntryAllTaskIds = selector({
  name: "stashEntryAllTaskIds",
  args: {},
  handler: function* stashEntryAllTaskIds() {
    return new Set(yield* stashEntryAllIds({}));
  },
});

export const stashEntryById = selector({
  name: "stashEntryById",
  args: { id: v.string() },
  handler: function* stashEntryById({ id }) {
    const entries = yield* selectFrom(stashEntriesTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return entries[0] as StashEntry | undefined;
  },
});

export const stashEntriesByIds = selector({
  name: "stashEntriesByIds",
  args: { ids: v.array(v.string()) },
  handler: function* stashEntriesByIds({ ids }) {
    const entries = yield* selectFrom(stashEntriesTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    );
    return entries as StashEntry[];
  },
});

export const stashEntryByIdOrDefault = selector({
  name: "stashEntryByIdOrDefault",
  args: { id: v.string() },
  handler: function* stashEntryByIdOrDefault({ id }) {
    return (yield* stashEntryById({ id })) || defaultStashEntry;
  },
});

// Get all stash entries ordered by token
export const allStashEntriesOrdered = selector({
  name: "allStashEntriesOrdered",
  args: {},
  handler: function* allStashEntriesOrdered() {
    return (yield* selectFrom(stashEntriesTable, "byTokenOrdered").where(
      (q) => q,
    )) as StashEntry[];
  },
});

// Check if a task is in the stash
export const stashHasEntry = selector({
  name: "stashHasEntry",
  args: { taskId: v.string() },
  handler: function* stashHasEntry({ taskId }) {
    const entry = yield* stashEntryById({ id: taskId });
    return entry !== undefined;
  },
});

export const stashTasksByState = selector({
  name: "stashTasksByState",
  args: {
    state: v.union(v.literal("todo"), v.literal("done")),
  },
  handler: function* stashTasksByState({
    state,
  }): Generator<unknown, Task[], unknown> {
    const entries = yield* allStashEntriesOrdered({});
    if (entries.length === 0) return [];

    const tasks = (yield* selectFrom(tasksTable, "byId").where((q) =>
      entries.map((entry) => q.eq("id", entry.id)),
    )) as Task[];
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const matchingTasks = entries
      .map((entry) => taskById.get(entry.id))
      .filter((task): task is Task => task?.state === state);

    if (state === "done") {
      matchingTasks.sort(
        (left, right) =>
          right.lastToggledAt - left.lastToggledAt ||
          left.id.localeCompare(right.id),
      );
    }

    return matchingTasks;
  },
});

// Get all task ids in stash (non-done, ordered)
export const stashEntryChildrenIds = selector({
  name: "stashEntryChildrenIds",
  args: {},
  handler: function* stashEntryChildrenIds(): Generator<
    unknown,
    string[],
    unknown
  > {
    return (yield* stashTasksByState({ state: "todo" })).map((task) => task.id);
  },
});

export const stashEntryChildrenForDisplay = selector({
  name: "stashEntryChildrenForDisplay",
  args: {},
  handler: function* stashEntryChildrenForDisplay(): Generator<
    unknown,
    ItemForDisplay[],
    unknown
  > {
    const entries = yield* allStashEntriesOrdered({});
    const entryIds = entries.map((entry) => entry.id);
    const tasks = entryIds.length
      ? yield* selectFrom(tasksTable, "byId").where((q) =>
          entryIds.map((id) => q.eq("id", id)),
        )
      : [];
    const taskMap = new Map((tasks as Task[]).map((task) => [task.id, task]));

    const items: Task[] = [];
    const listItems: StashEntry[] = [];
    for (const entry of entries) {
      const task = taskMap.get(entry.id);
      if (task && task.state === "todo") {
        items.push(task);
        listItems.push(entry);
      }
    }

    return yield* projectSectionItemsForDisplay({ items, listItems });
  },
});

// Get all done task ids in stash (sorted by lastToggledAt)
export const doneStashEntryChildrenIds = selector({
  name: "doneStashEntryChildrenIds",
  args: {},
  handler: function* doneStashEntryChildrenIds(): Generator<
    unknown,
    string[],
    unknown
  > {
    return (yield* stashTasksByState({ state: "done" })).map((task) => task.id);
  },
});

export const doneStashEntryChildrenForDisplay = selector({
  name: "doneStashEntryChildrenForDisplay",
  args: {},
  handler: function* doneStashEntryChildrenForDisplay(): Generator<
    unknown,
    ItemForDisplay[],
    unknown
  > {
    const entries = yield* allStashEntriesOrdered({});
    const entryIds = entries.map((entry) => entry.id);
    const tasks = entryIds.length
      ? yield* selectFrom(tasksTable, "byId").where((q) =>
          entryIds.map((id) => q.eq("id", id)),
        )
      : [];
    const taskMap = new Map((tasks as Task[]).map((task) => [task.id, task]));

    const itemsWithEntries: {
      item: Task;
      listItem: StashEntry;
    }[] = [];
    for (const entry of entries) {
      const task = taskMap.get(entry.id);
      if (task && task.state === "done") {
        itemsWithEntries.push({ item: task, listItem: entry });
      }
    }

    itemsWithEntries.sort(
      (a, b) =>
        b.item.lastToggledAt - a.item.lastToggledAt ||
        a.item.id.localeCompare(b.item.id),
    );

    return yield* projectSectionItemsForDisplay({
      items: itemsWithEntries.map(({ item }) => item),
      listItems: itemsWithEntries.map(({ listItem }) => listItem),
    });
  },
});

// Get first task in stash
export const firstStashEntryChild = selector({
  name: "firstStashEntryChild",
  args: {},
  handler: function* firstStashEntryChild(): Generator<
    unknown,
    Task | undefined,
    unknown
  > {
    const ids = yield* stashEntryChildrenIds({});
    const firstChildId = ids[0];
    return firstChildId
      ? yield* taskById({ id: firstChildId })
      : (undefined as Task | undefined);
  },
});

// Get last task in stash
export const lastStashEntryChild = selector({
  name: "lastStashEntryChild",
  args: {},
  handler: function* lastStashEntryChild(): Generator<
    unknown,
    Task | undefined,
    unknown
  > {
    const ids = yield* stashEntryChildrenIds({});
    const lastChildId = ids[ids.length - 1];
    return lastChildId
      ? yield* taskById({ id: lastChildId })
      : (undefined as Task | undefined);
  },
});

// Get siblings of a task within the stash
export const stashEntrySiblings = selector({
  name: "stashEntrySiblings",
  args: { taskId: v.string() },
  handler: function* stashEntrySiblings({ taskId }) {
    const entry = yield* stashEntryById({ id: taskId });
    if (!entry)
      return [undefined, undefined] as [
        StashEntry | undefined,
        StashEntry | undefined,
      ];

    const sortedEntries = yield* allStashEntriesOrdered({});

    const index = sortedEntries.findIndex((p) => p.id === taskId);

    const before = index > 0 ? sortedEntries[index - 1] : undefined;
    const after =
      index < sortedEntries.length - 1 ? sortedEntries[index + 1] : undefined;

    return [before, after] as [StashEntry | undefined, StashEntry | undefined];
  },
});

// Check if a stash entry can accept another model being dropped
export const stashEntryCanDrop = selector({
  name: "stashEntryCanDrop",
  args: {
    entryId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* stashEntryCanDrop({
    entryId,
    dropId,
    dropModelType,
  }): Generator<unknown, boolean, unknown> {
    const model = yield* appById({ id: dropId, modelType: dropModelType });
    if (!model) return false;

    const entry = yield* stashEntryById({ id: entryId });
    if (!entry) return false;

    const task = yield* taskById({ id: entry.id });
    if (!task) return false;

    // Only allow dropping todo tasks
    if (task.state === "done") return false;

    // Check if dropping a task directly
    if (isTask(model)) {
      return model.state === "todo";
    }

    // Check if dropping a entry (task in daily list)
    if (isDailyEntry(model)) {
      const droppedTask = yield* taskById({ id: model.id });
      return droppedTask !== undefined && droppedTask.state === "todo";
    }

    // Check if dropping a stash entry
    if (isStashEntry(model)) {
      const droppedTask = yield* taskById({ id: model.id });
      return droppedTask !== undefined && droppedTask.state === "todo";
    }

    return false;
  },
});

// Handle drop operations
export const stashEntryHandleDrop = action({
  name: "stashEntryHandleDrop",
  args: {
    entryId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* stashEntryHandleDrop({
    entryId,
    dropId,
    dropModelType,
    edge,
  }): Generator<unknown, void, unknown> {
    const canDropResult = yield* stashEntryCanDrop({
      entryId,
      dropId,
      dropModelType,
    });
    if (!canDropResult) return;

    const entry = yield* stashEntryById({ id: entryId });
    if (!entry) return;

    const dropItem = yield* appById({ id: dropId, modelType: dropModelType });
    if (!dropItem) return;

    const [up, down] = yield* stashEntrySiblings({
      taskId: entry.id,
    });

    let between: [string | undefined, string | undefined] = [
      entry.orderToken,
      down?.orderToken,
    ];

    if (edge === "top") {
      between = [up?.orderToken, entry.orderToken];
    }

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    if (isTask(dropItem)) {
      yield* upsertStashEntry({
        entry: {
          id: dropItem.id,
          orderToken,
        },
      });
    } else if (isDailyEntry(dropItem)) {
      yield* upsertStashEntry({
        entry: {
          id: dropItem.id,
          orderToken,
        },
      });
      yield* deleteDailyEntries({ ids: [dropItem.id] });
    } else if (isStashEntry(dropItem)) {
      yield* upsertStashEntry({
        entry: {
          id: dropItem.id,
          orderToken,
        },
      });
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  },
});

export const deleteStashEntries = action({
  name: "deleteStashEntries",
  args: { ids: v.array(v.string()) },
  handler: function* deleteStashEntries({ ids }) {
    yield* deleteRows(stashEntriesTable, ids);
  },
});

export const createStashEntry = action({
  name: "createStashEntry",
  args: {
    entry: v.required(v.partial(stashEntriesTable.v()), ["id", "orderToken"]),
  },
  handler: function* createStashEntry({ entry }) {
    const newEntry: StashEntry = {
      type: stashEntryType,
      id: entry.id,
      orderToken: entry.orderToken,
      createdAt: Date.now(),
    };

    yield* insert(stashEntriesTable, [newEntry]);
    return newEntry;
  },
});

export const updateStashEntry = action({
  name: "updateStashEntry",
  args: {
    id: v.string(),
    entry: v.partial(stashEntriesTable.v()),
  },
  handler: function* updateStashEntry({
    id,
    entry,
  }): Generator<unknown, void, unknown> {
    const entryInState = yield* stashEntryById({ id });
    if (!entryInState) throw new Error("Stash entry not found");

    yield* upsertRows(stashEntriesTable, [{ ...entryInState, ...entry }]);
  },
});

// Create or update stash entry for a task
export const upsertStashEntry = action({
  name: "upsertStashEntry",
  args: {
    entry: v.required(v.partial(stashEntriesTable.v()), ["id", "orderToken"]),
  },
  handler: function* upsertStashEntry({ entry }) {
    const existing = yield* stashEntryById({ id: entry.id });

    if (existing) {
      yield* updateStashEntry({
        id: entry.id,
        entry: {
          orderToken: entry.orderToken,
        },
      });
      return yield* stashEntryByIdOrDefault({ id: entry.id });
    }

    return yield* createStashEntry({ entry });
  },
});

// Create a sibling task in the stash
export const createStashEntrySibling = action({
  name: "createStashEntrySibling",
  args: {
    taskId: v.string(),
    position: v.union(v.literal("before"), v.literal("after")),
    taskParams: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createStashEntrySibling({ taskId, position, taskParams }) {
    const task = yield* taskById({ id: taskId });
    if (!task) throw new Error("Task not found");

    const entry = yield* stashEntryById({ id: taskId });
    if (!entry) throw new Error("Task not in stash");

    // Create task in project first
    const newTask = yield* createTaskNextToSectionItem({
      itemId: taskId,
      position,
      taskParams,
    });

    // Add to stash with proper ordering
    const sibs = yield* stashEntrySiblings({ taskId });
    const stashOrderToken = generateKeyPositionedBetween(entry, sibs, position);

    return yield* createStashEntry({
      entry: {
        id: newTask.id,
        orderToken: stashOrderToken,
      },
    });
  },
});

// Remove task from stash
export const removeFromStash = action({
  name: "removeFromStash",
  args: { taskId: v.string() },
  handler: function* removeFromStash({ taskId }) {
    yield* deleteStashEntries({ ids: [taskId] });
  },
});

// Add task to stash
export const addToStash = action({
  name: "addToStash",
  args: {
    taskId: v.string(),
    position: orderPositionArg,
  },
  handler: function* addToStash({
    taskId,
    position,
  }): Generator<unknown, void, unknown> {
    const task = yield* taskById({ id: taskId });
    if (!task) throw new Error("Task not found");

    let orderToken: string;

    if (position === "append") {
      const entries = yield* allStashEntriesOrdered({});
      const lastToken =
        entries.length > 0 ? entries[entries.length - 1].orderToken : null;
      orderToken = generateJitteredKeyBetween(lastToken, null);
    } else if (position === "prepend") {
      const entries = yield* allStashEntriesOrdered({});
      const firstToken = entries.length > 0 ? entries[0].orderToken : null;
      orderToken = generateJitteredKeyBetween(null, firstToken);
    } else {
      const siblings = [position[0] ?? undefined, position[1] ?? undefined] as [
        StashEntry | undefined,
        StashEntry | undefined,
      ];
      orderToken = generateJitteredKeyBetween(
        siblings[0]?.orderToken || null,
        siblings[1]?.orderToken || null,
      );
    }

    yield* upsertStashEntry({
      entry: {
        id: taskId,
        orderToken,
      },
    });
  },
});

registerModelSlice(
  {
    byId: stashEntryById,
    delete: deleteStashEntries,
    canDrop: stashEntryCanDrop,
    handleDrop: stashEntryHandleDrop,
  },
  stashEntriesTable,
  stashEntryType,
);

// --- Column-level "stash" model type ---
// Used as columnModelType in TasksColumn for dropping onto the stash column header.
// No separate table/entity needed — the stash is a singleton concept.

export const stashType = "stash" as const;
export const STASH_ID = "stash-singleton";

// Column-level canDrop: any todo task/entry can be dropped onto the stash column
const stashColumnCanDrop = selector({
  name: "stashColumnCanDrop",
  args: {
    _stashId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* stashColumnCanDrop({
    _stashId,
    dropId,
    dropModelType,
  }): Generator<unknown, boolean, unknown> {
    const model = yield* appById({ id: dropId, modelType: dropModelType });
    if (!model) return false;

    if (isTask(model)) {
      return model.state === "todo";
    }

    if (isDailyEntry(model)) {
      const task = yield* taskById({ id: model.id });
      return task !== undefined && task.state === "todo";
    }

    if (isStashEntry(model)) {
      const task = yield* taskById({ id: model.id });
      return task !== undefined && task.state === "todo";
    }

    return false;
  },
});

// Column-level handleDrop: add dropped task to stash (prepend/append based on edge)
const stashColumnHandleDrop = action({
  name: "stashColumnHandleDrop",
  args: {
    _stashId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* stashColumnHandleDrop({
    _stashId,
    dropId,
    dropModelType,
    edge,
  }): Generator<unknown, void, unknown> {
    const drop = yield* appById({ id: dropId, modelType: dropModelType });
    if (!drop) return;

    let taskId: string;
    let shouldDeleteEntry = false;
    if (isTask(drop)) {
      taskId = drop.id;
    } else if (isDailyEntry(drop)) {
      taskId = drop.id;
      shouldDeleteEntry = true;
    } else if (isStashEntry(drop)) {
      taskId = drop.id;
    } else {
      return;
    }

    yield* addToStash({
      taskId,
      position: edge === "top" ? "prepend" : "append",
    });

    if (shouldDeleteEntry) {
      yield* deleteDailyEntries({ ids: [taskId] });
    }
  },
});

// Column-level byId: returns the stash entry if it exists, for the column model lookup
const stashColumnById = selector({
  name: "stashColumnById",
  args: { _id: v.string() },
  handler: function* stashColumnById({ _id }) {
    return undefined as StashEntry | undefined;
  },
});

const stashColumnDelete = action({
  name: "stashColumnDelete",
  args: { _ids: v.array(v.string()) },
  handler: function* stashColumnDelete({ _ids }) {
    // No-op: stash is a virtual singleton, nothing to delete
  },
});

// Create a task directly in the stash
export const createTaskInStash = action({
  name: "createTaskInStash",
  args: {
    projectId: v.string(),
    position: orderPositionArg,
    sectionPosition: orderPositionArg,
    taskAttrs: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createTaskInStash({
    projectId,
    position,
    sectionPosition,
    taskAttrs,
  }): Generator<unknown, Task, unknown> {
    const task = yield* createProjectTask({
      projectId,
      position: sectionPosition,
      taskAttrs,
    });

    yield* addToStash({
      taskId: task.id,
      position,
    });

    return yield* taskByIdOrDefault({ id: task.id });
  },
});

registerModelSlice(
  {
    byId: stashColumnById,
    delete: stashColumnDelete,
    canDrop: stashColumnCanDrop,
    handleDrop: stashColumnHandleDrop,
  },
  stashEntriesTable,
  stashType,
);
