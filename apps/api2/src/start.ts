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
  select,
  SubscribableDB,
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
  projectItemsSlice2,
} from "@will-be-done/slices";
import fastify from "fastify";
import staticPlugin from "@fastify/static";
import path from "path";
import fs from "fs";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import { noop } from "@will-be-done/hyperdb/src/hyperdb/generators";

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

const hyperDB = new SubscribableDB(new DB(sqliteDriver));

hyperDB.afterInsert(function* (db, table, traits, ops) {
  if (table === changesTable) return;
  if (traits.some((t) => t.type === "skip-sync")) {
    return;
  }

  for (const op of ops) {
    syncDispatch(
      db,
      changesSlice.insertChangeFromInsert(
        op.table,
        op.newValue,
        clientId,
        nextClock,
      ),
    );
  }

  yield* noop();
});
hyperDB.afterUpdate(function* (db, table, traits, ops) {
  if (table === changesTable) return;
  if (traits.some((t) => t.type === "skip-sync")) {
    return;
  }

  for (const op of ops) {
    syncDispatch(
      db,
      changesSlice.insertChangeFromUpdate(
        op.table,
        op.oldValue,
        op.newValue,
        clientId,
        nextClock,
      ),
    );
  }

  yield* noop();
});
hyperDB.afterDelete(function* (db, table, traits, ops) {
  if (table === changesTable) return;
  if (traits.some((t) => t.type === "skip-sync")) {
    return;
  }

  for (const op of ops) {
    syncDispatch(
      db,
      changesSlice.insertChangeFromDelete(
        op.table,
        op.oldValue,
        clientId,
        nextClock,
      ),
    );
  }

  yield* noop();
});

execSync(
  hyperDB.loadTables([...appSyncableTables.map((t) => t.table), changesTable]),
);
const inbox = syncDispatch(hyperDB, projectsSlice2.createInboxIfNotExists());

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
      return select(
        hyperDB,
        changesSlice.getChangesetAfter(opts.input.lastServerUpdatedAt),
      );
    }),
  handleChanges: publicProcedure
    .input(ChangesetArray)
    .mutation(async (opts) => {
      const { input } = opts;

      syncDispatch(
        hyperDB.withTraits({ type: "skip-sync" }),
        changesSlice.mergeChanges(input, nextClock, clientId),
      );
    }),
});

// setInterval(() => {
//   syncDispatch(
//     hyperDB,
//     projectItemsSlice2.createTask(inbox.id, "append", {
//       title: "test" + Math.random().toString(36).slice(2),
//     }),
//   );
// }, 1000);

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
