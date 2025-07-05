import React from "react";
import type { SubscribableDB } from "../hyperdb/subscribable-db";

const dbContext = React.createContext<SubscribableDB | null>(null);

export const DBProvider = dbContext.Provider;

export const useDB = () => {
  const store = React.useContext(dbContext);
  if (!store) {
    throw new Error("DB not provided");
  }
  return store as SubscribableDB;
};
