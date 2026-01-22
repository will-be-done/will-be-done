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
 * Create context for each request
 */
export async function createContext({
  req,
}: {
  req: FastifyRequest;
  res: FastifyReply;
}): Promise<Context> {
  const mainDB = getMainHyperDB();

  async function getUserFromHeader() {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.slice(7); // Remove "Bearer "

    try {
      const user = syncDispatch(mainDB, authSlice.validateToken(token));
      return user;
    } catch (error) {
      console.error("Token validation error:", error);
      return null;
    }
  }

  const user = await getUserFromHeader();

  return {
    user,
  };
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
