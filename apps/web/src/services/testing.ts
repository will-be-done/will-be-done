import { Cause, Effect, Layer, Logger, PubSub, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import {
  AuthSession,
  PageEvents,
  ServerChanges,
  TabChannels,
  type PageEventTarget,
  type ServerChangeEvent,
} from "./browser";

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

// The real fetch-based client, sending requests to `respond` instead of the
// network. Relative URLs resolve against http://localhost, as a page would.
export const testHttpClient = (respond: () => Fetch) =>
  Layer.mergeAll(
    Layer.effect(
      HttpClient.HttpClient,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        return HttpClient.mapRequest(client, (request) =>
          request.url.startsWith("/")
            ? HttpClientRequest.prependUrl(request, "http://localhost")
            : request,
        );
      }),
    ).pipe(Layer.provide(FetchHttpClient.layer)),
    Layer.succeed(FetchHttpClient.Fetch, ((input, init) =>
      respond()(String(input), init ?? {})) as typeof fetch),
  );

export const requestText = (init: RequestInit) =>
  new Response(init.body).text();

export const testAuthSession = (id = ":", token: string | null = null) =>
  Layer.succeed(AuthSession, {
    token: Effect.succeed(token),
    id: Effect.succeed(id),
  });

export const makeTestServerChanges = () => {
  const events = Effect.runSync(PubSub.unbounded<ServerChangeEvent>());
  let watches = 0;
  return {
    watches: () => watches,
    layer: Layer.succeed(ServerChanges, {
      watch: () =>
        Stream.fromPubSub(events).pipe(
          Stream.onStart(Effect.sync(() => (watches += 1))),
        ),
    }),
    emit: (event: ServerChangeEvent) => PubSub.publishUnsafe(events, event),
  };
};

export interface TestTabs {
  // Whether the next tab created leads; earlier tabs keep their role.
  nextIsLeader: boolean;
  // Queues "changes-*" messages until releaseChanges().
  holdChanges: boolean;
  readonly held: (() => void)[];
  readonly releaseChanges: () => void;
  readonly openChannels: () => number;
  readonly layer: Layer.Layer<TabChannels>;
}

// Tabs connected through one in-memory bus, delivering synchronously.
export const makeTestTabs = (): TestTabs => {
  type Instance = { name: string; handlers: Set<(message: unknown) => void> };
  const instances = new Set<Instance>();
  const held: (() => void)[] = [];
  const tabs: TestTabs = {
    nextIsLeader: true,
    holdChanges: false,
    held,
    releaseChanges: () => held.splice(0).forEach((deliver) => deliver()),
    openChannels: () => instances.size,
    layer: Layer.succeed(TabChannels, {
      channel: <A>(name: string) =>
        Effect.acquireRelease(
          Effect.sync((): Instance => {
            const instance: Instance = { name, handlers: new Set() };
            instances.add(instance);
            return instance;
          }),
          (instance) => Effect.sync(() => instances.delete(instance)),
        ).pipe(
          Effect.map((self) => ({
            post: (message: A) => {
              for (const other of instances) {
                if (other === self || other.name !== name) continue;
                const deliver = () =>
                  other.handlers.forEach((handler) => handler(message));
                if (tabs.holdChanges && name.startsWith("changes-")) {
                  held.push(deliver);
                } else deliver();
              }
            },
            listen: (handler: (message: A) => void) => {
              const untyped = handler as (message: unknown) => void;
              return Effect.acquireRelease(
                Effect.sync(() => self.handlers.add(untyped)),
                () => Effect.sync(() => self.handlers.delete(untyped)),
              );
            },
          })),
        ),
      leadership: () =>
        Effect.sync(() => {
          const leader: boolean = tabs.nextIsLeader;
          return {
            isLeader: () => leader,
            awaitLeadership: leader ? Effect.void : Effect.never,
            onDuplicate: () => Effect.void,
          };
        }),
    }),
  };
  return tabs;
};

export interface TestPage {
  visibility: DocumentVisibilityState;
  focused: number;
  readonly listeners: () => number;
  readonly dispatch: (target: PageEventTarget, type: string) => void;
  readonly layer: Layer.Layer<PageEvents>;
}

export const makeTestPage = (): TestPage => {
  type Listener = {
    target: PageEventTarget;
    type: string;
    handler: () => void;
  };
  const listeners = new Set<Listener>();
  const page: TestPage = {
    visibility: "visible",
    focused: 0,
    listeners: () => listeners.size,
    dispatch: (target, type) => {
      for (const listener of [...listeners]) {
        if (listener.target === target && listener.type === type) {
          listener.handler();
        }
      }
    },
    layer: Layer.succeed(PageEvents, {
      listen: (target, type, handler) => {
        const listener = { target, type, handler };
        return Effect.acquireRelease(
          Effect.sync(() => listeners.add(listener)),
          () => Effect.sync(() => listeners.delete(listener)),
        );
      },
      visibility: () => page.visibility,
      focusWindow: () => {
        page.focused += 1;
      },
    }),
  };
  return page;
};

export const makeTestLogger = () => {
  const entries: { level: string; message: unknown; failure?: unknown }[] = [];
  return {
    entries,
    errors: () => entries.filter((entry) => entry.level === "Error"),
    layer: Logger.layer([
      Logger.make(({ logLevel, message, cause }) => {
        entries.push({
          level: logLevel,
          message,
          ...(cause.reasons.length > 0 ? { failure: Cause.squash(cause) } : {}),
        });
      }),
    ]),
  };
};
