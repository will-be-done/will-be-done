import { getRootStore } from "mobx-keystone";
import { RootStore } from "./models";

export const getRootStoreOrThrow = (node: object) => {
  const rootStore = getRootStore<RootStore>(node);
  if (!rootStore) throw new Error("Root store not found!");

  return rootStore;
};
