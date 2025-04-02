import { computed, reaction } from "mobx";
import {
  applySnapshot,
  getSnapshot,
  idProp,
  Model,
  model,
  modelAction,
  objectMap,
  prop,
  registerRootStore,
  rootRef,
  SnapshotOutOfModel,
  timestampToDateTransform,
  type ObjectMap,
  type Ref,
} from "mobx-keystone";
import { startOfDay } from "date-fns";
import { getRootStoreOrThrow } from "./utils";
import { generateKeyBetween } from "fractional-indexing";
import { getProjections, getSiblings } from "./listActions";

export const taskRef = rootRef<Task>("TaskRef");
export const projectRef = rootRef<Project>("ProjectRef");
export const projectListRef = rootRef<ProjectList>("ProjectListRef");
export const sidebarListRef = rootRef<SidebarList>("SidebarListRef");
export const dailyListRef = rootRef<DailyList>("DailyListRef");

@model("TaskApp/Project")
export class Project extends Model({
  id: idProp,
  title: prop<string>(() => "").withSetter(),
  isInbox: prop<boolean>().withSetter(),
}) {}

@model("TaskApp/ProjectRegistry")
export class ProjectRegistry extends Model({
  entities: prop<ObjectMap<Project>>(() => objectMap()),
}) {
  @computed
  get inboxProjectOrThrow() {
    for (const project of this.entities.values()) {
      if (project.isInbox) return project;
    }

    throw new Error("inbox project not found");
  }
}

@model("TaskApp/Task")
export class Task extends Model({
  id: idProp,
  title: prop<string>(() => "").withSetter(),
  projectRef: prop<Ref<Project>>().withSetter(),
}) {}

@model("TaskApp/TaskRegistry")
export class TaskRegistry extends Model({
  entities: prop<ObjectMap<Task>>(() => objectMap()),
}) {
  @modelAction
  public add(task: Task) {
    this.entities.set(task.id, task);
  }
}

@model("TaskApp/ProjectProjection")
export class ProjectProjection extends Model({
  id: idProp,
  projectRef: prop<Ref<Project>>().withSetter(),
  orderToken: prop<string>().withSetter(),
  list: prop<Ref<SidebarList>>().withSetter(),
}) {
  @computed
  get siblings() {
    return getSiblings(this);
  }

  @modelAction
  appendProjectionFromOtherList(sourceProjection: Projection) {}
}

@model("TaskApp/SidebarLis")
export class SidebarList extends Model({
  id: idProp,
}) {
  @computed
  get projections() {
    return getProjections(this, sidebarListRef, ProjectProjection);
  }

  @modelAction
  addProjectionFromOtherList(
    sourceProjection: Projection,
    targetProjection: Projection,
    edge: "top" | "bottom",
  ) {}

  @modelAction
  appendProjectionFromOtherList(sourceProjection: Projection) {}
}

@model("TaskApp/TaskProjection")
export class TaskProjection extends Model({
  id: idProp,
  taskRef: prop<Ref<Task>>().withSetter(),
  orderToken: prop<string>().withSetter(),
  list: prop<Ref<List>>().withSetter(),
}) {
  @computed
  get siblings() {
    return getSiblings(this);
  }
}

@model("TaskApp/TaskProjectionRegistry")
export class TaskProjectionRegistry extends Model({
  entities: prop<ObjectMap<TaskProjection>>(() => objectMap()),
}) {
  @modelAction
  public add(proj: TaskProjection) {
    this.entities.set(proj.id, proj);
  }

  get(id: string) {
    return this.entities.get(id);
  }
}

export type Projection = TaskProjection | ProjectProjection;

@model("TaskApp/DailyList")
export class DailyList extends Model({
  id: idProp,
  date: prop<number>().withTransform(timestampToDateTransform()).withSetter(),
}) {
  @computed
  get projections() {
    return getProjections(this, dailyListRef, TaskProjection);
  }

  @computed
  get lastProjection() {
    return this.projections[this.projections.length - 1];
  }

  @computed
  get isToday() {
    return (
      startOfDay(new Date(this.date)).getDate() ==
      startOfDay(new Date()).getDate()
    );
  }

  @modelAction
  appendProjectionFromOtherList(sourceProjection: Projection) {
    const lastProjection = this.lastProjection;

    const newOrderToken = generateKeyBetween(
      lastProjection?.orderToken,
      undefined,
    );

    sourceProjection.orderToken = newOrderToken;
    sourceProjection.list = dailyListRef(this);
  }

  @modelAction
  addProjectionFromOtherList(
    sourceProjection: Projection,
    targetProjection: Projection,
    edge: "top" | "bottom",
  ) {
    if (!(targetProjection instanceof TaskProjection)) {
      throw new Error("Target projection is not task");
    }

    if (targetProjection.list.current !== this) {
      throw new Error("Target projection is not in this daily list");
    }

    let [up, down] = targetProjection.siblings;

    if (edge == "top") {
      down = targetProjection;
    } else {
      up = targetProjection;
    }

    const newOrderToken = generateKeyBetween(up?.orderToken, down?.orderToken);
    sourceProjection.orderToken = newOrderToken;
    sourceProjection.list = dailyListRef(this);
  }
}

@model("TaskApp/DailyListRegistry")
export class DailyListRegistry extends Model({
  entities: prop<ObjectMap<DailyList>>(() => objectMap()),
}) {
  @computed
  get all() {
    return [...this.entities.values()];
  }

  getList(id: string) {
    return this.entities.get(id);
  }

  getDailyListByDate(date: Date) {
    for (const dailyList of this.entities.values()) {
      if (
        startOfDay(new Date(dailyList.date)).getTime() ===
        startOfDay(date).getTime()
      ) {
        return dailyList;
      }
    }
  }

  getDailyListByDates(dates: Date[]) {
    return dates
      .map((date) => this.getDailyListByDate(date))
      .filter((d) => d !== undefined);
  }

  @modelAction
  createDailyListIfNotPresent(date: Date) {
    const dailyList = this.getDailyListByDate(date);

    if (!dailyList) {
      const newList = new DailyList({ date: new Date(date) });

      this.entities.set(newList.id, newList);
      console.log("created", newList);

      return newList;
    } else {
      return dailyList;
    }
  }

  @modelAction
  createDailyListsIfNotExists(days: Date[]) {
    return days.map((day) => this.createDailyListIfNotPresent(day));
  }
}

@model("TaskApp/ProjectList")
export class ProjectList extends Model({
  id: idProp,
  projectRef: prop<Ref<Project>>().withSetter(),
}) {
  @computed
  get projections() {
    return getProjections(this, projectListRef, TaskProjection);
  }

  @modelAction
  addProjectionFromOtherList(
    sourceProjection: Projection,
    targetProjection: Projection,
    edge: "top" | "bottom",
  ) {}

  @modelAction
  appendProjectionFromOtherList(sourceProjection: Projection) {}
}

@model("TaskApp/ProjectListRegistry")
export class ProjectListRegistry extends Model({
  entities: prop<ObjectMap<ProjectList>>(() => objectMap()),
}) {
  @computed
  get all() {
    return [...this.entities.values()];
  }

  getList(id: string) {
    return this.entities.get(id);
  }
}

export type List = DailyList | ProjectList | SidebarList;

@model("TaskApp/RootStore")
export class RootStore extends Model({
  projectRegistry: prop<ProjectRegistry>(() => new ProjectRegistry({})),
  taskRegistry: prop<TaskRegistry>(() => new TaskRegistry({})),
  taskProjectionRegistry: prop<TaskProjectionRegistry>(
    () => new TaskProjectionRegistry({}),
  ),
  dailyListRegisry: prop<DailyListRegistry>(() => new DailyListRegistry({})),
  projectListRegisry: prop<ProjectListRegistry>(
    () => new ProjectListRegistry({}),
  ),
  tasksService: prop<TasksService>(() => new TasksService({})),
  listsService: prop<ListsService>(() => new ListsService({})),
  projectionsService: prop<ProjectionsService>(
    () => new ProjectionsService({}),
  ),
}) {
  @modelAction
  createProject(title: string) {
    const project = new Project({ title, isInbox: true });
    this.projectRegistry.entities.set(project.id, project);
  }
}

@model("TaskApp/TasksService")
export class TasksService extends Model({}) {
  @modelAction
  createTask(
    project: Project,
    list: Ref<List>,
    between:
      | [TaskProjection | undefined, TaskProjection | undefined]
      | undefined,
  ) {
    const rootStore = getRootStoreOrThrow(this);
    const task = new Task({
      projectRef: projectRef(project),
    });
    rootStore.taskRegistry.add(task);

    const projection = new TaskProjection({
      list: list,
      taskRef: taskRef(task),
      orderToken: generateKeyBetween(
        between?.[0]?.orderToken,
        between?.[1]?.orderToken,
      ),
    });
    rootStore.taskProjectionRegistry.add(projection);

    return [task, projection] as const;
  }
}

@model("TaskApp/ListsService")
export class ProjectionsService extends Model({}) {
  findProjection(projId: string) {
    const rootStore = getRootStoreOrThrow(this);
    const { taskProjectionRegistry } = rootStore;

    const registries: { get: (id: string) => Projection | undefined }[] = [
      taskProjectionRegistry,
    ];

    for (const registry of registries) {
      const list = registry.get(projId);
      if (list) {
        return list;
      }
    }

    return undefined;
  }

  findProjectionOrThrow(projId: string) {
    const list = this.findProjection(projId);
    if (!list) {
      throw new Error("projection not found: " + projId);
    }

    return list;
  }
}

@model("TaskApp/ListsService")
export class ListsService extends Model({}) {
  findList(listId: string) {
    const rootStore = getRootStoreOrThrow(this);
    const { dailyListRegisry, projectListRegisry } = rootStore;

    const registries: { getList: (listId: string) => List | undefined }[] = [
      dailyListRegisry,
      projectListRegisry,
    ];

    for (const registry of registries) {
      const list = registry.getList(listId);
      if (list) {
        return list;
      }
    }

    return undefined;
  }

  findListOrThrow(listId: string) {
    const list = this.findList(listId);
    if (!list) {
      throw new Error("list not found: " + listId);
    }

    return list;
  }

  @modelAction
  moveToEdge(
    sourceProjection: Projection,
    targetProjection: Projection,
    edge: "top" | "bottom",
  ) {
    const list = sourceProjection.list.current;
    const [up, down] = targetProjection.siblings;
  }
}

let currentRootStore: RootStore | undefined;
export const getRootStore = () => {
  if (currentRootStore) return currentRootStore;

  const rootStore = new RootStore({});

  const stateObj = JSON.parse(
    localStorage.getItem("state") || "{}",
  ) as SnapshotOutOfModel<RootStore>;
  applySnapshot(rootStore, stateObj);

  registerRootStore(rootStore);

  void (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    if ((window as any).__REDUX_DEVTOOLS_EXTENSION__) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      await (
        await import("./connectReduxDevtool")
      ).connect(rootStore, `TODO Store`);
    }
  })();

  currentRootStore = rootStore;

  const inboxProject = new Project({ title: "Inbox", isInbox: true });
  rootStore.projectRegistry.entities.set(inboxProject.id, inboxProject);

  reaction(
    () => getSnapshot(rootStore),
    (sn) => {
      localStorage.setItem("state", JSON.stringify(sn));
    },
    {
      fireImmediately: true,
    },
  );

  return rootStore;
};
