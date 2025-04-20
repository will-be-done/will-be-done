import { AnyModel, createContext, onPatches } from "mobx-keystone";
import { createNanoEvents, type Emitter } from "nanoevents";
import { Database, SyncableTables } from "./schema";

export let withoutSyncVal = false;

export const withoutSync = <T>(func: () => T): T => {
  const prevValue = withoutSyncVal;
  withoutSyncVal = true;

  try {
    return func();
  } finally {
    withoutSyncVal = prevValue;
  }
};

export function withoutSyncAction<T>(
  _target: unknown,
  _propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<T>,
) {
  const originalMethod = descriptor.value;

  //wrapping the original method
  // @ts-expect-error error here
  descriptor.value = function (...args) {
    return withoutSync<T>(() => {
      // @ts-expect-error error here
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      return originalMethod.apply(this, args);
    });
  };
}
export type SyncableModel<T> = T & {
  id: string;
  $modelType: string;
};

export enum SyncableModelChangeType {
  Create = "create",
  Update = "update",
  Delete = "delete",
  Load = "load",
}

export type SyncableModelChange<T = unknown> = {
  type: SyncableModelChangeType;
  model: AnyModel & SyncableModel<T>;
};

export type SyncableEvents = {
  modelEvent: (events: SyncableModelChange) => void;
};

export const syncChangesCtx = createContext<Emitter<SyncableEvents>>();

// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
export const buildAndAttachEmitter = (obj: Object) => {
  const emitter = createNanoEvents<SyncableEvents>();

  syncChangesCtx.set(obj, emitter);

  return emitter;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export const syncable = (constructor: Function) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const originalAttached = constructor.prototype.onAttachedToRootStore;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const originalInit = constructor.prototype.onInit;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  constructor.prototype.onInit = function () {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-this-alias
    const model = this;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.__withoutSyncValInit = withoutSyncVal;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return originalInit?.apply(model);
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  constructor.prototype.onAttachedToRootStore = function () {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-this-alias
    const model = this;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const disposer = originalAttached?.apply(model);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const emitter = syncChangesCtx.get(model);

    if (!emitter) {
      throw new Error("Did you forget to set syncChangesCtx?");
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (this.__withoutSyncValInit === false && withoutSyncVal === false) {
      emitter.emit("modelEvent", {
        type: SyncableModelChangeType.Create,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        model,
      });
    } else {
      emitter.emit("modelEvent", {
        type: SyncableModelChangeType.Load,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        model,
      });
    }

    // TODO: not sure that such thing will be good for performance,
    // but somehow we need to react only on the whole state tree value changes
    // Also patches is the only way to intercept  value of withoutSyncVal
    // For observe() it will be always false.
    //
    // I think it's better to create issue on github about my use-case, myabe authoe will
    // suggest better solution
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const patchesDisposer = onPatches(model, () => {
      if (withoutSyncVal) {
        return;
      }

      emitter.emit("modelEvent", {
        type: SyncableModelChangeType.Update,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        model,
      });
    });

    return () => {
      patchesDisposer();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      disposer?.();

      if (withoutSyncVal) return;

      emitter.emit("modelEvent", {
        type: SyncableModelChangeType.Delete,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        model,
      });
    };
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Class<T = any> = new (...args: any[]) => T;

export interface SyncableItem<A extends AnyModel, T extends keyof Database> {
  id: string;
  syncTable: T;
}

export interface SyncableRegistry<
  A extends AnyModel = AnyModel,
  T extends keyof SyncableTables = keyof SyncableTables,
> {
  table: T;
  entity: Class<A>;
  getById(id: string): A | undefined;
  add(entity: A): void;
  mapDataToModel(data: SyncableTables[T]["data"]["__select__"]): A;
  mapModelToData(entity: A): SyncableTables[T]["data"]["__select__"];
}

export const syncableRegistriesStoreCtx =
  createContext<SyncableRegistriesStore>();

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export const syncableRegistry = (constructor: Function) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const originalAttached = constructor.prototype.onAttachedToRootStore;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  constructor.prototype.onAttachedToRootStore = function () {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-this-alias
    const model = this;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const disposer = originalAttached?.apply(model);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const store = syncableRegistriesStoreCtx.get(model);

    if (!store) {
      throw new Error("Did you forget to set syncableRegistriesStoreCtx?");
    }

    store.registerRegistry(
      model as SyncableRegistry<AnyModel, keyof SyncableTables>,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return disposer;
  };
};

// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
export const buildAndAttachSyncRegStore = (obj: Object) => {
  const registryStore = new SyncableRegistriesStore();

  syncableRegistriesStoreCtx.set(obj, registryStore);

  return registryStore;
};

export class SyncableRegistriesStore {
  registries: SyncableRegistry<AnyModel, keyof SyncableTables>[] = [];

  registerRegistry(repo: SyncableRegistry<AnyModel, keyof SyncableTables>) {
    this.registries.push(repo);
  }

  getRegistryOfModel(model: unknown) {
    for (const repo of this.registries) {
      if (model instanceof repo.entity) return repo;
    }
  }

  getRegistryOfTable(table: keyof SyncableTables) {
    return this.registries.find((p) => p.table === table);
  }
}
