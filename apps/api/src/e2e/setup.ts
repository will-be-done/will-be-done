import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "bun:test";
import { startTestServer, stopTestServer } from "./harness";
import { expectEveryOpenApiOperationCovered } from "./operationCoverage";

const databasePath = mkdtempSync(join(tmpdir(), "will-be-done-api-e2e-"));
const runsFullE2eSuite = process.argv.some((argument) => {
  const target = argument.replaceAll("\\", "/").replace(/\/+$/, "");
  return target === "src/e2e" || target.endsWith("/src/e2e");
});

process.env.WBD_API_E2E_DB_PATH = databasePath;
process.env.WBD_DB_PATH = databasePath;

beforeAll(async () => {
  await startTestServer();
});

afterAll(async () => {
  try {
    if (runsFullE2eSuite) {
      expectEveryOpenApiOperationCovered();
    }
  } finally {
    await stopTestServer();
    rmSync(databasePath, { recursive: true, force: true });
  }
});
