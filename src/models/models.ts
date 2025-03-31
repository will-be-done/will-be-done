import dayjs from "dayjs";
import { computed } from "mobx";
import {
  frozen,
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
  type Frozen,
  type ObjectMap,
  type Ref,
} from "mobx-keystone";
import { type RemirrorJSON } from "remirror";
import { fractionalCompare } from "../utils/fractionalSort";
import { timestampToDayjsTransform } from "./timestampToDayjsTransform";

export const taskRef = rootRef<Task>("TaskRef");
export const projectRef = rootRef<Project>("ProjectRef");
export const projectListRef = rootRef<ProjectList>("ProjectListRef");
export const dailyListRef = rootRef<DailyList>("DailyListRef");

@model("TaskApp/Project")
export class Project extends Model({
  id: idProp,
  title: prop<Frozen<RemirrorJSON>>(() =>
    frozen({
      type: "doc",
    }),
  ).withSetter(),
  isInbox: prop<boolean>().withSetter(),
}) {}

@model("TaskApp/TaskRegistry")
export class ProjectRegistry extends Model({
  entities: prop<ObjectMap<Project>>(() => objectMap()),
}) {}

@model("TaskApp/Task")
export class Task extends Model({
  id: idProp,
  title: prop<Frozen<RemirrorJSON>>(() =>
    frozen({
      type: "doc",
    }),
  ).withSetter(),
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
  date: prop<number>().withTransform(timestampToDayjsTransform()).withSetter(),
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

  getDailyListByDate(time: number) {
    for (const dailyList of this.entities.values()) {
      if (dailyList.date.valueOf() === time) return dailyList;
    }
  }

  @modelAction
  createDailyListIfNotPresent(time: number) {
    const dailyList = this.getDailyListByDate(time);

    if (!dailyList) {
      const newList = new DailyList({ date: dayjs(time) });

      this.entities.set(newList.id, newList);

      return newList;
    } else {
      return dailyList;
    }
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
}) {}

let currentRootStore: RootStore | undefined;
export const getRootStore = () => {
  if (currentRootStore) return currentRootStore;

  const rootStore = new RootStore({});
  registerRootStore(rootStore);

  return rootStore;
};
