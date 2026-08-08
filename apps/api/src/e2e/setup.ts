import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "bun:test";

const databasePath = mkdtempSync(join(tmpdir(), "will-be-done-api-e2e-"));
const runsFullE2eSuite = process.argv.some((argument) => {
  const target = argument.replaceAll("\\", "/").replace(/\/+$/, "");
  return target === "src/e2e" || target.endsWith("/src/e2e");
});

process.env.WBD_API_E2E_DB_PATH = databasePath;
process.env.WBD_DB_PATH = databasePath;
process.env.WBD_DB_ENGINE = "sqlite";
process.env.WBD_SYNC_NOTIFICATIONS_BACKEND = "memory";

beforeAll(async () => {
  // This ./harness import is intentionally load-bearing and must stay dynamic:
  // env.ts loads dotenv and caches configuration at import time, so a static
  // import would run before the WBD_DB_ENGINE and
  // WBD_SYNC_NOTIFICATIONS_BACKEND assignments above and use ambient values.
  const { startTestServer } = await import("./harness");
  await startTestServer();
});

afterAll(async () => {
  try {
    if (runsFullE2eSuite) {
      const { expectEveryOpenApiOperationCovered } =
        await import("./operationCoverage");
      expectEveryOpenApiOperationCovered();
    }
  } finally {
    // This second ./harness import is also intentionally load-bearing and must
    // stay dynamic: a static import would reach env.ts before the environment
    // assignments above, and env.ts caches ambient dotenv configuration.
    const { stopTestServer } = await import("./harness");
    await stopTestServer();
    rmSync(databasePath, { recursive: true, force: true });
  }
});
