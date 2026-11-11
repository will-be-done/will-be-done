import { defineConfig, devices } from "playwright/test";
import type { AttachmentStorageOptions } from "./e2e/helpers";

const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "5174";
const s3WebPort = process.env.PLAYWRIGHT_S3_WEB_PORT ?? "5175";
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

const chromium = {
  ...devices["Desktop Chrome"],
  launchOptions: chromiumExecutablePath
    ? { executablePath: chromiumExecutablePath }
    : undefined,
};

export default defineConfig<AttachmentStorageOptions>({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html"]] : "html",
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec tsx ../../scripts/e2e-web-server.ts",
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: chromium },
    // Specs about attachment storage run again against the S3-backed server.
    {
      name: "chromium-s3",
      testMatch: "attachment-storage.spec.ts",
      use: {
        ...chromium,
        baseURL: `http://127.0.0.1:${s3WebPort}`,
        attachmentStorage: "s3",
      },
    },
  ],
});
