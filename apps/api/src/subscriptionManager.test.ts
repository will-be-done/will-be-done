import { describe, expect, test } from "bun:test";
import {
  InMemorySyncNotificationBus,
  RedisSyncNotificationBus,
  type NotificationData,
  type RedisPubSubClient,
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
  failConnect = false;

  constructor(private readonly hub: FakeRedisHub) {}

  async connect(): Promise<void> {
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

  async subscribe(channel: string, listener: RedisListener): Promise<number> {
    if (!this.connected) throw new Error("not connected");
    return this.hub.subscribe(this, channel, listener);
  }

  async unsubscribe(channel: string, listener: RedisListener): Promise<void> {
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

describe("RedisSyncNotificationBus", () => {
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
