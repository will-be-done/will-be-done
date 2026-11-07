import { Cause, Data, Match, Option } from "effect";
import { SYNC_CLIENT_CURSOR_ADVANCED } from "@will-be-done/slices/common";

export class SyncHttpError extends Data.TaggedError("SyncHttpError")<{
  readonly status: number;
  readonly body: string;
}> {}

export class SyncNetworkError extends Data.TaggedError("SyncNetworkError")<{
  readonly cause: unknown;
}> {}

export class SyncTimeoutError extends Data.TaggedError("SyncTimeoutError")<{
  readonly request: string;
  readonly timeoutMs: number;
}> {}

export class SyncProtocolError extends Data.TaggedError("SyncProtocolError")<{
  readonly reason: string;
}> {}

export class SyncStorageError extends Data.TaggedError("SyncStorageError")<{
  readonly cause: unknown;
}> {}

export type SyncError =
  | SyncHttpError
  | SyncNetworkError
  | SyncTimeoutError
  | SyncProtocolError
  | SyncStorageError;

const retryMessage = "Sync could not finish. It will retry automatically.";

const syncErrorMessage = Match.type<SyncError>().pipe(
  Match.tagsExhaustive({
    SyncHttpError: ({ status }) =>
      status === 401 || status === 403
        ? "Sign in again to resume syncing."
        : `The server could not complete sync (${status}).`,
    SyncNetworkError: () =>
      "Could not reach the server. Sync will retry automatically.",
    SyncTimeoutError: () => retryMessage,
    SyncProtocolError: () => retryMessage,
    SyncStorageError: () => retryMessage,
  }),
);

export const syncFailureMessage = (cause: Cause.Cause<SyncError>) =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => retryMessage,
    onSome: syncErrorMessage,
  });

const responseCode = (body: string) => {
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return typeof parsed.code === "string" ? parsed.code : undefined;
  } catch {
    return undefined;
  }
};

export const shouldRestartFrozenUpload = (
  resumingUpload: boolean,
  error: SyncError,
) =>
  error._tag === "SyncHttpError" &&
  ((resumingUpload && error.status === 404) ||
    (error.status === 409 &&
      responseCode(error.body) === SYNC_CLIENT_CURSOR_ADVANCED));
