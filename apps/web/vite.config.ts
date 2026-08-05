import fs from "fs";
import path from "path";
import type { PluginOption } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";
import { configDefaults, defineConfig } from "vitest/config";

const hyperdbRoot = path.resolve(
  __dirname,
  "../../../hyperdb/packages/hyperdb",
);
const hyperdbDevtoolRoot = path.resolve(
  __dirname,
  "../../../hyperdb/packages/hyperdb-devtool",
);
const workspaceConfigPath = path.resolve(
  __dirname,
  "../../pnpm-workspace.yaml",
);

function getWorkspaceOverride(packageName: string) {
  const workspaceConfig = fs.readFileSync(workspaceConfigPath, "utf8");
  const escapedPackageName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const overridePattern = new RegExp(
    `^[ \\t]*["']?${escapedPackageName}["']?\\s*:\\s*["']?([^"'\\n#]+)["']?`,
    "m",
  );

  return overridePattern.exec(workspaceConfig)?.[1]?.trim();
}

function isLocalOverride(override: string | undefined) {
  return (
    override !== undefined &&
    (/^(link|file|workspace):/.test(override) ||
      override.startsWith("/") ||
      override.startsWith("./") ||
      override.startsWith("../"))
  );
}

const useLocalHyperdbAliases = isLocalOverride(
  getWorkspaceOverride("@will-be-done/hyperdb"),
);

const hyperdbAliases = useLocalHyperdbAliases
  ? [
      {
        find: /^@will-be-done\/hyperdb\/drivers\/inmemory$/,
        replacement: path.resolve(
          hyperdbRoot,
          "src/hyperdb/drivers/inmemory/bptree-inmem-driver.ts",
        ),
      },
      {
        find: /^@will-be-done\/hyperdb\/drivers\/sqlite$/,
        replacement: path.resolve(
          hyperdbRoot,
          "src/hyperdb/drivers/sqlite/index.ts",
        ),
      },
      {
        find: /^@will-be-done\/hyperdb\/drivers\/idb$/,
        replacement: path.resolve(
          hyperdbRoot,
          "src/hyperdb/drivers/idb/idb-driver.ts",
        ),
      },
      {
        find: /^@will-be-done\/hyperdb\/tracing$/,
        replacement: path.resolve(hyperdbRoot, "src/hyperdb/tracing/index.ts"),
      },
      {
        find: /^@will-be-done\/hyperdb\/react$/,
        replacement: path.resolve(hyperdbRoot, "src/react.ts"),
      },
      {
        find: /^@will-be-done\/hyperdb$/,
        replacement: path.resolve(hyperdbRoot, "src/index.ts"),
      },
      {
        find: /^@will-be-done\/hyperdb-devtool\/react$/,
        replacement: path.resolve(hyperdbDevtoolRoot, "src/react.ts"),
      },
    ]
  : [];

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Please make sure that '@tanstack/router-plugin' is passed before '@vitejs/plugin-react'
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }) as unknown as PluginOption,
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    }),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      workbox: {
        clientsClaim: true,
        // API routes are rendered by Fastify and must never use the SPA's
        // offline navigation fallback.
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        globPatterns: [
          "**/*.{js,css,html,woff2,json,svg,wasm,webmanifest,png}",
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/rsms\.me\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "rsms-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      ...hyperdbAliases,
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
  server: {
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.VITE_API_PORT || "3000"}`,
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxying
      },
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**", "**/*.browser.test.ts"],
  },
});
