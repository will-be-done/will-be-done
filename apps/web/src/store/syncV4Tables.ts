import { defineTable, v } from "@will-be-done/hyperdb";

export const clientSyncUploadSessionsTable = defineTable(
  "client_sync_upload_sessions_v4",
  {
    id: v.string(),
    throughClock: v.union(v.string(), v.null()),
    throughChangeId: v.union(v.string(), v.null()),
    changeCount: v.number(),
    chunkCount: v.number(),
    createdAt: v.number(),
  },
).index("byCreatedAtId", ["createdAt", "id"]);

export const clientSyncUploadChunksTable = defineTable(
  "client_sync_upload_chunks_v4",
  {
    id: v.string(),
    uploadId: v.string(),
    sequence: v.number(),
    payload: v.string(),
  },
).index("byUploadSequence", ["uploadId", "sequence"]);

export const clientSyncDownloadSessionsTable = defineTable(
  "client_sync_download_sessions_v4",
  {
    id: v.string(),
    serverRevision: v.number(),
    acceptedClientClock: v.union(v.string(), v.null()),
    acceptedClientChangeId: v.union(v.string(), v.null()),
    chunkCount: v.number(),
  },
);

export const clientSyncDownloadChunksTable = defineTable(
  "client_sync_download_chunks_v4",
  {
    id: v.string(),
    downloadId: v.string(),
    sequence: v.number(),
    payload: v.string(),
  },
).index("byDownloadSequence", ["downloadId", "sequence"]);

export const clientSyncV4Tables = [
  clientSyncUploadSessionsTable,
  clientSyncUploadChunksTable,
  clientSyncDownloadSessionsTable,
  clientSyncDownloadChunksTable,
] as const;
