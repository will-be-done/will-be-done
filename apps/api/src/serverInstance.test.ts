import { describe, expect, test } from "bun:test";
import {
  createServerClientId,
  resolveServerInstanceId,
} from "./serverInstance";

describe("server instance identity", () => {
  test("prefers an explicit instance id over Fly's machine id", () => {
    expect(
      resolveServerInstanceId({
        WBD_INSTANCE_ID: "self-hosted-2",
        FLY_MACHINE_ID: "fly-machine",
      }),
    ).toBe("self-hosted-2");
  });

  test("uses Fly's machine id when no override is configured", () => {
    expect(resolveServerInstanceId({ FLY_MACHINE_ID: "fly-machine" })).toBe(
      "fly-machine",
    );
  });

  test("generates a process-local identity outside a clustered environment", () => {
    expect(resolveServerInstanceId({}, () => "generated-id")).toBe(
      "local-generated-id",
    );
  });

  test("includes the instance identity in database sync client ids", () => {
    expect(createServerClientId("space-space-1", "machine-a")).toBe(
      "server-machine-a-space-space-1",
    );
    expect(createServerClientId("space-space-1", "machine-b")).not.toBe(
      createServerClientId("space-space-1", "machine-a"),
    );
  });
});
