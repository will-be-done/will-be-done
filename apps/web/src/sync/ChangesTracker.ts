import { DistributiveOmit } from "@kikko-land/kikko";
import { StoreApi } from "@will-be-done/hyperstate";
import { Patch } from "mutative";
import { uuidv7 } from "uuidv7";
import { syncMappings } from "./main";
import { shouldNeverHappen } from "@/utils";
import {RootState, SyncableState} from "@/store/models.ts";

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
  constructor(
    private clientId: string,
    private nextClock: () => string,
  ) {}

  handleChange(
    store: StoreApi<RootState>,
    state: RootState,
    previousState: RootState,
    patches: Patch[],
  ): ModelChange[] {
    const changes: ModelChange[] = [];
    for (const patch of patches) {
      const path = patch.path;
      if (!Array.isArray(path)) {
        continue;
      }
      const rootKey = path[0] as keyof SyncableState;
      const secondKey = path[1] as keyof SyncableState[typeof rootKey];

      if (secondKey !== "byIds") {
        continue;
      }

      if (path.length === 2) {
        console.error(
          "whole store change, now know how to sync",
          previousState,
          state,
          patch,
        );

        continue;
      }
      const id = path[2] as keyof SyncableState[typeof rootKey]["byIds"];

      const originalModel = previousState[rootKey].byIds[id];
      const newModel = state[rootKey].byIds[id];

      if (originalModel === undefined) {
        if (newModel === undefined) return shouldNeverHappen("both undefined");

        const mappingInfo = syncMappings[newModel.type];
        if (!mappingInfo) return shouldNeverHappen("mappingInfo not found");
        // @ts-expect-error it's ok
        const data = mappingInfo.mapModelToData(newModel);

        changes.push(
          this.buildChange({
            tableName: mappingInfo.table,
            rowId: data.id,
            type: "create",
            value: data,
          }),
        );
      } else if (originalModel !== undefined && newModel !== undefined) {
        const mappingInfo = syncMappings[newModel.type];
        if (!mappingInfo) return shouldNeverHappen("mappingInfo not found");
        // @ts-expect-error it's ok
        const data = mappingInfo.mapModelToData(newModel);

        changes.push(
          this.buildChange({
            tableName: mappingInfo.table,
            rowId: data.id,
            type: "update",
            value: data,
          }),
        );
      } else if (originalModel !== undefined && newModel === undefined) {
        const mappingInfo = syncMappings[originalModel.type];
        if (!mappingInfo) return shouldNeverHappen("mappingInfo not found");
        // @ts-expect-error it's ok
        const data = mappingInfo.mapModelToData(originalModel);

        changes.push(
          this.buildChange({
            tableName: mappingInfo.table,
            rowId: data.id,
            type: "delete",
            value: data,
          }),
        );
      } else {
        shouldNeverHappen("unknown model type");
      }
    }

    return changes;
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
