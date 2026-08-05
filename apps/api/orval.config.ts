import { defineConfig } from "orval";

export default defineConfig({
  v1: {
    input: {
      target: "./openapi.json",
    },
    output: {
      target: "./src/generated/v1-client.ts",
      schemas: false,
      client: "fetch",
      mode: "single",
      baseUrl: {
        runtime: "process.env.WBD_API_BASE_URL ?? ''",
      },
    },
  },
});
