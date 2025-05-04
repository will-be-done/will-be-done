import { Patch, apply, isDraft } from "mutative";
import {
  ActionFn,
  StoreApi,
  createContext,
  fnNameContext,
  sliceNameContext,
} from "./state";

export interface UndoEvent {
  patches: Patch[];
  inversePatches: Patch[];
  metadata?: {
    actionName?: string;
  };
}

export interface UndoManagerOptions {
  /**
   * Max number of undo levels to keep, or undefined for infinite.
   */
  maxUndoLevels?: number;

  /**
   * Max number of redo levels to keep, or undefined for infinite.
   */
  maxRedoLevels?: number;
}

export const undoDisabledContext = createContext<boolean>(
  "undoDisabledContext",
  false
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class UndoManager<T = any> {
  private undoStack: UndoEvent[] = [];
  private redoStack: UndoEvent[] = [];
  private isUndoRedoing = false;

  constructor(
    private store: StoreApi<T>,
    private options: UndoManagerOptions = {}
  ) {
    // Subscribe to store changes
    this.store.subscribe(this.handleStoreChange);
  }

  private handleStoreChange = (
    store: StoreApi<T>,
    _state: T,
    _prevState: T,
    patches: Patch[],
    inversePatches: Patch[]
  ) => {
    console.log("without undo", store.getContextValue(undoDisabledContext));
    // Skip recording if in the middle of undo/redo or if disabled
    if (this.isUndoRedoing || store.getContextValue(undoDisabledContext)) {
      return;
    }

    if (patches.length === 0) return;

    const event: UndoEvent = {
      patches,
      inversePatches,
    };

    this.addUndoEvent(event);

    // After recording a new event, the redo stack is invalidated
    this.redoStack = [];
  };

  private addUndoEvent(event: UndoEvent) {
    this.undoStack.push(event);

    // Enforce max undo levels if specified
    if (
      this.options.maxUndoLevels !== undefined &&
      this.undoStack.length > this.options.maxUndoLevels
    ) {
      this.undoStack = this.undoStack.slice(-this.options.maxUndoLevels);
    }
  }

  private enforceMaxRedoLevels() {
    if (
      this.options.maxRedoLevels !== undefined &&
      this.redoStack.length > this.options.maxRedoLevels
    ) {
      this.redoStack = this.redoStack.slice(-this.options.maxRedoLevels);
    }
  }

  /**
   * Returns if undo can be performed (if there is at least one undo action available).
   */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Returns if redo can be performed (if there is at least one redo action available).
   */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * The number of undo actions available.
   */
  get undoLevels(): number {
    return this.undoStack.length;
  }

  /**
   * The number of redo actions available.
   */
  get redoLevels(): number {
    return this.redoStack.length;
  }

  /**
   * Undoes the last action.
   * Will throw if there is no action to undo.
   */
  undo(): void {
    if (!this.canUndo) {
      throw new Error("Nothing to undo");
    }

    const event = this.undoStack.pop()!;
    this.redoStack.push(event);
    this.enforceMaxRedoLevels();

    this.isUndoRedoing = true;
    try {
      // Get current state
      const state = this.store.getState();

      // Apply inverse patches to get previous state
      const storeWithUndoDisabled = this.store
        .withContextValue(undoDisabledContext, true)
        .withContextValue(fnNameContext, "undo")
        .withContextValue(sliceNameContext, "undoSlice");

      // Create a new state by applying the inverse patches
      const newState = apply(state as object, event.inversePatches) as T;

      // Update the store with the new state
      storeWithUndoDisabled.____setState(
        newState,
        event.inversePatches,
        event.patches
      );
    } finally {
      this.isUndoRedoing = false;
    }
  }

  /**
   * Redoes the previous undone action.
   * Will throw if there is no action to redo.
   */
  redo(): void {
    if (!this.canRedo) {
      throw new Error("Nothing to redo");
    }

    const event = this.redoStack.pop()!;
    this.undoStack.push(event);

    // Enforce max undo levels if specified
    if (
      this.options.maxUndoLevels !== undefined &&
      this.undoStack.length > this.options.maxUndoLevels
    ) {
      this.undoStack = this.undoStack.slice(-this.options.maxUndoLevels);
    }

    this.isUndoRedoing = true;
    try {
      // Get current state
      const state = this.store.getState();

      // Apply patches to redo
      const storeWithUndoDisabled = this.store
        .withContextValue(undoDisabledContext, true)
        .withContextValue(fnNameContext, "redo")
        .withContextValue(sliceNameContext, "undoSlice");

      // Create a new state by applying the patches
      const newState = apply(state as object, event.patches) as T;

      // Update the store with the new state
      storeWithUndoDisabled.____setState(
        newState,
        event.patches,
        event.inversePatches
      );
    } finally {
      this.isUndoRedoing = false;
    }
  }

  /**
   * Clears the undo stack.
   */
  clearUndo(): void {
    this.undoStack = [];
  }

  /**
   * Clears the redo stack.
   */
  clearRedo(): void {
    this.redoStack = [];
  }
}

export const undoManagerContext = createContext<UndoManager | undefined>(
  "undoManager",
  undefined
);

export const getUndoManager = <T>(store: StoreApi<T>): UndoManager => {
  const manager = store.getContextValue(undoManagerContext);
  if (!manager) {
    throw new Error("Undo manager not found");
  }

  return manager;
};
/**
 * Creates an undo manager for the given store.
 *
 * @param store The store to manage undo/redo for
 * @param options Options for the undo manager
 * @returns An UndoManager instance
 */
export function withUndoManager<TState extends object>(
  store: StoreApi<TState>,
  options?: UndoManagerOptions
): StoreApi<TState> {
  return store.withContextValue(
    undoManagerContext,
    new UndoManager(store, options)
  );
}

export function withoutUndo<T, R>(
  store: StoreApi<T>,
  fn: (store: StoreApi<T>) => R
): R {
  return fn(store.withContextValue(undoDisabledContext, true));
}

export function withoutUndoAction<
  TRootState,
  TReturn = unknown,
  TParams extends unknown[] = unknown[]
>(fn: (arg: TRootState | StoreApi<TRootState>, ...params: TParams) => TReturn) {
  return (arg: TRootState | StoreApi<TRootState>, ...params: TParams) => {
    if (isDraft(arg)) {
      return fn(arg, ...params);
    } else {
      if (arg === null || typeof arg !== "object")
        throw new Error("first argument must be a store");
      if (
        !("getState" in arg && "subscribe" in arg && "withContextValue" in arg)
      )
        throw new Error("first argument must be a store");

      const store = arg as StoreApi<TRootState>;
      return withoutUndo(store, (store) => fn(store, ...params));
    }
  };
}
