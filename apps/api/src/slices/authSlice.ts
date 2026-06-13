import {
  action,
  deleteRows,
  defineTable,
  type ExtractSchema,
  insert,
  selectFrom,
  selector,
  v,
} from "@will-be-done/hyperdb-lib";
import { uuidv7 } from "uuidv7";

export const usersTable = defineTable("users", {
  id: v.string(),
  email: v.string(),
  password: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
})
  .index("byIds", ["id"])
  .index("byEmail", ["email"]);
export type User = ExtractSchema<typeof usersTable>;

export const tokensTable = defineTable("tokens", {
  id: v.string(),
  userId: v.string(),
  createdAt: v.string(),
})
  .index("byUserId", ["userId"]);
export type Token = ExtractSchema<typeof tokensTable>;

const getUserByEmail = selector(function* (email: string) {
  const users = yield* selectFrom(usersTable, "byEmail")
      .where((q) => q.eq("email", email))
      .limit(1);
  return users[0] as User | undefined;
});

const getUserById = selector(function* (id: string) {
  const users = yield* selectFrom(usersTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return users[0] as User | undefined;
});

const getTokenById = selector(function* (id: string) {
  const tokens = yield* selectFrom(tokensTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return tokens[0] as Token | undefined;
});

const register = action(function* (email: string, hashedPassword: string) {
  // Check if user exists
  const existing = yield* getUserByEmail(email);
  if (existing) {
    throw new Error("User already exists");
  }

  // Create user
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

  // Generate token
  const tokenId = uuidv7();
  const token: Token = {
    id: tokenId,
    userId,
    createdAt: now,
  };

  yield* insert(tokensTable, [token]);

  return { userId, token: tokenId };
});

const generateToken = action(function* (userId: string) {
  // Generate token
  const tokenId = uuidv7();
  const token: Token = {
    id: tokenId,
    userId,
    createdAt: new Date().toISOString(),
  };

  yield* insert(tokensTable, [token]);

  return { userId, token: tokenId };
});

const validateToken = action(function* (tokenId: string) {
  const token = yield* getTokenById(tokenId);
  if (!token) {
    return null as User | null;
  }

  const user = yield* getUserById(token.userId);
  return (user || null) as User | null;
});

const revokeToken = action(function* (tokenId: string) {
  yield* deleteRows(tokensTable, [tokenId]);
});

const revokeAllUserTokens = action(function* (userId: string) {
  const tokens = yield* selectFrom(tokensTable, "byUserId").where((q) =>
    q.eq("userId", userId),
  );
  const tokenIds = tokens.map((t) => t.id);
  if (tokenIds.length > 0) {
    yield* deleteRows(tokensTable, tokenIds);
  }
});

export const authSlice = {
  getUserByEmail,
  getUserById,
  getTokenById,
  register,
  generateToken,
  validateToken,
  revokeToken,
  revokeAllUserTokens,
};
