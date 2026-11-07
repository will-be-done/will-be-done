import { initTRPC, TRPCError, type TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { UnsupportedSyncVersionError } from "@will-be-done/slices/common";
import { Effect, type Context as EffectContext } from "effect";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { RequestServices } from "./runtime";
import {
  authenticateRequest,
  type AuthenticatedUser,
} from "./services/authentication";
import type { ServiceError } from "./services/errors";
import type { AppRateLimiter, RateLimitPolicy } from "./rateLimit";

/**
 * Context type definition
 */
export interface Context {
  user: AuthenticatedUser | null;
  tokenId?: string;
  revalidateUser?: () => Promise<AuthenticatedUser | null>;
  requestId?: string;
  origin?: string;
  setCookie?: (value: string) => void;
  enforceRateLimit?: (policy: RateLimitPolicy) => Promise<void>;
}

/**
 * Create context for requests (HTTP and WebSocket)
 * For HTTP: token comes from Authorization header
 * For WebSocket: token comes from URL query parameter
 */
export async function createContext({
  req,
  res,
  rateLimiter,
  services,
}: {
  req: FastifyRequest;
  res: FastifyReply;
  rateLimiter?: AppRateLimiter;
  // WebSocket contexts get the raw request, which has no `server`.
  services: EffectContext.Context<RequestServices>;
}): Promise<Context> {
  const authenticate = (authHeader: string) =>
    Effect.runPromiseWith(services)(authenticateRequest(req, authHeader));

  const buildContext = (
    user: AuthenticatedUser | null,
    authHeader?: string,
  ): Context => ({
    ...(authHeader && req.headers.upgrade?.toLowerCase() === "websocket"
      ? { revalidateUser: () => authenticate(authHeader) }
      : {}),
    user,
    ...(user && authHeader
      ? { tokenId: authHeader.slice("Bearer ".length) }
      : {}),
    requestId: req.id,
    origin: req.headers.origin,
    ...(req.headers.upgrade?.toLowerCase() !== "websocket"
      ? {
          setCookie: (value: string) => {
            res.header("set-cookie", value);
          },
        }
      : {}),
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
      await authenticate(req.headers.authorization),
      req.headers.authorization,
    );
  }

  // Then try URL query parameter (WebSocket connections)
  const url = new URL(req.url || "", "http://localhost");
  const token = url.searchParams.get("token");
  if (token) {
    return buildContext(
      await authenticate(`Bearer ${token}`),
      `Bearer ${token}`,
    );
  }

  return buildContext(null);
}

const trpcErrorCodes = {
  UnauthorizedError: "UNAUTHORIZED",
  DatabaseAccessDeniedError: "FORBIDDEN",
  BadRequestError: "BAD_REQUEST",
  ResourceNotFoundError: "NOT_FOUND",
  ConflictError: "CONFLICT",
} satisfies Record<ServiceError["_tag"], TRPC_ERROR_CODE_KEY>;

export const toTRPCError = <A, E extends ServiceError, R>(
  effect: Effect.Effect<A, E, R>,
) =>
  effect.pipe(
    Effect.mapError(
      (error) =>
        new TRPCError({
          code: trpcErrorCodes[error._tag],
          message: error.message,
          cause: error,
        }),
    ),
  );

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
