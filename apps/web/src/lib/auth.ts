import { resetWsClient } from "./trpc";
import { queryClient } from "./query";
import { resetWebAnalytics } from "./analytics";

const AUTH_TOKEN_KEY = "auth_token";
const USER_ID_KEY = "user_id";
const LAST_USED_SPACE_ID_KEY = "space_id";
const SPACE_NAMES_KEY = "space_names_map";
const authListeners = new Set<() => void>();

function notifyAuthListeners() {
  for (const listener of authListeners) listener();
}

export const authUtils = {
  getToken: (): string | null => {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  },
  setToken: (token: string): void => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    notifyAuthListeners();
  },

  setUserId: (userId: string): void => {
    localStorage.setItem(USER_ID_KEY, userId);
    notifyAuthListeners();
  },
  getUserId: (): string | null => {
    return localStorage.getItem(USER_ID_KEY);
  },

  getLastUsedSpaceId: (): string | null => {
    return localStorage.getItem(LAST_USED_SPACE_ID_KEY);
  },
  setLastUsedSpaceId: (spaceId: string): void => {
    localStorage.setItem(LAST_USED_SPACE_ID_KEY, spaceId);
    notifyAuthListeners();
  },

  removeToken: (): void => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    notifyAuthListeners();
  },
  removeUserId: (): void => {
    localStorage.removeItem(USER_ID_KEY);
    notifyAuthListeners();
  },
  removeLastUsedSpaceId: (): void => {
    localStorage.removeItem(LAST_USED_SPACE_ID_KEY);
    notifyAuthListeners();
  },

  signOut: (): void => {
    resetWebAnalytics();
    authUtils.removeToken();
    authUtils.removeUserId();
    authUtils.removeLastUsedSpaceId();
    queryClient.clear();
    // Reset WebSocket to force reconnection with new auth state
    resetWsClient();
  },

  subscribe: (listener: () => void): (() => void) => {
    authListeners.add(listener);
    return () => authListeners.delete(listener);
  },
  getSnapshot: (): string => {
    return [
      authUtils.getToken() ?? "",
      authUtils.getUserId() ?? "",
      authUtils.getLastUsedSpaceId() ?? "",
    ].join("\0");
  },

  // It's a bit hacky, but it works for now
  setSpaceNames: (spaces: { spaceId: string; name: string }[]): void => {
    const map = JSON.parse(
      localStorage.getItem(SPACE_NAMES_KEY) ?? "{}",
    ) as Record<string, string>;
    for (const { spaceId, name } of spaces) {
      map[spaceId] = name;
    }
    localStorage.setItem(SPACE_NAMES_KEY, JSON.stringify(map));
  },
  getSpaceName: (spaceId: string): string | null => {
    const map = JSON.parse(
      localStorage.getItem(SPACE_NAMES_KEY) ?? "{}",
    ) as Record<string, string>;
    return map[spaceId] ?? null;
  },

  isAuthenticated: (): boolean => {
    return (
      !!localStorage.getItem(AUTH_TOKEN_KEY) &&
      !!localStorage.getItem(USER_ID_KEY)
    );
  },
};

export const isDemoMode = () =>
  typeof window !== "undefined" &&
  window.location.hostname === "demo.will-be-done.app";
