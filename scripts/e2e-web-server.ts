import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "3200";
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "5174";
const e2eDbPath =
  process.env.WBD_E2E_DB_PATH ?? path.join(repoRoot, "db", "e2e");

fs.mkdirSync(e2eDbPath, { recursive: true });

const children = new Set<ChildProcess>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function spawnService(
  name: string,
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
) {
  const env = {
    ...process.env,
    ...options.env,
  };
  delete env.FORCE_COLOR;

  const child = spawn(command, args, {
    cwd: options.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.add(child);

  child.stdout?.on("data", (data: Buffer) => {
    process.stdout.write(`[${name}] ${data.toString()}`);
  });

  child.stderr?.on("data", (data: Buffer) => {
    process.stderr.write(`[${name}] ${data.toString()}`);
  });

  child.on("exit", (code, signal) => {
    children.delete(child);

    if (shuttingDown) {
      return;
    }

    console.error(
      `[${name}] exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
    );
    shutdown(1);
  });

  return child;
}

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    child.kill();
  }

  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function waitForReady(name: string, url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the service accepts connections.
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${name} at ${url}`);
}

async function main() {
  console.log(`Starting API on http://127.0.0.1:${apiPort}`);
  console.log(`Using E2E DB path: ${e2eDbPath}`);

  spawnService("api", "bun", ["run", "src/start.ts"], {
    cwd: path.join(repoRoot, "apps", "api"),
    env: {
      PORT: apiPort,
      WBD_DB_PATH: e2eDbPath,
      WBD_CF_CAPTCHA_ENABLED: "false",
      WBD_BACKUP_S3_ENABLED: "false",
      WBD_RATE_LIMIT_ENABLED: "false",
    },
  });

  try {
    await waitForReady(
      "api",
      `http://127.0.0.1:${apiPort}/api/health`,
      120_000,
    );
  } catch (error) {
    console.error(error);
    shutdown(1);
    await sleep(300);
    process.exit(1);
  }

  console.log(`Starting web on http://127.0.0.1:${webPort}`);

  spawnService(
    "web",
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", webPort, "--strictPort"],
    {
      cwd: path.join(repoRoot, "apps", "web"),
      env: {
        VITE_API_PORT: apiPort,
      },
    },
  );
}

void main();
