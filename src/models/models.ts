import { autorun, computed, observable, reaction } from "mobx";
import {
  type AnyModel,
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
import {
  generateKeyPositionedBetween,
  generateOrderTokenPositioned,
  getRootStoreOrThrow,
} from "./utils";
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

  @computed
  get firstChild(): ProjectItem | undefined {
    return this.children[0];
  }

  @computed
  get firstProjectItem(): ProjectItem | undefined {
    return this.children[this.children.length - 1];
  }

  @computed
  get lastProjectItem(): ProjectItem | undefined {
    return this.children[this.children.length - 1];
  }

  @modelAction
  createTask(
    position:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
  ) {
    const { taskRegistry } = getRootStoreOrThrow(this);
    const orderToken = generateOrderTokenPositioned(this, position);
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

  @modelAction
  createProject(
    title: string,
    icon: string,
    isInbox: boolean,
    between: [Project | undefined, Project | undefined] | undefined,
  ) {
    const { allProjectsList } = getRootStoreOrThrow(this);

    const newProject = allProjectsList.createProject(between);
    newProject.title = title;
    newProject.icon = icon;
    newProject.isInbox = isInbox;

    return newProject;
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

  canDrop(target: AnyModel): target is TaskProjection | Task {
    return target instanceof TaskProjection || target instanceof Task;
  }

  @modelAction
  handleDrop(target: AnyModel, edge: "top" | "bottom") {
    if (!this.canDrop(target)) {
      return;
    }
    const [up, down] = this.siblings;

    let between: [string | undefined, string | undefined] = [
      this.orderToken,
      down?.orderToken,
    ];
    if (edge == "top") {
      between = [up?.orderToken, this.orderToken];
    }

    const orderToken = generateKeyBetween(between[0], between[1]);
    if (target instanceof TaskProjection) {
      const task = target.taskRef.current;
      task.setProjectRef(clone(this.projectRef));
      task.orderToken = orderToken;
      detach(target);
    } else if (target instanceof Task) {
      target.setProjectRef(clone(this.projectRef));
      target.orderToken = orderToken;
    } else {
      assertUnreachable(target);
    }
  }

  @modelAction
  createSibling(position: "before" | "after") {
    const { taskRegistry } = getRootStoreOrThrow(this);

    const task = new Task({
      projectRef: clone(this.projectRef),
      orderToken: generateKeyPositionedBetween(this, this.siblings, position),
    });

    taskRegistry.add(task);

    return task;
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

  get firstChild(): Project | undefined {
    return this.children[0];
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
  createProject(
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

  canDrop(target: AnyModel): target is TaskProjection | Task {
    return target instanceof TaskProjection || target instanceof Task;
  }

  @modelAction
  handleDrop(target: AnyModel, edge: "top" | "bottom") {
    if (!this.canDrop(target)) {
      return;
    }

    const { taskProjectionRegistry } = getRootStoreOrThrow(this);
    const [up, down] = this.siblings;

    let between: [string | undefined, string | undefined] = [
      this.orderToken,
      down?.orderToken,
    ];
    if (edge == "top") {
      between = [up?.orderToken, this.orderToken];
    }

    const orderToken = generateKeyBetween(between[0], between[1]);

    if (target instanceof TaskProjection) {
      target.listRef = clone(this.dailyListRef);
      target.orderToken = orderToken;
    } else if (target instanceof Task) {
      const newProjection = new TaskProjection({
        taskRef: taskRef(target),
        orderToken: orderToken,
        dailyListRef: clone(this.dailyListRef),
      });
      taskProjectionRegistry.add(newProjection);
    } else {
      assertUnreachable(target);
    }
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

  @modelAction
  createSibling(position: "before" | "after") {
    const { taskProjectionRegistry } = getRootStoreOrThrow(this);
    const project = this.taskRef.current.projectRef.current;
    const task = project.createTask("append");

    const taskProjection = new TaskProjection({
      orderToken: generateKeyPositionedBetween(this, this.siblings, position),
      taskRef: taskRef(task),
      dailyListRef: clone(this.dailyListRef),
    });

    taskProjectionRegistry.add(taskProjection);

    return taskProjection;
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

  canDrop(target: AnyModel): target is TaskProjection | Task {
    return target instanceof TaskProjection || target instanceof Task;
  }

  @modelAction
  handleDrop(target: AnyModel) {
    if (!this.canDrop(target)) return;

    const { taskProjectionRegistry } = getRootStoreOrThrow(this);

    const orderToken = generateKeyBetween(
      this.lastChild?.orderToken,
      undefined,
    );
    if (target instanceof TaskProjection) {
      target.listRef = this.makeListRef();
      target.orderToken = orderToken;
    } else if (target instanceof Task) {
      const newProjection = new TaskProjection({
        taskRef: taskRef(target),
        orderToken: orderToken,
        dailyListRef: this.makeListRef(),
      });

      taskProjectionRegistry.add(newProjection);
    } else {
      assertUnreachable(target);
    }
  }

  @computed
  get children(): TaskProjection[] {
    return getChildren(this, dailyListRef, TaskProjection);
  }

  @computed
  get firstChild(): TaskProjection | undefined {
    return this.children[0];
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

  @modelAction
  createProjection(
    position:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
    opts?: {
      project?: Project;
    },
  ) {
    const { taskProjectionRegistry, projectsRegistry } =
      getRootStoreOrThrow(this);

    const orderToken = generateOrderTokenPositioned(this, position);
    const project = opts?.project || projectsRegistry.inboxProjectOrThrow;
    const task = project.createTask("append");

    const proj = new TaskProjection({
      orderToken: orderToken,
      dailyListRef: dailyListRef(this),
      taskRef: taskRef(task),
    });

    taskProjectionRegistry.add(proj);

    return proj;
  }
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

  preferences: prop<Preferences>(() => new Preferences({})),
}) {
  getEntity(entityId: string): AnyModel | undefined {
    const registries = [
      this.projectsRegistry,
      this.taskRegistry,
      this.taskProjectionRegistry,
      this.dailyListRegisry,
    ];

    for (const registry of registries) {
      const entity = registry.getById(entityId);

      if (entity) {
        return entity;
      }
    }

    return undefined;
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

    rootStore.projectsRegistry.createProject(
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
function assertUnreachable(x: never): never {
  throw new Error("Didn't expect to get here");
}
