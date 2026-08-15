import { describe, expect, it } from "vitest";
import {
  isUnsupportedSyncVersionError,
  syncChannelName,
} from "./syncCompatibility";

describe("sync compatibility client helpers", () => {
  it("recognizes version errors from queries and subscriptions", () => {
    const syncVersion = { code: "SYNC_VERSION_UNSUPPORTED" };
    expect(isUnsupportedSyncVersionError({ data: { syncVersion } })).toBe(true);
    expect(
      isUnsupportedSyncVersionError({ shape: { data: { syncVersion } } }),
    ).toBe(true);
    expect(isUnsupportedSyncVersionError(new Error("offline"))).toBe(false);
  });

  it("includes the current version in cross-tab channels", () => {
    expect(syncChannelName("changes", "client")).toBe("changes-v4-client");
    expect(syncChannelName("election", "client")).toBe("election-v4-client");
  });
});
