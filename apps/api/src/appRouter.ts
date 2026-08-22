import { createHmac } from "node:crypto";
import { z } from "zod";
import { asyncDispatch, type DB } from "@will-be-done/hyperdb";
import { TRPCError } from "@trpc/server";
import {
  enforceRateLimit,
  protectedProcedure,
  publicProcedure,
  router,
} from "./trpc";
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
import { verifyCaptchaTokenWithTimeout } from "./captcha/verifyCaptchaToken";
import { importFromTodoist } from "./todoist/importTodoist";
import {
  DatabaseAccessDeniedError,
  ensureDatabaseAccessOrCreate,
} from "./services/databaseAccess";
import { assertSupportedSyncVersion } from "./syncVersion";

const CAPTCHA_VERIFICATION_TIMEOUT_MS = 10_000;

export interface AppRouterDependencies {
  mainDB: DB;
  captchaConfig: CaptchaConfig | null;
  tawkApiKey?: string;
}

export function createAppRouter({
  mainDB,
  captchaConfig,
  tawkApiKey,
}: AppRouterDependencies) {
  const checkDatabaseAccess = async (
    dbId: string,
    dbType: "user" | "space",
    userId: string,
  ) => {
    try {
      await ensureDatabaseAccessOrCreate({ dbId, dbType, userId }, mainDB);
    } catch (error) {
      if (error instanceof DatabaseAccessDeniedError) {
        throw new TRPCError({ code: "FORBIDDEN", message: error.message });
      }
      throw error;
    }
  };

  return router({
    getTawkIdentity: protectedProcedure.query((opts) => {
      if (!tawkApiKey) return null;

      const { id: userId, email } = opts.ctx.user;
      return {
        userId,
        email,
        hash: createHmac("sha256", tawkApiKey).update(userId).digest("hex"),
      };
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

        await checkDatabaseAccess(
          opts.input.dbId,
          opts.input.dbType,
          opts.ctx.user.id,
        );

        const state = new State<NotificationData[]>([]);
        const unsubscribe = await subscriptionManager.subscribe(
          opts.input.dbId,
          opts.input.dbType,
          (data) => {
            state.modify((notifications) => [...notifications, data]);
          },
        );
        const abortController = new AbortController();
        const abort = () => abortController.abort(opts.signal?.reason);
        if (opts.signal?.aborted) abort();
        else opts.signal?.addEventListener("abort", abort, { once: true });

        try {
          while (true) {
            await state.when(
              (notifications) => notifications.length > 0,
              abortController.signal,
            );
            const notifications = state.get();
            state.set([]);

            for (const notification of notifications) {
              yield notification;
            }
          }
        } finally {
          abortController.abort();
          opts.signal?.removeEventListener("abort", abort);
          await unsubscribe();
        }
      }),

    listTokens: protectedProcedure.query(async (opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      return (
        await asyncDispatch(
          mainDB,
          getTokensByUserId({ userId: opts.ctx.user.id }),
        )
      ).map(({ id, createdAt, lastUsedAt, lastUsedIp, lastUsedUserAgent }) => ({
        id,
        createdAt,
        ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
        ...(lastUsedIp !== undefined ? { lastUsedIp } : {}),
        ...(lastUsedUserAgent !== undefined ? { lastUsedUserAgent } : {}),
      }));
    }),

    createToken: protectedProcedure.mutation(async (opts) => {
      if (!opts.ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const created = await asyncDispatch(
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

        const deleted = await asyncDispatch(
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
      .use(enforceRateLimit("register"))
      .mutation(async (opts) => {
        const { email, password, captchaToken } = opts.input;
        const requestId = opts.ctx.requestId ?? "internal";
        const requestStartedAt = performance.now();

        const runStage = async <T>(
          stage: string,
          operation: () => Promise<T>,
        ): Promise<T> => {
          const startedAt = performance.now();
          console.log(`[Register ${requestId}] ${stage} started`);
          const slowWarning = setTimeout(() => {
            console.warn(
              `[Register ${requestId}] ${stage} is still running after 5s`,
            );
          }, 5_000);

          try {
            const result = await operation();
            console.log(
              `[Register ${requestId}] ${stage} completed in ${Math.round(performance.now() - startedAt)}ms`,
            );
            return result;
          } catch (error) {
            console.error(
              `[Register ${requestId}] ${stage} failed after ${Math.round(performance.now() - startedAt)}ms`,
              error,
            );
            throw error;
          } finally {
            clearTimeout(slowWarning);
          }
        };

        console.log(
          `[Register ${requestId}] request started; captcha=${captchaConfig ? "enabled" : "disabled"}`,
        );

        if (captchaConfig) {
          if (!captchaToken) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Captcha verification required",
            });
          }

          const isValid = await runStage("captcha verification", () =>
            verifyCaptchaTokenWithTimeout(
              captchaToken,
              captchaConfig.WBD_CF_CAPTCHA_SECRET_KEY!,
              CAPTCHA_VERIFICATION_TIMEOUT_MS,
            ),
          );

          if (!isValid) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Captcha verification failed",
            });
          }
        }

        const hashedPassword = await runStage("password hashing", () =>
          Bun.password.hash(password),
        );
        const result = await runStage("database transaction", () =>
          asyncDispatch(mainDB, register({ email, hashedPassword })),
        );
        console.log(
          `[Register ${requestId}] request completed in ${Math.round(performance.now() - requestStartedAt)}ms`,
        );
        return result;
      }),

    importTodoist: protectedProcedure
      .input(z.object({ apiToken: z.string().min(1) }))
      .use(enforceRateLimit("todoistImport"))
      .mutation(async (opts) => importFromTodoist(opts.input.apiToken)),

    login: publicProcedure
      .input(
        z.object({
          email: z.email(),
          password: z.string().min(8),
        }),
      )
      .use(enforceRateLimit("login"))
      .mutation(async (opts) => {
        const { email, password } = opts.input;
        const user = await asyncDispatch(mainDB, getUserByEmail({ email }));
        if (!user) {
          throw new Error("Invalid credentials");
        }

        const isValid = await Bun.password.verify(password, user.password);
        if (!isValid) {
          throw new Error("Invalid credentials");
        }

        return asyncDispatch(mainDB, generateToken({ userId: user.id }));
      }),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
