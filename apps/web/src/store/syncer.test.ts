import { describe, expect, it } from "vitest";
import {
  shouldRestartExpiredUpload,
  SyncRequestError,
} from "./syncRequestError";

describe("sync v4 request recovery", () => {
  it("restarts only a resumed upload that received an actual 404", () => {
    expect(
      shouldRestartExpiredUpload(
        true,
        new SyncRequestError(404, '{"error":"expired"}'),
      ),
    ).toBe(true);
    expect(
      shouldRestartExpiredUpload(
        true,
        new Error("upstream text happened to contain (404)"),
      ),
    ).toBe(false);
    expect(
      shouldRestartExpiredUpload(
        true,
        new SyncRequestError(409, '{"error":"conflict"}'),
      ),
    ).toBe(false);
    expect(
      shouldRestartExpiredUpload(
        false,
        new SyncRequestError(404, '{"error":"expired"}'),
      ),
    ).toBe(false);
  });
});
