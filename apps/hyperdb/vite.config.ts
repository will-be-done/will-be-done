import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  plugins: [react()],
  test: {
    browser: {
      provider: playwright(),
      enabled: true,
      // at least one instance is required
      instances: [{ browser: "chromium" }],
      headless: true,
    },
  },
});
