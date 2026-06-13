import type { HyperDB } from "../../hyperdb/core/contracts";
import type { TraceContext } from "./store";

const activeDBContexts = new WeakMap<HyperDB, TraceContext>();

export const setActiveTraceContextForDB = (
  db: HyperDB,
  context: TraceContext,
): (() => void) => {
  const previous = activeDBContexts.get(db);
  activeDBContexts.set(db, context);

  return () => {
    if (previous) {
      activeDBContexts.set(db, previous);
    } else {
      activeDBContexts.delete(db);
    }
  };
};

export const getActiveTraceContextForDB = (
  db: HyperDB,
): TraceContext | undefined => activeDBContexts.get(db);
