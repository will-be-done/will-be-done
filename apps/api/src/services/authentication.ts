import { asyncDispatch, type DB } from "@will-be-done/hyperdb";
import type { FastifyRequest } from "fastify";
import { getMainHyperDB } from "../db/db";
import { validateToken } from "../slices/authSlice";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface TokenUsage {
  usedAt?: string;
  ip?: string;
  userAgent?: string;
}

export async function authenticateBearerToken(
  authHeader?: string,
  mainDB?: DB,
  usage: TokenUsage = {},
): Promise<AuthenticatedUser | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length);
  if (!token) {
    return null;
  }

  try {
    const user = await asyncDispatch(
      mainDB ?? (await getMainHyperDB()),
      validateToken({
        tokenId: token,
        usedAt: usage.usedAt ?? new Date().toISOString(),
        ...(usage.ip !== undefined ? { ip: usage.ip } : {}),
        ...(usage.userAgent !== undefined
          ? { userAgent: usage.userAgent }
          : {}),
      }),
    );
    return user ? { id: user.id, email: user.email } : null;
  } catch (error) {
    console.error("Token validation error:", error);
    return null;
  }
}

export async function authenticateRequest(
  request: Pick<FastifyRequest, "headers" | "ip">,
  authHeader: string | undefined = request.headers.authorization,
  mainDB?: DB,
): Promise<AuthenticatedUser | null> {
  const userAgent = request.headers["user-agent"];

  return await authenticateBearerToken(authHeader, mainDB, {
    ip: request.ip,
    ...(userAgent !== undefined ? { userAgent } : {}),
  });
}
