import type { DB } from "@will-be-done/hyperdb";
import { initTRPC, TRPCError } from "@trpc/server";
import { UnsupportedSyncVersionError } from "@will-be-done/slices/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  authenticateRequest,
  type AuthenticatedUser,
} from "./services/authentication";
import type { AppRateLimiter, RateLimitPolicy } from "./rateLimit";

/**
 * Context type definition
 */
export interface Context {
  user: AuthenticatedUser | null;
  tokenId?: string;
  revalidateUser?: () => Promise<AuthenticatedUser | null>;
  requestId?: string;
  enforceRateLimit?: (policy: RateLimitPolicy) => Promise<void>;
}

/**
 * Create context for requests (HTTP and WebSocket)
 * For HTTP: token comes from Authorization header
 * For WebSocket: token comes from URL query parameter
 */
export async function createContext({
  req,
  rateLimiter,
  mainDB,
}: {
  req: FastifyRequest;
  res: FastifyReply;
  rateLimiter?: AppRateLimiter;
  mainDB?: DB;
}): Promise<Context> {
  const buildContext = (
    user: AuthenticatedUser | null,
    authHeader?: string,
  ): Context => ({
    ...(authHeader && req.headers.upgrade?.toLowerCase() === "websocket"
      ? { revalidateUser: () => authenticateRequest(req, authHeader, mainDB) }
      : {}),
    user,
    ...(user && authHeader
      ? { tokenId: authHeader.slice("Bearer ".length) }
      : {}),
    requestId: req.id,
    ...(rateLimiter
      ? {
          enforceRateLimit: async (policy: RateLimitPolicy) => {
            const result = await rateLimiter.check(policy, req, user?.id);
            if (!result.exceeded) return;

            const retryMessage =
              result.retryAfterSeconds > 0
                ? ` Try again in ${result.retryAfterSeconds} seconds.`
                : " Try again later.";
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Rate limit exceeded.${retryMessage}`,
            });
          },
        }
      : {}),
  });

  // First try Authorization header (HTTP requests)
  if (req.headers.authorization) {
    return buildContext(
      await authenticateRequest(req, req.headers.authorization, mainDB),
      req.headers.authorization,
    );
  }

  // Then try URL query parameter (WebSocket connections)
  const url = new URL(req.url || "", "http://localhost");
  const token = url.searchParams.get("token");
  if (token) {
    return buildContext(
      await authenticateRequest(req, `Bearer ${token}`, mainDB),
      `Bearer ${token}`,
    );
  }

  return buildContext(null);
}

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    const syncVersionError =
      error.cause instanceof UnsupportedSyncVersionError
        ? error.cause.data
        : undefined;

    return {
      ...shape,
      data: {
        ...shape.data,
        ...(syncVersionError ? { syncVersion: syncVersionError } : {}),
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;

export const enforceRateLimit = (policy: RateLimitPolicy) =>
  t.middleware(async (opts) => {
    if (!opts.ctx.enforceRateLimit) {
      console.warn(
        `[Rate limiting] No limiter is available for policy "${policy}"${opts.ctx.requestId ? `; request=${opts.ctx.requestId}` : ""}`,
      );
      return opts.next();
    }

    await opts.ctx.enforceRateLimit(policy);
    return opts.next();
  });

/**
 * Protected procedure that requires authentication
 */
export const protectedProcedure = t.procedure.use(async (opts) => {
  const user = opts.ctx.revalidateUser
    ? await opts.ctx.revalidateUser()
    : opts.ctx.user;
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return opts.next({
    ctx: {
      user,
    },
  });
});
