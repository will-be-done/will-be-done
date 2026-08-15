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
