// import { deepClone } from "mutative";
import { createContext, StoreApi, storeSymbol } from "./state";

type Entity<T> = {
  id: string;
  type: T;
};

export type Action<TEntity extends { id: string; type: string }> = {
  entityType: TEntity["type"];
} & (
  | { action: "create"; new: TEntity }
  | {
      action: "update";
      new: TEntity;
      old: TEntity;
    }
  | { action: "delete"; old: TEntity }
);

// Define a constraint for the root state structure
export interface StateSlice<T extends Entity<string>> {
  byIds: Record<string, T>;
}

// Create a mapped type for entity types to their corresponding slice in the state
// type EntityTypeToStateMap<TRootState> = {
//   [K in keyof TRootState]: TRootState[K] extends {
//     byIds: Record<string, infer E>;
//   }
//     ? E extends { type: string }
//       ? E["type"]
//       : never
//     : never;
// };

// // Invert the map to go from entity type string to the entity type
// type EntityTypeMap<TRootState> = {
//   [K in EntityTypeToStateMap<TRootState>[keyof TRootState]]: Extract<
//     TRootState[keyof TRootState]["byIds"][string],
//     { type: K }
//   >;
// };

// The fixed entity listener function with better type inference
export function withEntityListener<
  TRootState extends Record<string, { byIds: Record<string, Entity<string>> }>,
>(
  store: StoreApi<TRootState>,
  listeners: {
    [K in keyof TRootState]?: (
      state: TRootState,
      action: Action<TRootState[K]["byIds"][string]>,
    ) => void;
  },
) {
  return store.withContextValue(entityListenersContext, {
    ...listeners,
  });
}

// // Exa
//
const entityListenersContext = createContext<
  Record<string, (state: any, action: Action<any>) => void>
>("entityListenersContext", {});
//
// export const withEntityListener = <
//   TEntity extends { id: string; type: string },
//   TRootState extends {
//     [K in TEntity["type"]]: {
//       byIds: { [id: string]: Entity<TEntity["type"]> };
//     };
//   },
// >(
//   store: StoreApi<TRootState>,
//   listeners: Record<
//     TEntity["type"],
//     (state: TRootState, action: Action<TEntity>) => void
//   >,
// ) => {
//   return store.withContextValue(entityListenersContext, {
//     ...listeners,
//   });
// };

export function update<
  TEntity extends { id: string; type: string },
  TRootState extends {
    [K in TEntity["type"]]: { byIds: { [id: string]: TEntity } };
  },
>(
  state: TRootState,
  id: string,
  toUpdate: Partial<TEntity> & { type: TEntity["type"] },
): TEntity {
  const store = (state as any)[storeSymbol] as StoreApi<TRootState>;
  const listeners = store.getContextValue(entityListenersContext);

  const listener = listeners[toUpdate.type];

  // TODO: use deep clone
  const old = Object.assign({}, state[toUpdate.type].byIds[id]);
  const newVal = Object.assign(state[toUpdate.type].byIds[id], toUpdate);

  if (listener) {
    listener(state, {
      entityType: toUpdate.type,
      action: "update",
      new: newVal,
      old,
    });
  }

  return state[toUpdate.type].byIds[id];
}
