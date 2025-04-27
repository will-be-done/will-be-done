/* eslint-disable @typescript-eslint/no-explicit-any */
import { Draft, Patch, produceWithPatches } from "immer";
import { memoize as originalMemoize } from "proxy-memoize";

import { enablePatches, setAutoFreeze } from "immer";

setAutoFreeze(false);
enablePatches();

let isActionExecuting = false;

export type Dispatch<TRootState> = <TReturn>(
  actionCreator: (
    select: Select<TRootState>,
    dispatch: Dispatch<TRootState>,
  ) => TReturn,
) => TReturn;

export type ActionFn<
  TRootState,
  TReturn = unknown,
  TParams extends unknown[] = unknown[],
> = (
  select: Select<TRootState>,
  dispatch: Dispatch<TRootState>,
  ...params: TParams
) => TReturn;

// Define a type for the action creator result (the function returned by the action creator)
export type ActionCreatorResult<TRootState, TReturn> = (
  select: Select<TRootState>,
  dispatch: Dispatch<TRootState>,
) => TReturn;

// Define a type for the action creator itself
export type ActionCreator<TRootState, TReturn, TParams extends unknown[]> = (
  ...params: TParams
) => ActionCreatorResult<TRootState, TReturn>;

export interface ActionCreatorFunction<TRootState = any> {
  <TReturn, TParams extends unknown[]>(
    actionFn: ActionFn<TRootState, TReturn, TParams>,
  ): (
    ...params: TParams
  ) => (select: Select<TRootState>, dispatch: Dispatch<TRootState>) => TReturn;

  // Special handling for union types - collapses parameter and return types
  // <TReturns extends unknown[], TParamsTuple extends unknown[][]>( actionFn: ActionFn<TRootState, TReturns[number], TParamsTuple[number]>,
  // ): ActionCreator<
  //   TRootState,
  //   TReturns[number],
  //   {
  //     [K in keyof TParamsTuple[number]]: TParamsTuple[number][K];
  //   }
  // >;
}

export function createActionCreator<
  TRootState = any,
>(): ActionCreatorFunction<TRootState> {
  const actionCreator = <TReturn, TParams extends unknown[]>(
    actionFn: ActionFn<TRootState, TReturn, TParams>,
  ) => {
    return (...params: TParams) => {
      return (select: Select<TRootState>, dispatch: Dispatch<TRootState>) => {
        return actionFn(select, dispatch, ...params);
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
    return (select: Select<TRootState>, dispatch: Dispatch<TRootState>) => {
      return actionFn(select, dispatch, ...params);
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

export function createActions<TRootState = any>(
  actions: Record<
    string,
    (
      ...params: any[]
    ) => (select: Select<TRootState>, dispatch: Dispatch<TRootState>) => any
  >,
) {
  const result: Record<string, any> = {};

  for (const [key, actionCreator] of Object.entries(actions)) {
    // Create a unique name for the action to avoid conflicts
    const fnText = `
      // Create named action creator wrapper
      function ${key}ActionCreator(...params) {
        const originalExecFn = __actionCreator(...params);
        
        // Create named execution function - this will show in stack traces
        function ${key}ExecutionFn(state, dispatch) {
          return originalExecFn(state, dispatch);
        }
        
        return ${key}ExecutionFn;
      }
      
      // Return the named action creator function
      return ${key}ActionCreator;
    `;

    // Create the named function directly using indirect eval
    // This ensures the function is created in the global scope with proper naming
    const createFn = new Function("__actionCreator", fnText);
    const namedActionCreator = createFn(actionCreator);

    // Copy properties from original action creator
    Object.assign(namedActionCreator, actionCreator);

    // Add to result
    result[key] = namedActionCreator;
  }

  return result as typeof actions;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function createSelectors<T extends Record<string, Function>>(
  selectors: T,
): T {
  const result: Record<string, any> = {};

  for (const [key, selector] of Object.entries(selectors)) {
    const fnText = `
      // Create named action creator wrapper
      function ${key}Selector(...params) {
        const originalExecFn = __selector(...params);
        
        // Create named execution function - this will show in stack traces
        function ${key}SelectorFn(state, dispatch) {
          return originalExecFn(state, dispatch);
        }
        
        return ${key}SelectorFn;
      }
      
      // Return the named action creator function
      return ${key}Selector;
    `;

    // // Create a unique name for the selector to avoid conflicts
    // const fnText = `
    //   // Create named selector function with the same behavior
    //   function ${key}Selector(...args) {
    //     // Call the original selector with the same arguments
    //     return __selector.apply(this, args);
    //   }
    //
    //   // Return the named selector function
    //   return ${key}Selector;
    // `;

    // Create the named function directly using Function constructor
    const createFn = new Function("__selector", fnText);
    const namedSelector = createFn(selector);

    // Copy the cache and all other properties from the original selector
    // This is crucial for memoized functions to maintain their caching behavior
    Object.assign(namedSelector, selector);

    // Add to result
    result[key] = namedSelector;
  }

  return result as T;
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

// export function selector<
//   TState extends object,
//   TResult,
//   TArgs extends (string | number)[],
// >(selectionLogic: SelectionLogic<TState, TResult>) {
//   const madeSelector = makeSelector(selectionLogic);
//   const memoized = new Map<string, (state: TState) => TResult>();
//
//   return (state: TState, ...args: TArgs) => {
//     if (args.length === 1) {
//       if (isActionExecuting) {
//         return selectionLogic((q) => q(state));
//       } else {
//         return madeSelector(state);
//       }
//     } else {
//       const key = args.join(",");
//       if (memoized.has(key)) return memoized.get(key)!;
//       const selectionLogic = selectionLogic(...args);
//       const sel = selector(selectionLogic);
//       memoized.set(key, sel);
//
//       return sel;
//     }
//   };
// }

// export function argSelector<
//   TState extends object,
//   TArgs extends (string | number)[],
//   TResult,
// >(
//   selectionLogicGenerator: (...args: TArgs) => SelectionLogic<TState, TResult>,
// ) {
//   const memoized = new Map<string, (state: TState) => TResult>();
//
//   return function (...args: TArgs) {
//     const key = args.join(",");
//     if (memoized.has(key)) return memoized.get(key)!;
//     const selectionLogic = selectionLogicGenerator(...args);
//     const sel = selector(selectionLogic);
//     memoized.set(key, sel);
//
//     return sel;
//   };
// }

// export const makeQuerySelector = () => {};
// export type Selector<State, Result> = (state: State) => Result;
// type SelectFunction<State, Args extends unknown[]> = {
//   <Result>(selector: Selector<State, Result>, ...args: Args): Result;
// };
// export type SelectionLogic<State, Args extends unknown[], Result> = (
//   select: SelectFunction<State, Args>,
// ) => Result;
//

export type Select<TRootState> = <TReturn>(
  selectCreator: (state: TRootState, select: Select<TRootState>) => TReturn,
) => TReturn;

export type SelectFn<
  TRootState,
  TReturn = unknown,
  TParams extends unknown[] = unknown[],
> = (
  state: TRootState,
  select: Select<TRootState>,
  ...params: TParams
) => TReturn;

// Define a type for the action creator result (the function returned by the action creator)
export type SelectCreatorResult<TRootState, TReturn> = (
  state: TRootState,
  select: Select<TRootState>,
) => TReturn;

// Define a type for the action creator itself
export type SelectCreator<TRootState, TReturn, TParams extends unknown[]> = (
  ...params: TParams
) => SelectCreatorResult<TRootState, TReturn>;

export interface SelectCreatorFunction<TRootState = any> {
  <TReturn, TParams extends unknown[]>(
    selectFn: SelectFn<TRootState, TReturn, TParams>,
  ): (
    ...params: TParams
  ) => (state: TRootState, select: Select<TRootState>) => TReturn;

  // Special handling for union types - collapses parameter and return types
  // <TReturns extends unknown[], TParamsTuple extends unknown[][]>( actionFn: ActionFn<TRootState, TReturns[number], TParamsTuple[number]>,
  // ): ActionCreator<
  //   TRootState,
  //   TReturns[number],
  //   {
  //     [K in keyof TParamsTuple[number]]: TParamsTuple[number][K];
  //   }
  // >;
}

export function createSelectorCreator<
  TRootState = any,
>(): SelectCreatorFunction<TRootState> {
  const selectCreator = <TReturn, TParams extends unknown[]>(
    selectFn: SelectFn<TRootState, TReturn, TParams>,
  ) => {
    const memoized = new Map<string, TReturn>();
    let previousState: TRootState | undefined = undefined;

    return (...params: TParams) => {
      const key = params.join(",");

      // for (const p of params) {
      //   if (p
      // }

      return (state: TRootState, select: Select<TRootState>) => {
        if (previousState === state && memoized.has(key))
          return memoized.get(key)!;

        previousState = state;

        const result = selectFn(state, select, ...params);
        memoized.set(key, result);

        return result;
      };
    };
  };

  return selectCreator as SelectCreatorFunction<TRootState>;
}

export type StoreApi<TState> = {
  getState: () => TState;
  getInitialState: () => TState;
  dispatch: Dispatch<TState>;
  select: Select<TState>;
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

  const select: Select<TState> = (selectCreator) => {
    const state = scope.currentDraft ?? scope.state;

    return selectCreator(state as TState, select);
  };

  const dispatch = <TReturn>(
    actionFn: (select: Select<TState>, dispatch: Dispatch<TState>) => TReturn,
  ): TReturn => {
    if (scope.currentDraft) {
      return actionFn(select, dispatch as Dispatch<TState>);
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
            result = actionFn(select, dispatch as Dispatch<TState>);
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
    select,
    subscribe(listener: Listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
