import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "3200";
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "5174";
const caldavPort = process.env.PLAYWRIGHT_CALDAV_PORT ?? "5233";
// A second API and web pair stores attachments in S3, served by moto.
const s3ApiPort = process.env.PLAYWRIGHT_S3_API_PORT ?? "3201";
const s3WebPort = process.env.PLAYWRIGHT_S3_WEB_PORT ?? "5175";
const s3Port = process.env.PLAYWRIGHT_S3_PORT ?? "5234";
const s3Bucket = "wbd-e2e-attachments";
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

  child.on("error", (error) => {
    console.error(`[${name}] failed to start: ${error.message}`);
    shutdown(1);
  });

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
  // Real CalDAV server for calendar specs. Auth type "none" accepts any
  // username, so each test gets its own Radicale user.
  console.log(`Starting Radicale on http://127.0.0.1:${caldavPort}`);
  spawnService(
    "radicale",
    "radicale",
    [
      "--server-hosts",
      `127.0.0.1:${caldavPort}`,
      "--storage-filesystem-folder",
      path.join(e2eDbPath, "radicale"),
      "--auth-type",
      "none",
      "--logging-level",
      "warning",
    ],
    { cwd: repoRoot },
  );

  console.log(`Starting moto S3 on http://127.0.0.1:${s3Port}`);
  spawnService("moto", "moto_server", ["-H", "127.0.0.1", "-p", s3Port], {
    cwd: repoRoot,
  });

  console.log(`Using E2E DB path: ${e2eDbPath}`);
  startApi("api", apiPort, e2eDbPath, {
    WBD_ATTACHMENTS_PATH: path.join(e2eDbPath, "attachments"),
  });
  startApi("api-s3", s3ApiPort, path.join(e2eDbPath, "s3-api"), {
    WBD_ATTACHMENTS_STORAGE: "s3",
    WBD_ATTACHMENTS_S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
    WBD_ATTACHMENTS_S3_BUCKET_NAME: s3Bucket,
    WBD_ATTACHMENTS_S3_ACCESS_KEY_ID: "e2e",
    WBD_ATTACHMENTS_S3_SECRET_ACCESS_KEY: "e2e-secret",
  });

  try {
    await waitForReady("moto", `http://127.0.0.1:${s3Port}/`, 30_000);
    // moto keeps buckets in memory, so every run starts with an empty one.
    const bucket = await fetch(`http://127.0.0.1:${s3Port}/${s3Bucket}`, {
      method: "PUT",
    });
    if (!bucket.ok) throw new Error(`Creating ${s3Bucket}: ${bucket.status}`);
    await waitForReady(
      "api",
      `http://127.0.0.1:${apiPort}/api/health`,
      120_000,
    );
    await waitForReady(
      "api-s3",
      `http://127.0.0.1:${s3ApiPort}/api/health`,
      120_000,
    );
    await waitForReady(
      "radicale",
      `http://127.0.0.1:${caldavPort}/.web/`,
      30_000,
    );
    // Playwright waits only for the main web server.
    startWeb("web-s3", s3WebPort, s3ApiPort);
    await waitForReady("web-s3", `http://127.0.0.1:${s3WebPort}`, 120_000);
  } catch (error) {
    console.error(error);
    shutdown(1);
    await sleep(300);
    process.exit(1);
  }

  startWeb("web", webPort, apiPort);
}

function startApi(
  name: string,
  port: string,
  dbPath: string,
  storageEnv: NodeJS.ProcessEnv,
) {
  console.log(`Starting ${name} on http://127.0.0.1:${port}`);
  fs.mkdirSync(dbPath, { recursive: true });
  spawnService(
    name,
    "bun",
    [
      "run",
      process.env.WBD_E2E_EMAIL_ENABLED === "true" ||
      process.env.WBD_E2E_GOOGLE_ENABLED === "true"
        ? path.join(repoRoot, "scripts/e2e-email-api.ts")
        : "src/start.ts",
    ],
    {
      cwd: path.join(repoRoot, "apps", "api"),
      env: {
        NODE_ENV: "development",
        PORT: port,
        WBD_DB_ENGINE: "sqlite",
        WBD_DB_PATH: dbPath,
        WBD_CF_CAPTCHA_ENABLED: "false",
        WBD_BACKUP_S3_ENABLED: "false",
        WBD_RATE_LIMIT_ENABLED: "false",
        WBD_GOOGLE_CLIENT_ID: "",
        WBD_GOOGLE_CLIENT_SECRET: "",
        WBD_GOOGLE_PUBLIC_APP_URL: "",
        WBD_EMAIL_RESEND_API_KEY: "",
        WBD_EMAIL_FROM: "",
        WBD_EMAIL_PUBLIC_APP_URL: "",
        WBD_CALENDAR_ENCRYPTION_KEY: "e2e-calendar-encryption-key-0123456789",
        WBD_CALENDAR_ALLOW_PRIVATE_NETWORKS: "true",
        ...storageEnv,
      },
    },
  );
}

function startWeb(name: string, port: string, apiPort: string) {
  console.log(`Starting ${name} on http://127.0.0.1:${port}`);
  spawnService(
    name,
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", port, "--strictPort"],
    {
      cwd: path.join(repoRoot, "apps", "web"),
      env: { VITE_API_PORT: apiPort },
    },
  );
}

void main();
