import React from "react";
import { StoreApi } from "../state";

const storeContext = React.createContext<StoreApi<unknown> | null>(null);

export const StoreProvider = storeContext.Provider;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
export const useStore = <TState extends unknown>() => {
  const store = React.useContext(storeContext);
  if (!store) {
    throw new Error("Store not provided");
  }
  return store as StoreApi<TState>;
};
