import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    browser: {
      provider: "playwright", // or 'webdriverio'
      enabled: true,
      // at least one instance is required
      instances: [{ browser: "chromium" }],
      headless: true,
    },
  },
});
