import { generateInsert } from "@kikko-land/boono-sql";
import { type IDb } from "@kikko-land/kikko";
import { State } from "../../utils/State.ts";
import { SyncableTable } from "./schema.ts";
import { Insertable } from "kysely";
import { chunk } from "es-toolkit";
import { createNanoEvents } from "nanoevents";
import { ModelChange } from "@/store/sync/ChangesTracker.ts";

const compressChanges = (chs: ModelChange[]) => {
  const changesMap = new Map<
    string,
    {
      changes: Map<string, ModelChange>;
    }
  >();

  for (const ch of chs) {
    let tableChanges = changesMap.get(ch.tableName);
    if (!tableChanges) {
      tableChanges = {
        changes: new Map(),
      };
      changesMap.set(ch.tableName, tableChanges);
    }

    tableChanges.changes.set(ch.rowId, ch);
  }

  return changesMap;
};

type SaverEvents = {
  onChangePersisted(changes: Record<string, { id: string }[]>): void;
};

export class ChangesToDbSaver {
  private rows: ModelChange[] = [];
  private changesCounter = new State<number>(0);
  emitter = createNanoEvents<SaverEvents>();

  constructor(private db: IDb) {
    void this.startChangesLoop();
  }

  addChange(ch: ModelChange) {
    this.rows.push(ch);
    this.changesCounter.modify((c) => c + 1);
  }

  private async startChangesLoop() {
    while (true) {
      const res = await Promise.race([
        new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), 500),
        ),
        this.changesCounter.newEmitted(),
      ]);

      if (res !== "timeout") continue;
      if (this.rows.length === 0) continue;

      const chs = [...this.rows];
      this.rows = [];
      try {
        await this.applyChanges(chs);
      } catch (e) {
        this.rows = [...chs, ...this.rows];

        console.error("Error while applying changes", e);
      }
    }
  }

  private async applyChanges(chs: ModelChange[]) {
    const changesMap = compressChanges(chs);

    const changesToNotify: Record<string, { id: string }[]> = {};
    await this.db.runInAtomicTransaction((db) => {
      for (const [table, tableChanges] of changesMap) {
        if (tableChanges.changes.size === 0) continue;

        changesToNotify[table] = [];
        const dbChs: Insertable<SyncableTable>[] = [];
        for (const [, ch] of tableChanges.changes) {
          dbChs.push(mapToInsertable(ch));
          changesToNotify[table].push({ id: ch.rowId });
        }

        for (const chsChunk of chunk(dbChs, 5000)) {
          db.addQuery(generateInsert(table, chsChunk, true));
        }
      }
    });

    this.emitter.emit("onChangePersisted", changesToNotify);
  }
}

const mapToInsertable = (ch: ModelChange): Insertable<SyncableTable> => {
  const str = JSON.stringify(ch.value);
  return {
    id: ch.rowId,
    needSync: 1,
    lastUpdatedOnClientAt: ch.happenedAt,
    lastUpdatedOnServerAt: "",
    isDeleted: ch.type === "delete" ? 1 : 0,
    data: str,
  };
};
