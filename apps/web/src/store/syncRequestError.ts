import { SYNC_CLIENT_CURSOR_ADVANCED } from "@will-be-done/slices/common";

export class SyncRequestError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(`Sync request failed (${status}): ${responseBody}`);
    this.name = "SyncRequestError";
  }
}

export const shouldRestartExpiredUpload = (
  resumingUpload: boolean,
  error: unknown,
) =>
  resumingUpload && error instanceof SyncRequestError && error.status === 404;

const responseCode = (error: SyncRequestError) => {
  try {
    const body = JSON.parse(error.responseBody) as { code?: unknown };
    return typeof body.code === "string" ? body.code : undefined;
  } catch {
    return undefined;
  }
};

export const shouldRestartFrozenUpload = (
  resumingUpload: boolean,
  error: unknown,
) =>
  shouldRestartExpiredUpload(resumingUpload, error) ||
  (error instanceof SyncRequestError &&
    error.status === 409 &&
    responseCode(error) === SYNC_CLIENT_CURSOR_ADVANCED);
