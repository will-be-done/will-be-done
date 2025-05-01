import { generateInsert, generateUpdate, sql } from "@kikko-land/boono-sql";
import { type IDb } from "@kikko-land/kikko";
import { State } from "../utils/State";
import { ModelChange } from "./ChangesTracker";
import { SyncableTable } from "./schema";
import { Insertable } from "kysely";
import { chunk } from "es-toolkit";
import { createNanoEvents } from "nanoevents";
import { Selectable } from "kysely";

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

export type SaverEvents = {
  onChangePersisted(changes: Record<string, string[]>): void;
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

    const changesToNotify: Record<string, string[]> = {};
    await this.db.runInAtomicTransaction((db) => {
      for (const [table, tableChanges] of changesMap) {
        if (tableChanges.changes.size === 0) continue;

        changesToNotify[table] = [];
        const dbChs: Insertable<SyncableTable>[] = [];
        for (const [, ch] of tableChanges.changes) {
          dbChs.push(mapToInsertable(ch));
          changesToNotify[table].push(ch.rowId);
        }

        for (const chsChunk of chunk(dbChs, 5000)) {
          db.addQuery(generateInsert(table, chsChunk, true));
        }
      }
    });

    this.emitter.emit("onChangePersisted", changesToNotify);
  }
}

// const compressChanges = (chs: ModelChange[]) => {
//   const changesMap = new Map<
//     string,
//     {
//       changes: Map<string, ModelChange>;
//     }
//   >();
//
//   for (const ch of chs) {
//     let tableChanges = changesMap.get(ch.tableName);
//     if (!tableChanges) {
//       tableChanges = {
//         changes: new Map(),
//       };
//       changesMap.set(ch.tableName, tableChanges);
//     }
//
//     tableChanges.changes.set(ch.rowId, ch);
//   }
//
//   return changesMap;
// };
//
// export class ChangesToDbSaver {
//   private rows: ModelChange[] = [];
//   private changesCounter = new State<number>(0);
//
//   constructor(private db: IDb) {
//     void this.startChangesLoop();
//   }
//
//   addChange(ch: ModelChange) {
//     this.rows.push(ch);
//     this.changesCounter.modify((c) => c + 1);
//   }
//
//   private async startChangesLoop() {
//     while (true) {
//       const res = await Promise.race([
//         new Promise<"timeout">((resolve) =>
//           setTimeout(() => resolve("timeout"), 500),
//         ),
//         this.changesCounter.newEmitted(),
//       ]);
//
//       if (res !== "timeout") continue;
//       if (this.rows.length === 0) continue;
//
//       const chs = [...this.rows];
//       this.rows = [];
//       try {
//         await this.applyChanges(chs);
//       } catch (e) {
//         this.rows = [...chs, ...this.rows];
//
//         console.error("Error while applying changes", e);
//       }
//     }
//   }
//
//   private async applyChanges(chs: ModelChange[]) {
//     console.log("applyChanges", chs);
//     // const changesMap = compressChanges(chs);
//
//     await this.db.runInAtomicTransaction((db) => {
//       for (const ch of chs) {
//         if (ch.type === "create") {
//           db.addQuery(generateInsert(ch.tableName, [mapToDb(ch)], true));
//         } else if (ch.type === "update") {
//           db.addQuery(generateInsert(ch.tableName, [mapToDb(ch)], true));
//         } else if (ch.type === "delete") {
//           db.addQuery(
//             generateUpdate(ch.tableName, {
//               needSync: 1,
//               lastUpdatedAt: ch.happenedAt,
//               isDeleted: 1,
//             } satisfies Pick<
//               Insertable<SyncableTable>,
//               "needSync" | "lastUpdatedAt" | "isDeleted"
//             >),
//           );
//         }
//       }
//       // for (const [table, tableChanges] of changesMap) {
//       //   // Insert
//       //   const insertValues: Insertable<SyncableTable>[] = [];
//       //   for (const [, ch] of tableChanges.created) {
//       //     insertValues.push(mapToDb(ch));
//       //   }
//       //
//       //   if (insertValues.length > 0) {
//       //     const insertQ = generateInsert(table, insertValues, false); // maybe OR REPLACE still like in update?
//       //     db.addQuery(insertQ);
//       //   }
//       //
//       //   // Update
//       //   const updateValues: Insertable<SyncableTable>[] = [];
//       //   for (const [, ch] of tableChanges.updated) {
//       //     updateValues.push(mapToDb(ch));
//       //   }
//       //   if (updateValues.length > 0) {
//       //     const updateQ = generateInsert(table, updateValues, true);
//       //     db.addQuery(updateQ);
//       //   }
//       //
//       //   // Delete
//       //   for (const [, ch] of tableChanges.deleted) {
//       //     const chDb = mapToDb(ch);
//       //
//       //     const updateQ = generateUpdate(table, {
//       //       needSync: 1,
//       //       lastUpdatedAt: ch.happenedAt,
//       //       isDeleted: 1,
//       //     } satisfies Pick<
//       //       Insertable<SyncableTable>,
//       //       "needSync" | "lastUpdatedAt" | "isDeleted"
//       //     >);
//       //
//       //     db.addQuery(sql`${updateQ} WHERE id = ${chDb.id}`);
//       //   }
//       // }
//     });
//   }
// }

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
const mapToSelectable = (ch: ModelChange): Selectable<SyncableTable> => {
  return {
    id: ch.rowId,
    needSync: 1,
    lastUpdatedOnClientAt: ch.happenedAt,
    lastUpdatedOnServerAt: "",
    isDeleted: ch.type === "delete" ? 1 : 0,
    data: ch.value,
  };
};
