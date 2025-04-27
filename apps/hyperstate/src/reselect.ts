function deepEqual<T>(a: T, b: T): boolean {
  // Handle primitive types and references to the same object
  if (a === b) {
    return true;
  }

  // Handle case where either value is null or not an object
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }

  // Handle Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }

    return true;
  }

  // Make sure both are objects (not arrays, as we already checked that)
  if (Array.isArray(a) || Array.isArray(b)) {
    return false;
  }

  // Get keys from both objects
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);

  // Check if both objects have the same number of properties
  if (keysA.length !== keysB.length) {
    return false;
  }

  // Check if every key in a exists in b and that their values are deeply equal
  for (const key of keysA) {
    if (!deepEqual((a as any)[key], (b as any)[key])) {
      return false;
    }
  }

  return true;
}
export type SelectorContext<State> = {
  /**
   * makeSelector creates a selector based on given selectionLogic.
   *
   * @param selectionLogic - The selection logic. It will be passed a
   * function `query` which you can call to invoke other selectors.
   * By doing so, the dependencies between selectors will be tracked
   * automatically.
   */
  makeSelector<Result>(
    selectionLogic: SelectionLogic<State, Result>,
  ): EnhancedSelector<State, Result>;

  /**
   * Sets an invocation wrapper function. This allows intercepting when a
   * selector is invoked. The wrapper function **MUST** return the result of
   * calling `executeSelector` function, or the whole thing will break down.
   *
   * For example:
   *
   *     context.setWrapper(executeSelector => {
   *       return executeSelector()
   *     })
   */
  setInvocationWrapper(wrapper: InvocationWrapper<State>): void;

  /**
   * Sets an computation wrapper function. This allows intercepting when a
   * selector is recomputed. The wrapper function **MUST** return the result of
   * calling `computeResult` function, or the whole thing will break down.
   *
   * For example:
   *
   *     context.setComputationWrapper(computeResult => {
   *       return computeResult()
   *     })
   */
  setComputationWrapper(wrapper: ComputationWrapper<State>): void;
};

/**
 * Selector selects some data from the state tree.
 */
export type Selector<State, Result> = (state: State) => Result;

/**
 * EnhancedSelector is a selector function returned by `makeSelector`.
 * It comes with extra methods to help you introspect.
 */
export type EnhancedSelector<State, Result> = Selector<State, Result> & {
  selectionLogic: SelectionLogic<State, Result>;

  /**
   * recomputations returns the number of times this selector
   * has to recompute its output.
   */
  recomputations(): number;

  /**
   * resetRecomputations resets the recomputations counter to 0.
   */
  resetRecomputations(): number;

  /**
   * Returns the internal state of the selector.
   * Internal state is generated after the selector is computed/recomputed.
   * For debugging purposes.
   */
  introspect(): InternalSelectorState<State, Result> | undefined;
};

type InternalSelectorState<State, Result> = {
  stateVersion: number;
  value: Result;
  dependencies: Map<Selector<State, any>, any>;
};

/**
 * The selection logic to be passed to `makeSelector`. It will be passed a
 * function `query` which you can call to invoke other selectors.
 * By doing so, the dependencies between selectors will be tracked
 * automatically.
 */
export type SelectionLogic<State, Result> = (
  /**
   * Executes another selector and mark it as a dependency.
   */
  query: QueryFunction<State>,
) => Result;

export type InvocationWrapper<State> = (
  executeSelector: () => any,
  selector: EnhancedSelector<State, any>,
  state: State,
) => any;

export type ComputationWrapper<State> = (
  computeResult: () => any,
  selector: EnhancedSelector<State, any>,
  state: State,
  reason: Selector<State, any> | undefined,
) => any;

/**
 * QueryFunction can be used to invoke another selector and mark
 * that selector as a dependency.
 */
export type QueryFunction<State> = {
  <Result>(selector: Selector<State, Result>): Result;

  /**
   * The earliest selector that caused the selector result to be
   * invalidated.
   */
  reason: Selector<State, any> | undefined;
};

/**
 * Selects the state.
 */
export const selectState: <State>(state: State) => State = (state) => state;

/**
 * Creates a new context for selection. Useful if you want a statically-typed
 * `makeSelector` function.
 */
export function createSelectionContext<State>(): SelectorContext<State> {
  // To prevent memory leak, we avoid storing reference to the whole state
  // tree inside each selector. Instead, we store the version number of
  // the input.
  let latestSelection: { state: State; version: number } | undefined;

  // A wrapper may be set to intercept selector invocations and computations
  // (e.g. for debugging, tracing or profiling purposes)
  let invocationWrapper: InvocationWrapper<State> | undefined;
  let computationWrapper: ComputationWrapper<State> | undefined;

  function makeSelector<Result>(
    selectionLogic: SelectionLogic<State, Result>,
  ): EnhancedSelector<State, Result> {
    let recomputations = 0;

    /**
     * The result of previous computation
     */
    let cachedResult: InternalSelectorState<State, Result> | undefined;

    function select(state: State): Result {
      // Set up initial global state.
      if (!latestSelection) {
        latestSelection = { state: state, version: 1 };
      }

      // Increment state version if state changed.
      if (latestSelection.state !== state) {
        latestSelection.state = state;
        latestSelection.version += 1;
      }

      const currentStateVersion = latestSelection.version;

      /**
       * In the 1st computation, `reason` will be undefined. In subsequent
       * recomputations, `reason` will be the selector which caused the
       * invalidation of cached result.
       */
      let reason: Selector<State, any> | undefined;

      if (cachedResult) {
        // Short-circuit: input state tree is the same
        if (currentStateVersion === cachedResult.stateVersion) {
          return cachedResult.value;
        }

        // Check if dependencies changed
        let changed = false;
        for (const [selector, value] of cachedResult.dependencies.entries()) {
          if (selector(state) !== value) {
            changed = true;
            reason = selector;
            break;
          }
        }
        if (!changed) {
          return cachedResult.value;
        }
      }

      // At this point, either it’s the 1st computation, or one of the
      // dependencies must have changed its result.
      recomputations += 1;

      const dependencies = new Map<Selector<State, any>, any>();

      const query: QueryFunction<State> = Object.assign(
        (selector: Selector<State, any>) => {
          if (dependencies.has(selector)) return dependencies.get(selector);
          const value = selector(state);
          dependencies.set(selector, value);
          return value;
        },
        { reason },
      );

      const resultValue = computationWrapper
        ? computationWrapper(
            () => selectionLogic(query),
            enhancedSelector,
            state,
            reason,
          )
        : selectionLogic(query);

      // Require that a selection logic must make at least one call to `query`.
      if (dependencies.size === 0) {
        throw new Error(
          "[rereselect] Selector malfunction: " +
            "The selection logic must select some data by calling `query(selector)` at least once.",
        );
      }

      // Memoize the result.
      cachedResult = {
        stateVersion: currentStateVersion,
        dependencies,
        value: resultValue,
      };

      return resultValue;
    }

    const enhancedSelector = Object.assign(
      function selector(state: State): Result {
        if (!invocationWrapper) {
          return select(state);
        }
        return invocationWrapper(() => select(state), enhancedSelector, state);
      },
      {
        selectionLogic: selectionLogic,
        recomputations: () => recomputations,
        resetRecomputations: () => (recomputations = 0),
        introspect: () => cachedResult,
      },
    );

    return enhancedSelector;
  }

  return {
    makeSelector,
    setInvocationWrapper: (fn) => {
      invocationWrapper = fn;
    },
    setComputationWrapper: (fn) => {
      computationWrapper = fn;
    },
  };
}

const defaultContext = createSelectionContext<any>();

/**
 * makeSelector creates a selector based on given selectionLogic.
 *
 * @param selectionLogic - The selection logic. It will be passed a
 * function `query` which you can call to invoke other selectors.
 * By doing so, the dependencies between selectors will be tracked
 * automatically.
 */
export const makeSelector = defaultContext.makeSelector;
