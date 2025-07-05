import { useMemo, useSyncExternalStore } from "react";
import { initSelector } from "../hyperdb/selector";
import { useDB } from "./context";

export function useSyncSelector<TReturn>(
  gen: () => Generator<unknown, TReturn, unknown>,
): TReturn {
  const db = useDB();
  const selector = useMemo(() => {
    return initSelector(db, gen);
  }, [db, gen]);

  return useSyncExternalStore(selector.subscribe, selector.getSnapshot);
}
