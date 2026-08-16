import { defineTable, type ExtractSchema, v } from "@will-be-done/hyperdb";

export const serverSyncStateTable = defineTable("server_sync_state_v4", {
  id: v.string(),
  currentRevision: v.number(),
});
export type ServerSyncState = ExtractSchema<typeof serverSyncStateTable>;
export const SERVER_SYNC_STATE_ID = "server-sync-state";

export const serverClientSyncStateTable = defineTable(
  "server_client_sync_state_v4",
  {
    id: v.string(),
    acceptedClientClock: v.union(v.string(), v.null()),
    acceptedClientChangeId: v.union(v.string(), v.null()),
    acknowledgedServerRevision: v.number(),
    lastSeenAt: v.number(),
  },
).index("byLastSeenAtId", ["lastSeenAt", "id"]);
export type ServerClientSyncState = ExtractSchema<
  typeof serverClientSyncStateTable
>;

export const serverChangeFeedTable = defineTable("server_change_feed_v4", {
  id: v.string(),
  revision: v.number(),
  tableName: v.string(),
  entityId: v.string(),
  changeId: v.string(),
}).index("byRevisionId", ["revision", "id"]);
export type ServerChangeFeed = ExtractSchema<typeof serverChangeFeedTable>;

export const syncUploadSessionsTable = defineTable("sync_upload_sessions_v4", {
  id: v.string(),
  userId: v.string(),
  clientId: v.string(),
  baseClientClock: v.union(v.string(), v.null()),
  baseClientChangeId: v.union(v.string(), v.null()),
  downloadFromRevision: v.number(),
  status: v.union(
    v.literal("uploading"),
    v.literal("committed"),
    v.literal("failed"),
  ),
  expiresAt: v.number(),
  uploadedChangeCount: v.number(),
  uploadedByteCount: v.number(),
  maxObservedClock: v.union(v.string(), v.null()),
  maxClientClock: v.union(v.string(), v.null()),
  maxClientChangeId: v.union(v.string(), v.null()),
  resultJson: v.union(v.string(), v.null()),
})
  .index("byExpiresAtId", ["expiresAt", "id"])
  .index("byUserClientStatusExpiresAtId", [
    "userId",
    "clientId",
    "status",
    "expiresAt",
    "id",
  ]);
export type SyncUploadSession = ExtractSchema<typeof syncUploadSessionsTable>;

export const syncUploadItemsTable = defineTable("sync_upload_items_v4", {
  id: v.string(),
  uploadId: v.string(),
  sequence: v.number(),
  tableName: v.string(),
  entityId: v.string(),
  changeId: v.string(),
  payload: v.string(),
  checksum: v.string(),
})
  .index("byUploadSequenceId", ["uploadId", "sequence", "id"])
  .index("byUploadChangeSequence", ["uploadId", "changeId", "sequence"])
  .index("byUploadTableSequence", ["uploadId", "tableName", "sequence"]);

export type SyncUploadItem = ExtractSchema<typeof syncUploadItemsTable>;

export const syncUploadChunksTable = defineTable("sync_upload_chunks_v4", {
  id: v.string(),
  uploadId: v.string(),
  sequence: v.number(),
  checksum: v.string(),
  changeCount: v.number(),
  byteCount: v.number(),
}).index("byUploadSequence", ["uploadId", "sequence"]);
export type SyncUploadChunkRow = ExtractSchema<typeof syncUploadChunksTable>;

export const syncDownloadSessionsTable = defineTable(
  "sync_download_sessions_v4",
  {
    id: v.string(),
    userId: v.string(),
    clientId: v.string(),
    serverRevision: v.number(),
    chunkCount: v.number(),
    changeCount: v.number(),
    checksum: v.string(),
    stagedByteCount: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("available"), v.literal("acknowledged")),
    ),
    expiresAt: v.number(),
  },
).index("byExpiresAtId", ["expiresAt", "id"]);

export const syncDownloadChunksTable = defineTable("sync_download_chunks_v4", {
  id: v.string(),
  downloadId: v.string(),
  sequence: v.number(),
  payload: v.string(),
  checksum: v.string(),
}).index("byDownloadSequence", ["downloadId", "sequence"]);

export const serverSyncTables = [
  serverSyncStateTable,
  serverClientSyncStateTable,
  serverChangeFeedTable,
  syncUploadSessionsTable,
  syncUploadChunksTable,
  syncUploadItemsTable,
  syncDownloadSessionsTable,
  syncDownloadChunksTable,
] as const;
