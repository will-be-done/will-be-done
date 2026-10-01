import fs from "node:fs";
import path from "node:path";
import fastify from "fastify";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import swagger from "@fastify/swagger";
import websocket from "@fastify/websocket";
import type { RateLimitConfig } from "./rateLimit";
import { createAppRateLimiter, registerAppRateLimiting } from "./rateLimit";
import scalarApiReference from "@scalar/fastify-api-reference";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AppRouter } from "./appRouter";
import { createContext } from "./trpc";
import { v1Routes } from "./http/v1";
import { syncV4Routes } from "./sync/routes";
import type { DB } from "@will-be-done/hyperdb";
import { setupSentryErrorHandler } from "./instrument";
import { noopBackendAnalytics, type BackendAnalytics } from "./analytics";

export interface CreateServerOptions {
  appRouter: AppRouter;
  logger?: boolean;
  serveFrontend?: boolean;
  rateLimit?: RateLimitConfig;
  mainDB?: DB;
  analytics?: BackendAnalytics;
}

export function createServer({
  appRouter,
  logger = true,
  serveFrontend = true,
  rateLimit = { backend: "memory" },
  mainDB,
  analytics = noopBackendAnalytics,
}: CreateServerOptions) {
  const rateLimitEnabled = rateLimit.enabled ?? true;
  const server = fastify({
    logger,
    bodyLimit: 100485760,
    // Kamal reaches the app through a private container network and rewrites
    // forwarded headers, so only private-network proxies are trusted.
    trustProxy: ["loopback", "linklocal", "uniquelocal"],
  });

  setupSentryErrorHandler(server);

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Register before every route/plugin so the broad per-IP limit covers the
  // complete HTTP surface. Sensitive tRPC procedures add stricter limits.
  if (rateLimitEnabled) {
    registerAppRateLimiting(server, rateLimit);
  }

  server.register(websocket);
  server.register(multipart);

  server.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Will Be Done API",
        description: "Public HTTP API for Will Be Done.",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "Token returned by the login or register endpoint.",
          },
        },
      },
    },
    hideUntagged: true,
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });

  server.register(scalarApiReference, {
    routePrefix: "/api/docs",
    configuration: {
      title: "Will Be Done API",
      url: "/api/openapi.json",
      persistAuth: true,
      authentication: {
        preferredSecurityScheme: "bearerAuth",
      },
      onBeforeRequest: ({ request }) => {
        try {
          const token = globalThis.localStorage?.getItem("auth_token");
          if (token) {
            request.headers.set("Authorization", `Bearer ${token}`);
          }
        } catch {
          // localStorage may be unavailable in restricted browser contexts.
        }
      },
      mcp: {
        disabled: true,
      },
      agent: {
        disabled: true,
      },
      defaultOpenAllTags: true,
      showDeveloperTools: "never",
    },
  });

  server.register(v1Routes, {
    prefix: "/api/v1",
    analytics,
  });
  server.register(syncV4Routes, {
    prefix: "/api/sync/v4",
    mainDB,
  });

  server.register(async (trpcServer) => {
    const appRateLimiter = rateLimitEnabled
      ? createAppRateLimiter(trpcServer, rateLimit)
      : undefined;

    trpcServer.register(fastifyTRPCPlugin, {
      prefix: "/api/trpc",
      useWSS: true,
      trpcOptions: {
        router: appRouter,
        createContext: (options) =>
          createContext({ ...options, rateLimiter: appRateLimiter }),
      } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
    });
  });

  server.get("/api/openapi.json", { schema: { hide: true } }, async () =>
    server.swagger(),
  );
  server.get("/api/health", async () => ({ ok: true }));

  if (serveFrontend) {
    const publicRoot = path.join(__dirname, "..", "public");
    const serviceWorkerPath = path.join(publicRoot, "sw.js");
    server.register(staticPlugin, {
      root: publicRoot,
      setHeaders(response, filePath) {
        if (filePath === serviceWorkerPath) {
          // A service worker controls how the rest of the frontend is cached,
          // so browsers and intermediary CDNs must always revalidate it.
          response.setHeader(
            "Cache-Control",
            "no-cache, no-store, must-revalidate",
          );
        }
      },
    });

    server.setNotFoundHandler((request, reply) => {
      const [requestPath] = request.url.split("?", 1);
      const isApiRequest =
        requestPath === "/api" || requestPath.startsWith("/api/");
      const isAssetRequest =
        requestPath === "/assets" || requestPath.startsWith("/assets/");
      const isServiceWorkerRequest = requestPath === "/sw.js";

      if (isApiRequest || isAssetRequest || isServiceWorkerRequest) {
        return reply.code(404).send({ error: "Not found" });
      }

      const indexPath = path.join(publicRoot, "index.html");
      try {
        if (!fs.existsSync(indexPath)) {
          return reply.code(404).send({ error: "index.html not found" });
        }

        return reply.type("text/html").send(fs.createReadStream(indexPath));
      } catch (error) {
        request.log.error(error, "Failed to serve index.html");
        return reply.code(500).send({ error: "Server error" });
      }
    });
  }

  server.addHook("onClose", async () => {
    await analytics.shutdown();
  });

  return server;
}
