import { describe, expect, test } from "bun:test";
import { DB, execSync, syncDispatch } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import fastify from "fastify";
import staticPlugin from "@fastify/static";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "./appRouter";
import {
  createAppRateLimiter,
  registerAppRateLimiting,
  type RateLimitConfig,
} from "./rateLimit";
import { createServer } from "./server";
import { register, tokensTable, usersTable } from "./slices/authSlice";

async function createLoginServer(
  rateLimit: RateLimitConfig = {
    backend: "memory",
    policyOverrides: {
      login: { max: 1, timeWindow: 60_000 },
    },
  },
) {
  const mainDB = new DB(new BptreeInmemDriver());
  execSync(mainDB.loadTables([usersTable, tokensTable]));
  const hashedPassword = await Bun.password.hash("password1", {
    algorithm: "bcrypt",
    cost: 4,
  });
  syncDispatch(
    mainDB,
    register({ email: "limited@example.com", hashedPassword }),
  );

  return createServer({
    appRouter: createAppRouter({ mainDB, captchaConfig: null }),
    logger: false,
    serveFrontend: false,
    rateLimit,
  });
}

describe("tRPC rate limiting", () => {
  test("limits login per trusted client IP without limiting unrelated procedures", async () => {
    const server = await createLoginServer();

    try {
      await server.ready();
      const loginRequest = {
        method: "POST" as const,
        url: "/api/trpc/login",
        remoteAddress: "10.0.0.9",
        headers: { "x-forwarded-for": "203.0.113.10" },
        payload: {
          email: "limited@example.com",
          password: "password1",
        },
      };

      expect((await server.inject(loginRequest)).statusCode).toBe(200);

      const limited = await server.inject(loginRequest);
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({
        error: {
          data: {
            code: "TOO_MANY_REQUESTS",
            httpStatus: 429,
          },
        },
      });

      const otherClient = await server.inject({
        ...loginRequest,
        headers: { "x-forwarded-for": "203.0.113.11" },
      });
      expect(otherClient.statusCode).toBe(200);

      const unrelated = await server.inject({
        method: "GET",
        url: "/api/trpc/getCaptchaConfig",
        remoteAddress: "10.0.0.9",
        headers: { "x-forwarded-for": "203.0.113.10" },
      });
      expect(unrelated.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  test("requires a URL for the Redis backend", async () => {
    const mainDB = new DB(new BptreeInmemDriver());
    expect(() =>
      createServer({
        appRouter: createAppRouter({ mainDB, captchaConfig: null }),
        logger: false,
        serveFrontend: false,
        rateLimit: { backend: "redis" },
      }),
    ).toThrow("A Redis URL is required for Redis-backed rate limiting");
  });

  test("can disable global and procedure-specific limits explicitly", async () => {
    const server = await createLoginServer({
      enabled: false,
      backend: "memory",
      globalOverride: { max: 1, timeWindow: 60_000 },
      policyOverrides: {
        login: { max: 1, timeWindow: 60_000 },
      },
    });

    try {
      await server.ready();
      const loginRequest = {
        method: "POST" as const,
        url: "/api/trpc/login",
        payload: {
          email: "limited@example.com",
          password: "password1",
        },
      };

      expect((await server.inject(loginRequest)).statusCode).toBe(200);
      expect((await server.inject(loginRequest)).statusCode).toBe(200);
      expect(
        (await server.inject({ method: "GET", url: "/api/health" })).statusCode,
      ).toBe(200);
    } finally {
      await server.close();
    }
  });

  test("limits Todoist imports per user instead of per IP", async () => {
    const server = fastify({ logger: false });
    const config = {
      backend: "memory" as const,
      globalOverride: { max: 100, timeWindow: 60_000 },
      policyOverrides: {
        todoistImport: { max: 1, timeWindow: 60_000 },
      },
    };
    registerAppRateLimiting(server, config);
    server.register(async (limitedServer) => {
      const limiter = createAppRateLimiter(limitedServer, config);
      limitedServer.post<{ Params: { userId: string } }>(
        "/limit/:userId",
        async (request) =>
          limiter.check("todoistImport", request, request.params.userId),
      );
    });

    try {
      const firstUser = await server.inject({
        method: "POST",
        url: "/limit/user-1",
        remoteAddress: "203.0.113.10",
      });
      const sameUser = await server.inject({
        method: "POST",
        url: "/limit/user-1",
        remoteAddress: "203.0.113.11",
      });
      const otherUser = await server.inject({
        method: "POST",
        url: "/limit/user-2",
        remoteAddress: "203.0.113.10",
      });

      expect(firstUser.json()).toMatchObject({ exceeded: false });
      expect(sameUser.json()).toMatchObject({ exceeded: true });
      expect(otherUser.json()).toMatchObject({ exceeded: false });
    } finally {
      await server.close();
    }
  });

  test("applies a broad per-IP limit to every Fastify route", async () => {
    const mainDB = new DB(new BptreeInmemDriver());
    const server = createServer({
      appRouter: createAppRouter({ mainDB, captchaConfig: null }),
      logger: false,
      serveFrontend: false,
      rateLimit: {
        backend: "memory",
        globalOverride: { max: 1, timeWindow: 60_000 },
      },
    });

    try {
      const first = await server.inject({
        method: "GET",
        url: "/api/health",
        remoteAddress: "203.0.113.20",
      });
      const limited = await server.inject({
        method: "GET",
        url: "/api/health",
        remoteAddress: "203.0.113.20",
      });
      const otherClient = await server.inject({
        method: "GET",
        url: "/api/health",
        remoteAddress: "203.0.113.21",
      });

      expect(first.statusCode).toBe(200);
      expect(limited.statusCode).toBe(429);
      expect(limited.headers["retry-after"]).toBe("60");
      expect(otherClient.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  test("public files do not consume the API budget and remain available after it is exhausted", async () => {
    const root = await mkdtemp(join(tmpdir(), "emoji-rate-limit-"));
    const server = await createLoginServer({
      backend: "memory",
      globalOverride: { max: 2, timeWindow: 60_000 },
    });
    await writeFile(join(root, "icon.webp"), "emoji");
    server.register(async (frontend) => {
      frontend.addHook("onRoute", (route) => {
        route.config = { ...route.config, rateLimit: false };
      });
      frontend.register(staticPlugin, { root });
    });

    try {
      for (const method of ["GET", "HEAD", "GET", "GET"] as const) {
        expect(
          (await server.inject({ method, url: "/icon.webp" })).statusCode,
        ).toBe(200);
      }
      expect(
        (
          await server.inject({
            method: "POST",
            url: "/api/trpc/login",
            payload: { email: "limited@example.com", password: "password1" },
          })
        ).statusCode,
      ).toBe(200);
      expect((await server.inject("/api/health")).statusCode).toBe(200);
      expect((await server.inject("/api/health")).statusCode).toBe(429);
      expect((await server.inject("/icon.webp")).statusCode).toBe(200);
    } finally {
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
