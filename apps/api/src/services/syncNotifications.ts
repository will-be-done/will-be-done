import { Context, Effect, Layer } from "effect";
import { AppEnv } from "../env";
import {
  createSyncNotificationBus,
  InMemorySyncNotificationBus,
  SubscriptionManager,
} from "../subscriptionManager";

export class SyncNotifications extends Context.Service<
  SyncNotifications,
  SubscriptionManager
>()("@will-be-done/api/SyncNotifications") {
  static readonly layer = Layer.effect(
    SyncNotifications,
    Effect.gen(function* () {
      const env = yield* AppEnv;
      return yield* Effect.acquireRelease(
        Effect.promise(async () => {
          const manager = new SubscriptionManager(
            createSyncNotificationBus(env),
          );
          await manager.initialize();
          return manager;
        }),
        (manager) => Effect.promise(() => manager.close()),
      );
    }),
  );

  static readonly inMemory = () =>
    new SubscriptionManager(new InMemorySyncNotificationBus());
}
