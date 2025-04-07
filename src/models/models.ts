import { autorun, computed, reaction } from "mobx";
import {
  applySnapshot,
  clone,
  detach,
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
import {
  type BaseListItem,
  getChildren,
  getSiblings,
  type ItemsList,
  ItemsListsRegistry,
  ListItemsRegistry,
  OrderableItem,
} from "./listActions";

export const taskRef = rootRef<Task>("TaskRef");
export const projectRef = rootRef<Project>("ProjectRef");
export const allProjectsListRef =
  rootRef<AllProjectsList>("AllProjectsListRef");
export const dailyListRef = rootRef<DailyList>("DailyListRef");

@model("TaskApp/Project")
export class Project
  extends Model({
    id: idProp,
    title: prop<string>(() => "").withSetter(),
    icon: prop<string>(() => "").withSetter(),
    isInbox: prop<boolean>(() => false).withSetter(),
    orderToken: prop<string>().withSetter(),
    listRef: prop<Ref<AllProjectsList>>().withSetter(),
  })
  implements BaseListItem<Project>, ItemsList<ProjectItem>
{
  makeListRef() {
    return projectRef(this);
  }

  @computed
  get siblings(): [Project, Project] {
    return [this, this];
  }

  @computed
  get children(): ProjectItem[] {
    return getChildren(this, projectRef, Task);
  }

  @computed
  get tasks(): Task[] {
    return this.children.filter((p) => p instanceof Task);
  }

  @computed
  get notDoneTask(): Task[] {
    return this.tasks.filter((p) => p.state !== "done");
  }

  withoutTasksByIds(ids: Set<string>) {
    return this.children.filter((p) => !ids.has(p.id));
  }

  @computed
  get lastChild(): ProjectItem | undefined {
    return this.children[this.children.length - 1];
  }

  @modelAction
  createChild(
    between: [OrderableItem | undefined, OrderableItem | undefined] | undefined,
    _base?: ProjectItem,
  ): Task {
    const { taskRegistry } = getRootStoreOrThrow(this);

    const orderToken = between
      ? generateKeyBetween(between[0]?.orderToken, between[1]?.orderToken)
      : generateKeyBetween(this.lastChild?.orderToken, undefined);

    const task = new Task({
      projectRef: projectRef(this),
      orderToken: orderToken,
    });

    taskRegistry.add(task);

    return task;
  }
}

type ProjectItem = Task | TaskTemplate;

@model("TaskApp/ProjectRegistry")
export class ProjectsRegistry
  extends Model({
    entities: prop<ObjectMap<Project>>(() => objectMap()),
  })
  implements ListItemsRegistry<TaskProjection>
{
  @computed
  get inboxProjectOrThrow() {
    for (const project of this.entities.values()) {
      if (project.isInbox) return project;
    }

    throw new Error("inbox project not found");
  }

  @modelAction
  add(project: Project) {
    this.entities.set(project.id, project);
  }

  getById(id: string) {
    return this.entities.get(id);
  }

  getByIdOrThrow(id: string) {
    const project = this.getById(id);
    if (!project) throw new Error("Project not found");

    return project;
  }
}

type TaskState = "todo" | "done";
@model("TaskApp/Task")
export class Task
  extends Model({
    id: idProp,
    title: prop<string>(() => "").withSetter(),
    state: prop<TaskState>(() => "todo").withSetter(),
    projectRef: prop<Ref<Project>>().withSetter(),
    orderToken: prop<string>().withSetter(),
  })
  implements BaseListItem<ProjectItem>
{
  get listRef() {
    return this.projectRef;
  }

  set listRef(value: Ref<Project>) {
    this.projectRef = value;
  }

  @computed
  get siblings(): [ProjectItem | undefined, ProjectItem | undefined] {
    return getSiblings<ProjectItem>(this);
  }

  @modelAction
  toggleState() {
    this.state = this.state === "todo" ? "done" : "todo";
  }

  onAttachedToRootStore() {
    return autorun(() => {
      if (!this.projectRef.isValid) {
        detach(this);
      }
    });
  }
}

@model("TaskApp/TaskTemplate")
export class TaskTemplate
  extends Model({
    id: idProp,
    orderToken: prop<string>().withSetter(),
    projectRef: prop<Ref<Project>>().withSetter(),
  })
  implements BaseListItem<TaskTemplate>
{
  get listRef() {
    return this.projectRef;
  }

  set listRef(value: Ref<Project>) {
    this.projectRef = value;
  }

  @computed
  get siblings(): [ProjectItem | undefined, ProjectItem | undefined] {
    return getSiblings<TaskTemplate>(this);
  }
}

@model("TaskApp/TaskRegistry")
export class TaskRegistry
  extends Model({
    entities: prop<ObjectMap<Task>>(() => objectMap()),
  })
  implements ListItemsRegistry<Task>
{
  @modelAction
  public add(task: Task) {
    this.entities.set(task.id, task);
  }

  getById(id: string): Task | undefined {
    return this.entities.get(id);
  }
}

@model("TaskApp/AllProjectsList")
export class AllProjectsList
  extends Model({
    id: idProp,
  })
  implements ItemsList<Project>
{
  makeListRef() {
    return allProjectsListRef(this);
  }

  @computed
  get children(): Project[] {
    return getChildren(this, allProjectsListRef, Project);
  }

  get lastChild(): Project | undefined {
    return this.children[this.children.length - 1];
  }

  @computed
  get inbox() {
    const inbox = this.children.find((p) => p.isInbox);
    if (!inbox) throw new Error("inbox not found");

    return inbox;
  }

  @computed
  get withoutInbox() {
    return this.children.filter((p) => !p.isInbox);
  }

  @computed
  get lastProject(): Project | undefined {
    return this.children[this.children.length - 1];
  }

  @modelAction
  createChild(
    between: [OrderableItem | undefined, OrderableItem | undefined] | undefined,
    _base?: Project,
  ) {
    const { projectsRegistry } = getRootStoreOrThrow(this);

    const orderToken = between
      ? generateKeyBetween(between[0]?.orderToken, between[1]?.orderToken)
      : generateKeyBetween(this.lastProject?.orderToken, undefined);

    const project = new Project({
      orderToken: orderToken,
      listRef: allProjectsListRef(this),
    });

    projectsRegistry.add(project);

    return project;
  }

  // @modelAction
  // addProjectionFromOtherList(
  //   sourceProjection: Projection,
  //   targetProjection: Projection,
  //   edge: "top" | "bottom",
  // ) {
  //   addProjectionFromOtherList(sourceProjection, targetProjection, edge);
  // }

  // @modelAction
  // appendProjectionFromOtherList(sourceProjection: Projection) {}

  // append(projectRef: Ref<Project>) {
  //   console.log("append", projectRef);
  //   const projectProjectionRegistry =
  //     getRootStoreOrThrow(this).projectProjectionRegistry;
  //
  //   const projection = new ProjectProjection({
  //     listRef: allProjectsListRef(this),
  //     itemRef: projectRef,
  //     orderToken: generateKeyBetween(
  //       this.lastProjection?.orderToken,
  //       undefined,
  //     ),
  //   });
  //
  //   projectProjectionRegistry.add(projection);
  // }

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
export class TaskProjection
  extends Model({
    id: idProp,
    taskRef: prop<Ref<Task>>().withSetter(),
    orderToken: prop<string>().withSetter(),
    dailyListRef: prop<Ref<DailyList>>().withSetter(),
  })
  implements BaseListItem<TaskProjection>
{
  get listRef() {
    return this.dailyListRef;
  }

  set listRef(value: Ref<DailyList>) {
    this.dailyListRef = value;
  }

  @computed
  get siblings(): [
    BaseListItem<TaskProjection> | undefined,
    BaseListItem<TaskProjection> | undefined,
  ] {
    return getSiblings<TaskProjection>(this);
  }

  onAttachedToRootStore() {
    return autorun(() => {
      if (!this.taskRef.isValid) {
        detach(this);
      }
    });
  }
}

export type TaskItem = Task | TaskProjection;

@model("TaskApp/TaskProjectionRegistry")
export class TaskProjectionRegistry
  extends Model({
    entities: prop<ObjectMap<TaskProjection>>(() => objectMap()),
  })
  implements ListItemsRegistry<TaskProjection>
{
  @modelAction
  public add(proj: TaskProjection) {
    this.entities.set(proj.id, proj);
  }

  getById(id: string) {
    return this.entities.get(id);
  }
}

@model("TaskApp/DailyList")
export class DailyList
  extends Model({
    id: idProp,
    date: prop<number>().withTransform(timestampToDateTransform()).withSetter(),
  })
  implements ItemsList<TaskProjection>
{
  makeListRef() {
    return dailyListRef(this);
  }

  @computed
  get children(): TaskProjection[] {
    return getChildren(this, dailyListRef, TaskProjection);
  }

  @computed
  get lastChild(): TaskProjection | undefined {
    return this.children[this.children.length - 1];
  }

  @computed
  get projections(): TaskProjection[] {
    return this.children;
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

  // @modelAction
  // appendProjectionFromOtherList(sourceProjection: TaskProjection) {
  //   const lastProjection = this.lastProjection;
  //
  //   const newOrderToken = generateKeyBetween(
  //     lastProjection?.orderToken,
  //     undefined,
  //   );
  //
  //   sourceProjection.orderToken = newOrderToken;
  //   sourceProjection.dailyListRef = dailyListRef(this);
  // }

  @modelAction
  createChild(
    between: [OrderableItem | undefined, OrderableItem | undefined] | undefined,
    base?: TaskProjection,
  ) {
    const { taskProjectionRegistry, projectsRegistry } =
      getRootStoreOrThrow(this);

    console.trace();
    console.log("createChild", base);
    const project =
      base?.taskRef.maybeCurrent?.projectRef.maybeCurrent ||
      projectsRegistry.inboxProjectOrThrow;
    const task = project.createChild(undefined);

    const orderToken = between
      ? generateKeyBetween(between[0]?.orderToken, between[1]?.orderToken)
      : generateKeyBetween(this.lastProjection?.orderToken, undefined);

    const proj = new TaskProjection({
      orderToken: orderToken,
      dailyListRef: dailyListRef(this),
      taskRef: taskRef(task),
    });

    taskProjectionRegistry.add(proj);

    return proj;
  }

  // @modelAction
  // addProjectionFromOtherList(
  //   sourceProjection: Projection,
  //   targetProjection: Projection,
  //   edge: "top" | "bottom",
  // ) {
  //   if (!(targetProjection instanceof TaskProjection)) {
  //     throw new Error("Target projection is not task");
  //   }
  //
  //   if (targetProjection.listRef.current !== this) {
  //     throw new Error("Target projection is not in this daily list");
  //   }
  //   addProjectionFromOtherList(sourceProjection, targetProjection, edge);
  // }
}

@model("TaskApp/DailyListRegistry")
export class DailyListRegistry
  extends Model({
    entities: prop<ObjectMap<DailyList>>(() => objectMap()),
  })
  implements ItemsListsRegistry<DailyList>
{
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

  getTaskIdsOfDailyLists(dailyLists: DailyList[]) {
    const ids = new Set<string>();

    for (const dailyList of dailyLists) {
      for (const proj of dailyList.projections) {
        ids.add(proj.taskRef.id);
      }
    }

    return ids;
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

  getById(id: string) {
    return this.entities.get(id);
  }
}
@model("TaskApp/Preferences")
export class Preferences extends Model({
  id: idProp,
  daysWindow: prop<number>(() => 7).withSetter(),
  daysShift: prop<number>(() => 0).withSetter(),
}) {}

@model("TaskApp/RootStore")
export class RootStore extends Model({
  allProjectsList: prop<AllProjectsList>(() => new AllProjectsList({})),
  projectsRegistry: prop<ProjectsRegistry>(() => new ProjectsRegistry({})),

  taskRegistry: prop<TaskRegistry>(() => new TaskRegistry({})),

  taskProjectionRegistry: prop<TaskProjectionRegistry>(
    () => new TaskProjectionRegistry({}),
  ),
  dailyListRegisry: prop<DailyListRegistry>(() => new DailyListRegistry({})),

  listsService: prop<ListsService>(() => new ListsService({})),
  projectsService: prop<ProjectsService>(() => new ProjectsService({})),

  preferences: prop<Preferences>(() => new Preferences({})),
}) {}

@model("TaskApp/ProjectsService")
export class ProjectsService extends Model({}) {
  @modelAction
  createProject(
    title: string,
    icon: string,
    isInbox: boolean,
    between: [Project | undefined, Project | undefined] | undefined,
  ) {
    const { allProjectsList } = getRootStoreOrThrow(this);

    const newProject = allProjectsList.createChild(between);
    newProject.title = title;
    newProject.icon = icon;
    newProject.isInbox = isInbox;

    return newProject;
  }
}

@model("TaskApp/ListsService")
export class ListsService extends Model({}) {
  findList(listId: string) {
    const rootStore = getRootStoreOrThrow(this);
    const { projectsRegistry, dailyListRegisry, allProjectsList } = rootStore;

    if (listId == allProjectsList.id) {
      return allProjectsList;
    }

    const registries: ItemsListsRegistry<unknown>[] = [
      dailyListRegisry,
      projectsRegistry,
    ];

    for (const registry of registries) {
      const list = registry.getById(listId);
      if (list) {
        return list;
      }
    }

    return undefined;
  }

  findListItem(itemId: string) {
    const rootStore = getRootStoreOrThrow(this);
    const { taskRegistry, taskProjectionRegistry, projectsRegistry } =
      rootStore;

    const registries: ListItemsRegistry<unknown>[] = [
      taskRegistry,
      taskProjectionRegistry,
      projectsRegistry,
    ];

    for (const registry of registries) {
      const list = registry.getById(itemId);
      if (list) {
        return list;
      }
    }

    return undefined;
  }

  findListItemOrThrow(itemId: string) {
    const item = this.findListItem(itemId);
    if (!item) {
      throw new Error("list item not found: " + itemId);
    }

    return item;
  }

  findListOrThrow(listId: string) {
    const list = this.findList(listId);
    if (!list) {
      throw new Error("list not found: " + listId);
    }

    return list;
  }

  @modelAction
  addListItemFromOtherList(
    sourceItem: BaseListItem<undefined>,
    targetItem: BaseListItem<undefined>,
    edge: "top" | "bottom",
  ) {
    if (sourceItem instanceof TaskProjection && targetItem instanceof Task) {
      return;
    }

    const { taskProjectionRegistry } = getRootStoreOrThrow(this);
    const [up, down] = targetItem.siblings;

    let between: [string | undefined, string | undefined] = [
      targetItem.orderToken,
      down?.orderToken,
    ];
    if (edge == "top") {
      between = [up?.orderToken, targetItem.orderToken];
    }

    // TODO: fix hack
    if (sourceItem instanceof Task && targetItem instanceof TaskProjection) {
      console.log("ooops1");

      const newProjection = new TaskProjection({
        taskRef: taskRef(sourceItem),
        orderToken: generateKeyBetween(between[0], between[1]),
        dailyListRef: clone(targetItem.dailyListRef),
      });
      taskProjectionRegistry.add(newProjection);

      return;
    }

    sourceItem.listRef = clone(targetItem.listRef);
    sourceItem.orderToken = generateKeyBetween(between[0], between[1]);
  }

  @modelAction
  appendListItemFromOtherList(
    list: ItemsList<undefined>,
    toAppend: BaseListItem<undefined>,
  ) {
    if (toAppend instanceof TaskProjection && list instanceof Project) {
      return;
    }

    const { taskProjectionRegistry } = getRootStoreOrThrow(this);

    const orderToken = generateKeyBetween(
      list.lastChild?.orderToken,
      undefined,
    );

    // TODO: fix hack
    if (toAppend instanceof Task && list instanceof DailyList) {
      const newProjection = new TaskProjection({
        taskRef: taskRef(toAppend),
        orderToken: orderToken,
        dailyListRef: list.makeListRef(),
      });
      taskProjectionRegistry.add(newProjection);

      return;
    }

    const lastChild = list.lastChild;
    toAppend.listRef = list.makeListRef();
    toAppend.orderToken = orderToken;
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
    for (const pr of rootStore.projectsRegistry.entities.values()) {
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
      undefined,
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
