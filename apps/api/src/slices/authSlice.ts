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
import type { GenReturn } from "@will-be-done/slices";

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

export const authSlice = {
  // Selectors
  getUserByEmail: selector(function* (
    email: string,
  ): GenReturn<User | undefined> {
    const users = yield* runQuery(
      selectFrom(usersTable, "byEmail")
        .where((q) => q.eq("email", email))
        .limit(1),
    );
    return users[0];
  }),

  getUserById: selector(function* (id: string): GenReturn<User | undefined> {
    const users = yield* runQuery(
      selectFrom(usersTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );
    return users[0];
  }),

  getTokenById: selector(function* (id: string): GenReturn<Token | undefined> {
    const tokens = yield* runQuery(
      selectFrom(tokensTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );
    return tokens[0];
  }),

  // Actions
  register: action(function* (
    email: string,
    hashedPassword: string,
  ): GenReturn<{ userId: string; token: string }> {
    // Check if user exists
    const existing = yield* authSlice.getUserByEmail(email);
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
  }),

  generateToken: action(function* (
    userId: string,
  ): GenReturn<{ userId: string; token: string }> {
    // Generate token
    const tokenId = uuidv7();
    const token: Token = {
      id: tokenId,
      userId,
      createdAt: new Date().toISOString(),
    };

    yield* insert(tokensTable, [token]);

    return { userId, token: tokenId };
  }),

  validateToken: action(function* (tokenId: string): GenReturn<User | null> {
    const token = yield* authSlice.getTokenById(tokenId);
    if (!token) {
      return null;
    }

    const user = yield* authSlice.getUserById(token.userId);
    return user || null;
  }),

  revokeToken: action(function* (tokenId: string): GenReturn<void> {
    yield* deleteRows(tokensTable, [tokenId]);
  }),

  revokeAllUserTokens: action(function* (userId: string): GenReturn<void> {
    const tokens = yield* runQuery(
      selectFrom(tokensTable, "byUserId").where((q) => q.eq("userId", userId)),
    );
    const tokenIds = tokens.map((t) => t.id);
    if (tokenIds.length > 0) {
      yield* deleteRows(tokensTable, tokenIds);
    }
  }),
};
