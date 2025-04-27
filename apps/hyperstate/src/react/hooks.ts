import React from "react";
import { useStore } from "./context";
import { Select } from "../state";

export function useSelector<TState, TStateSlice>(
  selector: (state: TState, select: Select<TState>) => TStateSlice,
) {
  const store = useStore<TState>();

  const slice = React.useSyncExternalStore(
    store.subscribe,
    () => store.select(selector),
    // () => store.select(selector),
  );

  React.useDebugValue(slice);

  return slice;
}

export function useDispatch<TState>() {
  const store = useStore<TState>();

  return store.dispatch;
}
