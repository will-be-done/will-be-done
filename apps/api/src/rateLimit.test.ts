import { describe, expect, test } from "bun:test";
import { DB, execSync, syncDispatch } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import fastify from "fastify";
import { createAppRouter } from "./appRouter";
import { createAppRateLimiter, registerAppRateLimiting } from "./rateLimit";
import { createServer } from "./server";
import { register, tokensTable, usersTable } from "./slices/authSlice";

async function createLoginServer() {
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
    rateLimit: {
      backend: "memory",
      policyOverrides: {
        login: { max: 1, timeWindow: 60_000 },
      },
    },
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
});
