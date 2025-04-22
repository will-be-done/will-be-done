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
  rootRef,
  SnapshotOutOfModel,
  timestampToDateTransform,
  UndoManager,
  undoMiddleware,
  type ObjectMap,
  type Ref,
  setGlobalConfig,
} from "mobx-keystone";
import { startOfDay } from "date-fns";
import {
  generateKeyPositionedBetween,
  generateOrderTokenPositioned,
  getRootStoreOrThrow,
} from "./utils";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import {
  type BaseListItem,
  getChildren,
  getSiblings,
  type ItemsList,
  ItemsListsRegistry,
  ListItemsRegistry,
  OrderableItem,
} from "./listActions";
import {
  syncable,
  SyncableRegistriesStore,
  SyncableRegistry,
  syncableRegistry,
  withoutSync,
  withoutSyncAction,
} from "@/sync/syncable";
import {
  DailyListData,
  dailyListsTable,
  ProjectData,
  projectsTable,
  SyncableTable,
  SyncableTables,
  TaskData,
  TaskProjectionData,
  taskProjectionsTable,
  tasksTable,
} from "@/sync/schema";
import { IDbCtx } from "@/sync/db";
import AwaitLock from "await-lock";
import { uuidv7 } from "uuidv7";
import { Selectable } from "kysely";

setGlobalConfig({
  modelIdGenerator: uuidv7,
});

export const taskRef = rootRef<Task>("TaskRef");
export const projectRef = rootRef<Project>("ProjectRef");
export const allProjectsListRef =
  rootRef<AllProjectsList>("AllProjectsListRef");
export const dailyListRef = rootRef<DailyList>("DailyListRef");

@syncable
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
  get displayIcon() {
    return this.icon || "🟡";
  }

  @computed
  get siblings(): [Project | undefined, Project | undefined] {
    return getSiblings<Project>(this);
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

  canDrop(target: AnyModel): target is Project | ProjectItem | TaskProjection {
    if (target instanceof _Project && this.isInbox) {
      return false;
    }
    return (
      target instanceof _Project ||
      target instanceof Task ||
      target instanceof TaskTemplate ||
      target instanceof TaskProjection
    );
  }

  @modelAction
  handleDrop(target: AnyModel, edge: "top" | "bottom") {
    if (!this.canDrop(target)) {
      return;
    }

    if (target instanceof _Project) {
      const [up, down] = this.siblings;

      let between: [string | undefined, string | undefined] = [
        this.orderToken,
        down?.orderToken,
      ];
      if (edge == "top") {
        between = [up?.orderToken, this.orderToken];
      }

      const orderToken = generateJitteredKeyBetween(
        between[0] || null,
        between[1] || null,
      );

      target.orderToken = orderToken;
    } else if (target instanceof Task || target instanceof TaskTemplate) {
      target.projectRef = projectRef(this);
    } else if (target instanceof TaskProjection) {
      target.taskRef.current.projectRef = projectRef(this);
    } else {
      assertUnreachable(target);
    }

    console.log("handleDrop", target);
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
const _Project = Project;

type ProjectItem = Task | TaskTemplate;

@syncableRegistry
@model("TaskApp/ProjectRegistry")
export class ProjectsRegistry
  extends Model({
    entities: prop<ObjectMap<Project>>(() => objectMap()),
  })
  implements
    ListItemsRegistry<TaskProjection>,
    SyncableRegistry<Project, typeof projectsTable>
{
  table = projectsTable as typeof projectsTable;
  entity = Project;

  mapDataToModel(data: ProjectData) {
    return new Project({
      id: data.id,
      title: data.title,
      icon: data.icon,
      isInbox: data.isInbox,
      orderToken: data.orderToken,
      listRef: allProjectsListRef("all-projects-list"),
    });
  }

  mapModelToData(entity: Project): ProjectData {
    return {
      id: entity.id,
      title: entity.title,
      icon: entity.icon,
      isInbox: entity.isInbox,
      orderToken: entity.orderToken,
    };
  }

  @computed
  get inboxProjectOrThrow() {
    for (const project of this.entities.values()) {
      if (project.isInbox) return project;
    }

    throw new Error("inbox project not found");
  }

  @modelAction
  drop(id: string) {
    this.entities.delete(id);
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
    between: [OrderableItem | undefined, OrderableItem | undefined] | undefined,
  ) {
    const { allProjectsList } = getRootStoreOrThrow(this);

    const newProject = allProjectsList.createProject(between || "append");
    newProject.title = title;
    newProject.icon = icon;
    newProject.isInbox = isInbox;

    return newProject;
  }
}

type TaskState = "todo" | "done";

@syncable
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

    return false;
  }

  canDrop(target: AnyModel): target is TaskProjection | Task {
    return target instanceof TaskProjection || target instanceof _Task;
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

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );
    if (target instanceof TaskProjection) {
      const task = target.taskRef.current;
      task.setProjectRef(clone(this.projectRef));
      task.orderToken = orderToken;
      detach(target);
    } else if (target instanceof _Task) {
      target.setProjectRef(clone(this.projectRef));
      target.orderToken = orderToken;
    } else {
      assertUnreachable(target);
    }
  }

  @modelAction
  createSibling(position: "before" | "after") {
    const { taskRegistry } = getRootStoreOrThrow(this);

    const task = new _Task({
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
const _Task = Task;

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

@syncableRegistry
@model("TaskApp/TaskRegistry")
export class TaskRegistry
  extends Model({
    entities: prop<ObjectMap<Task>>(() => objectMap()),
  })
  implements ListItemsRegistry<Task>, SyncableRegistry<Task, typeof tasksTable>
{
  table = tasksTable as typeof tasksTable;
  entity = Task;

  mapDataToModel(data: TaskData) {
    return new Task({
      id: data.id,
      title: data.title,
      state: data.state as TaskState,
      projectRef: projectRef(data.projectId),
      orderToken: data.orderToken,
    });
  }

  mapModelToData(entity: Task): TaskData {
    return {
      id: entity.id,
      title: entity.title,
      state: entity.state,
      projectId: entity.projectRef.id,
      orderToken: entity.orderToken,
    };
  }

  @modelAction
  drop(id: string) {
    this.entities.delete(id);
  }

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
    position:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
    _base?: Project,
  ) {
    const { projectsRegistry } = getRootStoreOrThrow(this);
    const orderToken = generateOrderTokenPositioned(this, position);

    const project = new Project({
      orderToken: orderToken,
      listRef: allProjectsListRef(this),
      title: "New project",
    });

    projectsRegistry.add(project);

    return project;
  }
}

@syncable
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
    return target instanceof _TaskProjection || target instanceof Task;
  }

  @modelAction
  toggleState() {
    const newStateIsDone = this.taskRef.current.state === "todo";

    let wasMoved = false;
    if (newStateIsDone) {
      const doneChild = this.listRef.current.firstDoneChild;
      if (doneChild) {
        doneChild.handleDrop(this, "top");
        wasMoved = true;
      } else {
        const lastChild = this.listRef.current.lastChild;

        if (lastChild && lastChild !== this) {
          lastChild.handleDrop(this, "bottom");
          wasMoved = true;
        }
      }
    }

    this.taskRef.current.toggleState();
    return wasMoved;
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

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    if (target instanceof _TaskProjection) {
      target.listRef = clone(this.dailyListRef);
      target.orderToken = orderToken;
    } else if (target instanceof Task) {
      // this not working
      const newProjection = new _TaskProjection({
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

    const taskProjection = new _TaskProjection({
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

  onInit() {
    console.log("onInitProj", this);
  }
}
const _TaskProjection = TaskProjection;

export type TaskItem = Task | TaskProjection;

@syncableRegistry
@model("TaskApp/TaskProjectionRegistry")
export class TaskProjectionRegistry
  extends Model({
    entities: prop<ObjectMap<TaskProjection>>(() => objectMap()),
  })
  implements
    ListItemsRegistry<TaskProjection>,
    SyncableRegistry<TaskProjection, typeof taskProjectionsTable>
{
  table = taskProjectionsTable as typeof taskProjectionsTable;
  entity = TaskProjection;

  mapDataToModel(data: TaskProjectionData) {
    return new TaskProjection({
      id: data.id,
      taskRef: taskRef(data.taskId),
      orderToken: data.orderToken,
      dailyListRef: dailyListRef(data.dailyListId),
    });
  }

  mapModelToData(entity: TaskProjection): TaskProjectionData {
    return {
      id: entity.id,
      taskId: entity.taskRef.id,
      orderToken: entity.orderToken,
      dailyListId: entity.dailyListRef.id,
    };
  }

  @modelAction
  drop(id: string) {
    this.entities.delete(id);
  }

  @modelAction
  public add(proj: TaskProjection) {
    this.entities.set(proj.id, proj);
  }

  getById(id: string) {
    return this.entities.get(id);
  }
}

@syncable
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
  handleDrop(target: AnyModel, edge: "top" | "bottom") {
    if (!this.canDrop(target)) return;

    const { taskProjectionRegistry } = getRootStoreOrThrow(this);

    let between: [string | null, string | null] = [
      null,
      this.firstChild?.orderToken || null,
    ];
    if (edge == "bottom") {
      between = [this.lastChild?.orderToken || null, null];
    }

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    if (target instanceof TaskProjection) {
      target.listRef = this.makeListRef();
      target.orderToken = orderToken;
    } else if (target instanceof Task) {
      // this working
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
  get firstDoneChild(): TaskProjection | undefined {
    return this.children.find((p) => p.taskRef.current.state === "done");
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

@syncableRegistry
@model("TaskApp/DailyListRegistry")
export class DailyListRegistry
  extends Model({
    entities: prop<ObjectMap<DailyList>>(() => objectMap()),
  })
  implements
    ItemsListsRegistry<DailyList>,
    SyncableRegistry<DailyList, typeof dailyListsTable>
{
  table = dailyListsTable as typeof dailyListsTable;
  entity = DailyList;

  mapDataToModel(data: DailyListData) {
    return new DailyList({
      id: data.id,
      date: new Date(data.date),
    });
  }

  mapModelToData(entity: DailyList): DailyListData {
    return {
      id: entity.id,
      date: entity.date.getTime(),
    };
  }

  @modelAction
  drop(id: string) {
    this.entities.delete(id);
  }

  @modelAction
  public add(proj: DailyList) {
    this.entities.set(proj.id, proj);
  }

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
  allProjectsList: prop<AllProjectsList>(
    () => new AllProjectsList({ id: "all-projects-list" }),
  ),

  projectsRegistry: prop<ProjectsRegistry>(() => new ProjectsRegistry({})),
  taskRegistry: prop<TaskRegistry>(() => new TaskRegistry({})),
  taskProjectionRegistry: prop<TaskProjectionRegistry>(
    () => new TaskProjectionRegistry({}),
  ),
  dailyListRegistry: prop<DailyListRegistry>(() => new DailyListRegistry({})),

  preferences: prop<Preferences>(() => new Preferences({})),
}) {
  @modelAction
  clearAll() {
    this.projectsRegistry.entities.clear();
    this.taskRegistry.entities.clear();
    this.taskProjectionRegistry.entities.clear();
    this.dailyListRegistry.entities.clear();
  }

  getEntity(entityId: string, modelType: string): AnyModel | undefined {
    const registries = [
      this.projectsRegistry,
      this.taskRegistry,
      this.taskProjectionRegistry,
      this.dailyListRegistry,
    ];

    for (const registry of registries) {
      const entity = registry.getById(entityId);

      if (entity && entity.$modelType === modelType) {
        return entity;
      }
    }

    return undefined;
  }

  @withoutSyncAction
  @modelAction
  loadData(data: [SyncableRegistry, Selectable<SyncableTable>[]][]) {
    withoutSync(() => {
      for (const [registry, chs] of data) {
        for (const ch of chs) {
          if (ch.isDeleted) {
            registry.drop(ch.id);
            continue;
          }

          //@ts-expect-error
          const model = registry.mapDataToModel(JSON.parse(ch.data));
          registry.add(model);
        }
      }
    });
  }

  @withoutSyncAction
  @modelAction
  applyChanges(
    store: SyncableRegistriesStore,
    changes: Record<string, Selectable<SyncableTable>[]>,
  ) {
    for (const [table, chs] of Object.entries(changes)) {
      const registry = store.getRegistryOfTable(table as keyof SyncableTables);

      if (!registry) {
        throw new Error("Registry not found of table " + table);
      }

      for (const ch of chs) {
        const model = registry.mapDataToModel(ch.data as ProjectData);

        if (ch.isDeleted) {
          registry.drop(ch.id);
        } else {
          registry.add(model);
        }
      }
    }
  }
}

function assertUnreachable(x: never): never {
  throw new Error("Didn't expect to get here");
}
