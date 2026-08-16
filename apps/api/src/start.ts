import { createAppRouter } from "./appRouter";
import { getBackupConfig } from "./backup/types";
import type { WorkerMessage, WorkerResponse } from "./backup/backupWorker";
import { getCaptchaConfig } from "./captcha/types";
import { closeDatabases, getMainHyperDB } from "./db/db";
import { getEnvConfig } from "./env";
import { createServer } from "./server";
import { getServerInstanceId } from "./serverInstance";
import { subscriptionManager } from "./subscriptionManager";

const start = async () => {
  try {
    const env = getEnvConfig();
    await subscriptionManager.initialize();
    console.log(
      `[Runtime] Instance ${getServerInstanceId()}; sync notifications=${subscriptionManager.backendName}; rate limiting=${env.WBD_RATE_LIMIT_ENABLED ? env.WBD_RATE_LIMIT_BACKEND : "disabled"}`,
    );
    const backupConfig = getBackupConfig();
    if (backupConfig?.WBD_BACKUP_S3_ENABLED && env.WBD_DB_ENGINE !== "sqlite") {
      throw new Error(
        `The local SQLite S3 backup worker cannot run with WBD_DB_ENGINE=${env.WBD_DB_ENGINE}. Disable WBD_BACKUP_S3_ENABLED or use a backup system designed for that engine.`,
      );
    }

    const mainDB = await getMainHyperDB();
    const appRouter = createAppRouter({
      mainDB,
      captchaConfig: getCaptchaConfig(),
    });
    const server = createServer({
      appRouter,
      mainDB,
      rateLimit: {
        enabled: env.WBD_RATE_LIMIT_ENABLED,
        backend: env.WBD_RATE_LIMIT_BACKEND,
        redisUrl: env.WBD_REDIS_URL,
        namespace: env.WBD_RATE_LIMIT_NAMESPACE,
      },
    });

    console.log("Starting server...");
    const port = parseInt(process.env.PORT || "3000", 10);
    await server.listen({ port, host: "0.0.0.0" });
    console.log("Server started");

    let backupWorker: Worker | null = null;
    if (backupConfig?.WBD_BACKUP_S3_ENABLED) {
      try {
        console.log("[Backup] S3 backup system enabled, spawning worker...");
        const dbsPath = getEnvConfig().WBD_DB_PATH;

        backupWorker = new Worker(
          new URL("./backup/backupWorker.ts", import.meta.url).href,
        );

        backupWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
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
        };

        backupWorker.onerror = (error) => {
          console.error("[Backup] Worker error:", error);
        };

        backupWorker.postMessage({
          type: "init",
          config: backupConfig,
          dbsPath,
        } satisfies WorkerMessage);
      } catch (error) {
        console.error("[Backup] Failed to initialize backup worker");
        if (error instanceof Error) {
          console.error("[Backup] Error name:", error.name);
          console.error("[Backup] Error message:", error.message);
          console.error("[Backup] Error stack:", error.stack);
        } else {
          console.error("[Backup] Error value:", String(error));
        }
      }
    } else {
      console.log("[Backup] S3 backup system disabled");
    }

    const signals = ["SIGINT", "SIGTERM", "SIGQUIT"];
    for (const signal of signals) {
      process.on(signal, () => {
        void (async () => {
          server.log.info(
            `${signal} signal received, shutting down gracefully...`,
          );

          try {
            if (backupWorker) {
              const shutdownPromise = new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error("Backup worker shutdown timeout"));
                }, 10000);

                const originalOnMessage = backupWorker!.onmessage;
                backupWorker!.onmessage = (
                  event: MessageEvent<WorkerResponse>,
                ) => {
                  if (event.data.type === "shutdown-complete") {
                    clearTimeout(timeout);
                    resolve();
                  } else if (event.data.type === "error") {
                    clearTimeout(timeout);
                    reject(new Error(event.data.message));
                  }

                  if (originalOnMessage) {
                    originalOnMessage.call(backupWorker, event);
                  }
                };
              });

              backupWorker.postMessage({
                type: "shutdown",
              } satisfies WorkerMessage);
              await shutdownPromise;
              backupWorker.terminate();
            }

            await server.close();
            await subscriptionManager.close();
            await closeDatabases();
            server.log.info("Server closed successfully");
            process.exit(0);
          } catch (error) {
            server.log.error(`Error during graceful shutdown: ${error}`);
            process.exit(1);
          }
        })();
      });
    }
  } catch (error) {
    console.error(error);
    try {
      await subscriptionManager.close();
    } catch (cleanupError) {
      console.error("Failed to close subscription manager", cleanupError);
    }
    try {
      await closeDatabases();
    } catch (cleanupError) {
      console.error("Failed to close databases", cleanupError);
    }
    process.exit(1);
  }
};

void start();
