import { expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as env from "./env";
import { startTestServer, stopTestServer } from "./e2e/harness";

const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "wbd-harness-"));
  const config = spyOn(env, "getEnvConfig").mockReturnValue({
    ...env.getEnvConfig(),
    WBD_DB_PATH: directory,
    WBD_DB_ENGINE: "sqlite",
    WBD_SYNC_NOTIFICATIONS_BACKEND: "memory",
    WBD_RATE_LIMIT_ENABLED: false,
  });
  const close = spyOn(Database.prototype, "close");
  const previousBaseUrl = process.env.WBD_API_BASE_URL;
  return {
    close,
    async cleanup() {
      await stopTestServer();
      close.mockRestore();
      config.mockRestore();
      if (previousBaseUrl === undefined) delete process.env.WBD_API_BASE_URL;
      else process.env.WBD_API_BASE_URL = previousBaseUrl;
      rmSync(directory, { recursive: true, force: true });
    },
  };
};

test("test server startup failure releases its database scope", async () => {
  const { close, cleanup } = fixture();
  const failure = new Error("listen failed");
  const listen = spyOn(Server.prototype, "listen").mockImplementation(() => {
    throw failure;
  });
  try {
    expect(startTestServer()).rejects.toBe(failure);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    listen.mockRestore();
    await cleanup();
  }
});

test("test server shutdown failure still releases its database scope", async () => {
  const { close, cleanup } = fixture();
  const failure = new Error("shutdown failed");
  const server = await startTestServer();
  const closeServer = spyOn(server, "close").mockImplementationOnce(() => {
    throw failure;
  });
  try {
    expect(stopTestServer()).rejects.toBe(failure);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    closeServer.mockRestore();
    await server.close();
    await cleanup();
  }
});
