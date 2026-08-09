const DEFAULT_SYNC_REQUEST_TIMEOUT_MS = 5 * 60_000;

class SyncRequestTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "SyncRequestTimeoutError";
  }
}

export const withSyncRequestTimeout = async <T>(
  label: string,
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs = DEFAULT_SYNC_REQUEST_TIMEOUT_MS,
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort(new SyncRequestTimeoutError(label, timeoutMs));
  }, timeoutMs);

  try {
    return await run(controller.signal);
  } catch (error) {
    if (
      controller.signal.aborted &&
      controller.signal.reason instanceof SyncRequestTimeoutError
    ) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};
