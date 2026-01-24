import { z } from "zod";
import {
  publicProcedure,
  protectedProcedure,
  router,
  createContext,
} from "./trpc";
import { syncDispatch, select } from "@will-be-done/hyperdb";
import * as dotenv from "dotenv";
import { ChangesetArray, changesSlice } from "@will-be-done/slices/common";
import fastify from "fastify";
import staticPlugin from "@fastify/static";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import path from "path";
import fs from "fs";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import { getHyperDB, getMainHyperDB } from "./db/db";
import { authSlice } from "./slices/authSlice";
import { TRPCError } from "@trpc/server";
import { dbSlice } from "./slices/dbSlice";
import { assertUnreachable } from "./utils";
import { dbConfigByType } from "./db/configs";
import {
  subscriptionManager,
  NotificationData,
} from "./subscriptionManager";
import { State } from "./utils/State";

dotenv.config();

const mainDB = getMainHyperDB();

const checkDBAccessOrCreateDB = (
  dbId: string,
  dbType: "user" | "space",
  authedUserId: string,
) => {
  if (dbType === "user") {
    if (authedUserId !== dbId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Access denied to user",
      });
    }
  } else if (dbType === "space") {
    const db = syncDispatch(
      mainDB,
      dbSlice.getByIdOrCreate(dbId, dbType, authedUserId),
    );

    if (db.userId !== authedUserId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Access denied to space",
      });
    }
  } else {
    assertUnreachable(dbType);
  }
};

const appRouter = router({
  getChangesAfter: protectedProcedure
    .input(
      z.object({
        lastServerUpdatedAt: z.string(),
        dbId: z.string(),
        dbType: z.union([z.literal("user"), z.literal("space")]),
      }),
    )
    .query(async (opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      checkDBAccessOrCreateDB(
        opts.input.dbId,
        opts.input.dbType,
        opts.ctx.user.id,
      );

      const config = dbConfigByType(opts.input.dbType, opts.input.dbId);
      const { db } = getHyperDB(config);

      return select(
        db,
        changesSlice.getChangesetAfter(
          opts.input.lastServerUpdatedAt,
          config.tableNameMap,
        ),
      );
    }),
  handleChanges: protectedProcedure
    .input(
      z.object({
        dbId: z.string(),
        dbType: z.union([z.literal("user"), z.literal("space")]),
        changeset: ChangesetArray,
      }),
    )
    .mutation(async (opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      checkDBAccessOrCreateDB(
        opts.input.dbId,
        opts.input.dbType,
        opts.ctx.user.id,
      );

      const config = dbConfigByType(opts.input.dbType, opts.input.dbId);

      const { db, nextClock, clientId } = getHyperDB(config);

      syncDispatch(
        db.withTraits({ type: "skip-sync" }),
        changesSlice.mergeChanges(
          opts.input.changeset,
          nextClock,
          clientId,
          config.tableNameMap,
        ),
      );

      // Notify all subscribed clients that changes are available
      subscriptionManager.notifyChangesAvailable(
        opts.input.dbId,
        opts.input.dbType,
      );
    }),

  // Subscription for real-time change notifications
  onChangesAvailable: protectedProcedure
    .input(
      z.object({
        dbId: z.string(),
        dbType: z.union([z.literal("user"), z.literal("space")]),
      }),
    )
    .subscription(async function* (opts) {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // Verify access to the database
      checkDBAccessOrCreateDB(
        opts.input.dbId,
        opts.input.dbType,
        opts.ctx.user.id,
      );

      // Each subscription gets its own State to collect notifications
      const state = new State<NotificationData[]>([]);

      // Subscribe to EventEmitter and push to our local State
      const unsubscribe = subscriptionManager.subscribe(
        opts.input.dbId,
        opts.input.dbType,
        (data) => {
          state.modify((notifications) => [...notifications, data]);
        },
      );

      try {
        while (true) {
          const notifications = state.get();
          state.set([]);

          for (const notification of notifications) {
            yield notification;
          }

          // Wait for new notifications
          await state.newEmitted();
        }
      } finally {
        unsubscribe();
      }
    }),

  revokeToken: protectedProcedure
    .input(z.object({ tokenId: z.string() }))
    .mutation(async (opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      syncDispatch(mainDB, authSlice.revokeToken(opts.input.tokenId));
      return { success: true };
    }),

  register: publicProcedure
    .input(
      z.object({
        email: z.email(),
        password: z.string().min(8),
      }),
    )
    .mutation(async (opts) => {
      const { email, password } = opts.input;
      // Hash password before storing
      const hashedPassword = await Bun.password.hash(password);
      const result = syncDispatch(
        mainDB,
        authSlice.register(email, hashedPassword),
      );
      return result;
    }),
  login: publicProcedure
    .input(
      z.object({
        email: z.email(),
        password: z.string().min(8),
      }),
    )
    .mutation(async (opts) => {
      const { email, password } = opts.input;

      // Get user to verify password
      const user = syncDispatch(mainDB, authSlice.getUserByEmail(email));
      if (!user) {
        throw new Error("Invalid credentials");
      }

      // Verify password
      const isValid = await Bun.password.verify(password, user.password);
      if (!isValid) {
        throw new Error("Invalid credentials");
      }

      // Generate token for authenticated user
      const result = syncDispatch(mainDB, authSlice.generateToken(user.id));

      return result;
    }),
});

const server = fastify({
  logger: true,
  bodyLimit: 100485760,
});

// Register WebSocket plugin BEFORE tRPC plugin
server.register(websocket);

server.register(staticPlugin, {
  root: path.join(__dirname, "..", "public"),
});

server.register(multipart);

server.register(fastifyTRPCPlugin, {
  prefix: "/api/trpc",
  useWSS: true,
  trpcOptions: {
    router: appRouter,
    createContext,
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
    console.error("Error serving index.html:", err);
    reply.code(500).send({ error: "Server error" });
  }
});

const start = async () => {
  try {
    await server.listen({ port: 3000, host: "0.0.0.0" });

    const signals = ["SIGINT", "SIGTERM", "SIGQUIT"];
    for (const signal of signals) {
      process.on(signal, () => {
        void (async () => {
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
        })();
      });
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

void start();

export type AppRouter = typeof appRouter;
