import {
  action,
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
} from "@will-be-done/hyperdb";
import { uuidv7 } from "uuidv7";

export type User = {
  id: string;
  email: string;
  password: string;
  createdAt: string;
  updatedAt: string;
};

export const usersTable = table<User>("users").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byEmail: { cols: ["email"], type: "btree" },
});

export type Token = {
  id: string;
  userId: string;
  createdAt: string;
};

export const tokensTable = table<Token>("tokens").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byUserId: { cols: ["userId"], type: "btree" },
});

const getUserByEmail = selector(function* (email: string) {
  const users = yield* runQuery(
    selectFrom(usersTable, "byEmail")
      .where((q) => q.eq("email", email))
      .limit(1),
  );
  return users[0] as User | undefined;
});

const getUserById = selector(function* (id: string) {
  const users = yield* runQuery(
    selectFrom(usersTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );
  return users[0] as User | undefined;
});

const getTokenById = selector(function* (id: string) {
  const tokens = yield* runQuery(
    selectFrom(tokensTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );
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
  const tokens = yield* runQuery(
    selectFrom(tokensTable, "byUserId").where((q) => q.eq("userId", userId)),
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
