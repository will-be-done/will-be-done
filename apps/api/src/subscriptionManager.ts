import { RedisClient, type RedisOptions } from "bun";
import { EventEmitter } from "events";
import { z } from "zod";
import type { getEnvConfig } from "./env";

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
  ): Promise<number>;
  unsubscribe(
    channel: string,
    listener: (message: string, channel: string) => void,
  ): Promise<void>;
}

type RedisClientFactory = (
  url: string,
  options: RedisOptions,
) => RedisPubSubClient;

type RedisChannelEntry = {
  callbacks: Set<NotificationCallback>;
  subscribePromise: Promise<unknown>;
};

export interface RedisSyncNotificationBusOptions {
  url: string;
  channelPrefix: string;
  createClient?: RedisClientFactory;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

const redisOptions: RedisOptions = {
  autoReconnect: true,
  connectionTimeout: 5_000,
  enableOfflineQueue: false,
  maxRetries: 10,
};

export class RedisSyncNotificationBus implements SyncNotificationBus {
  readonly name = "redis" as const;
  private readonly publisher: RedisPubSubClient;
  private readonly subscriber: RedisPubSubClient;
  private readonly channelPrefix: string;
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  private readonly channels = new Map<string, RedisChannelEntry>();
  private started = false;
  private closed = false;
  private subscriberConnectedOnce = false;
  private resubscribePromise: Promise<void> = Promise.resolve();

  private readonly redisListener = (message: string, channel: string) => {
    const entry = this.channels.get(channel);
    if (!entry) return;

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

    for (const callback of entry.callbacks) callback(parsed);
  };

  constructor({
    url,
    channelPrefix,
    createClient = (redisUrl, options) =>
      new RedisClient(redisUrl, options) as RedisPubSubClient,
    logger = console,
  }: RedisSyncNotificationBusOptions) {
    this.channelPrefix = channelPrefix.replace(/:+$/, "");
    this.logger = logger;
    this.publisher = createClient(url, redisOptions);
    this.subscriber = createClient(url, redisOptions);

    this.publisher.onclose = (error) => {
      if (!this.closed) {
        this.logger.error(
          `[Sync notifications] Redis publisher disconnected: ${error.message}`,
        );
      }
    };
    this.subscriber.onclose = (error) => {
      if (!this.closed) {
        this.logger.error(
          `[Sync notifications] Redis subscriber disconnected: ${error.message}`,
        );
      }
    };
    this.subscriber.onconnect = () => {
      if (!this.subscriberConnectedOnce) {
        this.subscriberConnectedOnce = true;
        return;
      }

      this.resubscribePromise = this.resubscribePromise
        .then(() => this.resubscribe())
        .catch((error) => {
          this.logger.error(
            `[Sync notifications] Failed to restore Redis subscriptions: ${String(error)}`,
          );
        });
    };
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.closed) throw new Error("Redis notification bus is closed");

    try {
      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
      await this.publisher.ping();
      this.started = true;
      this.logger.info("[Sync notifications] Redis backend connected");
    } catch (error) {
      this.publisher.close();
      this.subscriber.close();
      this.closed = true;
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
    this.assertStarted();
    await this.resubscribePromise;

    const channel = this.createChannel(dbId, dbType);
    let entry = this.channels.get(channel);
    if (!entry) {
      entry = {
        callbacks: new Set(),
        subscribePromise: this.subscriber.subscribe(
          channel,
          this.redisListener,
        ),
      };
      this.channels.set(channel, entry);
    }
    entry.callbacks.add(callback);

    try {
      await entry.subscribePromise;
    } catch (error) {
      entry.callbacks.delete(callback);
      if (entry.callbacks.size === 0) this.channels.delete(channel);
      throw error;
    }

    let unsubscribed = false;
    return async () => {
      if (unsubscribed) return;
      unsubscribed = true;

      const currentEntry = this.channels.get(channel);
      if (!currentEntry) return;
      currentEntry.callbacks.delete(callback);
      if (currentEntry.callbacks.size > 0) return;

      this.channels.delete(channel);
      if (!this.closed) {
        await this.subscriber.unsubscribe(channel, this.redisListener);
      }
    };
  }

  async publish(data: NotificationData): Promise<void> {
    this.assertStarted();
    await this.publisher.publish(
      this.createChannel(data.dbId, data.dbType),
      JSON.stringify(data),
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const channels = [...this.channels.keys()];
    this.channels.clear();

    try {
      if (this.subscriber.connected) {
        await Promise.all(
          channels.map((channel) =>
            this.subscriber.unsubscribe(channel, this.redisListener),
          ),
        );
      }
    } catch (error) {
      this.logger.warn(
        `[Sync notifications] Failed to unsubscribe while closing Redis: ${String(error)}`,
      );
    } finally {
      this.publisher.close();
      this.subscriber.close();
    }
  }

  private async resubscribe(): Promise<void> {
    if (this.closed || this.channels.size === 0) return;

    await Promise.all(
      [...this.channels.entries()].map(async ([channel, entry]) => {
        entry.subscribePromise = this.subscriber.subscribe(
          channel,
          this.redisListener,
        );
        await entry.subscribePromise;
      }),
    );
    this.logger.info(
      `[Sync notifications] Restored ${this.channels.size} Redis subscription(s)`,
    );
  }

  private createChannel(dbId: string, dbType: DbType): string {
    return `${this.channelPrefix}:${dbType}:${encodeURIComponent(dbId)}`;
  }

  private assertStarted(): void {
    if (!this.started || this.closed) {
      throw new Error("Redis notification bus is not running");
    }
  }
}

type EnvConfig = ReturnType<typeof getEnvConfig>;

export class SubscriptionManager {
  private backend: SyncNotificationBus;
  private initialized = false;

  constructor(
    backend: SyncNotificationBus = new InMemorySyncNotificationBus(),
  ) {
    this.backend = backend;
  }

  get backendName(): SyncNotificationBus["name"] {
    return this.backend.name;
  }

  async initialize(
    config: Pick<
      EnvConfig,
      | "WBD_SYNC_NOTIFICATIONS_BACKEND"
      | "WBD_REDIS_URL"
      | "WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX"
    >,
  ): Promise<void> {
    if (this.initialized) return;

    const nextBackend =
      config.WBD_SYNC_NOTIFICATIONS_BACKEND === "redis"
        ? new RedisSyncNotificationBus({
            url: config.WBD_REDIS_URL!,
            channelPrefix: config.WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX,
          })
        : this.backend;

    await nextBackend.start();
    if (nextBackend !== this.backend) await this.backend.close();
    this.backend = nextBackend;
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

export const subscriptionManager = new SubscriptionManager();
