export class SyncSessionNotFoundError extends Error {
  override name = "SyncSessionNotFoundError";
}

export class SyncConflictError extends Error {
  override name = "SyncConflictError";
}
