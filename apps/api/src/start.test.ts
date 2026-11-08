import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dbDirs: string[] = [];

afterEach(() => {
  for (const dir of dbDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const startApi = (port: number) => {
  const dbDir = mkdtempSync(join(tmpdir(), "wbd-start-test-"));
  dbDirs.push(dbDir);
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    WBD_DB_ENGINE: "sqlite",
    WBD_DB_PATH: dbDir,
    WBD_RATE_LIMIT_ENABLED: "false",
    WBD_BACKUP_S3_ENABLED: "false",
    PORT: String(port),
  };
  const api = Bun.spawn(["bun", join(import.meta.dir, "start.ts")], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  let output = "";
  let markStarted!: () => void;
  const startedOutput = new Promise<void>((resolve) => (markStarted = resolve));
  const decoder = new TextDecoder();
  const read = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream) {
      output += decoder.decode(chunk);
      if (output.includes("Server started")) markStarted();
    }
  };
  const drained = Promise.all([read(api.stdout), read(api.stderr)]);
  return {
    api,
    output: () => output,
    exited: async () => {
      const code = await api.exited;
      await drained;
      return code;
    },
    started: () =>
      Promise.race([
        startedOutput,
        api.exited.then((code) => {
          throw new Error(
            `API exited with ${code} before starting:\n${output}`,
          );
        }),
      ]),
  };
};

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        resolve(typeof address === "object" && address ? address.port : 0),
      );
    });
  });

describe("API process", () => {
  it.each(["SIGTERM", "SIGINT", "SIGQUIT"] as const)(
    "serves requests, then shuts down cleanly on %s",
    async (signal) => {
      const port = await freePort();
      const run = startApi(port);
      await run.started();
      const health = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(await health.json()).toEqual({ ok: true });

      run.api.kill(signal);
      expect(await run.exited()).toBe(0);
      expect(run.output()).toContain("Shutting down gracefully...");
      const afterShutdown = await fetch(
        `http://127.0.0.1:${port}/api/health`,
      ).then(
        () => "open",
        () => "closed",
      );
      expect(afterShutdown).toBe("closed");
    },
  );

  it("exits with a failure when the server cannot start", async () => {
    const port = await freePort();
    const holder = Bun.serve({
      port,
      hostname: "0.0.0.0",
      fetch: () => new Response(),
    });
    try {
      const run = startApi(port);
      expect(await run.exited()).toBe(1);
      expect(run.output()).toContain(`Is port ${port} in use?`);
      expect(run.output()).not.toContain("Server started");
    } finally {
      await holder.stop(true);
    }
  });
});
