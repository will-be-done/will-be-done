import React from "react";
import { useStore } from "./context";

export function useSelector<TState, TStateSlice>(
  selector: (state: TState) => TStateSlice,
) {
  const store = useStore<TState>();

  const slice = React.useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getInitialState()),
  );

  React.useDebugValue(slice);

  return slice;
}
