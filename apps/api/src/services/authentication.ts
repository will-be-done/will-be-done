import type { HyperDB } from "@will-be-done/hyperdb";
import type { FastifyRequest } from "fastify";
import { Clock, Effect } from "effect";
import { validateToken } from "../slices/authSlice";
import { Databases } from "./databases";
import { UnauthorizedError } from "./errors";
import { dispatch } from "./hyperdb";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface TokenUsage {
  usedAt?: string;
  ip?: string;
  userAgent?: string;
}

const authenticatedRequestUsers = new WeakMap<
  FastifyRequest,
  AuthenticatedUser | null
>();

export function getAuthenticatedRequestUser(
  request: FastifyRequest,
): AuthenticatedUser | null | undefined {
  return authenticatedRequestUsers.get(request);
}

// A token that cannot be validated is treated as missing.
export const authenticateBearerToken = Effect.fn("authenticateBearerToken")(
  function* (
    authHeader: string | undefined,
    mainDB: HyperDB,
    usage: TokenUsage = {},
  ) {
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length);
    if (!token) return null;

    const usedAt =
      usage.usedAt ?? new Date(yield* Clock.currentTimeMillis).toISOString();
    const user = yield* dispatch(
      mainDB,
      validateToken({
        tokenId: token,
        usedAt,
        ...(usage.ip !== undefined ? { ip: usage.ip } : {}),
        ...(usage.userAgent !== undefined
          ? { userAgent: usage.userAgent }
          : {}),
      }),
    ).pipe(
      Effect.catchCause((cause) =>
        Effect.logError("Token validation error", cause).pipe(
          Effect.as(undefined),
        ),
      ),
    );
    return user ? { id: user.id, email: user.email } : null;
  },
);

export const authenticateRequest = Effect.fn("authenticateRequest")(function* (
  request: FastifyRequest,
  authHeader: string | undefined = request.headers.authorization,
) {
  const mainDB = yield* (yield* Databases).main;
  const userAgent = request.headers["user-agent"];
  const user = yield* authenticateBearerToken(authHeader, mainDB, {
    ip: request.ip,
    ...(userAgent !== undefined ? { userAgent } : {}),
  });
  authenticatedRequestUsers.set(request, user);
  return user;
});

export const requireUser = Effect.fn("requireUser")(function* (
  request: FastifyRequest,
) {
  const user = yield* authenticateRequest(request);
  if (!user) return yield* new UnauthorizedError();
  return user;
});
