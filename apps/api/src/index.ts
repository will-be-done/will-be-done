import { publicProcedure, router } from "./trpc";
import { z } from "zod";
import corsPlugin from "@fastify/cors";
import fastify from "fastify";
import * as dotenv from "dotenv";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import type { Kysely } from "kysely";
import { getQ, projectsTable, syncableTables, type Database } from "./schema";
import { sql } from "kysely";
import staticPlugin from "@fastify/static";
import path from "path";
import fs from "fs";

dotenv.config();

export const initClock = (clientId: string) => {
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

const nextClock = initClock("server");

export const createAppTables = async (q: Kysely<Database>) => {
  await q.transaction().execute(async (tx) => {
    const createSyncTable = async (table: string) => {
      await tx.schema
        .createTable(table)
        .ifNotExists()
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("needSync", "boolean", (col) => col.notNull())
        .addColumn("lastUpdatedOnClientAt", "text", (col) =>
          col.unique().notNull(),
        )
        .addColumn("lastUpdatedOnServerAt", "text", (col) =>
          col.unique().notNull(),
        )
        .addColumn("isDeleted", "boolean", (col) => col.notNull())
        .addColumn("data", "json", (col) => col.notNull())
        .execute();

      await tx.schema
        .createIndex(table + "_isDeleted_idx")
        .ifNotExists()
        .on(table)
        .column("isDeleted")
        .where("isDeleted", "=", 0)
        .execute();
    };

    for (const table of syncableTables) {
      await createSyncTable(table);
    }
  });
};

const server = fastify({ logger: true });

const appRouter = router({
  getChanges: publicProcedure
    .input(z.object({ lastServerClock: z.optional(z.string()) }))
    .query(async (opts) => {
      const q = getQ();

      let baseQ = q
        .selectFrom(syncableTables[0] as typeof projectsTable)
        .select([
          "id",
          "isDeleted",
          "data",
          "lastUpdatedOnClientAt",
          "lastUpdatedOnServerAt",
          sql<string>`'${sql.raw(syncableTables[0])}'`.as("tableName"),
        ])
        .where("lastUpdatedOnServerAt", ">", opts.input.lastServerClock || "");

      for (const t of syncableTables.slice(1)) {
        baseQ = baseQ.unionAll(
          q
            .selectFrom(t as typeof projectsTable)
            .select([
              "id",
              "isDeleted",
              "data",
              "lastUpdatedOnClientAt",
              "lastUpdatedOnServerAt",
              sql<string>`'${sql.raw(t)}'`.as("tableName"),
            ])
            .where(
              "lastUpdatedOnServerAt",
              ">",
              opts.input.lastServerClock || "",
            ),
        );
      }

      return await baseQ.execute();
    }),
  applyChanges: publicProcedure
    .input(
      z.object({
        changes: z.array(
          z.object({
            id: z.string(),
            isDeleted: z.number(),
            data: z.string(),
            tableName: z.string(),
            lastUpdatedOnClientAt: z.string(),
          }),
        ),
        // Note: only apply changes if lastServerClock is same as in the server. Otherwise,
        // ask to get changes from server every time.
        lastServerClock: z.optional(z.string()),
      }),
    )
    .mutation(async (opts) => {
      const q = getQ();

      let lastAppliedClock: string | undefined = undefined;
      await q.transaction().execute(async (tx) => {
        // to make tx exclusive
        // TODO: check if actually become exclusive
        await sql<string>`CREATE TABLE IF NOT EXISTS _dummy_lock_table (x);`.execute(
          tx,
        );
        await sql<string>`DELETE FROM _dummy_lock_table`.execute(tx);

        const maxLastClock =
          (
            await tx
              .with("all_clocks", (qb) => {
                let query = qb
                  .selectFrom(syncableTables[0] as typeof projectsTable)
                  .select("lastUpdatedOnServerAt");

                // Add each additional table to the union
                for (let i = 1; i < syncableTables.length; i++) {
                  query = query.union(
                    qb
                      .selectFrom(syncableTables[i] as typeof projectsTable)
                      .select("lastUpdatedOnServerAt"),
                  );
                }

                return query;
              })
              .selectFrom("all_clocks")
              .select((eb) =>
                eb.fn.max<string>("lastUpdatedOnServerAt").as("maxClock"),
              )
              .executeTakeFirstOrThrow()
          ).maxClock || "";

        // // maxLastClock.maxClock now contains the maximum value
        // // Use an empty string as fallback if null
        // const result = maxLastClock.maxClock || "";
        //         // TODO: make 1 query
        //         let maxLastClock = "";
        //         for (const table of syncableTables) {
        //           const lastClock =
        //             (
        //               await tx
        //                 .selectFrom(table as typeof projectsTable)
        //                 .select((eb) =>
        //                   eb.fn
        //                     .max<string | null>("lastUpdatedOnServerAt")
        //                     .as("lastServerClock"),
        //                 )
        //                 .executeTakeFirstOrThrow()
        //             )?.lastServerClock || "";
        //
        //           if (maxLastClock < lastClock) {
        //             maxLastClock = lastClock;
        //           }
        //         }

        if ((opts.input.lastServerClock || "") !== maxLastClock) {
          throw new Error(
            "Wrong lastServerClock, need resync. Server clock: " +
              maxLastClock +
              ", client clock: " +
              opts.input.lastServerClock,
          );
        }

        for (const ch of opts.input.changes) {
          lastAppliedClock = nextClock();
          await tx
            .insertInto(ch.tableName as typeof projectsTable)
            .orReplace()
            .values({
              id: ch.id,
              needSync: 0,
              lastUpdatedOnClientAt: ch.lastUpdatedOnClientAt,
              lastUpdatedOnServerAt: lastAppliedClock,
              isDeleted: ch.isDeleted,
              data: ch.data,
            })
            .execute();
        }
      });

      if (!lastAppliedClock) {
        throw new Error("lastAppliedClock is not set");
      }

      return {
        lastAppliedClock: lastAppliedClock as string,
      };
    }),
});

// void server.register(corsPlugin, {
//   origin: "*",
//   methods: ["POST", "GET"],
//   maxAge: 600,
// });

// void server.register(() => {
//   server.addHook("preHandler", (request, reply, done) => {
//     if (request.routerPath === "/is-token-ok") {
//       done();
//       return;
//     }
//
//     done();
//
//     // if (request.routerPath === "/ws") {
//     //   const { token } = request.query as { token: string | undefined };
//
//     //   if (token !== process.env.ACCESS_TOKEN) {
//     //     done(new Error("Not authed"));
//     //   } else {
//     //     done();
//     //   }
//     // } else if (request.headers.authorization !== process.env.ACCESS_TOKEN) {
//     //   done(new Error("Not authed"));
//     // } else {
//     //   done();
//     // }
//   });
//
//   server.post("/is-token-ok", async (req, res) => {
//     if ((req.body as { hash: string }).hash === process.env.ACCESS_TOKEN) {
//       await res.code(200).send();
//     } else {
//       await res.code(401).send();
//     }
//   });
//
//   return Promise.resolve();
// });
//
server.register(async (instance) => {
  instance.addHook("preHandler", async (request, reply) => {
    console.log("preHandler", request.headers);

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      reply.header("WWW-Authenticate", 'Basic realm="Secure Area"');
      reply.code(401).send({ error: "Unauthorized - Authentication required" });
      return reply;
    }
  });
});
server.addHook("onRequest", async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    reply.header("WWW-Authenticate", 'Basic realm="Secure Area"');
    return reply
      .code(401)
      .send({ error: "Unauthorized - Authentication required" });
  }

  const base64Credentials = authHeader.slice(6); // Remove "Basic "

  const credentials = Buffer.from(base64Credentials, "base64").toString(
    "utf-8",
  );

  const [username, password] = credentials.split(":");
  if (
    username === (process.env.AUTH_USERNAME || "") &&
    password === (process.env.AUTH_PASSWORD || "")
  ) {
    console.log("Authentication successful");
    return;
  }

  //   // If we get here, authentication failed
  reply.header("WWW-Authenticate", 'Basic realm="Secure Area"');
  reply.code(401).send({ error: "Authentication failed" });
});

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

// Run the server!
const start = async () => {
  try {
    const db = getQ();
    await createAppTables(db);

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

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
