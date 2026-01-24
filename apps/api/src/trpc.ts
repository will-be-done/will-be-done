import { initTRPC, TRPCError } from "@trpc/server";
import { FastifyRequest, FastifyReply } from "fastify";
import { syncDispatch } from "@will-be-done/hyperdb";
import { getMainHyperDB } from "./db/db";
import { authSlice } from "./slices/authSlice";

/**
 * Context type definition
 */
export interface Context {
  user: {
    id: string;
    email: string;
  } | null;
}

/**
 * Shared context creation from auth token
 */
function createContextFromToken(authHeader?: string): Context {
  const mainDB = getMainHyperDB();

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { user: null };
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const user = syncDispatch(mainDB, authSlice.validateToken(token));
    return { user };
  } catch (error) {
    console.error("Token validation error:", error);
    return { user: null };
  }
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
    return createContextFromToken(req.headers.authorization);
  }

  // Then try URL query parameter (WebSocket connections)
  const url = new URL(req.url || "", "http://localhost");
  const token = url.searchParams.get("token");
  if (token) {
    return createContextFromToken(`Bearer ${token}`);
  }

  return { user: null };
}

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create();

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
