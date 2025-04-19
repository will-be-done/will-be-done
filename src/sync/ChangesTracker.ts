import { DistributiveOmit } from "@kikko-land/kikko";
import {
  SyncableModelChange,
  SyncableModelChangeType,
  SyncableRegistriesStore,
  SyncableRegistry,
} from "./syncable";
import { uuidv7 } from "uuidv7";

export type ModelChange = {
  id: string;
  type: "create" | "update" | "delete";
  clientId: string;
  tableName: string;
  rowId: string;
  happenedAt: string;
  value: Record<string, unknown>;
};

export class ChangesTracker {
  private regLastRowsMap = new Map<
    SyncableRegistry,
    Map<string, Record<string, unknown>>
  >();

  constructor(
    private clientId: string,
    private nextClock: () => string,
    private registriesStore: SyncableRegistriesStore,
  ) {}

  handleChange(ev: SyncableModelChange<unknown>) {
    const registry = this.registriesStore.getRegistryOfModel(ev.model);

    if (!registry) throw new Error("Repo not found!");

    let lastRows = this.regLastRowsMap.get(registry);
    if (!lastRows) {
      lastRows = new Map();

      this.regLastRowsMap.set(registry, lastRows);
    }

    if (ev.type === SyncableModelChangeType.Load) {
      const data = registry.mapModelToData(ev.model);

      lastRows.set(data.id, data);
      return;
    } else if (ev.type === SyncableModelChangeType.Create) {
      const data = registry.mapModelToData(ev.model);

      lastRows.set(data.id, data);
      return this.buildChange({
        tableName: registry.table,
        rowId: data.id,
        type: "create",
        value: data,
      });
    } else if (ev.type === SyncableModelChangeType.Delete) {
      const data = registry.mapModelToData(ev.model);

      return this.buildChange({
        tableName: registry.table,
        rowId: data.id,
        type: "delete",
        value: data,
      });
    } else if (ev.type === SyncableModelChangeType.Update) {
      const data = registry.mapModelToData(ev.model);

      return this.buildChange({
        tableName: registry.table,
        rowId: data.id,
        type: "update",
        value: data,
      });
    } else {
      const exhaustiveCheck: never = ev.type;
      console.info(exhaustiveCheck);
      throw new Error("Unknown event type");
    }
  }

  private buildChange(
    ch: DistributiveOmit<ModelChange, "id" | "clientId" | "happenedAt">,
  ): ModelChange {
    return {
      id: uuidv7(),
      clientId: this.clientId,
      happenedAt: this.nextClock(),
      ...ch,
    };
  }
}
