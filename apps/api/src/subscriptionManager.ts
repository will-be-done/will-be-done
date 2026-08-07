import { RedisClient, type RedisOptions } from "bun";
import AwaitLock from "await-lock";
import { EventEmitter } from "events";
import { z } from "zod";
import { getEnvConfig } from "./env";
import { State } from "./utils/State";

export type DbType = "user" | "space";
type DbKey = `${string}:${DbType}`;
type NotificationCallback = (data: NotificationData) => void;
export type Unsubscribe = () => Promise<void>;

export type NotificationData = {
  dbId: string;
  dbType: DbType;
  timestamp: number;
};

const NotificationDataSchema = z.object({
  dbId: z.string(),
  dbType: z.enum(["user", "space"]),
  timestamp: z.number(),
});

export interface SyncNotificationBus {
  readonly name: "memory" | "redis";
  start(): Promise<void>;
  subscribe(
    dbId: string,
    dbType: DbType,
    callback: NotificationCallback,
  ): Promise<Unsubscribe>;
  publish(data: NotificationData): Promise<void>;
  close(): Promise<void>;
}

function createDbKey(dbId: string, dbType: DbType): DbKey {
  return `${dbId}:${dbType}`;
}

export class InMemorySyncNotificationBus implements SyncNotificationBus {
  readonly name = "memory" as const;
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100000);
  }

  async start(): Promise<void> {}

  async subscribe(
    dbId: string,
    dbType: DbType,
    callback: NotificationCallback,
  ): Promise<Unsubscribe> {
    const key = createDbKey(dbId, dbType);
    this.emitter.on(key, callback);

    return async () => {
      this.emitter.off(key, callback);
    };
  }

  async publish(data: NotificationData): Promise<void> {
    this.emitter.emit(createDbKey(data.dbId, data.dbType), data);
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}

export interface RedisPubSubClient {
  connected: boolean;
  onconnect: (() => void) | null;
  onclose: ((error: Error) => void) | null;
  connect(): Promise<void>;
  close(): void;
  ping(): Promise<"PONG">;
  publish(channel: string, message: string): Promise<number>;
  subscribe(
    channel: string,
    listener: (message: string, channel: string) => void,
  ): Promise<void>;
  unsubscribe(
    channel: string,
    listener: (message: string, channel: string) => void,
  ): Promise<void>;
}

type RedisClientFactory = (
  url: string,
  options: RedisOptions,
) => RedisPubSubClient;

type SyncNotificationLogger = Pick<Console, "info" | "warn" | "error">;

export interface RedisSyncNotificationBusOptions {
  url: string;
  channelPrefix: string;
  createClient?: RedisClientFactory;
  logger?: SyncNotificationLogger;
}

const redisOptions: RedisOptions = {
  autoReconnect: true,
  connectionTimeout: 5_000,
  enableOfflineQueue: false,
  maxRetries: 10,
};

class RedisSubscriptionExecutor {
  // All channel and Redis subscription changes run under this lock.
  private readonly channels = new Map<string, Set<NotificationCallback>>();
  private readonly lock = new AwaitLock();
  private closing = false;

  private readonly redisListener = (message: string, channel: string) => {
    this.deliver(message, channel);
  };

  constructor(
    private readonly subscriber: RedisPubSubClient,
    private readonly createChannel: (dbId: string, dbType: DbType) => string,
    private readonly logger: SyncNotificationLogger,
  ) {}

  async subscribe(
    channel: string,
    callback: NotificationCallback,
  ): Promise<Unsubscribe> {
    await this.runExclusive(async () => {
      const callbacks = this.channels.get(channel);
      if (callbacks) {
        callbacks.add(callback);
        return;
      }

      this.channels.set(channel, new Set([callback]));
      try {
        await this.subscriber.subscribe(channel, this.redisListener);
      } catch (error) {
        this.channels.delete(channel);
        throw error;
      }
    });

    let unsubscribed = false;
    return async () => {
      if (unsubscribed) return;
      unsubscribed = true;

      if (this.closing) return;
      await this.runExclusive(async () => {
        const callbacks = this.channels.get(channel);
        if (!callbacks) return;

        callbacks.delete(callback);
        if (callbacks.size > 0) return;

        this.channels.delete(channel);
        await this.subscriber.unsubscribe(channel, this.redisListener);
      });
    };
  }

  async restoreSubscriptions(): Promise<void> {
    await this.runExclusive(async () => {
      const channels = [...this.channels.keys()];
      await Promise.all(
        channels.map((channel) =>
          this.subscriber.subscribe(channel, this.redisListener),
        ),
      );
      this.logger.info(
        `[Sync notifications] Restored ${channels.length} Redis subscription(s)`,
      );
    });
  }

  async waitForPendingOperations(): Promise<void> {
    await this.runExclusive(async () => {});
  }

  async close(): Promise<void> {
    if (this.closing) {
      await this.waitForLock();
      return;
    }
    this.closing = true;
    await this.lock.acquireAsync();
    try {
      const channels = [...this.channels.keys()];
      this.channels.clear();
      if (!this.subscriber.connected) return;

      try {
        await Promise.all(
          channels.map((channel) =>
            this.subscriber.unsubscribe(channel, this.redisListener),
          ),
        );
      } catch (error) {
        this.logger.warn(
          `[Sync notifications] Failed to unsubscribe while closing Redis: ${String(error)}`,
        );
      }
    } finally {
      this.lock.release();
    }
  }

  private deliver(message: string, channel: string): void {
    const callbacks = this.channels.get(channel);
    if (!callbacks) return;

    let parsed: NotificationData;
    try {
      parsed = NotificationDataSchema.parse(JSON.parse(message));
    } catch (error) {
      this.logger.warn(
        `[Sync notifications] Ignoring malformed Redis message on "${channel}": ${String(error)}`,
      );
      return;
    }

    if (this.createChannel(parsed.dbId, parsed.dbType) !== channel) {
      this.logger.warn(
        `[Sync notifications] Ignoring Redis message whose database does not match channel "${channel}"`,
      );
      return;
    }

    for (const callback of callbacks) {
      try {
        callback(parsed);
      } catch (error) {
        this.logger.error(
          `[Sync notifications] Redis subscriber callback failed on "${channel}": ${String(error)}`,
        );
      }
    }
  }

  private async runExclusive(operation: () => Promise<void>): Promise<void> {
    if (this.closing) {
      throw new Error("Redis subscription executor is closed");
    }

    await this.lock.acquireAsync();
    try {
      await operation();
    } finally {
      this.lock.release();
    }
  }

  private async waitForLock(): Promise<void> {
    await this.lock.acquireAsync();
    this.lock.release();
  }
}

type RedisBusLifecycle = "new" | "starting" | "running" | "closing" | "closed";

export class RedisSyncNotificationBus implements SyncNotificationBus {
  readonly name = "redis" as const;
  private readonly publisher: RedisPubSubClient;
  private readonly subscriber: RedisPubSubClient;
  private readonly channelPrefix: string;
  private readonly logger: SyncNotificationLogger;
  private readonly subscriptions: RedisSubscriptionExecutor;
  private readonly lifecycle = new State<RedisBusLifecycle>("new");

  constructor({
    url,
    channelPrefix,
    createClient = (redisUrl, options) =>
      new RedisClient(redisUrl, options) as unknown as RedisPubSubClient,
    logger = console,
  }: RedisSyncNotificationBusOptions) {
    this.channelPrefix = channelPrefix.replace(/:+$/, "");
    this.logger = logger;
    this.publisher = createClient(url, redisOptions);
    this.subscriber = createClient(url, redisOptions);
    this.subscriptions = new RedisSubscriptionExecutor(
      this.subscriber,
      (dbId, dbType) => this.createChannel(dbId, dbType),
      logger,
    );

    this.publisher.onclose = (error) => {
      if (!this.isClosingOrClosed()) {
        this.logger.error(
          `[Sync notifications] Redis publisher disconnected: ${error.message}`,
        );
      }
    };
    this.subscriber.onclose = (error) => {
      if (!this.isClosingOrClosed()) {
        this.logger.error(
          `[Sync notifications] Redis subscriber disconnected: ${error.message}`,
        );
      }
    };
    this.subscriber.onconnect = () => {
      if (this.lifecycle.get() === "running") {
        void this.subscriptions.restoreSubscriptions().catch((error) => {
          this.logger.error(
            `[Sync notifications] Failed to restore Redis subscriptions: ${String(error)}`,
          );
        });
      }
    };
  }

  async start(): Promise<void> {
    const lifecycle = this.lifecycle.get();
    if (lifecycle === "running") return;
    if (lifecycle === "starting") {
      await this.lifecycle.when((state) => state !== "starting");
      if (this.lifecycle.get() === "running") return;
      throw new Error("Redis notification bus is closed");
    }
    if (lifecycle !== "new") {
      throw new Error("Redis notification bus is closed");
    }

    this.lifecycle.set("starting");

    try {
      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
      await this.publisher.ping();
      if (this.lifecycle.get() !== "starting") {
        throw new Error("Redis notification bus was closed while starting");
      }
      this.lifecycle.set("running");
      this.logger.info("[Sync notifications] Redis backend connected");
    } catch (error) {
      await this.subscriptions.close();
      this.publisher.close();
      this.subscriber.close();
      this.lifecycle.set("closed");
      throw new Error("Failed to connect Redis sync notification backend", {
        cause: error,
      });
    }
  }

  async subscribe(
    dbId: string,
    dbType: DbType,
    callback: NotificationCallback,
  ): Promise<Unsubscribe> {
    this.assertRunning();
    const channel = this.createChannel(dbId, dbType);
    return this.subscriptions.subscribe(channel, callback);
  }

  async publish(data: NotificationData): Promise<void> {
    this.assertRunning();
    // onconnect cannot await restoration, so publish queues behind it.
    await this.subscriptions.waitForPendingOperations();
    await this.publisher.publish(
      this.createChannel(data.dbId, data.dbType),
      JSON.stringify(data),
    );
  }

  async close(): Promise<void> {
    if (this.isClosingOrClosed()) {
      await this.lifecycle.when((state) => state === "closed");
      return;
    }
    this.lifecycle.set("closing");
    try {
      await this.subscriptions.close();
    } finally {
      this.publisher.close();
      this.subscriber.close();
      this.lifecycle.set("closed");
    }
  }

  private createChannel(dbId: string, dbType: DbType): string {
    return `${this.channelPrefix}:${dbType}:${encodeURIComponent(dbId)}`;
  }

  private assertRunning(): void {
    if (this.lifecycle.get() !== "running") {
      throw new Error("Redis notification bus is not running");
    }
  }

  private isClosingOrClosed(): boolean {
    const lifecycle = this.lifecycle.get();
    return lifecycle === "closing" || lifecycle === "closed";
  }
}

export class SubscriptionManager {
  private initialized = false;

  constructor(private readonly backend: SyncNotificationBus) {}

  get backendName(): SyncNotificationBus["name"] {
    return this.backend.name;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.backend.start();
    this.initialized = true;
  }

  async subscribe(
    dbId: string,
    dbType: DbType,
    callback: NotificationCallback,
  ): Promise<Unsubscribe> {
    return this.backend.subscribe(dbId, dbType, callback);
  }

  async notifyChangesAvailable(dbId: string, dbType: DbType): Promise<void> {
    await this.backend.publish({ dbId, dbType, timestamp: Date.now() });
  }

  async close(): Promise<void> {
    await this.backend.close();
  }
}

type EnvConfig = ReturnType<typeof getEnvConfig>;

type SyncNotificationConfig = Pick<
  EnvConfig,
  | "WBD_SYNC_NOTIFICATIONS_BACKEND"
  | "WBD_REDIS_URL"
  | "WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX"
>;

export function createSyncNotificationBus(
  config: SyncNotificationConfig,
): SyncNotificationBus {
  if (config.WBD_SYNC_NOTIFICATIONS_BACKEND === "redis") {
    return new RedisSyncNotificationBus({
      url: config.WBD_REDIS_URL!,
      channelPrefix: config.WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX,
    });
  }

  return new InMemorySyncNotificationBus();
}

export const subscriptionManager = new SubscriptionManager(
  createSyncNotificationBus(getEnvConfig()),
);
