import { z } from "zod";
import { publicProcedure, router } from "./trpc";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { Database } from "bun:sqlite";
import {
  DB,
  deleteRows,
  execSync,
  insert,
  runQuery,
  selectFrom,
  SqlDriver,
  syncDispatch,
  update,
  runSelector,
  type Row,
} from "@will-be-done/hyperdb";
import * as dotenv from "dotenv";
import {
  changesTable,
  appSyncableTables,
  projectsSlice2,
  ChangesetArray,
  syncableTablesMap,
  type Change,
  type AppSyncableModel,
  changesSlice,
} from "@will-be-done/slices";
import fastify from "fastify";
import staticPlugin from "@fastify/static";
import path from "path";
import fs from "fs";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";

dotenv.config();

const clientId = "server";
const initClock = (clientId: string) => {
  let now = Date.now();
  let n = 0;

  return () => {
    const newNow = Date.now();

    if (newNow === now) {
      n++;
    } else if (newNow > now) {
      now = newNow;
      n = 0;
    }

    return `${now}-${n.toString().padStart(4, "0")}-${clientId}`;
  };
};
const nextClock = initClock(clientId);

const sqliteDB = new Database("./db.db", { strict: true });

export type SqlValue = number | string | Uint8Array | null;
const sqliteDriver = new SqlDriver({
  exec(sql: string, params?: SqlValue[]): void {
    if (!params) {
      sqliteDB.run(sql);
    } else {
      sqliteDB.run(sql, params);
    }
  },
  prepare(sql: string) {
    const stmt = sqliteDB.prepare(sql);

    return {
      values(values: SqlValue[]): SqlValue[][] {
        return stmt.values(...values) as SqlValue[][];
      },
      finalize(): void {
        stmt.finalize();
      },
    };
  },
});

const hyperDB = new DB(sqliteDriver);

execSync(
  hyperDB.loadTables([...appSyncableTables.map((t) => t.table), changesTable]),
);
syncDispatch(hyperDB, projectsSlice2.createInboxIfNotExists());

// TODO: next
// 1. Wite client changes to DB
// 2. Write conflict resolution on backend
// 3. Write client change receiver
//
// Also need to write afterInsert/afterUpdate/afterDelete triggers to save backend data
// to changes table atomically
// Also very very curios how server conflict resoltuion will work!
// we will able to delete duplicated projections, for example!!

const appRouter = router({
  getChangesAfter: publicProcedure
    .input(z.object({ lastServerUpdatedAt: z.string() }))
    .query(async (opts) => {
      return runSelector(
        hyperDB,
        function* () {
          return yield* changesSlice.getChangesetAfter(
            opts.input.lastServerUpdatedAt,
          );
        },
        [],
      );
    }),
  handleChanges: publicProcedure
    .input(ChangesetArray)
    .mutation(async (opts) => {
      const { input } = opts;

      // [{
      //   tableName: "task_projections",
      //   data: [
      //     {
      //       row: {
      //         type: "projection",
      //         id: "0198f6d0-3eb1-7839-ba4d-0f679aedd3d5",
      //         createdAt: 1756487499441,
      //         taskId: "0198f6d0-3eb1-7839-ba4d-0f66d84eb36f",
      //         dailyListId: "88d6e0fb-9d79-5b2d-9d48-1a09111a4aef",
      //         orderToken: "Zv4DZ",
      //       },
      //       change: {
      //         id: "0198f6d0-3eb1-7839-ba4d-0f679aedd3d5",
      //         tableName: "task_projections",
      //         deletedAt: null,
      //         clientId: "VW55_xqa2KdHtr9nlHTVR",
      //         changes: {
      //           type: "1756487499469-0001-VW55_xqa2KdHtr9nlHTVR",
      //           id: "1756487499469-0001-VW55_xqa2KdHtr9nlHTVR",
      //           createdAt: "1756487499469-0001-VW55_xqa2KdHtr9nlHTVR",
      //           taskId: "1756487499469-0001-VW55_xqa2KdHtr9nlHTVR",
      //           dailyListId: "1756487499469-0001-VW55_xqa2KdHtr9nlHTVR",
      //           orderToken: "1756487499469-0001-VW55_xqa2KdHtr9nlHTVR",
      //         },
      //         createdAt: "1756487499469-0001-VW55_xqa2KdHtr9nlHTVR",
      //         lastChangedAt: "1756487499469-0001-VW55_xqa2KdHtr9nlHTVR",
      //       },
      //     }, {
      //       row: {
      //         type: "projection",
      //         id: "0198f6d0-32c0-7975-9e52-abf118b39bde",
      //         createdAt: 1756487496384,
      //         taskId: "0198f6d0-32c0-7975-9e52-abf0f524c444",
      //         dailyListId: "15f3e910-cb01-5c4f-a429-9b6cb40047e6",
      //         orderToken: "a06y0",
      //       },
      //       change: {
      //         id: "0198f6d0-32c0-7975-9e52-abf118b39bde",
      //         tableName: "task_projections",
      //         deletedAt: null,
      //         clientId: "VW55_xqa2KdHtr9nlHTVR",
      //         changes: {
      //           type: "1756487496427-0000-VW55_xqa2KdHtr9nlHTVR",
      //           id: "1756487496427-0000-VW55_xqa2KdHtr9nlHTVR",
      //           createdAt: "1756487496427-0000-VW55_xqa2KdHtr9nlHTVR",
      //           taskId: "1756487496427-0000-VW55_xqa2KdHtr9nlHTVR",
      //           dailyListId: "1756488280116-0000-VW55_xqa2KdHtr9nlHTVR",
      //           orderToken: "1756488280116-0000-VW55_xqa2KdHtr9nlHTVR",
      //         },
      //         createdAt: "1756487496427-0000-VW55_xqa2KdHtr9nlHTVR",
      //         lastChangedAt: "1756488280116-0000-VW55_xqa2KdHtr9nlHTVR",
      //       },
      //     }
      //   ],
      // }]

      try {
        syncDispatch(
          hyperDB,
          (function* () {
            const allChanges: Change[] = [];

            for (const changeset of input) {
              const toDeleteRows: string[] = [];
              const toUpdateRows: AppSyncableModel[] = [];
              const toInsertRows: AppSyncableModel[] = [];

              const table = syncableTablesMap[changeset.tableName];
              if (!table) {
                throw new Error("Unknown table: " + changeset.tableName);
              }

              const serverChanges = yield* runQuery(
                selectFrom(changesTable, "byId").where((q) =>
                  changeset.data.map((c) => q.eq("id", c.change.id)),
                ),
              );
              const serverChangesMap = new Map(
                serverChanges.map((c) => [c.id, c]),
              );

              const serverRows = yield* runQuery(
                selectFrom(table, "byId").where((q) =>
                  changeset.data.map((c) => q.eq("id", c.change.id)),
                ),
              );
              const serverRowsMap = new Map(serverRows.map((r) => [r.id, r]));

              for (const {
                change: clientChange,
                row: clientRow,
              } of changeset.data) {
                const serverChange = serverChangesMap.get(clientChange.id);
                const serverRow = serverRowsMap.get(clientChange.id);

                const { mergedChanges, mergedRow } = mergeChanges(
                  serverChange?.changes ?? {},
                  clientChange.changes,
                  serverRow ?? { id: clientChange.id },
                  clientRow ?? { id: clientChange.id },
                );

                // Delete always wins, no conflict resolution needed actually
                if (clientChange.deletedAt != null) {
                  if (serverRow) {
                    toDeleteRows.push(serverRow.id);
                  }
                } else if (serverRow) {
                  toUpdateRows.push(mergedRow as AppSyncableModel);
                } else {
                  toInsertRows.push(mergedRow as AppSyncableModel);
                }

                const currentClock = nextClock();
                const lastDeletedAt = (function () {
                  if (serverChange && serverChange.deletedAt) {
                    return serverChange.deletedAt;
                  }

                  if (clientChange.deletedAt != null) {
                    return currentClock;
                  }

                  return null;
                })();

                allChanges.push({
                  id: clientChange.id,
                  tableName: table.tableName,
                  createdAt: serverChange?.createdAt ?? currentClock,
                  updatedAt: currentClock,
                  deletedAt: lastDeletedAt,
                  clientId: clientId,
                  changes: mergedChanges,
                });
              }

              yield* insert(table, toInsertRows);
              yield* update(table, toUpdateRows);
              yield* deleteRows(table, toDeleteRows);
            }

            yield* insert(changesTable, allChanges);

            // TODO: next:
            // 1. Grab changes from server to client and just directly apply them
          })(),
        );
      } catch (e) {
        console.error(e);

        throw e;
      }

      // console.log("handleChanges", input);

      return {};
    }),
});

const mergeChanges = (
  aChange: Record<string, string>,
  bChange: Record<string, string>,
  aRow: Row,
  bRow: Row,
): { mergedChanges: Record<string, string>; mergedRow: Row } => {
  const mergedChanges: Record<string, string> = {};
  // Start with aRow as the base. Unchanged fields will be preserved.
  const mergedRow: Record<string, string | number | boolean | null> = {
    ...aRow,
  };

  // Get all unique keys from both change objects
  const allKeys = new Set([...Object.keys(aChange), ...Object.keys(bChange)]);

  for (const key of allKeys) {
    const changeTimestampA = aChange[key];
    const changeTimestampB = bChange[key];

    let winningTimestamp: string;
    let winningValue: string | number | boolean | null;

    if (changeTimestampA !== undefined && changeTimestampB !== undefined) {
      // --- Conflict: The key was changed in both branches ---
      // Compare the timestamps to find the winner.
      if (changeTimestampA > changeTimestampB) {
        // A is the winner
        winningTimestamp = changeTimestampA;
        winningValue = aRow[key]!;
      } else {
        // B is the winner (or they are equal, B wins the tie)
        winningTimestamp = changeTimestampB;
        winningValue = bRow[key]!;
      }
    } else if (changeTimestampA !== undefined) {
      // --- Key was only changed in A ---
      winningTimestamp = changeTimestampA;
      winningValue = aRow[key]!;
    } else {
      // --- Key was only changed in B ---
      // We can assert changeTimestampB is not undefined here.
      winningTimestamp = changeTimestampB!;
      winningValue = bRow[key]!;
    }

    // Update the merged results with the winning data
    mergedChanges[key] = winningTimestamp;
    mergedRow[key] = winningValue;
  }

  return { mergedChanges, mergedRow: mergedRow as Row };
};

const server = fastify({ logger: true });

server.register(staticPlugin, {
  root: path.join(__dirname, "..", "public"),
});

server.register(fastifyTRPCPlugin, {
  prefix: "/api/trpc",
  useWSS: true,
  trpcOptions: {
    router: appRouter,
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
});

// Register a not found handler that serves index.html for non-API routes
server.setNotFoundHandler((request, reply) => {
  const url = request.url;

  // Skip API routes - return normal 404 for them
  if (url.startsWith("/api")) {
    reply.code(404).send({ error: "Not found" });
    return;
  }

  // For all other routes, serve the index.html
  const indexPath = path.join(__dirname, "..", "public", "index.html");

  // Check if index.html exists
  try {
    if (fs.existsSync(indexPath)) {
      const stream = fs.createReadStream(indexPath);
      reply.type("text/html").send(stream);
    } else {
      reply.code(404).send({ error: "index.html not found" });
    }
  } catch (err) {
    reply.code(500).send({ error: "Server error" });
  }
});

const start = async () => {
  try {
    await server.listen({ port: 3000, host: "0.0.0.0" });

    const signals = ["SIGINT", "SIGTERM", "SIGQUIT"];
    for (const signal of signals) {
      process.on(signal, async () => {
        server.log.info(
          `${signal} signal received, shutting down gracefully...`,
        );

        try {
          // Close the Fastify server first
          await server.close();
          server.log.info("Server closed successfully");

          // Then exit the process
          process.exit(0);
        } catch (err) {
          server.log.error(`Error during graceful shutdown: ${err}`);
          process.exit(1);
        }
      });
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

void start();

export type AppRouter = typeof appRouter;
