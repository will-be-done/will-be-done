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

  if (config.backend === "redis") {
    if (!config.redisUrl) {
      throw new Error("A Redis URL is required for Redis-backed rate limiting");
    }

    redis = new Redis(config.redisUrl, {
      connectionName: "will-be-done-rate-limit",
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
    });
    redis.on("error", (error) => {
      server.log.warn({ err: error }, "Rate-limit Redis connection error");
    });
    server.addHook("onClose", async () => {
      redis?.disconnect();
    });
  }

  server.register(fastifyRateLimit, {
    global: false,
    redis,
    nameSpace: config.namespace ?? "wbd:rate-limit:v1:",
    // Keep the API available if Redis has a transient outage. Connection
    // errors are still logged above so the missing protection is visible.
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
