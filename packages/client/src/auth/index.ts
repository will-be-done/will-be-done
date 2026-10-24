import type { KeyValueStorage } from "../sync/platform";

const AUTH_TOKEN_KEY = "auth_token";
const USER_ID_KEY = "user_id";
const LAST_USED_SPACE_ID_KEY = "space_id";
const SPACE_NAMES_KEY = "space_names_map";

// Session state shared by all clients. `tokenStorage` lets a platform keep the
// token somewhere more private than the rest of the session.
export const createAuthStore = ({
  storage,
  tokenStorage = storage,
}: {
  storage: KeyValueStorage;
  tokenStorage?: KeyValueStorage;
}) => {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  const readSpaceNames = () =>
    JSON.parse(storage.getItem(SPACE_NAMES_KEY) ?? "{}") as Record<
      string,
      string
    >;

  const store = {
    getToken: (): string | null => tokenStorage.getItem(AUTH_TOKEN_KEY),
    setToken: (token: string): void => {
      tokenStorage.setItem(AUTH_TOKEN_KEY, token);
      notify();
    },
    removeToken: (): void => {
      tokenStorage.removeItem(AUTH_TOKEN_KEY);
      notify();
    },

    getUserId: (): string | null => storage.getItem(USER_ID_KEY),
    setUserId: (userId: string): void => {
      storage.setItem(USER_ID_KEY, userId);
      notify();
    },
    removeUserId: (): void => {
      storage.removeItem(USER_ID_KEY);
      notify();
    },

    getLastUsedSpaceId: (): string | null =>
      storage.getItem(LAST_USED_SPACE_ID_KEY),
    setLastUsedSpaceId: (spaceId: string): void => {
      storage.setItem(LAST_USED_SPACE_ID_KEY, spaceId);
      notify();
    },
    removeLastUsedSpaceId: (): void => {
      storage.removeItem(LAST_USED_SPACE_ID_KEY);
      notify();
    },

    // Clears the stored session. Platforms add their own cleanup around it.
    clearSession: (): void => {
      store.removeToken();
      store.removeUserId();
      store.removeLastUsedSpaceId();
    },

    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: (): string =>
      [
        store.getToken() ?? "",
        store.getUserId() ?? "",
        store.getLastUsedSpaceId() ?? "",
      ].join("\0"),

    setSpaceNames: (spaces: { spaceId: string; name: string }[]): void => {
      const map = readSpaceNames();
      for (const { spaceId, name } of spaces) {
        map[spaceId] = name;
      }
      storage.setItem(SPACE_NAMES_KEY, JSON.stringify(map));
    },
    getSpaceName: (spaceId: string): string | null =>
      readSpaceNames()[spaceId] ?? null,

    isAuthenticated: (): boolean => !!store.getToken() && !!store.getUserId(),
  };

  return store;
};

export type AuthStore = ReturnType<typeof createAuthStore>;
