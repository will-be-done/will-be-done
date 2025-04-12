import { action, makeObservable, observable } from "mobx";

class CurrentProjectionState {
  @observable selectedItemId: string | undefined;
  @observable focusedItemId: string | undefined;

  constructor() {
    makeObservable(this);
  }

  isSomethingSelected() {
    return !!this.selectedItemId;
  }

  isSomethingFocused() {
    return !!this.focusedItemId;
  }

  @action
  makeSelectionFocused() {
    this.focusedItemId = this.selectedItemId;
  }

  isItemSelected(id: string) {
    if (!this.selectedItemId) return false;

    return this.selectedItemId === id;
  }

  isEditing() {
    return this.focusedItemId !== undefined;
  }

  isItemFocused(id: string) {
    if (!this.focusedItemId) return false;

    return this.focusedItemId == id;
  }

  @action
  setSelectedItem(id: string) {
    if (this.isItemSelected(id)) return;

    this.selectedItemId = id;
    this.focusedItemId = undefined;
  }

  @action
  setFocusedItemId(id: string) {
    if (this.isItemFocused(id)) return;

    this.selectedItemId = id;
    this.focusedItemId = id;
  }

  @action
  resetFocus() {
    this.focusedItemId = undefined;
  }

  @action
  resetSelected() {
    this.selectedItemId = undefined;
    this.focusedItemId = undefined;
  }
}

export const currentProjectionState = new CurrentProjectionState();
