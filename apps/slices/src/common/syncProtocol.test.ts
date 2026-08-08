import { describe, expect, it } from "vitest";
import {
  isSupportedSyncVersion,
  SYNC_VERSION_UNSUPPORTED,
  UnsupportedSyncVersionError,
} from "./syncProtocol";

describe("sync protocol version", () => {
  it("accepts only version 3", () => {
    expect(isSupportedSyncVersion(3)).toBe(true);
    expect(isSupportedSyncVersion(undefined)).toBe(false);
    expect(isSupportedSyncVersion(0)).toBe(false);
    expect(isSupportedSyncVersion(1)).toBe(false);
    expect(isSupportedSyncVersion(2)).toBe(false);
  });

  it("provides machine-readable compatibility data", () => {
    const error = new UnsupportedSyncVersionError(null);
    expect(error.data).toEqual({
      code: SYNC_VERSION_UNSUPPORTED,
      received: null,
      minimum: 3,
      maximum: 3,
    });
  });
});
