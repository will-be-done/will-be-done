import type { DBDriver, SubscribableDB } from "@will-be-done/hyperdb";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SyncChannel<T = unknown> {
  onmessage: ((message: T) => void) | null;
  postMessage(message: T): Promise<void> | void;
  close(): Promise<void> | void;
}

export interface SyncLeaderElector {
  readonly isLeader: boolean;
  onduplicate: (() => void) | null;
  awaitLeadership(): Promise<void>;
}

// Several app instances (browser tabs) may share one local replica. They elect
// one leader to talk to the server and fan local changes out to each other.
export interface SyncCoordination {
  createChannel<T>(name: string): SyncChannel<T>;
  createLeaderElection(channel: SyncChannel): SyncLeaderElector;
}

export type ChangesAvailableInput = {
  dbId: string;
  dbType: "user" | "space";
  syncVersion: number;
};

export interface ClientPlatform {
  // Prefix for sync HTTP requests. Empty string means same origin.
  apiUrl: string;
  getToken(): string | null;
  storage: KeyValueStorage;
  persistentStorage: {
    // Identifies the storage backend that holds dbName. A different kind is a
    // different local replica with its own client id.
    resolveKind(dbName: string): Promise<string>;
    openDriver(dbName: string): Promise<DBDriver>;
  };
  subscribeChangesAvailable(
    input: ChangesAvailableInput,
    handlers: { onData: () => void; onError: (error: unknown) => void },
  ): { unsubscribe(): void };
  coordination: SyncCoordination;
  lifecycle: {
    // App became visible, focused, or regained network.
    onWake(callback: () => void): void;
    // App is about to be hidden, suspended, or unloaded.
    onHide(callback: () => void): void;
  };
  isDebugEnabled(): boolean;
  startAutoBackup?(dbName: string, db: SubscribableDB): void;
}

// Coordination for a single app instance: always the leader, nothing to fan out.
export const singleInstanceCoordination: SyncCoordination = {
  createChannel: <T>() => {
    const channel: SyncChannel<T> = {
      onmessage: null,
      postMessage: () => {},
      close: () => {},
    };
    return channel;
  },
  createLeaderElection: () => ({
    isLeader: true,
    onduplicate: null,
    awaitLeadership: () => Promise.resolve(),
  }),
};
