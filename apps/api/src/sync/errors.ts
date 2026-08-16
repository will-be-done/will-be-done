import {
  parseHlc,
  SYNC_CLIENT_CURSOR_ADVANCED,
  SYNC_V4_MAX_FUTURE_SKEW_MS,
} from "@will-be-done/slices/common";

export class SyncSessionNotFoundError extends Error {
  override name = "SyncSessionNotFoundError";
}

export class SyncInvalidRequestError extends Error {
  override name = "SyncInvalidRequestError";
}

export class SyncConflictError extends Error {
  override name = "SyncConflictError";
}

export class SyncClientCursorAdvancedError extends SyncConflictError {
  override name = "SyncClientCursorAdvancedError";
  readonly code = SYNC_CLIENT_CURSOR_ADVANCED;
}

export const SYNC_CLOCK_SKEW = "SYNC_CLOCK_SKEW";

export class SyncClockSkewError extends Error {
  override name = "SyncClockSkewError";
  readonly code = SYNC_CLOCK_SKEW;

  constructor(
    readonly observedClock: string,
    readonly serverTimeMs: number,
    readonly maxFutureSkewMs = SYNC_V4_MAX_FUTURE_SKEW_MS,
  ) {
    super("A sync change timestamp is too far ahead of server time");
  }
}

export const assertSyncClockWithinFutureSkew = (
  clock: string | null | undefined,
  serverTimeMs: number,
  maxFutureSkewMs = SYNC_V4_MAX_FUTURE_SKEW_MS,
) => {
  if (clock && parseHlc(clock).physical > serverTimeMs + maxFutureSkewMs) {
    throw new SyncClockSkewError(clock, serverTimeMs, maxFutureSkewMs);
  }
};
