import { Context, Effect } from "effect";
import { FetchHttpClient } from "effect/http";
import { z } from "zod";
import type { DB } from "@will-be-done/hyperdb";
import { TRPCError } from "@trpc/server";
import {
  enforceRateLimit,
  protectedProcedure,
  publicProcedure,
  router,
  toTRPCError,
} from "./trpc";
import {
  generateToken,
  getTokensByUserId,
  getUserByEmail,
  getUserByNormalizedEmail,
  getUserById,
  register,
  revokeToken,
} from "./slices/authSlice";
import type { NotificationData } from "./subscriptionManager";
import { State } from "./utils/State";
import type { CaptchaConfig } from "./captcha/types";
import { verifyCaptchaToken } from "./captcha/verifyCaptchaToken";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { importFromTodoist } from "./todoist/importTodoist";
import { ensureDatabaseAccessOrCreate } from "./services/databaseAccess";
import { Databases } from "./services/databases";
import type { SyncNotifications } from "./services/syncNotifications";
import { ResourceNotFoundError, UnauthorizedError } from "./services/errors";
import type { ServiceError } from "./services/errors";
import { dispatch } from "./services/hyperdb";
import { assertSupportedSyncVersion } from "./syncVersion";
import { noopBackendAnalytics, type BackendAnalytics } from "./analytics";

import {
  changeAccountEmail,
  requireAccountEmail,
  type AccountEmailService,
} from "./email/service";

import { googleRouter } from "./google/router";
import type { GoogleService } from "./google/service";

const CAPTCHA_VERIFICATION_TIMEOUT = "10 seconds";

export interface AppRouterDependencies {
  mainDB: DB;
  databases: Databases["Service"];
  notifications: SyncNotifications["Service"];
  captchaConfig: CaptchaConfig | null;
  analytics?: BackendAnalytics;
  accountEmail?: AccountEmailService;
  google?: GoogleService;
}

export function createAppRouter({
  mainDB,
  databases,
  notifications,
  captchaConfig,
  analytics = noopBackendAnalytics,
  accountEmail,
  google,
}: AppRouterDependencies) {
  const services = Context.make(Databases, databases);
  const run = <A, E extends ServiceError>(
    effect: Effect.Effect<A, E, Databases>,
  ) => Effect.runPromiseWith(services)(toTRPCError(effect));

  return router({
    google: googleRouter(mainDB, google, analytics),
    getAuthConfig: publicProcedure.query(() => ({
      emailEnabled: accountEmail?.enabled ?? false,
      googleEnabled: Boolean(google),
    })),
    getAccount: protectedProcedure.query(({ ctx }) =>
      run(
        Effect.gen(function* () {
          const user = yield* dispatch(
            mainDB,
            getUserById({ id: ctx.user.id }),
          );
          if (!user) return yield* new UnauthorizedError();
          return {
            id: user.id,
            email: user.email,
            emailVerifiedAt: user.emailVerifiedAt ?? null,
            hasPassword: Boolean(user.password),
            googleEmail: user.googleEmail ?? null,
          };
        }),
      ),
    ),
    requestEmailVerification: protectedProcedure
      .use(enforceRateLimit("accountEmailSend"))
      .mutation(({ ctx }) =>
        requireAccountEmail(accountEmail).requestVerification(ctx.user.id),
      ),
    changeEmail: protectedProcedure
      .input(
        z.object({
          email: z.string().trim().pipe(z.email()),
          password: z.string().min(1).max(1024).optional(),
        }),
      )
      .use(enforceRateLimit("accountEmailSend"))
      .mutation(({ ctx, input }) => {
        if (!ctx.tokenId) throw new TRPCError({ code: "UNAUTHORIZED" });
        const actor = { userId: ctx.user.id, tokenId: ctx.tokenId };
        return accountEmail?.enabled
          ? accountEmail.changeEmail(actor, input.email, input.password)
          : changeAccountEmail(mainDB, actor, input.email, input.password);
      }),
    confirmEmailChange: publicProcedure
      .input(z.object({ token: z.string().min(1).max(128) }))
      .use(enforceRateLimit("accountEmailConsume"))
      .mutation(({ input }) =>
        requireAccountEmail(accountEmail).confirmEmailChange(input.token),
      ),
    verifyEmail: publicProcedure
      .input(z.object({ token: z.string().min(1).max(128) }))
      .use(enforceRateLimit("accountEmailConsume"))
      .mutation(({ input }) =>
        requireAccountEmail(accountEmail).verify(input.token),
      ),
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.email() }))
      .use(enforceRateLimit("accountEmailSend"))
      .mutation(({ input }) =>
        requireAccountEmail(accountEmail).requestReset(input.email),
      ),
    resetPassword: publicProcedure
      .input(
        z.object({
          token: z.string().min(1).max(128),
          password: z.string().min(8).max(1024),
        }),
      )
      .use(enforceRateLimit("accountEmailConsume"))
      .mutation(({ input }) =>
        requireAccountEmail(accountEmail).reset(input.token, input.password),
      ),
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

        await run(
          ensureDatabaseAccessOrCreate({
            dbId: opts.input.dbId,
            dbType: opts.input.dbType,
            userId: opts.ctx.user.id,
          }),
        );

        const state = new State<NotificationData[]>([]);
        const unsubscribe = await notifications.subscribe(
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
              if (
                opts.ctx.revalidateUser &&
                !(await opts.ctx.revalidateUser())
              ) {
                throw new TRPCError({ code: "UNAUTHORIZED" });
              }
              yield notification;
            }
          }
        } finally {
          abortController.abort();
          opts.signal?.removeEventListener("abort", abort);
          await unsubscribe();
        }
      }),

    listTokens: protectedProcedure.query(({ ctx }) =>
      run(
        dispatch(mainDB, getTokensByUserId({ userId: ctx.user.id })).pipe(
          Effect.map((tokens) =>
            tokens.map(
              ({
                id,
                createdAt,
                lastUsedAt,
                lastUsedIp,
                lastUsedUserAgent,
              }) => ({
                id,
                createdAt,
                ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
                ...(lastUsedIp !== undefined ? { lastUsedIp } : {}),
                ...(lastUsedUserAgent !== undefined
                  ? { lastUsedUserAgent }
                  : {}),
              }),
            ),
          ),
        ),
      ),
    ),

    createToken: protectedProcedure.mutation(({ ctx }) =>
      run(
        Effect.gen(function* () {
          const created = yield* dispatch(
            mainDB,
            generateToken({
              userId: ctx.user.id,
              authorizedByToken: ctx.tokenId,
            }),
          );
          analytics.capture({
            name: "api_token_created",
            distinctId: ctx.user.id,
          });
          return { id: created.token, createdAt: created.createdAt };
        }),
      ),
    ),

    deleteToken: protectedProcedure
      .input(z.object({ tokenId: z.string() }))
      .mutation(({ ctx, input }) =>
        run(
          Effect.gen(function* () {
            const deleted = yield* dispatch(
              mainDB,
              revokeToken({ tokenId: input.tokenId, userId: ctx.user.id }),
            );
            if (!deleted) {
              return yield* new ResourceNotFoundError({ resource: "Token" });
            }
            return { success: true };
          }),
        ),
      ),

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
            Effect.runPromise(
              verifyCaptchaToken(
                captchaToken,
                captchaConfig.WBD_CF_CAPTCHA_SECRET_KEY!,
                CAPTCHA_VERIFICATION_TIMEOUT,
              ).pipe(Effect.provide(FetchHttpClient.layer)),
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
          accountEmail?.enabled
            ? accountEmail.register(email, hashedPassword)
            : run(dispatch(mainDB, register({ email, hashedPassword }))),
        );
        console.log(
          `[Register ${requestId}] request completed in ${Math.round(performance.now() - requestStartedAt)}ms`,
        );
        analytics.capture({
          name: "user_signed_up",
          distinctId: result.userId,
          properties: {
            captcha_enabled: captchaConfig !== null,
            auth_method: "password",
          },
        });
        return result;
      }),

    importTodoist: protectedProcedure
      .input(z.object({ apiToken: z.string().min(1) }))
      .use(enforceRateLimit("todoistImport"))
      .mutation(({ input }) =>
        Effect.runPromise(
          importFromTodoist(new TodoistApi(input.apiToken)).pipe(Effect.orDie),
        ),
      ),

    login: publicProcedure
      .input(
        z.object({
          email: z.email(),
          password: z.string().min(8),
        }),
      )
      .use(enforceRateLimit("login"))
      .mutation(({ input: { email, password } }) =>
        run(
          Effect.gen(function* () {
            const user =
              (yield* dispatch(mainDB, getUserByEmail({ email }))) ??
              (yield* dispatch(mainDB, getUserByNormalizedEmail({ email })));
            const hashedPassword = user?.password;
            if (
              !user ||
              !hashedPassword ||
              !(yield* Effect.promise(() =>
                Bun.password.verify(password, hashedPassword),
              ))
            ) {
              return yield* Effect.die(new Error("Invalid credentials"));
            }

            const result = yield* dispatch(
              mainDB,
              generateToken({
                userId: user.id,
                expectedPassword: hashedPassword,
              }),
            );
            analytics.capture({
              name: "login_succeeded",
              distinctId: user.id,
              properties: { auth_method: "password" },
            });
            return result;
          }),
        ),
      ),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
