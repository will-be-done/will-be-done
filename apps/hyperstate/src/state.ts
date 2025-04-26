/* eslint-disable @typescript-eslint/no-explicit-any */
import { Draft, Patch, produceWithPatches } from "immer";
import { memoize as originalMemoize } from "proxy-memoize";

import { enablePatches } from "immer";
enablePatches();

let isActionExecuting = false;

export type Dispatch<TRootState> = <TReturn>(
  actionCreator: (state: TRootState, dispatch: Dispatch<TRootState>) => TReturn,
) => TReturn;

export type ActionFn<
  TRootState,
  TReturn = unknown,
  TParams extends unknown[] = unknown[],
> = (
  state: TRootState,
  dispatch: Dispatch<TRootState>,
  ...params: TParams
) => TReturn;

export interface ActionCreatorFunction<TRootState = any> {
  <TReturn, TParams extends unknown[]>(
    actionFn: ActionFn<TRootState, TReturn, TParams>,
  ): (
    ...params: TParams
  ) => (state: TRootState, dispatch: Dispatch<TRootState>) => TReturn;
}

export function createActionCreator<
  TRootState = any,
>(): ActionCreatorFunction<TRootState> {
  const actionCreator = <TReturn, TParams extends unknown[]>(
    actionFn: ActionFn<TRootState, TReturn, TParams>,
  ) => {
    return (...params: TParams) => {
      return (state: TRootState, dispatch: Dispatch<TRootState>) => {
        return actionFn(state, dispatch, ...params);
      };
    };
  };

  return actionCreator as ActionCreatorFunction<TRootState>;
}

export type Action<
  TRootState,
  TReturn = unknown,
  TParams extends unknown[] = unknown[],
> = (
  actionFn: ActionFn<TRootState, TReturn, TParams>,
) => (
  ...params: TParams
) => (state: TRootState, dispatch: Dispatch<TRootState>) => TReturn;

export function action<
  TRootState,
  TReturn = unknown,
  TParams extends unknown[] = unknown[],
>(actionFn: ActionFn<TRootState, TReturn, TParams>) {
  return (...params: TParams) => {
    return (state: TRootState, dispatch: Dispatch<TRootState>) => {
      return actionFn(state, dispatch, ...params);
    };
  };
}
export function memoize<Obj extends object, Result>(
  fn: (obj: Obj) => Result,
  options?: { size?: number; noWeakMap?: boolean },
): (obj: Obj) => Result {
  const memoized = originalMemoize(fn, options);

  return (obj: Obj) => {
    if (isActionExecuting) {
      return fn(obj);
    } else {
      return memoized(obj);
    }
  };
}

type Options = Omit<NonNullable<Parameters<typeof memoize>[1]>, "noWeakMap">;
export const memoizeWithArgs = <Args extends unknown[], Result>(
  fnWithArgs: (...args: Args) => Result,
  options?: Options,
) => {
  const fn = memoize((args: Args) => fnWithArgs(...args), {
    ...options,
    noWeakMap: true,
  });
  return (...args: Args) => {
    if (isActionExecuting) {
      return fnWithArgs(...args);
    } else {
      return fn(args);
    }
  };
};

// const rootStore = Symbol();
// const markAsRoot = (obj: unknown) => {
//   if (obj === null || typeof obj !== "object")
//     throw new Error("root store is not an object");
//
//   (obj as any)[rootStore] = true;
// };
// const isRoot = (obj: unknown): obj is { [rootStore]: true } => {
//   if (obj === null || typeof obj !== "object") return false;
//
//   return (obj as any)[rootStore] === true;
// };
// markAsRoot(scope.state);

export type StoreApi<TState> = {
  getState: () => TState;
  getInitialState: () => TState;
  dispatch: Dispatch<TState>;
  subscribe: (
    listener: (
      state: TState,
      prevState: TState,
      patches: Patch[],
      reversePatches: Patch[],
    ) => void,
  ) => () => void;
};

export function createStore<TState>(initialState: TState): StoreApi<TState> {
  const scope: {
    state: TState;
    currentDraft: Draft<TState> | undefined;
  } = {
    state: initialState,
    currentDraft: undefined,
  };

  const listeners = new Set<Listener>();

  type Listener = (
    state: TState,
    prevState: TState,
    patches: Patch[],
    reversePatches: Patch[],
  ) => void;

  const dispatch = <TReturn>(
    actionFn: (store: TState, dispatch: Dispatch<TState>) => TReturn,
  ): TReturn => {
    if (scope.currentDraft) {
      return actionFn(
        scope.currentDraft as TState,
        dispatch as Dispatch<TState>,
      );
    }

    let nextState: TState;
    const previousState = scope.state;
    let patches: Patch[];
    let inversePatches: Patch[];

    let result!: TReturn;

    try {
      isActionExecuting = true;
      const [resultState, resultPatches, resultInversePatches] =
        produceWithPatches(scope.state, (draft) => {
          scope.currentDraft = draft;
          try {
            result = actionFn(draft as TState, dispatch as Dispatch<TState>);
          } finally {
            scope.currentDraft = undefined;
          }
        });

      nextState = resultState;
      patches = resultPatches;
      inversePatches = resultInversePatches;
    } finally {
      isActionExecuting = false;
    }

    scope.state = nextState;

    try {
      listeners.forEach((listener) =>
        listener(nextState, previousState, patches, inversePatches),
      );
    } catch (e) {
      console.error(e);
    }

    return result;
  };

  return {
    getInitialState() {
      return initialState;
    },
    getState(): TState {
      return scope.state;
    },
    dispatch: dispatch as Dispatch<TState>,
    subscribe(listener: Listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
