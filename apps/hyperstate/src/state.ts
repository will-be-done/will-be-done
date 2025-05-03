/* eslint-disable @typescript-eslint/no-explicit-any */
// import { Draft, isDraft, Patch, produceWithPatches } from "immer";
// import { memoize as originalMemoize } from "proxy-memoize";

import { create, isDraft, Draft, Patch } from "mutative";

// let isActionExecuting = false;

// export type Dispatch<TRootState> = <TReturn>(
//   actionCreator: (rootState: TRootState) => TReturn,
// ) => TReturn;

export type ActionFn<
  TRootState,
  TReturn = unknown,
  TParams extends unknown[] = unknown[],
> = (rootState: TRootState, ...params: TParams) => TReturn;

// Define a type for the action creator result (the function returned by the action creator)
export type ActionCreatorResult<TRootState, TReturn> = (
  rootState: TRootState,
) => TReturn;

// Define a type for the action creator itself
export type ActionCreator<TRootState, TReturn, TParams extends unknown[]> = (
  ...params: TParams
) => ActionCreatorResult<TRootState, TReturn>;

export interface ActionCreatorFunction<TRootState = any> {
  <TReturn, TParams extends unknown[]>(
    actionFn: ActionFn<TRootState, TReturn, TParams>,
  ): (state: TRootState | StoreApi<TRootState>, ...params: TParams) => TReturn;
}

// TODO: use weakmap
export function createActionCreator<
  TRootState = any,
>(): ActionCreatorFunction<TRootState> {
  const actionCreator = <TReturn, TParams extends unknown[]>(
    actionFn: ActionFn<TRootState, TReturn, TParams>,
  ) => {
    const wrappedAction = (
      arg: TRootState | StoreApi<TRootState>,
      ...params: TParams
    ) => {
      if (isDraft(arg)) {
        return actionFn(arg as TRootState, ...params);
      } else {
        if (arg === null || typeof arg !== "object")
          throw new Error("first argument must be a store");
        if (!(storeSymbol in arg))
          throw new Error("first argument must be a store");

        const store = arg;
        const state = store.getState();

        let result!: TReturn;
        const performDraftAction = (draft: Draft<TRootState>): void => {
          result = actionFn(draft as TRootState, ...params);
          // TODO: add deep traversal draft check of result
        };

        const [nextState, patches, inversePatches] = create(
          state,
          performDraftAction,
          {
            enablePatches: true,
          },
        );

        if (patches.length > 0) {
          store.____setState(nextState, patches, inversePatches);
        }

        return result;
      }
    };

    return wrappedAction;
  };

  return actionCreator;

  // return actionCreator as ActionCreatorFunction<TRootState>;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function createSlice<T extends Record<string, Function>>(
  sliceFns: T,
  sliceName: string = "slice",
): T {
  const result: Record<string, any> = {};

  for (const [key, sliceFn] of Object.entries(sliceFns)) {
    const keyName = key + "Fn";
    // Create a unique name for the selector to avoid conflicts
    const fnText = `
      // Create named function with the same behavior
      const ${keyName} = function (store, ...args) {
        if (typeof store === 'object' && store !== null && store[__storeSymbol] === true) {
          store = store.withContextValue(__fnNameCtx, "${key}");
          store = store.withContextValue(__sliceNameCtx, __sliceName);
        }
        // Call the original with the same arguments
        return __sliceFn.apply(this, [store, ...args]);
      }
      
      // Return the named function
      return ${keyName};
    `;

    // Create the named function directly using Function constructor
    const createFn = new Function(
      "__sliceFn",
      "__fnNameCtx",
      "__storeSymbol",
      "__sliceName",
      "__sliceNameCtx",
      fnText,
    );
    const namedSliceFn = createFn(
      sliceFn,
      fnNameContext,
      storeSymbol,
      sliceName,
      sliceNameContext,
    );

    // Copy the cache and all other properties from the original selector
    // This is crucial for memoized functions to maintain their caching behavior
    Object.assign(namedSliceFn, sliceFn);

    // Add to result
    result[key] = namedSliceFn;
  }

  return result as T;
}

// export type Action<
//   TRootState,
//   TReturn = unknown,
//   TParams extends unknown[] = unknown[],
// > = (
//   actionFn: ActionFn<TRootState, TReturn, TParams>,
// ) => (
//   ...params: TParams
// ) => (state: TRootState, dispatch: Dispatch<TRootState>) => TReturn;

// export function action<
//   TRootState,
//   TReturn = unknown,
//   TParams extends unknown[] = unknown[],
// >(actionFn: ActionFn<TRootState, TReturn, TParams>) {
//   return (...params: TParams) => {
//     return (select: TRootState, dispatch: Dispatch<TRootState>) => {
//       return actionFn(select, dispatch, ...params);
//     };
//   };
// }
//
// export function memoize<Obj extends object, Result>(
//   fn: (obj: Obj) => Result,
//   options?: { size?: number; noWeakMap?: boolean },
// ): (obj: Obj) => Result {
//   const memoized = originalMemoize(fn, options);
//
//   return (obj: Obj) => {
//     if (isActionExecuting) {
//       return fn(obj);
//     } else {
//       return memoized(obj);
//     }
//   };
// }

// export function createActions<TRootState = any>(
//   actions: Record<
//     string,
//     (
//       ...params: any[]
//     ) => (select: TRootState, dispatch: Dispatch<TRootState>) => any
//   >,
// ) {
//   const result: Record<string, any> = {};
//
//   for (const [key, actionCreator] of Object.entries(actions)) {
//     // Create a unique name for the action to avoid conflicts
//     const fnText = `
//       // Create named action creator wrapper
//       function ${key}ActionCreator(...params) {
//         const originalExecFn = __actionCreator(...params);
//
//         // Create named execution function - this will show in stack traces
//         function ${key}ExecutionFn(state, dispatch) {
//           return originalExecFn(state, dispatch);
//         }
//
//         return ${key}ExecutionFn;
//       }
//
//       // Return the named action creator function
//       return ${key}ActionCreator;
//     `;
//
//     // Create the named function directly using indirect eval
//     // This ensures the function is created in the global scope with proper naming
//     const createFn = new Function("__actionCreator", fnText);
//     const namedActionCreator = createFn(actionCreator);
//
//     // Copy properties from original action creator
//     Object.assign(namedActionCreator, actionCreator);
//
//     // Add to result
//     result[key] = namedActionCreator;
//   }
//
//   return result as typeof actions;
// }
//
// // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
// export function createSelectors<T extends Record<string, Function>>(
//   selectors: T,
// ): T {
//   const result: Record<string, any> = {};
//
//   for (const [key, selector] of Object.entries(selectors)) {
//     const fnText = `
//       // Create named action creator wrapper
//       function ${key}Selector(...params) {
//         const originalExecFn = __selector(...params);
//
//         // Create named execution function - this will show in stack traces
//         function ${key}SelectorFn(state, dispatch) {
//           return originalExecFn(state, dispatch);
//         }
//
//         return ${key}SelectorFn;
//       }
//
//       // Return the named action creator function
//       return ${key}Selector;
//     `;
//
//     // // Create a unique name for the selector to avoid conflicts
//     // const fnText = `
//     //   // Create named selector function with the same behavior
//     //   function ${key}Selector(...args) {
//     //     // Call the original selector with the same arguments
//     //     return __selector.apply(this, args);
//     //   }
//     //
//     //   // Return the named selector function
//     //   return ${key}Selector;
//     // `;
//
//     // Create the named function directly using Function constructor
//     const createFn = new Function("__selector", fnText);
//     const namedSelector = createFn(selector);
//
//     // Copy the cache and all other properties from the original selector
//     // This is crucial for memoized functions to maintain their caching behavior
//     Object.assign(namedSelector, selector);
//
//     // Add to result
//     result[key] = namedSelector;
//   }
//
//   return result as T;
// }

// type Options = Omit<NonNullable<Parameters<typeof memoize>[1]>, "noWeakMap">;
// export const memoizeWithArgs = <Args extends unknown[], Result>(
//   fnWithArgs: (...args: Args) => Result,
//   options?: Options,
// ) => {
//   const fn = memoize((args: Args) => fnWithArgs(...args), {
//     ...options,
//     noWeakMap: true,
//   });
//   return (...args: Args) => {
//     if (isActionExecuting) {
//       return fnWithArgs(...args);
//     } else {
//       return fn(args);
//     }
//   };
// };

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

export type Selector<State, Result> = (state: State) => Result;

export type QueryFunction<State> = {
  <Result>(selector: Selector<State, Result>): Result;
};
export type SelectionLogic<State, Result, TArgs extends unknown[]> = (
  /**
   * Executes another selector and mark it as a dependency.
   */
  query: QueryFunction<State>,
  ...args: TArgs
) => Result;

// export type Select<TRootState> = <TReturn>(
//   selectCreator: (query: Querier<TRootState, TReturn>) => TReturn,
// ) => TReturn;
//
// export type SelectFn<
//   TRootState,
//   TReturn = unknown,
//   TParams extends unknown[] = unknown[],
// > = (query: Select<TRootState>, ...params: TParams) => TReturn;
//
// // Define a type for the action creator itself
// export type SelectCreator<TRootState, TReturn, TParams extends unknown[]> = (
//   query: Select<TRootState>,
//   ...params: TParams
// ) => TReturn;
//
// export interface SelectCreatorFunction<TRootState = any> {
//   <TReturn, TParams extends unknown[]>(
//     selectFn: SelectFn<TRootState, TReturn, TParams>,
//   ): (state: TRootState, ...params: TParams) => TReturn;
// }

const defaultEqualityFn = (a: unknown, b: unknown) => a === b;
type EqualityFn = (a: unknown, b: unknown) => boolean;

// TODO: add dependencies cache check like in rereselect
export function createSelectorCreator<TRootState = any>() {
  const selectCreator = <
    TReturn,
    TParams extends (string | number | Date | Date[] | string[] | number[])[],
  >(
    selectionLogic: SelectionLogic<TRootState, TReturn, TParams>,
    selectEqualityFn: EqualityFn = defaultEqualityFn,
  ) => {
    const memoized = new Map<
      string,
      {
        previousState: TRootState | undefined;
        value: TReturn;
        dependencies: Map<Selector<TRootState, any>, { value: any }>;
      }
    >();

    const wrappedSelector = (state: TRootState, ...params: TParams) => {
      if (isDraft(state)) {
        const query: QueryFunction<TRootState> = (
          querier: Selector<TRootState, any>,
        ) => {
          return querier(state);
        };

        return selectionLogic(query, ...params);
      }

      const key = params.join(",");
      const mem = memoized.get(key);

      if (mem) {
        if (mem.previousState === state) {
          return mem.value;
        }

        let changed = false;
        for (const [selector, { value }] of mem.dependencies.entries()) {
          // console.log(selector, equalityFn);
          if (selector(state) !== value) {
            changed = true;

            break;
          }
        }

        // console.log("changed", selectionLogic, changed);

        if (!changed) {
          memoized.set(key, {
            value: mem.value,
            previousState: state, // still need to update to new state
            dependencies: mem.dependencies,
          });

          return mem.value;
        }
      }

      const dependencies = new Map<Selector<TRootState, any>, any>();
      const query: QueryFunction<TRootState> = (
        querier: Selector<TRootState, any>,
        equalityFn: (a: unknown, b: unknown) => boolean = defaultEqualityFn,
      ) => {
        // console.log("query", querier);
        // console.log("---");
        // console.log(equalityFn);

        if (dependencies.has(querier)) return dependencies.get(querier);
        const value = querier(state);
        dependencies.set(querier, { value, equalityFn });

        return value;
      };

      const result = selectionLogic(query, ...params);

      if (dependencies.size === 0) {
        throw new Error(
          "Selector malfunction: " +
            "The selection logic must select some data by calling `query(selector)` at least once.",
        );
      }

      if (mem && selectEqualityFn(mem.value, result)) {
        memoized.set(key, {
          value: mem.value,
          previousState: state, // still need to update to new state
          dependencies: dependencies,
        });

        return mem.value;
      }

      memoized.set(key, {
        value: result,
        previousState: state, // still need to update to new state

        dependencies: dependencies,
      });

      return result;
    };

    return wrappedSelector;
  };

  return selectCreator;
}

type Listener<TState> = (
  store: StoreApi<TState>,
  state: TState,
  prevState: TState,
  patches: Patch[],
  reversePatches: Patch[],
) => void;

type Context<V> = { name: string; value: V };

export const createContext = <V>(
  name: string,
  defaultValue: V,
): Context<V> => ({
  name,
  value: defaultValue,
});

export const fnNameContext = createContext<string>(
  "fnNameContext",
  "anonymous",
);

export const sliceNameContext = createContext<string>(
  "sliceNameContext",
  "slice",
);

const storeSymbol = Symbol("storeSymbol");
export type StoreApi<TState> = {
  ____setState: (
    state: TState,
    patches: Patch[],
    reversePatches: Patch[],
  ) => void;
  getState: () => TState;
  getInitialState: () => TState;
  getListeners: () => Set<Listener<TState>>;
  withContextValue: <V>(ctx: Context<V>, val: V) => StoreApi<TState>;
  getContextValue<V>(ctx: Context<V>): V;
  // dispatch: Dispatch<TState>;
  // select: Select<TState>;
  subscribe: (
    listener: (
      store: StoreApi<TState>,
      state: TState,
      prevState: TState,
      patches: Patch[],
      reversePatches: Patch[],
    ) => void,
  ) => () => void;
  [storeSymbol]: true;
};

// const storeSymbol = Symbol("storeSymbol");

export function createStore<TState>(initialState: TState): StoreApi<TState> {
  const scope: {
    state: TState;
    currentDraft: Draft<TState> | undefined;
  } = {
    state: initialState,
    currentDraft: undefined,
  };

  const listeners = new Set<Listener<TState>>();

  // type Listener = (
  //   state: TState,
  //   prevState: TState,
  //   patches: Patch[],
  //   reversePatches: Patch[],
  //   store: StoreApi<TState>,
  // ) => void;

  // const dispatch = <TReturn>(actionFn: (state: TState) => TReturn): TReturn => {
  //   if (scope.currentDraft) {
  //     return actionFn(
  //       scope.currentDraft as TState,
  //       dispatch as Dispatch<TState>,
  //     );
  //   }
  //
  //   let nextState: TState;
  //   const previousState = scope.state;
  //   let patches: Patch[];
  //   let inversePatches: Patch[];
  //
  //   let result!: TReturn;
  //
  //   try {
  //     isActionExecuting = true;
  //     const [resultState, resultPatches, resultInversePatches] =
  //       produceWithPatches(scope.state, (draft) => {
  //         scope.currentDraft = draft;
  //         try {
  //           result = actionFn(draft as TState, dispatch as Dispatch<TState>);
  //         } finally {
  //           scope.currentDraft = undefined;
  //         }
  //       });
  //
  //     nextState = resultState;
  //     patches = resultPatches;
  //     inversePatches = resultInversePatches;
  //   } finally {
  //     isActionExecuting = false;
  //   }
  //
  //   scope.state = nextState;
  //
  //   try {
  //     listeners.forEach((listener) =>
  //       listener(nextState, previousState, patches, inversePatches),
  //     );
  //   } catch (e) {
  //     console.error(e);
  //   }
  //
  //   return result;
  // };

  // let patchesToNotify: Patch[] = [];
  // let inversePatchesToNotify: Patch[] = [];
  // let prevState: TState | undefined;
  // let lastStore: StoreApi<TState> | undefined;
  // let wasQueued = false;
  //
  // const notifyListeners = () => {
  //   const notifyListener = (listener: Listener<TState>) => {
  //     return listener(scope.state, state, prevState, patches, inversePatches);
  //   };
  //   store.getListeners().forEach((listener) => {
  //     try {
  //       notifyListener(listener);
  //     } catch (e) {
  //       console.error(e);
  //     }
  //   });
  // };

  const createStore = (
    contextMap: Record<string, Context<unknown>>,
  ): StoreApi<TState> => {
    const store: StoreApi<TState> = {
      getContextValue<V>(ctx: Context<V>) {
        const data = contextMap[ctx.name];
        if (!data) {
          return ctx.value;
        }

        return data.value as V;
      },
      withContextValue<V>(ctx: Context<V>, val: V) {
        const newCtx = {
          ...contextMap,
          [ctx.name]: { name: ctx.name, value: val },
        };

        return createStore(newCtx);
      },
      getListeners() {
        return listeners;
      },
      getInitialState() {
        return initialState;
      },
      getState(): TState {
        return scope.state;
      },
      ____setState(state: TState, patches: Patch[], inversePatches: Patch[]) {
        const prevState = scope.state;
        scope.state = state;

        const notifyListeners = () => {
          const notifyListener = (listener: Listener<TState>) => {
            return listener(store, state, prevState, patches, inversePatches);
          };
          store.getListeners().forEach((listener) => {
            try {
              notifyListener(listener);
            } catch (e) {
              console.error(e);
            }
          });
        };

        notifyListeners();
      },
      subscribe(listener: Listener<TState>) {
        listeners.add(listener);

        return () => {
          listeners.delete(listener);
        };
      },
      [storeSymbol]: true,
    };

    return store;
  };

  return createStore({});
}
