import { sql } from "kysely";
import { generateInsert, sql as sql2 } from "@kikko-land/boono-sql";
import {
  preferencesTable,
  projectsTable,
  Q,
  SyncableTable,
  syncableTables,
} from "./schema";
import { IDbCtx } from "./db";
import { makeClient } from "./client";
import { groupBy } from "es-toolkit";
import { IDb } from "@kikko-land/kikko";
import { Insertable } from "kysely";
import { createNanoEvents } from "nanoevents";
import { Selectable } from "kysely";
import {
  BroadcastChannel,
  createLeaderElection,
  LeaderElector,
} from "broadcast-channel";

const lastAppliedServerClockKey = "lastAppliedServerClock";

export type SyncerEvents = {
  onChangePersisted(changes: Record<string, Selectable<SyncableTable>[]>): void;
};

// TODO: propagate changes to all tabs
export class Syncer {
  private client = makeClient();
  private electionChannel: BroadcastChannel;
  private elector: LeaderElector;
  private runId = 0;

  emitter = createNanoEvents<SyncerEvents>();

  constructor(
    private dbCtx: IDbCtx,
    private clientId: string,
  ) {
    this.electionChannel = new BroadcastChannel("election-" + clientId);
    this.elector = createLeaderElection(this.electionChannel);
  }

  startLoop() {
    this.elector.onduplicate = () => {
      console.log("onduplicate");

      this.runId++;
      void this.run();
    };

    void this.run();
  }

  private async run() {
    const myRunId = ++this.runId;

    await this.elector.awaitLeadership();
    while (true) {
      if (this.runId !== myRunId) {
        console.log("runId !== myRunId, stopping syncer loop");
        return;
      }

      try {
        await this.getAndApplyChanges();
        await this.sendChanges();
      } catch (e) {
        console.error(e);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  private async getAndApplyChanges() {
    const lastServerClock = await this.getLastServerAppliedClock(this.dbCtx.db);
    const changesFromServer = await this.client.getChanges.query({
      lastServerClock,
    });

    console.log("getAndApplyChanges lastServerClock", lastServerClock);

    if (changesFromServer.length === 0) {
      console.log("no changes from server, skip");

      return;
    }

    console.log("applying changes from server", changesFromServer);

    let maxServerClock = changesFromServer[0]?.lastUpdatedOnServerAt || "";
    for (const ch of changesFromServer) {
      if (ch.lastUpdatedOnServerAt > maxServerClock) {
        maxServerClock = ch.lastUpdatedOnServerAt;
      }
    }

    if (maxServerClock === "") {
      throw new Error("maxServerClock is empty");
    }

    const createTableQuery = (tableName: string) => {
      return Q.selectFrom(tableName as typeof projectsTable)
        .where("needSync", "=", 1)
        .select([
          "id",
          "lastUpdatedOnClientAt",
          sql<string>`'${sql.raw(tableName)}'`.as("tableName"),
        ]);
    };

    let baseQ = createTableQuery(syncableTables[0]);
    for (const t of syncableTables.slice(1)) {
      baseQ = baseQ.unionAll(createTableQuery(t));
    }

    const changesToSend = await this.dbCtx.db.runQuery(baseQ);
    const changesToSendMap = new Map(
      changesToSend.map((c) => [c.tableName + c.id, c]),
    );

    const finalChangesToApply: Record<string, typeof changesFromServer> = {};
    for (const ch of changesFromServer) {
      const chToSend = changesToSendMap.get(ch.tableName + ch.id);

      // If our data is newer then server data, we don't need to apply server changes,
      // and we send client changes to server later
      if (
        chToSend &&
        chToSend.lastUpdatedOnClientAt > ch.lastUpdatedOnClientAt
      ) {
        continue;
      }

      // TODO: if chToSend.lastUpdatedOnClientAt == ch.lastUpdatedOnClientAt, just mark needSync = 0
      let chs = finalChangesToApply[ch.tableName];
      if (!chs) {
        chs = [];
        finalChangesToApply[ch.tableName] = chs;
      }

      chs.push(ch);

      continue;
    }

    const changesToNotify: Record<string, Selectable<SyncableTable>[]> = {};

    // tx acts as a lock
    await this.dbCtx.db.runInTransaction(
      async (db) => {
        // to make tx exclusive
        await db.runQuery(
          sql2`CREATE TABLE IF NOT EXISTS _dummy_lock_table (x);`,
        );
        await db.runQuery(sql2`DELETE FROM _dummy_lock_table`);

        // We must be sure that we don't running sync process in separate tab
        const lastServerAppliedClockInTx =
          await this.getLastServerAppliedClock(db);
        if (lastServerAppliedClockInTx !== lastServerClock) {
          throw new Error(
            `lastServerAppliedClockInTx !== lastServerClock: ${lastServerAppliedClockInTx} !== ${lastServerClock}. Multiple instances trying to update db`,
          );
        }

        for (const [table, chs] of Object.entries(finalChangesToApply)) {
          const finalChs = chs.map((ch): Insertable<SyncableTable> => {
            return {
              id: ch.id,
              needSync: 0,
              lastUpdatedOnClientAt: ch.lastUpdatedOnClientAt,
              lastUpdatedOnServerAt: "",
              isDeleted: ch.isDeleted,
              data: JSON.stringify(ch.data),
            };
          });

          const chsToNotify = chs.map((ch): Selectable<SyncableTable> => {
            return {
              id: ch.id,
              needSync: 0,
              lastUpdatedOnClientAt: ch.lastUpdatedOnClientAt,
              lastUpdatedOnServerAt: "",
              isDeleted: ch.isDeleted,
              data: ch.data,
            };
          });
          changesToNotify[table] = chsToNotify;

          await db.runQuery(generateInsert(table, finalChs, true));
        }

        await db.runQuery(
          Q.insertInto(preferencesTable).orReplace().values({
            key: lastAppliedServerClockKey,
            value: maxServerClock,
          }),
        );
      },
      { type: "exclusive" },
    );

    this.emitter.emit("onChangePersisted", changesToNotify);
  }

  // Client will be able to send change to server IF ONLY it has ALL changes from server
  // Otherwise it should get changes from server again to be 100% up to date
  // That flow make sync code much much easier
  private async sendChanges() {
    const lastServerClock = await this.getLastServerAppliedClock(this.dbCtx.db);

    let baseQ = Q.selectFrom(syncableTables[0] as typeof projectsTable)
      .where("needSync", "=", 1)
      .select([
        "id",
        "isDeleted",
        "data",
        "lastUpdatedOnClientAt",
        sql<string>`'${sql.raw(syncableTables[0])}'`.as("tableName"),
      ]);

    for (const t of syncableTables.slice(1)) {
      baseQ = baseQ.unionAll(
        Q.selectFrom(t as typeof projectsTable)
          .select([
            "id",
            "isDeleted",
            "data",
            "lastUpdatedOnClientAt",
            sql<string>`'${sql.raw(t)}'`.as("tableName"),
          ])
          .where("needSync", "=", 1),
      );
    }

    const data = await this.dbCtx.db.runQuery(baseQ);

    const serverChanges = data.map((d) => ({
      id: d.id,
      isDeleted: d.isDeleted,
      data: d.data as unknown as string,
      tableName: d.tableName,
      lastUpdatedOnClientAt: d.lastUpdatedOnClientAt,
    }));

    if (serverChanges.length === 0) {
      console.log("no changes to send, skip");
      return;
    }

    console.log("sending changes to server", serverChanges);

    const res = await this.client.applyChanges.mutate({
      changes: serverChanges,
      lastServerClock,
    });

    const toUpdate = groupBy(serverChanges, (c) => c.tableName);

    // tx acts as a lock
    await this.dbCtx.db.runInTransaction(
      async (db) => {
        // to make tx exclusive
        await db.runQuery(
          sql2`CREATE TABLE IF NOT EXISTS _dummy_lock_table (x);`,
        );
        await db.runQuery(sql2`DELETE FROM _dummy_lock_table`);

        // We must be sure that we don't running sync process in separate tab
        const lastServerAppliedClockInTx =
          await this.getLastServerAppliedClock(db);
        if (lastServerAppliedClockInTx !== lastServerClock) {
          throw new Error(
            `lastServerAppliedClockInTx !== lastServerClock: ${lastServerAppliedClockInTx} !== ${lastServerClock}. Multiple instances trying to update db`,
          );
        }

        await db.runQuery(
          Q.insertInto(preferencesTable).orReplace().values({
            key: lastAppliedServerClockKey,
            value: res.lastAppliedClock,
          }),
        );

        await Promise.all(
          Object.entries(toUpdate).map(async ([table, changes]) => {
            await db.runQuery(
              Q.updateTable(table as typeof projectsTable)
                .set({ needSync: 0 })
                .where((eb) => {
                  const ands = changes.map((c) => {
                    // we updating by id and time to make sure we don't update
                    // row that already was written by mobx and need to sync again
                    // So only updating rows that we actually sent to server
                    return eb.and([
                      eb("id", "=", c.id),
                      eb("lastUpdatedOnClientAt", "=", c.lastUpdatedOnClientAt),
                    ]);
                  });

                  return eb.or(ands);
                }),
            );
          }),
        );
      },
      { type: "exclusive" },
    );
  }

  private async getLastServerAppliedClock(db: IDb) {
    return (
      await db.runQuery(
        Q.selectFrom(preferencesTable)
          .select(["value"])
          .where("key", "=", lastAppliedServerClockKey),
      )
    )[0]?.value;
  }
}
