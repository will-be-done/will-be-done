import { action, makeObservable, observable } from "mobx";
import { type Projection } from "../models/models";

class CurrentProjectionState {
  @observable selectedProjection:
    | {
        projectionId: string;
        listId: string;
      }
    | undefined;
  @observable focusedProjection:
    | {
        projectionId: string;
        listId: string;
      }
    | undefined;

  constructor() {
    makeObservable(this);
  }

  isSomethingSelected() {
    return !!this.selectedProjection;
  }

  isSomethingFocused() {
    return !!this.focusedProjection;
  }

  makeSelectionFocused() {
    this.focusedProjection = this.selectedProjection;
  }

  isProjSelected(projection: Projection) {
    if (!this.selectedProjection) return false;

    return (
      this.selectedProjection?.projectionId === projection.id &&
      this.selectedProjection?.listId === projection.listRef.id
    );
  }

  isEditing() {
    return this.focusedProjection !== undefined;
  }

  isProjFocused(projection: Projection) {
    if (!this.focusedProjection) return false;

    return (
      this.focusedProjection?.projectionId === projection.id &&
      this.focusedProjection?.listId === projection.listRef.id
    );
  }

  @action
  setSelectedProjection(projection: Projection) {
    if (this.isProjSelected(projection)) return;

    this.selectedProjection = {
      projectionId: projection.id,
      listId: projection.listRef.id,
    };

    this.focusedProjection = undefined;
  }

  @action
  setFocusedProjection(projection: Projection) {
    if (this.isProjFocused(projection)) return;

    this.selectedProjection = {
      projectionId: projection.id,
      listId: projection.listRef.id,
    };
    this.focusedProjection = {
      projectionId: projection.id,
      listId: projection.listRef.id,
    };
  }

  @action
  resetFocus() {
    this.focusedProjection = undefined;
  }

  @action
  resetSelected() {
    this.selectedProjection = undefined;
    this.focusedProjection = undefined;
  }
}

export const currentProjectionState = new CurrentProjectionState();
