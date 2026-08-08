export const CURRENT_SYNC_VERSION = 3;
export const MIN_SUPPORTED_SYNC_VERSION = 3;
export const MAX_SUPPORTED_SYNC_VERSION = 3;

export const SYNC_VERSION_UNSUPPORTED = "SYNC_VERSION_UNSUPPORTED";

export type UnsupportedSyncVersionData = {
  code: typeof SYNC_VERSION_UNSUPPORTED;
  received: number | null;
  minimum: number;
  maximum: number;
};

export class UnsupportedSyncVersionError extends Error {
  readonly data: UnsupportedSyncVersionData;

  constructor(received: number | null) {
    super(
      "This app version can no longer sync. Update Will Be Done to continue.",
    );
    this.name = "UnsupportedSyncVersionError";
    this.data = {
      code: SYNC_VERSION_UNSUPPORTED,
      received,
      minimum: MIN_SUPPORTED_SYNC_VERSION,
      maximum: MAX_SUPPORTED_SYNC_VERSION,
    };
  }
}

export function isSupportedSyncVersion(version: number | undefined): boolean {
  return (
    version !== undefined &&
    Number.isInteger(version) &&
    version >= MIN_SUPPORTED_SYNC_VERSION &&
    version <= MAX_SUPPORTED_SYNC_VERSION
  );
}
