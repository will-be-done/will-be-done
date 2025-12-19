import { z } from "zod";
import {
  publicProcedure,
  protectedProcedure,
  router,
  createContext,
} from "./trpc";
import { syncDispatch, select } from "@will-be-done/hyperdb";
import * as dotenv from "dotenv";
import { ChangesetArray, changesSlice } from "@will-be-done/slices";
import fastify from "fastify";
import staticPlugin from "@fastify/static";
import multipart from "@fastify/multipart";
import path from "path";
import fs from "fs";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import { getTodoDB, getMainDB } from "./db/db";
import { authSlice } from "./slices/authSlice";
import { vaultSlice } from "./slices/vaultSlice";
import { TRPCError } from "@trpc/server";

dotenv.config();

const mainDB = getMainDB();

const appRouter = router({
  getChangesAfter: protectedProcedure
    .input(
      z.object({
        lastServerUpdatedAt: z.string(),
        vaultId: z.string(),
      }),
    )
    .query(async (opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // Check if user has access to the vault
      const vault = select(mainDB, vaultSlice.getVaultById(opts.input.vaultId));
      if (!vault || vault.userId !== opts.ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied to vault",
        });
      }

      const { db } = getTodoDB(opts.input.vaultId);

      return select(
        db,
        changesSlice.getChangesetAfter(opts.input.lastServerUpdatedAt),
      );
    }),
  handleChanges: protectedProcedure
    .input(
      z.object({
        vaultId: z.string(),
        changeset: ChangesetArray,
      }),
    )
    .mutation(async (opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // Check if user has access to the vault
      const vault = select(mainDB, vaultSlice.getVaultById(opts.input.vaultId));
      if (!vault || vault.userId !== opts.ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied to vault",
        });
      }

      const { db, nextClock, clientId } = getTodoDB(opts.input.vaultId);

      syncDispatch(
        db.withTraits({ type: "skip-sync" }),
        changesSlice.mergeChanges(opts.input.changeset, nextClock, clientId),
      );
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

  createVault: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
      }),
    )
    .mutation(async (opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const vault = syncDispatch(
        mainDB,
        vaultSlice.createVault(opts.ctx.user.id, opts.input.name),
      );

      return vault;
    }),

  listVaults: protectedProcedure.query(async (opts) => {
    if (!opts.ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const vaults = select(
      mainDB,
      vaultSlice.listVaultsByUserId(opts.ctx.user.id),
    );

    return vaults;
  }),

  updateVault: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
      }),
    )
    .mutation(async (opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const vault = syncDispatch(
        mainDB,
        vaultSlice.updateVault(opts.input.id, opts.input.name),
      );

      if (!vault) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vault not found" });
      }

      return vault;
    }),

  deleteVault: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async (opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // Check if user has access to the vault
      const vault = select(mainDB, vaultSlice.getVaultById(opts.input.id));
      if (!vault || vault.userId !== opts.ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied to vault",
        });
      }

      const success = syncDispatch(
        mainDB,
        vaultSlice.deleteVault(opts.input.id),
      );

      if (!success) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vault not found" });
      }

      return { success: true };
    }),
});

const server = fastify({
  logger: true,
  bodyLimit: 100485760,
});

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
