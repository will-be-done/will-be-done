import { EventEmitter } from "events";

type DbKey = `${string}:${"user" | "space"}`;

export type NotificationData = {
  dbId: string;
  dbType: string;
  timestamp: number;
};

function createDbKey(dbId: string, dbType: "user" | "space"): DbKey {
  return `${dbId}:${dbType}`;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(100000);

export const subscriptionManager = {
  /**
   * Subscribe to change notifications for a specific db
   */
  subscribe(
    dbId: string,
    dbType: "user" | "space",
    callback: (data: NotificationData) => void,
  ): () => void {
    const key = createDbKey(dbId, dbType);
    emitter.on(key, callback);
    return () => emitter.off(key, callback);
  },

  /**
   * Notify all subscribers that changes are available for a specific db
   */
  notifyChangesAvailable(dbId: string, dbType: "user" | "space"): void {
    const key = createDbKey(dbId, dbType);
    emitter.emit(key, { dbId, dbType, timestamp: Date.now() });
  },
};
