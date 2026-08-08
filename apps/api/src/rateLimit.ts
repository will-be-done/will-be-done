import fastifyRateLimit, { normalizeIP } from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import Redis from "ioredis";

export type RateLimitPolicy = "login" | "register" | "todoistImport";

interface WindowLimitConfig {
  max: number;
  timeWindow: number | string;
}

interface PolicyConfig extends WindowLimitConfig {
  identity: "ip" | "user";
}

const defaultPolicies: Record<RateLimitPolicy, PolicyConfig> = {
  login: {
    max: 10,
    timeWindow: "10 minutes",
    identity: "ip",
  },
  register: {
    max: 5,
    timeWindow: "1 hour",
    identity: "ip",
  },
  todoistImport: {
    max: 3,
    timeWindow: "1 hour",
    identity: "user",
  },
};

const defaultGlobalPolicy: WindowLimitConfig = {
  max: 300,
  timeWindow: "1 minute",
};

export interface RateLimitConfig {
  enabled?: boolean;
  backend: "memory" | "redis";
  redisUrl?: string;
  namespace?: string;
  globalOverride?: Partial<WindowLimitConfig>;
  policyOverrides?: Partial<
    Record<RateLimitPolicy, Partial<Omit<PolicyConfig, "identity">>>
  >;
}

export interface RateLimitDecision {
  exceeded: boolean;
  retryAfterSeconds: number;
}

export interface AppRateLimiter {
  check(
    policy: RateLimitPolicy,
    request: FastifyRequest,
    userId?: string,
  ): Promise<RateLimitDecision>;
}

export function registerAppRateLimiting(
  server: FastifyInstance,
  config: RateLimitConfig,
): void {
  let redis: Redis | undefined;
  let redisHealthy = config.backend !== "redis";
  let redisConnectionError: Error | undefined;

  if (config.backend === "redis") {
    if (!config.redisUrl) {
      throw new Error("A Redis URL is required for Redis-backed rate limiting");
    }

    const rateLimitRedis = new Redis(config.redisUrl, {
      connectionName: "will-be-done-rate-limit",
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
    });
    redis = rateLimitRedis;
    rateLimitRedis.on("ready", () => {
      redisHealthy = true;
      redisConnectionError = undefined;
    });
    rateLimitRedis.on("error", (error) => {
      redisHealthy = false;
      redisConnectionError = error;
      server.log.warn({ err: error }, "Rate-limit Redis connection error");
    });
    rateLimitRedis.on("close", () => {
      redisHealthy = false;
      redisConnectionError ??= new Error("Rate-limit Redis connection closed");
    });
    server.addHook("onReady", async () => {
      try {
        await rateLimitRedis.ping();
        redisHealthy = true;
        redisConnectionError = undefined;
      } catch (error) {
        redisHealthy = false;
        redisConnectionError =
          error instanceof Error ? error : new Error(String(error));
        server.log.error(
          { err: redisConnectionError },
          "Rate-limit Redis failed its startup health check",
        );
        throw new Error("Rate-limit Redis backend is unavailable", {
          cause: redisConnectionError,
        });
      }
    });
    server.addHook("onRequest", async () => {
      if (redisHealthy) return;

      throw Object.assign(
        new Error("Rate-limit Redis backend is unavailable", {
          cause: redisConnectionError,
        }),
        { statusCode: 503 },
      );
    });
    server.addHook("onClose", async () => {
      rateLimitRedis.disconnect();
    });
  }

  server.register(fastifyRateLimit, {
    global: false,
    redis,
    nameSpace: config.namespace ?? "wbd:rate-limit:v1:",
    // Redis health hooks surface backend outages consistently; avoid a second,
    // plugin-specific rate-limit error after the request health check passes.
    skipOnError: true,
  });

  const globalPolicy = {
    ...defaultGlobalPolicy,
    ...config.globalOverride,
  };
  let checkGlobalLimit: ReturnType<FastifyInstance["rateLimit"]> | undefined;

  server.addHook("onRequest", async (request, reply) => {
    if (!checkGlobalLimit) {
      throw new Error("Global rate limiter was not initialized");
    }
    return checkGlobalLimit.call(request.server, request, reply);
  });

  // This initializer runs after @fastify/rate-limit has decorated the server
  // and before later route plugins begin accepting requests.
  server.register(async (limitedServer) => {
    checkGlobalLimit = limitedServer.rateLimit({
      max: globalPolicy.max,
      timeWindow: globalPolicy.timeWindow,
      keyGenerator: (request) => `global:ip:${normalizeIP(request.ip)}`,
    });
  });
}

export function createAppRateLimiter(
  server: FastifyInstance,
  config: RateLimitConfig,
): AppRateLimiter {
  const requestUserIds = new WeakMap<FastifyRequest, string>();
  const limiters = Object.fromEntries(
    (Object.keys(defaultPolicies) as RateLimitPolicy[]).map((policy) => {
      const policyConfig = {
        ...defaultPolicies[policy],
        ...config.policyOverrides?.[policy],
      };

      return [
        policy,
        server.createRateLimit({
          max: policyConfig.max,
          timeWindow: policyConfig.timeWindow,
          keyGenerator: (request) => {
            const identity =
              policyConfig.identity === "user"
                ? (requestUserIds.get(request) ?? normalizeIP(request.ip))
                : normalizeIP(request.ip);
            return `${policy}:${policyConfig.identity}:${identity}`;
          },
        }),
      ];
    }),
  ) as Record<RateLimitPolicy, ReturnType<FastifyInstance["createRateLimit"]>>;

  return {
    async check(policy, request, userId) {
      if (userId) requestUserIds.set(request, userId);

      try {
        const result = await limiters[policy](request);
        return result.isAllowed
          ? { exceeded: false, retryAfterSeconds: 0 }
          : {
              exceeded: result.isExceeded,
              retryAfterSeconds: result.ttlInSeconds,
            };
      } finally {
        requestUserIds.delete(request);
      }
    },
  };
}
