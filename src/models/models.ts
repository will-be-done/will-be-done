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
  UndoManager,
  undoMiddleware,
  type ObjectMap,
  type Ref,
} from "mobx-keystone";
import { startOfDay } from "date-fns";
import { getRootStoreOrThrow } from "./utils";
import { generateKeyBetween } from "fractional-indexing";
import { getProjections, getSiblings } from "./listActions";

export const taskRef = rootRef<Task>("TaskRef");
export const projectRef = rootRef<Project>("ProjectRef");
export const projectItemsListRef = rootRef<ProjectItemsList>(
  "ProjectItemsListRef",
);
export const allProjectsListRef =
  rootRef<AllProjectsList>("AllProjectsListRef");
export const dailyListRef = rootRef<DailyList>("DailyListRef");

@model("TaskApp/Project")
export class Project extends Model({
  id: idProp,
  title: prop<string>(() => "").withSetter(),
  icon: prop<string>(() => "").withSetter(),
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

type TaskState = "todo" | "done";
@model("TaskApp/Task")
export class Task extends Model({
  id: idProp,
  title: prop<string>(() => "").withSetter(),
  state: prop<TaskState>(() => "todo").withSetter(),
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
  itemRef: prop<Ref<Project>>().withSetter(),
  orderToken: prop<string>().withSetter(),
  listRef: prop<Ref<AllProjectsList>>().withSetter(),
}) {
  @computed
  get siblings() {
    return getSiblings(this);
  }

  @modelAction
  appendProjectionFromOtherList(sourceProjection: Projection) {}
}

@model("TaskApp/AllProjectsList")
export class AllProjectsList extends Model({
  id: idProp,
}) {
  @computed
  get projections() {
    return getProjections(this, allProjectsListRef, ProjectProjection);
  }

  @computed
  get inbox() {
    const inbox = this.projections.find((p) => p.itemRef.current.isInbox);
    if (!inbox) throw new Error("inbox not found");

    return inbox;
  }

  @computed
  get withoutInbox() {
    return this.projections.filter((p) => !p.itemRef.current.isInbox);
  }

  @computed
  get lastProjection(): ProjectProjection | undefined {
    return this.projections[this.projections.length - 1];
  }

  @modelAction
  addProjectionFromOtherList(
    sourceProjection: Projection,
    targetProjection: Projection,
    edge: "top" | "bottom",
  ) {}

  @modelAction
  appendProjectionFromOtherList(sourceProjection: Projection) {}

  append(projectRef: Ref<Project>) {
    console.log("append", projectRef);
    const projectProjectionRegistry =
      getRootStoreOrThrow(this).projectProjectionRegistry;

    const projection = new ProjectProjection({
      listRef: allProjectsListRef(this),
      itemRef: projectRef,
      orderToken: generateKeyBetween(
        this.lastProjection?.orderToken,
        undefined,
      ),
    });

    projectProjectionRegistry.add(projection);
  }

  // @modelAction
  // createMissingProjections() {
  //   const rootStore = getRootStoreOrThrow(this);
  //
  //   const { projectRegistry } = rootStore;
  //
  //   const projectIds = new Set(this.projections.map((p) => p.projectRef.id));
  // }
}

@model("TaskApp/TaskProjection")
export class TaskProjection extends Model({
  id: idProp,
  itemRef: prop<Ref<Task>>().withSetter(),
  orderToken: prop<string>().withSetter(),
  listRef: prop<Ref<List>>().withSetter(),
}) {
  @computed
  get siblings() {
    return getSiblings(this);
  }
}

@model("TaskApp/ProjectProjectionRegistry")
export class ProjectProjectionRegistry extends Model({
  entities: prop<ObjectMap<ProjectProjection>>(() => objectMap()),
}) {
  @modelAction
  public add(proj: ProjectProjection) {
    this.entities.set(proj.id, proj);
  }

  get(id: string) {
    return this.entities.get(id);
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
    sourceProjection.listRef = dailyListRef(this);
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

    if (targetProjection.listRef.current !== this) {
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
    sourceProjection.listRef = dailyListRef(this);
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

@model("TaskApp/ProjectItemsList")
export class ProjectItemsList extends Model({
  id: idProp,
  projectRef: prop<Ref<Project>>().withSetter(),
}) {
  @computed
  get projections() {
    return getProjections(this, projectItemsListRef, TaskProjection);
  }

  @computed
  get todoTasks() {
    return this.projections.filter((p) => p.itemRef.current.state === "todo");
  }

  @modelAction
  addProjectionFromOtherList(
    sourceProjection: Projection,
    targetProjection: Projection,
    edge: "top" | "bottom",
  ) {}

  @modelAction
  appendProjectionFromOtherList(sourceProjection: Projection) {}

  @computed
  get lastProjection() {
    return this.projections[this.projections.length - 1];
  }

  append(taskRef: Ref<Task>) {
    const registry = getRootStoreOrThrow(this).taskProjectionRegistry;

    const projection = new TaskProjection({
      listRef: projectItemsListRef(this),
      itemRef: taskRef,
      orderToken: generateKeyBetween(
        this.lastProjection?.orderToken,
        undefined,
      ),
    });

    registry.add(projection);
  }
}

@model("TaskApp/ProjectItemsListRegistry")
export class ProjectItemsListRegistry extends Model({
  entities: prop<ObjectMap<ProjectItemsList>>(() => objectMap()),
}) {
  @computed
  get all() {
    return [...this.entities.values()];
  }

  getList(id: string) {
    return this.entities.get(id);
  }

  getListByProjectId(projectId: string) {
    for (const list of this.all) {
      if (list.projectRef.id === projectId) {
        return list;
      }
    }

    return undefined;
  }
}

export type List = DailyList | ProjectItemsList | AllProjectsList;

@model("TaskApp/RootStore")
export class RootStore extends Model({
  allProjectsList: prop<AllProjectsList>(() => new AllProjectsList({})),
  projectRegistry: prop<ProjectRegistry>(() => new ProjectRegistry({})),
  taskRegistry: prop<TaskRegistry>(() => new TaskRegistry({})),
  projectProjectionRegistry: prop<ProjectProjectionRegistry>(
    () => new ProjectProjectionRegistry({}),
  ),
  taskProjectionRegistry: prop<TaskProjectionRegistry>(
    () => new TaskProjectionRegistry({}),
  ),
  dailyListRegisry: prop<DailyListRegistry>(() => new DailyListRegistry({})),
  projectItemsListRegisry: prop<ProjectItemsListRegistry>(
    () => new ProjectItemsListRegistry({}),
  ),
  tasksService: prop<TasksService>(() => new TasksService({})),
  listsService: prop<ListsService>(() => new ListsService({})),
  projectionsService: prop<ProjectionsService>(
    () => new ProjectionsService({}),
  ),
  projectsService: prop<ProjectsService>(() => new ProjectsService({})),
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
    const { taskRegistry, taskProjectionRegistry, projectItemsListRegisry } =
      getRootStoreOrThrow(this);

    const task = new Task({
      projectRef: projectRef(project),
    });
    taskRegistry.add(task);

    const projection = new TaskProjection({
      listRef: list,
      itemRef: taskRef(task),
      orderToken: generateKeyBetween(
        between?.[0]?.orderToken,
        between?.[1]?.orderToken,
      ),
    });
    taskProjectionRegistry.add(projection);

    const projectList = projectItemsListRegisry.getListByProjectId(project.id);

    if (!projectList) {
      console.warn("No project list found for project", project.id);
    }

    if (projectList && projectList.id !== list.id) {
      projectList.append(taskRef(task));
    }

    return [task, projection] as const;
  }
}
@model("TaskApp/ProjectsService")
export class ProjectsService extends Model({}) {
  @modelAction
  createProject(title: string, icon: string, isInbox: boolean) {
    const rootStore = getRootStoreOrThrow(this);
    const { projectRegistry, allProjectsList, projectItemsListRegisry } =
      rootStore;

    const pr = new Project({
      title,
      icon: icon,
      isInbox: isInbox,
    });
    projectRegistry.entities.set(pr.id, pr);

    const projectItemsList = new ProjectItemsList({
      projectRef: projectRef(pr),
    });
    projectItemsListRegisry.entities.set(pr.id, projectItemsList);

    allProjectsList.append(projectRef(pr));
  }
}

@model("TaskApp/ProjectionsService")
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
    const { dailyListRegisry, projectItemsListRegisry: projectListRegisry } =
      rootStore;

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

  const projects = [
    { id: "inbox", name: "Inbox", icon: "" },
    { id: "1", name: "Прочее", icon: "⭕" },
    { id: "2", name: "Положить в корзину", icon: "🗑️" },
    { id: "3", name: "Напомнить Алине", icon: "🔵" },
    { id: "4", name: "Джедайство", icon: "😎" },
    { id: "5", name: "Психология", icon: "💊" },
    { id: "6", name: "Финансы", icon: "💸" },
    { id: "7", name: "По дому", icon: "🏠" },
    { id: "8", name: "Проекты", icon: "⏳" },
    { id: "9", name: "Найм", icon: "💼" },
    { id: "10", name: "DX", icon: "❤️" },
    { id: "11", name: "Dev Learning", icon: "👨‍💻" },
    { id: "12", name: "Перенести в obsidian/идеи", icon: "💎" },
    { id: "13", name: "Здоровье", icon: "🏥" },
    { id: "14", name: "Идеи", icon: "💡" },
  ];

  for (const project of projects) {
    let projectFound = false;

    console.log("checking project", project);
    for (const pr of rootStore.projectRegistry.entities.values()) {
      if (pr.title === project.name) {
        projectFound = true;
        // break;
      }
    }

    if (projectFound) {
      continue;
    }

    rootStore.projectsService.createProject(
      project.name,
      project.icon,
      project.id === "inbox",
    );
  }
  console.log("2");

  reaction(
    () => getSnapshot(rootStore),
    (sn) => {
      localStorage.setItem("state", JSON.stringify(sn));
    },
    {
      fireImmediately: true,
    },
  );

  currentRootStore = rootStore;
  return rootStore;
};

let undoManager: UndoManager | undefined = undefined;

export const getUndoManager = () => {
  if (undoManager) return undoManager;

  const rootStore = getRootStore();
  undoManager = undoMiddleware(rootStore);

  return undoManager;
};
