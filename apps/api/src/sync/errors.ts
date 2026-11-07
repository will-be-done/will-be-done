import { Schema } from "effect";
import {
  parseHlc,
  SYNC_CLIENT_CURSOR_ADVANCED,
  SYNC_V4_MAX_FUTURE_SKEW_MS,
} from "@will-be-done/slices/common";

export class SyncSessionNotFoundError extends Schema.TaggedError<SyncSessionNotFoundError>()(
  "SyncSessionNotFoundError",
  { message: Schema.String },
) {}

export class SyncInvalidRequestError extends Schema.TaggedError<SyncInvalidRequestError>()(
  "SyncInvalidRequestError",
  { message: Schema.String },
) {}

export class SyncConflictError extends Schema.TaggedError<SyncConflictError>()(
  "SyncConflictError",
  { message: Schema.String },
) {}

export class SyncClientCursorAdvancedError extends Schema.TaggedError<SyncClientCursorAdvancedError>()(
  "SyncClientCursorAdvancedError",
  { message: Schema.String },
) {
  readonly code = SYNC_CLIENT_CURSOR_ADVANCED;
}

export const SYNC_CLOCK_SKEW = "SYNC_CLOCK_SKEW";

export class SyncClockSkewError extends Schema.TaggedError<SyncClockSkewError>()(
  "SyncClockSkewError",
  {
    observedClock: Schema.String,
    serverTimeMs: Schema.Number,
    maxFutureSkewMs: Schema.Number,
  },
) {
  readonly code = SYNC_CLOCK_SKEW;

  override get message() {
    return "A sync change timestamp is too far ahead of server time";
  }
}

export type SyncError =
  | SyncSessionNotFoundError
  | SyncInvalidRequestError
  | SyncConflictError
  | SyncClientCursorAdvancedError
  | SyncClockSkewError;

const syncErrorClasses = [
  SyncSessionNotFoundError,
  SyncInvalidRequestError,
  SyncConflictError,
  SyncClientCursorAdvancedError,
  SyncClockSkewError,
];

export const isSyncError = (error: unknown): error is SyncError =>
  syncErrorClasses.some((errorClass) => error instanceof errorClass);

export const syncClockSkew = (
  clock: string | null | undefined,
  serverTimeMs: number,
  maxFutureSkewMs = SYNC_V4_MAX_FUTURE_SKEW_MS,
) =>
  clock && parseHlc(clock).physical > serverTimeMs + maxFutureSkewMs
    ? new SyncClockSkewError({
        observedClock: clock,
        serverTimeMs,
        maxFutureSkewMs,
      })
    : undefined;

// Sync actions run inside HyperDB transactions and throw to roll back.
export const assertSyncClockWithinFutureSkew = (
  clock: string | null | undefined,
  serverTimeMs: number,
) => {
  const error = syncClockSkew(clock, serverTimeMs);
  if (error) throw error;
};
