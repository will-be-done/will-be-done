import { z } from "zod";
import { compareHlc, type HlcTimestamp } from "./hlc";
import { Changeset } from "./changes";

export const SYNC_V4_MAX_CHUNK_CHANGES = 256;
export const SYNC_V4_MAX_CHUNK_BYTES = 1024 * 1024;
export const SYNC_V4_MAX_SESSION_BYTES = 256 * 1024 * 1024;
export const SYNC_V4_MAX_SESSION_CHUNKS = 4096;
export const SYNC_V4_INLINE_DOWNLOAD_CHANGES = 256;
export const SYNC_V4_INLINE_DOWNLOAD_BYTES = 1024 * 1024;
export const SYNC_V4_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export const ClientCursorSchema = z.object({
  clock: z.string(),
  changeId: z.string(),
});
export type ClientCursor = z.infer<typeof ClientCursorSchema>;

export const nullableClientCursorSchema = ClientCursorSchema.nullable();

export const compareClientCursor = (
  left: ClientCursor | null,
  right: ClientCursor | null,
): number => {
  if (left === null) return right === null ? 0 : -1;
  if (right === null) return 1;
  const clockOrder = compareHlc(left.clock, right.clock);
  return clockOrder || left.changeId.localeCompare(right.changeId);
};

export const maxClientCursor = (
  cursors: Iterable<ClientCursor | null | undefined>,
): ClientCursor | null => {
  let result: ClientCursor | null = null;
  for (const cursor of cursors) {
    if (cursor && compareClientCursor(cursor, result) > 0) result = cursor;
  }
  return result;
};

export const SyncSessionRequestSchema = z.object({
  syncVersion: z.literal(4),
  dbId: z.string(),
  dbType: z.union([z.literal("user"), z.literal("space")]),
  clientId: z.string(),
  expectedAcceptedClientCursor: nullableClientCursorSchema,
  coveredClientCursor: nullableClientCursorSchema,
  expectedAcknowledgedServerRevision: z.number().int().nonnegative(),
  appliedServerRevision: z.number().int().nonnegative(),
});
export type SyncSessionRequest = z.infer<typeof SyncSessionRequestSchema>;

export const SyncUploadChunkSchema = z.object({
  checksum: z.string(),
  payload: z.string(),
});
export type SyncUploadChunk = z.infer<typeof SyncUploadChunkSchema>;

export const SyncCommitRequestSchema = z.object({
  chunkCount: z.number().int().nonnegative(),
  changeCount: z.number().int().nonnegative(),
  throughCursor: nullableClientCursorSchema,
  checksum: z.string(),
});
export type SyncCommitRequest = z.infer<typeof SyncCommitRequestSchema>;

export type SyncSessionResponse = {
  uploadId: string;
  uploadFromCursor: ClientCursor | null;
  downloadFromRevision: number;
  serverHistoryLost: boolean;
  serverAhead: boolean;
  expiresAt: number;
  limits: {
    maxChunkChanges: number;
    maxChunkBytes: number;
  };
};

export type InlineSyncDownload = {
  type: "inline";
  changesets: z.infer<typeof Changeset>[];
};

export type StagedSyncDownload = {
  type: "staged";
  downloadId: string;
  chunkCount: number;
  changeCount: number;
  checksum: string;
};

export type SyncCommitResponse = {
  acceptedClientCursor: ClientCursor | null;
  serverRevision: number;
  download: InlineSyncDownload | StagedSyncDownload;
};

export const clientCursorFromChange = (change: {
  id: string;
  updatedAt: HlcTimestamp;
}): ClientCursor => ({ clock: change.updatedAt, changeId: change.id });
