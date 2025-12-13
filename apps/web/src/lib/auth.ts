const AUTH_TOKEN_KEY = "auth_token";
const USER_ID_KEY = "user_id";
const LAST_USED_VAULT_ID_KEY = "vault_id";

export const authUtils = {
  getToken: (): string | null => {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  },
  setToken: (token: string): void => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  },

  setUserId: (userId: string): void => {
    localStorage.setItem(USER_ID_KEY, userId);
  },
  getUserId: (): string | null => {
    return localStorage.getItem(USER_ID_KEY);
  },

  getLastUsedVaultId: (): string | null => {
    return localStorage.getItem(LAST_USED_VAULT_ID_KEY);
  },
  setLastUsedVaultId: (vaultId: string): void => {
    localStorage.setItem(LAST_USED_VAULT_ID_KEY, vaultId);
  },

  removeToken: (): void => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  },
  removeUserId: (): void => {
    localStorage.removeItem(USER_ID_KEY);
  },
  removeLastUsedVaultId: (): void => {
    localStorage.removeItem(LAST_USED_VAULT_ID_KEY);
  },

  signOut: (): void => {
    authUtils.removeToken();
    authUtils.removeUserId();
    authUtils.removeLastUsedVaultId();
  },

  isAuthenticated: (): boolean => {
    return (
      !!localStorage.getItem(AUTH_TOKEN_KEY) &&
      !!localStorage.getItem(USER_ID_KEY)
    );
  },
};
