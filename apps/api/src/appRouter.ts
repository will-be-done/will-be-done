import { z } from "zod";
import { selectSync, syncDispatch, type DB } from "@will-be-done/hyperdb";
import {
  ChangesetArray,
  getChangesetAfter,
  mergeChanges,
} from "@will-be-done/slices/common";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "./trpc";
import { getHyperDB } from "./db/db";
import { dbConfigByType } from "./db/configs";
import {
  generateToken,
  getTokensByUserId,
  getUserByEmail,
  register,
  revokeToken,
} from "./slices/authSlice";
import {
  subscriptionManager,
  type NotificationData,
} from "./subscriptionManager";
import { State } from "./utils/State";
import type { CaptchaConfig } from "./captcha/types";
import { verifyCaptchaToken } from "./captcha/verifyCaptchaToken";
import { importFromTodoist } from "./todoist/importTodoist";
import {
  DatabaseAccessDeniedError,
  ensureDatabaseAccessOrCreate,
} from "./services/databaseAccess";
import { assertSupportedSyncVersion } from "./syncVersion";

export interface AppRouterDependencies {
  mainDB: DB;
  captchaConfig: CaptchaConfig | null;
}

export function createAppRouter({
  mainDB,
  captchaConfig,
}: AppRouterDependencies) {
  const checkDatabaseAccess = (
    dbId: string,
    dbType: "user" | "space",
    userId: string,
  ) => {
    try {
      ensureDatabaseAccessOrCreate({ dbId, dbType, userId }, mainDB);
    } catch (error) {
      if (error instanceof DatabaseAccessDeniedError) {
        throw new TRPCError({ code: "FORBIDDEN", message: error.message });
      }
      throw error;
    }
  };

  return router({
    getChangesAfter: protectedProcedure
      .input(
        z.object({
          lastServerUpdatedAt: z.string(),
          dbId: z.string(),
          dbType: z.union([z.literal("user"), z.literal("space")]),
          clientId: z.string(),
          syncVersion: z.number().int().optional(),
        }),
      )
      .query(async (opts) => {
        assertSupportedSyncVersion(opts.input.syncVersion);
        if (!opts.ctx.user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        checkDatabaseAccess(
          opts.input.dbId,
          opts.input.dbType,
          opts.ctx.user.id,
        );

        const config = dbConfigByType(opts.input.dbType, opts.input.dbId);
        const { db } = getHyperDB(config);

        return selectSync(db, {
          selector: getChangesetAfter,
          args: {
            after: opts.input.lastServerUpdatedAt,
            registeredSyncableTableNameMap: config.tableNameMap,
          },
        });
      }),

    handleChanges: protectedProcedure
      .input(
        z.object({
          dbId: z.string(),
          dbType: z.union([z.literal("user"), z.literal("space")]),
          changeset: ChangesetArray,
          syncVersion: z.number().int().optional(),
        }),
      )
      .mutation(async (opts) => {
        assertSupportedSyncVersion(opts.input.syncVersion);
        if (!opts.ctx.user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        checkDatabaseAccess(
          opts.input.dbId,
          opts.input.dbType,
          opts.ctx.user.id,
        );

        const config = dbConfigByType(opts.input.dbType, opts.input.dbId);
        const { db, nextClock, clientId } = getHyperDB(config);

        syncDispatch(
          db.withTraits({ type: "skip-sync" }),
          mergeChanges({
            input: opts.input.changeset,
            nextClock: nextClock(),
            clientId,
            registeredSyncableTableNameMap: config.tableNameMap,
          }),
        );
      }),

    onChangesAvailable: protectedProcedure
      .input(
        z.object({
          dbId: z.string(),
          dbType: z.union([z.literal("user"), z.literal("space")]),
          syncVersion: z.number().int().optional(),
        }),
      )
      .subscription(async function* (opts) {
        assertSupportedSyncVersion(opts.input.syncVersion);
        if (!opts.ctx.user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        checkDatabaseAccess(
          opts.input.dbId,
          opts.input.dbType,
          opts.ctx.user.id,
        );

        const state = new State<NotificationData[]>([]);
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

            await state.newEmitted();
          }
        } finally {
          unsubscribe();
        }
      }),

    listTokens: protectedProcedure.query((opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      return syncDispatch(
        mainDB,
        getTokensByUserId({ userId: opts.ctx.user.id }),
      ).map(({ id, createdAt, lastUsedAt, lastUsedIp, lastUsedUserAgent }) => ({
        id,
        createdAt,
        ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
        ...(lastUsedIp !== undefined ? { lastUsedIp } : {}),
        ...(lastUsedUserAgent !== undefined ? { lastUsedUserAgent } : {}),
      }));
    }),

    createToken: protectedProcedure.mutation((opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const created = syncDispatch(
        mainDB,
        generateToken({ userId: opts.ctx.user.id }),
      );
      return { id: created.token, createdAt: created.createdAt };
    }),

    deleteToken: protectedProcedure
      .input(z.object({ tokenId: z.string() }))
      .mutation(async (opts) => {
        if (!opts.ctx.user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        const deleted = syncDispatch(
          mainDB,
          revokeToken({
            tokenId: opts.input.tokenId,
            userId: opts.ctx.user.id,
          }),
        );
        if (!deleted) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Token not found",
          });
        }

        return { success: true };
      }),

    getCaptchaConfig: publicProcedure.query(() => ({
      enabled: captchaConfig !== null,
      siteKey: captchaConfig?.WBD_CF_CAPTCHA_SITE_KEY ?? null,
    })),

    register: publicProcedure
      .input(
        z.object({
          email: z.email(),
          password: z.string().min(8),
          captchaToken: z.string().optional(),
        }),
      )
      .mutation(async (opts) => {
        const { email, password, captchaToken } = opts.input;

        if (captchaConfig) {
          if (!captchaToken) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Captcha verification required",
            });
          }

          const isValid = await verifyCaptchaToken(
            captchaToken,
            captchaConfig.WBD_CF_CAPTCHA_SECRET_KEY!,
          );

          if (!isValid) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Captcha verification failed",
            });
          }
        }

        const hashedPassword = await Bun.password.hash(password);
        return syncDispatch(mainDB, register({ email, hashedPassword }));
      }),

    importTodoist: protectedProcedure
      .input(z.object({ apiToken: z.string().min(1) }))
      .mutation(async (opts) => importFromTodoist(opts.input.apiToken)),

    login: publicProcedure
      .input(
        z.object({
          email: z.email(),
          password: z.string().min(8),
        }),
      )
      .mutation(async (opts) => {
        const { email, password } = opts.input;
        const user = syncDispatch(mainDB, getUserByEmail({ email }));
        if (!user) {
          throw new Error("Invalid credentials");
        }

        const isValid = await Bun.password.verify(password, user.password);
        if (!isValid) {
          throw new Error("Invalid credentials");
        }

        return syncDispatch(mainDB, generateToken({ userId: user.id }));
      }),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
