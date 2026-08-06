import { initTRPC, TRPCError } from "@trpc/server";
import { UnsupportedSyncVersionError } from "@will-be-done/slices/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  authenticateRequest,
  type AuthenticatedUser,
} from "./services/authentication";

/**
 * Context type definition
 */
export interface Context {
  user: AuthenticatedUser | null;
  requestId?: string;
}

/**
 * Create context for requests (HTTP and WebSocket)
 * For HTTP: token comes from Authorization header
 * For WebSocket: token comes from URL query parameter
 */
export async function createContext({
  req,
}: {
  req: FastifyRequest;
  res: FastifyReply;
}): Promise<Context> {
  // First try Authorization header (HTTP requests)
  if (req.headers.authorization) {
    return { user: await authenticateRequest(req), requestId: req.id };
  }

  // Then try URL query parameter (WebSocket connections)
  const url = new URL(req.url || "", "http://localhost");
  const token = url.searchParams.get("token");
  if (token) {
    return {
      user: await authenticateRequest(req, `Bearer ${token}`),
      requestId: req.id,
    };
  }

  return { user: null, requestId: req.id };
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

/**
 * Protected procedure that requires authentication
 */
export const protectedProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return opts.next({
    ctx: {
      user: opts.ctx.user,
    },
  });
});
