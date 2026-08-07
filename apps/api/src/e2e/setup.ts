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
    const { stopTestServer } = await import("./harness");
    await stopTestServer();
    rmSync(databasePath, { recursive: true, force: true });
  }
});
