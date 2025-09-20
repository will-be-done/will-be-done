import { describe, expect, it } from "vitest";
import { table } from "./table";
import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import sqlWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
import * as SQLite from "wa-sqlite";
import { MemoryAsyncVFS } from "wa-sqlite/src/examples/MemoryAsyncVFS.js";
import { AsyncSqlDriver } from "./drivers/AsyncSqlDriver";
import { DB, execAsync } from "./db";

type Task = {
  type: "task";
  id: string;
  title: string;
  state: "todo" | "done";
  lastToggledAt: number;
  projectId: string;
  orderToken: string;
};

const tasksTable = table<Task>("tasks").withIndexes({
  id: { cols: ["id"], type: "hash" },
  ids: { cols: ["id"], type: "btree" },
  byTitle: { cols: ["title"], type: "hash" },
  projectIdState: {
    cols: ["projectId", "state", "lastToggledAt"],
    type: "btree",
  },
});

describe("db", async () => {
  for (const driver of [
    async () => {
      const module = await SQLiteAsyncESMFactory({
        locateFile: () => sqlWasmUrl,
      });

      const sqlite3 = SQLite.Factory(module);

      // @ts-expect-error wrong typing here
      const vfs = await MemoryAsyncVFS.create("my-db", module);
      sqlite3.vfs_register(vfs, true);

      const db = await sqlite3.open_v2("test-db");

      return new AsyncSqlDriver(sqlite3, db);
    },
  ]) {
    it("works", async () => {
      const db = new DB(await driver());

      await execAsync(db.loadTables([tasksTable]));

      const updatedTask = (): Task => ({
        id: "task-1",
        title: "updated",
        state: "todo",
        projectId: "2",
        orderToken: "d",
        type: "task",
        lastToggledAt: 0,
      });

      const tasks: Task[] = [
        {
          id: "task-1",
          title: "Task 1",
          state: "done",
          projectId: "1",
          orderToken: "b",
          type: "task",
          lastToggledAt: 0,
        },
        {
          id: "task-2",
          title: "Task 2",
          state: "todo",
          projectId: "1",
          orderToken: "b",
          type: "task",
          lastToggledAt: 1,
        },
      ];
      await execAsync(db.insert(tasksTable, tasks));

      expect(
        await execAsync(
          db.intervalScan(tasksTable, "ids", [
            {
              eq: [{ col: "id", val: "task-1" }],
            },
          ]),
        ),
      ).toEqual([tasks[0]]);

      await execAsync(db.update(tasksTable, [updatedTask()]));

      expect(
        await execAsync(
          db.intervalScan(tasksTable, "ids", [
            {
              eq: [{ col: "id", val: "task-1" }],
            },
          ]),
        ),
      ).toEqual([updatedTask()]);

      await execAsync(db.delete(tasksTable, ["task-1"]));

      expect(
        await execAsync(
          db.intervalScan(tasksTable, "ids", [
            {
              eq: [{ col: "id", val: "task-1" }],
            },
          ]),
        ),
      ).toEqual([]);
    });
  }
});
