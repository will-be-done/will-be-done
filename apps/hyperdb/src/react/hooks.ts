import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DependencyList,
} from "react";
import {
  initSelector,
  runSelectorAsync,
  select,
  type SelectRangeCmd,
  isNeedToRerunRange,
} from "../hyperdb/selector";
import { useDB } from "./context";
import { asyncDispatch, syncDispatch } from "../hyperdb";

export function useSyncSelector<TReturn>(
  gen: () => Generator<unknown, TReturn, unknown>,
  deps: DependencyList,
  debugKey?: string,
): TReturn {
  const db = useDB();
  const selector = useMemo(() => {
    return initSelector(db, gen, debugKey);
  }, [db, ...(deps || [])]);

  return useSyncExternalStore(selector.subscribe, selector.getSnapshot);
}

export function useAsyncSelector<TReturn>(
  gen: () => Generator<unknown, TReturn, unknown>,
  deps: DependencyList,
  debugKey?: string,
): { isPending: boolean; data: TReturn | undefined } {
  const db = useDB();
  const [state, setState] = useState<{
    isPending: boolean;
    data: TReturn | undefined;
  }>({ isPending: true, data: undefined });
  const selectRangeCmdsRef = useRef<SelectRangeCmd[]>([]);
  const genRef = useRef(gen);
  genRef.current = gen;

  useEffect(() => {
    let cancelled = false;
    let generation = 0;

    setState((prev) => (prev.isPending ? prev : { isPending: true, data: prev.data }));

    const run = async () => {
      const myGen = ++generation;
      const cmds: SelectRangeCmd[] = [];
      // TODO: we can detetect if CachedDB has already cached value in range,
      // and don't spawn async/await promise that may dramatically improve performance
      const value = await runSelectorAsync(db, genRef.current, cmds);
      if (!cancelled && myGen === generation) {
        selectRangeCmdsRef.current = cmds;
        setState({ isPending: false, data: value });
      }
    };

    void run();

    const unsubscribe = db.subscribe((ops) => {
      // Only skip if we already have cmds AND they don't need rerun
      if (
        selectRangeCmdsRef.current.length > 0 &&
        !isNeedToRerunRange(selectRangeCmdsRef.current, ops)
      ) {
        if (debugKey) {
          console.log("async selector no need to rerun", debugKey, ops);
        }
        return;
      }

      void run();

      if (debugKey) {
        console.log("async selector callback", debugKey);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [db, ...(deps || [])]);

  return state;
}

export function useDispatch() {
  const db = useDB();

  return useCallback(
    <TReturn>(action: Generator<unknown, TReturn, unknown>): TReturn => {
      return syncDispatch(db, action);
    },
    [db],
  );
}

export function useAsyncDispatch() {
  const db = useDB();

  return useCallback(
    <TReturn>(
      action: Generator<unknown, TReturn, unknown>,
    ): Promise<TReturn> => {
      return asyncDispatch(db, action);
    },
    [db],
  );
}

export function useSelect() {
  const db = useDB();

  return useCallback(
    <TReturn>(selector: Generator<unknown, TReturn, unknown>): TReturn => {
      return select(db, selector);
    },
    [db],
  );
}

export function useAsyncSelect() {
  const db = useDB();

  return useCallback(
    <TReturn>(gen: Generator<unknown, TReturn, unknown>): Promise<TReturn> => {
      return runSelectorAsync(db, () => gen);
    },
    [db],
  );
}
