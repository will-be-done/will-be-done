import { Context, type Effect, type Scope, type Stream } from "effect";

export class AuthSession extends Context.Service<
  AuthSession,
  {
    readonly token: Effect.Effect<string | null>;
    // Changes whenever the signed-in user or token changes.
    readonly id: Effect.Effect<string>;
  }
>()("@will-be-done/web/AuthSession") {}

export type ServerChangeEvent =
  // The subscription (re)started; changes made before it were not announced.
  | { readonly _tag: "Started" }
  | { readonly _tag: "ChangesAvailable" }
  | { readonly _tag: "UpdateRequired" }
  | { readonly _tag: "Failed"; readonly cause: unknown };

export class ServerChanges extends Context.Service<
  ServerChanges,
  {
    readonly watch: (target: {
      readonly dbId: string;
      readonly dbType: "user" | "space";
    }) => Stream.Stream<ServerChangeEvent>;
  }
>()("@will-be-done/web/ServerChanges") {}

export interface TabChannel<A> {
  readonly post: (message: A) => void;
  readonly listen: (
    handler: (message: A) => void,
  ) => Effect.Effect<void, never, Scope.Scope>;
}

export interface TabLeadership {
  readonly isLeader: () => boolean;
  readonly awaitLeadership: Effect.Effect<void>;
  // Fires when another tab also believes it leads.
  readonly onDuplicate: (
    handler: () => void,
  ) => Effect.Effect<void, never, Scope.Scope>;
}

// Coordinates the tabs of one browser profile.
export class TabChannels extends Context.Service<
  TabChannels,
  {
    readonly channel: <A>(
      name: string,
    ) => Effect.Effect<TabChannel<A>, never, Scope.Scope>;
    readonly leadership: (
      name: string,
    ) => Effect.Effect<TabLeadership, never, Scope.Scope>;
  }
>()("@will-be-done/web/TabChannels") {}

export class BackupDatabase extends Context.Service<
  BackupDatabase,
  IDBFactory
>()("@will-be-done/web/BackupDatabase") {}

export class BrowserCaches extends Context.Service<
  BrowserCaches,
  CacheStorage
>()("@will-be-done/web/BrowserCaches") {}

export type PageEventTarget = "window" | "document";

export class PageEvents extends Context.Service<
  PageEvents,
  {
    readonly listen: (
      target: PageEventTarget,
      type: string,
      handler: () => void,
      options?: AddEventListenerOptions,
    ) => Effect.Effect<void, never, Scope.Scope>;
    readonly visibility: () => DocumentVisibilityState;
    readonly focusWindow: () => void;
  }
>()("@will-be-done/web/PageEvents") {}
