import { useMemo, useSyncExternalStore, type DependencyList } from "react";
import { initSelector } from "../hyperdb/selector";
import { useDB } from "./context";

export function useSyncSelector<TReturn>(
  gen: () => Generator<unknown, TReturn, unknown>,
  deps?: DependencyList,
): TReturn {
  const db = useDB();
  const selector = useMemo(() => {
    return initSelector(db, gen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ...(deps || [])]);

  return useSyncExternalStore(selector.subscribe, selector.getSnapshot);
}
