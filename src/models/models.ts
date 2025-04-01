import { computed } from "mobx";
import {
  getParent,
  getRefsResolvingTo,
  idProp,
  Model,
  model,
  modelAction,
  objectMap,
  prop,
  registerRootStore,
  rootRef,
  timestampToDateTransform,
  type ObjectMap,
  type Ref,
} from "mobx-keystone";
import { fractionalCompare } from "../utils/fractionalSort";
import { startOfDay } from "date-fns";

export const taskRef = rootRef<Task>("TaskRef");
export const projectRef = rootRef<Project>("ProjectRef");
export const projectListRef = rootRef<ProjectList>("ProjectListRef");
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
}) {}

@model("TaskApp/Task")
export class Task extends Model({
  id: idProp,
  title: prop<string>(() => "").withSetter(),
  projectRef: prop<Ref<Project>>().withSetter(),
}) {}

@model("TaskApp/TaskRegistry")
export class TaskRegistry extends Model({
  entities: prop<ObjectMap<Task>>(() => objectMap()),
}) {}

@model("TaskApp/TaskProjection")
export class TaskProjection extends Model({
  id: idProp,
  taskRef: prop<Ref<Task>>().withSetter(),
  orderToken: prop<string>().withSetter(),
  list: prop<Ref<DailyList | ProjectList>>().withSetter(),
}) {}

@model("TaskApp/TaskProjectionRegistry")
export class TaskProjectionRegistry extends Model({
  entities: prop<ObjectMap<TaskProjection>>(() => objectMap()),
}) {}

@model("TaskApp/DailyList")
export class DailyList extends Model({
  id: idProp,
  date: prop<number>().withTransform(timestampToDateTransform()).withSetter(),
}) {
  @computed
  get projections() {
    const projections: TaskProjection[] = [];
    for (const ref of getRefsResolvingTo(this, dailyListRef, {
      updateAllRefsIfNeeded: true,
    })) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parent = getParent(ref);
      if (parent instanceof TaskProjection) {
        projections.push(parent);
      }
    }

    return projections.sort(fractionalCompare);
  }

  @computed
  get isToday() {
    return (
      startOfDay(new Date(this.date)).getDate() ==
      startOfDay(new Date()).getDate()
    );
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

  getDailyList(id: string) {
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
    const projections: TaskProjection[] = [];
    for (const ref of getRefsResolvingTo(this, projectListRef, {
      updateAllRefsIfNeeded: true,
    })) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parent = getParent(ref);
      if (parent instanceof TaskProjection) {
        projections.push(parent);
      }
    }

    return projections.sort(fractionalCompare);
  }
}

@model("TaskApp/ProjectListRegistry")
export class ProjectListRegistry extends Model({
  entities: prop<ObjectMap<ProjectList>>(() => objectMap()),
}) {
  @computed
  get all() {
    return [...this.entities.values()];
  }
}

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
}) {
  @modelAction
  createProject(title: string) {
    const project = new Project({ title, isInbox: true });
    this.projectRegistry.entities.set(project.id, project);
  }
}

let currentRootStore: RootStore | undefined;
export const getRootStore = () => {
  if (currentRootStore) return currentRootStore;

  const rootStore = new RootStore({});
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

  return rootStore;
};
