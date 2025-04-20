import {
  buildAsyncQueryRunner,
  IDbBackend,
  IExecQueriesResult,
  initJobsState,
  IPrimitiveValue,
  IQuery,
  IQueryResult,
  IQueryValue,
  ITransactionOpts,
} from "@kikko-land/kikko";
import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
//@ts-expect-error no declarations
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import * as SQLite from "wa-sqlite";

export const waSqliteWebBackend =
  ({
    wasmUrl,
    pageSize,
    cacheSize,
  }: {
    wasmUrl: string;
    pageSize?: number;
    cacheSize?: number;
  }): IDbBackend =>
  ({ dbName }) => {
    let sqlite3: SQLiteAPI | undefined;
    let db: number | undefined;

    const jobsState = initJobsState();

    const runner = buildAsyncQueryRunner({
      execUsual: async (q: IQuery) => {
        if (!sqlite3 || db === undefined) {
          throw new Error("DB is not initialized");
        }

        const rows: IQueryResult = [];

        const startTime = Date.now();

        for await (const stmt of sqlite3.statements(db, q.text)) {
          sqlite3.bind_collection(stmt, q.values as SQLiteCompatibleType[]);

          const columns = sqlite3.column_names(stmt);

          while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
            if (columns.length > 0) {
              rows.push(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                Object.fromEntries(
                  sqlite3
                    .row(stmt)
                    .map((val, i) => [columns[i], val as IQueryValue]),
                ),
              );
            }
          }
        }

        const endTime = Date.now();

        return {
          rows,
          performance: {
            execTime: endTime - startTime,
          },
        };
      },
      async execPrepared(q: IQuery, preparedValues: IPrimitiveValue[][]) {
        if (!sqlite3 || db === undefined) {
          throw new Error("DB is not initialized");
        }

        const result: IExecQueriesResult["result"] = [];

        const startTime = Date.now();

        for await (const stmt of sqlite3.statements(db, q.text)) {
          const columns = sqlite3.column_names(stmt);

          for (const values of preparedValues) {
            await sqlite3.reset(stmt);

            sqlite3.bind_collection(stmt, values as SQLiteCompatibleType[]);

            const rows: IQueryResult = [];

            while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
              if (columns.length > 0) {
                rows.push(
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                  Object.fromEntries(
                    sqlite3
                      .row(stmt)
                      .map((val, i) => [columns[i], val as IQueryValue]),
                  ),
                );
              }
            }

            result.push({
              rows: rows,
              performance: {
                execTime: 0,
              },
            });
          }
        }

        const endTime = Date.now();

        if (result[0]) {
          result[0].performance.execTime = endTime - startTime;
        }

        return result;
      },
      async rollback() {
        if (!sqlite3 || db === undefined) {
          throw new Error("DB is not initialized");
        }

        await sqlite3.exec(db, "ROLLBACK");
      },
    });

    return {
      async initialize() {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        // const module = await SQLiteAsyncModule({ locateFile: () => wasmUrl });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const module = await SQLiteAsyncESMFactory({
          locateFile: () => wasmUrl,
        });

        sqlite3 = SQLite.Factory(module);

        // const klass = IDBBatchAtomicVFS;
        //
        // sqlite3.vfs_register(
        //   new klass("wa-sqlite-db-atomic-batched", {
        //     purge: "manual",
        //     durability: "relaxed",
        //   }),
        // );

        const vfs = await IDBBatchAtomicVFS.create("dbName", module);
        sqlite3.vfs_register(vfs, true);

        db = await sqlite3.open_v2(
          dbName,
          // undefined,
          // "wa-sqlite-db-atomic-batched",
        );

        await sqlite3.exec(
          db,
          `PRAGMA cache_size=${cacheSize === undefined ? 5000 : cacheSize};`,
        );
        // await sqlite3.exec(
        //   db,
        //   `PRAGMA page_size=${pageSize === undefined ? 32 * 1024 : pageSize};`,
        // );
        await sqlite3.exec(db, `PRAGMA journal_mode=DELETE;`);
      },
      async execQueries(
        q:
          | { type: "usual"; values: IQuery[] }
          | {
              type: "prepared";
              query: IQuery;
              preparedValues: IPrimitiveValue[][];
            },
        transactionOpts?: ITransactionOpts,
      ) {
        const startedAt = Date.now();

        const res = await runner.run(jobsState, q, transactionOpts);
        const endAt = Date.now();

        return {
          result: res.result,
          performance: {
            ...res.performance,
            totalTime: endAt - startedAt,
          },
        };
      },
      async stop() {
        if (sqlite3 && db !== undefined) {
          await sqlite3.close(db);
        }

        sqlite3 = undefined;
        db = undefined;
      },
    };
  };
