import { action, makeObservable, observable } from "mobx";
import { TaskProjection } from "../models/models";

class CurrentTaskState {
  @observable selectedTask:
    | {
        taskId: string;
        listId: string;
      }
    | undefined;
  @observable focusedTask:
    | {
        taskId: string;
        listId: string;
      }
    | undefined;

  constructor() {
    makeObservable(this);
  }

  isProjSelected(projection: TaskProjection) {
    if (!this.selectedTask) return false;

    return (
      this.selectedTask?.taskId === projection.taskRef.id &&
      this.selectedTask?.listId === projection.list.id
    );
  }

  isEditing() {
    return this.focusedTask !== undefined;
  }

  isProjEditing(projection: TaskProjection) {
    if (!this.focusedTask) return false;

    return (
      this.focusedTask?.taskId === projection.taskRef.id &&
      this.focusedTask?.listId === projection.list.id
    );
  }

  @action
  setSelectedTask(projection: TaskProjection) {
    console.log("setSelectedTask", projection);

    this.selectedTask = {
      taskId: projection.taskRef.id,
      listId: projection.list.id,
    };
  }

  @action
  setFocusedTask(projection: TaskProjection) {
    this.selectedTask = {
      taskId: projection.taskRef.id,
      listId: projection.list.id,
    };
    this.focusedTask = {
      taskId: projection.taskRef.id,
      listId: projection.list.id,
    };
  }

  @action
  resetFocus() {
    this.selectedTask = undefined;
  }

  @action
  resetSelected() {
    this.selectedTask = undefined;
    this.focusedTask = undefined;
  }
}

export const currentTaskState = new CurrentTaskState();
