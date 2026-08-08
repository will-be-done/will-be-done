import { describe, expect, test } from "bun:test";
import {
  InMemorySyncNotificationBus,
  RedisSyncNotificationBus,
  SubscriptionManager,
  type NotificationData,
  type RedisPubSubClient,
  type SyncNotificationBus,
} from "./subscriptionManager";

type RedisListener = (message: string, channel: string) => void;

class FakeRedisHub {
  readonly clients: FakeRedisClient[] = [];
  private readonly channels = new Map<
    string,
    Set<{ client: FakeRedisClient; listener: RedisListener }>
  >();

  createClient = (): RedisPubSubClient => {
    const client = new FakeRedisClient(this);
    this.clients.push(client);
    return client;
  };

  subscribe(
    client: FakeRedisClient,
    channel: string,
    listener: RedisListener,
  ): number {
    let subscriptions = this.channels.get(channel);
    if (!subscriptions) {
      subscriptions = new Set();
      this.channels.set(channel, subscriptions);
    }
    subscriptions.add({ client, listener });
    return subscriptions.size;
  }

  unsubscribe(
    client: FakeRedisClient,
    channel: string,
    listener: RedisListener,
  ): void {
    const subscriptions = this.channels.get(channel);
    if (!subscriptions) return;

    for (const subscription of subscriptions) {
      if (
        subscription.client === client &&
        subscription.listener === listener
      ) {
        subscriptions.delete(subscription);
      }
    }
    if (subscriptions.size === 0) this.channels.delete(channel);
  }

  removeClient(client: FakeRedisClient): void {
    for (const [channel, subscriptions] of this.channels) {
      for (const subscription of subscriptions) {
        if (subscription.client === client) subscriptions.delete(subscription);
      }
      if (subscriptions.size === 0) this.channels.delete(channel);
    }
  }

  async publish(channel: string, message: string): Promise<number> {
    const subscriptions = [...(this.channels.get(channel) ?? [])];
    for (const { listener } of subscriptions) listener(message, channel);
    return subscriptions.length;
  }

  listenerCount(channel: string): number {
    return this.channels.get(channel)?.size ?? 0;
  }
}

class FakeRedisClient implements RedisPubSubClient {
  connected = false;
  onconnect: (() => void) | null = null;
  onclose: ((error: Error) => void) | null = null;
  connectCalls = 0;
  failConnect = false;
  failNextSubscribe = false;
  readonly failSubscribeChannels = new Set<string>();
  beforeUnsubscribe: (() => Promise<void>) | undefined;

  constructor(private readonly hub: FakeRedisHub) {}

  async connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.failConnect) throw new Error("connection failed");
    this.connected = true;
    this.onconnect?.();
  }

  close(): void {
    this.connected = false;
    this.hub.removeClient(this);
  }

  disconnect(error = new Error("connection lost")): void {
    this.connected = false;
    this.hub.removeClient(this);
    this.onclose?.(error);
  }

  async ping(): Promise<"PONG"> {
    if (!this.connected) throw new Error("not connected");
    return "PONG";
  }

  async publish(channel: string, message: string): Promise<number> {
    if (!this.connected) throw new Error("not connected");
    return this.hub.publish(channel, message);
  }

  async subscribe(channel: string, listener: RedisListener): Promise<void> {
    if (!this.connected) throw new Error("not connected");
    if (this.failNextSubscribe || this.failSubscribeChannels.has(channel)) {
      this.failNextSubscribe = false;
      throw new Error("subscription failed");
    }
    this.hub.subscribe(this, channel, listener);
  }

  async unsubscribe(channel: string, listener: RedisListener): Promise<void> {
    await this.beforeUnsubscribe?.();
    this.hub.unsubscribe(this, channel, listener);
  }
}

const notification = (
  overrides: Partial<NotificationData> = {},
): NotificationData => ({
  dbId: "db-1",
  dbType: "space",
  timestamp: 1,
  ...overrides,
});

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

describe("InMemorySyncNotificationBus", () => {
  test("isolates databases and stops delivery after unsubscribe", async () => {
    const bus = new InMemorySyncNotificationBus();
    await bus.start();

    const received: NotificationData[] = [];
    const unsubscribe = await bus.subscribe("db-1", "space", (data) =>
      received.push(data),
    );

    await bus.publish(notification());
    await bus.publish(notification({ dbId: "db-2" }));
    await unsubscribe();
    await bus.publish(notification({ timestamp: 2 }));

    expect(received).toEqual([notification()]);
    await bus.close();
  });
});

describe("SubscriptionManager", () => {
  test("starts and uses the backend supplied to its constructor", async () => {
    const calls: string[] = [];
    const backend: SyncNotificationBus = {
      name: "memory",
      async start() {
        calls.push("start");
      },
      async subscribe() {
        calls.push("subscribe");
        return async () => {};
      },
      async publish() {
        calls.push("publish");
      },
      async close() {
        calls.push("close");
      },
    };
    const manager = new SubscriptionManager(backend);

    await manager.initialize();
    await manager.subscribe("db-1", "space", () => {});
    await manager.notifyChangesAvailable("db-1", "space");
    await manager.close();

    expect(calls).toEqual(["start", "subscribe", "publish", "close"]);
  });
});

describe("RedisSyncNotificationBus", () => {
  test("starts only once when called concurrently", async () => {
    const hub = new FakeRedisHub();
    const bus = new RedisSyncNotificationBus({
      url: "redis://test",
      channelPrefix: "test",
      createClient: hub.createClient,
      logger: silentLogger,
    });

    await Promise.all([bus.start(), bus.start()]);

    expect(hub.clients.map((client) => client.connectCalls)).toEqual([1, 1]);
    await bus.close();
  });

  test("delivers notifications between instances on database-specific channels", async () => {
    const hub = new FakeRedisHub();
    const createBus = () =>
      new RedisSyncNotificationBus({
        url: "redis://test",
        channelPrefix: "test:sync:v1",
        createClient: hub.createClient,
        logger: silentLogger,
      });
    const busA = createBus();
    const busB = createBus();
    await Promise.all([busA.start(), busB.start()]);

    const receivedA: NotificationData[] = [];
    const receivedB: NotificationData[] = [];
    const unsubscribeA = await busA.subscribe("db-1", "space", (data) =>
      receivedA.push(data),
    );
    const unsubscribeB = await busB.subscribe("db-1", "space", (data) =>
      receivedB.push(data),
    );

    await busA.publish(notification());
    await busA.publish(notification({ dbId: "db-2" }));

    expect(receivedA).toEqual([notification()]);
    expect(receivedB).toEqual([notification()]);

    await Promise.all([unsubscribeA(), unsubscribeB()]);
    expect(hub.listenerCount("test:sync:v1:space:db-1")).toBe(0);
    await Promise.all([busA.close(), busB.close()]);
  });

  test("shares one Redis subscription between local listeners", async () => {
    const hub = new FakeRedisHub();
    const bus = new RedisSyncNotificationBus({
      url: "redis://test",
      channelPrefix: "test",
      createClient: hub.createClient,
      logger: silentLogger,
    });
    await bus.start();

    const unsubscribeA = await bus.subscribe("db-1", "user", () => {});
    const unsubscribeB = await bus.subscribe("db-1", "user", () => {});
    expect(hub.listenerCount("test:user:db-1")).toBe(1);

    await unsubscribeA();
    expect(hub.listenerCount("test:user:db-1")).toBe(1);
    await unsubscribeB();
    expect(hub.listenerCount("test:user:db-1")).toBe(0);
    await bus.close();
  });

  test("keeps a replacement subscription when final unsubscribe is still pending", async () => {
    const hub = new FakeRedisHub();
    const bus = new RedisSyncNotificationBus({
      url: "redis://test",
      channelPrefix: "test",
      createClient: hub.createClient,
      logger: silentLogger,
    });
    await bus.start();

    const firstUnsubscribe = await bus.subscribe("db-1", "space", () => {});
    const subscriber = hub.clients[1]!;
    let releaseUnsubscribe = () => {};
    const unsubscribeGate = new Promise<void>((resolve) => {
      releaseUnsubscribe = resolve;
    });
    subscriber.beforeUnsubscribe = () => unsubscribeGate;

    const teardownPromise = firstUnsubscribe();
    const received: NotificationData[] = [];
    const replacementPromise = bus.subscribe("db-1", "space", (data) =>
      received.push(data),
    );
    releaseUnsubscribe();

    await teardownPromise;
    const replacementUnsubscribe = await replacementPromise;
    expect(hub.listenerCount("test:space:db-1")).toBe(1);

    await bus.publish(notification());
    expect(received).toEqual([notification()]);

    subscriber.beforeUnsubscribe = undefined;
    await replacementUnsubscribe();
    await bus.close();
  });

  test("waits for accepted subscription work before closing", async () => {
    const hub = new FakeRedisHub();
    const bus = new RedisSyncNotificationBus({
      url: "redis://test",
      channelPrefix: "test",
      createClient: hub.createClient,
      logger: silentLogger,
    });
    await bus.start();

    const unsubscribe = await bus.subscribe("db-1", "space", () => {});
    const subscriber = hub.clients[1]!;
    let releaseUnsubscribe = () => {};
    const unsubscribeGate = new Promise<void>((resolve) => {
      releaseUnsubscribe = resolve;
    });
    subscriber.beforeUnsubscribe = () => unsubscribeGate;

    const unsubscribePromise = unsubscribe();
    const closePromise = bus.close();
    let closed = false;
    void closePromise.then(() => {
      closed = true;
    });
    await Promise.resolve();

    expect(closed).toBe(false);
    releaseUnsubscribe();
    await Promise.all([unsubscribePromise, closePromise]);
    expect(hub.clients.every((client) => !client.connected)).toBe(true);
  });

  test("continues processing after a Redis subscription fails", async () => {
    const hub = new FakeRedisHub();
    const bus = new RedisSyncNotificationBus({
      url: "redis://test",
      channelPrefix: "test",
      createClient: hub.createClient,
      logger: silentLogger,
    });
    await bus.start();

    const subscriber = hub.clients[1]!;
    subscriber.failNextSubscribe = true;
    // Bun's matcher is thenable at runtime, despite its current type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(bus.subscribe("db-1", "space", () => {})).rejects.toThrow(
      "subscription failed",
    );

    const received: NotificationData[] = [];
    const unsubscribe = await bus.subscribe("db-1", "space", (data) =>
      received.push(data),
    );
    await bus.publish(notification());

    expect(received).toEqual([notification()]);
    await unsubscribe();
    await bus.close();
  });

  test("isolates Redis subscriber callback failures", async () => {
    const errors: string[] = [];
    const hub = new FakeRedisHub();
    const bus = new RedisSyncNotificationBus({
      url: "redis://test",
      channelPrefix: "test",
      createClient: hub.createClient,
      logger: {
        info() {},
        warn() {},
        error(message) {
          errors.push(String(message));
        },
      },
    });
    await bus.start();

    await bus.subscribe("db-1", "space", () => {
      throw new Error("callback failed");
    });
    const received: NotificationData[] = [];
    await bus.subscribe("db-1", "space", (data) => received.push(data));

    await bus.publish(notification());
    expect(received).toEqual([notification()]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("callback failed");
    await bus.close();
  });

  test("restores active subscriptions after reconnecting", async () => {
    const hub = new FakeRedisHub();
    const bus = new RedisSyncNotificationBus({
      url: "redis://test",
      channelPrefix: "test",
      createClient: hub.createClient,
      logger: silentLogger,
    });
    await bus.start();

    const received: NotificationData[] = [];
    await bus.subscribe("db-1", "space", (data) => received.push(data));

    const subscriber = hub.clients[1]!;
    subscriber.disconnect();
    await subscriber.connect();
    await bus.publish(notification());

    expect(received).toEqual([notification()]);
    await bus.close();
  });

  test("settles every restoration and drops channels that fail to restore", async () => {
    const hub = new FakeRedisHub();
    const bus = new RedisSyncNotificationBus({
      url: "redis://test",
      channelPrefix: "test",
      createClient: hub.createClient,
      logger: silentLogger,
    });
    await bus.start();

    const received: NotificationData[] = [];
    await bus.subscribe("db-1", "space", (data) => received.push(data));
    await bus.subscribe("db-2", "space", (data) => received.push(data));

    const subscriber = hub.clients[1]!;
    subscriber.disconnect();
    subscriber.failSubscribeChannels.add("test:space:db-1");
    await subscriber.connect();
    await bus.publish(notification({ dbId: "db-2" }));

    expect(received).toEqual([notification({ dbId: "db-2" })]);
    expect(hub.listenerCount("test:space:db-2")).toBe(1);

    subscriber.failSubscribeChannels.clear();
    const replacementReceived: NotificationData[] = [];
    const unsubscribe = await bus.subscribe("db-1", "space", (data) =>
      replacementReceived.push(data),
    );
    await bus.publish(notification());

    expect(replacementReceived).toEqual([notification()]);
    await unsubscribe();
    await bus.close();
  });

  test("ignores malformed or mismatched Redis messages", async () => {
    const warnings: string[] = [];
    const hub = new FakeRedisHub();
    const bus = new RedisSyncNotificationBus({
      url: "redis://test",
      channelPrefix: "test",
      createClient: hub.createClient,
      logger: {
        info() {},
        error() {},
        warn(message) {
          warnings.push(String(message));
        },
      },
    });
    await bus.start();

    const received: NotificationData[] = [];
    await bus.subscribe("db-1", "space", (data) => received.push(data));
    await hub.publish("test:space:db-1", "not-json");
    await hub.publish(
      "test:space:db-1",
      JSON.stringify(notification({ dbId: "db-2" })),
    );

    expect(received).toEqual([]);
    expect(warnings).toHaveLength(2);
    await bus.close();
  });

  test("fails startup when Redis cannot connect", async () => {
    const hub = new FakeRedisHub();
    const bus = new RedisSyncNotificationBus({
      url: "redis://test",
      channelPrefix: "test",
      createClient: () => {
        const client = hub.createClient() as FakeRedisClient;
        client.failConnect = true;
        return client;
      },
      logger: silentLogger,
    });

    expect(bus.start()).rejects.toThrow(
      "Failed to connect Redis sync notification backend",
    );
  });
});
