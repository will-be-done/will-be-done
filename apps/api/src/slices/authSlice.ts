import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { uuidv7 } from "uuidv7";
import { tokensTable, usersTable, type Token, type User } from "./tables";

export { usersTable, tokensTable, type User, type Token } from "./tables";

export const getUserByEmail = selector({
  name: "getUserByEmail",
  args: { email: v.string() },
  handler: function* getUserByEmail({ email }) {
    const users = yield* selectFrom(usersTable, "byEmail")
      .where((q) => q.eq("email", email))
      .limit(1);
    return users[0] as User | undefined;
  },
});

export const getUserById = selector({
  name: "getUserById",
  args: { id: v.string() },
  handler: function* getUserById({ id }) {
    const users = yield* selectFrom(usersTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return users[0] as User | undefined;
  },
});

export const getTokenById = selector({
  name: "getTokenById",
  args: { id: v.string() },
  handler: function* getTokenById({ id }) {
    const tokens = yield* selectFrom(tokensTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return tokens[0] as Token | undefined;
  },
});

export const getTokensByUserId = selector({
  name: "getTokensByUserId",
  args: { userId: v.string() },
  handler: function* getTokensByUserId({ userId }) {
    const tokens = yield* selectFrom(tokensTable, "byUserId").where((q) =>
      q.eq("userId", userId),
    );

    return [...tokens].sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
  },
});

export const register = action({
  name: "register",
  args: { email: v.string(), hashedPassword: v.string() },
  handler: function* register({ email, hashedPassword }) {
    const existing = yield* getUserByEmail({ email });
    if (existing) {
      throw new Error("User already exists");
    }

    const userId = uuidv7();
    const now = new Date().toISOString();
    const user: User = {
      id: userId,
      email,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    };

    yield* insert(usersTable, [user]);

    const tokenId = uuidv7();
    const token: Token = {
      id: tokenId,
      userId,
      createdAt: now,
    };

    yield* insert(tokensTable, [token]);

    return { userId, token: tokenId };
  },
});

export const generateToken = action({
  name: "generateToken",
  args: { userId: v.string() },
  handler: function* generateToken({ userId }) {
    const tokenId = uuidv7();
    const token: Token = {
      id: tokenId,
      userId,
      createdAt: new Date().toISOString(),
    };

    yield* insert(tokensTable, [token]);

    return { userId, token: tokenId, createdAt: token.createdAt };
  },
});

export const validateToken = action({
  name: "validateToken",
  args: {
    tokenId: v.string(),
    usedAt: v.string(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: function* validateToken({ tokenId, usedAt, ip, userAgent }) {
    const token = yield* getTokenById({ id: tokenId });
    if (!token) {
      return null as User | null;
    }

    const user = yield* getUserById({ id: token.userId });
    if (!user) {
      return null as User | null;
    }

    yield* upsert(tokensTable, [
      {
        id: token.id,
        userId: token.userId,
        createdAt: token.createdAt,
        lastUsedAt: usedAt,
        ...(ip !== undefined ? { lastUsedIp: ip } : {}),
        ...(userAgent !== undefined ? { lastUsedUserAgent: userAgent } : {}),
      },
    ]);

    return user;
  },
});

export const revokeToken = action({
  name: "revokeToken",
  args: { tokenId: v.string(), userId: v.string() },
  handler: function* revokeToken({ tokenId, userId }) {
    const token = yield* getTokenById({ id: tokenId });
    if (!token || token.userId !== userId) {
      return false;
    }

    yield* deleteRows(tokensTable, [tokenId]);
    return true;
  },
});

export const revokeAllUserTokens = action({
  name: "revokeAllUserTokens",
  args: { userId: v.string() },
  handler: function* revokeAllUserTokens({ userId }) {
    const tokens = yield* selectFrom(tokensTable, "byUserId").where((q) =>
      q.eq("userId", userId),
    );
    const tokenIds = tokens.map((t) => t.id);
    if (tokenIds.length > 0) {
      yield* deleteRows(tokensTable, tokenIds);
    }
  },
});
