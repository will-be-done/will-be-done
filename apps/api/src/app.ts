import type { DB } from "@will-be-done/hyperdb";
import { Context, Effect, Layer, Schedule } from "effect";
import type { FastifyBaseLogger } from "fastify";
import { createBackendAnalytics, type BackendAnalytics } from "./analytics";
import { createAppRouter } from "./appRouter";
import { getBackupConfig } from "./backup/types";
import type { WorkerMessage, WorkerResponse } from "./backup/backupWorker";
import { getCaptchaConfig } from "./captcha/types";
import { closeDatabases, getMainHyperDB } from "./db/db";
import { parseEmailConfig } from "./email/config";
import {
  createAccountEmailService,
  createResendSender,
  runEmailWorker,
  type EmailSender,
} from "./email/service";
import { AppEnv } from "./env";
import { parseGoogleConfig } from "./google/config";
import { createGoogleService } from "./google/service";
import { captureException } from "./instrument";
import { createServer } from "./server";
import { getServerInstanceId } from "./serverInstance";
import { Databases } from "./services/databases";
import { runSyncMaintenance } from "./sync/maintenance";
import { subscriptionManager } from "./subscriptionManager";

const BACKUP_WORKER_SHUTDOWN_TIMEOUT_MS = 10_000;

const BackupEngineCheck = Layer.effectDiscard(
  Effect.gen(function* () {
    const env = yield* AppEnv;
    if (
      getBackupConfig()?.WBD_BACKUP_S3_ENABLED &&
      env.WBD_DB_ENGINE !== "sqlite"
    ) {
      return yield* Effect.die(
        new Error(
          `The local SQLite S3 backup worker cannot run with WBD_DB_ENGINE=${env.WBD_DB_ENGINE}. Disable WBD_BACKUP_S3_ENABLED or use a backup system designed for that engine.`,
        ),
      );
    }
  }),
);

const SyncNotificationsLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const env = yield* AppEnv;
    yield* Effect.acquireRelease(
      Effect.promise(() => subscriptionManager.initialize()),
      () => Effect.promise(() => subscriptionManager.close()),
    );
    console.log(
      `[Runtime] Instance ${getServerInstanceId()}; sync notifications=${subscriptionManager.backendName}; rate limiting=${env.WBD_RATE_LIMIT_ENABLED ? env.WBD_RATE_LIMIT_BACKEND : "disabled"}`,
    );
  }),
);

export class MainDatabase extends Context.Service<MainDatabase, DB>()(
  "@will-be-done/api/MainDatabase",
) {
  // Closing also closes every user and space database opened since.
  static readonly layer = Layer.effect(
    MainDatabase,
    Effect.acquireRelease(Effect.promise(getMainHyperDB), () =>
      Effect.promise(closeDatabases),
    ),
  );
}

const DatabasesLive = Layer.effect(
  Databases,
  MainDatabase.use((mainDB) => Effect.succeed(Databases.make(mainDB))),
);

export class Analytics extends Context.Service<Analytics, BackendAnalytics>()(
  "@will-be-done/api/Analytics",
) {
  // The HTTP server shuts the client down when it closes.
  static readonly layer = Layer.effect(
    Analytics,
    Effect.gen(function* () {
      return createBackendAnalytics(yield* AppEnv);
    }),
  );
}

export class AccountEmail extends Context.Service<
  AccountEmail,
  | {
      readonly service: ReturnType<typeof createAccountEmailService>;
      readonly sender: EmailSender;
    }
  | undefined
>()("@will-be-done/api/AccountEmail") {
  static readonly layer = Layer.effect(
    AccountEmail,
    Effect.gen(function* () {
      const config = parseEmailConfig(yield* AppEnv);
      if (!config) return undefined;
      const mainDB = yield* MainDatabase;
      return {
        service: createAccountEmailService(mainDB, config),
        sender: createResendSender(config.apiKey),
      };
    }),
  );
}

export class Google extends Context.Service<
  Google,
  ReturnType<typeof createGoogleService> | undefined
>()("@will-be-done/api/Google") {
  static readonly layer = Layer.effect(
    Google,
    Effect.gen(function* () {
      const env = yield* AppEnv;
      const config = parseGoogleConfig(env);
      if (!config) return undefined;
      return createGoogleService(yield* MainDatabase, config, {
        analytics: yield* Analytics,
        emailConfig: parseEmailConfig(env) ?? undefined,
      });
    }),
  );
}

export class ApiServer extends Context.Service<
  ApiServer,
  { readonly url: string; readonly logger: FastifyBaseLogger }
>()("@will-be-done/api/ApiServer") {
  static readonly layer = Layer.effect(
    ApiServer,
    Effect.gen(function* () {
      const env = yield* AppEnv;
      const mainDB = yield* MainDatabase;
      const databases = yield* Databases;
      const analytics = yield* Analytics;
      const accountEmail = yield* AccountEmail;
      const google = yield* Google;
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          createServer({
            google,
            appRouter: createAppRouter({
              google,
              mainDB,
              captchaConfig: getCaptchaConfig(),
              accountEmail: accountEmail?.service,
              analytics,
            }),
            databases,
            rateLimit: {
              enabled: env.WBD_RATE_LIMIT_ENABLED,
              backend: env.WBD_RATE_LIMIT_BACKEND,
              redisUrl: env.WBD_REDIS_URL,
              namespace: env.WBD_RATE_LIMIT_NAMESPACE,
              globalOverride: { max: env.WBD_RATE_LIMIT_GLOBAL_MAX },
            },
            analytics,
          }),
        ),
        (server) => Effect.promise(() => server.close()),
      );
      console.log("Starting server...");
      const url = yield* Effect.promise(() =>
        server.listen({ port: env.PORT, host: "0.0.0.0" }),
      );
      console.log("Server started");
      return { url, logger: server.log };
    }),
  );
}

const SyncMaintenanceLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const { logger } = yield* ApiServer;
    yield* runSyncMaintenance(logger).pipe(
      Effect.repeat(Schedule.spaced("15 minutes")),
      Effect.forkScoped,
    );
  }),
);

// Sends queued account emails only while the server accepts requests.
const EmailWorkerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* ApiServer;
    const accountEmail = yield* AccountEmail;
    if (!accountEmail) return;
    yield* runEmailWorker(yield* MainDatabase, accountEmail.sender).pipe(
      Effect.forkScoped,
    );
  }),
);

const awaitBackupWorkerShutdown = (worker: Worker) =>
  Effect.callback<void, Error>((resume) => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === "shutdown-complete") resume(Effect.void);
      else if (event.data.type === "error") {
        resume(Effect.fail(new Error(event.data.message)));
      }
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ type: "shutdown" } satisfies WorkerMessage);
    return Effect.sync(() => worker.removeEventListener("message", onMessage));
  });

const startBackupWorker = (
  config: NonNullable<ReturnType<typeof getBackupConfig>>,
  dbsPath: string,
) =>
  Effect.try(() => {
    console.log("[Backup] S3 backup system enabled, spawning worker...");
    const worker = new Worker(
      new URL("./backup/backupWorker.ts", import.meta.url).href,
    );
    worker.addEventListener(
      "message",
      (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        switch (response.type) {
          case "initialized":
            console.log("[Backup] Worker initialized successfully");
            break;
          case "shutdown-complete":
            console.log("[Backup] Worker shutdown complete");
            break;
          case "error":
            console.error("[Backup] Worker error:", response.message);
            break;
        }
      },
    );
    worker.addEventListener("error", (error) => {
      captureException(error);
      console.error("[Backup] Worker error:", error);
    });
    worker.postMessage({
      type: "init",
      config,
      dbsPath,
    } satisfies WorkerMessage);
    return worker;
  });

// A worker that fails to start leaves the server running without backups.
const BackupWorkerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* ApiServer;
    const config = getBackupConfig();
    if (!config?.WBD_BACKUP_S3_ENABLED) {
      console.log("[Backup] S3 backup system disabled");
      return;
    }
    const dbsPath = (yield* AppEnv).WBD_DB_PATH;
    yield* Effect.acquireRelease(startBackupWorker(config, dbsPath), (worker) =>
      awaitBackupWorkerShutdown(worker).pipe(
        Effect.timeoutOrElse({
          duration: BACKUP_WORKER_SHUTDOWN_TIMEOUT_MS,
          orElse: () =>
            Effect.fail(new Error("Backup worker shutdown timeout")),
        }),
        Effect.ensuring(Effect.sync(() => worker.terminate())),
        Effect.orDie,
      ),
    ).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          captureException(error);
          console.error("[Backup] Failed to initialize backup worker", error);
        }),
      ),
    );
  }),
);

export const AppLive = Layer.mergeAll(
  EmailWorkerLive,
  BackupWorkerLive,
  SyncMaintenanceLive,
).pipe(
  Layer.provideMerge(ApiServer.layer),
  Layer.provideMerge(Layer.mergeAll(AccountEmail.layer, Google.layer)),
  Layer.provideMerge(Analytics.layer),
  Layer.provideMerge(DatabasesLive),
  Layer.provideMerge(MainDatabase.layer),
  Layer.provideMerge(SyncNotificationsLive),
  Layer.provideMerge(BackupEngineCheck),
  Layer.provideMerge(AppEnv.layer),
);
