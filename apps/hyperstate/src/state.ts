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
          // @ts-expect-error it's ok
          draft[storeSymbol] = store;
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

// const replaceSliceFnName = "replaceSlice";
// // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
// type CreatedSlice<T extends Record<string, Function>> = T & {
//   [replaceSliceFnName]: (slice: CreatedSlice<T>) => void;
// };

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
    //@ts-expect-error it's ok
    sliceFn.sliceName = keyName;
    //@ts-expect-error it's ok
    sliceFn.namedFn = namedSliceFn;

    // Copy the cache and all other properties from the original selector
    // This is crucial for memoized functions to maintain their caching behavior
    Object.assign(namedSliceFn, sliceFn);

    // Add to result
    result[key] = namedSliceFn;
  }

  return result as T;
}

declare global {
  interface Window {
    __HYPERSTATE_ORIGINAL_ALL_SLICES?: Record<string, Record<string, any>>;
  }
}

export const replaceSlices = (
  namespace: string,
  oldSlices: Record<string, Record<string, any>>,
  newSlices: Record<string, Record<string, any>>,
) => {
  if (!window.__HYPERSTATE_ORIGINAL_ALL_SLICES) {
    window.__HYPERSTATE_ORIGINAL_ALL_SLICES = {};
    window.__HYPERSTATE_ORIGINAL_ALL_SLICES[namespace] = oldSlices;
  }

  for (const [key, newSlice] of Object.entries(newSlices)) {
    const oldSlice = window.__HYPERSTATE_ORIGINAL_ALL_SLICES[namespace]?.[key];

    if (!oldSlice) continue;

    for (const [key, newSliceFn] of Object.entries(newSlice)) {
      oldSlice[key] = newSliceFn;
    }
  }

  for (const storeRef of knownStores) {
    let store = storeRef.deref();
    if (!store) continue;

    store = store.withContextValue(fnNameContext, "replaceSlices");
    store = store.withContextValue(sliceNameContext, "root");

    store.____setState({ ...store.getState() }, [], []);
  }
};

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

export type QuerySelector<State, Result> = (state: State) => Result;

export type QueryFunction<State> = {
  <Result>(selector: QuerySelector<State, Result>): Result;
};
export type QuerySelectionLogic<State, Result, TArgs extends unknown[]> = (
  /**
   * Executes another selector and mark it as a dependency.
   */
  query: QueryFunction<State>,
  ...args: TArgs
) => Result;

export type SelectionLogic<State, Result, TArgs extends unknown[]> = (
  state: State,
  ...args: TArgs
) => Result;

export type DebuggableSelectionLogic<
  State,
  Result,
  TArgs extends unknown[],
> = ((state: State, ...args: TArgs) => Result) & {
  debug(state: State, ...args: TArgs): Result;
};

export type SlicedFn<State, Result, TArgs extends unknown[]> = SelectionLogic<
  State,
  Result,
  TArgs
> & {
  sliceName: string;
  namedFn: SelectionLogic<State, Result, TArgs>;
};

const defaultEqualityFn = (a: unknown, b: unknown) => a === b;
type EqualityFn = (a: unknown, b: unknown) => boolean;

function isObject(value: any): value is object {
  return typeof value === "object" && value !== null;
}

type WeakKey = object; // Simplified for this context

// --- Improved Cache Key Generation ---
const UNDEFINED_JSON_REPLACEMENT = {
  __is_undefined_cache_key_sentinel__: true,
};

function serializeForCacheKey(param: any): any {
  if (param === undefined) {
    return UNDEFINED_JSON_REPLACEMENT;
  }
  if (param instanceof Date) {
    // Use getTime() for a stable, numeric representation of the date
    return `Date(${param.getTime()})`;
  }
  if (Array.isArray(param)) {
    // Recursively serialize elements within nested arrays
    return param.map(serializeForCacheKey);
  }
  return param;
}

export function generateCacheKey(
  params: ReadonlyArray<
    | string
    | number
    | Date
    | Date[]
    | string[]
    | number[]
    | undefined
    | undefined[]
    | null
    | null[]
  >,
): string {
  const processedParams = params.map(serializeForCacheKey);
  // JSON.stringify is robust for primitives and arrays once undefined/Date are handled.
  // It distinguishes numbers from strings (e.g., 1 vs "1" in the JSON output).
  return JSON.stringify(processedParams);
}

const isTracking = Symbol("isTracking");
const raw = Symbol("raw");
const wasStateCalled = Symbol("wasStateCalled");

type Trackable<T> = T & {
  [isTracking]: boolean;
  [raw]: T;
  [wasStateCalled]: () => boolean;
};
function trackAccess<T extends object>(obj: T): Trackable<T> {
  let wasCalled = false;
  return new Proxy(
    {
      ...obj,
      [isTracking]: true,
      [raw]: obj,
      [wasStateCalled]: () => wasCalled,
    },
    {
      get(target, prop) {
        if (
          prop !== raw &&
          prop !== wasStateCalled &&
          prop !== isTracking &&
          prop !== storeSymbol
        ) {
          wasCalled = true;
        }

        return (target as any)[prop];
      },
    },
  );
}
function isTrackable<T extends object>(obj: T): obj is Trackable<T> {
  return (obj as any)[isTracking] === true;
}

function formatDebugTreeSimple(entries: DebugEntry[]): string {
  const output: string[] = [];
  if (!entries.length) return "";

  function printRecursive(
    startIndex: number,
    parentDepth: number,
    prefix: string,
  ): number {
    const children: number[] = [];
    let i = startIndex;

    // Find all direct children (entries at parentDepth + 1)
    while (i < entries.length) {
      const entry = entries[i];

      if (!entry) {
        throw new Error("entry not found");
      }

      // If we hit an entry at or shallower than parentDepth, we're done with this parent's children
      if (entry.depth <= parentDepth) {
        break;
      }

      // If this is a direct child (exactly one level deeper)
      if (entry.depth === parentDepth + 1) {
        children.push(i);
      }

      i++;
    }

    // Process each direct child
    children.forEach((childIndex, arrayIndex) => {
      const entry = entries[childIndex];
      const isLast = arrayIndex === children.length - 1;
      const isFirst = childIndex === 0; // First entry in entire array

      if (!entry) {
        throw new Error("entry not found");
      }

      // Choose connector
      let connector = "├──";
      if (isFirst && parentDepth === -1) {
        // parentDepth -1 means we're at root level
        connector = "┌──";
      } else if (isLast) {
        connector = "└──";
      }

      // Format entry
      let entryDisplay = `${entry.sliceName} ${entry.log}`;
      if (entry.duration !== undefined) {
        entryDisplay += ` (duration: ${entry.duration}ms)`;
      }

      output.push(`${prefix}${connector} ${entryDisplay}`);

      // Recursively print this child's children
      const newPrefix = prefix + (isLast ? "   " : "│  ");
      printRecursive(childIndex + 1, entry.depth, newPrefix);
    });

    return i;
  }

  // Start with parentDepth -1 to find all root entries (depth 0)
  printRecursive(0, -1, "");
  return output.join("\n");
}
let currentSelectorDependencies: Map<
  SelectionLogic<any, any, any>,
  { value: WeakRef<WeakKey> | any; params: any[] }
> = new Map();

const isSlicedFn = <State, Result, TArgs extends unknown[]>(
  fn: SelectionLogic<State, Result, TArgs>,
): fn is SlicedFn<State, Result, TArgs> => {
  return "sliceName" in fn;
};

let depth = -1;
let isDebug = false;
let debugEntries: DebugEntry[] = [];
type DebugEntry = {
  depth: number;
  sliceName: string;
  log: string;
  duration?: number;
};

// IDEA: maybe use map tree for args instead on stringify?
export function createSelectorCreator<TRootState extends object>() {
  const selectCreator = <
    TReturn,
    TParams extends any[],
    // | string
    // | number
    // | Date
    // | Date[]
    // | string[]
    // | number[]
    // | undefined
    // | undefined[]
    // | null
    // | null[]
    // | Record<
    //     string,
    //     | string
    //     | number
    //     | Date
    //     | Date[]
    //     | string[]
    //     | number[]
    //     | undefined
    //     | undefined[]
    //     | null
    //     | null[]
    //   >
  >(
    selectionLogic: SelectionLogic<TRootState, TReturn, TParams>,
    selectEqualityFn: EqualityFn = defaultEqualityFn,
  ) => {
    type CacheEntry = {
      previousState: TRootState | undefined;
      // For the main selector result:
      valueRef?: WeakRef<WeakKey>; // WeakRef if TReturn is an object
      valuePrimitive?: TReturn; // Direct value if TReturn is primitive
      valueUnregisterToken?: object; // Unique token for FinalizationRegistry
      // For dependencies: Stored with strong references
      dependencies: Map<
        SelectionLogic<any, any, any>,
        {
          value: any;
          params: any[];
        }
      >;
      wasStateCalled: boolean;
    };

    const memoized = new Map<string, CacheEntry>();

    const registry = new FinalizationRegistry<string>(
      (cacheKeyHoldingStaleValue) => {
        if (memoized.has(cacheKeyHoldingStaleValue)) {
          memoized.delete(cacheKeyHoldingStaleValue);

          if (!isSlicedFn(selectorCache)) {
            throw new Error("selectionLogic must be a sliced function");
          }

          console.log(
            `%cCACHE: Entry for key ${selectorCache.sliceName}(${cacheKeyHoldingStaleValue}) removed because its main value was GC'd.`,
            "color: red; font-weight: bold;",
          );
        }
      },
    );

    // setInterval(() => {
    //   if (!isSlicedFn(selectorCache)) {
    //     throw new Error("selectionLogic must be a sliced function");
    //   }
    //
    //   console.log("memoized", selectorCache.sliceName, new Map(memoized));
    // }, 5000);

    const selectorCache = ((__state: TRootState, ...params: TParams) => {
      if (!isSlicedFn(selectorCache)) {
        throw new Error("selectionLogic must be a sliced function");
      }

      depth++;
      let realState: TRootState;
      if (isTrackable(__state)) {
        realState = __state[raw];
      } else {
        realState = __state;
      }

      if (isDraft(realState)) {
        return selectionLogic(realState, ...params);
      }

      if (isDebug) {
        debugEntries.push({
          depth,
          sliceName: selectorCache.sliceName,
          log: "wrap call",
        });
      }

      const setAndReturn = <TReturn>(newResult: TReturn) => {
        currentSelectorDependencies.set(selectorCache.namedFn, {
          value: newResult,
          params,
        });
        debugEntries.push({
          depth,
          sliceName: selectorCache.sliceName,
          log: "set dep",
        });
        // console.log("setDeps", selectorCache.sliceName, newResult, params);

        return newResult;
      };

      const trackableState = trackAccess(realState);

      const key = generateCacheKey(params);
      const currentEntry = memoized.get(key);
      let mainOldValueInstance: TReturn | undefined = undefined;
      let oldUnregisterToken: object | undefined = undefined;

      try {
        if (currentEntry) {
          if (isDebug) {
            debugEntries.push({
              depth,
              sliceName: selectorCache.sliceName,
              log: "cache hit",
            });
          }

          oldUnregisterToken = currentEntry.valueUnregisterToken;

          if (currentEntry.valueRef) {
            const dereferencedValue = currentEntry.valueRef.deref();
            if (dereferencedValue === undefined) {
              // Main value was GC'd. Registry should handle cleanup.
            } else {
              mainOldValueInstance = dereferencedValue as TReturn;
            }
          } else {
            mainOldValueInstance = currentEntry.valuePrimitive;
          }

          if (mainOldValueInstance !== undefined) {
            if (currentEntry.previousState === realState) {
              if (isDebug) {
                debugEntries.push({
                  depth,
                  sliceName: selectorCache.sliceName,
                  log: "same state and args, return cache",
                });
              }

              return setAndReturn(mainOldValueInstance);
            }

            if (!currentEntry.wasStateCalled) {
              if (isDebug) {
                debugEntries.push({
                  depth,
                  sliceName: selectorCache.sliceName,
                  log: "start deps check",
                });
              }

              let depsChanged = false;
              for (const [
                depSelector,
                oldDepData,
              ] of currentEntry.dependencies.entries()) {
                const oldDepValue = oldDepData.value;

                const newDepValue = depSelector(
                  realState,
                  ...oldDepData.params,
                );

                if (newDepValue !== oldDepValue) {
                  depsChanged = true;
                  break;
                }
              }

              if (!depsChanged) {
                if (isDebug) {
                  if (currentEntry.dependencies.size === 0) {
                    debugEntries.push({
                      depth,
                      sliceName: selectorCache.sliceName,
                      log: "WARNING: no deps to check",
                    });
                  } else {
                    debugEntries.push({
                      depth,
                      sliceName: selectorCache.sliceName,
                      log: "same deps, return cache",
                    });
                  }
                }

                memoized.set(key, {
                  ...currentEntry,
                  previousState: realState,
                });

                return setAndReturn(mainOldValueInstance);
              }

              if (isDebug) {
                debugEntries.push({
                  depth,
                  sliceName: selectorCache.sliceName,
                  log: "not same deps, recalculate",
                });
              }
            } else {
              if (isDebug) {
                debugEntries.push({
                  depth,
                  sliceName: selectorCache.sliceName,
                  log: "skip dep check due to state call",
                });
              }
            }
          }
        } else {
          if (isDebug) {
            debugEntries.push({
              depth,
              sliceName: selectorCache.sliceName,
              log: "cache miss",
            });
          }
        }

        let startTime: number | undefined;
        let duration: number | undefined;

        if (isDebug) {
          startTime = performance.now();
        }
        const previousSelectorDependencies = currentSelectorDependencies;
        currentSelectorDependencies = new Map();
        const selectorDependencies = currentSelectorDependencies;

        const newResult = selectionLogic(trackableState, ...params);
        if (startTime !== undefined) {
          duration = performance.now() - startTime;
        }
        currentSelectorDependencies = previousSelectorDependencies;

        let valueToStore: TReturn = newResult;
        let valueToReturn: TReturn = newResult;
        let newUnregisterToken: object | undefined = undefined;
        let actualValueObjectToRegister: WeakKey | undefined = undefined;

        if (isDebug) {
          debugEntries.push({
            depth,
            sliceName: selectorCache.sliceName,
            log: "selector call",
            duration,
          });
        }

        if (
          mainOldValueInstance !== undefined &&
          selectEqualityFn(mainOldValueInstance, newResult)
        ) {
          if (isDebug) {
            debugEntries.push({
              depth,
              sliceName: selectorCache.sliceName,
              log: "return is not changed, returning cache",
            });
          }

          valueToStore = mainOldValueInstance;
          valueToReturn = mainOldValueInstance;
          if (isObject(mainOldValueInstance)) {
            actualValueObjectToRegister = mainOldValueInstance as WeakKey;
            newUnregisterToken = oldUnregisterToken;
          }
        } else {
          if (isDebug) {
            debugEntries.push({
              depth,
              sliceName: selectorCache.sliceName,
              log: "return is changed, returning new value",
            });
          }

          if (isObject(newResult)) {
            actualValueObjectToRegister = newResult as WeakKey;
            newUnregisterToken = {};
          }
        }

        if (
          oldUnregisterToken &&
          (!newUnregisterToken || newUnregisterToken !== oldUnregisterToken)
        ) {
          registry.unregister(oldUnregisterToken);
        }

        const newCacheEntry: CacheEntry = {
          previousState: realState,
          dependencies: selectorDependencies,
          wasStateCalled: trackableState[wasStateCalled](),
          valueUnregisterToken: newUnregisterToken,
        };

        if (actualValueObjectToRegister) {
          newCacheEntry.valueRef = new WeakRef(actualValueObjectToRegister);
          if (newUnregisterToken && newUnregisterToken !== oldUnregisterToken) {
            registry.register(
              actualValueObjectToRegister,
              key,
              newUnregisterToken,
            );
          }
        } else {
          newCacheEntry.valuePrimitive = valueToStore;
        }

        memoized.set(key, newCacheEntry);

        return setAndReturn(valueToReturn);
      } finally {
        depth--;

        if (depth === -1) {
          currentSelectorDependencies = new Map();
        }
      }
    }) as DebuggableSelectionLogic<TRootState, TReturn, TParams>;

    selectorCache.debug = (state: TRootState, ...args: TParams) => {
      debugEntries = [];
      isDebug = true;

      const startTime = performance.now();
      try {
        return selectorCache(state, ...args);
      } finally {
        isDebug = false;
        const duration = performance.now() - startTime;
        console.log(
          formatDebugTreeSimple(debugEntries) +
            `\ntotal duration: ${duration}ms`,
        );
        debugEntries = [];
      }
    };

    return selectorCache;
  };

  return selectCreator;
}

// --- createSelectorCreator Implementation ---
export function createQuerySelectorCreator<TRootState = any>() {
  const selectCreator = <
    TReturn,
    TParams extends (
      | string
      | number
      | Date
      | Date[]
      | string[]
      | number[]
      | undefined
      | undefined[]
      | null
      | null[]
    )[],
  >(
    selectionLogic: QuerySelectionLogic<TRootState, TReturn, TParams>,
    selectEqualityFn: EqualityFn = defaultEqualityFn,
  ) => {
    type CacheEntry = {
      previousState: TRootState | undefined;
      // For the main selector result:
      valueRef?: WeakRef<WeakKey>; // WeakRef if TReturn is an object
      valuePrimitive?: TReturn; // Direct value if TReturn is primitive
      valueUnregisterToken?: object; // Unique token for FinalizationRegistry
      // For dependencies: Stored with strong references
      dependencies: Map<QuerySelector<TRootState, any>, { value: any }>;
    };

    const memoized = new Map<string, CacheEntry>();

    const registry = new FinalizationRegistry<string>(
      (cacheKeyHoldingStaleValue) => {
        if (memoized.has(cacheKeyHoldingStaleValue)) {
          memoized.delete(cacheKeyHoldingStaleValue);
          console.log(
            `%cCACHE: Entry for key '${cacheKeyHoldingStaleValue}' removed because its main value was GC'd.`,
            "color: red; font-weight: bold;",
          );
        }
      },
    );

    const wrappedSelector = (state: TRootState, ...params: TParams) => {
      if (isDraft(state)) {
        const queryDraft: QueryFunction<TRootState> = (
          querier: QuerySelector<TRootState, any>,
        ) => querier(state);
        return selectionLogic(queryDraft, ...params);
      }

      const key = generateCacheKey(params);
      const currentEntry = memoized.get(key);
      let mainOldValueInstance: TReturn | undefined = undefined;
      let oldUnregisterToken: object | undefined = undefined;

      if (currentEntry) {
        oldUnregisterToken = currentEntry.valueUnregisterToken;
        if (currentEntry.valueRef) {
          const dereferencedValue = currentEntry.valueRef.deref();
          if (dereferencedValue === undefined) {
            // Main value was GC'd. Registry should handle cleanup.
          } else {
            mainOldValueInstance = dereferencedValue as TReturn;
          }
        } else {
          mainOldValueInstance = currentEntry.valuePrimitive;
        }

        if (mainOldValueInstance !== undefined) {
          if (currentEntry.previousState === state) {
            return mainOldValueInstance;
          }

          let depsChanged = false;
          for (const [
            depSelector,
            oldDepData, // This is now { value: any }
          ] of currentEntry.dependencies.entries()) {
            const newDepValue = depSelector(state);
            // Direct comparison with the strongly held old dependency value
            if (newDepValue !== oldDepData.value) {
              depsChanged = true;
              break;
            }
          }

          if (!depsChanged) {
            memoized.set(key, {
              ...currentEntry,
              previousState: state,
            });
            return mainOldValueInstance;
          }
        }
      }

      // Recompute
      const newDependencies = new Map<
        QuerySelector<TRootState, any>,
        { value: any } // Storing dependency values directly (strong reference)
      >();
      const query: QueryFunction<TRootState> = (
        querier: QuerySelector<TRootState, any>,
      ) => {
        const existingDep = newDependencies.get(querier);
        if (existingDep) {
          return existingDep.value;
        }
        const value = querier(state);
        newDependencies.set(querier, { value }); // Store the actual value
        return value;
      };

      const newResult = selectionLogic(query, ...params);

      if (newDependencies.size === 0) {
        throw new Error(
          "Selector malfunction: " +
            "The selection logic must select some data by calling `query(selector)` at least once.",
        );
      }

      let valueToStore: TReturn = newResult;
      let valueToReturn: TReturn = newResult;
      let newUnregisterToken: object | undefined = undefined;
      let actualValueObjectToRegister: WeakKey | undefined = undefined;

      if (
        mainOldValueInstance !== undefined &&
        selectEqualityFn(mainOldValueInstance, newResult)
      ) {
        valueToStore = mainOldValueInstance;
        valueToReturn = mainOldValueInstance;
        if (isObject(mainOldValueInstance)) {
          actualValueObjectToRegister = mainOldValueInstance as WeakKey;
          newUnregisterToken = oldUnregisterToken;
        }
      } else {
        if (isObject(newResult)) {
          actualValueObjectToRegister = newResult as WeakKey;
          newUnregisterToken = {};
        }
      }

      if (
        oldUnregisterToken &&
        (!newUnregisterToken || newUnregisterToken !== oldUnregisterToken)
      ) {
        registry.unregister(oldUnregisterToken);
      }

      const newCacheEntry: CacheEntry = {
        previousState: state,
        dependencies: newDependencies, // newDependencies now holds strong refs to dep values
        valueUnregisterToken: newUnregisterToken,
      };

      if (actualValueObjectToRegister) {
        newCacheEntry.valueRef = new WeakRef(actualValueObjectToRegister);
        if (newUnregisterToken && newUnregisterToken !== oldUnregisterToken) {
          registry.register(
            actualValueObjectToRegister,
            key,
            newUnregisterToken,
          );
        }
      } else {
        newCacheEntry.valuePrimitive = valueToStore;
      }

      memoized.set(key, newCacheEntry);
      return valueToReturn;
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

export const storeSymbol = Symbol("storeSymbol");
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

const knownStores: WeakRef<StoreApi<any>>[] = [];
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

  // TODO: maybe store last N states and use weakRef on previous state at selectors?
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

  const newStore = createStore({});
  knownStores.push(new WeakRef(newStore));

  return newStore;
}
