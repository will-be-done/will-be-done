import type { DB, HyperDB } from "@will-be-done/hyperdb";
import { Context, Effect, Layer } from "effect";
import { spaceDBConfig, userDBConfig } from "../db/configs";
import {
  createDatabaseRegistry,
  type DBConfig,
  type LoadedDatabase,
  type OpenedDatabase,
} from "../db/db";
import { SyncNotifications } from "./syncNotifications";

export class Databases extends Context.Service<
  Databases,
  {
    readonly main: Effect.Effect<DB>;
    readonly open: (config: DBConfig) => Effect.Effect<OpenedDatabase>;
    readonly loaded: Effect.Effect<readonly LoadedDatabase[]>;
  }
>()("@will-be-done/api/Databases") {
  // Closing the layer closes every database it opened.
  static readonly layer = Layer.effect(
    Databases,
    Effect.gen(function* () {
      const notifications = yield* SyncNotifications;
      const registry = yield* Effect.acquireRelease(
        Effect.sync(() =>
          createDatabaseRegistry((dbId, dbType) =>
            notifications.notifyChangesAvailable(dbId, dbType),
          ),
        ),
        (registry) => Effect.promise(registry.close),
      );
      return {
        main: Effect.promise(registry.main),
        open: (config) => Effect.promise(() => registry.open(config)),
        loaded: Effect.sync(registry.loaded),
      };
    }),
  );
}

export const userDatabase = (userId: string) =>
  Databases.use((databases) => databases.open(userDBConfig(userId))).pipe(
    Effect.map(({ db }): HyperDB => db),
  );

export const spaceDatabase = (spaceId: string) =>
  Databases.use((databases) => databases.open(spaceDBConfig(spaceId))).pipe(
    Effect.map(({ db }): HyperDB => db),
  );
