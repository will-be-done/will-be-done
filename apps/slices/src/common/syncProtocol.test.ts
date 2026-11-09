import { describe, expect, it } from "vitest";
import {
  isSupportedSyncVersion,
  SYNC_VERSION_UNSUPPORTED,
  UnsupportedSyncVersionError,
} from "./syncProtocol";

describe("sync protocol version", () => {
  it("accepts only version 7", () => {
    expect(isSupportedSyncVersion(7)).toBe(true);
    expect(isSupportedSyncVersion(6)).toBe(false);
    expect(isSupportedSyncVersion(5)).toBe(false);
    expect(isSupportedSyncVersion(4)).toBe(false);
    expect(isSupportedSyncVersion(undefined)).toBe(false);
    expect(isSupportedSyncVersion(0)).toBe(false);
    expect(isSupportedSyncVersion(1)).toBe(false);
    expect(isSupportedSyncVersion(2)).toBe(false);
    expect(isSupportedSyncVersion(3)).toBe(false);
  });

  it("provides machine-readable compatibility data", () => {
    const error = new UnsupportedSyncVersionError(null);
    expect(error.data).toEqual({
      code: SYNC_VERSION_UNSUPPORTED,
      received: null,
      minimum: 7,
      maximum: 7,
    });
  });
});
